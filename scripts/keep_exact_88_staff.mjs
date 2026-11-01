import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const REMOVE_IDS = [
  'a94576a9-c592-4db2-9df2-65fdacf719a3', // EMP000360
  'c3018133-f432-406c-bd69-16ea330c25f6', // EMP000363
  '5e109a9c-e07e-4bb5-a59f-6982ca335d30', // EMP000342
  '174e7aec-49cf-469f-8eb7-0c1b9b1d9d81', // EMP000359
  'a0e9ad37-3921-4e9e-8563-fd4c883ba2bd', // EMP000334
  'f2911ed6-029a-4079-b88d-6290aac74f1d', // EMP000361
  '0543fe22-0556-45f8-b7d6-6ab49e7b273f', // EMP000358
  '24e8f6af-782d-4199-a4b9-ed2a98c023cc', // EMP000344
  'f0a9ac05-6def-4e77-9bd4-132a7757f7ec', // EMP000356
  '1823d231-7e7b-4a39-8279-903a3516a8b3', // EMP000355
  'fb8eeb38-db31-415a-a528-6bff5c01419a', // EMP000357
  '33510e40-6ed8-403d-9430-31efdf19dd8f', // EMP000341
]

async function trimTo88() {
  console.log(`Targeting ${REMOVE_IDS.length} IDs to remove...`)

  // 1. Delete salary_structures
  const { error: salErr } = await supabase
    .from('salary_structures')
    .delete()
    .in('employee_id', REMOVE_IDS)
  if (salErr) console.warn('Salary delete warning:', salErr.message)

  // 2. Unlink attendance logs
  await supabase
    .from('attendance_logs')
    .update({ employee_id: null })
    .in('employee_id', REMOVE_IDS)

  // 3. Delete attendance_records
  await supabase
    .from('attendance_records')
    .delete()
    .in('employee_id', REMOVE_IDS)

  // 4. Delete employees
  const { error: empErr } = await supabase
    .from('employees')
    .delete()
    .in('id', REMOVE_IDS)

  if (empErr) {
    console.error('Failed to delete employees:', empErr.message)
  } else {
    console.log(`✅ Successfully removed ${REMOVE_IDS.length} employees.`)
  }

  // 5. Check count
  const { count: finalCount } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  console.log(`\n🎉 EXACT ACTIVE EMPLOYEES COUNT: ${finalCount}`)
}

trimTo88()
