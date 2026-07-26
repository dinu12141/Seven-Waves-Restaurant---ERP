import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testItemUOM() {
  console.log('--- Inspecting Items & Joined UOM Data ---');

  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  // Query items table with joins
  const { data: items, error: iErr } = await supabase
    .from('items')
    .select(`
      id, code, name, cost_price, last_purchase_price,
      purchase_uom_id, inventory_uom_id,
      pur_uom:uom!items_purchase_uom_id_fkey(id, code, name),
      inv_uom:uom!items_inventory_uom_id_fkey(id, code, name)
    `);

  if (iErr) {
    console.error('Error fetching items with FK names:', iErr);
    // Fallback without explicit FK constraint name
    const { data: fallbackItems, error: fErr } = await supabase
      .from('items')
      .select(`id, code, name, purchase_uom_id, inventory_uom_id, uom(id, code, name)`);
    console.log('Fallback items select:', fallbackItems, fErr);
  } else {
    console.log('Successfully fetched items with UOM joins:');
    console.table(items.map(i => ({
      ID: i.id,
      Code: i.code,
      Name: i.name,
      PurUomID: i.purchase_uom_id,
      PurUomName: i.pur_uom?.name || i.pur_uom?.code || 'NULL',
      InvUomID: i.inventory_uom_id,
      InvUomName: i.inv_uom?.name || i.inv_uom?.code || 'NULL'
    })));
  }

  // Also query uom table directly to see available UOMs
  const { data: uoms } = await supabase.from('uom').select('*');
  console.log('\nAll UOMs in Database:');
  console.table(uoms);
}

testItemUOM().catch(console.error);
