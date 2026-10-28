-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #129 — HR (Payroll & Advances) → Finance double-entry linkage
-- Seven Waves Restaurant ERP
--
-- Apply AFTER #128 (this file redefines the cashbook source_type CHECK with the
-- full union of every value allowed by #126 + #128 + this migration).
--
-- CONVENTIONS (from #122 — fix_ledger_current_balance_122 / running_balance_122)
--   finance_ledgers.current_balance = signed opening + Σ(cashbook debit − credit)
--   → every DEBIT adds to current_balance, every CREDIT subtracts from it,
--     regardless of ledger_type. Each ledger movement also writes ONE
--     finance_cashbook_entries row for that ledger (debit OR credit side), so a
--     #122 recompute reproduces the same balance.
--   finance_accounts.current_balance (cash/bank, asset-style) moves with its
--     linked ledger: credit (money out) → −amount (same as #127 pay vouchers).
--   journal_entries/journal_lines are also written (account_code = ledger_code,
--     same as JournalEntryForm), created unposted → lines → is_posted=true so
--     validate_journal_balance enforces DR = CR.
--
-- REQUIRED finance_ledgers CODES (looked up per company, company_id NULL =
-- global fallback; a missing code or a wrong ledger_type RAISES — nothing is
-- silently skipped). No migration in the repo seeds any of these, so §2 seeds
-- them idempotently per company (ON CONFLICT (company_id, ledger_code) DO
-- NOTHING — an existing ledger with the same code is kept as-is):
--   7000  Salaries and Wages              expense    (Dr gross pay)
--   7003  EPF Employer Contribution 12%   expense    (Dr employer EPF)
--   7004  ETF Employer Contribution 3%    expense    (Dr employer ETF)
--   2003  EPF Payable                     liability  (Cr employee 8% + employer 12%)
--   2004  ETF Payable                     liability  (Cr employer 3%)
--   1004  Staff Receivable (Loans & Adv.) asset      (Dr advance disbursed /
--                                                     Cr advance + loan recovered)
--   2008  Staff Welfare Fund Payable      liability  (Cr welfare_deduction)
--   2009  Other Payroll Deductions Payable liability (Cr custom_deductions +
--                                                     other_deductions)
--   + the ledger linked to the chosen finance_accounts row (Cr net pay).
--
-- PAYSLIP COLUMNS USED (hr_payroll.sql, employee_advances_expenses.sql,
-- hrms_complete_module.sql, written by process_monthly_payroll #118):
--   gross_salary, net_salary, epf_employee, epf_employer, etf_employer,
--   loan_deduction, advance_deduction (salary_advances installments +
--   employee_advances lump sums), welfare_deduction, custom_deductions,
--   other_deductions, is_held, payment_status, paid_at, paid_by, payment_method.
--   #118 identity: net = gross − (epf_employee + loan + advance + welfare +
--   custom + other). Per-component ROUND() can leave ≤ 1 cent per slip; that
--   residual is absorbed into the 7000 debit. Anything larger RAISES.
--
-- Contents:
--   §1  cashbook source_type CHECK (full union)
--   §2  ledger seed
--   §3  tracking columns (payslips.finance_posted_at, payroll_finance_postings v2 cols)
--   §4  private helpers (_hr_fin_ledger, _hr_fin_post_line)
--   §5  post_payroll_to_finance_v2(uuid, uuid, text, uuid)
--   §6  disburse_employee_advance(uuid, uuid, uuid)
--   §7  grants
--
-- Idempotent / re-runnable. Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── §1. finance_cashbook_entries.source_type — FULL union ──────────────────
-- #126 list + 'supplier_payment' (#128 / procurementService) + 'payroll' +
-- 'salary_advance' (this file) + 'bank_charge' / 'cheque' (already written by
-- BankReconciliationAdjustmentDialog / finance-bank-reconciliation.service —
-- kept so existing rows still validate).
-- Union of the LIVE allowed values + the values this migration needs
-- (never narrows the list: rows with e.g. 'bank_charge' / 'cheque' must keep
-- validating, otherwise the ADD CONSTRAINT aborts the whole apply). (#129, Finance review)
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

-- ── §2. Seed payroll ledgers per company (idempotent) ───────────────────────
INSERT INTO public.finance_ledgers (
    company_id, branch_id, ledger_code, ledger_name, ledger_type, ledger_nature,
    account_group, opening_balance, opening_balance_type, current_balance,
    is_system_ledger, is_active
)
SELECT c.id, NULL, s.code, s.name, s.ltype, s.nature, s.grp, 0, s.obt, 0, true, true
  FROM public.companies c
 CROSS JOIN (VALUES
    ('7000', 'Salaries and Wages',               'expense',   'debit',  'Admin and Operation Expenses',      'debit'),
    ('7003', 'EPF Employer Contribution (12%)',  'expense',   'debit',  'Admin and Operation Expenses',      'debit'),
    ('7004', 'ETF Employer Contribution (3%)',   'expense',   'debit',  'Admin and Operation Expenses',      'debit'),
    ('2003', 'EPF Payable',                      'liability', 'credit', 'Current Liabilities',               'credit'),
    ('2004', 'ETF Payable',                      'liability', 'credit', 'Current Liabilities',               'credit'),
    ('1004', 'Staff Receivable (Loans & Advances)','asset',   'debit',  'Assets-Current (Other Receivable)', 'debit'),
    ('2008', 'Staff Welfare Fund Payable',       'liability', 'credit', 'Current Liabilities',               'credit'),
    ('2009', 'Other Payroll Deductions Payable', 'liability', 'credit', 'Current Liabilities',               'credit')
 ) AS s(code, name, ltype, nature, grp, obt)
 -- skip when the code already exists for this company OR as a global
 -- (company_id NULL) ledger — the lookup would otherwise prefer an empty seed
 WHERE NOT EXISTS (
    SELECT 1 FROM public.finance_ledgers fl
     WHERE fl.ledger_code = s.code
       AND fl.deleted_at IS NULL
       AND (fl.company_id = c.id OR fl.company_id IS NULL)
 )
ON CONFLICT (company_id, ledger_code) DO NOTHING;

-- ── §3. Tracking columns ────────────────────────────────────────────────────
-- Per-payslip posting marker: payment_status alone is not reliable because
-- approve_salary_final / "Mark Paid" set 'paid' WITHOUT any finance posting.
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS finance_posted_at  TIMESTAMPTZ;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS finance_journal_id UUID;
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS paid_by            UUID;

-- payroll_finance_postings is not defined in repo SQL (exists live; used by the
-- legacy post_payroll_to_finance). Add v2 columns and relax NOT NULL on the
-- legacy chart_of_accounts id columns, which v2 does not use.
DO $$
DECLARE
    c TEXT;
BEGIN
    IF to_regclass('public.payroll_finance_postings') IS NULL THEN
        RAISE EXCEPTION 'payroll_finance_postings table is missing — expected from the legacy payroll posting setup.';
    END IF;

    ALTER TABLE public.payroll_finance_postings ADD COLUMN IF NOT EXISTS posting_version        TEXT;
    ALTER TABLE public.payroll_finance_postings ADD COLUMN IF NOT EXISTS finance_account_id     UUID REFERENCES public.finance_accounts(id);
    ALTER TABLE public.payroll_finance_postings ADD COLUMN IF NOT EXISTS journal_entry_id       UUID;
    ALTER TABLE public.payroll_finance_postings ADD COLUMN IF NOT EXISTS total_other_deductions NUMERIC(14,2) DEFAULT 0;
    ALTER TABLE public.payroll_finance_postings ADD COLUMN IF NOT EXISTS slips_posted           INT DEFAULT 0;

    FOREACH c IN ARRAY ARRAY[
        'salary_expense_account_id','epf_expense_account_id','etf_expense_account_id',
        'salary_payable_account_id','epf_payable_account_id','etf_payable_account_id',
        'cash_bank_account_id'
    ] LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'payroll_finance_postings'
                      AND column_name = c AND is_nullable = 'NO') THEN
            EXECUTE format('ALTER TABLE public.payroll_finance_postings ALTER COLUMN %I DROP NOT NULL', c);
        END IF;
    END LOOP;
END $$;

-- ── Drop every existing overload of the functions defined below ────────────
-- (never leave two overloads → PostgREST PGRST203)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('post_payroll_to_finance_v2', 'disburse_employee_advance',
                             '_hr_fin_ledger', '_hr_fin_post_line')
    LOOP
        EXECUTE format('DROP FUNCTION %s', r.sig);
    END LOOP;
END $$;

-- ── §4a. Helper: resolve a ledger by code (company first, then global) ─────
CREATE FUNCTION public._hr_fin_ledger(p_company_id UUID, p_code TEXT, p_expected_type TEXT)
RETURNS public.finance_ledgers
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_l public.finance_ledgers;
BEGIN
    SELECT * INTO v_l
      FROM public.finance_ledgers
     WHERE ledger_code = p_code
       AND deleted_at IS NULL
       AND (company_id = p_company_id OR company_id IS NULL)
     ORDER BY (company_id IS NULL), created_at
     LIMIT 1;

    IF v_l.id IS NULL THEN
        RAISE EXCEPTION 'Required finance ledger % is missing for company %. Create it in Finance → Ledgers (see migration #129 header).',
            p_code, p_company_id USING ERRCODE = 'P0001';
    END IF;
    IF NOT v_l.is_active THEN
        RAISE EXCEPTION 'Finance ledger % (%) is inactive.', p_code, v_l.ledger_name USING ERRCODE = 'P0001';
    END IF;
    IF p_expected_type IS NOT NULL AND v_l.ledger_type <> p_expected_type THEN
        RAISE EXCEPTION 'Finance ledger % (%) is of type %, expected %. Fix the chart of ledgers before posting payroll.',
            p_code, v_l.ledger_name, v_l.ledger_type, p_expected_type USING ERRCODE = 'P0001';
    END IF;
    RETURN v_l;
END;
$$;

-- ── §4b. Helper: one ledger movement = cashbook row + current_balance delta ─
-- current_balance += debit − credit (#122 convention).
CREATE FUNCTION public._hr_fin_post_line(
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
        p_company_id, p_branch_id, p_source_type, p_source_id, CURRENT_DATE,
        p_ledger_id, p_account_id, p_description, p_debit, p_credit, 0   -- running_balance set by trg_cashbook_running_balance
    );

    UPDATE public.finance_ledgers
       SET current_balance = COALESCE(current_balance, 0) + p_debit - p_credit,
           updated_at = now()
     WHERE id = p_ledger_id;
END;
$$;

-- ── §5. post_payroll_to_finance_v2 ──────────────────────────────────────────
-- Posts every released (not held, not cancelled) payslip of the run that has
-- not been finance-posted yet. Re-callable after releasing held slips; refuses
-- runs already posted by the legacy function or by the pre-fix #129 v2.
CREATE FUNCTION public.post_payroll_to_finance_v2(
    p_payroll_run_id       UUID,
    p_cash_bank_account_id UUID,
    p_payment_method       TEXT DEFAULT 'bank_transfer',
    p_posted_by            UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user      UUID := COALESCE(auth.uid(), p_posted_by);
    v_run       public.payroll_runs;
    v_account   public.finance_accounts;
    v_period    TEXT;
    v_desc      TEXT;

    l_sal       public.finance_ledgers;
    l_epf_exp   public.finance_ledgers;
    l_etf_exp   public.finance_ledgers;
    l_epf_pay   public.finance_ledgers;
    l_etf_pay   public.finance_ledgers;
    l_staff_rec public.finance_ledgers;
    l_welfare   public.finance_ledgers;
    l_other     public.finance_ledgers;
    l_cash      public.finance_ledgers;

    v_count     INT     := 0;
    v_gross     NUMERIC := 0;
    v_net       NUMERIC := 0;
    v_epf_emp   NUMERIC := 0;
    v_epf_er    NUMERIC := 0;
    v_etf       NUMERIC := 0;
    v_loan      NUMERIC := 0;
    v_adv       NUMERIC := 0;
    v_welfare   NUMERIC := 0;
    v_custom    NUMERIC := 0;
    v_otherded  NUMERIC := 0;

    v_residual  NUMERIC;
    v_sal_debit NUMERIC;
    v_total_dr  NUMERIC;
    v_total_cr  NUMERIC;
    v_journal   UUID;
    v_posting   UUID;
    v_remaining INT;
    v_run_paid  BOOLEAN;
BEGIN
    -- Authorization
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.is_admin() OR public.auth_has_role('hr') OR public.auth_has_role('finance')) THEN
        RAISE EXCEPTION 'Only Admin, HR or Finance can post payroll to finance.' USING ERRCODE = '42501';
    END IF;

    -- Run (locked: serialises concurrent posts of the same run)
    SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_payroll_run_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payroll run % not found.', p_payroll_run_id;
    END IF;
    IF v_run.status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'Payroll run must be approved before posting to finance (current status: %).', v_run.status;
    END IF;

    -- Idempotency against the other posting paths
    IF EXISTS (SELECT 1 FROM public.payroll_finance_postings
                WHERE payroll_run_id = p_payroll_run_id
                  AND posting_version IS DISTINCT FROM 'v2') THEN
        RAISE EXCEPTION 'This payroll run was already posted to finance by the legacy posting function.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries
                WHERE source_type = 'payroll' AND source_id = p_payroll_run_id)
       AND NOT EXISTS (SELECT 1 FROM public.payroll_finance_postings
                        WHERE payroll_run_id = p_payroll_run_id AND posting_version = 'v2') THEN
        RAISE EXCEPTION 'This payroll run already has payroll cashbook entries from an earlier posting. Refusing to double-post.';
    END IF;

    -- Paying account: must be a finance_accounts row (same as finance vouchers).
    -- Tolerate a finance_ledgers id by resolving its linked account.
    SELECT * INTO v_account
      FROM public.finance_accounts
     WHERE id = p_cash_bank_account_id AND deleted_at IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
        SELECT * INTO v_account
          FROM public.finance_accounts
         WHERE ledger_id = p_cash_bank_account_id AND deleted_at IS NULL AND is_active
         ORDER BY is_default DESC, created_at
         LIMIT 1
         FOR UPDATE;
    END IF;
    IF v_account.id IS NULL THEN
        RAISE EXCEPTION 'Paying account % is not a Finance cash/bank account (finance_accounts). Select an account registered under Finance → Accounts.',
            p_cash_bank_account_id;
    END IF;
    IF NOT v_account.is_active THEN
        RAISE EXCEPTION 'Paying account % is inactive.', v_account.registered_name;
    END IF;
    IF v_account.company_id IS NOT NULL AND v_account.company_id <> v_run.company_id THEN
        RAISE EXCEPTION 'Paying account % belongs to a different company.', v_account.registered_name;
    END IF;

    -- Ledgers (RAISE if missing / wrong type)
    l_sal       := public._hr_fin_ledger(v_run.company_id, '7000', 'expense');
    l_epf_exp   := public._hr_fin_ledger(v_run.company_id, '7003', 'expense');
    l_etf_exp   := public._hr_fin_ledger(v_run.company_id, '7004', 'expense');
    l_epf_pay   := public._hr_fin_ledger(v_run.company_id, '2003', 'liability');
    l_etf_pay   := public._hr_fin_ledger(v_run.company_id, '2004', 'liability');
    l_staff_rec := public._hr_fin_ledger(v_run.company_id, '1004', 'asset');
    l_welfare   := public._hr_fin_ledger(v_run.company_id, '2008', 'liability');
    l_other     := public._hr_fin_ledger(v_run.company_id, '2009', 'liability');
    SELECT * INTO l_cash FROM public.finance_ledgers WHERE id = v_account.ledger_id;
    IF l_cash.id IS NULL THEN
        RAISE EXCEPTION 'Paying account % has no linked ledger.', v_account.registered_name;
    END IF;

    -- Lock + aggregate the slips to post
    PERFORM 1 FROM public.payslips p
     WHERE p.payroll_run_id = p_payroll_run_id
       AND COALESCE(p.is_held, false) = false
       AND p.finance_posted_at IS NULL
       AND COALESCE(p.payment_status, 'pending') <> 'cancelled'
     FOR UPDATE;

    SELECT COUNT(*),
           COALESCE(SUM(p.gross_salary), 0),
           COALESCE(SUM(p.net_salary), 0),
           COALESCE(SUM(p.epf_employee), 0),
           COALESCE(SUM(p.epf_employer), 0),
           COALESCE(SUM(p.etf_employer), 0),
           COALESCE(SUM(COALESCE(p.loan_deduction, 0)), 0),
           COALESCE(SUM(COALESCE(p.advance_deduction, 0)), 0),
           COALESCE(SUM(COALESCE(p.welfare_deduction, 0)), 0),
           COALESCE(SUM(COALESCE(p.custom_deductions, 0)), 0),
           COALESCE(SUM(COALESCE(p.other_deductions, 0)), 0)
      INTO v_count, v_gross, v_net, v_epf_emp, v_epf_er, v_etf,
           v_loan, v_adv, v_welfare, v_custom, v_otherded
      FROM public.payslips p
     WHERE p.payroll_run_id = p_payroll_run_id
       AND COALESCE(p.is_held, false) = false
       AND p.finance_posted_at IS NULL
       AND COALESCE(p.payment_status, 'pending') <> 'cancelled';

    IF v_count = 0 THEN
        RAISE EXCEPTION 'Nothing to post: no released payslips in this run are pending finance posting.';
    END IF;
    IF v_net < 0 THEN
        RAISE EXCEPTION 'Total net salary is negative (%). Review payslips before posting.', v_net;
    END IF;

    -- Gross must equal employee-side deductions + net. Allow ≤ 1 cent / slip
    -- rounding (absorbed into the 7000 debit); anything else is a data error.
    v_residual := v_gross - (v_epf_emp + v_loan + v_adv + v_welfare + v_custom + v_otherded + v_net);
    IF ABS(v_residual) > 0.01 * v_count THEN
        RAISE EXCEPTION 'Payslips do not reconcile: gross % ≠ deductions % + net % (difference %). Re-process or correct the payslips.',
            v_gross, (v_epf_emp + v_loan + v_adv + v_welfare + v_custom + v_otherded), v_net, v_residual;
    END IF;
    v_sal_debit := v_gross - v_residual;

    v_total_dr := v_sal_debit + v_epf_er + v_etf;
    v_total_cr := (v_epf_emp + v_epf_er) + v_etf + (v_adv + v_loan) + v_welfare
                  + (v_custom + v_otherded) + v_net;
    IF ROUND(v_total_dr, 2) <> ROUND(v_total_cr, 2) THEN
        RAISE EXCEPTION 'Payroll posting does not balance: Dr % vs Cr %.', v_total_dr, v_total_cr;
    END IF;

    v_period := to_char(v_run.period_end, 'Mon YYYY');

    -- ── Ledger movements + cashbook rows ────────────────────────────────────
    PERFORM public._hr_fin_post_line(v_run.company_id, v_run.branch_id, 'payroll', v_run.id,
        l_sal.id, NULL, 'Gross Salaries — ' || v_period, v_sal_debit, 0);
    PERFORM public._hr_fin_post_line(v_run.company_id, v_run.branch_id, 'payroll', v_run.id,
        l_epf_exp.id, NULL, 'EPF Employer (12%) — ' || v_period, v_epf_er, 0);
    PERFORM public._hr_fin_post_line(v_run.company_id, v_run.branch_id, 'payroll', v_run.id,
        l_etf_exp.id, NULL, 'ETF Employer (3%) — ' || v_period, v_etf, 0);
    PERFORM public._hr_fin_post_line(v_run.company_id, v_run.branch_id, 'payroll', v_run.id,
        l_epf_pay.id, NULL, 'EPF Payable (employee + employer) — ' || v_period, 0, v_epf_emp + v_epf_er);
    PERFORM public._hr_fin_post_line(v_run.company_id, v_run.branch_id, 'payroll', v_run.id,
        l_etf_pay.id, NULL, 'ETF Payable — ' || v_period, 0, v_etf);
    PERFORM public._hr_fin_post_line(v_run.company_id, v_run.branch_id, 'payroll', v_run.id,
        l_staff_rec.id, NULL, 'Staff Advances & Loans Recovered — ' || v_period, 0, v_adv + v_loan);
    PERFORM public._hr_fin_post_line(v_run.company_id, v_run.branch_id, 'payroll', v_run.id,
        l_welfare.id, NULL, 'Staff Welfare Deductions — ' || v_period, 0, v_welfare);
    PERFORM public._hr_fin_post_line(v_run.company_id, v_run.branch_id, 'payroll', v_run.id,
        l_other.id, NULL, 'Other Payroll Deductions — ' || v_period, 0, v_custom + v_otherded);

    v_desc := 'Salary Payout (' || v_account.registered_name || ') — ' || v_period;
    PERFORM public._hr_fin_post_line(v_run.company_id, v_run.branch_id, 'payroll', v_run.id,
        l_cash.id, v_account.id, v_desc, 0, v_net);
    UPDATE public.finance_accounts
       SET current_balance = COALESCE(current_balance, 0) - ROUND(v_net, 2),
           updated_at = now()
     WHERE id = v_account.id;

    -- ── Journal (for journal-based GL / reports) ───────────────────────────
    INSERT INTO public.journal_entries (
        company_id, branch_id, doc_date, reference_id, reference_type,
        description, entry_type, total_dr, total_cr, is_posted
    ) VALUES (
        v_run.company_id, v_run.branch_id, CURRENT_DATE, v_run.id, 'payroll',
        'Payroll ' || v_period || ' — ' || v_count || ' payslip(s) via ' || v_account.registered_name,
        'expense', ROUND(v_total_dr, 2), ROUND(v_total_cr, 2), false
    ) RETURNING id INTO v_journal;

    INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, cr_amount, memo)
    SELECT v_journal, x.code, ROUND(x.dr, 2), ROUND(x.cr, 2), x.memo
      FROM (VALUES
        (l_sal.ledger_code,       v_sal_debit,           0::NUMERIC,             'Gross Salary Expense'),
        (l_epf_exp.ledger_code,   v_epf_er,              0::NUMERIC,             'EPF Employer Expense'),
        (l_etf_exp.ledger_code,   v_etf,                 0::NUMERIC,             'ETF Employer Expense'),
        (l_epf_pay.ledger_code,   0::NUMERIC,            v_epf_emp + v_epf_er,   'EPF Payable'),
        (l_etf_pay.ledger_code,   0::NUMERIC,            v_etf,                  'ETF Payable'),
        (l_staff_rec.ledger_code, 0::NUMERIC,            v_adv + v_loan,         'Staff Advances & Loans Recovered'),
        (l_welfare.ledger_code,   0::NUMERIC,            v_welfare,              'Staff Welfare Deductions'),
        (l_other.ledger_code,     0::NUMERIC,            v_custom + v_otherded,  'Other Payroll Deductions'),
        (l_cash.ledger_code,      0::NUMERIC,            v_net,                  'Salary Payout — ' || v_account.registered_name)
      ) AS x(code, dr, cr, memo)
     WHERE ROUND(x.dr, 2) > 0 OR ROUND(x.cr, 2) > 0;

    UPDATE public.journal_entries
       SET is_posted = true, posted_at = now(), posted_by = v_user
     WHERE id = v_journal;   -- trg_validate_journal enforces DR = CR here

    -- ── Mark posted slips; only released slips are touched ─────────────────
    UPDATE public.payslips
       SET finance_posted_at  = now(),
           finance_journal_id = v_journal,
           payment_method     = CASE WHEN payment_status = 'paid' THEN payment_method ELSE p_payment_method END,
           paid_at            = COALESCE(paid_at, now()),
           paid_by            = COALESCE(paid_by, v_user),
           payment_status     = 'paid'
     WHERE payroll_run_id = p_payroll_run_id
       AND COALESCE(is_held, false) = false
       AND finance_posted_at IS NULL
       AND COALESCE(payment_status, 'pending') <> 'cancelled';

    -- Run is 'paid' only when nothing is held or still unposted. Otherwise the
    -- status is left unchanged (chk_payroll_status has no partial value), so
    -- the run stays 'approved' and can be posted again after releasing holds.
    SELECT COUNT(*) INTO v_remaining
      FROM public.payslips
     WHERE payroll_run_id = p_payroll_run_id
       AND COALESCE(payment_status, 'pending') <> 'cancelled'
       AND (COALESCE(is_held, false) = true OR finance_posted_at IS NULL);

    v_run_paid := (v_remaining = 0);
    IF v_run_paid THEN
        UPDATE public.payroll_runs
           SET status = 'paid', updated_at = now()
         WHERE id = p_payroll_run_id;
    END IF;

    -- ── payroll_finance_postings (one v2 row per run, accumulated) ─────────
    SELECT id INTO v_posting
      FROM public.payroll_finance_postings
     WHERE payroll_run_id = p_payroll_run_id AND posting_version = 'v2'
     LIMIT 1;

    IF v_posting IS NULL THEN
        INSERT INTO public.payroll_finance_postings (
            company_id, branch_id, payroll_run_id, payment_method,
            total_gross, total_net, total_epf_employee, total_epf_employer, total_etf_employer,
            total_deductions, total_other_deductions, posted_by,
            posting_version, finance_account_id, journal_entry_id, slips_posted
        ) VALUES (
            v_run.company_id, v_run.branch_id, p_payroll_run_id, p_payment_method,
            ROUND(v_gross, 2), ROUND(v_net, 2), ROUND(v_epf_emp, 2), ROUND(v_epf_er, 2), ROUND(v_etf, 2),
            ROUND(v_gross - v_net, 2), ROUND(v_loan + v_adv + v_welfare + v_custom + v_otherded, 2), v_user,
            'v2', v_account.id, v_journal, v_count
        ) RETURNING id INTO v_posting;
    ELSE
        UPDATE public.payroll_finance_postings
           SET total_gross            = COALESCE(total_gross, 0)            + ROUND(v_gross, 2),
               total_net              = COALESCE(total_net, 0)              + ROUND(v_net, 2),
               total_epf_employee     = COALESCE(total_epf_employee, 0)     + ROUND(v_epf_emp, 2),
               total_epf_employer     = COALESCE(total_epf_employer, 0)     + ROUND(v_epf_er, 2),
               total_etf_employer     = COALESCE(total_etf_employer, 0)     + ROUND(v_etf, 2),
               total_deductions       = COALESCE(total_deductions, 0)       + ROUND(v_gross - v_net, 2),
               total_other_deductions = COALESCE(total_other_deductions, 0) + ROUND(v_loan + v_adv + v_welfare + v_custom + v_otherded, 2),
               slips_posted           = COALESCE(slips_posted, 0)           + v_count,
               journal_entry_id       = v_journal
         WHERE id = v_posting;
    END IF;

    RETURN jsonb_build_object(
        'success',            true,
        'posting_id',         v_posting,
        'journal_entry_id',   v_journal,
        'slips_paid',         v_count,
        'total_gross',        ROUND(v_gross, 2),
        'total_net',          ROUND(v_net, 2),
        'total_epf',          ROUND(v_epf_emp + v_epf_er, 2),
        'total_etf',          ROUND(v_etf, 2),
        'advances_recovered', ROUND(v_adv, 2),
        'loans_recovered',    ROUND(v_loan, 2),
        'welfare',            ROUND(v_welfare, 2),
        'other_deductions',   ROUND(v_custom + v_otherded, 2),
        'rounding_adjustment',ROUND(v_residual, 2),
        'run_status',         CASE WHEN v_run_paid THEN 'paid' ELSE v_run.status END,
        'slips_remaining',    v_remaining,
        'account_debited',    v_account.registered_name
    );
END;
$$;

COMMENT ON FUNCTION public.post_payroll_to_finance_v2(uuid, uuid, text, uuid) IS
  '#129: Posts released, not-yet-posted payslips of an approved payroll run to finance_ledgers + finance_cashbook_entries + journal. Balanced Dr/Cr, idempotent per payslip (payslips.finance_posted_at). p_cash_bank_account_id = finance_accounts.id.';

-- ── §6. disburse_employee_advance ───────────────────────────────────────────
-- Dr 1004 Staff Receivable / Cr paying cash-bank ledger. Allowed only for an
-- advance that is pending or approved, not yet deducted by payroll and not yet
-- disbursed (an existing 'salary_advance' cashbook row = already disbursed).
CREATE FUNCTION public.disburse_employee_advance(
    p_advance_id           UUID,
    p_cash_bank_account_id UUID,
    p_disbursed_by         UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user      UUID := COALESCE(auth.uid(), p_disbursed_by);
    v_adv       public.employee_advances;
    v_account   public.finance_accounts;
    l_rec       public.finance_ledgers;
    l_cash      public.finance_ledgers;
    v_emp_name  TEXT;
    v_journal   UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.is_admin() OR public.auth_has_role('hr') OR public.auth_has_role('finance')) THEN
        RAISE EXCEPTION 'Only Admin, HR or Finance can disburse employee advances.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_adv FROM public.employee_advances WHERE id = p_advance_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Advance % not found.', p_advance_id;
    END IF;
    IF v_adv.status NOT IN ('pending', 'approved') THEN
        RAISE EXCEPTION 'Advance cannot be disbursed: status is %.', v_adv.status;
    END IF;
    IF v_adv.payroll_run_id IS NOT NULL OR v_adv.deducted_date IS NOT NULL THEN
        RAISE EXCEPTION 'Advance has already been deducted through payroll and cannot be disbursed.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries
                WHERE source_type = 'salary_advance' AND source_id = v_adv.id) THEN
        RAISE EXCEPTION 'Advance has already been disbursed.';
    END IF;
    IF COALESCE(v_adv.amount, 0) <= 0 THEN
        RAISE EXCEPTION 'Advance amount must be positive.';
    END IF;

    SELECT * INTO v_account
      FROM public.finance_accounts
     WHERE id = p_cash_bank_account_id AND deleted_at IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Disbursing account % is not a Finance cash/bank account (finance_accounts).', p_cash_bank_account_id;
    END IF;
    IF NOT v_account.is_active THEN
        RAISE EXCEPTION 'Disbursing account % is inactive.', v_account.registered_name;
    END IF;
    IF v_account.company_id IS NOT NULL AND v_account.company_id <> v_adv.company_id THEN
        RAISE EXCEPTION 'Disbursing account % belongs to a different company.', v_account.registered_name;
    END IF;

    l_rec := public._hr_fin_ledger(v_adv.company_id, '1004', 'asset');
    SELECT * INTO l_cash FROM public.finance_ledgers WHERE id = v_account.ledger_id;
    IF l_cash.id IS NULL THEN
        RAISE EXCEPTION 'Disbursing account % has no linked ledger.', v_account.registered_name;
    END IF;

    SELECT COALESCE(full_name, employee_code, 'Employee') INTO v_emp_name
      FROM public.employees WHERE id = v_adv.employee_id;
    v_emp_name := COALESCE(v_emp_name, 'Employee');

    -- Dr Staff Receivable (1004)
    PERFORM public._hr_fin_post_line(v_adv.company_id, v_adv.branch_id, 'salary_advance', v_adv.id,
        l_rec.id, NULL, 'Salary Advance Disbursed — ' || v_emp_name, v_adv.amount, 0);
    -- Cr paying cash/bank ledger (+ account balance)
    PERFORM public._hr_fin_post_line(v_adv.company_id, v_adv.branch_id, 'salary_advance', v_adv.id,
        l_cash.id, v_account.id,
        'Salary Advance Paid — ' || v_emp_name || ' (' || v_account.registered_name || ')', 0, v_adv.amount);
    UPDATE public.finance_accounts
       SET current_balance = COALESCE(current_balance, 0) - v_adv.amount,
           updated_at = now()
     WHERE id = v_account.id;

    -- Journal
    INSERT INTO public.journal_entries (
        company_id, branch_id, doc_date, reference_id, reference_type,
        description, entry_type, total_dr, total_cr, is_posted
    ) VALUES (
        v_adv.company_id, v_adv.branch_id, CURRENT_DATE, v_adv.id, 'salary_advance',
        'Salary Advance — ' || v_emp_name, 'expense', v_adv.amount, v_adv.amount, false
    ) RETURNING id INTO v_journal;

    INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, cr_amount, memo) VALUES
        (v_journal, l_rec.ledger_code,  v_adv.amount, 0, 'Staff Receivable — ' || v_emp_name),
        (v_journal, l_cash.ledger_code, 0, v_adv.amount, 'Advance paid from ' || v_account.registered_name);

    UPDATE public.journal_entries
       SET is_posted = true, posted_at = now(), posted_by = v_user
     WHERE id = v_journal;

    -- Approve (keeps existing approver if already approved). Status stays
    -- 'approved' so process_monthly_payroll (#118) deducts it exactly once.
    UPDATE public.employee_advances
       SET status      = 'approved',
           approved_by = COALESCE(approved_by, v_user),
           approved_at = COALESCE(approved_at, now()),
           updated_at  = now()
     WHERE id = p_advance_id;

    RETURN jsonb_build_object(
        'success',          true,
        'advance_id',       v_adv.id,
        'amount',           v_adv.amount,
        'employee',         v_emp_name,
        'disbursed_from',   v_account.registered_name,
        'journal_entry_id', v_journal
    );
END;
$$;

COMMENT ON FUNCTION public.disburse_employee_advance(uuid, uuid, uuid) IS
  '#129: Disburses a pending/approved, not-yet-deducted, not-yet-disbursed employee advance. Dr 1004 Staff Receivable / Cr finance_accounts ledger; writes both cashbook rows + journal.';

-- ── §7. Grants ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._hr_fin_ledger(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._hr_fin_post_line(uuid, uuid, text, uuid, uuid, uuid, text, numeric, numeric) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.post_payroll_to_finance_v2(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_payroll_to_finance_v2(uuid, uuid, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.disburse_employee_advance(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disburse_employee_advance(uuid, uuid, uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
