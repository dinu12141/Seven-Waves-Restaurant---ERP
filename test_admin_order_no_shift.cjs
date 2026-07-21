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

  // Get active shift
  const branchId = '340efb20-513a-4d99-b1e7-f32f938e31a8';
  const companyId = '5c7ff29c-418a-461a-9624-3667375c2af4';

  console.log('2. Querying active shift...');
  const { data: activeShifts } = await supabase
    .rpc('pos_get_active_shift', {
      p_branch_id: branchId,
      p_terminal_id: 'POS-1',
      p_cashier_id: userId
    });

  console.log('Active shifts:', activeShifts);

  const activeShift = activeShifts && activeShifts[0];
  if (activeShift) {
    console.log(`3. Active shift found: ${activeShift.id}. Closing it to test no-shift scenario...`);
    const { data: closeRes, error: closeError } = await supabase
      .rpc('pos_close_shift', {
        p_shift_id: activeShift.id,
        p_counted_cash: 24000,
        p_counted_card_slips: 0,
        p_counted_qr_total: 0,
        p_counted_bank_total: 0,
        p_closing_note: 'Testing close',
        p_approved_by: userId,
        p_approval_note: 'Approved for test'
      });

    if (closeError) {
      console.error('Failed to close shift:', closeError);
      return;
    }
    console.log('Shift closed successfully:', closeRes);
  } else {
    console.log('3. No active shift found.');
  }

  // Now verify active shift is indeed closed
  const { data: activeShiftsAfter } = await supabase
    .rpc('pos_get_active_shift', {
      p_branch_id: branchId,
      p_terminal_id: 'POS-1',
      p_cashier_id: userId
    });
  console.log('Active shifts after closing:', activeShiftsAfter);

  // Try creating an order payload (without an active shift)
  console.log('4. Attempting to insert order when admin has NO active shift...');
  const orderPayload = {
    branch_id: branchId,
    company_id: companyId,
    waiter_id: userId,
    order_type: 'dine_in',
    order_source: 'pos',
    status: 'accepted',
    payment_status: 'unpaid',
    total_amount: 150,
    subtotal: 150,
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
    console.error('Order Insertion FAILED without shift:', JSON.stringify(insertError, null, 2));
  } else {
    console.log('Order Insertion SUCCESS without shift:', newOrder);

    // Get a menu item
    const { data: menuItems } = await supabase.from('menu_items').select('id').limit(1);
    const menuItemId = menuItems[0].id;

    // Insert order item
    console.log('5. Inserting order item...');
    const { error: itemError } = await supabase
      .from('order_items')
      .insert({
        order_id: newOrder.id,
        menu_item_id: menuItemId,
        quantity: 1,
        unit_price: 150,
        total_price: 150,
        status: 'queued'
      })
      .select('*')
      .single();

    if (itemError) {
      console.error('Order Item Insertion FAILED without shift:', itemError);
    } else {
      console.log('Order Item Insertion SUCCESS');

      // Generate KOT
      console.log('6. Triggering KOT generation via generate_kots_for_order RPC...');
      const { data: rpcRes, error: rpcError } = await supabase.rpc('generate_kots_for_order', {
        p_order_id: newOrder.id,
        p_branch_id: branchId,
        p_actor_id: userId
      });

      if (rpcError) {
        console.error('RPC generate_kots_for_order FAILED without shift:', rpcError);
      } else {
        console.log('RPC generate_kots_for_order SUCCESS without shift:', rpcRes);
      }
    }

    // Cleanup
    console.log('7. Cleaning up test order...');
    await supabase.from('orders').delete().eq('id', newOrder.id);
    console.log('Cleanup successful.');
  }

  // Restore active shift so the admin's shift remains open after the test
  console.log('8. Re-opening active shift to restore database state...');
  const { data: openRes, error: openError } = await supabase
    .rpc('pos_open_shift', {
      p_branch_id: branchId,
      p_terminal_id: 'POS-1',
      p_cashier_id: userId,
      p_opening_cash_float: 25000,
      p_opening_note: 'Restored after test'
    });

  if (openError) {
    console.error('Failed to restore open shift:', openError);
  } else {
    console.log('Open shift restored:', openRes);
  }
}

runTest();
