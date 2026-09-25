-- Migration: 20260925_optimize_grn_indexes.sql
-- Optimizes Goods Receipts (GRN) querying and line retrieval speed

CREATE INDEX IF NOT EXISTS idx_grl_grn_id ON public.goods_receipt_lines(grn_id);
CREATE INDEX IF NOT EXISTS idx_grl_item_id ON public.goods_receipt_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_grl_uom_id ON public.goods_receipt_lines(uom_id);
CREATE INDEX IF NOT EXISTS idx_grn_company_doc_date ON public.goods_receipts(company_id, doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_grn_company_status ON public.goods_receipts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_grn_supplier_id ON public.goods_receipts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_grn_warehouse_id ON public.goods_receipts(warehouse_id);
