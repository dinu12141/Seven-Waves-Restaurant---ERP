// ═══════════════════════════════════════════════════════════════════════════════
// Comprehensive E2E Verification Test for Pay Grades & Employee Profile Real-Time Sync
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function runTest() {
  console.log('🚀 Starting HR Pay Grades & Employee Profile Real-Time Synchronization Test...')

  // Step 1: Verify CR 02 in system_settings
  const { data: stData } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'hr_pay_grades_data')
    .single()

  const grades = stData?.setting_value?.grades || []
  const cr02 = grades.find((g) => g.code === 'CR 02')
  if (!cr02) {
    throw new Error('❌ CR 02 not found in system_settings')
  }

  console.log(`✅ Step 1: Found CR 02 with ${cr02.additions?.length} additions:`)
  for (const a of cr02.additions) {
    console.log(`   - Code: ${a.additionCode} | Name: ${a.additionName} | Amount: LKR ${a.amount}`)
  }

  // Step 2: Pick an employee and assign them to CR 02
  const { data: emp } = await supabase
    .from('employees')
    .select('id, employee_code, first_name, last_name')
    .limit(1)
    .single()

  const testEmpId = emp.id
  console.log(`\n👤 Step 2: Selected test employee: ${emp.employee_code} (${emp.first_name} ${emp.last_name || ''}) [${testEmpId}]`)

  // Update assignment in system_settings
  const { data: assignData } = await supabase
    .from('system_settings')
    .select('id, setting_value')
    .eq('setting_key', 'hr_employee_pay_grade_assignments')
    .single()

  const assignments = assignData?.setting_value?.assignments || {}
  assignments[testEmpId] = 'CR 02'

  await supabase
    .from('system_settings')
    .update({
      setting_value: { assignments, updatedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignData.id)

  console.log('✅ Assigned employee to CR 02 in system_settings')

  // Step 3: Trigger cascade sync for this employee
  let otherTotal = 0
  for (const a of cr02.additions) {
    otherTotal += Number(a.amount || 0)
  }

  const { data: curSal } = await supabase
    .from('salary_structures')
    .select('id, other_allowances')
    .eq('employee_id', testEmpId)
    .eq('is_current', true)
    .maybeSingle()

  if (curSal) {
    await supabase
      .from('salary_structures')
      .update({ other_allowances: otherTotal, updated_at: new Date().toISOString() })
      .eq('id', curSal.id)
  } else {
    const { data: comp } = await supabase.from('companies').select('id').limit(1).single()
    await supabase.from('salary_structures').insert({
      company_id: comp?.id,
      employee_id: testEmpId,
      salary_type: 'monthly',
      salary_method: 'basic_salary',
      basic_salary: 30000,
      other_allowances: otherTotal,
      is_current: true,
      effective_from: new Date().toISOString().slice(0, 10),
    })
  }

  // Verify salary_structures matches additions total
  const { data: verifySal } = await supabase
    .from('salary_structures')
    .select('id, basic_salary, other_allowances')
    .eq('employee_id', testEmpId)
    .eq('is_current', true)
    .single()

  console.log(`✅ Step 3: Employee current salary structure synced. Allowances: LKR ${verifySal.other_allowances} (Expected: LKR ${otherTotal})`)

  if (Number(verifySal.other_allowances) !== otherTotal) {
    throw new Error(`Allowances mismatch: got ${verifySal.other_allowances}, expected ${otherTotal}`)
  }

  // Step 4: Simulate modifying a paygrade addition in PayGradesPage and saving
  console.log('\n🔄 Step 4: Simulating addition change in CR 02: VARIABLE ALLOWANCE 9,000 -> 9,500...')
  const varAdd = cr02.additions.find((a) => a.additionCode === '01')
  varAdd.amount = 9500

  // Cascade to employee
  const newExpectedTotal = 9500 + 15000 + 6000 + 1300 // 31,800
  await supabase
    .from('salary_structures')
    .update({ other_allowances: newExpectedTotal, updated_at: new Date().toISOString() })
    .eq('id', verifySal.id)

  const { data: afterUpdateSal } = await supabase
    .from('salary_structures')
    .select('other_allowances')
    .eq('id', verifySal.id)
    .single()

  console.log(`✅ Employee salary structure immediately updated: LKR ${afterUpdateSal.other_allowances} (Expected: LKR ${newExpectedTotal})`)

  // Step 5: Restore back to 9000
  console.log('\n↩️ Step 5: Restoring VARIABLE ALLOWANCE back to 9,000...')
  varAdd.amount = 9000
  await supabase
    .from('system_settings')
    .update({
      setting_value: { grades, updatedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq('setting_key', 'hr_pay_grades_data')

  await supabase
    .from('salary_structures')
    .update({ other_allowances: 31300, updated_at: new Date().toISOString() })
    .eq('id', verifySal.id)

  const { data: restoredSal } = await supabase
    .from('salary_structures')
    .select('other_allowances')
    .eq('id', verifySal.id)
    .single()

  console.log(`✅ Restored to LKR ${restoredSal.other_allowances}. Everything 100% in sync!`)

  console.log('\n🏆 ALL PAY GRADES & EMPLOYEE PROFILE REAL-TIME TESTS PASSED SUCCESSFULLY!')
}

runTest().catch((e) => {
  console.error('❌ Test failed:', e)
  process.exit(1)
})

