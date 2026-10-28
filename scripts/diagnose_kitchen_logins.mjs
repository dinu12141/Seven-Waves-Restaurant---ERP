import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const KITCHEN_ACCOUNTS = [
  { name: 'JUICE BAR', code: '2001', email: 'juicebar@sevenwaves.lk', pass: process.env.SW_KITCHEN_JUICEBAR_PASSWORD },
  { name: 'ITALIAN', code: '2002', email: 'italian@sevenwaves.lk', pass: process.env.SW_KITCHEN_ITALIAN_PASSWORD },
  { name: 'BENMAR', code: '2003', email: 'benmar@sevenwaves.lk', pass: process.env.SW_KITCHEN_BENMAR_PASSWORD },
  { name: 'INDIAN', code: '2004', email: 'indian@sevenwaves.lk', pass: process.env.SW_KITCHEN_INDIAN_PASSWORD },
];

async function diagnose() {
  console.log('=== Diagnosing 4 Kitchen Display Logins ===\n');

  for (const acc of KITCHEN_ACCOUNTS) {
    console.log(`--- Checking ${acc.name} (${acc.email} / ${acc.code}) ---`);
    const supabase = createClient(supabaseUrl, anonKey);

    // Login with password
    const { data: auth, error: aErr } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password: acc.pass
    });

    if (aErr) {
      console.error(`❌ SIGN-IN FAILED: ${aErr.message}`);
      continue;
    }

    console.log(`✅ Auth OK. User ID: ${auth.user.id}`);

    // Fetch profile
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('*, kitchens(id, name)')
      .eq('id', auth.user.id)
      .single();

    console.log('Profile:', pErr ? pErr.message : profile);

    // Fetch user_roles
    const { data: roles, error: rErr } = await supabase
      .from('user_roles')
      .select('*, roles(name)')
      .eq('user_id', auth.user.id);

    console.log('Roles:', rErr ? rErr.message : roles?.map(r => r.roles?.name));

    // Fetch user_branches
    const { data: branches, error: bErr } = await supabase
      .from('user_branches')
      .select('*, branches(id, name)')
      .eq('user_id', auth.user.id);

    console.log('Branches:', bErr ? bErr.message : branches);
    console.log('\n----------------------------------------\n');
  }
}

diagnose().catch(console.error);
