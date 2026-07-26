import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkAllUsersRoles() {
  console.log('--- Inspecting All Users and Their Assigned Roles ---');

  // Sign in as Admin to query full tables
  const { error: aErr } = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  if (aErr) {
    console.error('Admin login error:', aErr);
    return;
  }

  // 1. Get all profiles
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, user_code, is_active');

  // 2. Get all user_roles
  const { data: userRoles } = await supabase.from('user_roles').select('user_id, role_id, roles(id, name)');

  // 3. Map user_id to role names
  const rolesByUser = {};
  for (const ur of userRoles || []) {
    if (!rolesByUser[ur.user_id]) rolesByUser[ur.user_id] = [];
    rolesByUser[ur.user_id].push(ur.roles?.name);
  }

  console.log('\nAll Users Summary:');
  const summary = profiles.map(p => ({
    ID: p.id,
    Name: p.full_name,
    Email: p.email,
    UserCode: p.user_code || '(none)',
    IsActive: p.is_active,
    Roles: (rolesByUser[p.id] || []).join(', ') || 'NO ROLE ASSIGNED!'
  }));

  console.table(summary);
}

checkAllUsersRoles().catch(console.error);
