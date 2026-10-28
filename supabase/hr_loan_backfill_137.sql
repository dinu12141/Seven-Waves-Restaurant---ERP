-- ═══════════════════════════════════════════════════════════════════════════
-- HR #137 — Backfill stale employee_loans balances FROM PAYSLIPS
-- Seven Waves Restaurant ERP
--
-- Problem (#3): until #135, process_monthly_payroll put the loan installment on
-- the payslip (payslips.loan_deduction) but never reduced
-- employee_loans.remaining_balance / total_paid.
--
-- USER DECISION: recompute, do not patch incrementally:
--     total_paid        = Σ loan deductions on payslips for that loan
--     remaining_balance = loan_amount (principal) − total_paid   (floored at 0)
--
-- Where loan deductions live (verified read-only on live 2026-10-26):
--   payslips.loan_deduction — ONE per-employee aggregate per payslip; there is
--   no per-loan breakdown table. Attribution to individual loans:
--     • runs already processed by #135 → exact per-loan amounts from
--       payroll_recovery_log (source = 'employee_loan');
--     • older runs → the payslip's loan_deduction is split across the loans
--       that were deductible in that period (loan_date <= period_end,
--       expected_completion_date NULL or >= period_start, status <> 'pending'),
--       pro rata to monthly_installment — which is exactly how the old payroll
--       built the figure (Σ monthly_installment of active loans).
--   Payslips with payment_status = 'cancelled' are ignored.
--   Interest is ignored (principal only), per the user decision.
--
-- ORDER: run AFTER #135 (PART B writes payroll_recovery_log, created by #135)
-- and BEFORE anyone processes payroll again. Why it must write the log: #135
-- reverses a run's logged recoveries before re-processing it. Without log rows
-- for pre-#135 runs, re-processing such a run would re-apply its installment on
-- top of this backfill → double count. With them, re-processing reverses the
-- backfilled amount and re-applies it exactly once.
-- Re-running #137 is safe: it is a recomputation (absolute values) and only
-- inserts log rows for (run, loan) pairs that have none.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PART A — DRY RUN (read-only). Safe to run any time, before or after #135.
-- (Before #135 / before any #135 processing, payroll_recovery_log is empty or
--  absent, so PART A's payslip-only attribution equals PART B's.)
-- ───────────────────────────────────────────────────────────────────────────
WITH slips AS (
    SELECT ps.id AS payslip_id, ps.employee_id, ps.payroll_run_id,
           pr.period_start, pr.period_end,
           COALESCE(ps.loan_deduction, 0) AS loan_deduction
      FROM public.payslips ps
      JOIN public.payroll_runs pr ON pr.id = ps.payroll_run_id
     WHERE COALESCE(ps.loan_deduction, 0) > 0
       AND COALESCE(ps.payment_status, 'pending') <> 'cancelled'
),
eligible AS (
    SELECT s.payslip_id, s.payroll_run_id, s.loan_deduction, l.id AS loan_id, l.monthly_installment,
           SUM(l.monthly_installment) OVER (PARTITION BY s.payslip_id) AS slip_installments
      FROM slips s
      JOIN public.employee_loans l
        ON l.employee_id = s.employee_id
       AND l.status <> 'pending'
       AND l.loan_date <= s.period_end
       AND (l.expected_completion_date IS NULL OR l.expected_completion_date >= s.period_start)
),
alloc AS (
    SELECT loan_id, payroll_run_id,
           ROUND(loan_deduction * monthly_installment / NULLIF(slip_installments, 0), 2) AS amount
      FROM eligible
),
per_loan AS (
    SELECT loan_id, SUM(amount) AS deducted, COUNT(DISTINCT payroll_run_id) AS runs
      FROM alloc GROUP BY loan_id
)
SELECT l.employee_id,
       l.id                                               AS loan_id,
       l.loan_amount                                      AS principal,
       COALESCE(p.deducted, 0)                            AS total_deducted_from_payslips,
       COALESCE(p.runs, 0)                                AS payslip_runs,
       l.total_paid                                       AS current_total_paid,
       l.remaining_balance                                AS current_remaining_balance,
       LEAST(COALESCE(p.deducted, 0), l.loan_amount)      AS proposed_total_paid,
       GREATEST(l.loan_amount - COALESCE(p.deducted, 0), 0) AS proposed_remaining_balance,
       GREATEST(COALESCE(p.deducted, 0) - l.loan_amount, 0) AS over_recovered,   -- refund owed to employee
       l.status                                           AS current_status,
       CASE WHEN l.status = 'active' AND l.loan_amount - COALESCE(p.deducted, 0) <= 0
            THEN 'completed' ELSE l.status END            AS proposed_status
  FROM public.employee_loans l
  LEFT JOIN per_loan p ON p.loan_id = l.id
 WHERE l.status <> 'pending'
 ORDER BY l.employee_id, l.loan_date;

-- Aggregate view of the same dry run + payslip deductions that could not be
-- attributed to any loan (orphans → investigate manually):
--   SELECT count(*) FILTER (WHERE proposed_remaining_balance <> current_remaining_balance) AS loans_affected,
--          sum(current_remaining_balance - proposed_remaining_balance)                    AS total_balance_reduction,
--          sum(over_recovered)                                                             AS total_over_recovered
--     FROM (<PART A query>) x;
--   SELECT count(*), sum(ps.loan_deduction) FROM payslips ps JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
--    WHERE ps.loan_deduction > 0 AND NOT EXISTS (SELECT 1 FROM employee_loans l WHERE l.employee_id = ps.employee_id
--      AND l.status <> 'pending' AND l.loan_date <= pr.period_end
--      AND (l.expected_completion_date IS NULL OR l.expected_completion_date >= pr.period_start));


-- ───────────────────────────────────────────────────────────────────────────
-- PART B — APPLY.  ⚠ APPLY ONLY AFTER USER APPROVAL of PART A's output. ⚠
-- Requires #135 (payroll_recovery_log). Only 'active' loans are rewritten
-- (they are the only ones payroll deducts); 'completed' / 'cancelled' /
-- 'defaulted' loans are reported by PART A only and never re-opened.
-- ───────────────────────────────────────────────────────────────────────────
/*
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
    IF to_regclass('public.payroll_recovery_log') IS NULL THEN
        RAISE EXCEPTION '#137 PART B requires #135 (payroll_recovery_log). Apply hr_payroll_integrity_135.sql first.';
    END IF;
END $$;

-- No payroll processing / loan edits while we recompute.
LOCK TABLE public.employee_loans, public.payroll_recovery_log, public.payslips IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _loan_backfill ON COMMIT DROP AS
WITH logged AS (          -- runs already processed by #135: exact per-loan amounts
    SELECT payroll_run_id, source_id AS loan_id, SUM(amount) AS amount
      FROM public.payroll_recovery_log
     WHERE source = 'employee_loan'
     GROUP BY payroll_run_id, source_id
),
slips AS (
    SELECT ps.id AS payslip_id, ps.employee_id, ps.payroll_run_id,
           pr.period_start, pr.period_end, COALESCE(ps.loan_deduction, 0) AS loan_deduction
      FROM public.payslips ps
      JOIN public.payroll_runs pr ON pr.id = ps.payroll_run_id
     WHERE COALESCE(ps.loan_deduction, 0) > 0
       AND COALESCE(ps.payment_status, 'pending') <> 'cancelled'
       -- skip slips whose run already has #135 log rows for this employee
       AND NOT EXISTS (SELECT 1 FROM public.payroll_recovery_log rl
                        WHERE rl.payroll_run_id = ps.payroll_run_id
                          AND rl.employee_id    = ps.employee_id
                          AND rl.source         = 'employee_loan')
),
eligible AS (
    SELECT s.payroll_run_id, s.loan_deduction, l.id AS loan_id, l.monthly_installment,
           SUM(l.monthly_installment) OVER (PARTITION BY s.payslip_id) AS slip_installments
      FROM slips s
      JOIN public.employee_loans l
        ON l.employee_id = s.employee_id
       AND l.status <> 'pending'
       AND l.loan_date <= s.period_end
       AND (l.expected_completion_date IS NULL OR l.expected_completion_date >= s.period_start)
),
legacy AS (
    SELECT payroll_run_id, loan_id,
           SUM(ROUND(loan_deduction * monthly_installment / NULLIF(slip_installments, 0), 2)) AS amount
      FROM eligible GROUP BY payroll_run_id, loan_id
)
SELECT payroll_run_id, loan_id, amount, false AS already_logged FROM legacy
UNION ALL
SELECT payroll_run_id, loan_id, amount, true  FROM logged;

-- Cap over-recovery at the principal (scale the legacy rows of that loan down)
-- so Σ log rows == total_paid and #135's reversal can never overshoot.
CREATE TEMP TABLE _loan_totals ON COMMIT DROP AS
SELECT l.id AS loan_id, l.employee_id, l.loan_amount,
       COALESCE(SUM(b.amount) FILTER (WHERE b.already_logged), 0)     AS logged_amt,
       COALESCE(SUM(b.amount) FILTER (WHERE NOT b.already_logged), 0) AS legacy_amt
  FROM public.employee_loans l
  LEFT JOIN _loan_backfill b ON b.loan_id = l.id
 WHERE l.status = 'active'
 GROUP BY l.id, l.employee_id, l.loan_amount;

UPDATE _loan_backfill b
   SET amount = ROUND(b.amount * GREATEST(t.loan_amount - t.logged_amt, 0) / t.legacy_amt, 2)
  FROM _loan_totals t
 WHERE b.loan_id = t.loan_id AND NOT b.already_logged
   AND t.legacy_amt > 0 AND t.logged_amt + t.legacy_amt > t.loan_amount;

-- 1. Log legacy recoveries so #135 can reverse them on re-processing.
INSERT INTO public.payroll_recovery_log (payroll_run_id, employee_id, source, source_id, amount)
SELECT b.payroll_run_id, t.employee_id, 'employee_loan', b.loan_id, b.amount
  FROM _loan_backfill b
  JOIN _loan_totals t ON t.loan_id = b.loan_id
 WHERE NOT b.already_logged AND b.amount > 0;

-- 2. Recompute balances: total_paid = Σ logged recoveries (legacy + #135).
WITH paid AS (
    SELECT source_id AS loan_id, SUM(amount) AS paid
      FROM public.payroll_recovery_log
     WHERE source = 'employee_loan'
     GROUP BY source_id
)
UPDATE public.employee_loans l
   SET total_paid        = LEAST(COALESCE(p.paid, 0), l.loan_amount),
       remaining_balance = GREATEST(l.loan_amount - COALESCE(p.paid, 0), 0),
       -- never re-open a 'completed' loan (may have been settled outside payroll)
       status            = CASE WHEN l.loan_amount - COALESCE(p.paid, 0) <= 0 THEN 'completed'
                                ELSE l.status END,
       updated_at        = now()
  FROM _loan_totals t
  LEFT JOIN paid p ON p.loan_id = t.loan_id
 WHERE l.id = t.loan_id
   AND (l.total_paid        IS DISTINCT FROM LEAST(COALESCE(p.paid, 0), l.loan_amount)
     OR l.remaining_balance IS DISTINCT FROM GREATEST(l.loan_amount - COALESCE(p.paid, 0), 0));

-- Review the result before committing:
--   SELECT id, loan_amount, total_paid, remaining_balance, status FROM employee_loans ORDER BY updated_at DESC;
COMMIT;
*/
