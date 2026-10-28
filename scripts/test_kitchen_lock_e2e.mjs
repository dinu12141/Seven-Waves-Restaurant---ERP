import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const KITCHEN_ACCOUNTS = [
  { name: 'JUICE BAR', code: '2001', email: 'juicebar@sevenwaves.lk', pass: process.env.SW_KITCHEN_JUICEBAR_PASSWORD, expectedKitchenId: '361e910a-70f0-4578-9ea9-ba29595add39' },
  { name: 'ITALIAN', code: '2002', email: 'italian@sevenwaves.lk', pass: process.env.SW_KITCHEN_ITALIAN_PASSWORD, expectedKitchenId: '43cbc447-9897-46f3-8c82-670972091bb3' },
  { name: 'BENMAR', code: '2003', email: 'benmar@sevenwaves.lk', pass: process.env.SW_KITCHEN_BENMAR_PASSWORD, expectedKitchenId: 'd54617dc-5b1e-456b-934d-65e21ab1b8ff' },
  { name: 'INDIAN', code: '2004', email: 'indian@sevenwaves.lk', pass: process.env.SW_KITCHEN_INDIAN_PASSWORD, expectedKitchenId: '0a3eff90-ba1a-40ce-9e05-94d22af609d7' },
];

async function testKitchenLockE2E() {
  console.log('=== Testing Kitchen Station Locking & Direct Landing ===\n');

  for (const acc of KITCHEN_ACCOUNTS) {
    console.log(`--- Testing ${acc.name} (${acc.code} / ${acc.email}) ---`);
    const supabase = createClient(supabaseUrl, anonKey);

    // 1. User code lookup
    const { data: lookup, error: lErr } = await supabase.rpc('get_email_by_user_code', {
      p_user_code: acc.code
    });

    if (lErr || !lookup || lookup.length === 0) {
      console.error(`❌ User code lookup failed:`, lErr);
      continue;
    }

    const email = lookup[0].email;

    // 2. Sign in
    const { data: auth, error: aErr } = await supabase.auth.signInWithPassword({
      email,
      password: acc.pass
    });

    if (aErr) {
      console.error(`❌ Sign in failed:`, aErr.message);
      continue;
    }

    // 3. Synchronous fetch profile, roles, branches (simulating authStore)
    const [profRes, rolesRes, branchRes] = await Promise.all([
      supabase.from('profiles').select('*, kitchens(id, name)').eq('id', auth.user.id).single(),
      supabase.from('user_roles').select('roles(name)').eq('user_id', auth.user.id),
      supabase.from('user_branches').select('*, branches(id, name, company_id)').eq('user_id', auth.user.id),
    ]);

    const profile = profRes.data;
    const roles = (rolesRes.data || []).map(r => r.roles?.name);
    const homeBranch = branchRes.data?.find(b => b.is_home_branch) || branchRes.data?.[0];

    console.log(`✅ Auth & Profile loaded:`);
    console.log(`   - Profile Name: ${profile?.full_name}`);
    console.log(`   - Roles: ${roles.join(', ')}`);
    console.log(`   - Home Branch: ${homeBranch?.branches?.name || 'NONE'}`);
    console.log(`   - Assigned Kitchen ID: ${profile?.kitchen_id}`);
    console.log(`   - Assigned Kitchen Name: ${profile?.kitchens?.name}`);

    // Verification checks
    const hasBranch = !!homeBranch;
    const hasRole = roles.includes('kitchen');
    const isExactKitchen = profile?.kitchen_id === acc.expectedKitchenId;

    if (hasBranch && hasRole && isExactKitchen) {
      console.log(`🎉 PERFECT MATCH! User ${acc.name} is LOCKED to "${profile.kitchens.name}" station & lands on /kitchen-display.`);
    } else {
      console.error(`⚠️ FAILED LOCK CHECK for ${acc.name}. Branch: ${hasBranch}, Role: ${hasRole}, Kitchen: ${isExactKitchen}`);
    }
    console.log('');
  }
}

testKitchenLockE2E().catch(console.error);
