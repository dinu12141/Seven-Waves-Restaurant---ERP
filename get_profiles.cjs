const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log('Logging in as admin@sevenwaves.lk...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  if (authError) {
    console.error('Login failed:', authError.message);
    return;
  }

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      user_roles ( roles ( name ) )
    `);

  if (pErr) {
    console.error('Error fetching profiles:', pErr.message);
  } else {
    console.log('Profiles:');
    profiles.forEach(p => {
      const roles = p.user_roles ? p.user_roles.map(ur => ur.roles?.name).join(', ') : 'none';
      console.log(`- ${p.full_name} (${p.email}), Roles: [${roles}]`);
    });
  }
}

test();
