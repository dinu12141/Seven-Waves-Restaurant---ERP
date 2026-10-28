import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)));
const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: `
    SELECT pg_get_functiondef(p.oid) AS func_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'pos_close_shift'
      AND n.nspname = 'public';
  `});
  if (error) console.log('Error:', error);
  else {
    console.log(data);
    if (data && data.length > 0) {
      console.log('--- DEFINITION ---');
      console.log(data[0].func_def);
    }
  }
}
check();
