-- ═══════════════════════════════════════════════════════════════════════════
-- #141 — GL integrity: atomic manual journals + clean supplier-payment RPC
--
-- Why
--  1. Manual journals were posted by the browser in ~6 separate requests
--     (header, lines, post flag, then one cashbook insert + a read-modify-write
--     of finance_ledgers.current_balance per line). A dropped connection left
--     half a journal in the cashbook; two users posting at once lost balance
--     updates; a bank ledger's finance_accounts balance never moved.
--     Reversal looked ledgers up by account_code (e.g. '1010' → the WRONG
--     ledger) and could "reverse" system journals (supplier payments) without
--     cancelling the payment.
--  2. Every posted supplier payment got a journal_entries row with a
--     hard-coded '1010 Bank Account - Main (HNB)' credit line (legacy trigger
--     trg_journal_on_supplier_payment), although the real bank leg (#128)
--     goes to the paying account's ledger (e.g. 1002-4). Live also had TWO
--     create_and_post_payment overloads (10 and 11 args) — a PGRST203 risk.
--
-- What
--  A. fn_fin_post_manual_journal(...)  — one transaction: journal header +
--     lines + balanced cashbook legs (source_type 'manual_adjustment') +
--     ledger/account balances via #128 fn_fin_post_leg. Admin / finance only.
--  B. fn_fin_reverse_manual_journal(...) — manual journals only; mirror legs
--     posted under the reversal journal; original marked reversed.
--  C. create_and_post_payment — same named parameters (PostgREST calls by
--     name, so the client is unchanged); inserts draft header + allocations,
--     then draft → posted so #128 post_supplier_payment does ALL accounting.
--     No journal_entries row any more.
--
-- Prerequisites: #128 (fn_fin_post_leg, post_supplier_payment trigger).
-- The Supabase SQL editor commits statement by statement — every part below
-- is self-contained and safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PART 0 (read-only) — save the current live body first ──────────────────
-- Run this alone, copy the result into a file, then run the rest.
--   SELECT p.oid::regprocedure, pg_get_functiondef(p.oid)
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'create_and_post_payment';

DO $$
BEGIN
    IF to_regprocedure('public.fn_fin_post_leg(uuid,uuid,text,uuid,date,uuid,uuid,text,numeric,numeric)') IS NULL THEN
        RAISE EXCEPTION '#141: apply #128 first (fn_fin_post_leg missing).';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'post_supplier_payment' AND prosrc LIKE '%fn_fin_post_leg%') THEN
        RAISE EXCEPTION '#141: apply #128 first (post_supplier_payment is not the #128 version).';
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Atomic manual journal
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN ('fn_fin_post_manual_journal', 'fn_fin_reverse_manual_journal')
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

CREATE FUNCTION public.fn_fin_post_manual_journal(
    p_doc_date    DATE,
    p_description TEXT,
    p_reference   TEXT,
    p_branch_id   UUID,
    p_lines       JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_company  UUID;
    v_journal  UUID;
    v_line     JSONB;
    v_led      public.finance_ledgers%ROWTYPE;
    v_acc      UUID;
    v_dr       NUMERIC;
    v_cr       NUMERIC;
    v_tot_dr   NUMERIC := 0;
    v_tot_cr   NUMERIC := 0;
    v_n        INT := 0;
    v_ref_uuid UUID;
    v_desc     TEXT := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_ref      TEXT := NULLIF(TRIM(COALESCE(p_reference, '')), '');
BEGIN
    IF v_uid IS NULL OR NOT (public.is_admin() OR public.auth_has_role('finance')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only admin or finance users can post journal entries.');
    END IF;
    IF p_branch_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Branch is required.');
    END IF;
    IF NOT public.is_admin() AND NOT (p_branch_id = ANY(public.auth_branch_ids())) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You do not have access to this branch.');
    END IF;
    SELECT company_id INTO v_company FROM public.branches WHERE id = p_branch_id;
    IF p_doc_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Document date is required.');
    END IF;
    IF v_desc IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Narration / description is required.');
    END IF;
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A journal needs at least 2 lines (one debit and one credit).');
    END IF;

    -- Validate every line before writing anything
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_n  := v_n + 1;
        v_dr := ROUND(COALESCE(NULLIF(v_line ->> 'dr_amount', '')::NUMERIC, 0), 2);
        v_cr := ROUND(COALESCE(NULLIF(v_line ->> 'cr_amount', '')::NUMERIC, 0), 2);
        IF v_dr < 0 OR v_cr < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', format('Line %s: negative amounts are not allowed.', v_n));
        END IF;
        IF (v_dr = 0) = (v_cr = 0) THEN
            RETURN jsonb_build_object('success', false, 'error', format('Line %s: enter either a debit or a credit.', v_n));
        END IF;
        SELECT * INTO v_led FROM public.finance_ledgers
         WHERE id = NULLIF(v_line ->> 'ledger_id', '')::UUID AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', format('Line %s: ledger not found.', v_n));
        END IF;
        IF NOT COALESCE(v_led.is_active, true) THEN
            RETURN jsonb_build_object('success', false, 'error', format('Line %s: ledger %s is inactive.', v_n, v_led.ledger_code));
        END IF;
        IF v_led.company_id IS NOT NULL AND v_company IS NOT NULL AND v_led.company_id <> v_company THEN
            RETURN jsonb_build_object('success', false, 'error', format('Line %s: ledger %s belongs to another company.', v_n, v_led.ledger_code));
        END IF;
        v_tot_dr := v_tot_dr + v_dr;
        v_tot_cr := v_tot_cr + v_cr;
    END LOOP;

    IF ABS(v_tot_dr - v_tot_cr) > 0.005 THEN
        RETURN jsonb_build_object('success', false, 'error',
            format('Debits (%s) must equal credits (%s).', v_tot_dr, v_tot_cr));
    END IF;

    IF v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_ref_uuid := v_ref::UUID;
    ELSIF v_ref IS NOT NULL AND position(v_ref IN v_desc) = 0 THEN
        v_desc := '[Ref: ' || v_ref || '] ' || v_desc;
    END IF;

    INSERT INTO public.journal_entries (
        company_id, branch_id, doc_date, description, reference_type, reference_id,
        total_dr, total_cr, is_posted, posted_by
    ) VALUES (
        v_company, p_branch_id, p_doc_date, v_desc, 'manual', v_ref_uuid,
        v_tot_dr, v_tot_cr, false, v_uid
    ) RETURNING id INTO v_journal;

    v_n := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_n  := v_n + 1;
        v_dr := ROUND(COALESCE(NULLIF(v_line ->> 'dr_amount', '')::NUMERIC, 0), 2);
        v_cr := ROUND(COALESCE(NULLIF(v_line ->> 'cr_amount', '')::NUMERIC, 0), 2);
        SELECT * INTO v_led FROM public.finance_ledgers WHERE id = (v_line ->> 'ledger_id')::UUID;

        INSERT INTO public.journal_lines (journal_id, account_code, account_name, dr_amount, cr_amount, memo, line_number, branch_id)
        VALUES (v_journal, v_led.ledger_code, v_led.ledger_name, v_dr, v_cr, NULLIF(v_line ->> 'memo', ''), v_n, p_branch_id);

        -- A bank/cash ledger moves its account too — only when exactly one
        -- live account is linked to it (never guess between several).
        v_acc := NULLIF(v_line ->> 'account_id', '')::UUID;
        IF v_acc IS NULL AND (SELECT COUNT(*) FROM public.finance_accounts
                               WHERE ledger_id = v_led.id AND deleted_at IS NULL) = 1 THEN
            SELECT id INTO v_acc FROM public.finance_accounts WHERE ledger_id = v_led.id AND deleted_at IS NULL;
        END IF;

        PERFORM public.fn_fin_post_leg(
            v_company, p_branch_id, 'manual_adjustment', v_journal, p_doc_date,
            v_led.id, v_acc,
            v_desc || COALESCE(' — ' || NULLIF(v_line ->> 'memo', ''), ''),
            v_dr, v_cr);
    END LOOP;

    UPDATE public.journal_entries SET is_posted = true, posted_at = now() WHERE id = v_journal;

    RETURN jsonb_build_object('success', true, 'journal_id', v_journal);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.fn_fin_post_manual_journal(DATE, TEXT, TEXT, UUID, JSONB) IS
    '#141: atomic manual journal — header, lines, cashbook legs and balances in one transaction (admin/finance).';

CREATE FUNCTION public.fn_fin_reverse_manual_journal(
    p_journal_id UUID,
    p_reason     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid  UUID := auth.uid();
    v_j    public.journal_entries%ROWTYPE;
    v_rev  UUID;
    v_desc TEXT;
    r      RECORD;
    v_legs INT := 0;
BEGIN
    IF v_uid IS NULL OR NOT (public.is_admin() OR public.auth_has_role('finance')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only admin or finance users can reverse journal entries.');
    END IF;

    SELECT * INTO v_j FROM public.journal_entries WHERE id = p_journal_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Journal entry not found.');
    END IF;
    IF NOT public.is_admin() AND NOT (v_j.branch_id = ANY(public.auth_branch_ids())) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You do not have access to this branch.');
    END IF;
    IF COALESCE(v_j.reference_type, 'manual') NOT IN ('manual', 'manual_adjustment') THEN
        RETURN jsonb_build_object('success', false, 'error',
            format('This is a system journal (%s). Reverse it from its source document, e.g. cancel the supplier payment in Procurement → Payments.', v_j.reference_type));
    END IF;
    IF COALESCE(v_j.is_reversed, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This journal entry has already been reversed.');
    END IF;
    IF NOT COALESCE(v_j.is_posted, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only posted journals can be reversed.');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.finance_cashbook_entries
                    WHERE source_type = 'manual_adjustment' AND source_id = v_j.id) THEN
        RETURN jsonb_build_object('success', false, 'error',
            'This journal has no ledger postings to reverse (posted by an older version). Ask finance to correct it with a new journal.');
    END IF;

    v_desc := 'REVERSAL of ' || v_j.description || COALESCE(' (' || NULLIF(TRIM(p_reason), '') || ')', '');

    INSERT INTO public.journal_entries (
        company_id, branch_id, doc_date, description, reference_type, reference_id,
        total_dr, total_cr, is_posted, posted_by, reversal_id
    ) VALUES (
        v_j.company_id, v_j.branch_id, CURRENT_DATE, v_desc, 'reversal', v_j.id,
        v_j.total_cr, v_j.total_dr, false, v_uid, v_j.id
    ) RETURNING id INTO v_rev;

    INSERT INTO public.journal_lines (journal_id, account_code, account_name, dr_amount, cr_amount, memo, line_number, branch_id)
    SELECT v_rev, l.account_code, l.account_name, l.cr_amount, l.dr_amount,
           TRIM('Reversal of line ' || l.line_number || ': ' || COALESCE(l.memo, '')), l.line_number, l.branch_id
      FROM public.journal_lines l WHERE l.journal_id = v_j.id;

    FOR r IN
        SELECT c.* FROM public.finance_cashbook_entries c
         WHERE c.source_type = 'manual_adjustment' AND c.source_id = v_j.id
           AND c.description NOT LIKE 'REVERSAL%'
         ORDER BY c.created_at, c.id
    LOOP
        PERFORM public.fn_fin_post_leg(
            r.company_id, r.branch_id, 'manual_adjustment', v_rev, CURRENT_DATE,
            r.ledger_id, r.account_id, 'REVERSAL — ' || r.description,
            r.credit_amount, r.debit_amount);
        v_legs := v_legs + 1;
    END LOOP;

    UPDATE public.journal_entries SET is_posted = true, posted_at = now() WHERE id = v_rev;
    UPDATE public.journal_entries SET is_reversed = true, reversed_by_id = v_rev, updated_at = now() WHERE id = v_j.id;

    RETURN jsonb_build_object('success', true, 'reversal_id', v_rev, 'legs', v_legs);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.fn_fin_reverse_manual_journal(UUID, TEXT) IS
    '#141: reverse a posted MANUAL journal atomically (system journals are refused).';

REVOKE ALL ON FUNCTION public.fn_fin_post_manual_journal(DATE, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fin_reverse_manual_journal(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fin_post_manual_journal(DATE, TEXT, TEXT, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fin_reverse_manual_journal(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. create_and_post_payment — accounting only through #128's trigger
-- ─────────────────────────────────────────────────────────────────────────────
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
    p_bank_account_code TEXT    DEFAULT NULL
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
    IF COALESCE(p_payment_method, '') ILIKE '%cheque%' AND NULLIF(TRIM(COALESCE(p_cheque_no, '')), '') IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cheque number is required for a cheque payment.');
    END IF;

    v_doc := public.generate_proc_doc_number(v_company, p_branch_id, 'SUP_PAY');

    INSERT INTO public.supplier_payments (
        company_id, branch_id, doc_number, doc_date, supplier_id, payment_method,
        cheque_no, reference_no, total_amount, status, created_by, bank_account_code
    ) VALUES (
        v_company, p_branch_id, v_doc, COALESCE(p_doc_date, CURRENT_DATE), p_supplier_id,
        COALESCE(NULLIF(TRIM(p_payment_method), ''), 'bank_transfer'),
        NULLIF(TRIM(COALESCE(p_cheque_no, '')), ''), NULLIF(TRIM(COALESCE(p_reference_no, '')), ''),
        v_total, 'draft', v_uid, NULLIF(TRIM(COALESCE(p_bank_account_code, '')), '')
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

COMMENT ON FUNCTION public.create_and_post_payment(UUID, UUID, UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT) IS
    '#141: draft header + allocations, then draft → posted; all accounting by #128 post_supplier_payment. No journal_entries row.';

REVOKE ALL ON FUNCTION public.create_and_post_payment(UUID, UUID, UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_and_post_payment(UUID, UUID, UUID, DATE, TEXT, NUMERIC, TEXT, TEXT, JSONB, BOOLEAN, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Drop the legacy "journal on supplier payment" trigger
-- ─────────────────────────────────────────────────────────────────────────────
-- PART 0 showed both live create_and_post_payment versions never touch
-- journal_entries: the '1010 Bank Account - Main (HNB)' journals come from
-- the AFTER UPDATE trigger trg_journal_on_supplier_payment
-- (trg_fn_journal_on_supplier_payment, migrations/20260404). #128's
-- post_supplier_payment already posts the real legs, so that trigger only
-- writes a duplicate journal with a hard-coded bank account. The reversal
-- trigger (status → cancelled) is kept: it marks the two existing legacy
-- journals reversed if those payments are ever cancelled.
DO $$
DECLARE t RECORD;
BEGIN
    FOR t IN
        SELECT tg.tgname, p.proname FROM pg_trigger tg
          JOIN pg_proc p ON p.oid = tg.tgfoid
         WHERE tg.tgrelid = 'public.supplier_payments'::regclass AND NOT tg.tgisinternal
           AND (p.proname = 'trg_fn_journal_on_supplier_payment'
                OR (p.proname NOT ILIKE '%reversal%' AND p.proname <> 'post_supplier_payment'
                    AND p.prosrc ~* 'insert\s+into\s+(public\.)?journal_entries'))
    LOOP
        EXECUTE format('DROP TRIGGER %I ON public.supplier_payments', t.tgname);
        RAISE NOTICE '#141 dropped legacy trigger % (%) on supplier_payments.', t.tgname, t.proname;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Read-only check after applying ─────────────────────────────────────────
--   SELECT p.oid::regprocedure FROM pg_proc p
--    WHERE p.proname IN ('create_and_post_payment','fn_fin_post_manual_journal','fn_fin_reverse_manual_journal');
--   -- expect exactly 3 rows (one overload each)
