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

  console.log('Login successful! User ID:', authData.user.id);

  console.log('Executing select query on orders table...');
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, order_type, order_source, status, payment_status,
      customer_name, customer_phone, subtotal, tax_amount, discount_amount,
      total_amount, delivery_charge, service_charge, notes, created_at, updated_at, accepted_at, waiter_id,
      table_id, table_number, branch_id,
      restaurant_tables ( table_number, section ),
      waiter:profiles!orders_waiter_id_fkey ( full_name ),
      order_items (
        id, quantity, unit_price, total_price, notes, status,
        menu_items ( id, name )
      ),
      kot_tickets (
        id, kot_number, status, kitchen_id,
        kot_items ( id, order_item_id, quantity, status )
      ),
      invoices ( id, invoice_number, total, payment_status, status )
    `)
    .limit(5);

  if (error) {
    console.error('ERROR JSON:', JSON.stringify(error, null, 2));
  } else {
    console.log('SUCCESS! Number of orders fetched:', data.length);
    if (data.length > 0) {
      console.log('First order status:', data[0].status);
    }
  }
}

test();
