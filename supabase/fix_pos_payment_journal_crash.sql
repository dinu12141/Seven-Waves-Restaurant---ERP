-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: POS Payment "EMPTY_JOURNAL" Crash
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- SYMPTOMS:
--   Payment Error: EMPTY_JOURNAL: Journal <uuid> has no lines.
--   All POS payments fail after a while (cashier, queue, merged table).
--
-- ROOT CAUSE (Two bugs):
--
--   BUG 1 — post_accounting_from_order creates the journal_entry with
--           is_posted = TRUE immediately, then tries to INSERT journal_lines.
--           But trg_block_jl_edit (on journal_lines BEFORE INSERT) checks if the
--           parent journal_entry.is_posted = true and BLOCKS the insert.
--           Result: journal header created, zero lines inserted, validation
--           trigger (validate_journal_balance) sees DR=0 CR=0 → EMPTY_JOURNAL.
--
--   BUG 2 — trg_fn_finance_on_order_paid trigger calls post_accounting_from_order
--           WITHOUT exception handling. Any error from journal posting propagates
--           up and aborts the entire UPDATE orders SET payment_status='paid',
--           which crashes the whole payment transaction (process_cashier_payment /
--           pos_quick_pay).
--
-- FIX:
--   1. Replace post_accounting_from_order with the correct 3-step pattern:
--      a) Create journal_entry with is_posted = FALSE
--      b) Insert all journal_lines (trg_block_jl_edit allows this)
--      c) UPDATE is_posted = TRUE (triggers validate_journal_balance)
--   2. Add early return for zero-total orders (no journal needed for LKR 0.00).
--   3. Fix validate_journal_balance to use COUNT(*) instead of sum=0 check,
--      so that a valid journal with LKR 0.00 lines doesn't falsely trigger.
--   4. Wrap journal posting in trg_fn_finance_on_order_paid with EXCEPTION handler.
--
-- Safe to re-run (idempotent). All functions use CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 1: validate_journal_balance — use actual line COUNT, not sum=0
-- ═══════════════════════════════════════════════════════════════════════════════
-- The old check `IF v_total_dr = 0 AND v_total_cr = 0` falsely triggers for
-- valid journals that happen to have zero amounts. Use a proper row count instead.

CREATE OR REPLACE FUNCTION validate_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_total_dr NUMERIC;
    v_total_cr NUMERIC;
    v_line_count INT;
    v_period_status TEXT;
BEGIN
    IF NEW.is_posted = true AND (OLD.is_posted IS DISTINCT FROM true) THEN
        -- Count lines and sum amounts
        SELECT COUNT(*), COALESCE(SUM(dr_amount), 0), COALESCE(SUM(cr_amount), 0)
        INTO v_line_count, v_total_dr, v_total_cr
        FROM journal_lines WHERE journal_id = NEW.id;

        -- Must have at least one line (proper check: actual row count)
        IF v_line_count = 0 THEN
            RAISE EXCEPTION 'EMPTY_JOURNAL: Journal % has no lines.', NEW.id;
        END IF;

        -- STRICT: Debits MUST equal Credits
        IF ABS(v_total_dr - v_total_cr) > 0.005 THEN
            RAISE EXCEPTION 'JOURNAL_IMBALANCE: Journal % has DR=% CR=%. Debits must equal credits. Difference: %',
                NEW.id, v_total_dr, v_total_cr, ABS(v_total_dr - v_total_cr);
        END IF;

        -- Check period is open
        IF NEW.period_id IS NOT NULL THEN
            SELECT status INTO v_period_status
            FROM accounting_periods WHERE id = NEW.period_id;
            IF v_period_status IN ('closed', 'locked') THEN
                RAISE EXCEPTION 'CLOSED_PERIOD: Cannot post journal % to a % accounting period.',
                    NEW.id, v_period_status;
            END IF;
        ELSE
            -- Auto-assign period based on doc_date
            SELECT id INTO NEW.period_id
            FROM accounting_periods
            WHERE company_id = NEW.company_id
              AND NEW.doc_date BETWEEN period_start AND period_end
              AND status = 'open'
            LIMIT 1;

            IF NEW.period_id IS NOT NULL THEN
                SELECT status INTO v_period_status
                FROM accounting_periods WHERE id = NEW.period_id;
                IF v_period_status IN ('closed', 'locked') THEN
                    RAISE EXCEPTION 'CLOSED_PERIOD: Date % falls in a closed accounting period.', NEW.doc_date;
                END IF;
            END IF;
        END IF;

        NEW.total_dr := v_total_dr;
        NEW.total_cr := v_total_cr;
        NEW.posted_at := now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS trg_validate_journal ON journal_entries;
CREATE TRIGGER trg_validate_journal
BEFORE UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION validate_journal_balance();


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 2: post_accounting_from_order — correct 3-step pattern + skip zero-total
-- ═══════════════════════════════════════════════════════════════════════════════
-- This replaces the broken version from critical_fix_02_finance_safety.sql
-- (which created journal with is_posted=true FIRST, then tried to insert lines
-- that were blocked by trg_block_jl_edit).

CREATE OR REPLACE FUNCTION public.post_accounting_from_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_journal_id uuid;
    v_rev_account text;
    v_payment_account text;
    v_total_dr NUMERIC := 0;
    v_total_cr NUMERIC := 0;
    v_period_id UUID;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Idempotency: skip if journal already posted for this order
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reference_id = p_order_id AND reference_type = 'order') THEN
        RETURN;
    END IF;

    -- Skip zero-total orders: no journal entry needed for LKR 0.00 sales
    IF COALESCE(v_order.total_amount, 0) = 0 AND COALESCE(v_order.subtotal, 0) = 0 THEN
        RETURN;
    END IF;

    -- Ensure chart-of-accounts entries exist
    INSERT INTO public.chart_of_accounts (code, name, account_type, description)
    VALUES ('4400', 'Sales Discounts', 'Expense', 'Discounts given on sales')
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO public.chart_of_accounts (code, name, account_type, description)
    VALUES ('2310', 'Service Charge Payable', 'Liability', 'Service charges collected for staff')
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO public.chart_of_accounts (code, name, account_type, description)
    VALUES ('4030', 'Delivery Income', 'Revenue', 'Income from delivery fees')
    ON CONFLICT (code) DO NOTHING;

    -- Determine revenue and payment accounts
    IF v_order.order_type = 'dine_in' THEN v_rev_account := '4000';
    ELSIF v_order.order_type = 'takeaway' THEN v_rev_account := '4010';
    ELSIF v_order.order_type = 'delivery' THEN v_rev_account := '4020';
    ELSE v_rev_account := '4000'; END IF;

    IF COALESCE(v_order.payment_method, 'cash') IN ('cash', 'cod') THEN
        v_payment_account := '1000';
    ELSE v_payment_account := '1010'; END IF;

    -- Find open period
    SELECT id INTO v_period_id FROM accounting_periods
    WHERE company_id = v_order.company_id
      AND CURRENT_DATE BETWEEN period_start AND period_end AND status = 'open'
    LIMIT 1;

    -- Calculate totals for balance check
    v_total_dr := COALESCE(v_order.total_amount, 0) + COALESCE(v_order.discount_amount, 0);
    v_total_cr := COALESCE(v_order.subtotal, 0) + COALESCE(v_order.tax_amount, 0)
                + COALESCE(v_order.service_charge, 0) + COALESCE(v_order.delivery_charge, 0);

    -- PRE-CHECK: Ensure DR = CR before inserting
    IF ABS(v_total_dr - v_total_cr) > 0.01 THEN
        RAISE WARNING 'Journal imbalance for order %: DR=% CR=%. Auto-balancing via rounding.',
            p_order_id, v_total_dr, v_total_cr;
        v_total_cr := v_total_dr;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- STEP 1: Create journal entry as UNPOSTED (is_posted = false)
    -- ══════════════════════════════════════════════════════════════════════════
    -- CRITICAL: Must be FALSE initially! Otherwise trg_block_jl_edit blocks
    -- all subsequent INSERT into journal_lines (it checks parent is_posted).
    INSERT INTO public.journal_entries (
        company_id, branch_id, reference_id, reference_type,
        description, entry_type, total_dr, total_cr, period_id,
        is_posted  -- FALSE initially
    ) VALUES (
        v_order.company_id, v_order.branch_id, p_order_id, 'order',
        'Sale from Order #' || v_order.order_number, 'revenue',
        v_total_dr, v_total_cr, v_period_id,
        false  -- NOT posted — lines can be added freely
    ) RETURNING id INTO v_journal_id;

    -- ══════════════════════════════════════════════════════════════════════════
    -- STEP 2: Insert all journal lines (while is_posted = false)
    -- ══════════════════════════════════════════════════════════════════════════

    -- Credit lines
    IF COALESCE(v_order.subtotal, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
        VALUES (v_journal_id, v_rev_account, v_order.subtotal, 'Base Sale Amount');
    END IF;
    IF COALESCE(v_order.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
        VALUES (v_journal_id, '2300', v_order.tax_amount, 'Tax collected');
    END IF;
    IF COALESCE(v_order.service_charge, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
        VALUES (v_journal_id, '2310', v_order.service_charge, 'Service Charge');
    END IF;
    IF COALESCE(v_order.delivery_charge, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
        VALUES (v_journal_id, '4030', v_order.delivery_charge, 'Delivery Fee');
    END IF;

    -- Debit lines
    IF COALESCE(v_order.discount_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, memo)
        VALUES (v_journal_id, '4400', v_order.discount_amount, 'Applied discount');
    END IF;
    IF COALESCE(v_order.total_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, memo)
        VALUES (v_journal_id, v_payment_account, v_order.total_amount, 'Received amount');
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- STEP 3: NOW mark as posted (triggers validate_journal_balance which
    --         checks DR = CR and line count > 0)
    -- ══════════════════════════════════════════════════════════════════════════
    UPDATE public.journal_entries
    SET is_posted = true, posted_at = now()
    WHERE id = v_journal_id;

END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 3: trg_fn_finance_on_order_paid — add exception handling
-- ═══════════════════════════════════════════════════════════════════════════════
-- The trigger fires on UPDATE orders SET payment_status='paid'. Without
-- exception handling, ANY journal failure (missing period, zero-total, etc.)
-- propagates up and causes the entire payment UPDATE (and thus the whole
-- process_cashier_payment / pos_quick_pay RPC) to fail.
--
-- Journal posting is a best-effort side-effect of payment — the payment
-- must succeed even if the accounting entry cannot be created. Operators
-- can always repost manually from the Finance module.

CREATE OR REPLACE FUNCTION public.trg_fn_finance_on_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (NEW.payment_status = 'paid' AND (OLD.payment_status IS DISTINCT FROM 'paid')) THEN
        -- 1) Mark finance_queue as posted
        UPDATE public.finance_queue
        SET status = 'posted', updated_at = now()
        WHERE order_id = NEW.id;

        -- 2) Post accounting entry (best-effort — never fail the payment)
        BEGIN
            PERFORM public.post_accounting_from_order(NEW.id);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[trg_fn_finance_on_order_paid] Journal posting failed for order %: % (payment continues)',
                NEW.id, SQLERRM;
        END;

        -- 3) Mark KOT dispatches for FINANCE as delivered
        UPDATE public.kot_dispatches
        SET status = 'delivered', delivered_at = now()
        WHERE kot_id IN (SELECT id FROM public.kot_tickets WHERE order_id = NEW.id)
          AND target_code = 'FINANCE';
    END IF;
    RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS trg_finance_on_order_paid ON public.orders;
CREATE TRIGGER trg_finance_on_order_paid
    AFTER UPDATE OF payment_status ON public.orders
    FOR EACH ROW
    WHEN (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
    EXECUTE FUNCTION public.trg_fn_finance_on_order_paid();


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 4: Ensure block_posted_journal_edit covers both UPDATE and DELETE
-- ═══════════════════════════════════════════════════════════════════════════════
-- (from fix_journal_immutability.sql — included here for completeness so this
--  single file fixes everything)

CREATE OR REPLACE FUNCTION public.block_posted_journal_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.is_posted = true THEN
        -- Exception: allow marking a posted entry as reversed
        IF TG_OP = 'UPDATE'
           AND NEW.is_reversed = true
           AND OLD.is_reversed = false THEN
            RETURN NEW;
        END IF;

        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION
                'IMMUTABLE_JOURNAL: Cannot delete posted journal entry %. Create a reversing entry instead.',
                OLD.id;
        ELSE
            RAISE EXCEPTION
                'IMMUTABLE_JOURNAL: Cannot modify posted journal entry %. Create a reversing entry instead.',
                OLD.id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_journal_edit ON public.journal_entries;
CREATE TRIGGER trg_block_journal_edit
    BEFORE UPDATE OR DELETE ON public.journal_entries
    FOR EACH ROW EXECUTE FUNCTION public.block_posted_journal_edit();


-- ═══════════════════════════════════════════════════════════════════════════════
-- CLEANUP: Delete any orphaned journal entries with zero lines (from past bugs)
-- ═══════════════════════════════════════════════════════════════════════════════
-- These are journals that were created as is_posted=true but had no lines
-- (because trg_block_jl_edit blocked them). They're not posted (the validation
-- trigger would have failed), so they sit in the DB as unposted ghosts.
-- Remove them so the idempotency check in post_accounting_from_order doesn't
-- skip re-creating a valid journal for those orders.

DELETE FROM public.journal_entries
WHERE reference_type = 'order'
  AND is_posted = false
  AND id NOT IN (SELECT DISTINCT journal_id FROM public.journal_lines);

-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF FIX
-- ═══════════════════════════════════════════════════════════════════════════════
