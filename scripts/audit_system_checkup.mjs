import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co';
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || (console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is not set. Export the service role key (never commit it) and re-run.'), process.exit(1)));

const sb = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log('====================================================');
  console.log('       SEVEN WAVES ERP - FULL SYSTEM CHECKUP        ');
  console.log('====================================================\n');

  // 1. Finance Accounts & Ledgers
  console.log('--- 1. FINANCE ACCOUNTS (CASH & BANK) & LEDGER LINKS ---');
  const { data: accounts, error: accErr } = await sb
    .from('finance_accounts')
    .select('id, registered_name, bank_name, account_number, account_type, current_balance, ledger_id, is_default, is_active')
    .order('registered_name');

  const { data: ledgers } = await sb
    .from('finance_ledgers')
    .select('id, ledger_code, ledger_name, ledger_type, current_balance');
  const ledgerMap = new Map((ledgers || []).map(l => [l.id, l]));

  for (const acc of accounts || []) {
    const l = acc.ledger_id ? ledgerMap.get(acc.ledger_id) : null;
    const ledgerStatus = l
      ? `${l.ledger_code} - ${l.ledger_name.trim()} (Bal: ${l.current_balance})`
      : '⚠️ NOT LINKED (null)';
    const balanceMatch = l ? (Number(acc.current_balance) === Number(l.current_balance) ? '✅ Match' : `❌ Mismatch (Acc: ${acc.current_balance} vs Ledger: ${l.current_balance})`) : 'N/A';

    console.log(`- [${(acc.account_type || '').toUpperCase()}] ${acc.registered_name || acc.bank_name || 'Unnamed'} (Acc No: ${acc.account_number || 'N/A'})`);
    console.log(`    Current Balance : LKR ${Number(acc.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`    Linked Ledger   : ${ledgerStatus}`);
    console.log(`    Balance Check   : ${balanceMatch}`);
    console.log(`    Active: ${acc.is_active} | Default: ${acc.is_default}`);
  }

  // 2. AP Invoices & GRNs
  console.log('\n--- 2. AP INVOICES & GRN STATUS ---');
  const { count: grnCount } = await sb.from('goods_receipts').select('*', { count: 'exact', head: true });
  const { count: grnPostedCount } = await sb.from('goods_receipts').select('*', { count: 'exact', head: true }).eq('status', 'posted');
  const { count: apTotalCount } = await sb.from('ap_invoices').select('*', { count: 'exact', head: true });
  const { count: apDraftCount } = await sb.from('ap_invoices').select('*', { count: 'exact', head: true }).eq('status', 'draft');
  const { count: apPostedCount } = await sb.from('ap_invoices').select('*', { count: 'exact', head: true }).eq('status', 'posted');
  const { count: apLedgerCount } = await sb.from('ap_ledger').select('*', { count: 'exact', head: true });

  console.log(`Total GRNs in system: ${grnCount} (Posted: ${grnPostedCount})`);
  console.log(`Total AP Invoices: ${apTotalCount}`);
  console.log(`    - Draft AP Invoices : ${apDraftCount}`);
  console.log(`    - Posted AP Invoices: ${apPostedCount}`);
  console.log(`Total AP Ledger entries: ${apLedgerCount}`);

  // Sum of draft invoice total_amount
  const { data: draftInvs } = await sb.from('ap_invoices').select('total_amount').eq('status', 'draft');
  const draftTotal = (draftInvs || []).reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
  console.log(`Total Pending Payables trapped in Draft Invoices: LKR ${draftTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

  // 3. Suppliers Balance Check
  console.log('\n--- 3. SUPPLIER BALANCES ---');
  const { data: suppliers } = await sb.from('suppliers').select('id, name, balance').order('balance', { ascending: false }).limit(10);
  console.log('Top 10 Supplier Balances currently recorded:');
  for (const s of suppliers || []) {
    console.log(`- ${s.name}: LKR ${Number(s.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  }

  // 4. Accounts Payable Ledger (2000)
  console.log('\n--- 4. ACCOUNTS PAYABLE LEDGER (2000) ---');
  const apLedgerRow = ledgers.find(l => l.ledger_code === '2000');
  console.log(`Ledger 2000 (${apLedgerRow?.ledger_name}): LKR ${Number(apLedgerRow?.current_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

  // 5. Vouchers Check
  console.log('\n--- 5. FINANCE VOUCHERS (PAY & RECEIVED) ---');
  const { data: vouchers } = await sb.from('finance_vouchers').select('voucher_type, status, amount');
  const payCount = (vouchers || []).filter(v => v.voucher_type === 'pay').length;
  const payPosted = (vouchers || []).filter(v => v.voucher_type === 'pay' && v.status === 'posted').length;
  const recCount = (vouchers || []).filter(v => v.voucher_type === 'received').length;
  const recPosted = (vouchers || []).filter(v => v.voucher_type === 'received' && v.status === 'posted').length;

  console.log(`Pay Vouchers: ${payCount} total (${payPosted} posted)`);
  console.log(`Received Vouchers: ${recCount} total (${recPosted} posted)`);

  // 6. POS Shifts & Sales Check
  console.log('\n--- 6. POS SHIFTS & REVENUE ---');
  const { count: totalShifts } = await sb.from('pos_shifts').select('*', { count: 'exact', head: true });
  const { count: closedShifts } = await sb.from('pos_shifts').select('*', { count: 'exact', head: true }).eq('status', 'closed');
  const { count: totalOrders } = await sb.from('orders').select('*', { count: 'exact', head: true });
  const { count: completedOrders } = await sb.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'completed');
  console.log(`Total POS Shifts: ${totalShifts} (${closedShifts} closed)`);
  console.log(`Total Orders: ${totalOrders} (${completedOrders} completed)`);

  // 7. Double-entry Cashbook Entries Balance Check
  console.log('\n--- 7. CASHBOOK DOUBLE-ENTRY INTEGRITY ---');
  const { data: cbEntries } = await sb.from('finance_cashbook_entries').select('debit_amount, credit_amount');
  let totalDebit = 0;
  let totalCredit = 0;
  for (const entry of cbEntries || []) {
    totalDebit += Number(entry.debit_amount || 0);
    totalCredit += Number(entry.credit_amount || 0);
  }
  console.log(`Total Cashbook Entries: ${cbEntries?.length || 0}`);
  console.log(`Total Cashbook Debits : LKR ${totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Total Cashbook Credits: LKR ${totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
}

runAudit().catch(console.error);
