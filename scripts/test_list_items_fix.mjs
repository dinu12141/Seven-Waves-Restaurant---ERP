import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testListItemsFix() {
  console.log('--- Testing listItems Fix Query ---');

  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  const { data, error } = await supabase
    .from('items')
    .select(
      `id, code, name, purchase_uom_id, inventory_uom_id, last_purchase_price, cost_price,
       pur_uom:uom!items_purchase_uom_id_fkey(id, code, name),
       inv_uom:uom!items_inventory_uom_id_fkey(id, code, name)`
    )
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Query error:', error);
    return;
  }

  const mapped = data.map((item) => {
    const resolvedUomObj = item.pur_uom || item.inv_uom || null;
    const resolvedUomId = item.purchase_uom_id || item.inventory_uom_id || null;
    const resolvedUomName = resolvedUomObj?.name || resolvedUomObj?.code || 'PCS';
    const resolvedCost = item.last_purchase_price || item.cost_price || 0;

    return {
      id: item.id,
      code: item.code,
      name: item.name,
      purchase_uom_id: item.purchase_uom_id,
      inventory_uom_id: item.inventory_uom_id,
      default_uom_id: resolvedUomId,
      uom_id: resolvedUomId,
      uom_name: resolvedUomName,
      uom: resolvedUomObj,
      unit_cost: resolvedCost,
      last_purchase_price: item.last_purchase_price,
      cost_price: item.cost_price
    };
  });

  console.log('Mapped items output sample:');
  console.table(mapped.slice(0, 15));
}

testListItemsFix().catch(console.error);
