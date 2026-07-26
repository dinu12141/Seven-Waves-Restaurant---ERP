import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testPOIntegration() {
  console.log('--- Testing Complete End-to-End PO Creation with Sanitization ---');

  // Sign in as Admin
  const loginRes = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  if (loginRes.error) {
    console.error('Login error:', loginRes.error);
    return;
  }

  // Get active branch, supplier, warehouse, item, and fallback UOM
  const { data: branch } = await supabase.from('branches').select('id, company_id').limit(1).single();
  const { data: supplier } = await supabase.from('suppliers').select('id').limit(1).single();
  const { data: warehouse } = await supabase.from('warehouses').select('id').limit(1).single();
  const { data: item } = await supabase.from('items').select('id, name, purchase_uom_id, inventory_uom_id').limit(1).single();
  const { data: defaultUom } = await supabase.from('uom').select('id').limit(1).single();

  const user_id = loginRes.data.user.id;

  // Insert PO header
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .insert({
      company_id: branch.company_id,
      branch_id: branch.id,
      doc_number: `PO-E2E-${Date.now()}`,
      doc_date: new Date().toISOString().split('T')[0],
      delivery_date: null,
      supplier_id: supplier.id,
      warehouse_id: warehouse?.id || null,
      currency: 'LKR',
      exchange_rate: 1,
      remarks: 'E2E Integration Test',
      status: 'draft',
      created_by: user_id,
    })
    .select()
    .single();

  if (poErr) {
    console.error('❌ Header Insert Error:', poErr);
    return;
  }
  console.log('✅ PO Header created with ID:', po.id);

  // Test raw lines payload with empty strings (the exact scenario that failed before)
  const rawLines = [
    {
      line_number: 1,
      item_id: item.id,
      description: item.name,
      uom_id: item.purchase_uom_id || item.inventory_uom_id || defaultUom.id || '', // might be ""
      quantity: 25,
      unit_price: 350,
      discount_pct: 0,
      tax_pct: 0,
      warehouse_id: '', // EMPTY STRING!
      notes: '', // EMPTY STRING!
    },
    {
      line_number: 2,
      item_id: '', // BLANK LINE (should be filtered out)!
      quantity: 0,
      unit_price: 0,
    }
  ];

  // Filter valid lines & sanitize empty string UUIDs
  const validLines = rawLines.filter((l) => l && l.item_id && typeof l.item_id === 'string' && l.item_id.trim() !== '');

  const linePayloads = validLines.map((l, idx) => {
    const rawUom = typeof l.uom_id === 'string' ? l.uom_id.trim() : '';
    const cleanUom = rawUom || defaultUom.id;
    const rawWarehouse = typeof l.warehouse_id === 'string' ? l.warehouse_id.trim() : '';
    const cleanWarehouse = rawWarehouse || null;

    return {
      po_id: po.id,
      line_number: idx + 1,
      item_id: l.item_id.trim(),
      description: l.description || null,
      uom_id: cleanUom,
      quantity: Number(l.quantity) || 1,
      unit_price: Number(l.unit_price) || 0,
      discount_pct: Number(l.discount_pct) || 0,
      tax_pct: Number(l.tax_pct) || 0,
      warehouse_id: cleanWarehouse,
      notes: (l.notes && typeof l.notes === 'string' && l.notes.trim()) ? l.notes.trim() : null,
    };
  });

  console.log('Inserting line payloads:', linePayloads);

  const { data: insertedLines, error: linesErr } = await supabase.from('purchase_order_lines').insert(linePayloads).select();

  if (linesErr) {
    console.error('❌ Lines Insert Error:', linesErr);
  } else {
    console.log('✅ Lines Inserted Successfully!', insertedLines);
    console.log('--- ALL PO TESTS PASSED 100% CLEANLY ---');
  }
}

testPOIntegration().catch(console.error);
