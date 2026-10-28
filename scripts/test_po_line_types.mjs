import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testPOLineTypes() {
  console.log('--- Testing PO Line payload validation & empty string UUIDs ---');

  // Sign in as Admin
  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
  });

  const { data: po } = await supabase.from('purchase_orders').select('id').limit(1).single();

  // Test inserting line with uom_id = "" (empty string)
  const invalidPayload = [{
    po_id: po.id,
    line_number: 1,
    item_id: '9abed623-7e4c-4a07-929e-ac7b8f722ab1',
    description: 'Test Item',
    uom_id: '', // EMPTY STRING!
    quantity: 5,
    unit_price: 150,
    discount_pct: 0,
    tax_pct: 0,
    warehouse_id: null,
    notes: null,
  }];

  console.log('Attempting insert with uom_id = "" ...');
  const { error } = await supabase.from('purchase_order_lines').insert(invalidPayload);
  console.log('Result for uom_id = "":', error ? error : 'Success');
}

testPOLineTypes().catch(console.error);
