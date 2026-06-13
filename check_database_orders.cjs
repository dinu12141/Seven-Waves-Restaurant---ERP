const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

async function run() {
  console.log('Logging in as admin@sevenwaves.lk...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  if (authError) {
    console.error('Login failed:', authError.message);
    return;
  }
  console.log('Login successful.');

  console.log('--- 1. RECENT ORDERS ---');
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, order_number, status, payment_status, waiter_id, created_at, branch_id, total_amount')
    .order('created_at', { ascending: false })
    .limit(10);

  if (ordersError) {
    console.error('Error fetching orders:', ordersError);
  } else {
    console.log('Recent 10 orders:');
    orders.forEach(o => {
      console.log(`Order #${o.order_number}: ID=${o.id}, Status=${o.status}, Payment=${o.payment_status}, Waiter=${o.waiter_id}, Branch=${o.branch_id}, Total=${o.total_amount}, Created=${o.created_at}`);
    });
  }

  console.log('\n--- 2. RECENT KOT TICKETS ---');
  const { data: kots, error: kotsError } = await supabase
    .from('kot_tickets')
    .select('id, order_id, kitchen_id, kot_number, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (kotsError) {
    console.error('Error fetching KOTs:', kotsError);
  } else {
    console.log('Recent 10 KOT tickets:');
    kots.forEach(k => {
      console.log(`KOT #${k.kot_number}: ID=${k.id}, OrderID=${k.order_id}, KitchenID=${k.kitchen_id}, Status=${k.status}, Created=${k.created_at}`);
    });
  }

  console.log('\n--- 3. RECENT POS SHIFTS ---');
  const { data: shifts, error: shiftsError } = await supabase
    .from('pos_shifts')
    .select('id, branch_id, cashier_id, status, opened_at, closed_at')
    .order('opened_at', { ascending: false })
    .limit(10);

  if (shiftsError) {
    console.error('Error fetching shifts:', shiftsError);
  } else {
    console.log('Recent 10 shifts:');
    shifts.forEach(s => {
      console.log(`Shift ID=${s.id}, Branch=${s.branch_id}, Cashier=${s.cashier_id}, Status=${s.status}, Opened=${s.opened_at}, Closed=${s.closed_at}`);
    });
  }

  console.log('\n--- 4. UNRESOLVED/QUEUED ITEMS OR FAILED KOT ORDERS ---');
  const { data: queuedItems, error: itemsError } = await supabase
    .from('order_items')
    .select('id, order_id, menu_items(name), status, kitchen_id')
    .eq('status', 'queued')
    .limit(10);

  if (itemsError) {
    console.error('Error fetching queued items:', itemsError);
  } else {
    console.log('Queued items (not yet sent to kitchen):', queuedItems.length);
    queuedItems.forEach(i => {
      console.log(`Item ID=${i.id}, OrderID=${i.order_id}, MenuItem=${i.menu_items?.name}, Status=${i.status}, KitchenID=${i.kitchen_id}`);
    });
  }
}

run();
