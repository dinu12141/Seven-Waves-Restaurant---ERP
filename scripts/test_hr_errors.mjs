import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('Connecting to:', supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const loginRes = await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
  });

  if (loginRes.error) {
    console.error('Auth login error:', loginRes.error.message);
  } else {
    console.log('Auth success for:', loginRes.data.user.email);
  }

  // 1. Test login_audit_logs
  console.log('\n--- Testing login_audit_logs ---');
  const auditRes = await supabase.from('login_audit_logs').select('*').limit(1);
  console.log('login_audit_logs select result:', auditRes.error ? auditRes.error : 'Success');

  // Try insert to login_audit_logs
  const insertAuditRes = await supabase.from('login_audit_logs').insert({
    user_id: loginRes.data?.user?.id,
    email: 'admin@sevenwaves.lk',
    status: 'success',
    logged_at: new Date().toISOString()
  });
  console.log('login_audit_logs insert result:', insertAuditRes.error ? insertAuditRes.error : 'Success');

  // 2. Test employees table
  console.log('\n--- Testing employees table ---');
  const empRes = await supabase.from('employees').select('*').limit(1);
  if (empRes.error) {
    console.error('employees select error:', empRes.error);
  } else if (empRes.data && empRes.data.length > 0) {
    const emp = empRes.data[0];
    console.log('employees table columns (', Object.keys(emp).length, 'keys ):');
    console.log(Object.keys(emp));
    console.log('Sample Employee ID:', emp.id);

    // Fetch employee eaa1230b-caf2-46ce-9b37-e25def78fb75 if exists or first emp
    const specificEmp = await supabase.from('employees').select('*').eq('id', 'eaa1230b-caf2-46ce-9b37-e25def78fb75').maybeSingle();
    console.log('Specific emp fetch:', specificEmp.error ? specificEmp.error : (specificEmp.data ? 'Found' : 'Not found'));

    // Try dummy update with existing fields
    const updateRes = await supabase.from('employees').update({ first_name: emp.first_name }).eq('id', emp.id);
    console.log('Dummy update result:', updateRes.error ? updateRes.error : 'Success');
  } else {
    console.log('employees table is empty');
  }
}

test().catch(console.error);
