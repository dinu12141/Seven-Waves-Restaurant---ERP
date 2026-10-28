import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)))

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function run() {
  console.log('=== STEP 1: CLEANING UP DUMMY ACCOUNTS IN finance_accounts ===')

  // Real accounts that should remain:
  // 1. MAIN CASH -ACC (f62da1b7-3362-4402-a473-570e50f967c7)
  // 2. Main Cash office (45644893-a8d9-4851-b0a0-fee9a05b6865)
  // 3. HNB-043010160698 (694707be-dd19-44ae-ba78-b558c4db166f)
  // 4. Commercial-1000725139 (babc8e1c-fe7f-4e9a-9106-4cfbc16126ee)
  // 5. IOU (23dbb705-9870-4a2e-a813-6d8fff313a41)
  // 6. NTB-100760009146 (if real bank) or PEOPLES BANK (f22c35b6-d635-4271-b457-f4ea4e312f64)
  // 7. Store Petty Cash (00c1ec1a-15f1-4ff6-951c-95a8e43574d6)

  // First, re-link RV-000012 from Internet Expenses account to MAIN CASH -ACC
  const mainCashId = 'f62da1b7-3362-4402-a473-570e50f967c7'
  
  console.log('Re-linking RV-000012 to MAIN CASH -ACC...')
  await supabase.from('finance_vouchers')
    .update({ account_id: mainCashId })
    .eq('voucher_no', 'RV-000012')
  
  await supabase.from('finance_cashbook_entries')
    .update({ account_id: mainCashId })
    .eq('source_type', 'received_voucher')
    .eq('credit_amount', 21079)

  console.log('Re-linking PV-000036 (Janith IOU) to MAIN CASH -ACC...')
  await supabase.from('finance_vouchers')
    .update({ account_id: mainCashId })
    .eq('voucher_no', 'PV-000036')

  await supabase.from('finance_cashbook_entries')
    .update({ account_id: mainCashId })
    .eq('source_type', 'pay_voucher')
    .eq('debit_amount', 17740)

  // Reset Accounts Payables ledger 2000 balance back from -35480 to 0
  console.log('Resetting Accounts Payables ledger 2000 balance...')
  await supabase.from('finance_ledgers')
    .update({ current_balance: 0 })
    .eq('ledger_code', '2000')

  // Identify all accounts in finance_accounts that are NOT one of the legitimate payment accounts
  const legitAccountIds = new Set([
    'f62da1b7-3362-4402-a473-570e50f967c7', // MAIN CASH -ACC
    '45644893-a8d9-4851-b0a0-fee9a05b6865', // Main Cash office
    '694707be-dd19-44ae-ba78-b558c4db166f', // HNB-043010160698
    'babc8e1c-fe7f-4e9a-9106-4cfbc16126ee', // Commercial-1000725139
    'f22c35b6-d635-4271-b457-f4ea4e312f64', // PEOPLES BANK
    'd8fabf86-5541-417a-9a71-a496c83fa89c', // NTB-100760009146
    'd7f7e588-05ba-4536-8e90-02e4741cbe06', // NDB-111000341537
    '00c1ec1a-15f1-4ff6-951c-95a8e43574d6', // 100001-3 Store Petty Cash
    'c278fc2e-a62b-4e77-827f-06ad89b9d7e6', // Petty Cash HR
    '23dbb705-9870-4a2e-a813-6d8fff313a41', // IOU
    'd9b200bf-2fdf-4fa6-9f99-5e3b3be233b9', // Change Fund
  ])

  const { data: allAccounts } = await supabase.from('finance_accounts').select('id, registered_name, account_type').is('deleted_at', null)
  const toDelete = (allAccounts || []).filter(a => !legitAccountIds.has(a.id))

  console.log(`Found ${toDelete.length} dummy/mistakenly added expense/asset accounts to remove from finance_accounts.`)
  
  const toDeleteIds = toDelete.map(a => a.id)
  if (toDeleteIds.length > 0) {
    const { error: delErr } = await supabase.from('finance_accounts').delete().in('id', toDeleteIds)
    if (delErr) {
      console.error('Delete error, trying soft-delete:', delErr.message)
      await supabase.from('finance_accounts').update({ deleted_at: new Date().toISOString() }).in('id', toDeleteIds)
    } else {
      console.log('Successfully deleted dummy accounts from finance_accounts!')
    }
  }

  // Next, clean up old bank_accounts dummy rows
  console.log('\n=== STEP 2: CLEANING UP OLD bank_accounts ===')
  // Accounts with XXXXXXXXXXXXXX or dummy negative balances
  const { data: oldB } = await supabase.from('bank_accounts').select('*')
  for (const b of oldB || []) {
    if (b.account_number?.includes('XXXX') || b.name?.includes('Commercial') || b.name?.includes('Sampath') || b.name?.includes('HNB (Payroll)') || b.name === 'Cash on Hand') {
      console.log(`Deleting dummy old bank account: ${b.name} (${b.id})`)
      await supabase.from('bank_accounts').delete().eq('id', b.id)
    }
  }

  console.log('\nAccount cleanup complete! Verifying remaining accounts...')
  const { data: remaining } = await supabase.from('finance_accounts').select('id, registered_name, account_type, current_balance').is('deleted_at', null)
  console.log('Remaining clean finance_accounts:', remaining)
}

run()
