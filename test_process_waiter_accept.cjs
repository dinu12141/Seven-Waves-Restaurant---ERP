const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

async function runTest() {
  console.log('1. Logging in as admin@sevenwaves.lk...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  if (authError) {
    console.error('Login failed:', authError.message);
    return;
  }
  const userId = authData.user.id;
  console.log('Login successful. Admin User ID:', userId);

  // Get first branch
  console.log('2. Querying user branches...');
  const { data: userBranches, error: ubError } = await supabase
    .from('user_branches')
    .select('branch_id, branches(name, company_id)')
    .eq('user_id', userId);

  if (ubError || !userBranches || userBranches.length === 0) {
    console.error('No branches assigned or query failed:', ubError);
    return;
  }
  const branchId = userBranches[0].branch_id;
  const companyId = userBranches[0].branches.company_id;
  console.log(`Using branchId: ${branchId}, companyId: ${companyId}`);

  // Try creating an order payload (status: pending_waiter)
  console.log('3. Inserting test pending_waiter order...');
  const orderPayload = {
    branch_id: branchId,
    company_id: companyId,
    waiter_id: userId,
    order_type: 'dine_in',
    order_source: 'pos',
    status: 'pending_waiter',
    payment_status: 'unpaid',
    total_amount: 120,
    subtotal: 120,
    tax_amount: 0,
    service_charge: 0,
    discount_amount: 0,
  };

  const { data: newOrder, error: insertError } = await supabase
    .from('orders')
    .insert(orderPayload)
    .select('id, order_number')
    .single();

  if (insertError) {
    console.error('Order Insertion FAILED:', JSON.stringify(insertError, null, 2));
    return;
  }
  console.log('Order Insertion SUCCESS:', newOrder);

  // Get a menu item
  const { data: menuItems } = await supabase.from('menu_items').select('id').limit(1);
  const menuItemId = menuItems[0].id;

  // Insert order item
  console.log('4. Inserting order item...');
  const { data: newItem, error: itemError } = await supabase
    .from('order_items')
    .insert({
      order_id: newOrder.id,
      menu_item_id: menuItemId,
      quantity: 1,
      unit_price: 120,
      total_price: 120,
      status: 'queued'
    })
    .select('*')
    .single();

  if (itemError) {
    console.error('Order Item Insertion FAILED:', itemError);
    return;
  }
  console.log('Order Item Insertion SUCCESS');

  // Call process_waiter_accept
  console.log('5. Calling process_waiter_accept RPC...');
  const { data: rpcRes, error: rpcError } = await supabase.rpc('process_waiter_accept', {
    p_order_id: newOrder.id
  });

  if (rpcError) {
    console.error('RPC process_waiter_accept FAILED:', rpcError);
  } else {
    console.log('RPC process_waiter_accept SUCCESS:', rpcRes);
  }

  // Cleanup
  console.log('6. Cleaning up test order...');
  await supabase.from('orders').delete().eq('id', newOrder.id);
  console.log('Cleanup successful.');
}

runTest();
