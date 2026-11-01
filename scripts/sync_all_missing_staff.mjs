import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import xlsx from 'xlsx'
import fs from 'fs'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const COMPANY_ID = '5c7ff29c-418a-461a-9624-3667375c2af4'
const BRANCH_ID = '340efb20-513a-4d99-b1e7-f32f938e31a8'

function parseExcelDate(val) {
  if (!val) return '2026-08-01'
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10)
  }
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 10)
  }
  const str = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  const num = parseFloat(str)
  if (!isNaN(num) && num > 30000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 10)
  }
  return '2026-08-01'
}

async function run() {
  console.log('=== RESTORING ALL MISSING EMPLOYEES TO ~88-96 STAFF ===\n')

  // 1. Fetch departments and designations
  const { data: depts } = await supabase.from('departments').select('id, name')
  const { data: desigs } = await supabase.from('designations').select('id, title')

  const deptMap = new Map()
  depts?.forEach(d => deptMap.set(d.name.trim().toLowerCase(), d.id))
  const desigMap = new Map()
  desigs?.forEach(d => desigMap.set(d.title.trim().toLowerCase(), d.id))

  const defaultDeptId = depts?.[0]?.id
  const defaultDesigId = desigs?.[0]?.id

  // 2. Fetch existing employees from DB
  const { data: existingEmps } = await supabase
    .from('employees')
    .select('id, employee_code, attendance_device_id')
  
  if (!existingEmps) {
    console.error('Failed to load existing employees.')
    process.exit(1)
  }

  console.log(`Current existing employees in DB: ${existingEmps.length}`)
  const existingCodeSet = new Set(existingEmps.map(e => e.employee_code.trim().toUpperCase()))
  const existingPinSet = new Set(existingEmps.map(e => String(e.attendance_device_id || '').trim()).filter(Boolean))

  // Also add numeric versions to pin set
  for (const e of existingEmps) {
    const num = e.employee_code.replace(/\D/g, '')
    if (num) {
      existingPinSet.add(num)
      existingPinSet.add(parseInt(num, 10).toString())
    }
  }

  // 3. Load user.dat names from machine
  const buf = fs.readFileSync('user.dat')
  const userDatMap = new Map()
  for (let off = 0; off + 72 <= buf.length; off += 72) {
    const chunk = buf.subarray(off, off + 72)
    const pin = chunk.readUInt16LE(0)
    let name = ''
    for (let i = 11; i < 35; i++) {
      if (chunk[i] === 0) break
      name += String.fromCharCode(chunk[i])
    }
    name = name.trim()
    if (pin > 0 && name.length > 0) {
      userDatMap.set(String(pin), name)
    }
  }

  // 4. Insert Missing Excel Employees (8 staff)
  const wb = xlsx.readFile('import/Staff Details (1).xlsx')
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  let excelAdded = 0

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !r[0]) continue
    const code = String(r[0]).trim().toUpperCase()
    if (existingCodeSet.has(code)) continue

    const name = String(r[1] || '').trim()
    const epf = String(r[2] || '').trim()
    const nic = String(r[3] || '').trim()
    const joinDate = parseExcelDate(r[4])
    const basicSalary = Number(r[5]) || 35000
    const desigStr = String(r[6] || '').trim().toLowerCase()
    const deptStr = String(r[7] || '').trim().toLowerCase()

    const deptId = deptMap.get(deptStr) || defaultDeptId
    const desigId = desigMap.get(desigStr) || defaultDesigId

    const pinNum = code.replace(/\D/g, '')
    const pin = parseInt(pinNum, 10).toString()

    const { data: newEmp, error: insErr } = await supabase.from('employees').insert({
      company_id: COMPANY_ID,
      branch_id: BRANCH_ID,
      employee_code: code,
      first_name: name,
      last_name: '',
      title: name.toLowerCase().startsWith('mrs') ? 'Mrs.' : 'Mr.',
      epf_no: epf,
      nic_number: nic,
      hire_date: joinDate,
      department_id: deptId,
      designation_id: desigId,
      attendance_device_id: pin,
      employment_status: 'permanent',
      employment_type: 'full_time',
      pay_type: 'Monthly',
      ot: 'Eligible',
      internal_company: 'SEVEN WAVES (PVT) LTD',
      epf_etf_eligible: true,
      is_active: true,
    }).select('id').single()

    if (insErr) {
      console.error(`Failed to insert Excel ${code}:`, insErr.message)
    } else {
      excelAdded++
      existingCodeSet.add(code)
      existingPinSet.add(pin)

      // Add salary structure
      await supabase.from('salary_structures').insert({
        company_id: COMPANY_ID,
        employee_id: newEmp.id,
        basic_salary: basicSalary,
        effective_from: joinDate,
        is_current: true,
      })

      console.log(`[Excel] Added: ${code} - ${name} (${desigStr}) | PIN: ${pin}`)
    }
  }

  console.log(`\n✅ Added ${excelAdded} employees from Excel.`)

  // 5. Insert Active Machine Punching Staff (PINs 281, 299, 332..363)
  const attText = fs.readFileSync('CGCA222960804_attlog.dat', 'utf8')
  const punchCounts = new Map()
  for (const l of attText.split(/\r?\n/)) {
    const p = l.trim().split(/\s+/)[0]
    if (p) punchCounts.set(p, (punchCounts.get(p) || 0) + 1)
  }

  const sortedPins = Array.from(punchCounts.entries())
    .filter(([pin, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])

  let machineStaffAdded = 0

  for (const [pin, count] of sortedPins) {
    if (existingPinSet.has(pin)) continue

    const paddedCode = `EMP${String(pin).padStart(6, '0')}`
    if (existingCodeSet.has(paddedCode)) continue

    const machineName = userDatMap.get(pin) || `Staff Member (PIN ${pin})`

    const { data: newEmp, error: insErr } = await supabase.from('employees').insert({
      company_id: COMPANY_ID,
      branch_id: BRANCH_ID,
      employee_code: paddedCode,
      first_name: machineName,
      last_name: '',
      title: 'Mr.',
      hire_date: '2026-08-01',
      department_id: defaultDeptId,
      designation_id: defaultDesigId,
      attendance_device_id: pin,
      employment_status: 'permanent',
      employment_type: 'full_time',
      pay_type: 'Monthly',
      ot: 'Eligible',
      internal_company: 'SEVEN WAVES (PVT) LTD',
      epf_etf_eligible: true,
      is_active: true,
    }).select('id').single()

    if (insErr) {
      console.error(`Failed to insert Machine Staff ${pin}:`, insErr.message)
    } else {
      machineStaffAdded++
      existingCodeSet.add(paddedCode)
      existingPinSet.add(pin)

      // Add default salary structure
      await supabase.from('salary_structures').insert({
        company_id: COMPANY_ID,
        employee_id: newEmp.id,
        basic_salary: 35000,
        effective_from: '2026-08-01',
        is_current: true,
      })

      console.log(`[Machine] Added: ${paddedCode} - ${machineName} | PIN: ${pin} (${count} punches)`)
    }
  }

  console.log(`\n✅ Added ${machineStaffAdded} active staff from Fingerprint Machine.`)

  // 6. Link attendance_logs for all newly inserted employees
  console.log('\nLinking attendance logs to newly created employees...')
  const { data: allEmps } = await supabase
    .from('employees')
    .select('id, employee_code, attendance_device_id')
    .eq('is_active', true)

  for (const emp of allEmps || []) {
    const pin = emp.attendance_device_id || emp.employee_code.replace(/\D/g, '')
    if (pin) {
      await supabase
        .from('attendance_logs')
        .update({ employee_id: emp.id })
        .is('employee_id', null)
        .or(`employee_code.eq.${emp.employee_code},employee_code.eq.${pin}`)
    }
  }

  // 7. Recalculate Attendance Records
  console.log('Triggering process_attendance_logs_v2()...')
  try {
    await supabase.rpc('process_attendance_logs_v2')
  } catch (e) {
    console.warn('RPC process note:', e.message)
  }

  // 8. Final Count Check
  const { count: finalTotal } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true })

  console.log(`\n🎉 TOTAL EMPLOYEES NOW IN ERP: ${finalTotal}`)
}

run()
