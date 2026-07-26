import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const KITCHEN_TEST_ACCOUNTS = [
  { name: 'JUICE BAR', user_code: '2001', email: 'juicebar@sevenwaves.lk', password: 'Juice@123456', expected_kitchen_id: '361e910a-70f0-4578-9ea9-ba29595add39' },
  { name: 'ITALIAN', user_code: '2002', email: 'italian@sevenwaves.lk', password: 'Italian@123456', expected_kitchen_id: '43cbc447-9897-46f3-8c82-670972091bb3' },
  { name: 'BENMAR', user_code: '2003', email: 'benmar@sevenwaves.lk', password: 'Benmar@123456', expected_kitchen_id: 'd54617dc-5b1e-456b-934d-65e21ab1b8ff' },
  { name: 'INDIAN', user_code: '2004', email: 'indian@sevenwaves.lk', password: 'Indian@123456', expected_kitchen_id: '0a3eff90-ba1a-40ce-9e05-94d22af609d7' },
];

async function testKitchenLoginsE2E() {
  console.log('=== Testing E2E Kitchen Display Logins ===\n');

  for (const account of KITCHEN_TEST_ACCOUNTS) {
    console.log(`--- Testing Login for ${account.name} ---`);
    const supabase = createClient(supabaseUrl, anonKey);

    // 1. Test User Code Lookup via RPC
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_email_by_user_code', {
      p_user_code: account.user_code
    });

    if (rpcErr || !rpcData || rpcData.length === 0) {
      console.error(`❌ User Code lookup failed for code ${account.user_code}:`, rpcErr);
      continue;
    }
    const resolvedEmail = rpcData[0].email;
    console.log(`✅ User Code ${account.user_code} resolved to email: ${resolvedEmail}`);

    // 2. Test Sign In with Password
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password: account.password
    });

    if (authErr) {
      console.error(`❌ Login failed for ${account.name}:`, authErr.message);
      continue;
    }
    console.log(`✅ Auth Sign In successful for User ID: ${authData.user.id}`);

    // 3. Test Profile & Kitchen Assignment Fetching
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, user_code, kitchen_id, kitchens(id, name)')
      .eq('id', authData.user.id)
      .single();

    if (profErr) {
      console.error(`❌ Profile fetch error:`, profErr.message);
      continue;
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', authData.user.id);

    const roleNames = (roles || []).map(r => r.roles?.name);

    console.log(`✅ Profile fetched cleanly:`);
    console.log(`   - Name: ${profile.full_name}`);
    console.log(`   - User Code: ${profile.user_code}`);
    console.log(`   - Roles: ${roleNames.join(', ')}`);
    console.log(`   - Assigned Kitchen: ${profile.kitchens?.name} (ID: ${profile.kitchen_id})`);

    const isKitchenMatch = profile.kitchen_id === account.expected_kitchen_id;
    const hasKitchenRole = roleNames.includes('kitchen');

    if (isKitchenMatch && hasKitchenRole) {
      console.log(`🎉 VERIFICATION SUCCESSFUL: ${account.name} lands directly on Kitchen Display!`);
    } else {
      console.error(`⚠️ VERIFICATION WARNING: ${account.name} kitchen mismatch or missing role.`);
    }
    console.log('');
  }
}

testKitchenLoginsE2E().catch(console.error);
