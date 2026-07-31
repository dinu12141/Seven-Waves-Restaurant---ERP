-- =====================================================
-- Fix: Add missing columns to employees table
-- These fields are collected in the Add/Edit Employee form
-- but were never persisted because the columns didn't exist.
-- =====================================================

-- Employee title (Mr., Mrs., Miss, Rev.)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS title TEXT;

-- Pay type (Weekly, Monthly, Daily)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_type TEXT DEFAULT 'Monthly';

-- OT eligibility (Eligible, Not Eligible)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ot TEXT DEFAULT 'Eligible';

-- Shift assignment label
ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift TEXT;

-- Probation period
ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_period TEXT;

-- EPF amount (calculated)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS epf_amount TEXT;

-- Welfare deduction amount
ALTER TABLE employees ADD COLUMN IF NOT EXISTS welfare_amount TEXT;

-- Internal company name
ALTER TABLE employees ADD COLUMN IF NOT EXISTS internal_company TEXT DEFAULT 'SEVEN WAVES (PVT) LTD';

-- Morning OT flag
ALTER TABLE employees ADD COLUMN IF NOT EXISTS morning_ot BOOLEAN DEFAULT false;

-- Late deduction flag
ALTER TABLE employees ADD COLUMN IF NOT EXISTS late_deduct BOOLEAN DEFAULT false;

-- No-pay deduction flag
ALTER TABLE employees ADD COLUMN IF NOT EXISTS no_pay_deduct BOOLEAN DEFAULT false;

-- ETF allowed flag
ALTER TABLE employees ADD COLUMN IF NOT EXISTS etf_allowed BOOLEAN DEFAULT false;

-- EPF/ETF eligibility flag
ALTER TABLE employees ADD COLUMN IF NOT EXISTS epf_etf_eligible BOOLEAN DEFAULT false;

-- Bank account holder name
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account_name TEXT;
