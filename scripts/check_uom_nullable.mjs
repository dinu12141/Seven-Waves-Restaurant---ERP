import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkUomNullable() {
  console.log('--- Checking purchase_order_lines uom_id nullability ---');

  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  const { data: po } = await supabase.from('purchase_orders').select('id').limit(1).single();

  // Test inserting line with uom_id = null
  const testPayload = [{
    po_id: po.id,
    line_number: 999,
    item_id: '9abed623-7e4c-4a07-929e-ac7b8f722ab1',
    description: 'Test Null UOM',
    uom_id: null, // NULL!
    quantity: 1,
    unit_price: 100,
    discount_pct: 0,
    tax_pct: 0,
    warehouse_id: null,
    notes: null,
  }];

  const { data, error } = await supabase.from('purchase_order_lines').insert(testPayload).select();
  if (error) {
    console.log('Result for uom_id = null:', error);
  } else {
    console.log('✅ uom_id = null is allowed! Inserted row ID:', data[0].id);
    // Cleanup
    await supabase.from('purchase_order_lines').delete().eq('id', data[0].id);
  }

  // Also get a valid default UOM ID from uom table
  const { data: uoms } = await supabase.from('uom').select('id, code, name').limit(1);
  console.log('Sample UOM from DB:', uoms?.[0]);
}

checkUomNullable().catch(console.error);
