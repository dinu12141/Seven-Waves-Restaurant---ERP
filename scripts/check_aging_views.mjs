import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)));
const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const { data: ap, error: e1 } = await supabase.from('v_payable_aging').select('*');
  console.log('v_payable_aging:', ap, e1);

  const { data: ar, error: e2 } = await supabase.from('v_receivable_aging').select('*');
  console.log('v_receivable_aging:', ar, e2);
}

check();
