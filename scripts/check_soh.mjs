import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI5NjA4MSwiZXhwIjoyMDg2ODcyMDgxfQ.ph7Yy1Izhz21kmJSKXpowbWJYGYMz0YxlpoVG6hBABA'

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
