const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log('Logging in as admin@sevenwaves.lk...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
  });

  if (authError) {
    console.error('Login failed:', authError.message);
    return;
  }

  console.log('Querying orders table columns...');
  const { data: ordersCols, error: ordersErr } = await supabase
    .from('orders')
    .select('*')
    .limit(1);

  if (ordersErr) {
    console.error('orders error:', ordersErr.message);
  } else if (ordersCols && ordersCols.length > 0) {
    console.log('orders columns:', Object.keys(ordersCols[0]));
  } else {
    console.log('orders table is empty.');
  }

  console.log('Querying payments table columns...');
  const { data: paymentsCols, error: paymentsErr } = await supabase
    .from('payments')
    .select('*')
    .limit(1);

  if (paymentsErr) {
    console.error('payments error:', paymentsErr.message);
  } else if (paymentsCols && paymentsCols.length > 0) {
    console.log('payments columns:', Object.keys(paymentsCols[0]));
  } else {
    console.log('payments table is empty.');
  }
}

test();
