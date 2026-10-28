const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
  });

  const { data: rows, error } = await supabase.from('loyalty_transactions').select('*').limit(1);
  if (error) {
    console.error('loyalty_transactions error:', error.message);
  } else if (rows && rows.length > 0) {
    console.log('loyalty_transactions columns:', Object.keys(rows[0]));
  } else {
    console.log('loyalty_transactions is empty. Checking columns...');
    const fields = ['id', 'type', 'transaction_type', 'coins', 'points', 'note', 'description'];
    for (const f of fields) {
      const { error: fErr } = await supabase.from('loyalty_transactions').select(f).limit(1);
      console.log(`Column '${f}':`, fErr ? `FAILED (${fErr.message})` : 'EXISTS');
    }
  }
}

check();
