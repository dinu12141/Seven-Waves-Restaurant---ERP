const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
  }
});

async function test() {
  console.log('Logging in as waiter@sevenwaves.lk...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'waiter@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
  });

  if (authError) {
    console.error('Login failed:', authError.message);
    return;
  }

  const userId = authData.user.id;
  const branchId = '340efb20-513a-4d99-b1e7-f32f938e31a8';
  const companyId = '5c7ff29c-418a-461a-9624-3667375c2af4';

  const orderPayload = {
    branch_id: branchId,
    company_id: companyId,
    waiter_id: userId,
    order_type: 'dine_in',
    order_source: 'pos',
    status: 'pending_waiter',
    payment_status: 'unpaid',
    total_amount: 100,
    subtotal: 100,
    tax_amount: 0,
    service_charge: 0,
    discount_amount: 0,
    created_at: new Date().toISOString(),
  };

  console.log('Inserting order payload...');
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert(orderPayload)
    .select('id, order_number')
    .single();

  if (orderError) {
    console.error('INSERT ERROR:', JSON.stringify(orderError, null, 2));
  } else {
    console.log('INSERT SUCCESS:', order);
    // Cleanup
    await supabase.from('orders').delete().eq('id', order.id);
    console.log('Test order cleaned up.');
  }
}

test();
