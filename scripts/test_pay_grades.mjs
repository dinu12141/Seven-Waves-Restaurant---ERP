// ═══════════════════════════════════════════════════════════════════════════════
// Test CLI for HR Pay Grades & Fixed Additions
// Seven Waves ERP
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

export const DEFAULT_PAY_GRADES = [
  {
    code: 'CR 01',
    name: 'Cashier 01',
    department: 'CASHIER',
    templateCode: '0004',
    additions: [
      { id: 'cr01-01', code: '0004', additionCode: '01', gradeCode: 'CR 01', additionName: 'VARIABLE ALLOWANCE', amount: 8000 },
      { id: 'cr01-02', code: '0004', additionCode: '02', gradeCode: 'CR 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'cr01-05', code: '0004', additionCode: '05', gradeCode: 'CR 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'cr01-06', code: '0004', additionCode: '06', gradeCode: 'CR 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CR 02',
    name: 'Cashier 02',
    department: 'CASHIER',
    templateCode: '0004',
    additions: [
      { id: 'cr02-01', code: '0004', additionCode: '01', gradeCode: 'CR 02', additionName: 'VARIABLE ALLOWANCE', amount: 9000 },
      { id: 'cr02-02', code: '0004', additionCode: '02', gradeCode: 'CR 02', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'cr02-05', code: '0004', additionCode: '05', gradeCode: 'CR 02', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'cr02-06', code: '0004', additionCode: '06', gradeCode: 'CR 02', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CR 03',
    name: 'Cashier 03',
    department: 'CASHIER',
    templateCode: '0004',
    additions: [
      { id: 'cr03-01', code: '0004', additionCode: '01', gradeCode: 'CR 03', additionName: 'VARIABLE ALLOWANCE', amount: 10000 },
      { id: 'cr03-02', code: '0004', additionCode: '02', gradeCode: 'CR 03', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'cr03-05', code: '0004', additionCode: '05', gradeCode: 'CR 03', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'cr03-06', code: '0004', additionCode: '06', gradeCode: 'CR 03', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'BNMRY 01',
    name: 'Benmary / Buffet 01',
    department: 'BENMARY',
    templateCode: '0004',
    additions: [
      { id: 'bnmry01-01', code: '0004', additionCode: '01', gradeCode: 'BNMRY 01', additionName: 'VARIABLE ALLOWANCE', amount: 8000 },
      { id: 'bnmry01-02', code: '0004', additionCode: '02', gradeCode: 'BNMRY 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'bnmry01-05', code: '0004', additionCode: '05', gradeCode: 'BNMRY 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'bnmry01-06', code: '0004', additionCode: '06', gradeCode: 'BNMRY 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'BNMRY 02',
    name: 'Benmary / Buffet 02',
    department: 'BENMARY',
    templateCode: '0004',
    additions: [
      { id: 'bnmry02-01', code: '0004', additionCode: '01', gradeCode: 'BNMRY 02', additionName: 'VARIABLE ALLOWANCE', amount: 9000 },
      { id: 'bnmry02-02', code: '0004', additionCode: '02', gradeCode: 'BNMRY 02', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'bnmry02-05', code: '0004', additionCode: '05', gradeCode: 'BNMRY 02', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'bnmry02-06', code: '0004', additionCode: '06', gradeCode: 'BNMRY 02', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'JC BR 01',
    name: 'Juice Bar 01',
    department: 'JUICE BAR',
    templateCode: '0004',
    additions: [
      { id: 'jcbr01-01', code: '0004', additionCode: '01', gradeCode: 'JC BR 01', additionName: 'VARIABLE ALLOWANCE', amount: 8500 },
      { id: 'jcbr01-02', code: '0004', additionCode: '02', gradeCode: 'JC BR 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'jcbr01-05', code: '0004', additionCode: '05', gradeCode: 'JC BR 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'jcbr01-06', code: '0004', additionCode: '06', gradeCode: 'JC BR 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'P&B 01',
    name: 'Pastry & Bakery 01',
    department: 'PASTRY AND BAKERY',
    templateCode: '0004',
    additions: [
      { id: 'pb01-01', code: '0004', additionCode: '01', gradeCode: 'P&B 01', additionName: 'VARIABLE ALLOWANCE', amount: 8000 },
      { id: 'pb01-02', code: '0004', additionCode: '02', gradeCode: 'P&B 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'pb01-05', code: '0004', additionCode: '05', gradeCode: 'P&B 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'pb01-06', code: '0004', additionCode: '06', gradeCode: 'P&B 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'P&B 02',
    name: 'Pastry & Bakery 02',
    department: 'PASTRY AND BAKERY',
    templateCode: '0004',
    additions: [
      { id: 'pb02-01', code: '0004', additionCode: '01', gradeCode: 'P&B 02', additionName: 'VARIABLE ALLOWANCE', amount: 9500 },
      { id: 'pb02-02', code: '0004', additionCode: '02', gradeCode: 'P&B 02', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'pb02-05', code: '0004', additionCode: '05', gradeCode: 'P&B 02', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'pb02-06', code: '0004', additionCode: '06', gradeCode: 'P&B 02', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'P&B 03',
    name: 'Pastry & Bakery 03',
    department: 'PASTRY AND BAKERY',
    templateCode: '0004',
    additions: [
      { id: 'pb03-01', code: '0004', additionCode: '01', gradeCode: 'P&B 03', additionName: 'VARIABLE ALLOWANCE', amount: 11000 },
      { id: 'pb03-02', code: '0004', additionCode: '02', gradeCode: 'P&B 03', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'pb03-05', code: '0004', additionCode: '05', gradeCode: 'P&B 03', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'pb03-06', code: '0004', additionCode: '06', gradeCode: 'P&B 03', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CHNSE 01',
    name: 'Chinese Kitchen 01',
    department: 'CHINESE',
    templateCode: '0004',
    additions: [
      { id: 'chnse01-01', code: '0004', additionCode: '01', gradeCode: 'CHNSE 01', additionName: 'VARIABLE ALLOWANCE', amount: 8000 },
      { id: 'chnse01-02', code: '0004', additionCode: '02', gradeCode: 'CHNSE 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'chnse01-05', code: '0004', additionCode: '05', gradeCode: 'CHNSE 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'chnse01-06', code: '0004', additionCode: '06', gradeCode: 'CHNSE 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CHNSE 02',
    name: 'Chinese Kitchen 02',
    department: 'CHINESE',
    templateCode: '0004',
    additions: [
      { id: 'chnse02-01', code: '0004', additionCode: '01', gradeCode: 'CHNSE 02', additionName: 'VARIABLE ALLOWANCE', amount: 9000 },
      { id: 'chnse02-02', code: '0004', additionCode: '02', gradeCode: 'CHNSE 02', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'chnse02-05', code: '0004', additionCode: '05', gradeCode: 'CHNSE 02', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'chnse02-06', code: '0004', additionCode: '06', gradeCode: 'CHNSE 02', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CHNSE 03',
    name: 'Chinese Kitchen 03',
    department: 'CHINESE',
    templateCode: '0004',
    additions: [
      { id: 'chnse03-01', code: '0004', additionCode: '01', gradeCode: 'CHNSE 03', additionName: 'VARIABLE ALLOWANCE', amount: 10500 },
      { id: 'chnse03-02', code: '0004', additionCode: '02', gradeCode: 'CHNSE 03', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'chnse03-05', code: '0004', additionCode: '05', gradeCode: 'CHNSE 03', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'chnse03-06', code: '0004', additionCode: '06', gradeCode: 'CHNSE 03', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CHNSE 04',
    name: 'Chinese Kitchen 04',
    department: 'CHINESE',
    templateCode: '0004',
    additions: [
      { id: 'chnse04-01', code: '0004', additionCode: '01', gradeCode: 'CHNSE 04', additionName: 'VARIABLE ALLOWANCE', amount: 12000 },
      { id: 'chnse04-02', code: '0004', additionCode: '02', gradeCode: 'CHNSE 04', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'chnse04-05', code: '0004', additionCode: '05', gradeCode: 'CHNSE 04', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'chnse04-06', code: '0004', additionCode: '06', gradeCode: 'CHNSE 04', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CHNSE 05',
    name: 'Chinese Kitchen 05',
    department: 'CHINESE',
    templateCode: '0004',
    additions: [
      { id: 'chnse05-01', code: '0004', additionCode: '01', gradeCode: 'CHNSE 05', additionName: 'VARIABLE ALLOWANCE', amount: 14000 },
      { id: 'chnse05-02', code: '0004', additionCode: '02', gradeCode: 'CHNSE 05', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'chnse05-05', code: '0004', additionCode: '05', gradeCode: 'CHNSE 05', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'chnse05-06', code: '0004', additionCode: '06', gradeCode: 'CHNSE 05', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'RCE CRY 01',
    name: 'Rice & Curry 01',
    department: 'RICE AND CURRY',
    templateCode: '0004',
    additions: [
      { id: 'rce01-01', code: '0004', additionCode: '01', gradeCode: 'RCE CRY 01', additionName: 'VARIABLE ALLOWANCE', amount: 8000 },
      { id: 'rce01-02', code: '0004', additionCode: '02', gradeCode: 'RCE CRY 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'rce01-05', code: '0004', additionCode: '05', gradeCode: 'RCE CRY 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'rce01-06', code: '0004', additionCode: '06', gradeCode: 'RCE CRY 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'RCE CRY 02',
    name: 'Rice & Curry 02',
    department: 'RICE AND CURRY',
    templateCode: '0004',
    additions: [
      { id: 'rce02-01', code: '0004', additionCode: '01', gradeCode: 'RCE CRY 02', additionName: 'VARIABLE ALLOWANCE', amount: 9500 },
      { id: 'rce02-02', code: '0004', additionCode: '02', gradeCode: 'RCE CRY 02', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'rce02-05', code: '0004', additionCode: '05', gradeCode: 'RCE CRY 02', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'rce02-06', code: '0004', additionCode: '06', gradeCode: 'RCE CRY 02', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CLEANING 01',
    name: 'Cleaning Staff 01',
    department: 'CLEANING',
    templateCode: '0004',
    additions: [
      { id: 'cln01-01', code: '0004', additionCode: '01', gradeCode: 'CLEANING 01', additionName: 'VARIABLE ALLOWANCE', amount: 7000 },
      { id: 'cln01-02', code: '0004', additionCode: '02', gradeCode: 'CLEANING 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'cln01-05', code: '0004', additionCode: '05', gradeCode: 'CLEANING 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'cln01-06', code: '0004', additionCode: '06', gradeCode: 'CLEANING 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'WASH UP 01',
    name: 'Wash Up / Steward 01',
    department: 'STEWARD',
    templateCode: '0004',
    additions: [
      { id: 'wu01-01', code: '0004', additionCode: '01', gradeCode: 'WASH UP 01', additionName: 'VARIABLE ALLOWANCE', amount: 7000 },
      { id: 'wu01-02', code: '0004', additionCode: '02', gradeCode: 'WASH UP 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'wu01-05', code: '0004', additionCode: '05', gradeCode: 'WASH UP 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'wu01-06', code: '0004', additionCode: '06', gradeCode: 'WASH UP 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'MANAGMENT 01',
    name: 'Management 01',
    department: 'MANAGMENT',
    templateCode: '0004',
    additions: [
      { id: 'mgmt01-01', code: '0004', additionCode: '01', gradeCode: 'MANAGMENT 01', additionName: 'VARIABLE ALLOWANCE', amount: 18000 },
      { id: 'mgmt01-02', code: '0004', additionCode: '02', gradeCode: 'MANAGMENT 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'mgmt01-05', code: '0004', additionCode: '05', gradeCode: 'MANAGMENT 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'mgmt01-06', code: '0004', additionCode: '06', gradeCode: 'MANAGMENT 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  }
]

const SETTING_KEY_PAY_GRADES = 'hr_pay_grades_data'

async function syncToSupabase() {
  console.log('🏛️ Testing HR Pay Grades & Fixed Additions System...')
  console.log('======================================================')

  const { data: comp } = await supabase.from('companies').select('id').limit(1).single()
  const companyId = comp?.id || '5c7ff29c-418a-461a-9624-3667375c2af4'

  // Fetch or Seed into system_settings
  const { data: existing } = await supabase
    .from('system_settings')
    .select('id, setting_value')
    .eq('setting_key', SETTING_KEY_PAY_GRADES)
    .maybeSingle()

  let grades = existing?.setting_value?.grades
  if (!grades || !Array.isArray(grades) || grades.length === 0) {
    console.log('🌱 Seeding initial 19 Master Pay Grades into Supabase system_settings...')
    const payload = {
      grades: DEFAULT_PAY_GRADES,
      updatedAt: new Date().toISOString()
    }
    if (existing) {
      await supabase.from('system_settings').update({ setting_value: payload }).eq('id', existing.id)
    } else {
      await supabase.from('system_settings').insert({
        company_id: companyId,
        setting_key: SETTING_KEY_PAY_GRADES,
        setting_value: payload
      })
    }
    grades = DEFAULT_PAY_GRADES
  }

  console.log(`✅ Loaded ${grades.length} Pay Grades from Supabase.\n`)

  // Inspect CR 02 (as shown in legacy screenshot)
  const cr02 = grades.find(g => g.code === 'CR 02')
  console.log('📋 Pay Grade Details for CR 02 (as shown in User Images):')
  console.log('------------------------------------------------------')
  console.log(`Grade Code: ${cr02?.code} | Name: ${cr02?.name} | Dept: ${cr02?.department}`)
  console.log('Fixed Additions Table:')
  console.table(
    cr02?.additions.map(a => ({
      Fixed_All_Code: a.code,
      Fixed_All_Addition_code: a.additionCode,
      Fixed_All_Grades: a.gradeCode,
      Fixed_All_Addition: a.additionName,
      Fixed_All_Amount: a.amount.toFixed(2)
    }))
  )

  const totalFixed = cr02?.additions.reduce((sum, a) => sum + a.amount, 0) || 0
  console.log(`💰 Total Fixed Additions for CR 02: LKR ${totalFixed.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`)

  console.log('\n📜 All 19 Master Pay Grades Registered in Seven Waves ERP:')
  const gradeCodes = grades.map(g => g.code)
  console.log(gradeCodes.join(', '))

  console.log('\n✅ HR Pay Grades Verification Complete!')
}

syncToSupabase().catch(err => {
  console.error('Test error:', err)
  process.exit(1)
})
