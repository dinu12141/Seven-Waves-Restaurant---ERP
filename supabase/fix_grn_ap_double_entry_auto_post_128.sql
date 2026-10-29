-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #128 — GRN → Accounts Payable auto-posting with balanced double entry
-- Seven Waves Restaurant ERP
--
-- Apply AFTER #126 / #127, BEFORE #129. Re-runnable (single transaction).
--
--  0. finance_cashbook_entries.source_type CHECK widened to the FULL set:
--     #126 values + 'supplier_payment' + 'payroll' + 'salary_advance'
--     (#129 re-declares the identical set).
--  1. Shared helpers:
--       fn_fin_ledger_by_code()      ledger lookup, RAISES if missing
--       fn_fin_post_leg()            one cashbook row + ledger/account delta
--       fn_fin_reverse_source()      mirror-reverses every posted leg of a doc
--       fn_ap_refresh_invoice_paid() idempotent paid_amount/status recompute
--     Sign convention (#122): ledger/account current_balance += debit - credit.
--  2. trg_fn_post_ap_invoice():
--       POST   : Dr 1005 Inventory - Raw Materials / Cr 2000 Accounts Payable
--       CANCEL : mirror reversal of both legs + ap_ledger + supplier balance,
--                blocked when the invoice has any payment applied.
--       Respects invoice_approval_required (draft → posted blocked when on).
--       paid/partial_paid → posted allowed (payment reversal).
--       No GREATEST(0, …) clamps on money balances.
--  3. post_ap_invoice_rpc(): role-checked, approval-aware.
--  4. trg_fn_auto_bill_from_grn(): fires on ANY transition INTO 'posted',
--     idempotent per grn_id, leaves the bill in draft when AP approval is on.
--  5. GRN cancellation cancels/reverses the auto-generated AP invoice
--     (trigger + cancel_grn RPC), raising if the invoice has payments.
--  6. post_supplier_payment(): Dr 2000 AP / Cr Cash-Bank on post; full mirror
--     reversal (AP ledger, cash/bank ledger + account, cashbook, supplier
--     balance, invoice paid_amount/status) on cancel.
--  7. Backfill: post draft GRN invoices only when the GRN is posted, AP
--     approval is not required, and the GRN has no other live invoice.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '10s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Cashbook source_type CHECK — full union (#126 + supplier_payment + #129)
-- ─────────────────────────────────────────────────────────────────────────────
-- Union of the LIVE allowed values + the values this migration needs
-- (never narrows the list: rows with e.g. 'bank_charge' / 'cheque' must keep
-- validating, otherwise the ADD CONSTRAINT aborts the whole apply). (#128, Finance review)
DO $$
DECLARE
    v_def  TEXT;
    v_vals TEXT[] := ARRAY['pos_dine_in','pos_takeaway','delivery','pay_voucher','received_voucher','invoice','petty_cash','bank_transfer','manual_adjustment','cheque_bounced','supplier_payment','bank_charge','cheque','payroll','salary_advance'];
BEGIN
    SELECT pg_get_constraintdef(c.oid) INTO v_def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.finance_cashbook_entries'::regclass
       AND c.conname  = 'finance_cashbook_entries_source_type_check';
    IF v_def IS NOT NULL THEN
        v_vals := v_vals || ARRAY(SELECT m[1] FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m);
    END IF;
    -- plus anything already stored (defensive: a NOT VALID / dropped check)
    v_vals := v_vals || ARRAY(SELECT DISTINCT source_type FROM public.finance_cashbook_entries WHERE source_type IS NOT NULL);
    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_vals FROM unnest(v_vals) x;

    EXECUTE 'ALTER TABLE public.finance_cashbook_entries DROP CONSTRAINT IF EXISTS finance_cashbook_entries_source_type_check';
    EXECUTE format('ALTER TABLE public.finance_cashbook_entries ADD CONSTRAINT finance_cashbook_entries_source_type_check CHECK (source_type IN (%s))',
                   (SELECT string_agg(quote_literal(x), ',') FROM unnest(v_vals) x));
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop obsolete / duplicate functions & triggers
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.post_ap_invoice() CASCADE;
DROP TRIGGER IF EXISTS trg_post_ap_invoice   ON public.ap_invoices;
DROP TRIGGER IF EXISTS trg_ap_invoice_post   ON public.ap_invoices;
DROP TRIGGER IF EXISTS trg_post_invoice      ON public.ap_invoices;
DROP TRIGGER IF EXISTS trg_apinv_posting     ON public.ap_invoices;

DROP TRIGGER IF EXISTS trg_auto_bill_from_inventory     ON public.inventory_documents;
DROP TRIGGER IF EXISTS trg_auto_bill_from_inv_doc       ON public.inventory_documents;
DROP TRIGGER IF EXISTS trg_auto_bill_from_inventory_doc ON public.inventory_documents;

-- Never leave a second overload of a client-callable RPC behind (PGRST203).
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND (
                (p.proname = 'post_ap_invoice_rpc'        AND oidvectortypes(p.proargtypes) <> 'uuid')
             OR (p.proname = 'cancel_grn'                 AND oidvectortypes(p.proargtypes) <> 'uuid, text')
             OR (p.proname = 'fn_fin_ledger_by_code'      AND oidvectortypes(p.proargtypes) <> 'uuid, text, text')
             OR (p.proname = 'fn_fin_post_leg'            AND oidvectortypes(p.proargtypes) <> 'uuid, uuid, text, uuid, date, uuid, uuid, text, numeric, numeric')
             OR (p.proname = 'fn_fin_reverse_source'      AND oidvectortypes(p.proargtypes) <> 'text, uuid, date, text')
             OR (p.proname = 'fn_ap_refresh_invoice_paid' AND oidvectortypes(p.proargtypes) <> 'uuid, uuid, boolean')
           )
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text || ' CASCADE';
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Helpers (internal — not callable by clients)
-- ─────────────────────────────────────────────────────────────────────────────

-- Ledger lookup by chart code. Prefers the company's own ledger, falls back to
-- a company-less ledger. RAISES when nothing is found so postings never go
-- out unbalanced.
CREATE OR REPLACE FUNCTION public.fn_fin_ledger_by_code(
    p_company_id UUID,
    p_code       TEXT,
    p_label      TEXT
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT l.id INTO v_id
      FROM public.finance_ledgers l
     WHERE l.ledger_code = p_code
       AND l.deleted_at IS NULL
       AND COALESCE(l.is_active, true)
       AND (l.company_id = p_company_id OR l.company_id IS NULL)
     ORDER BY (l.company_id IS NOT DISTINCT FROM p_company_id) DESC, l.created_at
     LIMIT 1;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'LEDGER_MISSING: finance ledger % (%) not found for company %. Create it in Ledger Registration before posting.',
            p_code, p_label, p_company_id;
    END IF;
    RETURN v_id;
END;
$$;

-- One leg of a double entry: cashbook row + ledger delta (+ account delta).
-- Convention (#122): current_balance += debit - credit.
CREATE OR REPLACE FUNCTION public.fn_fin_post_leg(
    p_company_id  UUID,
    p_branch_id   UUID,
    p_source_type TEXT,
    p_source_id   UUID,
    p_entry_date  DATE,
    p_ledger_id   UUID,
    p_account_id  UUID,
    p_description TEXT,
    p_debit       NUMERIC,
    p_credit      NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id    UUID;
    v_delta NUMERIC := COALESCE(p_debit, 0) - COALESCE(p_credit, 0);
BEGIN
    IF p_ledger_id IS NULL THEN
        RAISE EXCEPTION 'LEDGER_MISSING: cannot post % % — ledger is NULL', p_source_type, p_source_id;
    END IF;
    IF COALESCE(p_debit, 0) = 0 AND COALESCE(p_credit, 0) = 0 THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.finance_cashbook_entries (
        company_id, branch_id, source_type, source_id, entry_date,
        ledger_id, account_id, description,
        debit_amount, credit_amount, running_balance
    ) VALUES (
        p_company_id, p_branch_id, p_source_type, p_source_id, COALESCE(p_entry_date, CURRENT_DATE),
        p_ledger_id, p_account_id, p_description,
        COALESCE(p_debit, 0), COALESCE(p_credit, 0), 0   -- running_balance set by trg_cashbook_running_balance (#122)
    ) RETURNING id INTO v_id;

    UPDATE public.finance_ledgers
       SET current_balance = COALESCE(current_balance, 0) + v_delta,
           updated_at = now()
     WHERE id = p_ledger_id;

    IF p_account_id IS NOT NULL THEN
        UPDATE public.finance_accounts
           SET current_balance = COALESCE(current_balance, 0) + v_delta,
               updated_at = now()
         WHERE id = p_account_id;
    END IF;

    RETURN v_id;
END;
$$;

-- Mirror-reverses every cashbook leg already posted for (source_type, source_id)
-- (debit/credit swapped, same ledger/account). Original rows are never touched
-- (append-only audit trail). Returns number of legs reversed.
CREATE OR REPLACE FUNCTION public.fn_fin_reverse_source(
    p_source_type TEXT,
    p_source_id   UUID,
    p_entry_date  DATE,
    p_prefix      TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r       RECORD;
    v_count INT := 0;
BEGIN
    -- Materialise the original legs first so the reversal rows we insert are
    -- never re-read by this loop.
    FOR r IN
        SELECT c.company_id, c.branch_id, c.ledger_id, c.account_id,
               c.description, c.debit_amount, c.credit_amount
          FROM public.finance_cashbook_entries c
         WHERE c.source_type = p_source_type
           AND c.source_id   = p_source_id
           AND c.description NOT LIKE 'REVERSAL%'
         ORDER BY c.created_at, c.id
    LOOP
        PERFORM public.fn_fin_post_leg(
            r.company_id, r.branch_id, p_source_type, p_source_id, p_entry_date,
            r.ledger_id, r.account_id,
            'REVERSAL ' || COALESCE(p_prefix, '') || ' — ' || r.description,
            r.credit_amount, r.debit_amount
        );
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;

-- Idempotent recompute of ap_invoices.paid_amount/status from allocations of
-- POSTED payments. p_payment_id is the payment currently changing status
-- (its row is not yet 'posted'/'cancelled' inside a BEFORE trigger):
--   p_include_payment = true  → count it (payment being posted)
--   p_include_payment = false → exclude it (payment being cancelled)
CREATE OR REPLACE FUNCTION public.fn_ap_refresh_invoice_paid(
    p_invoice_id      UUID,
    p_payment_id      UUID,
    p_include_payment BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_paid  NUMERIC;
    v_total NUMERIC;
    v_stat  TEXT;
BEGIN
    SELECT total_amount, status INTO v_total, v_stat
      FROM public.ap_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(a.amount), 0) INTO v_paid
      FROM public.supplier_payment_allocations a
      JOIN public.supplier_payments p ON p.id = a.payment_id
     WHERE a.invoice_id = p_invoice_id
       AND (
            (p.status = 'posted' AND p.id <> p_payment_id)
         OR (p_include_payment AND p.id = p_payment_id)
       );

    UPDATE public.ap_invoices
       SET paid_amount = v_paid,
           status = CASE
               WHEN v_stat NOT IN ('posted', 'partial_paid', 'paid') THEN v_stat
               WHEN v_paid >= COALESCE(v_total, 0) - 0.005 AND COALESCE(v_total, 0) > 0 THEN 'paid'
               WHEN v_paid > 0 THEN 'partial_paid'
               ELSE 'posted'
           END
     WHERE id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_fin_ledger_by_code(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fin_post_leg(UUID, UUID, TEXT, UUID, DATE, UUID, UUID, TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fin_reverse_source(TEXT, UUID, DATE, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ap_refresh_invoice_paid(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AP invoice posting / cancellation trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_post_ap_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- Chart of accounts codes (Chart OF Accounts UPDATED.xlsx)
    c_ap_code   CONSTANT TEXT := '2000';   -- Accounts Payables
    c_inv_code  CONSTANT TEXT := '1005';   -- Inventory - Raw Materials
    v_net_days    INT;
    v_ap_ledger   UUID;
    v_inv_ledger  UUID;
    v_desc        TEXT;
    v_has_payment BOOLEAN;
BEGIN
    -- ── draft → approved ─────────────────────────────────────────────────────
    IF NEW.status = 'approved' AND OLD.status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- ── draft / approved → posted ────────────────────────────────────────────
    IF NEW.status = 'posted' AND OLD.status IN ('draft', 'approved') THEN

        -- Respect AP approval workflow (procurement_settings.sql)
        IF OLD.status = 'draft'
           AND public.procurement_setting_bool(NEW.company_id, 'invoice_approval_required') THEN
            RAISE EXCEPTION 'APPROVAL_REQUIRED: AP Invoice "%" must be approved before posting.', NEW.doc_number;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.ap_invoice_lines WHERE invoice_id = NEW.id) THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: AP Invoice % has no lines. Cannot post.', NEW.doc_number;
        END IF;

        IF COALESCE(NEW.total_amount, 0) <= 0 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: AP Invoice % has zero total. Cannot post.', NEW.doc_number;
        END IF;

        IF NEW.grn_id IS NOT NULL THEN
            PERFORM public.validate_invoice_qty_vs_grn(NEW.id);
        END IF;

        NEW.posted_at := now();
        NEW.posted_by := COALESCE(NEW.posted_by, auth.uid(), NEW.created_by);

        IF NEW.due_date IS NULL THEN
            SELECT pt.net_days INTO v_net_days
              FROM public.payment_terms pt
             WHERE pt.id = COALESCE(NEW.payment_term_id,
                       (SELECT payment_term_id FROM public.suppliers WHERE id = NEW.supplier_id));
            NEW.due_date := NEW.doc_date + COALESCE(v_net_days, 30);
        END IF;

        -- Idempotent: only post once per invoice
        IF NOT EXISTS (
            SELECT 1 FROM public.ap_ledger WHERE doc_id = NEW.id AND entry_type = 'INVOICE'
        ) THEN
            -- Resolve BOTH ledgers before writing anything (raises if missing)
            v_ap_ledger  := public.fn_fin_ledger_by_code(NEW.company_id, c_ap_code,  'Accounts Payables');
            v_inv_ledger := public.fn_fin_ledger_by_code(NEW.company_id, c_inv_code, 'Inventory - Raw Materials');

            v_desc := 'Supplier Bill ' || NEW.doc_number ||
                      CASE WHEN NEW.supplier_inv_no IS NOT NULL THEN ' | Ref: ' || NEW.supplier_inv_no ELSE '' END;

            -- Sub-ledger: AP credit (liability created)
            INSERT INTO public.ap_ledger (
                company_id, branch_id, supplier_id, entry_type,
                doc_id, doc_number, doc_date, due_date,
                debit, credit, currency, exchange_rate,
                description, posted_by
            ) VALUES (
                NEW.company_id, NEW.branch_id, NEW.supplier_id, 'INVOICE',
                NEW.id, NEW.doc_number, NEW.doc_date, NEW.due_date,
                0, NEW.total_amount, COALESCE(NEW.currency, 'LKR'), COALESCE(NEW.exchange_rate, 1),
                'AP Invoice ' || NEW.doc_number ||
                    CASE WHEN NEW.supplier_inv_no IS NOT NULL THEN ' | Ref: ' || NEW.supplier_inv_no ELSE '' END,
                NEW.posted_by
            );

            UPDATE public.suppliers
               SET balance = COALESCE(balance, 0) + NEW.total_amount
             WHERE id = NEW.supplier_id;

            -- General ledger: Dr Inventory / Cr Accounts Payable
            PERFORM public.fn_fin_post_leg(
                NEW.company_id, NEW.branch_id, 'invoice', NEW.id, NEW.doc_date,
                v_inv_ledger, NULL, v_desc, NEW.total_amount, 0);
            PERFORM public.fn_fin_post_leg(
                NEW.company_id, NEW.branch_id, 'invoice', NEW.id, NEW.doc_date,
                v_ap_ledger, NULL, v_desc, 0, NEW.total_amount);

            -- Mark GRN / PO lines invoiced
            IF NEW.grn_id IS NOT NULL THEN
                UPDATE public.goods_receipt_lines grl
                   SET invoiced_qty = COALESCE(grl.invoiced_qty, 0) + ail.quantity
                  FROM public.ap_invoice_lines ail
                 WHERE ail.invoice_id = NEW.id
                   AND ail.grn_line_id = grl.id;
            END IF;

            UPDATE public.purchase_order_lines pol
               SET invoiced_qty = COALESCE(pol.invoiced_qty, 0) + ail.quantity
              FROM public.ap_invoice_lines ail
             WHERE ail.invoice_id = NEW.id
               AND ail.po_line_id = pol.id;
        END IF;

        RETURN NEW;
    END IF;

    -- ── posted / partial_paid / paid → cancelled ────────────────────────────
    IF NEW.status = 'cancelled' AND OLD.status IN ('posted', 'partial_paid', 'paid') THEN

        SELECT COALESCE(OLD.paid_amount, 0) > 0 OR EXISTS (
                   SELECT 1
                     FROM public.supplier_payment_allocations a
                     JOIN public.supplier_payments p ON p.id = a.payment_id
                    WHERE a.invoice_id = OLD.id AND p.status = 'posted')
          INTO v_has_payment;

        IF v_has_payment THEN
            RAISE EXCEPTION 'CANCEL_BLOCKED: AP Invoice "%" has payments applied (paid %). Cancel the supplier payment(s) first.',
                OLD.doc_number, COALESCE(OLD.paid_amount, 0);
        END IF;

        NEW.cancelled_at := now();

        IF EXISTS (SELECT 1 FROM public.ap_ledger WHERE doc_id = OLD.id AND entry_type = 'INVOICE')
           AND NOT EXISTS (SELECT 1 FROM public.ap_ledger WHERE doc_id = OLD.id AND entry_type = 'REVERSAL') THEN

            INSERT INTO public.ap_ledger (
                company_id, branch_id, supplier_id, entry_type,
                doc_id, doc_number, doc_date,
                debit, credit, currency, exchange_rate,
                description, posted_by
            ) VALUES (
                OLD.company_id, OLD.branch_id, OLD.supplier_id, 'REVERSAL',
                OLD.id, OLD.doc_number || '-REV', CURRENT_DATE,
                OLD.total_amount, 0, COALESCE(OLD.currency, 'LKR'), COALESCE(OLD.exchange_rate, 1),
                'Cancellation of AP Invoice ' || OLD.doc_number ||
                    COALESCE(' — ' || NEW.cancel_reason, ''),
                COALESCE(auth.uid(), OLD.posted_by)
            );

            -- No clamp: an over-reversal must stay visible
            UPDATE public.suppliers
               SET balance = COALESCE(balance, 0) - OLD.total_amount
             WHERE id = OLD.supplier_id;

            -- Mirror-reverse the GL legs (Cr Inventory / Dr AP) + cashbook rows
            PERFORM public.fn_fin_reverse_source('invoice', OLD.id, CURRENT_DATE, OLD.doc_number);

            -- Reverse invoiced quantities (quantities, not money — clamp is fine)
            IF OLD.grn_id IS NOT NULL THEN
                UPDATE public.goods_receipt_lines grl
                   SET invoiced_qty = GREATEST(0, COALESCE(grl.invoiced_qty, 0) - ail.quantity)
                  FROM public.ap_invoice_lines ail
                 WHERE ail.invoice_id = OLD.id
                   AND ail.grn_line_id = grl.id;
            END IF;

            UPDATE public.purchase_order_lines pol
               SET invoiced_qty = GREATEST(0, COALESCE(pol.invoiced_qty, 0) - ail.quantity)
              FROM public.ap_invoice_lines ail
             WHERE ail.invoice_id = OLD.id
               AND ail.po_line_id = pol.id;
        END IF;

        RETURN NEW;
    END IF;

    -- ── draft / approved → cancelled (nothing was posted) ───────────────────
    IF NEW.status = 'cancelled' AND OLD.status IN ('draft', 'approved') THEN
        NEW.cancelled_at := now();
        RETURN NEW;
    END IF;

    -- ── payment application / reversal (driven by post_supplier_payment) ────
    IF NEW.status IN ('posted', 'partial_paid', 'paid')
       AND OLD.status IN ('posted', 'partial_paid', 'paid') THEN
        RETURN NEW;
    END IF;

    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'INVALID_TRANSITION: AP Invoice % cannot go from "%" to "%".',
        NEW.doc_number, OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_ap_invoice ON public.ap_invoices;
CREATE TRIGGER trg_post_ap_invoice
BEFORE UPDATE OF status ON public.ap_invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_post_ap_invoice();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. post_ap_invoice_rpc — role-checked, approval-aware
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_ap_invoice_rpc(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
    v_company_id UUID;
    v_branch_id  UUID;
    v_approval   BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    IF NOT (public.is_admin() OR public.is_manager()
            OR public.auth_has_role('finance') OR public.auth_has_role('procurement')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorised to post AP invoices');
    END IF;

    SELECT doc_number, status, company_id, branch_id
      INTO v_doc_number, v_status, v_company_id, v_branch_id
      FROM public.ap_invoices WHERE id = p_invoice_id;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found: ' || p_invoice_id);
    END IF;

    -- Branch scope: non-admins may only post invoices of their own branches
    IF NOT public.is_admin() AND NOT (v_branch_id = ANY (COALESCE(public.auth_branch_ids(), ARRAY[]::uuid[]))) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorised for this branch');
    END IF;

    IF v_status IN ('posted', 'partial_paid', 'paid') THEN
        RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'already_posted', true);
    END IF;

    v_approval := public.procurement_setting_bool(v_company_id, 'invoice_approval_required');

    IF v_approval AND v_status <> 'approved' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Invoice "' || v_doc_number || '" must be approved before posting. Current status: ' || v_status);
    ELSIF v_status NOT IN ('draft', 'approved') THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Invoice "' || v_doc_number || '" cannot be posted from ' || v_status);
    END IF;

    UPDATE public.ap_invoices SET status = 'posted' WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'posted');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.post_ap_invoice_rpc(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_ap_invoice_rpc(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. GRN → AP invoice auto-bill (any transition INTO 'posted', idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_auto_bill_from_grn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc_number  TEXT;
    v_invoice_id  UUID;
    v_line        RECORD;
    v_line_num    INT := 0;
    v_subtotal    NUMERIC := 0;
    v_invoiceable NUMERIC;
BEGIN
    IF NEW.status IS DISTINCT FROM 'posted' OR OLD.status IS NOT DISTINCT FROM 'posted' THEN
        RETURN NEW;
    END IF;

    -- Serialise concurrent postings of the same GRN, then de-duplicate
    PERFORM pg_advisory_xact_lock(hashtextextended('grn_ap_bill:' || NEW.id::text, 0));

    IF EXISTS (
        SELECT 1 FROM public.ap_invoices
         WHERE grn_id = NEW.id AND status <> 'cancelled'
    ) THEN
        RETURN NEW;
    END IF;

    v_doc_number := public.generate_proc_doc_number(NEW.company_id, NEW.branch_id, 'AP_INV');
    IF v_doc_number IS NULL THEN
        v_doc_number := 'APINV-' || extract(epoch from clock_timestamp())::bigint;
    END IF;

    INSERT INTO public.ap_invoices (
        company_id, branch_id, doc_number, doc_date,
        supplier_id, grn_id, po_id, supplier_inv_no, payment_term_id,
        currency, exchange_rate, status,
        subtotal, discount_amount, tax_amount, total_amount, paid_amount,
        remarks, created_by
    ) VALUES (
        NEW.company_id, NEW.branch_id, v_doc_number, NEW.doc_date,
        NEW.supplier_id, NEW.id, NEW.po_id, NEW.doc_number,
        (SELECT payment_term_id FROM public.suppliers WHERE id = NEW.supplier_id),
        'LKR', 1, 'draft',
        0, 0, 0, 0, 0,
        'Auto-generated from GRN ' || NEW.doc_number,
        COALESCE(NEW.posted_by, NEW.created_by)
    ) RETURNING id INTO v_invoice_id;

    FOR v_line IN
        SELECT grl.id AS grn_line_id, grl.po_line_id, grl.item_id, grl.description, grl.uom_id,
               grl.quantity, COALESCE(grl.invoiced_qty, 0) AS already_invoiced, grl.unit_cost
          FROM public.goods_receipt_lines grl
         WHERE grl.grn_id = NEW.id
         ORDER BY grl.line_number
    LOOP
        v_invoiceable := v_line.quantity - v_line.already_invoiced;
        IF v_invoiceable <= 0.0001 THEN
            CONTINUE;
        END IF;

        v_line_num := v_line_num + 1;

        INSERT INTO public.ap_invoice_lines (
            invoice_id, line_number, grn_line_id, po_line_id,
            item_id, description, uom_id, quantity, unit_price, discount_pct, tax_pct
        ) VALUES (
            v_invoice_id, v_line_num, v_line.grn_line_id, v_line.po_line_id,
            v_line.item_id, v_line.description, v_line.uom_id,
            v_invoiceable, COALESCE(v_line.unit_cost, 0), 0, 0
        );

        v_subtotal := v_subtotal + (v_invoiceable * COALESCE(v_line.unit_cost, 0));
    END LOOP;

    IF v_line_num = 0 OR v_subtotal <= 0 THEN
        DELETE FROM public.ap_invoices WHERE id = v_invoice_id;
        RETURN NEW;
    END IF;

    UPDATE public.ap_invoices
       SET subtotal = v_subtotal, total_amount = v_subtotal
     WHERE id = v_invoice_id;

    -- Auto-post unless the company requires AP approval (then it waits in draft)
    IF NOT public.procurement_setting_bool(NEW.company_id, 'invoice_approval_required') THEN
        UPDATE public.ap_invoices
           SET status = 'posted',
               posted_by = COALESCE(NEW.posted_by, NEW.created_by)
         WHERE id = v_invoice_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_bill_from_grn ON public.goods_receipts;
CREATE TRIGGER trg_auto_bill_from_grn
AFTER UPDATE OF status ON public.goods_receipts
FOR EACH ROW
WHEN (NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted')
EXECUTE FUNCTION public.trg_fn_auto_bill_from_grn();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. GRN cancellation → cancel / reverse the GRN's AP invoice(s)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_cancel_ap_on_grn_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT id, doc_number, status, COALESCE(paid_amount, 0) AS paid_amount
          FROM public.ap_invoices
         WHERE grn_id = NEW.id
           AND status <> 'cancelled'
         FOR UPDATE
    LOOP
        IF r.paid_amount > 0
           OR r.status IN ('partial_paid', 'paid')
           OR EXISTS (
                SELECT 1
                  FROM public.supplier_payment_allocations a
                  JOIN public.supplier_payments p ON p.id = a.payment_id
                 WHERE a.invoice_id = r.id AND p.status = 'posted') THEN
            RAISE EXCEPTION 'GRN_CANCEL_BLOCKED: GRN "%" cannot be cancelled — its AP invoice "%" has supplier payments applied (paid %). Cancel those payments first.',
                NEW.doc_number, r.doc_number, r.paid_amount;
        END IF;

        -- Fires trg_post_ap_invoice → AP ledger, GL (Inventory/AP), cashbook
        -- and supplier balance reversal.
        UPDATE public.ap_invoices
           SET status = 'cancelled',
               cancel_reason = COALESCE(NEW.cancel_reason, 'GRN ' || NEW.doc_number || ' cancelled')
         WHERE id = r.id;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_ap_on_grn_cancel ON public.goods_receipts;
CREATE TRIGGER trg_cancel_ap_on_grn_cancel
AFTER UPDATE OF status ON public.goods_receipts
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
EXECUTE FUNCTION public.trg_fn_cancel_ap_on_grn_cancel();

-- cancel_grn: no longer blocked by the auto-posted (unpaid) invoice — the
-- trigger above reverses it; it still fails when payments exist.
CREATE OR REPLACE FUNCTION public.cancel_grn(p_grn_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
    v_branch_id  UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    IF NOT (public.is_admin() OR public.is_manager() OR public.auth_has_role('procurement')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorised to cancel GRNs');
    END IF;

    SELECT doc_number, status, branch_id INTO v_doc_number, v_status, v_branch_id
      FROM public.goods_receipts WHERE id = p_grn_id;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'GRN not found: ' || p_grn_id);
    END IF;

    IF NOT public.is_admin() AND NOT (v_branch_id = ANY (COALESCE(public.auth_branch_ids(), ARRAY[]::uuid[]))) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorised for this branch');
    END IF;

    IF v_status <> 'posted' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'GRN "' || v_doc_number || '" is ' || v_status || '. Only posted GRNs can be cancelled.');
    END IF;

    UPDATE public.goods_receipts
       SET status = 'cancelled', cancel_reason = p_reason
     WHERE id = p_grn_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'cancelled');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_grn(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_grn(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Supplier payment posting / cancellation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_supplier_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    c_ap_code   CONSTANT TEXT := '2000';   -- Accounts Payables
    v_alloc     RECORD;
    v_ap_ledger UUID;
    v_cash_acc  public.finance_accounts;
    v_acc_code  TEXT;
    v_sup_name  TEXT;
    v_desc      TEXT;
BEGIN
    -- ── draft → posted ───────────────────────────────────────────────────────
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
        NEW.posted_at := now();
        NEW.posted_by := COALESCE(NEW.posted_by, auth.uid(), NEW.created_by);

        -- Allocations must target posted, live invoices
        FOR v_alloc IN
            SELECT a.invoice_id, a.amount, i.doc_number, i.status
              FROM public.supplier_payment_allocations a
              JOIN public.ap_invoices i ON i.id = a.invoice_id
             WHERE a.payment_id = NEW.id
        LOOP
            IF v_alloc.status NOT IN ('posted', 'partial_paid', 'paid') THEN
                RAISE EXCEPTION 'VALIDATION_ERROR: Payment % is allocated to AP Invoice "%" which is "%". Only posted invoices can be paid.',
                    NEW.doc_number, v_alloc.doc_number, v_alloc.status;
            END IF;
        END LOOP;

        IF NOT EXISTS (
            SELECT 1 FROM public.ap_ledger WHERE doc_id = NEW.id AND entry_type = 'PAYMENT'
        ) THEN
            SELECT name INTO v_sup_name FROM public.suppliers WHERE id = NEW.supplier_id;
            v_desc := 'Supplier Payment ' || NEW.doc_number || ' to ' || COALESCE(v_sup_name, 'Supplier')
                      || ' via ' || NEW.payment_method;

            -- Resolve paying cash/bank account. Read safely via jsonb so this
            -- works whether or not the column exists in the row type.
            v_acc_code := NULLIF(TRIM(COALESCE(to_jsonb(NEW) ->> 'bank_account_code', to_jsonb(NEW) ->> 'bank_account', '')), '');

            IF v_acc_code IS NOT NULL THEN
                SELECT fa.* INTO v_cash_acc
                  FROM public.finance_accounts fa
                 WHERE fa.deleted_at IS NULL
                   AND (fa.company_id = NEW.company_id OR fa.company_id IS NULL)
                   AND (fa.account_number = v_acc_code
                        OR fa.registered_name = v_acc_code
                        OR fa.registered_name ILIKE '%' || v_acc_code || '%')
                 ORDER BY (fa.account_number = v_acc_code) DESC NULLS LAST,
                          (fa.registered_name = v_acc_code) DESC NULLS LAST,
                          fa.is_active DESC
                 LIMIT 1;
            END IF;

            IF v_cash_acc.id IS NULL THEN
                SELECT fa.* INTO v_cash_acc
                  FROM public.finance_accounts fa
                 WHERE fa.deleted_at IS NULL
                   AND fa.is_active
                   AND (fa.company_id = NEW.company_id OR fa.company_id IS NULL)
                   AND fa.account_type = CASE WHEN NEW.payment_method = 'cash' THEN 'cash' ELSE 'bank' END
                 ORDER BY fa.is_default DESC, fa.created_at
                 LIMIT 1;
            END IF;

            IF v_cash_acc.id IS NULL OR v_cash_acc.ledger_id IS NULL THEN
                RAISE EXCEPTION 'ACCOUNT_MISSING: no paying %-account (with a linked ledger) found for payment % (bank_account=%). Register it in Finance → Accounts.',
                    CASE WHEN NEW.payment_method = 'cash' THEN 'cash' ELSE 'bank' END,
                    NEW.doc_number, COALESCE(v_acc_code, 'n/a');
            END IF;

            v_ap_ledger := public.fn_fin_ledger_by_code(NEW.company_id, c_ap_code, 'Accounts Payables');

            -- Sub-ledger: AP debit (liability settled)
            INSERT INTO public.ap_ledger (
                company_id, branch_id, supplier_id, entry_type,
                doc_id, doc_number, doc_date,
                debit, credit, currency, exchange_rate,
                description, posted_by
            ) VALUES (
                NEW.company_id, NEW.branch_id, NEW.supplier_id, 'PAYMENT',
                NEW.id, NEW.doc_number, NEW.doc_date,
                NEW.total_amount, 0, COALESCE(NEW.currency, 'LKR'), COALESCE(NEW.exchange_rate, 1),
                v_desc, NEW.posted_by
            );

            -- No clamp: overpayments must show as a negative (debit) balance
            UPDATE public.suppliers
               SET balance = COALESCE(balance, 0) - NEW.total_amount
             WHERE id = NEW.supplier_id;

            -- General ledger: Dr Accounts Payable / Cr Cash-Bank
            PERFORM public.fn_fin_post_leg(
                NEW.company_id, NEW.branch_id, 'supplier_payment', NEW.id, NEW.doc_date,
                v_ap_ledger, NULL, 'AP Settlement — ' || v_desc, NEW.total_amount, 0);
            PERFORM public.fn_fin_post_leg(
                NEW.company_id, NEW.branch_id, 'supplier_payment', NEW.id, NEW.doc_date,
                v_cash_acc.ledger_id, v_cash_acc.id, v_desc, 0, NEW.total_amount);
        END IF;

        -- Apply allocations (idempotent recompute from posted allocations)
        FOR v_alloc IN
            SELECT DISTINCT invoice_id FROM public.supplier_payment_allocations WHERE payment_id = NEW.id
        LOOP
            PERFORM public.fn_ap_refresh_invoice_paid(v_alloc.invoice_id, NEW.id, true);
        END LOOP;

        SELECT COALESCE(SUM(amount), 0) INTO NEW.allocated_amount
          FROM public.supplier_payment_allocations WHERE payment_id = NEW.id;

        RETURN NEW;
    END IF;

    -- ── posted → cancelled ───────────────────────────────────────────────────
    IF NEW.status = 'cancelled' AND OLD.status = 'posted' THEN
        NEW.cancelled_at := now();

        IF EXISTS (SELECT 1 FROM public.ap_ledger WHERE doc_id = OLD.id AND entry_type = 'PAYMENT')
           AND NOT EXISTS (SELECT 1 FROM public.ap_ledger WHERE doc_id = OLD.id AND entry_type = 'REVERSAL') THEN

            INSERT INTO public.ap_ledger (
                company_id, branch_id, supplier_id, entry_type,
                doc_id, doc_number, doc_date,
                debit, credit, currency, exchange_rate,
                description, posted_by
            ) VALUES (
                OLD.company_id, OLD.branch_id, OLD.supplier_id, 'REVERSAL',
                OLD.id, OLD.doc_number || '-REV', CURRENT_DATE,
                0, OLD.total_amount, COALESCE(OLD.currency, 'LKR'), COALESCE(OLD.exchange_rate, 1),
                'Cancellation of Payment ' || OLD.doc_number || COALESCE(' — ' || NEW.cancel_reason, ''),
                COALESCE(auth.uid(), OLD.posted_by)
            );

            UPDATE public.suppliers
               SET balance = COALESCE(balance, 0) + OLD.total_amount
             WHERE id = OLD.supplier_id;

            -- Mirror-reverse exactly what was posted: Cr AP / Dr Cash-Bank
            -- (ledger + finance_accounts balance + cashbook reversal rows).
            PERFORM public.fn_fin_reverse_source('supplier_payment', OLD.id, CURRENT_DATE, OLD.doc_number);
        END IF;

        -- Restore invoice paid_amount / status (this payment excluded)
        FOR v_alloc IN
            SELECT DISTINCT invoice_id FROM public.supplier_payment_allocations WHERE payment_id = OLD.id
        LOOP
            PERFORM public.fn_ap_refresh_invoice_paid(v_alloc.invoice_id, OLD.id, false);
        END LOOP;

        -- Allocation rows are kept as audit history; the payment no longer
        -- applies any amount.
        NEW.allocated_amount := 0;

        RETURN NEW;
    END IF;

    -- ── draft → cancelled ────────────────────────────────────────────────────
    IF NEW.status = 'cancelled' AND OLD.status = 'draft' THEN
        NEW.cancelled_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_suppay ON public.supplier_payments;
DROP TRIGGER IF EXISTS trg_post_supplier_payment ON public.supplier_payments;
CREATE TRIGGER trg_post_supplier_payment
BEFORE UPDATE OF status ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.post_supplier_payment();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Backfill: post legitimate draft GRN invoices
--    * GRN is posted (not draft/approved/cancelled)
--    * company does NOT require AP approval
--    * the GRN has no other live (non-draft, non-cancelled) invoice
--    * only the earliest draft per GRN (older duplicates stay draft)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT DISTINCT ON (ai.grn_id) ai.id, ai.grn_id, ai.doc_number
          FROM public.ap_invoices ai
          JOIN public.goods_receipts g ON g.id = ai.grn_id
         WHERE ai.status = 'draft'
           AND g.status = 'posted'
           AND COALESCE(ai.total_amount, 0) > 0
           AND NOT public.procurement_setting_bool(ai.company_id, 'invoice_approval_required')
         ORDER BY ai.grn_id, ai.created_at ASC
    LOOP
        IF EXISTS (
            SELECT 1 FROM public.ap_invoices x
             WHERE x.grn_id = r.grn_id
               AND x.id <> r.id
               AND x.status NOT IN ('draft', 'cancelled')
        ) THEN
            CONTINUE;
        END IF;

        BEGIN
            UPDATE public.ap_invoices SET status = 'posted' WHERE id = r.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Backfill skipped AP invoice % (%): %', r.doc_number, r.id, SQLERRM;
        END;
    END LOOP;
END $$;

COMMIT;
