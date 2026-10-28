const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

async function run() {
  const userId = 'afd00f2f-637d-4958-a07e-fb0c7fccd034';
  
  console.log('Logging in as admin to query details...');
  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
  });

  // Query profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  console.log('Profile:', profile);

  // Query roles
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role_id, roles(name)')
    .eq('user_id', userId);

  console.log('Roles:', JSON.stringify(roles, null, 2));

  // Query shift assignments for today (2026-06-13)
  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('id, employee_id, shift_id, assignment_date, status, shifts(name, start_time, end_time, is_overnight)')
    .eq('assignment_date', '2026-06-13');

  console.log('Shift Assignments for today:', JSON.stringify(assignments, null, 2));

  // Query all employees to map employee_id
  const { data: employees } = await supabase
    .from('employees')
    .select('id, profile_id, first_name, last_name')
    .eq('profile_id', userId);

  console.log('Employee info:', employees);
}

run();
