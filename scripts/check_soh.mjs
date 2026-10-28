import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)))

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkSOH() {
  const { count: sohCount, data: soh } = await supabase.from('stock_on_hand').select('*, items(name, code), warehouses(name)').limit(10)
  console.log(`stock_on_hand rows: ${sohCount || soh?.length}`)
  console.log('Sample stock_on_hand:', soh?.slice(0, 5))

  const { count: ledCount } = await supabase.from('inventory_ledger').select('*', { count: 'exact', head: true })
  console.log(`inventory_ledger rows: ${ledCount}`)

  const { data: wh } = await supabase.from('warehouses').select('id, name, is_active')
  console.log('Warehouses / Stores:', wh)
}

checkSOH().catch(console.error)
