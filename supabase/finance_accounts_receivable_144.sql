-- ═══════════════════════════════════════════════════════════════════════════
-- #144 — Accounts Receivable linked to the General Ledger
--
-- Before: Finance → Receivables read customer_receivables (NO code ever
-- wrote it) + unpaid orders; ledger 1003 Accounts Receivable had 0 postings;
-- no way to receive a customer payment; aging cards always 0.
--
-- After (sub-ledger = customer_receivables, control account = 1003):
--   1. POS CREDIT sale → customer_receivables row + Dr 1003, written by
--      #145 fn_pos_post_sale when the order is paid.
--   2. Manual credit invoice (function hall, catering, …)
--      fn_ar_create_invoice → receivable + Dr 1003 / Cr income ledger.
--   3. Customer payment  fn_ar_receive_payment → one receipt for one or
--      many receivables: Dr cash/bank account ledger / Cr 1003; each
--      receivable's paid_amount / status updated.
--   4. fn_ar_cancel_receipt → mirror reversal + balances restored.
--   5. fn_ar_write_off (admin/finance) → Dr 10002 Bad Debts / Cr 1003 for an
--      uncollectable balance; fn_ar_reverse_write_off undoes it.
-- Every GL leg goes through #128 fn_fin_post_leg (cashbook + ledger +
-- account balances). Writes only through these SECURITY DEFINER RPCs.
--
-- Prerequisites: #128. The Supabase SQL editor commits statement by
-- statement; every statement here is idempotent (safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF to_regprocedure('public.fn_fin_post_leg(uuid,uuid,text,uuid,date,uuid,uuid,text,numeric,numeric)') IS NULL THEN
        RAISE EXCEPTION '#144: apply #128 first (fn_fin_post_leg missing).';
    END IF;
END $$;

-- ── 0. Cashbook source_type CHECK — add AR / POS types (never narrows) ─────
DO $$
DECLARE
    v_def  TEXT;
    v_vals TEXT[] := ARRAY['ar_invoice', 'ar_receipt', 'ar_write_off', 'pos_shift'];
BEGIN
    SELECT pg_get_constraintdef(c.oid) INTO v_def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.finance_cashbook_entries'::regclass
       AND c.conname  = 'finance_cashbook_entries_source_type_check';
    IF v_def IS NULL THEN
        RETURN;   -- no CHECK on live → nothing to widen
    END IF;
    v_vals := v_vals || ARRAY(SELECT m[1] FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m);
    v_vals := v_vals || ARRAY(SELECT DISTINCT source_type FROM public.finance_cashbook_entries WHERE source_type IS NOT NULL);
    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_vals FROM unnest(v_vals) x;
    EXECUTE 'ALTER TABLE public.finance_cashbook_entries DROP CONSTRAINT finance_cashbook_entries_source_type_check';
    EXECUTE format('ALTER TABLE public.finance_cashbook_entries ADD CONSTRAINT finance_cashbook_entries_source_type_check CHECK (source_type IN (%s))',
                   (SELECT string_agg(quote_literal(x), ',') FROM unnest(v_vals) x));
END $$;

-- ── 1. Receivable sub-ledger columns ───────────────────────────────────────
ALTER TABLE public.customer_receivables ADD COLUMN IF NOT EXISTS company_id   UUID;
ALTER TABLE public.customer_receivables ADD COLUMN IF NOT EXISTS doc_number   TEXT;
ALTER TABLE public.customer_receivables ADD COLUMN IF NOT EXISTS doc_date     DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.customer_receivables ADD COLUMN IF NOT EXISTS source       TEXT DEFAULT 'manual';
ALTER TABLE public.customer_receivables ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE public.customer_receivables ADD COLUMN IF NOT EXISTS income_ledger_id UUID;
ALTER TABLE public.customer_receivables ADD COLUMN IF NOT EXISTS shift_payment_id UUID;
ALTER TABLE public.customer_receivables ADD COLUMN IF NOT EXISTS gl_posted_at TIMESTAMPTZ;
ALTER TABLE public.customer_receivables ADD COLUMN IF NOT EXISTS created_by   UUID;

-- Live customer_receivables was created without its foreign keys, so
-- PostgREST cannot embed customers(...) (PGRST200 "no relationship").
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.customer_receivables'::regclass AND contype = 'f'
                      AND confrelid = 'public.customers'::regclass) THEN
        ALTER TABLE public.customer_receivables
            ADD CONSTRAINT customer_receivables_customer_id_fkey
            FOREIGN KEY (customer_id) REFERENCES public.customers(id) NOT VALID;
        BEGIN
            ALTER TABLE public.customer_receivables VALIDATE CONSTRAINT customer_receivables_customer_id_fkey;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '#144: customer FK kept NOT VALID (old rows point to missing customers): %', SQLERRM;
        END;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.customer_receivables'::regclass AND contype = 'f'
                      AND confrelid = 'public.orders'::regclass) THEN
        ALTER TABLE public.customer_receivables
            ADD CONSTRAINT customer_receivables_order_id_fkey
            FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL NOT VALID;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_receivables_shift_payment
    ON public.customer_receivables (shift_payment_id) WHERE shift_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recv_open ON public.customer_receivables (customer_id, doc_date)
    WHERE status IN ('outstanding', 'partial', 'overdue');

CREATE SEQUENCE IF NOT EXISTS public.ar_doc_seq;

-- ── 2. Receipts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ar_receipts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID,
    branch_id      UUID REFERENCES public.branches(id),
    receipt_no     TEXT NOT NULL UNIQUE,
    receipt_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_id    UUID NOT NULL REFERENCES public.customers(id),
    account_id     UUID NOT NULL REFERENCES public.finance_accounts(id),
    payment_method TEXT NOT NULL DEFAULT 'cash',
    amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    reference_no   TEXT,
    remarks        TEXT,
    status         TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
    cancel_reason  TEXT,
    cancelled_at   TIMESTAMPTZ,
    cancelled_by   UUID,
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ar_receipt_allocations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id    UUID NOT NULL REFERENCES public.ar_receipts(id) ON DELETE RESTRICT,
    receivable_id UUID NOT NULL REFERENCES public.customer_receivables(id) ON DELETE RESTRICT,
    amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ar_alloc_receivable ON public.ar_receipt_allocations (receivable_id);
CREATE INDEX IF NOT EXISTS idx_ar_receipts_customer ON public.ar_receipts (customer_id, receipt_date);

ALTER TABLE public.ar_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_receipt_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ar_receipts_read ON public.ar_receipts;
CREATE POLICY ar_receipts_read ON public.ar_receipts FOR SELECT
    USING (public.is_admin()
           OR ((public.auth_has_role('finance') OR public.is_manager())
               AND (branch_id IS NULL OR branch_id = ANY(public.auth_branch_ids()))));

DROP POLICY IF EXISTS ar_receipt_alloc_read ON public.ar_receipt_allocations;
CREATE POLICY ar_receipt_alloc_read ON public.ar_receipt_allocations FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.ar_receipts r WHERE r.id = receipt_id));

REVOKE INSERT, UPDATE, DELETE ON public.ar_receipts, public.ar_receipt_allocations FROM anon, authenticated;
GRANT SELECT ON public.ar_receipts, public.ar_receipt_allocations TO authenticated;

-- Managers can read receivables too (finance/admin already can)
DROP POLICY IF EXISTS cr_manager ON public.customer_receivables;
CREATE POLICY cr_manager ON public.customer_receivables FOR SELECT
    USING (public.is_manager() AND (branch_id IS NULL OR branch_id = ANY(public.auth_branch_ids())));

-- ── 3. helpers ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ar_can_write(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT auth.uid() IS NOT NULL
       AND (public.is_admin()
            OR ((public.auth_has_role('finance') OR public.is_manager())
                AND (p_branch_id IS NULL OR p_branch_id = ANY(public.auth_branch_ids()))));
$$;

CREATE OR REPLACE FUNCTION public.fn_ar_status(p_total NUMERIC, p_paid NUMERIC, p_due DATE)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE WHEN COALESCE(p_paid, 0) >= COALESCE(p_total, 0) - 0.005 THEN 'paid'
                WHEN COALESCE(p_paid, 0) > 0.005 THEN 'partial'
                ELSE 'outstanding' END;
$$;

CREATE OR REPLACE FUNCTION public.fn_ar_next_no(p_prefix TEXT)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT p_prefix || '-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.ar_doc_seq')::TEXT, 6, '0');
$$;

REVOKE ALL ON FUNCTION public.fn_ar_can_write(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ar_next_no(TEXT) FROM PUBLIC, anon, authenticated;

-- ── 4. POS CREDIT sales ────────────────────────────────────────────────────
-- Receivable + GL (Dr 1003) for a POS credit sale are written together by
-- #145 fn_pos_post_sale when the order is paid. (An earlier draft used a
-- pos_shift_payments trigger — removed so a sale is never counted twice.)
DROP TRIGGER IF EXISTS trg_ar_from_pos_credit ON public.pos_shift_payments;
DROP FUNCTION IF EXISTS public.trg_fn_ar_from_pos_credit();

-- ── 5. Manual credit invoice ───────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN ('fn_ar_create_invoice', 'fn_ar_receive_payment', 'fn_ar_cancel_receipt')
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

CREATE FUNCTION public.fn_ar_create_invoice(
    p_customer_id      UUID,
    p_branch_id        UUID,
    p_doc_date         DATE,
    p_due_date         DATE,
    p_amount           NUMERIC,
    p_income_ledger_id UUID,
    p_description      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_company UUID;
    v_ar      UUID;
    v_inc     public.finance_ledgers%ROWTYPE;
    v_id      UUID;
    v_no      TEXT;
    v_amt     NUMERIC := ROUND(COALESCE(p_amount, 0), 2);
    v_desc    TEXT;
BEGIN
    IF NOT public.fn_ar_can_write(p_branch_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only admin, finance or manager users can raise customer invoices.');
    END IF;
    IF p_customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND deleted_at IS NULL) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Select a registered customer.');
    END IF;
    IF p_branch_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Branch is required.');
    END IF;
    IF v_amt <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero.');
    END IF;
    SELECT * INTO v_inc FROM public.finance_ledgers WHERE id = p_income_ledger_id AND deleted_at IS NULL;
    IF NOT FOUND OR v_inc.ledger_type <> 'income' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Select an income ledger (e.g. 5001 Function Hall Revenue).');
    END IF;
    SELECT company_id INTO v_company FROM public.branches WHERE id = p_branch_id;
    v_ar := public.fn_fin_ledger_by_code(v_company, '1003', 'Accounts Receivable');
    v_no := public.fn_ar_next_no('AR-INV');
    v_desc := 'Customer invoice ' || v_no || COALESCE(' — ' || NULLIF(TRIM(p_description), ''), '');

    INSERT INTO public.customer_receivables (
        company_id, branch_id, customer_id, doc_number, doc_date, due_date, total_amount, paid_amount,
        status, source, description, income_ledger_id, gl_posted_at, created_by
    ) VALUES (
        v_company, p_branch_id, p_customer_id, v_no, COALESCE(p_doc_date, CURRENT_DATE),
        COALESCE(p_due_date, COALESCE(p_doc_date, CURRENT_DATE) + 30), v_amt, 0,
        'outstanding', 'manual', NULLIF(TRIM(p_description), ''), v_inc.id, now(), auth.uid()
    ) RETURNING id INTO v_id;

    PERFORM public.fn_fin_post_leg(v_company, p_branch_id, 'ar_invoice', v_id, COALESCE(p_doc_date, CURRENT_DATE),
                                   v_ar, NULL, v_desc, v_amt, 0);
    PERFORM public.fn_fin_post_leg(v_company, p_branch_id, 'ar_invoice', v_id, COALESCE(p_doc_date, CURRENT_DATE),
                                   v_inc.id, NULL, v_desc, 0, v_amt);

    RETURN jsonb_build_object('success', true, 'receivable_id', v_id, 'doc_number', v_no);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ── 6. Receive a customer payment (one or many receivables) ────────────────
CREATE FUNCTION public.fn_ar_receive_payment(
    p_customer_id    UUID,
    p_branch_id      UUID,
    p_receipt_date   DATE,
    p_account_id     UUID,
    p_amount         NUMERIC,
    p_payment_method TEXT,
    p_reference_no   TEXT,
    p_remarks        TEXT,
    p_allocations    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_company UUID;
    v_ar      UUID;
    v_acc     public.finance_accounts%ROWTYPE;
    v_rec     public.customer_receivables%ROWTYPE;
    v_alloc   JSONB;
    v_amt     NUMERIC;
    v_sum     NUMERIC := 0;
    v_total   NUMERIC := ROUND(COALESCE(p_amount, 0), 2);
    v_id      UUID;
    v_no      TEXT;
    v_desc    TEXT;
    v_cust    TEXT;
BEGIN
    IF NOT public.fn_ar_can_write(p_branch_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only admin, finance or manager users can receive customer payments.');
    END IF;
    IF p_branch_id IS NULL OR p_customer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Branch and customer are required.');
    END IF;
    IF v_total <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero.');
    END IF;
    IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Select at least one invoice to settle.');
    END IF;
    SELECT * INTO v_acc FROM public.finance_accounts WHERE id = p_account_id AND deleted_at IS NULL;
    IF NOT FOUND OR v_acc.ledger_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Select the cash/bank account that received the money.');
    END IF;

    SELECT company_id INTO v_company FROM public.branches WHERE id = p_branch_id;
    v_ar := public.fn_fin_ledger_by_code(v_company, '1003', 'Accounts Receivable');
    SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) INTO v_cust FROM public.customers WHERE id = p_customer_id;
    v_no := public.fn_ar_next_no('AR-RCPT');

    INSERT INTO public.ar_receipts (company_id, branch_id, receipt_no, receipt_date, customer_id, account_id,
                                    payment_method, amount, reference_no, remarks, created_by)
    VALUES (v_company, p_branch_id, v_no, COALESCE(p_receipt_date, CURRENT_DATE), p_customer_id, v_acc.id,
            COALESCE(NULLIF(TRIM(p_payment_method), ''), 'cash'), v_total,
            NULLIF(TRIM(COALESCE(p_reference_no, '')), ''), NULLIF(TRIM(COALESCE(p_remarks, '')), ''), auth.uid())
    RETURNING id INTO v_id;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_amt := ROUND(COALESCE(NULLIF(v_alloc ->> 'amount', '')::NUMERIC, 0), 2);
        CONTINUE WHEN v_amt = 0;
        IF v_amt < 0 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: allocation amounts must be positive';
        END IF;
        SELECT * INTO v_rec FROM public.customer_receivables
         WHERE id = (v_alloc ->> 'receivable_id')::UUID FOR UPDATE;
        IF NOT FOUND OR v_rec.customer_id IS DISTINCT FROM p_customer_id THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: invoice % does not belong to this customer', v_alloc ->> 'receivable_id';
        END IF;
        IF v_rec.status NOT IN ('outstanding', 'partial', 'overdue') THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: invoice % is %', COALESCE(v_rec.doc_number, v_rec.id::TEXT), v_rec.status;
        END IF;
        IF v_amt > v_rec.total_amount - v_rec.paid_amount + 0.005 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: % is more than the % due on %', v_amt,
                v_rec.total_amount - v_rec.paid_amount, COALESCE(v_rec.doc_number, v_rec.id::TEXT);
        END IF;
        INSERT INTO public.ar_receipt_allocations (receipt_id, receivable_id, amount) VALUES (v_id, v_rec.id, v_amt);
        UPDATE public.customer_receivables
           SET paid_amount = paid_amount + v_amt,
               status = public.fn_ar_status(total_amount, paid_amount + v_amt, due_date),
               updated_at = now()
         WHERE id = v_rec.id;
        v_sum := v_sum + v_amt;
    END LOOP;

    IF ABS(v_sum - v_total) > 0.005 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: receipt amount % does not equal the invoices settled %', v_total, v_sum;
    END IF;

    v_desc := 'Customer receipt ' || v_no || ' — ' || COALESCE(NULLIF(v_cust, ''), 'customer')
              || COALESCE(' | Ref: ' || NULLIF(TRIM(p_reference_no), ''), '');
    PERFORM public.fn_fin_post_leg(v_company, p_branch_id, 'ar_receipt', v_id, COALESCE(p_receipt_date, CURRENT_DATE),
                                   v_acc.ledger_id, v_acc.id, v_desc, v_total, 0);
    PERFORM public.fn_fin_post_leg(v_company, p_branch_id, 'ar_receipt', v_id, COALESCE(p_receipt_date, CURRENT_DATE),
                                   v_ar, NULL, v_desc, 0, v_total);

    RETURN jsonb_build_object('success', true, 'receipt_id', v_id, 'receipt_no', v_no);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ── 7. Cancel a receipt ────────────────────────────────────────────────────
CREATE FUNCTION public.fn_ar_cancel_receipt(p_receipt_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_r  public.ar_receipts%ROWTYPE;
    a    RECORD;
BEGIN
    SELECT * INTO v_r FROM public.ar_receipts WHERE id = p_receipt_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Receipt not found.');
    END IF;
    IF NOT public.fn_ar_can_write(v_r.branch_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only admin, finance or manager users can cancel receipts.');
    END IF;
    IF v_r.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Receipt is already cancelled.');
    END IF;
    IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A reason is required.');
    END IF;

    FOR a IN SELECT * FROM public.ar_receipt_allocations WHERE receipt_id = v_r.id LOOP
        UPDATE public.customer_receivables
           SET paid_amount = GREATEST(paid_amount - a.amount, 0),
               status = public.fn_ar_status(total_amount, GREATEST(paid_amount - a.amount, 0), due_date),
               updated_at = now()
         WHERE id = a.receivable_id;
    END LOOP;

    PERFORM public.fn_fin_reverse_source('ar_receipt', v_r.id, CURRENT_DATE, v_r.receipt_no);

    UPDATE public.ar_receipts
       SET status = 'cancelled', cancel_reason = TRIM(p_reason), cancelled_at = now(), cancelled_by = auth.uid()
     WHERE id = v_r.id;

    RETURN jsonb_build_object('success', true, 'receipt_no', v_r.receipt_no);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ar_create_invoice(UUID, UUID, DATE, DATE, NUMERIC, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ar_receive_payment(UUID, UUID, DATE, UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ar_cancel_receipt(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ar_create_invoice(UUID, UUID, DATE, DATE, NUMERIC, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ar_receive_payment(UUID, UUID, DATE, UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ar_cancel_receipt(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ar_can_write(UUID) TO authenticated;

-- ── 8. Bad-debt write-off ──────────────────────────────────────────────────
ALTER TABLE public.customer_receivables ADD COLUMN IF NOT EXISTS written_off_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.ar_write_offs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID,
    branch_id      UUID,
    write_off_no   TEXT NOT NULL UNIQUE,
    write_off_date DATE NOT NULL DEFAULT CURRENT_DATE,
    receivable_id  UUID NOT NULL REFERENCES public.customer_receivables(id) ON DELETE RESTRICT,
    customer_id    UUID,
    amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    reason         TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
    reversed_at    TIMESTAMPTZ,
    reversed_by    UUID,
    reverse_reason TEXT,
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ar_write_offs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ar_write_offs_read ON public.ar_write_offs;
CREATE POLICY ar_write_offs_read ON public.ar_write_offs FOR SELECT
    USING (public.is_admin()
           OR ((public.auth_has_role('finance') OR public.is_manager())
               AND (branch_id IS NULL OR branch_id = ANY(public.auth_branch_ids()))));
REVOKE INSERT, UPDATE, DELETE ON public.ar_write_offs FROM anon, authenticated;
GRANT SELECT ON public.ar_write_offs TO authenticated;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN ('fn_ar_write_off', 'fn_ar_reverse_write_off')
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

-- Write-offs are a finance decision: admin / finance only (not managers).
CREATE FUNCTION public.fn_ar_write_off(p_receivable_id UUID, p_amount NUMERIC, p_reason TEXT, p_date DATE)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec  public.customer_receivables%ROWTYPE;
    v_amt  NUMERIC := ROUND(COALESCE(p_amount, 0), 2);
    v_open NUMERIC;
    v_id   UUID;
    v_no   TEXT;
    v_co   UUID;
    v_desc TEXT;
BEGIN
    SELECT * INTO v_rec FROM public.customer_receivables WHERE id = p_receivable_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
    END IF;
    IF auth.uid() IS NULL OR NOT (public.is_admin()
         OR (public.auth_has_role('finance') AND (v_rec.branch_id IS NULL OR v_rec.branch_id = ANY(public.auth_branch_ids())))) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only admin or finance users can write off bad debts.');
    END IF;
    IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A reason is required.');
    END IF;
    v_open := v_rec.total_amount - v_rec.paid_amount;
    IF v_rec.status NOT IN ('outstanding', 'partial', 'overdue') OR v_open <= 0.005 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nothing is open on this invoice.');
    END IF;
    IF v_amt <= 0 OR v_amt > v_open + 0.005 THEN
        RETURN jsonb_build_object('success', false, 'error', format('Write-off must be between 0 and the open balance %s.', v_open));
    END IF;

    v_co := COALESCE(v_rec.company_id, (SELECT company_id FROM public.branches WHERE id = v_rec.branch_id));
    v_no := public.fn_ar_next_no('AR-WO');
    INSERT INTO public.ar_write_offs (company_id, branch_id, write_off_no, write_off_date, receivable_id, customer_id, amount, reason, created_by)
    VALUES (v_co, v_rec.branch_id, v_no, COALESCE(p_date, CURRENT_DATE), v_rec.id, v_rec.customer_id, v_amt, TRIM(p_reason), auth.uid())
    RETURNING id INTO v_id;

    -- paid_amount = everything that cleared the invoice (receipts + write-offs);
    -- written_off_amount keeps the write-off part visible.
    UPDATE public.customer_receivables
       SET paid_amount = paid_amount + v_amt,
           written_off_amount = written_off_amount + v_amt,
           status = CASE WHEN paid_amount + v_amt >= total_amount - 0.005 THEN 'written_off' ELSE 'partial' END,
           updated_at = now()
     WHERE id = v_rec.id;

    v_desc := 'Bad debt write-off ' || v_no || ' — ' || COALESCE(v_rec.doc_number, left(v_rec.id::TEXT, 8)) || ' — ' || TRIM(p_reason);
    PERFORM public.fn_fin_post_leg(v_co, v_rec.branch_id, 'ar_write_off', v_id, COALESCE(p_date, CURRENT_DATE),
        public.fn_fin_ledger_by_code(v_co, '10002', 'Bad Debts'), NULL, v_desc, v_amt, 0);
    PERFORM public.fn_fin_post_leg(v_co, v_rec.branch_id, 'ar_write_off', v_id, COALESCE(p_date, CURRENT_DATE),
        public.fn_fin_ledger_by_code(v_co, '1003', 'Accounts Receivable'), NULL, v_desc, 0, v_amt);

    RETURN jsonb_build_object('success', true, 'write_off_id', v_id, 'write_off_no', v_no);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE FUNCTION public.fn_ar_reverse_write_off(p_write_off_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    w public.ar_write_offs%ROWTYPE;
BEGIN
    SELECT * INTO w FROM public.ar_write_offs WHERE id = p_write_off_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Write-off not found.');
    END IF;
    IF auth.uid() IS NULL OR NOT (public.is_admin()
         OR (public.auth_has_role('finance') AND (w.branch_id IS NULL OR w.branch_id = ANY(public.auth_branch_ids())))) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only admin or finance users can reverse a write-off.');
    END IF;
    IF w.status <> 'posted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Write-off is already reversed.');
    END IF;
    IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A reason is required.');
    END IF;

    UPDATE public.customer_receivables
       SET paid_amount = GREATEST(paid_amount - w.amount, 0),
           written_off_amount = GREATEST(written_off_amount - w.amount, 0),
           status = public.fn_ar_status(total_amount, GREATEST(paid_amount - w.amount, 0), due_date),
           updated_at = now()
     WHERE id = w.receivable_id;

    PERFORM public.fn_fin_reverse_source('ar_write_off', w.id, CURRENT_DATE, w.write_off_no);

    UPDATE public.ar_write_offs
       SET status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reverse_reason = TRIM(p_reason)
     WHERE id = w.id;
    RETURN jsonb_build_object('success', true, 'write_off_no', w.write_off_no);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ar_write_off(UUID, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ar_reverse_write_off(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ar_write_off(UUID, NUMERIC, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ar_reverse_write_off(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
