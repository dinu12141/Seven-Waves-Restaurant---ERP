-- ═══════════════════════════════════════════════════════════════════════════
-- #146 — Server fixes from the full Finance audit (2026-10-28)
--
--   1. Ledger current_balance drift (5000 Sales stored +318,520, postings say
--      −318,520). Recompute every drifting ledger (#122 rule).
--   2. Unused, mis-linked records: account "Main Cash office" sits on ledger
--      12000 "Director Drawaings" (equity in Assets-Current, duplicate of 3101).
--      0 postings, 0 vouchers → soft-delete both (guarded).
--   3. Payroll posting date: _hr_fin_post_line stamped CURRENT_DATE, so the
--      September payroll posted in October lands in October's P&L. New RPC
--      fn_post_payroll_run(run, account, method, posting_date) posts on the
--      run's period end (or the date given) and treats payment_status='held'
--      slips as held.
--   4. Voucher workflow guard (DB-level, not only the client): approve only
--      from 'submitted' by admin/finance (no self-approval except admin);
--      a voucher can only be 'posted' if its GL legs exist at COMMIT and
--      'cancelled' after posting only with reversal legs.
--   5. Cheque guard: an ISSUED cheque linked to a still-posted supplier
--      payment / voucher cannot be set 'cancelled' (GL would stay); cleared
--      only from issued.
--   6. POS catch-up also posts missed shift variances and drawer payouts.
--
-- The Supabase SQL editor commits statement by statement; every part is
-- idempotent. Run the whole file once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Ledger balance recompute ────────────────────────────────────────────
DO $$
DECLARE v_n INT;
BEGIN
    WITH fixed AS (
        UPDATE public.finance_ledgers fl
           SET current_balance = x.recomputed, updated_at = now()
          FROM (SELECT l.id,
                       CASE WHEN l.opening_balance_type = 'credit' THEN -1 ELSE 1 END * COALESCE(l.opening_balance, 0)
                       + COALESCE((SELECT SUM(c.debit_amount - c.credit_amount) FROM public.finance_cashbook_entries c
                                    WHERE c.ledger_id = l.id), 0) AS recomputed
                  FROM public.finance_ledgers l WHERE l.deleted_at IS NULL) x
         WHERE fl.id = x.id AND ABS(COALESCE(fl.current_balance, 0) - x.recomputed) > 0.01
        RETURNING fl.ledger_code)
    SELECT COUNT(*) INTO v_n FROM fixed;
    RAISE NOTICE '#146-1: % ledger balance(s) recomputed.', v_n;
END $$;

-- ── 2. Unused mis-linked account + duplicate ledger 12000 ──────────────────
DO $$
DECLARE
    v_led UUID;
    v_acc UUID;
BEGIN
    SELECT id INTO v_led FROM public.finance_ledgers
     WHERE ledger_code = '12000' AND deleted_at IS NULL AND ledger_type = 'equity';
    IF v_led IS NULL THEN RETURN; END IF;
    IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries WHERE ledger_id = v_led)
       OR EXISTS (SELECT 1 FROM public.finance_vouchers WHERE ledger_id = v_led) THEN
        RAISE NOTICE '#146-2: ledger 12000 has postings — left as is (fix its account group instead).';
        RETURN;
    END IF;
    FOR v_acc IN SELECT id FROM public.finance_accounts WHERE ledger_id = v_led AND deleted_at IS NULL LOOP
        IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries WHERE account_id = v_acc)
           OR EXISTS (SELECT 1 FROM public.finance_vouchers WHERE account_id = v_acc OR bank_id = v_acc) THEN
            RAISE NOTICE '#146-2: account % is used — left as is.', v_acc;
            RETURN;
        END IF;
        UPDATE public.finance_accounts SET is_active = false, deleted_at = now(), updated_at = now() WHERE id = v_acc;
    END LOOP;
    UPDATE public.finance_ledgers SET is_active = false, deleted_at = now(), updated_at = now() WHERE id = v_led;
    RAISE NOTICE '#146-2: unused ledger 12000 and its unused account(s) deactivated.';
END $$;

-- ── 3. Payroll posting date + held slips ───────────────────────────────────
CREATE OR REPLACE FUNCTION public._hr_fin_post_line(
    p_company_id  UUID,
    p_branch_id   UUID,
    p_source_type TEXT,
    p_source_id   UUID,
    p_ledger_id   UUID,
    p_account_id  UUID,
    p_description TEXT,
    p_debit       NUMERIC,
    p_credit      NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- #146: fn_post_payroll_run sets the accounting date for this transaction
    v_date DATE := COALESCE(NULLIF(current_setting('app.payroll_posting_date', true), '')::DATE, CURRENT_DATE);
BEGIN
    p_debit  := ROUND(COALESCE(p_debit, 0), 2);
    p_credit := ROUND(COALESCE(p_credit, 0), 2);
    IF p_debit < 0 OR p_credit < 0 THEN
        RAISE EXCEPTION 'Negative posting amount for ledger % (Dr %, Cr %).', p_ledger_id, p_debit, p_credit;
    END IF;
    IF p_debit = 0 AND p_credit = 0 THEN
        RETURN;
    END IF;

    INSERT INTO public.finance_cashbook_entries (
        company_id, branch_id, source_type, source_id, entry_date,
        ledger_id, account_id, description, debit_amount, credit_amount, running_balance
    ) VALUES (
        p_company_id, p_branch_id, p_source_type, p_source_id, v_date,
        p_ledger_id, p_account_id, p_description, p_debit, p_credit, 0
    );

    UPDATE public.finance_ledgers
       SET current_balance = COALESCE(current_balance, 0) + p_debit - p_credit,
           updated_at = now()
     WHERE id = p_ledger_id;
END;
$$;
REVOKE ALL ON FUNCTION public._hr_fin_post_line(UUID, UUID, TEXT, UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'fn_post_payroll_run'
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

CREATE FUNCTION public.fn_post_payroll_run(
    p_payroll_run_id       UUID,
    p_cash_bank_account_id UUID,
    p_payment_method       TEXT DEFAULT 'bank_transfer',
    p_posting_date         DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_run  RECORD;
    v_date DATE;
    v_res  JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT (public.is_admin() OR public.auth_has_role('hr') OR public.auth_has_role('finance')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only Admin, HR or Finance can post payroll to finance.');
    END IF;
    SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_payroll_run_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payroll run not found.');
    END IF;
    v_date := COALESCE(p_posting_date, (to_jsonb(v_run) ->> 'period_end')::DATE, CURRENT_DATE);

    -- A slip marked held by payment_status must not be paid out
    UPDATE public.payslips
       SET is_held = true
     WHERE payroll_run_id = p_payroll_run_id
       AND COALESCE(payment_status, '') = 'held'
       AND COALESCE(is_held, false) = false
       AND finance_posted_at IS NULL;

    PERFORM set_config('app.payroll_posting_date', v_date::TEXT, true);
    v_res := public.post_payroll_to_finance_v2(p_payroll_run_id, p_cash_bank_account_id, p_payment_method, auth.uid());
    PERFORM set_config('app.payroll_posting_date', '', true);
    RETURN COALESCE(v_res, '{}'::JSONB) || jsonb_build_object('posting_date', v_date);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_post_payroll_run(UUID, UUID, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_post_payroll_run(UUID, UUID, TEXT, DATE) TO authenticated;

-- ── 4. Voucher workflow guard ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_voucher_status_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;
    -- server RPCs (post / cancel) run as definer without a JWT role check here;
    -- the rules below only concern who may approve and from which state.
    IF NEW.status = 'approved' THEN
        IF OLD.status <> 'submitted' THEN
            RAISE EXCEPTION 'VOUCHER_WORKFLOW: % can only be approved after it is submitted (now %).', OLD.voucher_no, OLD.status;
        END IF;
        IF auth.uid() IS NOT NULL THEN
            IF NOT (public.is_admin() OR public.auth_has_role('finance')) THEN
                RAISE EXCEPTION 'VOUCHER_WORKFLOW: only admin or finance can approve vouchers.';
            END IF;
            IF NOT public.is_admin() AND to_jsonb(OLD) ->> 'created_by' = auth.uid()::TEXT THEN
                RAISE EXCEPTION 'VOUCHER_WORKFLOW: you cannot approve your own voucher %.', OLD.voucher_no;
            END IF;
        END IF;
    ELSIF NEW.status = 'submitted' AND OLD.status NOT IN ('draft', 'rejected') THEN
        RAISE EXCEPTION 'VOUCHER_WORKFLOW: % cannot be submitted from %.', OLD.voucher_no, OLD.status;
    ELSIF NEW.status = 'rejected' AND OLD.status <> 'submitted' THEN
        RAISE EXCEPTION 'VOUCHER_WORKFLOW: % cannot be rejected from %.', OLD.voucher_no, OLD.status;
    ELSIF NEW.status = 'posted' AND OLD.status NOT IN ('approved') THEN
        RAISE EXCEPTION 'VOUCHER_WORKFLOW: % must be approved before posting (now %).', OLD.voucher_no, OLD.status;
    ELSIF OLD.status = 'posted' AND NEW.status NOT IN ('cancelled') THEN
        RAISE EXCEPTION 'VOUCHER_WORKFLOW: posted voucher % can only be cancelled (with reversal).', OLD.voucher_no;
    ELSIF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'VOUCHER_WORKFLOW: voucher % is cancelled.', OLD.voucher_no;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a_voucher_status_guard ON public.finance_vouchers;
CREATE TRIGGER trg_a_voucher_status_guard
BEFORE UPDATE OF status ON public.finance_vouchers
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_voucher_status_guard();

-- At COMMIT: a voucher that became posted must have GL legs; a posted voucher
-- that became cancelled must have reversal legs (no "status-only" posting).
CREATE OR REPLACE FUNCTION public.trg_fn_voucher_gl_check()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    v_src TEXT;
    v_now public.finance_vouchers%ROWTYPE;
BEGIN
    SELECT * INTO v_now FROM public.finance_vouchers WHERE id = NEW.id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_src := CASE WHEN v_now.voucher_type = 'pay' THEN 'pay_voucher' ELSE 'received_voucher' END;
    IF v_now.status = 'posted' AND NOT EXISTS (
        SELECT 1 FROM public.finance_cashbook_entries WHERE source_type = v_src AND source_id = v_now.id) THEN
        RAISE EXCEPTION 'VOUCHER_GL: % was marked posted without GL entries — use Post (post_finance_voucher).', v_now.voucher_no;
    END IF;
    IF v_now.status = 'cancelled' AND OLD.status = 'posted'
       AND EXISTS (SELECT 1 FROM public.finance_cashbook_entries WHERE source_type = v_src AND source_id = v_now.id
                                                                     AND description NOT LIKE 'REVERSAL%')
       AND NOT EXISTS (SELECT 1 FROM public.finance_cashbook_entries
                        WHERE source_id = v_now.id AND description LIKE 'REVERSAL%')
       AND NOT EXISTS (SELECT 1 FROM public.finance_cashbook_entries c JOIN public.finance_cheques ch ON ch.id = c.source_id
                        WHERE ch.voucher_id = v_now.id AND c.source_type = 'cheque_bounced') THEN
        RAISE EXCEPTION 'VOUCHER_GL: % was cancelled without reversing its GL entries — use Cancel (cancel_finance_voucher).', v_now.voucher_no;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_z_voucher_gl_check ON public.finance_vouchers;
CREATE CONSTRAINT TRIGGER trg_z_voucher_gl_check
AFTER UPDATE OF status ON public.finance_vouchers
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW.status IN ('posted', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.trg_fn_voucher_gl_check();

-- ── 5. Cheque status guard ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_cheque_status_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;
    IF NEW.status = 'cancelled' AND OLD.status = 'issued' THEN
        IF NEW.supplier_payment_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.supplier_payments WHERE id = NEW.supplier_payment_id AND status = 'posted') THEN
            RAISE EXCEPTION 'CHEQUE: % belongs to a posted supplier payment — cancel the payment or mark the cheque bounced.', OLD.cheque_no;
        END IF;
        IF NEW.voucher_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.finance_vouchers WHERE id = NEW.voucher_id AND status = 'posted') THEN
            RAISE EXCEPTION 'CHEQUE: % belongs to a posted voucher — cancel the voucher or mark the cheque bounced.', OLD.cheque_no;
        END IF;
    END IF;
    IF NEW.status = 'cleared' AND OLD.status <> 'issued' THEN
        RAISE EXCEPTION 'CHEQUE: only an issued cheque can be cleared (% is %).', OLD.cheque_no, OLD.status;
    END IF;
    IF OLD.status IN ('cleared', 'bounced', 'cancelled') AND NEW.status NOT IN ('bounced') THEN
        RAISE EXCEPTION 'CHEQUE: % is % and cannot change to %.', OLD.cheque_no, OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a_cheque_status_guard ON public.finance_cheques;
CREATE TRIGGER trg_a_cheque_status_guard
BEFORE UPDATE OF status ON public.finance_cheques
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_cheque_status_guard();

-- ── 6. POS catch-up: also shift variances and drawer payouts ───────────────
CREATE OR REPLACE FUNCTION public.fn_pos_post_unposted_sales(p_from DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    r       RECORD;
    v_ok    INT := 0;
    v_bad   INT := 0;
    v_shift INT := 0;
    v_pay   INT := 0;
    v_res   JSONB;
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

    FOR r IN
        SELECT s.id FROM public.pos_shifts s
         WHERE s.status = 'closed' AND COALESCE(s.variance, 0) <> 0
           AND (p_from IS NULL OR COALESCE(s.closed_at, s.updated_at)::DATE >= p_from)
           AND NOT EXISTS (SELECT 1 FROM public.finance_cashbook_entries c WHERE c.source_type = 'pos_shift' AND c.source_id = s.id)
    LOOP
        BEGIN
            PERFORM public.fn_pos_post_shift_variance(r.id);
            v_shift := v_shift + 1;
        EXCEPTION WHEN OTHERS THEN
            v_bad := v_bad + 1;
            INSERT INTO public.pos_gl_failures (kind, ref_id, error) VALUES ('shift', r.id, SQLERRM);
        END;
    END LOOP;

    FOR r IN
        SELECT m.id FROM public.pos_shift_cash_movements m
         WHERE m.type = 'cash_out' AND COALESCE(m.amount, 0) > 0
           AND (p_from IS NULL OR m.created_at::DATE >= p_from)
           AND NOT EXISTS (SELECT 1 FROM public.finance_cashbook_entries c WHERE c.source_type = 'pos_payout' AND c.source_id = m.id)
    LOOP
        BEGIN
            PERFORM public.fn_pos_post_payout(r.id);
            v_pay := v_pay + 1;
        EXCEPTION WHEN OTHERS THEN
            v_bad := v_bad + 1;
            INSERT INTO public.pos_gl_failures (kind, ref_id, error) VALUES ('payout', r.id, SQLERRM);
        END;
    END LOOP;

    UPDATE public.pos_gl_failures f SET resolved = true
     WHERE NOT f.resolved
       AND EXISTS (SELECT 1 FROM public.finance_cashbook_entries c
                    WHERE c.source_id = f.ref_id
                      AND c.source_type = CASE f.kind WHEN 'sale' THEN 'pos_sale' WHEN 'refund' THEN 'pos_refund'
                                                      WHEN 'shift' THEN 'pos_shift' WHEN 'payout' THEN 'pos_payout' END);
    RETURN jsonb_build_object('success', true, 'posted', v_ok, 'shifts', v_shift, 'payouts', v_pay, 'failed', v_bad);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_pos_post_unposted_sales(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pos_post_unposted_sales(DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Read-only checks after applying ────────────────────────────────────────
--   SELECT ledger_code, current_balance FROM finance_ledgers WHERE ledger_code IN ('5000','12000');
--   SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_a_voucher_status_guard','trg_z_voucher_gl_check','trg_a_cheque_status_guard');

-- ── 7. Uniqueness: one live ledger per code, one live account per ledger ───
-- (live check 2026-10-28: no duplicates; ledger 12000's unused account is
--  removed by part 2 above.)
DO $$
BEGIN
    IF NOT EXISTS (SELECT ledger_code FROM public.finance_ledgers WHERE deleted_at IS NULL
                    GROUP BY company_id, ledger_code HAVING COUNT(*) > 1) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_ledgers_code_live
            ON public.finance_ledgers (company_id, ledger_code) WHERE deleted_at IS NULL;
    ELSE
        RAISE NOTICE '#146-7: duplicate live ledger codes exist — unique index skipped.';
    END IF;
    IF NOT EXISTS (SELECT ledger_id FROM public.finance_accounts WHERE deleted_at IS NULL AND ledger_id IS NOT NULL
                    GROUP BY ledger_id HAVING COUNT(*) > 1) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_accounts_ledger_live
            ON public.finance_accounts (ledger_id) WHERE deleted_at IS NULL AND ledger_id IS NOT NULL;
    ELSE
        RAISE NOTICE '#146-7: a ledger has several live accounts — unique index skipped.';
    END IF;
END $$;
