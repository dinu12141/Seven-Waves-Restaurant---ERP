import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function inspectPOLinesSchema() {
  console.log('--- Inspecting purchase_order_lines Table Schema & Columns ---');

  // Sign in as Admin
  const loginRes = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
  });

  if (loginRes.error) {
    console.error('Admin login error:', loginRes.error);
    return;
  }

  // Fetch 1 row or attempt a dummy query to see exact columns
  const { data, error } = await supabase.from('purchase_order_lines').select('*').limit(1);
  if (error) {
    console.error('Error selecting purchase_order_lines:', error);
  } else {
    console.log('Successfully selected purchase_order_lines! Sample row / structure:', data);
    if (data.length > 0) {
      console.log('Keys in existing row:', Object.keys(data[0]));
    }
  }

  // Try inserting a dummy row with individual columns to pinpoint which column causes HTTP 400
  const dummyPayload = {
    po_id: '00000000-0000-0000-0000-000000000000',
    line_number: 1,
    item_id: '00000000-0000-0000-0000-000000000000',
    description: 'test',
    uom_id: '00000000-0000-0000-0000-000000000000',
    quantity: 1,
    unit_price: 100,
    discount_pct: 0,
    tax_pct: 0,
    warehouse_id: '00000000-0000-0000-0000-000000000000',
    notes: 'test'
  };

  const { error: insErr } = await supabase.from('purchase_order_lines').insert([dummyPayload]);
  console.log('Insert test result:', insErr ? insErr : 'Success');
}

inspectPOLinesSchema().catch(console.error);
