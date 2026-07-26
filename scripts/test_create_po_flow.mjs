import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testCreatePOFlow() {
  console.log('--- Testing Complete PO Creation Flow ---');

  // Sign in as Admin
  const loginRes = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  if (loginRes.error) {
    console.error('Admin login error:', loginRes.error);
    return;
  }

  // 1. Get branch & company
  const { data: branch } = await supabase.from('branches').select('id, company_id').limit(1).single();
  console.log('Branch:', branch);

  // 2. Get supplier
  const { data: supplier } = await supabase.from('suppliers').select('id').limit(1).single();
  console.log('Supplier:', supplier);

  // 3. Get item from items or inventory_items
  const { data: item1 } = await supabase.from('items').select('*').limit(1);
  const { data: item2 } = await supabase.from('inventory_items').select('*').limit(1);
  console.log('items count:', item1?.length);
  console.log('inventory_items count:', item2?.length);
  const item = item1?.[0] || item2?.[0];
  console.log('Item sample:', item);

  // 4. Get warehouse
  const { data: warehouse } = await supabase.from('warehouses').select('id').limit(1).single();
  console.log('Warehouse:', warehouse);

  // Attempt header insert
  const poPayload = {
    company_id: branch.company_id,
    branch_id: branch.id,
    doc_number: `PO-TEST-${Date.now()}`,
    doc_date: new Date().toISOString().split('T')[0],
    supplier_id: supplier.id,
    warehouse_id: warehouse ? warehouse.id : null,
    currency: 'LKR',
    exchange_rate: 1,
    status: 'draft',
    created_by: loginRes.data.user.id,
  };

  const { data: po, error: poErr } = await supabase.from('purchase_orders').insert(poPayload).select().single();
  if (poErr) {
    console.error('❌ PO Header insert error:', poErr);
    return;
  }
  console.log('✅ PO Header created! ID:', po.id);

  // Attempt line insert with the exact payload from procurementService.ts
  const uomId = item.purchase_uom_id || item.default_uom_id;
  const linePayloads = [{
    po_id: po.id,
    line_number: 1,
    item_id: item.id,
    description: 'Test Item',
    uom_id: uomId,
    quantity: 5,
    unit_price: 150,
    discount_pct: 0,
    tax_pct: 0,
    warehouse_id: warehouse ? warehouse.id : null,
    notes: null,
  }];

  console.log('Line payload to insert:', linePayloads);
  const { data: linesData, error: linesErr } = await supabase.from('purchase_order_lines').insert(linePayloads).select();
  if (linesErr) {
    console.error('❌ PO Lines insert error:', linesErr);
  } else {
    console.log('✅ PO Lines inserted successfully!', linesData);
  }
}

testCreatePOFlow().catch(console.error);
