import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function inspectSchema() {
  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  const { data: users, error: uErr } = await supabase.from('users').select('*');
  console.log('Users Table:', uErr ? uErr.message : users);

  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
  console.log('Profiles Table:', pErr ? pErr.message : profiles);

  const { data: employees, error: eErr } = await supabase.from('employees').select('*');
  console.log('Employees Table:', eErr ? eErr.message : employees?.length);
}

inspectSchema().catch(console.error);
