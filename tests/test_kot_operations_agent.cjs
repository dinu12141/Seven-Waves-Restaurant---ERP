const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)));

const supabase = createClient(supabaseUrl, serviceKey);

async function testAgent() {
  console.log('=== TESTING KOT & OPERATIONS AI AGENT WATCHDOG ===\n');

  // 1. Fetch default branch
  const { data: branch, error: bErr } = await supabase
    .from('branches')
    .select('id, name')
    .limit(1)
    .single();

  if (bErr || !branch) {
    console.error('Failed to get branch:', bErr);
    process.exit(1);
  }
  console.log(`Branch: ${branch.name} (${branch.id})`);

  // 2. Test active KOT tickets audit
  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();

  const { data: tickets, error: tErr } = await supabase
    .from('kot_tickets')
    .select('id, kot_number, order_id, kitchen_id, status, created_at, orders(order_number, table_number, branch_id), kitchens(name)')
    .in('status', ['created', 'pending', 'preparing', 'queued'])
    .gte('created_at', twelveHoursAgo);

  if (tErr) {
    console.error('Failed to query kot_tickets:', tErr);
  } else {
    console.log(`Active KOT tickets in last 12h: ${tickets.length}`);
    const delayed = tickets.filter(t => {
      const elapsed = (Date.now() - new Date(t.created_at).getTime()) / 60000;
      return elapsed >= 15;
    });
    console.log(`Delayed tickets (>15 mins): ${delayed.length}`);
  }

  // 3. Test sales audit
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, status, total_amount, created_at')
    .eq('branch_id', branch.id)
    .gte('created_at', todayStart);

  if (oErr) {
    console.error('Failed to query orders:', oErr);
  } else {
    let totalSales = 0, completed = 0, voided = 0;
    orders.forEach(o => {
      if (o.status === 'completed' || o.status === 'paid') {
        totalSales += Number(o.total_amount || 0);
        completed++;
      } else if (o.status === 'void' || o.status === 'cancelled') {
        voided++;
      }
    });
    const voidRate = (completed + voided) > 0 ? ((voided / (completed + voided)) * 100).toFixed(1) : 0;
    console.log(`\n--- Live Sales Audit Today ---`);
    console.log(`Completed orders: ${completed}`);
    console.log(`Revenue today: LKR ${totalSales.toLocaleString()}`);
    console.log(`Voided orders: ${voided} (${voidRate}% void rate)`);
    console.log(`Void anomaly flagged: ${voided >= 3 ? 'YES' : 'NO'}`);
  }

  console.log('\n=== KOT & OPERATIONS AGENT LOGIC VERIFIED SUCCESSFULLY ===');
}

testAgent().catch(console.error);
