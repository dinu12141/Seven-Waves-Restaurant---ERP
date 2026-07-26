import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testUserRoles() {
  console.log('--- Testing User Logins & Roles ---');

  // Check admin login
  const adminRes = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  if (adminRes.error) {
    console.error('Admin login error:', adminRes.error.message);
  } else {
    console.log('Logged in as:', adminRes.data.user.email);
    const { data: rolesRpc } = await supabase.rpc('auth_get_roles');
    console.log('Admin auth_get_roles RPC:', rolesRpc);

    const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', adminRes.data.user.id);
    console.log('Admin user_roles select:', userRoles);
  }

  // Fetch all users & profiles from DB to see user codes & roles
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, user_code, is_active').not('user_code', 'is', null);
  console.log('\nProfiles with User Codes:');
  console.table(profiles);

  for (const p of profiles || []) {
    const { data: uRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', p.id);
    const roleNames = uRoles?.map(r => r.roles?.name) || [];
    console.log(`User Code: ${p.user_code} | Name: ${p.full_name} | Email: ${p.email} | Roles: ${JSON.stringify(roleNames)}`);
  }
}

testUserRoles().catch(console.error);
