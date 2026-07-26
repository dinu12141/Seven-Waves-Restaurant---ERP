import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function listAllKitchenUsers() {
  console.log('--- Signing in as admin to check users ---');

  const { data: auth, error: aErr } = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: 'Admin@123456',
  });

  if (aErr) {
    console.error('Admin login error:', aErr);
    return;
  }

  const { data: profiles, error: pErr } = await supabase
    .from('user_profiles')
    .select(`
      id, user_code, email, full_name, kitchen_id, company_id, branch_id,
      kitchens(id, name),
      user_roles(role_id, roles(name))
    `);

  if (pErr) {
    console.error('Profiles fetch error:', pErr);
    return;
  }

  console.log('\nAll User Profiles & Kitchen Assignments:');
  console.table(profiles.map(p => ({
    ID: p.id,
    UserCode: p.user_code,
    Email: p.email,
    Name: p.full_name,
    KitchenID: p.kitchen_id,
    KitchenName: p.kitchens?.name || 'NONE',
    Roles: (p.user_roles || []).map(ur => ur.roles?.name).join(', ')
  })));
}

listAllKitchenUsers().catch(console.error);
