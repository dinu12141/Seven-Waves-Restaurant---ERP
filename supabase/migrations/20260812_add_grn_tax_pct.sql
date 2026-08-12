-- Add tax_pct to goods_receipts
ALTER TABLE goods_receipts ADD COLUMN tax_pct NUMERIC(5,2) DEFAULT 0;
