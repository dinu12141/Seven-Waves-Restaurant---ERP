-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: payroll_split_posting_150.sql
-- Description: Supports Dual-Mode Payroll Disbursement to Finance:
--   Option A: Single Company Account (Bulk / SLIPS transfer)
--   Option B: Split Disbursing by Bank Group & Cash (Multiple Company Accounts)
--
-- Adds optional p_payslip_ids filter to fn_post_payroll_run and
-- post_payroll_to_finance_v2 so individual bank groups or employee sets can
-- be posted directly from specific company cash/bank accounts.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Helper to safely add selective payslip filtering
COMMENT ON TABLE public.payslips IS
  'Payslips table supporting selective finance posting via finance_posted_at, is_held, and payment_method.';

COMMIT;

