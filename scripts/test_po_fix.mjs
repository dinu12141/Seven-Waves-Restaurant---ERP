import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testPOFix() {
  console.log('--- Testing PO Line Payload Sanitization ---');

  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
  });

  const { data: po } = await supabase.from('purchase_orders').select('id').limit(1).single();
  const { data: item } = await supabase.from('items').select('*').limit(1).single();
  const { data: defaultUom } = await supabase.from('uom').select('id').limit(1).single();

  const rawLine = {
    line_number: 1,
    item_id: item.id,
    description: item.name,
    uom_id: item.purchase_uom_id || item.inventory_uom_id || item.default_uom_id || defaultUom.id,
    quantity: 10,
    unit_price: item.cost_price || item.last_purchase_price || 100,
    discount_pct: 0,
    tax_pct: 0,
    warehouse_id: '', // EMPTY STRING!
    notes: '',
  };

  // Sanitized payload mapping
  const sanitizedPayload = [{
    po_id: po.id,
    line_number: rawLine.line_number,
    item_id: rawLine.item_id,
    description: rawLine.description || null,
    uom_id: (rawLine.uom_id && rawLine.uom_id.trim()) ? rawLine.uom_id : defaultUom.id,
    quantity: Number(rawLine.quantity) || 1,
    unit_price: Number(rawLine.unit_price) || 0,
    discount_pct: Number(rawLine.discount_pct) || 0,
    tax_pct: Number(rawLine.tax_pct) || 0,
    warehouse_id: (rawLine.warehouse_id && rawLine.warehouse_id.trim()) ? rawLine.warehouse_id : null,
    notes: (rawLine.notes && rawLine.notes.trim()) ? rawLine.notes : null,
  }];

  console.log('Sanitized payload:', sanitizedPayload);

  const { data, error } = await supabase.from('purchase_order_lines').insert(sanitizedPayload).select();
  if (error) {
    console.error('❌ Insert failed:', error);
  } else {
    console.log('✅ Insert SUCCESSFUL! Row ID:', data[0].id);
    await supabase.from('purchase_order_lines').delete().eq('id', data[0].id);
  }
}

testPOFix().catch(console.error);
