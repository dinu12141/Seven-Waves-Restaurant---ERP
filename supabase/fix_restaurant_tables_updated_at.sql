-- ============================================================================
-- Migration: Add missing updated_at column to restaurant_tables
-- Resolves: Error: column "updated_at" of relation "restaurant_tables" does not exist
-- ============================================================================

ALTER TABLE public.restaurant_tables 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure trigger or default function is safely attached
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_restaurant_tables_updated_at ON public.restaurant_tables;
CREATE TRIGGER tr_restaurant_tables_updated_at
BEFORE UPDATE ON public.restaurant_tables
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();
