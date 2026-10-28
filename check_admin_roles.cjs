const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

async function run() {
  const userId = '248f1321-e2e1-4cc0-827d-f0dd25224543'; // admin user
  
  console.log('Logging in as admin...');
  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
  });

  // Query roles
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role_id, roles(name)')
    .eq('user_id', userId);

  console.log('Admin Roles:', JSON.stringify(roles, null, 2));

  // Query branches
  const { data: userBranches } = await supabase
    .from('user_branches')
    .select('branch_id, is_home_branch, branches(name, company_id)')
    .eq('user_id', userId);

  console.log('Admin User Branches:', JSON.stringify(userBranches, null, 2));
}

run();
