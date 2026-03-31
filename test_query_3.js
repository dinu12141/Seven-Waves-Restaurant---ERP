import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
        id,
        order_number,
        order_type,
        order_source,
        status,
        payment_status,
        customer_name,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        service_charge,
        created_at,
        updated_at,
        accepted_at,
        branch_id,
        waiter_id,
        waiter:profiles!orders_waiter_id_fkey ( full_name ),
        branches ( name ),
        order_items (
          id,
          menu_item_id,
          quantity,
          unit_price,
          total_price,
          status,
          notes,
          menu_items ( id, name, categories ( name ) )
        ),
        kot_tickets ( id, kot_number, status ),
        invoices (
          id, invoice_number, total, payment_status,
          cashier_id,
          payments ( amount, paid_at, created_at, payment_methods ( name ) )
        )
    `)
    .limit(1);

  if (error) {
    console.error('ERROR JSON:', JSON.stringify(error, null, 2));
  } else {
    console.log('SUCCESS length:', data.length);
  }
}

test();
