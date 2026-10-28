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
    password: process.env.SW_ADMIN_PASSWORD,
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

  if (ubError) {
    console.error('User branches query failed:', ubError);
    return;
  }
  console.log('User branches:', JSON.stringify(userBranches, null, 2));

  if (!userBranches || userBranches.length === 0) {
    console.error('No branches assigned to admin.');
    return;
  }

  const branchId = userBranches[0].branch_id;
  const companyId = userBranches[0].branches.company_id;
  console.log(`Using branchId: ${branchId}, companyId: ${companyId}`);

  // Check active shift
  console.log('3. Checking active shift via pos_get_active_shift...');
  const { data: activeShifts, error: shiftError } = await supabase
    .rpc('pos_get_active_shift', {
      p_branch_id: branchId,
      p_terminal_id: 'POS-1',
      p_cashier_id: userId
    });

  if (shiftError) {
    console.error('pos_get_active_shift failed:', shiftError);
  } else {
    console.log('Active shifts for terminal POS-1 & cashier admin:', activeShifts);
  }

  // Check any open shift for this branch
  console.log('4. Querying pos_shifts for any open shift at this branch...');
  const { data: openShifts, error: anyShiftError } = await supabase
    .from('pos_shifts')
    .select('*')
    .eq('branch_id', branchId)
    .eq('status', 'open');

  if (anyShiftError) {
    console.error('pos_shifts query failed:', anyShiftError);
  } else {
    console.log('All open shifts at branch:', openShifts);
  }

  // Try creating an order payload
  console.log('5. Attempting to insert test order...');
  const orderPayload = {
    branch_id: branchId,
    company_id: companyId,
    waiter_id: userId,
    order_type: 'dine_in',
    order_source: 'pos',
    status: 'accepted',
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

  // Try creating an order item
  console.log('6. Querying a menu item...');
  const { data: menuItems, error: menuError } = await supabase
    .from('menu_items')
    .select('id, name')
    .limit(1);

  if (menuError || !menuItems || menuItems.length === 0) {
    console.error('Could not get a menu item:', menuError);
    return;
  }
  const menuItemId = menuItems[0].id;
  console.log(`Using menu item: ${menuItems[0].name} (${menuItemId})`);

  console.log('7. Inserting order item...');
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
  console.log('Order Item Insertion SUCCESS:', newItem);

  // Generate KOT
  console.log('8. Triggering KOT generation via generate_kots_for_order RPC...');
  const { data: rpcRes, error: rpcError } = await supabase.rpc('generate_kots_for_order', {
    p_order_id: newOrder.id,
    p_branch_id: branchId,
    p_actor_id: userId
  });

  if (rpcError) {
    console.error('RPC generate_kots_for_order FAILED:', rpcError);
  } else {
    console.log('RPC generate_kots_for_order SUCCESS:', rpcRes);
  }

  // Cleanup
  console.log('9. Cleaning up test order...');
  const { error: delError } = await supabase.from('orders').delete().eq('id', newOrder.id);
  if (delError) {
    console.error('Cleanup failed:', delError);
  } else {
    console.log('Cleanup successful.');
  }
}

runTest();
