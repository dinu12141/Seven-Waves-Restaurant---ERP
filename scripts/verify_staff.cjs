const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  const { data: emps, error } = await supabase
    .from('employees')
    .select('id, employee_code, first_name, full_name, epf_no, nic_number, hire_date, department_id, designation_id, departments(name), designations(title), salary_structures(basic_salary, is_current)')
    .order('employee_code');
  if (error) throw error;

  console.log('=== VERIFICATION RESULTS ===');
  console.log('Total employees in DB:', emps.length);

  // Check code uniqueness
  const codeCounts = {};
  emps.forEach(e => {
    codeCounts[e.employee_code] = (codeCounts[e.employee_code] || 0) + 1;
  });
  const dupCodes = Object.entries(codeCounts).filter(([, v]) => v > 1);
  console.log('Duplicate codes:', dupCodes);

  // Check EPF uniqueness
  const epfCounts = {};
  emps.forEach(e => {
    if (e.epf_no) epfCounts[e.epf_no] = (epfCounts[e.epf_no] || 0) + 1;
  });
  const dupEpfs = Object.entries(epfCounts).filter(([, v]) => v > 1);
  console.log('Duplicate EPFs:', dupEpfs);

  // Check Name uniqueness
  const nameCounts = {};
  emps.forEach(e => {
    const clean = (e.first_name || '').trim().toLowerCase();
    nameCounts[clean] = (nameCounts[clean] || 0) + 1;
  });
  const dupNames = Object.entries(nameCounts).filter(([, v]) => v > 1);
  console.log('Duplicate names:', dupNames);

  // Check missing departments / designations
  const missingDept = emps.filter(e => !e.departments);
  const missingDesig = emps.filter(e => !e.designations);
  console.log('Missing departments count:', missingDept.length);
  console.log('Missing designations count:', missingDesig.length);

  // Check salary structures
  const missingSalary = emps.filter(e => {
    const currents = (e.salary_structures || []).filter(s => s.is_current);
    return currents.length === 0;
  });
  console.log('Missing current salary structure count:', missingSalary.length);

  // Print first 5 and last 5
  console.log('\n--- First 5 employees ---');
  emps.slice(0, 5).forEach(e => {
    const sal = (e.salary_structures || []).find(s => s.is_current)?.basic_salary;
    console.log(`${e.employee_code} | ${e.first_name} | EPF: ${e.epf_no} | NIC: ${e.nic_number} | Join: ${e.hire_date} | Salary: LKR ${sal} | Dept: ${e.departments?.name} | Desig: ${e.designations?.title}`);
  });

  console.log('\n--- Last 5 employees ---');
  emps.slice(-5).forEach(e => {
    const sal = (e.salary_structures || []).find(s => s.is_current)?.basic_salary;
    console.log(`${e.employee_code} | ${e.first_name} | EPF: ${e.epf_no} | NIC: ${e.nic_number} | Join: ${e.hire_date} | Salary: LKR ${sal} | Dept: ${e.departments?.name} | Desig: ${e.designations?.title}`);
  });
}

verify()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
