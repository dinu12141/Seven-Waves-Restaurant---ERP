import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function debugAllCashiers() {
  console.log('--- Debugging All Cashiers & Users ---');

  // 1. Fetch all users from profiles
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name, email, user_code, is_active');
  if (pErr) console.error('Error fetching profiles:', pErr);

  // 2. Fetch all user_roles
  const { data: userRoles, error: urErr } = await supabase.from('user_roles').select('user_id, role_id, roles(id, name)');
  if (urErr) console.error('Error fetching user_roles:', urErr);

  console.log('\nUser Roles Mapping:');
  const roleMap = {};
  for (const ur of userRoles || []) {
    if (!roleMap[ur.user_id]) roleMap[ur.user_id] = [];
    roleMap[ur.user_id].push(ur.roles?.name);
  }

  for (const p of profiles || []) {
    const roles = roleMap[p.id] || [];
    console.log(`User ID: ${p.id} | Code: ${p.user_code || 'N/A'} | Email: ${p.email} | Name: ${p.full_name} | Roles: ${JSON.stringify(roles)}`);
  }
}

debugAllCashiers().catch(console.error);
