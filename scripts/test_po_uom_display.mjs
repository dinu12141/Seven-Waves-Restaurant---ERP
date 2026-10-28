import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testPOUomDisplay() {
  console.log('--- Testing PO Item UOM Resolution ---');

  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
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
    console.error('Fetch items error:', error);
    return;
  }

  const itemsList = (data || []).map((item) => {
    const resolvedUomObj = item.pur_uom || item.inv_uom || null;
    const resolvedUomId = item.purchase_uom_id || item.inventory_uom_id || null;
    const resolvedUomName = resolvedUomObj?.name || resolvedUomObj?.code || 'PCS';
    const resolvedCost = item.last_purchase_price || item.cost_price || 0;

    return {
      ...item,
      default_uom_id: resolvedUomId,
      uom_id: resolvedUomId,
      uom_name: resolvedUomName,
      unit_cost: resolvedCost,
    };
  });

  // Verify target items from screenshot: Apple, Orange, Salt, Sugar
  const targetNames = ['Apple', 'Orange', 'Salt', 'Sugar'];
  const matched = itemsList.filter((i) => targetNames.includes(i.name));

  console.log('\nUOM Resolution Results for Target Items:');
  console.table(
    matched.map((i) => ({
      ID: i.id,
      Name: i.name,
      Resolved_UOM_ID: i.uom_id,
      Resolved_UOM_Name: i.uom_name,
      Unit_Cost: i.unit_cost,
    }))
  );

  const allHaveValidUom = matched.every((i) => i.uom_name !== 'UNIT' && i.uom_id !== null);
  if (allHaveValidUom) {
    console.log('✅ ALL TARGET ITEMS RESOLVED REAL UOM NAMES CLEANLY!');
  } else {
    console.log('⚠️ Some items still defaulted to UNIT or null');
  }
}

testPOUomDisplay().catch(console.error);
