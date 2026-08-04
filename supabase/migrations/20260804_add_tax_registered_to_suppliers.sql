-- Add is_tax_registered to suppliers
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_tax_registered BOOLEAN DEFAULT false;
