import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)));
const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: `
    SELECT trigger_name, event_object_table, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'finance_vouchers';
  `});
  console.log(data || error);
}
check();
