-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDER & PAYMENT DATA INTEGRITY FIXES
-- Seven Waves Restaurant ERP
-- Bugs: BUG-DB-007, BUG-DB-012, BUG-DB-013 (DBauditor 2026-07-17)
--       BUG-WF-001 (WorkflowAuditor 2026-07-17)
--
-- Sections:
--   1. Payments: add amount > 0 and valid method constraints (BUG-DB-013)
--   2. Orders: add discount non-negative + service_charge column (BUG-DB-012)
--   3. Duplicate status trigger: drop trg_order_status from schema.sql (BUG-DB-007)
--
-- HOW TO APPLY:
--   Paste into Supabase Dashboard → SQL Editor.
--   These are additive ALTER TABLE statements — safe on live tables.
--   The CHECK constraints will fail if existing data violates them; see notes below.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — PAYMENTS TABLE CONSTRAINTS
-- BUG-DB-013: zero/negative amount payments can be inserted
-- ─────────────────────────────────────────────────────────────────────────────

-- Check for existing zero/negative amounts before adding constraint:
-- SELECT COUNT(*) FROM payments WHERE amount <= 0;
-- If > 0, clean those up or convert to complimentary before applying.

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS chk_payment_amount_positive;
ALTER TABLE public.payments
  ADD CONSTRAINT chk_payment_amount_positive
  CHECK (amount > 0);

-- payment_method CHECK omitted: codebase uses 15+ values (cash, card, credit_card,
-- debit_card, mobile, online, voucher, loyalty, split, complimentary, qr, qr_code,
-- bank, bank_transfer, credit, cheque, wowcher, other).  Validation is enforced at
-- the application layer (PaymentMethod type in erp.types.ts).


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — ORDERS TABLE: discount_amount cap + service_charge_rate column
-- BUG-DB-012: discount > 100% produces negative total
-- BUG-DB-010: service_charge_rate hardcoded in frontend, not in DB
-- ─────────────────────────────────────────────────────────────────────────────

-- Guard against negative discount (discount_amount is the absolute value, not %)
-- The frontend computes: discount_amount = subtotal * (discount_pct / 100)
-- We add 1 cent tolerance for floating-point rounding
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS chk_discount_non_negative;
ALTER TABLE public.orders
  ADD CONSTRAINT chk_discount_non_negative
  CHECK (
    discount_amount IS NULL
    OR (discount_amount >= 0 AND discount_amount <= subtotal + 0.01)
  );

-- Add service_charge_rate to orders table so each order records the rate used
-- (supports per-branch rates and audit trail — not just what was charged)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_rate NUMERIC(5,4) DEFAULT 0.10;

-- Add delivery_charge to total_amount computation (BUG-WF-001)
-- delivery_charge already exists as a column; ensure it's included in total
-- (the actual fix is in orderStore.js:55 — this ensures the DB column is correct)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(10,2) DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — DUPLICATE STATUS TRIGGER CLEANUP
-- BUG-DB-007: both trg_order_status (schema.sql) and trg_order_status_log (orders.sql)
--             fire on every order status change, creating double audit log entries
-- Fix: Drop the simpler one from schema.sql; keep trg_order_status_log which
--      also captures previous_status for a full audit trail
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: If the live DB was only ever loaded from orders.sql (not schema.sql),
-- these DROP statements are harmless no-ops.
DROP TRIGGER IF EXISTS trg_order_status ON public.orders;
DROP FUNCTION IF EXISTS public.log_order_status();

-- Verify only trg_order_status_log remains:
-- SELECT trigger_name, event_manipulation, action_statement
-- FROM information_schema.triggers
-- WHERE event_object_table = 'orders'
--   AND trigger_name LIKE 'trg_order_status%';
-- Expected: one row — trg_order_status_log


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — COMPANY_SETTINGS: service_charge_rate column
-- Allows per-branch service charge rate to be read by the frontend
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='company_settings') THEN
    -- Add service_charge_rate if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='company_settings' AND column_name='service_charge_rate'
    ) THEN
      EXECUTE 'ALTER TABLE public.company_settings ADD COLUMN service_charge_rate NUMERIC(5,4) DEFAULT 0.10';
      RAISE NOTICE '[OrderFix] ✅ service_charge_rate column added to company_settings';
    END IF;
  END IF;

  -- Same for branch_settings if that table exists instead
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='branch_settings') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='branch_settings' AND column_name='service_charge_rate'
    ) THEN
      EXECUTE 'ALTER TABLE public.branch_settings ADD COLUMN service_charge_rate NUMERIC(5,4) DEFAULT 0.10';
      RAISE NOTICE '[OrderFix] ✅ service_charge_rate column added to branch_settings';
    END IF;
  END IF;
END $$;
