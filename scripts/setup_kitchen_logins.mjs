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

const BRANCH_ID = '340efb20-513a-4d99-b1e7-f32f938e31a8';
const KITCHEN_ROLE_ID = '7ef72ef4-7fe2-41d4-b62f-18a35b9b8989'; // 'kitchen'

const KITCHEN_CONFIGS = [
  {
    name: 'JUICE BAR',
    kitchen_id: '361e910a-70f0-4578-9ea9-ba29595add39',
    user_code: '2001',
    email: 'juicebar@sevenwaves.lk',
    password: 'Juice@123456',
    full_name: 'JUICE BAR Kitchen Display'
  },
  {
    name: 'ITALIAN',
    kitchen_id: '43cbc447-9897-46f3-8c82-670972091bb3',
    user_code: '2002',
    email: 'italian@sevenwaves.lk',
    password: 'Italian@123456',
    full_name: 'ITALIAN Kitchen Display'
  },
  {
    name: 'BENMAR',
    kitchen_id: 'd54617dc-5b1e-456b-934d-65e21ab1b8ff',
    user_code: '2003',
    email: 'benmar@sevenwaves.lk',
    password: 'Benmar@123456',
    full_name: 'BENMAR Kitchen Display'
  },
  {
    name: 'INDIAN',
    kitchen_id: '0a3eff90-ba1a-40ce-9e05-94d22af609d7',
    user_code: '2004',
    email: 'indian@sevenwaves.lk',
    password: 'Indian@123456',
    full_name: 'INDIAN Kitchen Display'
  }
];

async function setupKitchenLogins() {
  console.log('=== Setting Up 4 Kitchen Display Accounts ===\n');

  for (const config of KITCHEN_CONFIGS) {
    console.log(`--- Processing Kitchen: ${config.name} ---`);
    
    // 1. Check if auth user exists by email
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    let user = usersData?.users?.find(u => u.email === config.email);

    if (!user) {
      console.log(`Creating new Auth user for ${config.email}...`);
      const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: config.email,
        password: config.password,
        email_confirm: true,
        user_metadata: { full_name: config.full_name }
      });
      if (createErr) {
        console.error(`Error creating user ${config.email}:`, createErr.message);
        continue;
      }
      user = createData.user;
      console.log(`✅ Created Auth User: ${user.id}`);
    } else {
      console.log(`Existing Auth User found: ${user.id}. Updating password...`);
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: config.password,
        email_confirm: true
      });
      if (updateErr) {
        console.error(`Error updating password for ${config.email}:`, updateErr.message);
      } else {
        console.log(`✅ Updated password for Auth User ${user.id}`);
      }
    }

    // 2. Upsert profile
    const profilePayload = {
      id: user.id,
      email: config.email,
      full_name: config.full_name,
      user_code: config.user_code,
      kitchen_id: config.kitchen_id,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' });

    if (profileErr) {
      console.error(`Error upserting profile for ${config.email}:`, profileErr.message);
    } else {
      console.log(`✅ Profile updated (User Code: ${config.user_code}, Kitchen ID: ${config.kitchen_id})`);
    }

    // 3. Ensure role 'kitchen' is assigned in user_roles
    const { data: existingRoles } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role_id', KITCHEN_ROLE_ID);

    if (!existingRoles || existingRoles.length === 0) {
      const { error: roleErr } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: user.id, role_id: KITCHEN_ROLE_ID });
      if (roleErr) {
        console.error(`Error assigning kitchen role:`, roleErr.message);
      } else {
        console.log(`✅ Assigned 'kitchen' role to user.`);
      }
    } else {
      console.log(`✅ 'kitchen' role already assigned.`);
    }

    // 4. Ensure branch is assigned in user_branches
    const { data: existingBranches } = await supabaseAdmin
      .from('user_branches')
      .select('*')
      .eq('user_id', user.id)
      .eq('branch_id', BRANCH_ID);

    if (!existingBranches || existingBranches.length === 0) {
      const { error: branchErr } = await supabaseAdmin
        .from('user_branches')
        .insert({ user_id: user.id, branch_id: BRANCH_ID, is_home_branch: true });
      if (branchErr) {
        console.error(`Error assigning branch:`, branchErr.message);
      } else {
        console.log(`✅ Assigned Main Branch to user.`);
      }
    } else {
      await supabaseAdmin
        .from('user_branches')
        .update({ is_home_branch: true })
        .eq('user_id', user.id)
        .eq('branch_id', BRANCH_ID);
      console.log(`✅ Set is_home_branch = true for user.`);
    }

    console.log('');
  }

  console.log('=== All 4 Kitchen Logins Processed Successfully ===');
}

setupKitchenLogins().catch(console.error);
