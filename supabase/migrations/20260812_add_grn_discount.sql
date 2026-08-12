-- Migration to add discount fields to goods_receipts
ALTER TABLE goods_receipts ADD COLUMN discount_type TEXT DEFAULT 'percentage';
ALTER TABLE goods_receipts ADD COLUMN discount_value NUMERIC(14,2) DEFAULT 0;
ALTER TABLE goods_receipts ADD COLUMN discount_amount NUMERIC(14,2) DEFAULT 0;

ALTER TABLE goods_receipts ADD CONSTRAINT chk_grn_discount_type CHECK (
    discount_type IN ('percentage', 'amount')
);
