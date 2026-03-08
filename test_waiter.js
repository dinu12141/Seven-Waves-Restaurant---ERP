const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const url = env.split('\n').find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim();
const key = env.split('\n').find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

async function run() {
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'waiter@sevenwaves.lk',
    password: '123456'
  });
  console.log('Login waiter@sevenwaves.lk:', auth?.user?.email, authErr?.message);
  
  if (auth?.user) {
     const { data: pending } = await supabase.rpc('get_pending_orders_for_shift');
     console.log('Pending via RPC:', pending);
     
     const { data: direct } = await supabase.from('orders').select('*').eq('status', 'pending_waiter');
     console.log('Direct Select pending_waiter:', direct?.length);
  }
}
run();
