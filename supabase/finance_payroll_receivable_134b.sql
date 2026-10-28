-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE #134b — Staff Receivable (1004) integrity + Full & Final posting
-- Seven Waves Restaurant ERP                                   (NOT yet applied)
--
-- Apply order: #128 → #129 → #131 → #132 → #133 → #135 → #137 → #138 → #134 → #134b → #134c → #136 → #139
-- Requires #129 (payslips.finance_posted_at, _hr_fin_ledger, _hr_fin_post_line)
-- and #135 (payroll_recovery_log). Checked below.
--
-- FINDING #6 — decision
--   post_payroll_to_finance_v2 (#129) credits 1004 Staff Receivable with every
--   advance / loan recovered through payroll, but only employee_advances paid
--   via disburse_employee_advance were ever debited to 1004. salary_advances
--   and employee_loans had no disbursement posting at all, and
--   EmployeeFinancesPage could approve an employee_advance with no account
--   ("payroll deduction only"). Result: 1004 goes negative / receivable
--   recovered that was never recognised.
--
--   Treatment chosen: a receivable exists only once cash has left the
--   business. DISBURSEMENT IS REQUIRED BEFORE AN ADVANCE / LOAN CAN BECOME
--   RECOVERABLE. Recoveries keep crediting 1004 (correct, because the debit
--   now always exists). Enforced in the DB, not only in the UI:
--     1. disburse_staff_receivable(source, id, account) — Dr 1004 / Cr cash-bank
--        for salary_advances, employee_loans and employee_advances (the last
--        also for legacy rows already deducted by payroll → repair path).
--        Marker: finance_cashbook_entries source_type 'salary_advance',
--        source_id = the advance/loan id (no new CHECK value needed).
--     2. Gate trigger on the three tables: a row can only become
--        recoverable (employee_advances approved/deducted, salary_advances /
--        employee_loans active) once disbursed; a disbursed row cannot be
--        deleted, re-amounted or moved back to pending/rejected. salary_advances
--        gets a 'pending' status (new default) — process_monthly_payroll only
--        recovers 'active' rows, so un-disbursed advances are simply not
--        deducted.
--     3. Write-off: salary_advances → written_off, employee_loans → cancelled /
--        defaulted with an outstanding disbursed balance posts
--        Dr 7000 Salaries & Wages / Cr 1004 for the remainder (forgiven
--        balance = staff cost; see report — user may prefer a bad-debt ledger).
--     4. Payslip guard: when post_payroll_to_finance_v2 stamps
--        payslips.finance_posted_at, every recovery behind that slip
--        (employee_advances linked to the run + payroll_recovery_log rows)
--        must be disbursed, and advance+loan deductions must not exceed the
--        traced recoveries. Otherwise RAISE → the whole v2 posting rolls back.
--   Full & Final settlements had no finance posting:
--     5. post_final_settlement_to_finance(settlement_id, account):
--        Dr 7000 (pro-rata + leave encashment + other earnings + gratuity)
--        Cr 1004 (advance + loan recovery — must equal the employee's
--               outstanding DISBURSED receivable, else RAISE)
--        Cr 2009 (other deductions)  Cr cash-bank (net)
--        closes the recovered advances/loans and marks the settlement 'paid'.
--        Guard: a settlement cannot be set 'paid' without this posting.
--        (resignation_settlements is not live yet — that section is skipped
--         with a NOTICE when the table is missing; re-run after HR creates it.)
--
-- Frontend changes required (HR owns these files — NOT edited here):
--   • src/pages/hr/EmployeeFinancesPage.vue confirmApproveAdvance() ~1138-1140:
--     remove the "No account selected → approve as payroll deduction only"
--     branch; require disburseAccount (disable the OK button until chosen).
--     The plain updateStatus(..., 'approved') will now be rejected by the DB.
--     deleteRecord() ~1186: hide Delete for approved/deducted advances.
--   • src/pages/hr/EmployeesPage.vue addAdvance() ~5266: insert (status
--     defaults to 'pending'), then call rpc('disburse_staff_receivable',
--     { p_source:'salary_advance', p_source_id:<new id>, p_cash_bank_account_id })
--     with an account picker.
--   • src/components/hr/LoansTab.vue saveLoan() ~227: inserts columns that do
--     not exist (remaining_amount, installments_paid; table has
--     remaining_balance) → insert always fails. Send remaining_balance, keep
--     status 'pending', then disburse via the RPC (p_source:'employee_loan').
--   • src/pages/admin/ApprovalsCenterPage.vue handleHRAction() ~897-905: loans
--     are set to status 'approved', which chk_loan_status does not allow.
--     Approve loans / advances through disburse_staff_receivable instead.
--   • src/pages/hr/ResignationPage.vue approveSettlement() ~712 sets
--     'approved' (fine); add a "Pay settlement" action calling
--     post_final_settlement_to_finance with an account picker.
--
-- Re-runnable. Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

SET LOCAL lock_timeout = '10s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Preconditions
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'payslips'
                      AND column_name = 'finance_posted_at') THEN
        RAISE EXCEPTION '#134b precondition: apply #129 first (payslips.finance_posted_at missing).';
    END IF;
    IF to_regprocedure('public._hr_fin_ledger(uuid,text,text)') IS NULL
       OR to_regprocedure('public._hr_fin_post_line(uuid,uuid,text,uuid,uuid,uuid,text,numeric,numeric)') IS NULL THEN
        RAISE EXCEPTION '#134b precondition: #129 helpers _hr_fin_ledger/_hr_fin_post_line missing.';
    END IF;
    IF to_regclass('public.payroll_recovery_log') IS NULL THEN
        RAISE EXCEPTION '#134b precondition: apply #135 first (payroll_recovery_log missing).';
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. salary_advances: 'pending' status (new default)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'public.salary_advances'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE public.salary_advances DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;
ALTER TABLE public.salary_advances ADD CONSTRAINT salary_advances_status_check
    CHECK (status IN ('pending', 'active', 'fully_recovered', 'written_off'));
ALTER TABLE public.salary_advances ALTER COLUMN status SET DEFAULT 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Helpers
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('fn_staff_rec_disbursed', '_fin_staff_rec_journal',
                             'disburse_staff_receivable', 'post_final_settlement_to_finance')
    LOOP
        EXECUTE format('DROP FUNCTION %s', r.sig);
    END LOOP;
END $$;

-- Was this advance / loan paid out through finance (Dr 1004)?
CREATE FUNCTION public.fn_staff_rec_disbursed(p_source_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.finance_cashbook_entries c
         WHERE c.source_type = 'salary_advance'
           AND c.source_id   = p_source_id
           AND c.debit_amount > 0
           AND c.description NOT LIKE 'REVERSAL%'
    );
$$;

-- Balanced journal header + lines (lines: [{code,dr,cr,memo}]), posted last so
-- validate_journal_balance enforces DR = CR (same pattern as #129).
CREATE FUNCTION public._fin_staff_rec_journal(
    p_company_id UUID, p_branch_id UUID, p_ref_id UUID, p_ref_type TEXT,
    p_desc TEXT, p_lines JSONB, p_user UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
    v_dr NUMERIC;
    v_cr NUMERIC;
BEGIN
    SELECT ROUND(SUM((l->>'dr')::NUMERIC), 2), ROUND(SUM((l->>'cr')::NUMERIC), 2)
      INTO v_dr, v_cr FROM jsonb_array_elements(p_lines) l;
    IF v_dr IS DISTINCT FROM v_cr THEN
        RAISE EXCEPTION 'Journal "%" does not balance: Dr % vs Cr %.', p_desc, v_dr, v_cr;
    END IF;

    INSERT INTO public.journal_entries (
        company_id, branch_id, doc_date, reference_id, reference_type,
        description, entry_type, total_dr, total_cr, is_posted
    ) VALUES (
        p_company_id, p_branch_id, CURRENT_DATE, p_ref_id, p_ref_type,
        p_desc, 'expense', v_dr, v_cr, false
    ) RETURNING id INTO v_id;

    INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, cr_amount, memo)
    SELECT v_id, l->>'code', ROUND((l->>'dr')::NUMERIC, 2), ROUND((l->>'cr')::NUMERIC, 2), l->>'memo'
      FROM jsonb_array_elements(p_lines) l
     WHERE ROUND((l->>'dr')::NUMERIC, 2) > 0 OR ROUND((l->>'cr')::NUMERIC, 2) > 0;

    UPDATE public.journal_entries
       SET is_posted = true, posted_at = now(), posted_by = p_user
     WHERE id = v_id;
    RETURN v_id;
END;
$$;

-- Resolve + validate the paying cash/bank account (company-scoped).
-- Inline in callers via this helper to keep one rule set.
DROP FUNCTION IF EXISTS public._fin_paying_account(uuid, uuid);
CREATE FUNCTION public._fin_paying_account(p_account_id UUID, p_company_id UUID)
RETURNS public.finance_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v public.finance_accounts;
BEGIN
    SELECT * INTO v FROM public.finance_accounts
     WHERE id = p_account_id AND deleted_at IS NULL
     FOR UPDATE;
    IF v.id IS NULL THEN
        RAISE EXCEPTION 'Account % is not a Finance cash/bank account (finance_accounts).', p_account_id;
    END IF;
    IF NOT COALESCE(v.is_active, false) THEN
        RAISE EXCEPTION 'Account % is inactive.', v.registered_name;
    END IF;
    IF v.company_id IS NOT NULL AND v.company_id <> p_company_id THEN
        RAISE EXCEPTION 'Account % belongs to a different company.', v.registered_name;
    END IF;
    IF v.ledger_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.finance_ledgers WHERE id = v.ledger_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Account % has no linked ledger.', v.registered_name;
    END IF;
    RETURN v;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. disburse_staff_receivable — Dr 1004 / Cr cash-bank
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.disburse_staff_receivable(
    p_source               TEXT,   -- 'salary_advance' | 'employee_loan' | 'employee_advance'
    p_source_id            UUID,
    p_cash_bank_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user     UUID := auth.uid();
    v_company  UUID;
    v_branch   UUID;
    v_emp      UUID;
    v_amount   NUMERIC;
    v_status   TEXT;
    v_label    TEXT;
    v_emp_name TEXT;
    v_account  public.finance_accounts;
    l_rec      public.finance_ledgers;
    l_cash     public.finance_ledgers;
    v_journal  UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.is_admin() OR public.auth_has_role('hr') OR public.auth_has_role('finance')) THEN
        RAISE EXCEPTION 'Only Admin, HR or Finance can disburse staff advances / loans.' USING ERRCODE = '42501';
    END IF;

    IF p_source = 'salary_advance' THEN
        SELECT company_id, branch_id, employee_id, amount, status
          INTO v_company, v_branch, v_emp, v_amount, v_status
          FROM public.salary_advances WHERE id = p_source_id FOR UPDATE;
        v_label := 'Salary Advance';
        IF FOUND AND v_status NOT IN ('pending', 'active') THEN
            RAISE EXCEPTION 'Salary advance cannot be disbursed: status is %.', v_status;
        END IF;
    ELSIF p_source = 'employee_loan' THEN
        SELECT company_id, branch_id, employee_id, loan_amount, status
          INTO v_company, v_branch, v_emp, v_amount, v_status
          FROM public.employee_loans WHERE id = p_source_id FOR UPDATE;
        v_label := 'Staff Loan';
        IF FOUND AND v_status NOT IN ('pending', 'active') THEN
            RAISE EXCEPTION 'Loan cannot be disbursed: status is %.', v_status;
        END IF;
    ELSIF p_source = 'employee_advance' THEN
        SELECT company_id, branch_id, employee_id, amount, status
          INTO v_company, v_branch, v_emp, v_amount, v_status
          FROM public.employee_advances WHERE id = p_source_id FOR UPDATE;
        v_label := 'Employee Advance';
        -- 'deducted' allowed: repair path for legacy advances recovered by
        -- payroll without ever being disbursed through finance.
        IF FOUND AND v_status NOT IN ('pending', 'approved', 'deducted') THEN
            RAISE EXCEPTION 'Advance cannot be disbursed: status is %.', v_status;
        END IF;
    ELSE
        RAISE EXCEPTION 'Unknown source %. Use salary_advance, employee_loan or employee_advance.', p_source;
    END IF;

    IF v_company IS NULL THEN
        RAISE EXCEPTION '% % not found.', v_label, p_source_id;
    END IF;
    IF public.fn_staff_rec_disbursed(p_source_id) THEN
        RAISE EXCEPTION '% has already been disbursed.', v_label;
    END IF;
    IF COALESCE(v_amount, 0) <= 0 THEN
        RAISE EXCEPTION '% amount must be positive.', v_label;
    END IF;

    v_account := public._fin_paying_account(p_cash_bank_account_id, v_company);
    l_rec := public._hr_fin_ledger(v_company, '1004', 'asset');
    SELECT * INTO l_cash FROM public.finance_ledgers WHERE id = v_account.ledger_id;

    SELECT COALESCE(full_name, employee_code, 'Employee') INTO v_emp_name FROM public.employees WHERE id = v_emp;
    v_emp_name := COALESCE(v_emp_name, 'Employee');

    PERFORM public._hr_fin_post_line(v_company, v_branch, 'salary_advance', p_source_id,
        l_rec.id, NULL, v_label || ' Disbursed — ' || v_emp_name, v_amount, 0);
    PERFORM public._hr_fin_post_line(v_company, v_branch, 'salary_advance', p_source_id,
        l_cash.id, v_account.id, v_label || ' Paid — ' || v_emp_name || ' (' || v_account.registered_name || ')', 0, v_amount);
    UPDATE public.finance_accounts
       SET current_balance = COALESCE(current_balance, 0) - ROUND(v_amount, 2), updated_at = now()
     WHERE id = v_account.id;

    v_journal := public._fin_staff_rec_journal(v_company, v_branch, p_source_id, 'salary_advance',
        v_label || ' — ' || v_emp_name,
        jsonb_build_array(
            jsonb_build_object('code', l_rec.ledger_code,  'dr', v_amount, 'cr', 0, 'memo', 'Staff Receivable — ' || v_emp_name),
            jsonb_build_object('code', l_cash.ledger_code, 'dr', 0, 'cr', v_amount, 'memo', v_label || ' paid from ' || v_account.registered_name)),
        v_user);

    -- Now recoverable (gate trigger sees the Dr 1004 row written above)
    IF p_source = 'salary_advance' AND v_status = 'pending' THEN
        UPDATE public.salary_advances
           SET status = 'active', approved_by = COALESCE(approved_by, v_user),
               approved_at = COALESCE(approved_at, now()), updated_at = now()
         WHERE id = p_source_id;
    ELSIF p_source = 'employee_loan' AND v_status = 'pending' THEN
        UPDATE public.employee_loans
           SET status = 'active', approved_by = COALESCE(approved_by, v_user),
               approved_at = COALESCE(approved_at, now()), updated_at = now()
         WHERE id = p_source_id;
    ELSIF p_source = 'employee_advance' AND v_status = 'pending' THEN
        UPDATE public.employee_advances
           SET status = 'approved', approved_by = COALESCE(approved_by, v_user),
               approved_at = COALESCE(approved_at, now()), updated_at = now()
         WHERE id = p_source_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'source', p_source, 'source_id', p_source_id,
                              'amount', v_amount, 'employee', v_emp_name,
                              'disbursed_from', v_account.registered_name, 'journal_entry_id', v_journal);
END;
$$;

COMMENT ON FUNCTION public.disburse_staff_receivable(text, uuid, uuid) IS
  '#134b: Dr 1004 Staff Receivable / Cr cash-bank for a salary_advance, employee_loan or employee_advance; makes it recoverable by payroll. Also the repair path for legacy deducted-but-never-disbursed employee_advances.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Gate + write-off trigger on the three receivable tables
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_staff_rec_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id        UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    v_disbursed BOOLEAN := public.fn_staff_rec_disbursed(CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END);
    v_old       TEXT := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.status END;
    v_new       TEXT := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.status END;
    v_live      TEXT[];   -- statuses that make the row recoverable / settled
    v_back      TEXT[];   -- statuses a disbursed row may not return to
    v_writeoff  NUMERIC := 0;
    l_rec       public.finance_ledgers;
    l_exp       public.finance_ledgers;
BEGIN
    IF TG_TABLE_NAME = 'employee_advances' THEN
        v_live := ARRAY['approved', 'deducted'];
        v_back := ARRAY['pending', 'rejected'];
    ELSE
        v_live := ARRAY['active', 'fully_recovered', 'written_off', 'completed', 'defaulted'];
        v_back := ARRAY['pending', 'cancelled'];
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF v_disbursed OR v_old = ANY (v_live) THEN
            RAISE EXCEPTION 'STAFF_RECEIVABLE_LOCKED: % % has been disbursed/recovered and cannot be deleted.', TG_TABLE_NAME, v_id;
        END IF;
        RETURN OLD;
    END IF;

    -- Becoming recoverable requires the Dr 1004 disbursement (writing off /
    -- defaulting a never-disbursed row is allowed: nothing to reverse).
    IF v_new = ANY (v_live) AND v_new NOT IN ('written_off', 'defaulted')
       AND (v_old IS NULL OR NOT (v_old = ANY (v_live)))
       AND NOT v_disbursed THEN
        RAISE EXCEPTION 'NOT_DISBURSED: % must be disbursed through Finance (disburse_staff_receivable / disburse_employee_advance) before it can be %.',
            TG_TABLE_NAME, v_new USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'UPDATE' AND v_disbursed THEN
        IF v_new = ANY (v_back) AND NOT (TG_TABLE_NAME = 'employee_loans' AND v_new = 'cancelled' AND v_old = 'active') THEN
            RAISE EXCEPTION 'STAFF_RECEIVABLE_LOCKED: % has been disbursed and cannot be set to %.', TG_TABLE_NAME, v_new;
        END IF;
        -- Separate statements: plpgsql resolves NEW.<field> per statement, and
        -- loan_amount / amount exist on different tables.
        IF TG_TABLE_NAME = 'employee_loans' THEN
            IF NEW.loan_amount IS DISTINCT FROM OLD.loan_amount THEN
                RAISE EXCEPTION 'STAFF_RECEIVABLE_LOCKED: the amount of a disbursed % cannot be changed.', TG_TABLE_NAME;
            END IF;
        ELSIF NEW.amount IS DISTINCT FROM OLD.amount THEN
            RAISE EXCEPTION 'STAFF_RECEIVABLE_LOCKED: the amount of a disbursed % cannot be changed.', TG_TABLE_NAME;
        END IF;

        -- Write-off of the outstanding disbursed balance: Dr 7000 / Cr 1004
        IF TG_TABLE_NAME = 'salary_advances' AND v_new = 'written_off' AND v_old = 'active' THEN
            v_writeoff := COALESCE(OLD.amount, 0) - COALESCE(OLD.recovered_amount, 0);
        ELSIF TG_TABLE_NAME = 'employee_loans' AND v_new IN ('cancelled', 'defaulted') AND v_old = 'active' THEN
            v_writeoff := COALESCE(OLD.remaining_balance, 0);
        END IF;

        IF v_writeoff > 0 THEN
            l_rec := public._hr_fin_ledger(NEW.company_id, '1004', 'asset');
            l_exp := public._hr_fin_ledger(NEW.company_id, '7000', 'expense');
            PERFORM public._hr_fin_post_line(NEW.company_id, NEW.branch_id, 'salary_advance', NEW.id,
                l_exp.id, NULL, 'Write-off of staff receivable (' || TG_TABLE_NAME || ' ' || v_new || ')', v_writeoff, 0);
            PERFORM public._hr_fin_post_line(NEW.company_id, NEW.branch_id, 'salary_advance', NEW.id,
                l_rec.id, NULL, 'Write-off of staff receivable (' || TG_TABLE_NAME || ' ' || v_new || ')', 0, v_writeoff);
            PERFORM public._fin_staff_rec_journal(NEW.company_id, NEW.branch_id, NEW.id, 'salary_advance',
                'Staff receivable write-off',
                jsonb_build_array(
                    jsonb_build_object('code', l_exp.ledger_code, 'dr', v_writeoff, 'cr', 0, 'memo', 'Forgiven staff advance/loan'),
                    jsonb_build_object('code', l_rec.ledger_code, 'dr', 0, 'cr', v_writeoff, 'memo', 'Staff Receivable written off')),
                auth.uid());
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_staff_rec_gate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_staff_rec_gate ON public.employee_advances;
CREATE TRIGGER trg_staff_rec_gate
BEFORE INSERT OR UPDATE OF status, amount OR DELETE ON public.employee_advances
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_staff_rec_gate();

DROP TRIGGER IF EXISTS trg_staff_rec_gate ON public.salary_advances;
CREATE TRIGGER trg_staff_rec_gate
BEFORE INSERT OR UPDATE OF status, amount OR DELETE ON public.salary_advances
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_staff_rec_gate();

DROP TRIGGER IF EXISTS trg_staff_rec_gate ON public.employee_loans;
CREATE TRIGGER trg_staff_rec_gate
BEFORE INSERT OR UPDATE OF status, loan_amount OR DELETE ON public.employee_loans
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_staff_rec_gate();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Payslip guard: every recovery credited to 1004 must trace to a disbursement
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_payslip_recovery_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_undisbursed INT;
    v_items       INT;
    v_traced      NUMERIC;
    v_claimed     NUMERIC := COALESCE(NEW.advance_deduction, 0) + COALESCE(NEW.loan_deduction, 0);
BEGIN
    IF NEW.finance_posted_at IS NULL OR OLD.finance_posted_at IS NOT NULL OR v_claimed <= 0 THEN
        RETURN NEW;
    END IF;

    WITH rec AS (
        SELECT a.id, a.amount
          FROM public.employee_advances a
         WHERE a.payroll_run_id = NEW.payroll_run_id AND a.employee_id = NEW.employee_id
        UNION ALL
        SELECT l.source_id, l.amount
          FROM public.payroll_recovery_log l
         WHERE l.payroll_run_id = NEW.payroll_run_id AND l.employee_id = NEW.employee_id
    )
    SELECT COUNT(*) FILTER (WHERE NOT public.fn_staff_rec_disbursed(rec.id)),
           COUNT(*), COALESCE(SUM(rec.amount), 0)
      INTO v_undisbursed, v_items, v_traced
      FROM rec;

    IF v_undisbursed > 0 THEN
        RAISE EXCEPTION 'STAFF_RECEIVABLE_NOT_DISBURSED: payslip % recovers % advance/loan item(s) that were never disbursed through Finance (no Dr 1004). Disburse them with disburse_staff_receivable before posting payroll.',
            NEW.id, v_undisbursed;
    END IF;
    IF v_claimed > v_traced + 0.01 * (v_items + 1) THEN
        RAISE EXCEPTION 'UNTRACED_RECOVERY: payslip % deducts % for advances/loans but only % is traceable to recoveries. Re-process the payroll run (#135) before posting.',
            NEW.id, v_claimed, v_traced;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_payslip_recovery_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_payslip_recovery_guard ON public.payslips;
CREATE TRIGGER trg_payslip_recovery_guard
BEFORE UPDATE OF finance_posted_at ON public.payslips
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_payslip_recovery_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Full & Final settlement → finance
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.post_final_settlement_to_finance(
    p_settlement_id        UUID,
    p_cash_bank_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user      UUID := auth.uid();
    s           RECORD;
    v_account   public.finance_accounts;
    l_sal       public.finance_ledgers;
    l_rec       public.finance_ledgers;
    l_other     public.finance_ledgers;
    l_cash      public.finance_ledgers;
    v_earn      NUMERIC;
    v_recovery  NUMERIC;
    v_other     NUMERIC;
    v_net       NUMERIC;
    v_open      NUMERIC;
    v_undisb    INT;
    v_emp_name  TEXT;
    v_desc      TEXT;
    v_journal   UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.is_admin() OR public.auth_has_role('hr') OR public.auth_has_role('finance')) THEN
        RAISE EXCEPTION 'Only Admin, HR or Finance can pay a final settlement.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO s FROM public.resignation_settlements WHERE id = p_settlement_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement % not found.', p_settlement_id;
    END IF;
    IF s.status <> 'approved' THEN
        RAISE EXCEPTION 'Settlement must be approved before payment (current status: %).', s.status;
    END IF;
    IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries
                WHERE source_type = 'payroll' AND source_id = s.id) THEN
        RAISE EXCEPTION 'Settlement has already been posted to finance.';
    END IF;

    v_earn     := ROUND(COALESCE(s.pro_rata_salary, 0) + COALESCE(s.leave_encashment, 0)
                      + COALESCE(s.other_earnings, 0) + COALESCE(s.gratuity_amount, 0), 2);
    v_recovery := ROUND(COALESCE(s.advance_recovery, 0) + COALESCE(s.loan_recovery, 0), 2);
    v_other    := ROUND(COALESCE(s.other_deductions, 0), 2);
    v_net      := ROUND(COALESCE(s.net_settlement, 0), 2);

    IF v_net < 0 THEN
        RAISE EXCEPTION 'Net settlement is negative (%): the employee owes the company. Record the recovery manually (receipt voucher) — not supported here.', v_net;
    END IF;
    IF ABS(v_earn - (v_recovery + v_other + v_net)) > 0.01 THEN
        RAISE EXCEPTION 'Settlement does not reconcile: earnings % ≠ recovery % + other deductions % + net %. Recalculate it.',
            v_earn, v_recovery, v_other, v_net;
    END IF;

    -- Open staff receivable items of this employee (same set #135 recovers)
    WITH open_items AS (
        SELECT id, remaining_amount AS amt FROM public.salary_advances
         WHERE employee_id = s.employee_id AND status = 'active' AND remaining_amount > 0
        UNION ALL
        SELECT id, remaining_balance FROM public.employee_loans
         WHERE employee_id = s.employee_id AND status = 'active' AND remaining_balance > 0
        UNION ALL
        SELECT id, amount FROM public.employee_advances
         WHERE employee_id = s.employee_id AND status = 'approved' AND payroll_run_id IS NULL
    )
    SELECT COALESCE(SUM(amt), 0), COUNT(*) FILTER (WHERE NOT public.fn_staff_rec_disbursed(id))
      INTO v_open, v_undisb FROM open_items;

    IF v_undisb > 0 THEN
        RAISE EXCEPTION 'STAFF_RECEIVABLE_NOT_DISBURSED: % open advance/loan item(s) of this employee were never disbursed through Finance.', v_undisb;
    END IF;
    IF ABS(v_open - v_recovery) > 0.01 THEN
        RAISE EXCEPTION 'Settlement recovery % ≠ outstanding disbursed staff receivable %. Recalculate the settlement.', v_recovery, v_open;
    END IF;

    v_account := public._fin_paying_account(p_cash_bank_account_id, s.company_id);
    l_sal   := public._hr_fin_ledger(s.company_id, '7000', 'expense');
    l_rec   := public._hr_fin_ledger(s.company_id, '1004', 'asset');
    l_other := public._hr_fin_ledger(s.company_id, '2009', 'liability');
    SELECT * INTO l_cash FROM public.finance_ledgers WHERE id = v_account.ledger_id;

    SELECT COALESCE(full_name, employee_code, 'Employee') INTO v_emp_name FROM public.employees WHERE id = s.employee_id;
    v_desc := 'Full & Final Settlement — ' || COALESCE(v_emp_name, 'Employee');

    PERFORM public._hr_fin_post_line(s.company_id, s.branch_id, 'payroll', s.id,
        l_sal.id, NULL, v_desc || ' (earnings incl. gratuity ' || COALESCE(s.gratuity_amount, 0) || ')', v_earn, 0);
    PERFORM public._hr_fin_post_line(s.company_id, s.branch_id, 'payroll', s.id,
        l_rec.id, NULL, v_desc || ' (advance/loan recovery)', 0, v_recovery);
    PERFORM public._hr_fin_post_line(s.company_id, s.branch_id, 'payroll', s.id,
        l_other.id, NULL, v_desc || ' (other deductions)', 0, v_other);
    PERFORM public._hr_fin_post_line(s.company_id, s.branch_id, 'payroll', s.id,
        l_cash.id, v_account.id, v_desc || ' paid (' || v_account.registered_name || ')', 0, v_net);
    UPDATE public.finance_accounts
       SET current_balance = COALESCE(current_balance, 0) - v_net, updated_at = now()
     WHERE id = v_account.id;

    v_journal := public._fin_staff_rec_journal(s.company_id, s.branch_id, s.id, 'payroll', v_desc,
        jsonb_build_array(
            jsonb_build_object('code', l_sal.ledger_code,   'dr', v_earn, 'cr', 0,          'memo', 'Final settlement earnings'),
            jsonb_build_object('code', l_rec.ledger_code,   'dr', 0,      'cr', v_recovery, 'memo', 'Advance/loan recovered'),
            jsonb_build_object('code', l_other.ledger_code, 'dr', 0,      'cr', v_other,    'memo', 'Other deductions'),
            jsonb_build_object('code', l_cash.ledger_code,  'dr', 0,      'cr', v_net,      'memo', 'Net settlement paid')),
        v_user);

    -- Close the recovered receivable items (gate trigger: active → settled is allowed)
    UPDATE public.salary_advances
       SET recovered_amount = amount, status = 'fully_recovered', updated_at = now()
     WHERE employee_id = s.employee_id AND status = 'active' AND remaining_amount > 0;
    UPDATE public.employee_loans
       SET total_paid = COALESCE(total_paid, 0) + remaining_balance, remaining_balance = 0,
           status = 'completed', updated_at = now()
     WHERE employee_id = s.employee_id AND status = 'active' AND remaining_balance > 0;
    UPDATE public.employee_advances
       SET status = 'deducted', deducted_date = CURRENT_DATE, updated_at = now()
     WHERE employee_id = s.employee_id AND status = 'approved' AND payroll_run_id IS NULL;

    UPDATE public.resignation_settlements SET status = 'paid', updated_at = now() WHERE id = s.id;

    RETURN jsonb_build_object('success', true, 'settlement_id', s.id, 'journal_entry_id', v_journal,
                              'earnings', v_earn, 'recovered', v_recovery, 'other_deductions', v_other,
                              'net_paid', v_net, 'paid_from', v_account.registered_name);
END;
$$;

COMMENT ON FUNCTION public.post_final_settlement_to_finance(uuid, uuid) IS
  '#134b: posts an approved Full & Final settlement — Dr 7000 / Cr 1004 (disbursed receivable only) / Cr 2009 / Cr cash-bank — closes recovered advances/loans and marks it paid.';

-- Guard: 'paid' only via the posting above
CREATE OR REPLACE FUNCTION public.trg_fn_settlement_paid_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid'
       AND NOT EXISTS (SELECT 1 FROM public.finance_cashbook_entries
                        WHERE source_type = 'payroll' AND source_id = NEW.id) THEN
        RAISE EXCEPTION 'A final settlement can only be marked paid through post_final_settlement_to_finance.';
    END IF;
    IF OLD.status = 'paid' AND NEW.status IS DISTINCT FROM 'paid' THEN
        RAISE EXCEPTION 'A paid final settlement cannot be changed.';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_settlement_paid_guard() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF to_regclass('public.resignation_settlements') IS NULL THEN
        RAISE NOTICE '#134b: resignation_settlements does not exist yet — settlement guard trigger skipped. Re-run this file after HR creates the table.';
    ELSE
        EXECUTE 'DROP TRIGGER IF EXISTS trg_settlement_paid_guard ON public.resignation_settlements';
        EXECUTE 'CREATE TRIGGER trg_settlement_paid_guard BEFORE UPDATE OF status ON public.resignation_settlements
                 FOR EACH ROW EXECUTE FUNCTION public.trg_fn_settlement_paid_guard()';
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Grants
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_staff_rec_disbursed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_staff_rec_journal(uuid, uuid, uuid, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_paying_account(uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.disburse_staff_receivable(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disburse_staff_receivable(text, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.post_final_settlement_to_finance(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_final_settlement_to_finance(uuid, uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
