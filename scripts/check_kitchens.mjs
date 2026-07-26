import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function checkKitchens() {
  console.log('--- Checking Kitchens and Existing Users ---');

  // Check kitchens table
  const { data: kitchens, error: kErr } = await supabase
    .from('kitchens')
    .select('*');
  console.log('Kitchens Table:', kErr ? kErr : kitchens);

  // Check user_profiles
  const { data: profiles, error: pErr } = await supabase
    .from('user_profiles')
    .select('*, user_roles(role_code)');
  console.log('Profiles Count:', profiles?.length);
  if (profiles) {
    console.table(profiles.map(p => ({
      ID: p.id,
      Code: p.user_code,
      Email: p.email,
      FullName: p.full_name,
      Roles: p.user_roles?.map(r => r.role_code).join(', ')
    })));
  }

  // Check listUsers via auth admin API if service role key available
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data: authUsers, error: aErr } = await supabase.auth.admin.listUsers();
    console.log('Auth Users Count:', authUsers?.users?.length);
  }
}

checkKitchens().catch(console.error);
