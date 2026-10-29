-- ═══════════════════════════════════════════════════════════════════════════
-- #147 — Remaining finance gaps from the audit (2026-10-28)
--
--   1. AP bills: VAT on a supplier bill → Dr 1010 Input VAT (was buried in
--      1005 Inventory). Dr 1005 = total − tax, Cr 2000 = total.
--   2. Supplier payments: the paying finance account is taken by id
--      (supplier_payments.bank_account_id), not guessed from a name; a planned
--      cheque from Cheque Plan can be passed (p_cheque_id) and is linked by
--      #134's sync. create_and_post_payment gains p_bank_account_id/p_cheque_id.
--   3. Voucher cheques: finance_vouchers.cheque_no / cheque_date; the cheque
--      register gets the real number instead of 'CHQ-<voucher_no>'.
--   4. Merged-table bills: pos_merge_pay stores tenders per order, so card /
--      QR / credit / split on a merged bill reach the right GL account (before,
--      every merged bill was booked as CASH) and the shift per tender.
--   5. Shift close: cash refunds paid out of the drawer during the shift are
--      deducted from expected cash (was always 0).
--   6. Fiscal periods: no GL entry can be written into a locked/closed period;
--      the 2026 months are created (open) if the company has none.
--
-- Prerequisites: #128, #134, #141, #145, #146. Run the whole file once in the
-- Supabase SQL editor (each statement is idempotent).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF to_regprocedure('public.pos_split_pay(uuid,jsonb,uuid)') IS NULL THEN
        RAISE EXCEPTION '#147: apply #145 first.';
    END IF;
    IF to_regprocedure('public.fn_post_payroll_run(uuid,uuid,text,date)') IS NULL THEN
        RAISE EXCEPTION '#147: apply #146 first.';
    END IF;
END $$;

-- ── 1. AP invoice posting with input-VAT split ─────────────────────────────
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
    v_vat_ledger  UUID;
    v_tax         NUMERIC;
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

            -- General ledger: Dr Inventory (net) + Dr Input VAT (tax) / Cr AP (gross)
            -- #147: the bill's VAT is recoverable — it goes to 1010, not inventory.
            v_tax := LEAST(GREATEST(ROUND(COALESCE(NEW.tax_amount, 0), 2), 0), NEW.total_amount);
            IF v_tax > 0 THEN
                v_vat_ledger := public.fn_fin_ledger_by_code(NEW.company_id, '1010', 'Input VAT - Recoverable');
                PERFORM public.fn_fin_post_leg(
                    NEW.company_id, NEW.branch_id, 'invoice', NEW.id, NEW.doc_date,
                    v_vat_ledger, NULL, v_desc || ' — input VAT', v_tax, 0);
            END IF;
            PERFORM public.fn_fin_post_leg(
                NEW.company_id, NEW.branch_id, 'invoice', NEW.id, NEW.doc_date,
                v_inv_ledger, NULL, v_desc, NEW.total_amount - v_tax, 0);
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

-- ── 2. Supplier payment: exact paying account + planned cheque ─────────────
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.finance_accounts(id);
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS bank_account TEXT;

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

            -- #147: the exact finance_accounts row chosen in the UI wins
            IF NULLIF(to_jsonb(NEW) ->> 'bank_account_id', '') IS NOT NULL THEN
                SELECT fa.* INTO v_cash_acc
                  FROM public.finance_accounts fa
                 WHERE fa.id = (to_jsonb(NEW) ->> 'bank_account_id')::UUID
                   AND fa.deleted_at IS NULL;
            END IF;

            IF v_cash_acc.id IS NULL AND v_acc_code IS NOT NULL THEN
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

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'create_and_post_payment'
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

CREATE FUNCTION public.create_and_post_payment(
    p_company_id        UUID,
    p_branch_id         UUID,
    p_supplier_id       UUID,
    p_doc_date          DATE,
    p_payment_method    TEXT,
    p_total_amount      NUMERIC,
    p_reference_no      TEXT    DEFAULT NULL,
    p_cheque_no         TEXT    DEFAULT NULL,
    p_allocations       JSONB   DEFAULT '[]'::JSONB,
    p_post_now          BOOLEAN DEFAULT true,
    p_bank_account_code TEXT    DEFAULT NULL,
    p_bank_account_id   UUID    DEFAULT NULL,
    p_cheque_id         UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_company UUID;
    v_pay     UUID;
    v_doc     TEXT;
    v_alloc   JSONB;
    v_amt     NUMERIC;
    v_sum     NUMERIC := 0;
    v_total   NUMERIC := ROUND(COALESCE(p_total_amount, 0), 2);
    v_acc     public.finance_accounts%ROWTYPE;
    v_chq     public.finance_cheques%ROWTYPE;
    v_chq_no  TEXT := NULLIF(TRIM(COALESCE(p_cheque_no, '')), '');
BEGIN
    IF v_uid IS NULL OR NOT (public.is_admin() OR public.is_manager()
                             OR public.auth_has_role('finance') OR public.auth_has_role('procurement')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are not allowed to record supplier payments.');
    END IF;
    IF p_branch_id IS NULL OR p_supplier_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Branch and supplier are required.');
    END IF;
    IF NOT public.is_admin() AND NOT (p_branch_id = ANY(public.auth_branch_ids())) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You do not have access to this branch.');
    END IF;
    SELECT company_id INTO v_company FROM public.branches WHERE id = p_branch_id;
    v_company := COALESCE(v_company, p_company_id);
    IF v_total <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero.');
    END IF;
    IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Allocations must be a list.');
    END IF;
    IF COALESCE(p_post_now, true) AND jsonb_array_length(p_allocations) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Select at least one bill to pay.');
    END IF;
    IF p_bank_account_id IS NOT NULL THEN
        SELECT * INTO v_acc FROM public.finance_accounts WHERE id = p_bank_account_id AND deleted_at IS NULL;
        IF NOT FOUND OR v_acc.ledger_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'The paying account is not a registered cash/bank account with a ledger.');
        END IF;
    END IF;
    -- A planned cheque from the Cheque Plan: its number/account are used, and
    -- #134's sync links it to this payment when the payment posts.
    IF p_cheque_id IS NOT NULL THEN
        SELECT * INTO v_chq FROM public.finance_cheques WHERE id = p_cheque_id;
        IF NOT FOUND OR v_chq.status NOT IN ('planned', 'issued') OR v_chq.supplier_payment_id IS NOT NULL OR v_chq.voucher_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'The selected planned cheque is no longer available.');
        END IF;
        IF p_bank_account_id IS NOT NULL AND v_chq.bank_account_id IS DISTINCT FROM p_bank_account_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'The planned cheque belongs to a different bank account.');
        END IF;
        v_chq_no := v_chq.cheque_no;
        IF v_acc.id IS NULL THEN
            SELECT * INTO v_acc FROM public.finance_accounts WHERE id = v_chq.bank_account_id;
        END IF;
    END IF;
    IF COALESCE(p_payment_method, '') ILIKE '%cheque%' AND v_chq_no IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cheque number is required for a cheque payment.');
    END IF;

    v_doc := public.generate_proc_doc_number(v_company, p_branch_id, 'SUP_PAY');

    INSERT INTO public.supplier_payments (
        company_id, branch_id, doc_number, doc_date, supplier_id, payment_method,
        cheque_no, reference_no, total_amount, status, created_by, bank_account_code, bank_account, bank_account_id
    ) VALUES (
        v_company, p_branch_id, v_doc, COALESCE(p_doc_date, CURRENT_DATE), p_supplier_id,
        COALESCE(NULLIF(TRIM(p_payment_method), ''), 'bank_transfer'),
        v_chq_no, NULLIF(TRIM(COALESCE(p_reference_no, '')), ''),
        v_total, 'draft', v_uid,
        COALESCE(NULLIF(TRIM(COALESCE(p_bank_account_code, '')), ''), v_acc.account_number, v_acc.registered_name),
        COALESCE(NULLIF(TRIM(COALESCE(p_bank_account_code, '')), ''), v_acc.account_number, v_acc.registered_name),
        v_acc.id
    ) RETURNING id INTO v_pay;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_amt := ROUND(COALESCE(NULLIF(v_alloc ->> 'amount', '')::NUMERIC, 0), 2);
        CONTINUE WHEN v_amt = 0;
        IF v_amt < 0 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: allocation amounts must be positive';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.ap_invoices
                        WHERE id = (v_alloc ->> 'invoice_id')::UUID AND supplier_id = p_supplier_id
                          AND status IN ('posted', 'partial_paid')
                          AND v_amt <= COALESCE(balance_due, total_amount - COALESCE(paid_amount, 0)) + 0.005) THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: bill % is not a posted bill of this supplier with enough balance due',
                v_alloc ->> 'invoice_id';
        END IF;
        INSERT INTO public.supplier_payment_allocations (payment_id, invoice_id, amount)
        VALUES (v_pay, (v_alloc ->> 'invoice_id')::UUID, v_amt);
        v_sum := v_sum + v_amt;
    END LOOP;

    IF COALESCE(p_post_now, true) THEN
        IF ABS(v_sum - v_total) > 0.005 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: payment total % does not equal the bills allocated %', v_total, v_sum;
        END IF;
        UPDATE public.supplier_payments SET allocated_amount = v_sum WHERE id = v_pay;
        -- draft → posted: #128 post_supplier_payment writes AP ledger, Dr 2000 /
        -- Cr bank-cash legs, balances, supplier balance and bill paid status;
        -- #134 syncs the cheque register.
        UPDATE public.supplier_payments SET status = 'posted' WHERE id = v_pay;
    END IF;

    RETURN jsonb_build_object('success', true, 'payment_id', v_pay, 'doc_number', v_doc,
                              'status', CASE WHEN COALESCE(p_post_now, true) THEN 'posted' ELSE 'draft' END);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_and_post_payment(UUID, UUID, UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_and_post_payment(UUID, UUID, UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT, UUID, UUID) TO authenticated;

-- ── 3. Voucher cheque number / date ────────────────────────────────────────
ALTER TABLE public.finance_vouchers ADD COLUMN IF NOT EXISTS cheque_no   TEXT;
ALTER TABLE public.finance_vouchers ADD COLUMN IF NOT EXISTS cheque_date DATE;

-- post_finance_voucher (#134c) registers the cheque as 'CHQ-<voucher_no>';
-- take the number/date the user typed on the voucher instead.
CREATE OR REPLACE FUNCTION public.trg_fn_voucher_cheque_number()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v RECORD;
BEGIN
    SELECT cheque_no, cheque_date INTO v FROM public.finance_vouchers WHERE id = NEW.voucher_id;
    IF NULLIF(TRIM(COALESCE(v.cheque_no, '')), '') IS NOT NULL THEN
        NEW.cheque_no := TRIM(v.cheque_no);
    END IF;
    IF v.cheque_date IS NOT NULL THEN
        NEW.cheque_date := v.cheque_date;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voucher_cheque_number ON public.finance_cheques;
CREATE TRIGGER trg_voucher_cheque_number
BEFORE INSERT ON public.finance_cheques
FOR EACH ROW WHEN (NEW.voucher_id IS NOT NULL)
EXECUTE FUNCTION public.trg_fn_voucher_cheque_number();

-- ── 4. Merged-table bills with tenders ─────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'pos_merge_pay'
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

CREATE FUNCTION public.pos_merge_pay(
    p_order_ids   UUID[],
    p_tenders     JSONB,
    p_shift_id    UUID DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    o        RECORD;
    t        JSONB;
    v_m      TEXT;
    v_amt    NUMERIC;
    v_total  NUMERIC := 0;
    v_sum    NUMERIC := 0;
    v_n      INT := 0;
    v_label  TEXT;
    v_anchor UUID;
    v_left   NUMERIC;
    v_part   NUMERIC;
    v_cnt    INT;
    v_i      INT;
    v_res    JSONB;
    v_inv    TEXT;
    r        RECORD;
BEGIN
    IF auth.uid() IS NULL OR NOT (public.auth_has_role('cashier') OR public.is_admin() OR public.is_manager()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role. Requires cashier/admin/manager.');
    END IF;
    IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No orders provided for merging.');
    END IF;

    FOR o IN SELECT id, total_amount, payment_status, customer_id, branch_id FROM public.orders
              WHERE id = ANY(p_order_ids) ORDER BY created_at, id FOR UPDATE LOOP
        IF o.payment_status = 'paid' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Order ' || o.id || ' is already paid.');
        END IF;
        IF NOT public.is_admin() AND NOT (o.branch_id = ANY(public.auth_branch_ids())) THEN
            RETURN jsonb_build_object('success', false, 'error', 'You do not have access to this branch.');
        END IF;
        v_total := v_total + ROUND(COALESCE(o.total_amount, 0), 2);
        v_anchor := COALESCE(v_anchor, o.id);
    END LOOP;

    CREATE TEMP TABLE IF NOT EXISTS _pmp_tenders (method TEXT, amount NUMERIC) ON COMMIT DROP;
    DELETE FROM _pmp_tenders;
    FOR t IN SELECT * FROM jsonb_array_elements(COALESCE(p_tenders, '[]'::JSONB)) LOOP
        v_m := lower(TRIM(COALESCE(t ->> 'method', '')));
        v_m := CASE v_m WHEN 'online' THEN 'qr' WHEN 'credit card' THEN 'card' WHEN 'credit_card' THEN 'card'
                        WHEN 'mastercard' THEN 'master' WHEN 'transfer' THEN 'bank' WHEN 'bank_transfer' THEN 'bank' ELSE v_m END;
        IF v_m NOT IN ('cash', 'card', 'visa', 'master', 'qr', 'bank', 'credit') THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: unknown tender "%"', t ->> 'method';
        END IF;
        v_amt := ROUND(COALESCE(NULLIF(t ->> 'amount', '')::NUMERIC, 0), 2);
        CONTINUE WHEN v_amt = 0;
        IF v_amt < 0 THEN RAISE EXCEPTION 'VALIDATION_ERROR: tender amounts must be positive'; END IF;
        INSERT INTO _pmp_tenders VALUES (v_m, v_amt);
        v_sum := v_sum + v_amt;
    END LOOP;
    SELECT COUNT(DISTINCT method) INTO v_n FROM _pmp_tenders;
    IF v_n = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: add at least one tender';
    END IF;
    IF ABS(v_sum - v_total) > 0.01 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: tenders % do not equal the merged bill total %', v_sum, v_total;
    END IF;

    IF EXISTS (SELECT 1 FROM _pmp_tenders WHERE method = 'credit') THEN
        IF p_customer_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND deleted_at IS NULL) THEN
                RAISE EXCEPTION 'VALIDATION_ERROR: customer not found';
            END IF;
            UPDATE public.orders SET customer_id = p_customer_id, updated_at = now() WHERE id = ANY(p_order_ids);
        ELSIF EXISTS (SELECT 1 FROM public.orders WHERE id = ANY(p_order_ids) AND customer_id IS NULL)
           OR (SELECT COUNT(DISTINCT customer_id) FROM public.orders WHERE id = ANY(p_order_ids)) > 1 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: a CREDIT tender needs one registered customer for the merged bill';
        END IF;
    END IF;

    -- Tenders per order, pro rata to each order's total; the last order takes
    -- the rounding of each tender (fn_pos_post_sale scales to the order total).
    DELETE FROM public.pos_order_tenders WHERE order_id = ANY(p_order_ids);
    SELECT COUNT(*) INTO v_cnt FROM public.orders WHERE id = ANY(p_order_ids);
    FOR r IN SELECT method, SUM(amount) AS amt FROM _pmp_tenders GROUP BY method LOOP
        v_left := r.amt;
        v_i := 0;
        FOR o IN SELECT id, total_amount FROM public.orders WHERE id = ANY(p_order_ids) ORDER BY created_at, id LOOP
            v_i := v_i + 1;
            v_part := CASE WHEN v_i = v_cnt THEN v_left
                           ELSE ROUND(r.amt * ROUND(COALESCE(o.total_amount, 0), 2) / NULLIF(v_total, 0), 2) END;
            v_left := v_left - COALESCE(v_part, 0);
            IF COALESCE(v_part, 0) > 0 THEN
                INSERT INTO public.pos_order_tenders (order_id, method, amount, created_by)
                VALUES (o.id, r.method, v_part, auth.uid());
            END IF;
        END LOOP;
    END LOOP;

    v_label := CASE WHEN v_n = 1 THEN (SELECT method FROM _pmp_tenders LIMIT 1) ELSE 'split' END;
    v_res := public.merge_table_orders_and_pay(p_order_ids, v_label, v_total);
    IF NOT COALESCE((v_res ->> 'success')::BOOLEAN, false) THEN
        RAISE EXCEPTION '%', COALESCE(v_res ->> 'error', 'Merged payment failed');
    END IF;
    v_inv := v_res ->> 'invoice_id';
    UPDATE public.orders SET payment_method = v_label, paid_at = COALESCE(paid_at, now()) WHERE id = ANY(p_order_ids);

    IF p_shift_id IS NOT NULL THEN
        FOR r IN SELECT method, SUM(amount) AS amt FROM _pmp_tenders GROUP BY method LOOP
            v_res := public.pos_record_shift_payment(p_shift_id, v_anchor, r.method, r.amt);
            IF NOT COALESCE((v_res ->> 'success')::BOOLEAN, false) THEN
                RAISE EXCEPTION 'Shift: %', COALESCE(v_res ->> 'error', 'could not record payment');
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true, 'order_count', v_cnt, 'total', v_total, 'tenders', v_n, 'anchor_order_id', v_anchor, 'invoice_id', v_inv);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
REVOKE ALL ON FUNCTION public.pos_merge_pay(UUID[], JSONB, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_merge_pay(UUID[], JSONB, UUID, UUID) TO authenticated;

-- ── 5. Shift close: cash refunds out of the drawer ─────────────────────────
-- Same body as live (pg_get_functiondef 2026-10-28) except v_cash_refunds:
-- refunds paid in cash at this branch while the shift was open
-- (process_refund writes a negative 'refunded' payment noted "— via cash").
CREATE OR REPLACE FUNCTION public.pos_close_shift(
    p_shift_id uuid, p_counted_cash numeric, p_counted_card_slips numeric DEFAULT 0,
    p_counted_qr_total numeric DEFAULT 0, p_counted_bank_total numeric DEFAULT 0,
    p_closing_note text DEFAULT NULL::text, p_approved_by uuid DEFAULT NULL::uuid,
    p_approval_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_shift RECORD;
    v_expected NUMERIC(12,2);
    v_variance NUMERIC(12,2);
    v_actor UUID := auth.uid();
    v_cash_refunds NUMERIC(12,2) := 0;
BEGIN
    SELECT * INTO v_shift FROM pos_shifts WHERE id = p_shift_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift not found.');
    END IF;
    IF v_shift.status = 'closed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift is already closed. Cannot close again.');
    END IF;
    IF v_shift.cashier_id != v_actor
       AND NOT public.auth_has_role('admin')
       AND NOT public.auth_has_role('manager') THEN
        RETURN jsonb_build_object('success', false, 'error', 'You can only close your own shift.');
    END IF;

    INSERT INTO pos_shift_audit_logs (user_id, branch_id, terminal_id, shift_id, action, new_value)
    VALUES (v_actor, v_shift.branch_id, v_shift.terminal_id, p_shift_id, 'shift_close_attempted',
            jsonb_build_object('counted_cash', p_counted_cash, 'counted_card_slips', p_counted_card_slips,
                               'counted_qr_total', p_counted_qr_total, 'counted_bank_total', p_counted_bank_total));

    -- #147: cash refunds handed out while this shift was open
    SELECT COALESCE(SUM(-p.amount), 0) INTO v_cash_refunds
      FROM payments p
     WHERE p.amount < 0
       AND p.status = 'refunded'
       AND p.branch_id = v_shift.branch_id
       AND p.created_at >= v_shift.opened_at
       AND COALESCE(p.notes, '') ILIKE '%via cash%';

    v_expected := v_shift.opening_cash_float
                + v_shift.cash_sales_total
                - v_cash_refunds
                - v_shift.cash_drops_total
                + v_shift.cash_in_total
                - v_shift.cash_out_total;
    v_variance := p_counted_cash - v_expected;

    IF v_variance != 0 AND p_approved_by IS NULL THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Variance detected. Manager approval is required to close this shift.',
            'requires_approval', true, 'expected_cash', v_expected,
            'counted_cash', p_counted_cash, 'variance', v_variance, 'cash_refunds', v_cash_refunds);
    END IF;

    UPDATE pos_shifts SET
        status = 'closed',
        expected_cash = v_expected,
        counted_cash = p_counted_cash,
        counted_card_slips = p_counted_card_slips,
        counted_qr_total = p_counted_qr_total,
        counted_bank_total = p_counted_bank_total,
        refunds_total = v_cash_refunds,
        variance = v_variance,
        closing_note = p_closing_note,
        approved_by = p_approved_by,
        approved_at = CASE WHEN p_approved_by IS NOT NULL THEN now() ELSE NULL END,
        approval_note = p_approval_note,
        closed_by = v_actor,
        closed_at = now()
    WHERE id = p_shift_id;

    INSERT INTO pos_shift_audit_logs (user_id, branch_id, terminal_id, shift_id, action, old_value, new_value)
    VALUES (v_actor, v_shift.branch_id, v_shift.terminal_id, p_shift_id, 'shift_closed',
            jsonb_build_object('status', v_shift.status, 'opening_cash_float', v_shift.opening_cash_float),
            jsonb_build_object('status', 'closed', 'expected_cash', v_expected, 'counted_cash', p_counted_cash,
                               'variance', v_variance, 'cash_refunds', v_cash_refunds, 'closed_by', v_actor));

    RETURN jsonb_build_object('success', true, 'shift_id', p_shift_id, 'variance', v_variance, 'cash_refunds', v_cash_refunds);
END;
$function$;

-- ── 6. Fiscal period lock ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_fiscal_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_name TEXT;
    v_date DATE := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_date ELSE NEW.entry_date END;
    v_co   UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
BEGIN
    SELECT fp.period_name INTO v_name
      FROM public.fiscal_periods fp
     WHERE v_date BETWEEN fp.period_start AND fp.period_end
       AND fp.status IN ('locked', 'closed')
       AND (fp.company_id IS NULL OR v_co IS NULL OR fp.company_id = v_co)
     LIMIT 1;
    IF v_name IS NOT NULL THEN
        RAISE EXCEPTION 'PERIOD_LOCKED: % is locked/closed — post into an open period (reverse or adjust with today''s date).', v_name;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.entry_date IS DISTINCT FROM NEW.entry_date THEN
        SELECT fp.period_name INTO v_name
          FROM public.fiscal_periods fp
         WHERE OLD.entry_date BETWEEN fp.period_start AND fp.period_end
           AND fp.status IN ('locked', 'closed')
           AND (fp.company_id IS NULL OR OLD.company_id IS NULL OR fp.company_id = OLD.company_id)
         LIMIT 1;
        IF v_name IS NOT NULL THEN
            RAISE EXCEPTION 'PERIOD_LOCKED: % is locked/closed.', v_name;
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_a_fiscal_period_lock ON public.finance_cashbook_entries;
CREATE TRIGGER trg_a_fiscal_period_lock
BEFORE INSERT OR UPDATE OF entry_date, debit_amount, credit_amount, ledger_id OR DELETE ON public.finance_cashbook_entries
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_fiscal_period_lock();

-- 2026 monthly periods (open) for every company that has none yet
INSERT INTO public.fiscal_periods (company_id, period_name, period_start, period_end, status)
SELECT c.id, to_char(m, 'FMMonth YYYY'), m::DATE, (m + INTERVAL '1 month - 1 day')::DATE, 'open'
  FROM public.companies c
 CROSS JOIN generate_series(DATE '2026-01-01', DATE '2026-12-01', INTERVAL '1 month') AS m
 WHERE NOT EXISTS (SELECT 1 FROM public.fiscal_periods fp WHERE fp.company_id = c.id);

NOTIFY pgrst, 'reload schema';
