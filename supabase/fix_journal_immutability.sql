-- ═══════════════════════════════════════════════════════════════════
-- FIX: IMMUTABLE_JOURNAL_LINE — post_accounting_from_order
-- ═══════════════════════════════════════════════════════════════════
--
-- BUG: critical_fix_02_finance_safety.sql added:
--   1. A trigger trg_block_jl_edit on journal_lines that blocks
--      INSERT/UPDATE/DELETE when the parent journal_entries.is_posted = true
--   2. A new version of post_accounting_from_order that creates the
--      journal entry with is_posted = true IMMEDIATELY
--
-- These two changes conflict: the function creates a posted journal,
-- then tries to INSERT journal_lines — which the trigger blocks.
--
-- FIX: Create journal entry with is_posted = false FIRST,
-- insert all journal_lines, THEN update to is_posted = true
-- (which also triggers the balance validation).
-- ═══════════════════════════════════════════════════════════════════
--
-- ADDITIONAL FIX (appended below post_accounting_from_order):
--
-- VULNERABILITY: critical_fix_02_finance_safety.sql defines
-- trg_block_journal_edit as BEFORE UPDATE only. This means a posted
-- journal_entry can be hard-deleted with a DELETE statement, bypassing
-- immutability entirely.
--
-- The block_posted_journal_edit() function already handles BEFORE
-- UPDATE but is never called for DELETE. For DELETE triggers, NEW is
-- NULL so the function must check OLD.is_posted instead.
--
-- FIX: Replace the single UPDATE trigger with an UPDATE OR DELETE
-- trigger backed by a function that handles both TG_OP values.
-- ═══════════════════════════════════════════════════════════════════

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

    -- ══════════════════════════════════════════════════════════════
    -- STEP 1: Create journal entry as UNPOSTED (is_posted = false)
    -- This allows journal_lines to be inserted without triggering
    -- the trg_block_jl_edit immutability trigger.
    -- ══════════════════════════════════════════════════════════════
    INSERT INTO public.journal_entries (
        company_id, branch_id, reference_id, reference_type,
        description, entry_type, total_dr, total_cr, period_id,
        is_posted  -- FALSE initially!
    ) VALUES (
        v_order.company_id, v_order.branch_id, p_order_id, 'order',
        'Sale from Order #' || v_order.order_number, 'revenue',
        v_total_dr, v_total_cr, v_period_id,
        false  -- NOT posted yet — lines can be added freely
    ) RETURNING id INTO v_journal_id;

    -- ══════════════════════════════════════════════════════════════
    -- STEP 2: Insert all journal lines (while is_posted = false)
    -- ══════════════════════════════════════════════════════════════

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
    INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, memo)
    VALUES (v_journal_id, v_payment_account, v_order.total_amount, 'Received amount');

    -- ══════════════════════════════════════════════════════════════
    -- STEP 3: NOW mark as posted (triggers balance validation via
    --         trg_validate_journal which checks DR = CR)
    -- ══════════════════════════════════════════════════════════════
    UPDATE public.journal_entries
    SET is_posted = true, posted_at = now()
    WHERE id = v_journal_id;

END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- PART 2: Fix missing DELETE protection on posted journal_entries
-- ═══════════════════════════════════════════════════════════════════
--
-- critical_fix_02_finance_safety.sql's trg_block_journal_edit only
-- fires on BEFORE UPDATE — a hard DELETE of a posted journal entry
-- was never blocked. This section replaces that trigger with one that
-- covers both UPDATE and DELETE.
-- ═══════════════════════════════════════════════════════════════════

-- Updated trigger function: handles both UPDATE and DELETE
CREATE OR REPLACE FUNCTION public.block_posted_journal_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- On UPDATE: OLD holds the pre-update row
    -- On DELETE: OLD holds the row being deleted; NEW is NULL
    IF OLD.is_posted = true THEN
        -- Exception: allow marking a posted entry as reversed
        -- (needed by the reversal workflow: is_reversed = true)
        IF TG_OP = 'UPDATE'
           AND NEW.is_reversed = true
           AND OLD.is_reversed = false THEN
            RETURN NEW;  -- Permit reversal marking only
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

    -- Not posted — allow the operation
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- Replace the UPDATE-only trigger with UPDATE OR DELETE
DROP TRIGGER IF EXISTS trg_block_journal_edit ON public.journal_entries;
CREATE TRIGGER trg_block_journal_edit
    BEFORE UPDATE OR DELETE ON public.journal_entries
    FOR EACH ROW EXECUTE FUNCTION public.block_posted_journal_edit();
