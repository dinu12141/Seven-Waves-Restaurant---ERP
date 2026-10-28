const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
  },
  global: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
  }
});

async function testPassword(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function test() {
  const email = 'waiter@sevenwaves.lk';
  const passwords = (process.env.SW_CANDIDATE_PASSWORDS || '').split(',').filter(Boolean);
  let loggedIn = false;
  let authData = null;

  for (const pw of passwords) {
    console.log(`Trying password: ${pw}...`);
    const res = await testPassword(email, pw);
    if (res.success) {
      console.log('Login successful with password:', pw);
      loggedIn = true;
      authData = res.data;
      break;
    } else {
      console.log('Failed:', res.error);
    }
  }

  if (!loggedIn) {
    console.error('Could not log in as waiter.');
    return;
  }

  console.log('User ID:', authData.user.id);
  console.log('Executing select query on orders table as waiter...');
  const { data, error } = await supabase
    .from('orders')
    .select(`id, order_number`)
    .limit(1);

  if (error) {
    console.error('ERROR JSON:', JSON.stringify(error, null, 2));
  } else {
    console.log('SUCCESS! Number of orders fetched:', data.length);
  }
}

test();
