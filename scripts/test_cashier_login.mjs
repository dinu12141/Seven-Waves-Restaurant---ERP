import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testCashierLogin() {
  console.log('--- Testing Login for Cashier (User Code 1010) ---');

  // 1. Get email by user code RPC
  const { data: rows, error: rpcErr } = await supabase.rpc('get_email_by_user_code', { p_user_code: '1010' });
  if (rpcErr) console.error('get_email_by_user_code error:', rpcErr);
  console.log('get_email_by_user_code result:', rows);

  // 2. Sign in with email test@gmail.com
  const loginRes = await supabase.auth.signInWithPassword({
    email: 'test@gmail.com',
    password: 'Test@123',
  });

  if (loginRes.error) {
    console.error('❌ Login error:', loginRes.error.message);
    return;
  }
  console.log('✅ Login SUCCESS! User ID:', loginRes.data.user.id);

  // 3. Fetch roles using RPC & user_roles table
  const { data: rpcRoles, error: rpcRolesErr } = await supabase.rpc('auth_get_roles');
  console.log('auth_get_roles RPC result:', rpcRoles, rpcRolesErr ? rpcRolesErr.message : '');

  const { data: tblRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', loginRes.data.user.id);
  console.log('user_roles select result:', tblRoles);
}

testCashierLogin().catch(console.error);
