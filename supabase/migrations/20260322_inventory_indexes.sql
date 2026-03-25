-- ==============================================================================
-- PERFORMANCE INDEXES FOR INVENTORY MODULE
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_inv_ledger_item_wh_posted 
  ON inventory_ledger (item_id, warehouse_id, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_ledger_document
  ON inventory_ledger (document_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_on_hand_uniq 
  ON stock_on_hand (company_id, warehouse_id, item_id);

CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe 
  ON recipe_items (recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipes_menu_item_active 
  ON recipes (menu_item_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_inv_docs_type_status 
  ON inventory_documents (doc_type, status);

CREATE INDEX IF NOT EXISTS idx_inv_doc_lines_document 
  ON inventory_document_lines (document_id);

CREATE INDEX IF NOT EXISTS idx_items_category_active 
  ON items (company_id, category_id, is_active) WHERE is_active = true;
