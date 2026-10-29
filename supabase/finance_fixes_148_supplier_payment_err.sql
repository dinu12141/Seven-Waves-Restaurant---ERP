-- =====================================================
-- #148: IMMEDIATE FIX FOR SUPPLIER PAYMENT ERROR
-- Fix for: record "new" has no field "bank_account"
-- Seven Waves Restaurant ERP — Finance & Procurement
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. Ensure columns exist on supplier_payments ──────────────────────────
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.finance_accounts(id);
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS bank_account TEXT;

-- ── 2. Fix post_supplier_payment trigger function ─────────────────────────
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

            -- Exact finance_accounts row chosen in the UI wins
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
            PERFORM public.fn_fin_reverse_source('supplier_payment', OLD.id, CURRENT_DATE, OLD.doc_number);
        END IF;

        -- Restore invoice paid_amount / status (this payment excluded)
        FOR v_alloc IN
            SELECT DISTINCT invoice_id FROM public.supplier_payment_allocations WHERE payment_id = OLD.id
        LOOP
            PERFORM public.fn_ap_refresh_invoice_paid(v_alloc.invoice_id, OLD.id, false);
        END LOOP;

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

DROP TRIGGER IF EXISTS trg_post_supplier_payment ON public.supplier_payments;
CREATE TRIGGER trg_post_supplier_payment
BEFORE UPDATE OF status ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.post_supplier_payment();

-- ── 3. Recreate create_and_post_payment RPC safely ────────────────────────
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

NOTIFY pgrst, 'reload schema';

-- =====================================================
-- END OF #148 FIX
-- =====================================================
