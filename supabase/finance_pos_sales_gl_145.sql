-- ═══════════════════════════════════════════════════════════════════════════
-- #145 — POS / online sales, refunds and shift variances → General Ledger
--
-- Live today (pg_get_functiondef, 2026-10-28):
--   process_cashier_payment → post_accounting_from_order / post_finance_for_order
--   write ONLY the legacy journal_entries (codes 1010/1030/4000/2100/2310 of
--   the old chart) + bank_accounts. Nothing reaches finance_cashbook_entries,
--   so POS revenue never appears in the Trial Balance / P&L / Balance Sheet.
--   Shift close (client) then raised a received voucher "Dr cash / Cr 5000"
--   for the COUNTED cash — opening float counted as sales, card/QR/credit
--   sales never posted. (The client part is removed in the same release.)
--
-- New (server-side, balanced, idempotent — all via #128 fn_fin_post_leg):
--   SALE   order becomes payment_status = 'paid' (any channel) → at COMMIT:
--            Dr 10001 MAIN CASH            cash payments
--            Dr 1021 Card & Digital Clearing card / visa / master / QR / bank / online
--            Dr 1003 Accounts Receivable     credit  (+ customer_receivables row)
--            Cr 5000 Restaurant Food Sales   net sales (total − VAT − SC − delivery)
--            Cr 2006 Output VAT Payable      VAT
--            Cr 5003 Service Charge Income   service charge
--            Cr 5004 Delivery Income         delivery charge
--            Cr 5006 Other Operating Income  tips
--   REFUND refund_amount increases → proportional mirror (Dr income/VAT,
--          Cr the account the sale was received in; credit sale → Cr 1003 and
--          the receivable is reduced).
--   SHIFT  close with variance → shortage Dr 7042 Misc. Expense / Cr cash;
--          overage Dr cash / Cr 5006.
--   SPLIT  pos_split_pay: each tender (cash/card/visa/master/qr/bank/credit)
--          stored, booked to its own account and recorded on the shift.
--   PAYOUT drawer cash_out → Dr chosen expense ledger (default 7042) / Cr cash
--          (fn_pos_cash_payout). cash_in / cash_drop: no GL (same cash ledger).
-- A posting failure never blocks a payment: it is logged in pos_gl_failures
-- and can be re-run with fn_pos_post_unposted_sales().
--
-- Prerequisites: #128, #144 (fn_ar_next_no). The Supabase SQL editor commits
-- statement by statement; every statement is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF to_regprocedure('public.fn_fin_post_leg(uuid,uuid,text,uuid,date,uuid,uuid,text,numeric,numeric)') IS NULL THEN
        RAISE EXCEPTION '#145: apply #128 first.';
    END IF;
    IF to_regprocedure('public.fn_ar_next_no(text)') IS NULL THEN
        RAISE EXCEPTION '#145: apply #144 first.';
    END IF;
END $$;

-- ── 0. Cashbook source types ───────────────────────────────────────────────
DO $$
DECLARE
    v_def  TEXT;
    v_vals TEXT[] := ARRAY['pos_sale', 'pos_refund', 'pos_shift', 'pos_payout'];
BEGIN
    SELECT pg_get_constraintdef(c.oid) INTO v_def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.finance_cashbook_entries'::regclass
       AND c.conname  = 'finance_cashbook_entries_source_type_check';
    IF v_def IS NULL THEN RETURN; END IF;
    v_vals := v_vals || ARRAY(SELECT m[1] FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m);
    v_vals := v_vals || ARRAY(SELECT DISTINCT source_type FROM public.finance_cashbook_entries WHERE source_type IS NOT NULL);
    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_vals FROM unnest(v_vals) x;
    EXECUTE 'ALTER TABLE public.finance_cashbook_entries DROP CONSTRAINT finance_cashbook_entries_source_type_check';
    EXECUTE format('ALTER TABLE public.finance_cashbook_entries ADD CONSTRAINT finance_cashbook_entries_source_type_check CHECK (source_type IN (%s))',
                   (SELECT string_agg(quote_literal(x), ',') FROM unnest(v_vals) x));
END $$;

-- ── 1. Card & digital payments clearing ledger (1021) ──────────────────────
INSERT INTO public.finance_ledgers (company_id, ledger_code, ledger_name, ledger_type, ledger_nature,
                                    account_group, opening_balance, opening_balance_type, current_balance,
                                    is_system_ledger, is_active)
SELECT l.company_id, '1021', 'Card & Digital Payments Clearing', 'asset', l.ledger_nature,
       'Assets-Current', 0, 'debit', 0, true, true
  FROM public.finance_ledgers l
 WHERE l.ledger_code = '1003' AND l.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.finance_ledgers x WHERE x.ledger_code = '1021' AND x.deleted_at IS NULL)
 LIMIT 1;

-- ── 1b. 'Credit' payment method ─────────────────────────────────────────────
-- process_cashier_payment resolves the method by payment_methods.name and
-- FALLS BACK TO 'Cash' when nothing matches. Live has no 'Credit' row, so a
-- POS credit sale would have been recorded (and booked) as cash.
INSERT INTO public.payment_methods (name, description, is_active)
SELECT 'Credit', 'Customer credit / on account (Accounts Receivable)', true
 WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE lower(name) = 'credit');

-- ── 2. Failure log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_gl_failures (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind       TEXT NOT NULL,             -- sale | refund | shift
    ref_id     UUID NOT NULL,
    error      TEXT,
    resolved   BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pos_gl_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_gl_failures_read ON public.pos_gl_failures;
CREATE POLICY pos_gl_failures_read ON public.pos_gl_failures FOR SELECT
    USING (public.is_admin() OR public.auth_has_role('finance'));
REVOKE INSERT, UPDATE, DELETE ON public.pos_gl_failures FROM anon, authenticated;
GRANT SELECT ON public.pos_gl_failures TO authenticated;

-- ── 2b. SPLIT tenders table (used by fn_pos_post_sale, see §9) ───────────
CREATE TABLE IF NOT EXISTS public.pos_order_tenders (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    method     TEXT NOT NULL CHECK (method IN ('cash', 'card', 'visa', 'master', 'qr', 'bank', 'credit')),
    amount     NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_order_tenders_order ON public.pos_order_tenders (order_id);
ALTER TABLE public.pos_order_tenders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_order_tenders_read ON public.pos_order_tenders;
CREATE POLICY pos_order_tenders_read ON public.pos_order_tenders FOR SELECT
    USING (public.is_admin() OR public.is_manager() OR public.auth_has_role('finance') OR public.auth_has_role('cashier'));
REVOKE INSERT, UPDATE, DELETE ON public.pos_order_tenders FROM anon, authenticated;
GRANT SELECT ON public.pos_order_tenders TO authenticated;

-- ── 3. helpers ─────────────────────────────────────────────────────────────
-- Payment method label → 'cash' | 'credit' | 'clearing'
CREATE OR REPLACE FUNCTION public.fn_pos_pay_bucket(p_method TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_method IS NULL OR p_method ~* '^\s*(cash|cod|cash on delivery)\s*$' OR p_method ILIKE 'cash%' THEN 'cash'
        WHEN p_method ILIKE '%credit%' AND p_method NOT ILIKE '%card%' THEN 'credit'
        WHEN p_method ILIKE '%on account%' OR p_method ILIKE '%house account%' THEN 'credit'
        ELSE 'clearing'
    END;
$$;

-- Ledger/account for a bucket. Cash = the finance account on ledger 10001.
CREATE OR REPLACE FUNCTION public.fn_pos_bucket_target(p_company UUID, p_bucket TEXT, OUT ledger_id UUID, OUT account_id UUID)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_bucket = 'cash' THEN
        SELECT fa.ledger_id, fa.id INTO ledger_id, account_id
          FROM public.finance_accounts fa JOIN public.finance_ledgers l ON l.id = fa.ledger_id
         WHERE l.ledger_code = '10001' AND fa.deleted_at IS NULL AND l.deleted_at IS NULL
         ORDER BY fa.created_at LIMIT 1;
        IF ledger_id IS NULL THEN
            ledger_id := public.fn_fin_ledger_by_code(p_company, '10001', 'MAIN CASH -ACC');
        END IF;
    ELSIF p_bucket = 'credit' THEN
        ledger_id := public.fn_fin_ledger_by_code(p_company, '1003', 'Accounts Receivable');
    ELSE
        ledger_id := public.fn_fin_ledger_by_code(p_company, '1021', 'Card & Digital Payments Clearing');
    END IF;
END;
$$;

-- ── 4. Sale ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pos_post_sale(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    o        public.orders%ROWTYPE;
    v_inv    RECORD;
    v_co     UUID;
    v_date   DATE;
    v_total  NUMERIC;
    v_tax    NUMERIC;
    v_sc     NUMERIC;
    v_del    NUMERIC;
    v_net    NUMERIC;
    v_tips   NUMERIC := 0;
    v_paysum NUMERIC := 0;
    v_cash   NUMERIC := 0;
    v_clear  NUMERIC := 0;
    v_credit NUMERIC := 0;
    v_t      RECORD;
    v_desc   TEXT;
    v_ref    TEXT;
    r        RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries
                WHERE source_type = 'pos_sale' AND source_id = p_order_id) THEN
        RETURN jsonb_build_object('success', true, 'already_posted', true);
    END IF;

    SELECT * INTO o FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;
    IF o.payment_status NOT IN ('paid', 'partially_refunded', 'refunded') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is not paid');
    END IF;

    SELECT * INTO v_inv FROM public.invoices WHERE order_id = p_order_id
     ORDER BY CASE WHEN payment_status = 'paid' THEN 0 ELSE 1 END, created_at DESC LIMIT 1;

    SELECT company_id INTO v_co FROM public.branches WHERE id = o.branch_id;
    v_co    := COALESCE(v_co, o.company_id);
    v_date  := COALESCE(o.paid_at, o.updated_at, now())::DATE;
    v_total := ROUND(COALESCE(o.total_amount, 0), 2);
    IF v_total <= 0 THEN
        RETURN jsonb_build_object('success', true, 'skipped', 'zero total (FOC)');
    END IF;
    v_tax := ROUND(COALESCE(NULLIF(v_inv.tax, 0), NULLIF(v_inv.vat_amount, 0), o.tax_amount, 0), 2);
    v_sc  := ROUND(COALESCE(NULLIF(v_inv.service_charge, 0), o.service_charge, 0), 2);
    v_del := ROUND(COALESCE(NULLIF(v_inv.delivery_charge, 0), o.delivery_charge, 0), 2);
    v_net := v_total - v_tax - v_sc - v_del;
    IF v_net < 0 THEN
        RAISE EXCEPTION 'POS_GL: order % components (VAT %, SC %, delivery %) exceed total %', p_order_id, v_tax, v_sc, v_del, v_total;
    END IF;

    -- Payment split: SPLIT tenders (#145 §9) when present, else the
    -- positive, non-voided payments of the sale
    FOR r IN
        SELECT public.fn_pos_pay_bucket(t.method) AS bucket, SUM(t.amount) AS amt, 0::NUMERIC AS tip
          FROM public.pos_order_tenders t
         WHERE t.order_id = p_order_id
         GROUP BY 1
        UNION ALL
        SELECT public.fn_pos_pay_bucket(COALESCE(pm.name, p.payment_method)) AS bucket,
               SUM(p.amount) AS amt, SUM(COALESCE(p.tip, 0)) AS tip
          FROM public.payments p
          LEFT JOIN public.payment_methods pm ON pm.id = p.payment_method_id
         WHERE p.order_id = p_order_id AND p.amount > 0 AND NOT COALESCE(p.voided, false)
           AND NOT EXISTS (SELECT 1 FROM public.pos_order_tenders t2 WHERE t2.order_id = p_order_id)
         GROUP BY 1
    LOOP
        v_paysum := v_paysum + r.amt;
        v_tips   := v_tips + r.tip;
        IF r.bucket = 'cash' THEN v_cash := v_cash + r.amt;
        ELSIF r.bucket = 'credit' THEN v_credit := v_credit + r.amt;
        ELSE v_clear := v_clear + r.amt; END IF;
    END LOOP;

    -- Belt and braces: the order says CREDIT but the payment row was resolved
    -- to another method (e.g. the 'Cash' fallback) → it is a credit sale.
    IF public.fn_pos_pay_bucket(o.payment_method) = 'credit' AND v_credit = 0 AND v_paysum > 0
       AND NOT EXISTS (SELECT 1 FROM public.pos_order_tenders t WHERE t.order_id = p_order_id) THEN
        v_credit := v_paysum; v_cash := 0; v_clear := 0;
    END IF;

    IF v_paysum <= 0 THEN
        -- no payments row (e.g. online gateway): whole total on the order's method
        CASE public.fn_pos_pay_bucket(o.payment_method)
            WHEN 'cash' THEN v_cash := v_total;
            WHEN 'credit' THEN v_credit := v_total;
            ELSE v_clear := v_total;
        END CASE;
    ELSE
        -- scale to the server-side total (payments may carry rounding)
        v_cash   := ROUND(v_total * v_cash / v_paysum, 2);
        v_credit := ROUND(v_total * v_credit / v_paysum, 2);
        v_clear  := v_total - v_cash - v_credit;
    END IF;

    v_ref  := COALESCE(o.order_number::TEXT, left(o.id::TEXT, 8));
    v_desc := 'POS sale — Order #' || v_ref
              || COALESCE(' | Inv ' || COALESCE(v_inv.invoice_number, v_inv.invoice_no), '')
              || COALESCE(' | ' || NULLIF(o.customer_name, ''), '');

    -- Debits
    IF v_cash > 0 THEN
        SELECT * INTO v_t FROM public.fn_pos_bucket_target(v_co, 'cash');
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date, v_t.ledger_id, v_t.account_id, v_desc || ' (cash)', v_cash, 0);
    END IF;
    IF v_clear > 0 THEN
        SELECT * INTO v_t FROM public.fn_pos_bucket_target(v_co, 'clearing');
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date, v_t.ledger_id, NULL, v_desc || ' (card/digital)', v_clear, 0);
    END IF;
    IF v_credit > 0 THEN
        SELECT * INTO v_t FROM public.fn_pos_bucket_target(v_co, 'credit');
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date, v_t.ledger_id, NULL, v_desc || ' (credit)', v_credit, 0);
        INSERT INTO public.customer_receivables (
            company_id, branch_id, customer_id, order_id, invoice_id, doc_number, doc_date, due_date,
            total_amount, paid_amount, status, source, description, gl_posted_at, created_by
        ) VALUES (
            v_co, o.branch_id, o.customer_id, o.id, v_inv.id, public.fn_ar_next_no('AR-INV'), v_date, v_date + 30,
            v_credit, 0, 'outstanding', 'pos_credit',
            'POS credit sale — Order #' || v_ref || COALESCE(' — ' || NULLIF(o.customer_name, ''), ''),
            now(), auth.uid()
        );
        IF o.customer_id IS NULL THEN
            -- POS requires a registered customer for CREDIT; flag any that slip through
            INSERT INTO public.pos_gl_failures (kind, ref_id, error)
            VALUES ('sale', o.id, 'Credit sale without a registered customer — assign the customer to receivable of Order #' || v_ref);
        END IF;
    END IF;
    IF v_tips > 0 THEN
        -- tips are collected on top of the bill, in the same tender as the bill
        SELECT * INTO v_t FROM public.fn_pos_bucket_target(v_co, CASE WHEN v_cash > 0 THEN 'cash' ELSE 'clearing' END);
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date, v_t.ledger_id,
                                       CASE WHEN v_cash > 0 THEN v_t.account_id END, v_desc || ' (tips)', v_tips, 0);
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date,
            public.fn_fin_ledger_by_code(v_co, '5006', 'Other Operating Income'), NULL, v_desc || ' — tips', 0, v_tips);
    END IF;

    -- Credits
    PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date,
        public.fn_fin_ledger_by_code(v_co, '5000', 'Restaurant Food Sales'), NULL, v_desc, 0, v_net);
    IF v_tax > 0 THEN
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date,
            public.fn_fin_ledger_by_code(v_co, '2006', 'Output VAT Payable'), NULL, v_desc || ' — VAT', 0, v_tax);
    END IF;
    IF v_sc > 0 THEN
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date,
            public.fn_fin_ledger_by_code(v_co, '5003', 'Service Charge Income'), NULL, v_desc || ' — service charge', 0, v_sc);
    END IF;
    IF v_del > 0 THEN
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date,
            public.fn_fin_ledger_by_code(v_co, '5004', 'Delivery Income'), NULL, v_desc || ' — delivery', 0, v_del);
    END IF;

    RETURN jsonb_build_object('success', true, 'total', v_total, 'cash', v_cash, 'card_digital', v_clear,
                              'credit', v_credit, 'vat', v_tax, 'service_charge', v_sc, 'delivery', v_del, 'tips', v_tips);
END;
$$;

-- ── 5. Refund (delta of orders.refund_amount) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pos_post_refund(p_order_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    o       public.orders%ROWTYPE;
    v_co    UUID;
    v_total NUMERIC;
    v_amt   NUMERIC := ROUND(COALESCE(p_amount, 0), 2);
    v_desc  TEXT;
    v_left  NUMERIC;
    v_part  NUMERIC;
    v_n     INT := 0;
    v_cnt   INT;
    v_rec   public.customer_receivables%ROWTYPE;
    r       RECORD;
BEGIN
    IF v_amt <= 0 THEN RETURN jsonb_build_object('success', true, 'skipped', 'zero'); END IF;
    IF NOT EXISTS (SELECT 1 FROM public.finance_cashbook_entries WHERE source_type = 'pos_sale' AND source_id = p_order_id) THEN
        -- sale never reached the GL: post it first so the refund has something to reverse
        PERFORM public.fn_pos_post_sale(p_order_id);
    END IF;
    SELECT * INTO o FROM public.orders WHERE id = p_order_id;
    SELECT company_id INTO v_co FROM public.branches WHERE id = o.branch_id;
    v_co := COALESCE(v_co, o.company_id);
    v_desc := 'POS refund — Order #' || COALESCE(o.order_number::TEXT, left(o.id::TEXT, 8))
              || COALESCE(' — ' || NULLIF(o.refund_reason, ''), '');

    SELECT SUM(credit_amount) INTO v_total FROM public.finance_cashbook_entries
     WHERE source_type = 'pos_sale' AND source_id = p_order_id AND description NOT LIKE 'REVERSAL%' AND credit_amount > 0;
    IF COALESCE(v_total, 0) <= 0 THEN
        RAISE EXCEPTION 'POS_GL: no sale postings to refund for order %', p_order_id;
    END IF;

    -- Mirror every sale leg proportionally (refund ÷ sale total); last leg on each side takes the rounding
    FOR r IN
        SELECT ledger_id, account_id, debit_amount, credit_amount,
               (credit_amount > 0) AS is_cr,
               row_number() OVER (PARTITION BY (credit_amount > 0) ORDER BY created_at, id) AS rn,
               count(*)     OVER (PARTITION BY (credit_amount > 0)) AS cnt
          FROM public.finance_cashbook_entries
         WHERE source_type = 'pos_sale' AND source_id = p_order_id AND description NOT LIKE 'REVERSAL%'
         ORDER BY (credit_amount > 0), created_at, id
    LOOP
        IF r.rn = 1 THEN v_left := v_amt; END IF;
        v_part := CASE WHEN r.rn = r.cnt THEN v_left
                       ELSE ROUND(v_amt * GREATEST(r.debit_amount, r.credit_amount) / v_total, 2) END;
        v_left := v_left - v_part;
        CONTINUE WHEN v_part = 0;
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_refund', o.id, CURRENT_DATE,
            r.ledger_id, r.account_id, v_desc,
            CASE WHEN r.is_cr THEN v_part ELSE 0 END,
            CASE WHEN r.is_cr THEN 0 ELSE v_part END);
        v_n := v_n + 1;
    END LOOP;

    -- A credit sale's receivable shrinks by its share of the refund
    SELECT * INTO v_rec FROM public.customer_receivables
     WHERE order_id = p_order_id AND source = 'pos_credit' ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF FOUND THEN
        SELECT COALESCE(SUM(credit_amount), 0) INTO v_part FROM public.finance_cashbook_entries
         WHERE source_type = 'pos_refund' AND source_id = p_order_id
           AND ledger_id = public.fn_fin_ledger_by_code(v_co, '1003', 'Accounts Receivable')
           AND created_at = now();
        IF v_part > 0 THEN
            UPDATE public.customer_receivables
               SET total_amount = GREATEST(total_amount - v_part, paid_amount),
                   status = public.fn_ar_status(GREATEST(total_amount - v_part, paid_amount), paid_amount, due_date),
                   updated_at = now()
             WHERE id = v_rec.id;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'legs', v_n);
END;
$$;

-- ── 6. Shift variance ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pos_post_shift_variance(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    s     public.pos_shifts%ROWTYPE;
    v_co  UUID;
    v_var NUMERIC;
    v_t   RECORD;
    v_desc TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries WHERE source_type = 'pos_shift' AND source_id = p_shift_id) THEN
        RETURN jsonb_build_object('success', true, 'already_posted', true);
    END IF;
    SELECT * INTO s FROM public.pos_shifts WHERE id = p_shift_id;
    v_var := ROUND(COALESCE(s.variance, 0), 2);
    IF s.status <> 'closed' OR v_var = 0 THEN
        RETURN jsonb_build_object('success', true, 'skipped', 'no variance');
    END IF;
    SELECT company_id INTO v_co FROM public.branches WHERE id = s.branch_id;
    SELECT * INTO v_t FROM public.fn_pos_bucket_target(v_co, 'cash');
    v_desc := 'POS shift ' || left(s.id::TEXT, 8) || ' — cash ' || CASE WHEN v_var < 0 THEN 'shortage' ELSE 'overage' END
              || COALESCE(' (' || NULLIF(s.approval_note, '') || ')', '');
    IF v_var < 0 THEN
        PERFORM public.fn_fin_post_leg(v_co, s.branch_id, 'pos_shift', s.id, COALESCE(s.closed_at, now())::DATE,
            public.fn_fin_ledger_by_code(v_co, '7042', 'Miscellaneous Expense'), NULL, v_desc, -v_var, 0);
        PERFORM public.fn_fin_post_leg(v_co, s.branch_id, 'pos_shift', s.id, COALESCE(s.closed_at, now())::DATE,
            v_t.ledger_id, v_t.account_id, v_desc, 0, -v_var);
    ELSE
        PERFORM public.fn_fin_post_leg(v_co, s.branch_id, 'pos_shift', s.id, COALESCE(s.closed_at, now())::DATE,
            v_t.ledger_id, v_t.account_id, v_desc, v_var, 0);
        PERFORM public.fn_fin_post_leg(v_co, s.branch_id, 'pos_shift', s.id, COALESCE(s.closed_at, now())::DATE,
            public.fn_fin_ledger_by_code(v_co, '5006', 'Other Operating Income'), NULL, v_desc, 0, v_var);
    END IF;
    RETURN jsonb_build_object('success', true, 'variance', v_var);
END;
$$;

-- ── 7. Triggers (deferred: run at COMMIT, after payments rows exist) ───────
CREATE OR REPLACE FUNCTION public.trg_fn_pos_gl_order()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_res JSONB;
BEGIN
    BEGIN
        IF NEW.payment_status IN ('paid', 'partially_refunded', 'refunded')
           AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
            v_res := public.fn_pos_post_sale(NEW.id);
            IF NOT COALESCE((v_res ->> 'success')::BOOLEAN, false) THEN
                INSERT INTO public.pos_gl_failures (kind, ref_id, error) VALUES ('sale', NEW.id, v_res ->> 'error');
            END IF;
        END IF;
        IF TG_OP = 'UPDATE' AND COALESCE(NEW.refund_amount, 0) > COALESCE(OLD.refund_amount, 0) + 0.004 THEN
            PERFORM public.fn_pos_post_refund(NEW.id, COALESCE(NEW.refund_amount, 0) - COALESCE(OLD.refund_amount, 0));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- never block a payment/refund because of accounting: log and carry on
        INSERT INTO public.pos_gl_failures (kind, ref_id, error)
        VALUES (CASE WHEN TG_OP = 'UPDATE' AND COALESCE(NEW.refund_amount, 0) > COALESCE(OLD.refund_amount, 0) THEN 'refund' ELSE 'sale' END,
                NEW.id, SQLERRM);
        RAISE WARNING 'POS GL posting failed for order %: %', NEW.id, SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_gl_order_upd ON public.orders;
CREATE CONSTRAINT TRIGGER trg_pos_gl_order_upd
AFTER UPDATE OF payment_status, refund_amount ON public.orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_pos_gl_order();

DROP TRIGGER IF EXISTS trg_pos_gl_order_ins ON public.orders;
CREATE CONSTRAINT TRIGGER trg_pos_gl_order_ins
AFTER INSERT ON public.orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW.payment_status = 'paid')
EXECUTE FUNCTION public.trg_fn_pos_gl_order();

CREATE OR REPLACE FUNCTION public.trg_fn_pos_gl_shift()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    BEGIN
        PERFORM public.fn_pos_post_shift_variance(NEW.id);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.pos_gl_failures (kind, ref_id, error) VALUES ('shift', NEW.id, SQLERRM);
        RAISE WARNING 'POS GL shift variance failed for %: %', NEW.id, SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_gl_shift ON public.pos_shifts;
CREATE TRIGGER trg_pos_gl_shift
AFTER UPDATE OF status ON public.pos_shifts
FOR EACH ROW WHEN (NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed')
EXECUTE FUNCTION public.trg_fn_pos_gl_shift();

-- ── 7b. POS: attach a registered customer to an order (needed for CREDIT) ─
CREATE OR REPLACE FUNCTION public.fn_pos_set_order_customer(p_order_id UUID, p_customer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    o public.orders%ROWTYPE;
    c public.customers%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR NOT (public.auth_has_role('cashier') OR public.is_admin() OR public.is_manager()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only cashier, manager or admin can do this.');
    END IF;
    SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found.'); END IF;
    IF NOT public.is_admin() AND NOT (o.branch_id = ANY(public.auth_branch_ids())) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You do not have access to this branch.');
    END IF;
    IF o.payment_status = 'paid' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is already paid.');
    END IF;
    SELECT * INTO c FROM public.customers WHERE id = p_customer_id AND deleted_at IS NULL AND COALESCE(is_active, true);
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Customer not found or inactive.'); END IF;
    UPDATE public.orders
       SET customer_id = c.id,
           customer_name = COALESCE(NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''), customer_name),
           customer_phone = COALESCE(c.phone, customer_phone),
           updated_at = now()
     WHERE id = o.id;
    UPDATE public.invoices SET customer_id = c.id WHERE order_id = o.id;
    RETURN jsonb_build_object('success', true, 'customer_id', c.id, 'credit_limit', c.credit_limit,
        'open_balance', (SELECT COALESCE(SUM(total_amount - paid_amount), 0) FROM public.customer_receivables
                          WHERE customer_id = c.id AND status IN ('outstanding', 'partial', 'overdue')));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_pos_set_order_customer(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pos_set_order_customer(UUID, UUID) TO authenticated;

-- ── 9. SPLIT tenders (cash / card / visa / master / qr / bank / credit) ────
-- Before: a split was paid as ONE 'split' payment — payments fell back to
-- 'Cash' for the whole bill and the shift counted it all as drawer cash
-- (card share → false cash shortage; no credit option). Now each tender is
-- stored, booked to its own account (fn_pos_post_sale prefers tenders) and
-- recorded on the shift per method.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN ('pos_split_pay', 'fn_pos_cash_payout')
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

CREATE FUNCTION public.pos_split_pay(p_order_id UUID, p_tenders JSONB, p_shift_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    o       public.orders%ROWTYPE;
    t       JSONB;
    v_m     TEXT;
    v_amt   NUMERIC;
    v_sum   NUMERIC := 0;
    v_n     INT := 0;
    v_pay   JSONB;
    v_shift JSONB;
    r       RECORD;
BEGIN
    IF auth.uid() IS NULL OR NOT (public.auth_has_role('cashier') OR public.is_admin() OR public.is_manager()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role. Requires cashier/admin/manager.');
    END IF;
    SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found.'); END IF;
    IF o.payment_status = 'paid' THEN
        RETURN jsonb_build_object('success', true, 'already_paid', true, 'order_id', o.id);
    END IF;
    IF p_tenders IS NULL OR jsonb_typeof(p_tenders) <> 'array' OR jsonb_array_length(p_tenders) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Add at least one tender.');
    END IF;

    DELETE FROM public.pos_order_tenders WHERE order_id = o.id;   -- re-try of an unpaid order
    FOR t IN SELECT * FROM jsonb_array_elements(p_tenders) LOOP
        v_m := lower(TRIM(COALESCE(t ->> 'method', '')));
        v_m := CASE v_m WHEN 'online' THEN 'qr' WHEN 'credit card' THEN 'card' WHEN 'credit_card' THEN 'card'
                        WHEN 'mastercard' THEN 'master' WHEN 'transfer' THEN 'bank' WHEN 'bank_transfer' THEN 'bank' ELSE v_m END;
        IF v_m NOT IN ('cash', 'card', 'visa', 'master', 'qr', 'bank', 'credit') THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: unknown tender "%"', t ->> 'method';
        END IF;
        v_amt := ROUND(COALESCE(NULLIF(t ->> 'amount', '')::NUMERIC, 0), 2);
        CONTINUE WHEN v_amt = 0;
        IF v_amt < 0 THEN RAISE EXCEPTION 'VALIDATION_ERROR: tender amounts must be positive'; END IF;
        IF v_m = 'credit' AND o.customer_id IS NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: a CREDIT tender needs a registered customer on the order';
        END IF;
        INSERT INTO public.pos_order_tenders (order_id, method, amount, created_by) VALUES (o.id, v_m, v_amt, auth.uid());
        v_sum := v_sum + v_amt;
        v_n := v_n + 1;
    END LOOP;

    IF ABS(v_sum - ROUND(COALESCE(o.total_amount, 0), 2)) > 0.01 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: tenders % do not equal the bill total %', v_sum, o.total_amount;
    END IF;

    -- Same pipeline as a normal POS payment (accept → ready → paid, stock, events)
    v_pay := public.pos_quick_pay(o.id, CASE WHEN v_n = 1 THEN (SELECT method FROM public.pos_order_tenders WHERE order_id = o.id) ELSE 'split' END, o.total_amount);
    IF NOT COALESCE((v_pay ->> 'success')::BOOLEAN, false) THEN
        RAISE EXCEPTION '%', COALESCE(v_pay ->> 'error', 'Payment failed');
    END IF;

    -- Shift totals per tender (drawer cash = cash tender only)
    IF p_shift_id IS NOT NULL THEN
        FOR r IN SELECT method, SUM(amount) AS amt FROM public.pos_order_tenders WHERE order_id = o.id GROUP BY method LOOP
            v_shift := public.pos_record_shift_payment(p_shift_id, o.id, r.method, r.amt);
            IF NOT COALESCE((v_shift ->> 'success')::BOOLEAN, false) THEN
                RAISE EXCEPTION 'Shift: %', COALESCE(v_shift ->> 'error', 'could not record payment');
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true, 'order_id', o.id, 'tenders', v_n, 'total', v_sum, 'payment', v_pay);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_split_pay(UUID, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_split_pay(UUID, JSONB, UUID) TO authenticated;

-- ── 10. Drawer payouts (cash_out) → expense ────────────────────────────────
-- cash_in (float top-up) and cash_drop (drawer → safe) move cash inside the
-- same MAIN CASH ledger: no GL entry. A cash_out pays something out of the
-- drawer: Dr the chosen expense ledger (default 7042) / Cr MAIN CASH.
ALTER TABLE public.pos_shift_cash_movements ADD COLUMN IF NOT EXISTS expense_ledger_id UUID REFERENCES public.finance_ledgers(id);

CREATE OR REPLACE FUNCTION public.fn_pos_post_payout(p_movement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    m     RECORD;
    v_co  UUID;
    v_exp UUID;
    v_t   RECORD;
    v_desc TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries WHERE source_type = 'pos_payout' AND source_id = p_movement_id) THEN
        RETURN jsonb_build_object('success', true, 'already_posted', true);
    END IF;
    SELECT cm.*, s.branch_id INTO m
      FROM public.pos_shift_cash_movements cm JOIN public.pos_shifts s ON s.id = cm.shift_id
     WHERE cm.id = p_movement_id;
    IF NOT FOUND OR m.type <> 'cash_out' OR COALESCE(m.amount, 0) <= 0 THEN
        RETURN jsonb_build_object('success', true, 'skipped', 'not a payout');
    END IF;
    SELECT company_id INTO v_co FROM public.branches WHERE id = m.branch_id;
    v_exp := COALESCE(m.expense_ledger_id, public.fn_fin_ledger_by_code(v_co, '7042', 'Miscellaneous Expense'));
    SELECT * INTO v_t FROM public.fn_pos_bucket_target(v_co, 'cash');
    v_desc := 'POS drawer payout — shift ' || left(m.shift_id::TEXT, 8) || COALESCE(' — ' || NULLIF(m.reason, ''), '');
    PERFORM public.fn_fin_post_leg(v_co, m.branch_id, 'pos_payout', m.id, m.created_at::DATE, v_exp, NULL, v_desc, m.amount, 0);
    PERFORM public.fn_fin_post_leg(v_co, m.branch_id, 'pos_payout', m.id, m.created_at::DATE, v_t.ledger_id, v_t.account_id, v_desc, 0, m.amount);
    RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_pos_post_payout(UUID) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.fn_pos_cash_payout(p_shift_id UUID, p_amount NUMERIC, p_reason TEXT,
                                          p_expense_ledger_id UUID DEFAULT NULL, p_approved_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_res JSONB;
    v_mid UUID;
BEGIN
    IF p_expense_ledger_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.finance_ledgers WHERE id = p_expense_ledger_id AND ledger_type = 'expense' AND deleted_at IS NULL) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pick an expense ledger for the payout.');
    END IF;
    -- pos_cash_movement keeps its own role / shift-ownership checks and totals
    v_res := public.pos_cash_movement(p_shift_id, 'cash_out', p_amount, p_reason, p_approved_by);
    IF NOT COALESCE((v_res ->> 'success')::BOOLEAN, false) THEN
        RETURN v_res;
    END IF;
    SELECT id INTO v_mid FROM public.pos_shift_cash_movements
     WHERE shift_id = p_shift_id AND type = 'cash_out' AND created_at = now()
     ORDER BY id DESC LIMIT 1;
    IF v_mid IS NOT NULL THEN
        UPDATE public.pos_shift_cash_movements SET expense_ledger_id = p_expense_ledger_id WHERE id = v_mid;
        PERFORM public.fn_pos_post_payout(v_mid);
    END IF;
    RETURN v_res || jsonb_build_object('movement_id', v_mid, 'gl_posted', v_mid IS NOT NULL);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_pos_cash_payout(UUID, NUMERIC, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pos_cash_payout(UUID, NUMERIC, TEXT, UUID, UUID) TO authenticated;

-- Older clients still call pos_cash_movement('cash_out') directly: post those
-- at COMMIT with the default ledger (no-op when fn_pos_cash_payout already did).
CREATE OR REPLACE FUNCTION public.trg_fn_pos_gl_payout()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    BEGIN
        PERFORM public.fn_pos_post_payout(NEW.id);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.pos_gl_failures (kind, ref_id, error) VALUES ('payout', NEW.id, SQLERRM);
        RAISE WARNING 'POS payout GL failed for %: %', NEW.id, SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_gl_payout ON public.pos_shift_cash_movements;
CREATE CONSTRAINT TRIGGER trg_pos_gl_payout
AFTER INSERT ON public.pos_shift_cash_movements
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW.type = 'cash_out')
EXECUTE FUNCTION public.trg_fn_pos_gl_payout();

-- ── 8. Catch-up (admin/finance): post paid orders that have no GL yet ─────
CREATE OR REPLACE FUNCTION public.fn_pos_post_unposted_sales(p_from DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    r     RECORD;
    v_ok  INT := 0;
    v_bad INT := 0;
    v_res JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT (public.is_admin() OR public.auth_has_role('finance')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only admin or finance can run this.');
    END IF;
    FOR r IN
        SELECT o.id FROM public.orders o
         WHERE o.payment_status IN ('paid', 'partially_refunded', 'refunded')
           AND (p_from IS NULL OR COALESCE(o.paid_at, o.updated_at)::DATE >= p_from)
           AND NOT EXISTS (SELECT 1 FROM public.finance_cashbook_entries c WHERE c.source_type = 'pos_sale' AND c.source_id = o.id)
         ORDER BY COALESCE(o.paid_at, o.updated_at)
    LOOP
        BEGIN
            v_res := public.fn_pos_post_sale(r.id);
            IF COALESCE((v_res ->> 'success')::BOOLEAN, false) THEN v_ok := v_ok + 1;
            ELSE v_bad := v_bad + 1; INSERT INTO public.pos_gl_failures (kind, ref_id, error) VALUES ('sale', r.id, v_res ->> 'error'); END IF;
        EXCEPTION WHEN OTHERS THEN
            v_bad := v_bad + 1;
            INSERT INTO public.pos_gl_failures (kind, ref_id, error) VALUES ('sale', r.id, SQLERRM);
        END;
    END LOOP;
    UPDATE public.pos_gl_failures f SET resolved = true
     WHERE NOT f.resolved AND f.kind = 'sale'
       AND EXISTS (SELECT 1 FROM public.finance_cashbook_entries c WHERE c.source_type = 'pos_sale' AND c.source_id = f.ref_id);
    RETURN jsonb_build_object('success', true, 'posted', v_ok, 'failed', v_bad);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_pos_post_sale(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pos_post_refund(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pos_post_shift_variance(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pos_bucket_target(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pos_post_unposted_sales(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pos_post_unposted_sales(DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Read-only check after applying ─────────────────────────────────────────
--   SELECT tgname, tgrelid::regclass FROM pg_trigger
--    WHERE tgname IN ('trg_pos_gl_order_upd','trg_pos_gl_order_ins','trg_pos_gl_shift');   -- 3 rows
--   SELECT ledger_code, ledger_name FROM finance_ledgers WHERE ledger_code = '1021';         -- 1 row
