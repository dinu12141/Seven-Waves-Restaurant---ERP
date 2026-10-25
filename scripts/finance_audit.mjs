import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNseWt3dXphanR3dnd1YXZtdHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI5NjA4MSwiZXhwIjoyMDg2ODcyMDgxfQ.ph7Yy1Izhz21kmJSKXpowbWJYGYMz0YxlpoVG6hBABA'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function run() {
  const [accsRes, vRes, cbRes, chqRes] = await Promise.all([
    supabase.from('finance_accounts').select('*').is('deleted_at', null),
    supabase.from('finance_vouchers').select('id, voucher_no, account_id, bank_id, ledger_id, amount'),
    supabase.from('finance_cashbook_entries').select('id, account_id, ledger_id, debit_amount, credit_amount'),
    supabase.from('finance_cheques').select('id, bank_account_id, cheque_no')
  ])

  const vAccs = new Set()
  for (const v of vRes.data || []) {
    if (v.account_id) vAccs.add(v.account_id)
    if (v.bank_id) vAccs.add(v.bank_id)
  }

  const cbAccs = new Set((cbRes.data || []).map(cb => cb.account_id).filter(Boolean))
  const chqAccs = new Set((chqRes.data || []).map(c => c.bank_account_id).filter(Boolean))

  console.log('--- ACCOUNTS WITH TRANSACTIONS OR NON-ZERO BALANCE ---')
  const used = []
  const safeToDelete = []

  for (const a of accsRes.data || []) {
    const hasV = vAccs.has(a.id)
    const hasCb = cbAccs.has(a.id)
    const hasChq = chqAccs.has(a.id)
    const hasTx = hasV || hasCb || hasChq
    const hasBal = a.current_balance !== 0 || a.opening_balance !== 0

    if (hasTx || hasBal) {
      used.push({ id: a.id, name: a.registered_name, type: a.account_type, open: a.opening_balance, curr: a.current_balance, hasV, hasCb, hasChq })
      console.log(`USED: [${a.id}] ${a.registered_name} (${a.account_type}) | Open: ${a.opening_balance} | Curr: ${a.current_balance} | V:${hasV} CB:${hasCb} CHQ:${hasChq}`)
    } else {
      safeToDelete.push(a)
    }
  }

  console.log('\n--- ACCOUNTS WITH ZERO USAGE & ZERO BALANCE (MISTAKENLY ADDED LEDGERS AS CASH ACCOUNTS) ---')
  for (const a of safeToDelete) {
    console.log(`SAFE_TO_DELETE: [${a.id}] ${a.registered_name} (${a.account_type})`)
  }
  console.log('Total safe to delete:', safeToDelete.length)
  console.log('Total used / with balance:', used.length)
}

run()
