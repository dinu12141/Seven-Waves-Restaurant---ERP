import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  serviceRoleKey
);

const supabaseAnon = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const BRANCH_ID = '340efb20-513a-4d99-b1e7-f32f938e31a8';
const STORES_ROLE_ID = 'd5c00a40-c1b8-4713-ac91-e1af76c7f818'; // stores
const INVENTORY_ROLE_ID = '86295313-5f2d-4096-bbc4-57d8280fb646'; // inventory

const STORE_USER = {
  email: 'store@sevenwaves.lk',
  password: 'Store#User2026!',
  user_code: '3001',
  full_name: 'Store Manager / Storekeeper'
};

async function main() {
  console.log('=== Setting up Store Login for Seven Waves ERP ===\n');

  // 1. Check or create Auth User
  const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) {
    console.error('Failed to list users:', listErr);
    process.exit(1);
  }

  let user = usersData.users.find(u => u.email === STORE_USER.email);

  if (!user) {
    console.log(`Creating user ${STORE_USER.email}...`);
    const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: STORE_USER.email,
      password: STORE_USER.password,
      email_confirm: true,
      user_metadata: { full_name: STORE_USER.full_name }
    });
    if (createErr) {
      console.error('Failed to create user:', createErr);
      process.exit(1);
    }
    user = createData.user;
    console.log(`✅ Auth user created with ID: ${user.id}`);
  } else {
    console.log(`User ${STORE_USER.email} already exists (ID: ${user.id}). Updating password and metadata...`);
    const { data: updateData, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: STORE_USER.password,
      email_confirm: true,
      user_metadata: { full_name: STORE_USER.full_name }
    });
    if (updateErr) {
      console.error('Failed to update user:', updateErr);
      process.exit(1);
    }
    user = updateData.user;
    console.log(`✅ Auth user updated.`);
  }

  // 2. Upsert Profile
  const profileData = {
    id: user.id,
    email: STORE_USER.email,
    full_name: STORE_USER.full_name,
    user_code: STORE_USER.user_code,
    is_active: true,
    updated_at: new Date().toISOString()
  };

  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .upsert(profileData, { onConflict: 'id' });

  if (profileErr) {
    console.error('Failed to upsert profile:', profileErr);
    process.exit(1);
  }
  console.log(`✅ Profile upserted with user_code: ${STORE_USER.user_code}`);

  // 3. Assign Roles ('stores' and 'inventory')
  const targetRoles = [STORES_ROLE_ID, INVENTORY_ROLE_ID];
  for (const roleId of targetRoles) {
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role_id', roleId);

    if (!existingRole || existingRole.length === 0) {
      const { error: insErr } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: user.id, role_id: roleId });
      if (insErr) {
        console.error(`Failed to assign role ${roleId}:`, insErr);
      } else {
        console.log(`✅ Assigned role ${roleId} to user.`);
      }
    } else {
      console.log(`✅ Role ${roleId} already assigned.`);
    }
  }

  // 4. Assign Branch
  const { data: existingBranch } = await supabaseAdmin
    .from('user_branches')
    .select('*')
    .eq('user_id', user.id)
    .eq('branch_id', BRANCH_ID);

  if (!existingBranch || existingBranch.length === 0) {
    const { error: branchErr } = await supabaseAdmin
      .from('user_branches')
      .insert({
        user_id: user.id,
        branch_id: BRANCH_ID,
        is_home_branch: true
      });
    if (branchErr) {
      console.error('Failed to assign branch:', branchErr);
    } else {
      console.log(`✅ Assigned branch ${BRANCH_ID} (is_home_branch: true).`);
    }
  } else {
    console.log(`✅ Branch ${BRANCH_ID} already assigned.`);
  }

  // 5. Test Authentication as Client (Anon Client)
  console.log('\n--- Testing Client Authentication ---');
  const { data: authResult, error: loginErr } = await supabaseAnon.auth.signInWithPassword({
    email: STORE_USER.email,
    password: STORE_USER.password
  });

  if (loginErr) {
    console.error('❌ Login failed:', loginErr.message);
    process.exit(1);
  }

  console.log(`✅ Successfully logged in as ${authResult.user.email}!`);
  console.log(`Access token issued: ${authResult.session.access_token.substring(0, 25)}...`);

  // 6. Verify Roles & Branch access for this user
  const { data: assignedRoles } = await supabaseAdmin
    .from('user_roles')
    .select('role_id, roles(name, description)')
    .eq('user_id', user.id);

  console.log('\nAssigned Roles:');
  assignedRoles.forEach(r => {
    console.log(` - ${r.roles?.name}: ${r.roles?.description}`);
  });

  const { data: assignedBranches } = await supabaseAdmin
    .from('user_branches')
    .select('is_home_branch, branches(id, name, is_active)')
    .eq('user_id', user.id);

  console.log('\nAssigned Branches:');
  assignedBranches.forEach(b => {
    console.log(` - ${b.branches?.name} (${b.branches?.id}) [Home: ${b.is_home_branch}, Active: ${b.branches?.is_active}]`);
  });

  console.log('\n=== STORE LOGIN IS READY AND VERIFIED ===');
}

main().catch(console.error);
