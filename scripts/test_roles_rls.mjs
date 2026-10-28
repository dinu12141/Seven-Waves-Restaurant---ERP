import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testRolesRLS() {
  console.log('--- Testing RLS for roles & user_roles tables ---');

  // Sign in as cashier user (test@gmail.com)
  const loginRes = await supabase.auth.signInWithPassword({
    email: 'test@gmail.com',
    password: process.env.SW_TEST_PASSWORD,
  });

  if (loginRes.error) {
    console.error('Login error:', loginRes.error);
    return;
  }

  console.log('Logged in as test@gmail.com (cashier)');

  // 1. Try auth_get_roles RPC
  const { data: rpcData, error: rpcErr } = await supabase.rpc('auth_get_roles');
  console.log('1. auth_get_roles RPC:', rpcData, rpcErr ? rpcErr.message : 'OK');

  // 2. Try select user_roles with roles(name)
  const { data: urData, error: urErr } = await supabase
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', loginRes.data.user.id);
  console.log('2. user_roles select with roles(name):', urData, urErr ? urErr : 'OK');

  // 3. Try direct select roles
  const { data: rData, error: rErr } = await supabase.from('roles').select('id, name');
  console.log('3. direct select roles:', rData, rErr ? rErr : 'OK');
}

testRolesRLS().catch(console.error);
