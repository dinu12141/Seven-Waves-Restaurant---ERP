-- ═══════════════════════════════════════════════════════════
-- Fix: Ensure order_items table has total_price column
-- Problem: POS order placement fails with 400 because the
-- order_items table may be missing the total_price column
-- (schema.sql vs orders.sql mismatch).
-- Also adds other missing columns referenced by POS code.
-- ═══════════════════════════════════════════════════════════

-- Add total_price if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'total_price'
  ) THEN
    ALTER TABLE public.order_items
      ADD COLUMN total_price NUMERIC(12,2);
    
    -- Backfill existing rows: total_price = unit_price * quantity
    UPDATE public.order_items
    SET total_price = COALESCE(unit_price, 0) * COALESCE(quantity, 1)
    WHERE total_price IS NULL;

    RAISE NOTICE 'Added total_price column to order_items and backfilled existing rows.';
  ELSE
    RAISE NOTICE 'total_price column already exists on order_items — no action needed.';
  END IF;
END $$;

-- Add variant_id if missing (referenced in orders.sql but not schema.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'variant_id'
  ) THEN
    ALTER TABLE public.order_items
      ADD COLUMN variant_id UUID REFERENCES item_variants(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added variant_id column to order_items.';
  ELSE
    RAISE NOTICE 'variant_id column already exists — skipped.';
  END IF;
END $$;

-- Add updated_at if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.order_items
      ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    RAISE NOTICE 'Added updated_at column to order_items.';
  ELSE
    RAISE NOTICE 'updated_at column already exists — skipped.';
  END IF;
END $$;

-- Add void-related columns if missing (used by POS VOID workflow)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'void_reason'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN void_reason TEXT;
    RAISE NOTICE 'Added void_reason column.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'void_authorized_by'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN void_authorized_by UUID;
    RAISE NOTICE 'Added void_authorized_by column.';
  END IF;
END $$;

-- Add availability_status if missing (used by unavailable items feature)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'availability_status'
  ) THEN
    ALTER TABLE public.order_items
      ADD COLUMN availability_status TEXT DEFAULT 'available';
    RAISE NOTICE 'Added availability_status column.';
  ELSE
    RAISE NOTICE 'availability_status column already exists — skipped.';
  END IF;
END $$;

-- Ensure the status CHECK constraint includes 'void'
-- (the POS VOID workflow sets status = 'void')
DO $$
BEGIN
  -- Drop old constraint if it exists (it may not include 'void')
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'order_items'
      AND constraint_name = 'chk_oi_status'
  ) THEN
    ALTER TABLE public.order_items DROP CONSTRAINT chk_oi_status;
  END IF;

  -- Re-create with 'void' included
  ALTER TABLE public.order_items
    ADD CONSTRAINT chk_oi_status CHECK (
      status IN ('queued', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'cancelled', 'void', 'pending')
    );
  RAISE NOTICE 'Updated chk_oi_status constraint to include void and pending.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not update status constraint: %', SQLERRM;
END $$;
