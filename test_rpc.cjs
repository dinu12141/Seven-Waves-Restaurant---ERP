const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing auth_has_role with role_name...');
  try {
    const { data: roleData, error: roleError } = await supabase
      .rpc('auth_has_role', { role_name: 'admin' });
    if (roleError) {
      console.error('auth_has_role error:', roleError.message);
    } else {
      console.log('auth_has_role success:', roleData);
    }
  } catch (e) {
    console.error('auth_has_role exception:', e.message);
  }

  console.log('Testing auth_is_on_shift...');
  try {
    const dummyUuid = '00000000-0000-0000-0000-000000000000';
    const { data: shiftData, error: shiftError } = await supabase
      .rpc('auth_is_on_shift', { p_branch_id: dummyUuid });
    if (shiftError) {
      console.error('auth_is_on_shift error:', shiftError.message);
    } else {
      console.log('auth_is_on_shift success:', shiftData);
    }
  } catch (e) {
    console.error('auth_is_on_shift exception:', e.message);
  }
}

test();
