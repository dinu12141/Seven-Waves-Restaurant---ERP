import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

function cleanEmployeePayload(rawPayload) {
  const payload = { ...rawPayload };

  // 1. Remove non-existent or generated database columns
  delete payload.id;
  delete payload.full_name;
  delete payload.created_at;
  delete payload.updated_at;
  delete payload.departments;
  delete payload.designations;

  // 2. Remove UI-only fields
  const uiOnlyKeys = [
    'salary_method',
    'basic_salary',
    'hourly_rate',
    'day_rate',
    'unit_rate',
    'housing_allowance',
    'transport_allowance',
    'meal_allowance',
    'overtime_rate_multiplier',
    'holiday_ot_multiplier',
    'epf_employee_pct',
    'salary',
    'title',
    'pay_type',
    'ot',
    'shift',
    'probation_period',
    'epf_amount',
    'welfare_amount',
    'internal_company',
    'morning_ot',
    'late_deduct',
    'no_pay_deduct',
    'etf_allowed',
    'user_pic',
    'epf_etf_eligible',
    'shift_rate',
  ];
  uiOnlyKeys.forEach((k) => delete payload[k]);

  // 3. Convert empty strings to null for nullable date & UUID & numeric columns
  const nullableDateAndUuidKeys = [
    'date_of_birth',
    'termination_date',
    'salary_hold_date',
    'department_id',
    'designation_id',
    'profile_id',
    'salary_hold_by',
    'education_level',
  ];
  nullableDateAndUuidKeys.forEach((k) => {
    if (payload[k] === '' || payload[k] === undefined) {
      payload[k] = null;
    }
  });

  // hire_date is NOT NULL in DB — default to today if empty
  if (!payload.hire_date || payload.hire_date === '') {
    payload.hire_date = new Date().toISOString().split('T')[0];
  }

  // Ensure last_name is non-empty string if not provided
  if (!payload.last_name) {
    payload.last_name = '';
  }

  if (payload.mobile && !payload.phone) {
    payload.phone = payload.mobile;
  }

  return payload;
}

async function testCleanedUpdate() {
  await supabase.auth.signInWithPassword({
    email: 'admin@sevenwaves.lk',
    password: process.env.SW_ADMIN_PASSWORD,
  });

  const empId = 'eaa1230b-caf2-46ce-9b37-e25def78fb75';

  const { data: empData } = await supabase.from('employees').select('*, departments(name), designations(title)').eq('id', empId).single();

  // Simulate dirty payload with full_name, empty date strings, empty UUID strings
  const dirtyPayload = {
    ...empData,
    date_of_birth: '',
    hire_date: '',
    department_id: '',
    designation_id: '',
    termination_date: '',
    first_name: 'TestUpdated',
    last_name: 'EmployeeUpdated'
  };

  const cleaned = cleanEmployeePayload(dirtyPayload);

  const updateRes = await supabase.from('employees').update(cleaned).eq('id', empId);
  console.log('Update with cleaned payload result:', updateRes.error ? updateRes.error : '✅ SUCCESS!');
}

testCleanedUpdate().catch(console.error);
