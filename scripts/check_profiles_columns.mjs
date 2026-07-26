import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkColumns() {
  const { data: sample } = await supabase.from('profiles').select('*').limit(1);
  console.log('Sample profile row keys:', sample ? Object.keys(sample[0]) : 'None');
}

checkColumns().catch(console.error);
