const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
    global: {
      headers: { 'x-application-name': 'restaurant-erp-staff-import' },
    },
  }
);

const COMPANY_ID = '5c7ff29c-418a-461a-9624-3667375c2af4';
const BRANCH_ID = '340efb20-513a-4d99-b1e7-f32f938e31a8';
const EXCEL_PATH = path.join(__dirname, '../import/Staff Details (1).xlsx');

// Retry wrapper with exponential backoff for Supabase calls
async function sbCall(fn, desc = '', maxRetries = 6) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const res = await fn();
      if (res && res.error) {
        throw res.error;
      }
      return res;
    } catch (err) {
      attempt++;
      const waitMs = attempt * 2000;
      console.warn(`[RETRY ${attempt}/${maxRetries}] ${desc} failed (${err.message || JSON.stringify(err)}). Waiting ${waitMs}ms...`);
      if (attempt >= maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

const DEPT_ALIASES = {
  'JUICE BAR': 'Juice Bar',
  'STEWARD': 'Steward',
  'CHINESE': 'Chinese',
  'STORES': 'Stores',
  'PRODUCTION': 'Production',
  'RICE AND CURRY': 'Rice & Curry',
  'MANAGMENT': 'Management',
  'CLEANING': 'Cleaning',
  'HUMAN RESOURCES': 'Human Resources',
  'SECURITY': 'Security',
  'HOSTER': 'Hoster',
  'PASTRY AND BAKERY': 'Pastry & Bakery',
  'BENMARY': 'Benmary',
  'CASHIER': 'Cashier',
  'PIZZA': 'Pizza',
};

const DESIG_ALIASES = {
  'ACCOUNTANT': 'Accountant',
  'ASSISTANT ACCOUNTANT': 'Assistant Accountant',
  'BENMARY': 'Benmary',
  'BARISTA': 'Barista',
  'CASHIER': 'Cashier',
  'CHEF': 'Chef',
  'CLEANING STAFF': 'Cleaning Staff',
  'COOK': 'Cook',
  'HELPER': 'Helper',
  'HOSTER': 'Hoster',
  'HR': 'HR Officer',
  'MANAGER': 'Manager',
  'STEWARD': 'Steward',
  'SUPERVISOR': 'Supervisor',
  'SECURITY': 'Security',
};

async function getDepartments() {
  const res = await sbCall(
    () => supabase.from('departments').select('id, name'),
    'fetch departments'
  );
  const deptMap = new Map();
  (res.data || []).forEach((d) => {
    deptMap.set(d.name.trim().toLowerCase(), d.id);
  });
  return deptMap;
}

async function getDesignations() {
  const res = await sbCall(
    () => supabase.from('designations').select('id, title'),
    'fetch designations'
  );
  const desigMap = new Map();
  (res.data || []).forEach((d) => {
    desigMap.set(d.title.trim().toLowerCase(), d.id);
  });
  return desigMap;
}

function resolveDepartmentId(deptName, deptMap) {
  if (!deptName) return null;
  const raw = deptName.trim();
  const rawLower = raw.toLowerCase();

  if (deptMap.has(rawLower)) return deptMap.get(rawLower);

  const aliased = DEPT_ALIASES[raw.toUpperCase()];
  if (aliased && deptMap.has(aliased.toLowerCase())) {
    return deptMap.get(aliased.toLowerCase());
  }

  for (const [name, id] of deptMap.entries()) {
    if (name.includes(rawLower) || rawLower.includes(name)) return id;
  }
  return null;
}

function resolveDesignationId(desigName, desigMap) {
  if (!desigName) return null;
  const raw = desigName.trim();
  const rawLower = raw.toLowerCase();

  if (desigMap.has(rawLower)) return desigMap.get(rawLower);

  const aliased = DESIG_ALIASES[raw.toUpperCase()];
  if (aliased && desigMap.has(aliased.toLowerCase())) {
    return desigMap.get(aliased.toLowerCase());
  }

  for (const [title, id] of desigMap.entries()) {
    if (title.includes(rawLower) || rawLower.includes(title)) return id;
  }
  return null;
}

function parseTitleAndName(rawFullName) {
  let str = (rawFullName || '').trim();
  let title = 'Mr.';
  let cleanName = str;

  const titleMatch = str.match(/^(Mr\.|Mrs\.|Miss\.|MR\.|MRS\.|MISS\.|Mr,|MR,)\s*/i);
  if (titleMatch) {
    const rawT = titleMatch[0].replace(',', '.').trim();
    if (rawT.toLowerCase().startsWith('miss')) title = 'Miss.';
    else if (rawT.toLowerCase().startsWith('mrs')) title = 'Mrs.';
    else title = 'Mr.';
    cleanName = str.slice(titleMatch[0].length).trim();
  }

  return { title, cleanName, fullNameInExcel: str };
}

function parseJoinDate(val) {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  const dMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dMatch) return dMatch[0];
  return str.slice(0, 10);
}

async function runImport() {
  console.log('Reading Excel file:', EXCEL_PATH);
  const wb = xlsx.readFile(EXCEL_PATH, { cellDates: true });
  const ws = wb.Sheets['Sheet1'];
  const data = xlsx.utils.sheet_to_json(ws, { header: 1 });

  const excelRows = [];
  for (let i = 2; i < data.length; i++) {
    const r = data[i];
    if (r && (r[0] || r[1])) {
      const code = String(r[0] || '').trim();
      const rawName = String(r[1] || '').trim();
      const epf = String(r[2] || '').trim();
      const nic = String(r[3] || '').trim();
      const joinDate = parseJoinDate(r[4]);
      const basicSalary = Number(r[5]) || 0;
      const desig = String(r[6] || '').trim();
      const dept = String(r[7] || '').trim();

      excelRows.push({
        rowNum: i + 1,
        code,
        rawName,
        epf,
        nic,
        joinDate,
        basicSalary,
        desig,
        dept,
      });
    }
  }

  console.log(`Parsed ${excelRows.length} valid employee rows from Excel.`);

  const deptMap = await getDepartments();
  const desigMap = await getDesignations();

  // Load latest employees from database
  const resEmps = await sbCall(
    () => supabase.from('employees').select('id, employee_code, first_name, last_name, full_name, nic_number, epf_no'),
    'fetch existing employees'
  );
  const dbEmps = resEmps.data || [];

  console.log(`Found ${dbEmps.length} current employees in DB.`);

  const usedDbEmpIds = new Set();
  let updatedCount = 0;
  let insertedCount = 0;

  for (let idx = 0; idx < excelRows.length; idx++) {
    const emp = excelRows[idx];
    const { title, cleanName, fullNameInExcel } = parseTitleAndName(emp.rawName);
    const deptId = resolveDepartmentId(emp.dept, deptMap);
    const desigId = resolveDesignationId(emp.desig, desigMap);

    // Find if already exists in DB
    let matchedDbEmp = null;

    // 1. Match by Employee Code first
    if (emp.code) {
      matchedDbEmp = dbEmps.find(
        (d) =>
          !usedDbEmpIds.has(d.id) &&
          d.employee_code &&
          d.employee_code.trim().toLowerCase() === emp.code.trim().toLowerCase()
      );
    }

    // 2. Match by NIC if valid (> 6 chars)
    if (!matchedDbEmp && emp.nic && emp.nic.length > 6) {
      matchedDbEmp = dbEmps.find(
        (d) =>
          !usedDbEmpIds.has(d.id) &&
          d.nic_number &&
          d.nic_number.trim().toLowerCase().replace(/v$/, '') ===
            emp.nic.trim().toLowerCase().replace(/v$/, '')
      );
    }

    // 3. Match by EPF if valid
    if (!matchedDbEmp && emp.epf && emp.epf.length > 3) {
      matchedDbEmp = dbEmps.find(
        (d) =>
          !usedDbEmpIds.has(d.id) &&
          d.epf_no &&
          d.epf_no.trim() === emp.epf.trim()
      );
    }

    // 4. Match by Name similarity
    if (!matchedDbEmp) {
      const xClean = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
      matchedDbEmp = dbEmps.find((d) => {
        if (usedDbEmpIds.has(d.id)) return false;
        const dClean = (d.first_name || '').toLowerCase().replace(/^(mr\.|mrs\.|miss\.|mr,)\s*/i, '').replace(/[^a-z0-9]/g, '');
        return (
          dClean === xClean ||
          (xClean.length > 5 && dClean.includes(xClean)) ||
          (dClean.length > 5 && xClean.includes(dClean))
        );
      });
    }

    // Legacy manual entries (EMP002, EMP003):
    if (!matchedDbEmp && emp.code === 'EMP000282') {
      matchedDbEmp = dbEmps.find((d) => !usedDbEmpIds.has(d.id) && (d.employee_code === 'EMP002' || (d.first_name && d.first_name.includes('Madurika'))));
    }
    if (!matchedDbEmp && emp.code === 'EMP000326') {
      matchedDbEmp = dbEmps.find((d) => !usedDbEmpIds.has(d.id) && (d.employee_code === 'EMP003' || (d.first_name && d.first_name.includes('Malsha'))));
    }

    let targetEmpId = null;

    if (matchedDbEmp) {
      usedDbEmpIds.add(matchedDbEmp.id);
      targetEmpId = matchedDbEmp.id;

      console.log(`[${idx + 1}/${excelRows.length}] [UPDATE] Excel "${emp.code} - ${fullNameInExcel}" -> DB "${matchedDbEmp.employee_code}" (ID: ${targetEmpId})`);

      const updatePayload = {
        employee_code: emp.code,
        first_name: fullNameInExcel,
        last_name: '',
        title: title,
        epf_no: emp.epf,
        nic_number: emp.nic,
        hire_date: emp.joinDate,
        department_id: deptId,
        designation_id: desigId,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      await sbCall(
        () => supabase.from('employees').update(updatePayload).eq('id', targetEmpId),
        `update employee ${emp.code}`
      );

      updatedCount++;
    } else {
      console.log(`[${idx + 1}/${excelRows.length}] [INSERT] Excel "${emp.code} - ${fullNameInExcel}"`);

      const insertPayload = {
        company_id: COMPANY_ID,
        branch_id: BRANCH_ID,
        employee_code: emp.code,
        first_name: fullNameInExcel,
        last_name: '',
        title: title,
        epf_no: emp.epf,
        nic_number: emp.nic,
        hire_date: emp.joinDate,
        department_id: deptId,
        designation_id: desigId,
        employment_status: 'permanent',
        employment_type: 'full_time',
        pay_type: 'Monthly',
        ot: 'Eligible',
        internal_company: 'SEVEN WAVES (PVT) LTD',
        epf_etf_eligible: true,
        is_active: true,
      };

      const insRes = await sbCall(
        () => supabase.from('employees').insert(insertPayload).select('id').single(),
        `insert employee ${emp.code}`
      );
      targetEmpId = insRes.data.id;
      // Add to local list so future iterations can reference if needed
      dbEmps.push({ id: targetEmpId, employee_code: emp.code, first_name: fullNameInExcel, nic_number: emp.nic, epf_no: emp.epf });
      usedDbEmpIds.add(targetEmpId);

      insertedCount++;
    }

    // Configure salary structure
    if (targetEmpId) {
      // 1. Mark existing salary structures as not current
      await sbCall(
        () => supabase.from('salary_structures').update({ is_current: false }).eq('employee_id', targetEmpId),
        `mark old salary inactive for ${emp.code}`
      );

      // 2. Check if a current salary record already exists with matching basic_salary
      const { data: existingSal } = await sbCall(
        () => supabase.from('salary_structures').select('id, basic_salary, is_current').eq('employee_id', targetEmpId).eq('is_current', true),
        `check current salary for ${emp.code}`
      );

      if (!existingSal || existingSal.length === 0) {
        const salaryPayload = {
          company_id: COMPANY_ID,
          employee_id: targetEmpId,
          salary_type: 'monthly',
          salary_method: 'basic_salary',
          basic_salary: emp.basicSalary,
          hourly_rate: emp.basicSalary > 0 ? Number((emp.basicSalary / (26 * 8)).toFixed(2)) : 0,
          day_rate: emp.basicSalary > 0 ? Number((emp.basicSalary / 26).toFixed(2)) : 0,
          unit_rate: 0,
          housing_allowance: 0,
          transport_allowance: 0,
          meal_allowance: 0,
          other_allowances: 0,
          overtime_rate_multiplier: 1.5,
          holiday_ot_multiplier: 2.0,
          epf_employee_pct: 8,
          epf_employer_pct: 12,
          etf_employer_pct: 3,
          other_deductions: 0,
          effective_from: emp.joinDate,
          is_current: true,
        };

        await sbCall(
          () => supabase.from('salary_structures').insert(salaryPayload),
          `insert salary structure for ${emp.code}`
        );
      }
    }

    // Small delay between rows to respect Supabase connection limits
    await new Promise((res) => setTimeout(res, 80));
  }

  console.log('==============================================');
  console.log(`IMPORT COMPLETE!`);
  console.log(`Updated employees: ${updatedCount}`);
  console.log(`Inserted employees: ${insertedCount}`);
  console.log(`Total processed: ${updatedCount + insertedCount}`);
  console.log('==============================================');
}

runImport()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal import error:', err);
    process.exit(1);
  });
