import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)));
const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const { data: accounts, error: err1 } = await supabase.from('finance_accounts').select('*');
  console.log('Accounts:', accounts, err1);

  const { data: ledgers, error: err2 } = await supabase.from('finance_ledgers').select('*');
  console.log('Ledgers:', ledgers, err2);
}

check();
