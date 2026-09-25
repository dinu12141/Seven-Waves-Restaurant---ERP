-- Migration: 20260925_grn_item_wise_discount.sql
-- Description: Add item-wise discount support to goods_receipt_lines table

ALTER TABLE public.goods_receipt_lines
  ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,4) DEFAULT 0;

COMMENT ON COLUMN public.goods_receipt_lines.discount_type IS 'Discount type: percentage (%) or amount (fixed)';
COMMENT ON COLUMN public.goods_receipt_lines.discount_value IS 'Discount input value entered by user';
COMMENT ON COLUMN public.goods_receipt_lines.discount_amount IS 'Calculated monetary discount amount on this line';
