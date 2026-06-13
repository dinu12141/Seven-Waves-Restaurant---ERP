const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const tables = ['payments', 'cashier_sessions'];
  for (const t of tables) {
    const { count, error } = await supabase
      .from(t)
      .select('id, deleted_at', { count: 'exact' })
      .limit(1);
    
    if (error) {
      console.error(`Table ${t} error:`, error.message);
    } else {
      console.log(`Table ${t} success, count:`, count);
    }
  }
}

test();
