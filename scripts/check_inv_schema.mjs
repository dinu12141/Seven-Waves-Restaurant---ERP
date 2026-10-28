import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)))

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function inspectInventorySchema() {
  const candidateTables = [
    'warehouses', 'stores', 'inventory_locations',
    'inventory_items', 'items', 'item_locations', 'item_warehouse',
    'stock_levels', 'stock_balances', 'warehouse_stock',
    'goods_receipts', 'goods_receipt_lines', 'goods_receipt_items',
    'goods_issues', 'goods_issue_lines', 'goods_issue_items',
    'inventory_documents', 'inventory_document_lines',
    'recipes', 'recipe_items', 'recipe_ingredients', 'menu_item_recipes',
    'wastage', 'wastage_logs', 'inventory_wastage', 'spoilage',
    'stock_movements', 'stock_transactions'
  ]

  for (const t of candidateTables) {
    const { data, error, count } = await supabase.from(t).select('*', { count: 'exact', head: true })
    if (error) {
      // ignore table not found
    } else {
      console.log(`Table '${t}': ${count} rows`)
    }
  }
}

inspectInventorySchema().catch(console.error)
