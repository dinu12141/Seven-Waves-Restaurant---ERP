import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function inspectKitchenUsers() {
  console.log('--- Inspecting Kitchen Displays & Auth Accounts ---');

  // 1. Fetch kitchens
  const { data: kitchens } = await supabase.from('kitchens').select('*').order('name');
  console.log('Kitchens:');
  console.table(kitchens.map(k => ({ ID: k.id, Name: k.name, CompanyID: k.company_id })));

  // 2. Fetch user profiles
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, user_code, email, full_name, kitchen_id, company_id, branch_id');
  console.log('\nUser Profiles:');
  console.table(profiles);

  // 3. Fetch roles
  const { data: roles } = await supabase.from('roles').select('*');
  console.log('\nRoles:');
  console.table(roles);

  // 4. Fetch user_roles
  const { data: userRoles } = await supabase.from('user_roles').select('*, roles(name, code)');
  console.log('\nUser Roles:');
  console.table(userRoles.map(ur => ({ UserID: ur.user_id, RoleName: ur.roles?.name, RoleCode: ur.roles?.code })));
}

inspectKitchenUsers().catch(console.error);
