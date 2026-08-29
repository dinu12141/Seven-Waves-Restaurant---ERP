/**
 * @deprecated LEGACY — This service is kept for backward compatibility only.
 *
 * DO NOT add new functions here. Use the new ERP finance services instead:
 *   - src/modules/finance/services/finance-ledger.service.js
 *   - src/modules/finance/services/finance-voucher.service.js
 *   - src/modules/finance/services/finance-cashbook.service.js
 *   - src/modules/finance/services/finance-cheque.service.js
 *   - src/modules/finance/services/finance-bank-reconciliation.service.js
 *   - src/modules/finance/services/finance-statements.service.js
 *   - src/modules/finance/services/finance-account.service.js
 *
 * Still imported by: FinanceDashboard, ReceivablesPage, PayablesPage,
 * ExpensesPage, TaxPage, PayrollPage, PayrollRunPage, PayslipsPage,
 * SalaryStructurePage, FinanceReportsPage, FinanceAuditPage.
 *
 * Migration plan: Gradually replace imports in the above pages with
 * the new ERP service modules, then delete this file.
 */
import { supabase } from 'src/boot/supabase'
import { api } from 'src/core/api/ApiClient'

const MODULE = 'finance'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface FinanceFilters { [key: string]: any }
interface AccountEntry { code: string; name: string; debit: number; credit: number }

// ═══════════════════════════════════════════════════════════════════
// CHART OF ACCOUNTS
// ═══════════════════════════════════════════════════════════════════
export async function fetchChartOfAccounts(companyId?: string) {
  let query = supabase
    .from('chart_of_accounts')
    .select('*')
    .order('code')
  if (companyId) query = query.eq('company_id', companyId)
  const { data, error } = await query
  return { data, error }
}

export async function createAccount(account: any) {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .insert(account)
    .select()
    .single()
  return { data, error }
}

export async function updateAccount(id: any, updates: any) {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ═══════════════════════════════════════════════════════════════════
// JOURNAL ENTRIES
// ═══════════════════════════════════════════════════════════════════
export async function fetchJournalEntries(filters: FinanceFilters = {}) {
  // Query real finance_cashbook_entries & finance_vouchers first
  const { data: cashbook } = await supabase
    .from('finance_cashbook_entries')
    .select('id, description, debit_amount, credit_amount, entry_date, created_at, source_type')
    .order('created_at', { ascending: false })
    .limit(filters.limit || 10)

  if (cashbook && cashbook.length > 0) {
    const mapped = cashbook.map((c: any) => ({
      id: c.id,
      description: c.description,
      doc_date: c.entry_date || c.created_at,
      total_dr: Number(c.debit_amount || c.credit_amount || 0),
      reference_type: c.source_type || 'cashbook',
    }))
    return { data: mapped, error: null }
  }

  // Also try real finance_vouchers
  const { data: vouchers } = await supabase
    .from('finance_vouchers')
    .select('id, voucher_no, voucher_type, voucher_date, amount, pay_to, received_from, created_at')
    .order('created_at', { ascending: false })
    .limit(filters.limit || 10)

  if (vouchers && vouchers.length > 0) {
    const mapped = vouchers.map((v: any) => ({
      id: v.id,
      description: `${v.voucher_no} — ${v.voucher_type === 'pay' ? (v.pay_to || 'Pay Voucher') : (v.received_from || 'Received Voucher')}`,
      doc_date: v.voucher_date || v.created_at,
      total_dr: Number(v.amount || 0),
      reference_type: v.voucher_type === 'pay' ? 'pay_voucher' : 'received_voucher',
    }))
    return { data: mapped, error: null }
  }

  // Fallback to journal_entries
  let query = supabase
    .from('journal_entries')
    .select(`*, journal_lines(*)`)
    .order('created_at', { ascending: false })

  if (filters.branchId) query = query.eq('branch_id', filters.branchId)
  if (filters.dateFrom) query = query.gte('doc_date', filters.dateFrom)
  if (filters.dateTo) query = query.lte('doc_date', filters.dateTo)
  if (filters.search) query = query.ilike('description', `%${filters.search}%`)
  if (filters.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  return { data, error }
}

export async function createJournalEntry(entry: any, lines: any) {
  // Enforce double-entry balance before touching the DB
  const totalDr = lines.reduce((s: number, l: any) => s + (l.dr_amount || 0), 0)
  const totalCr = lines.reduce((s: number, l: any) => s + (l.cr_amount || 0), 0)
  if (Math.abs(totalDr - totalCr) > 0.01) {
    return { data: null, error: new Error(`Journal imbalanced: Dr=${totalDr.toFixed(2)}, Cr=${totalCr.toFixed(2)}`) }
  }

  // Insert journal header via ApiClient (tracks correlation ID + error classification)
  const { data: je, error: jeErr } = await api.query(
    (client: any) => client.from('journal_entries').insert(entry).select().single(),
    { module: MODULE, action: 'createJournalEntry', retries: 0 },
  )
  if (jeErr) return { data: null, error: jeErr }

  // Insert lines linking to journal
  const mappedLines = lines.map((l: any, idx: any) => ({
    journal_id: (je as any).id,
    account_code: l.account_code,
    account_name: l.account_name,
    dr_amount: l.dr_amount || 0,
    cr_amount: l.cr_amount || 0,
    memo: l.memo || '',
    line_number: idx + 1,
    branch_id: entry.branch_id,
  }))

  const { error: linesErr } = await api.query(
    (client: any) => client.from('journal_lines').insert(mappedLines),
    { module: MODULE, action: 'createJournalLines', retries: 0 },
  )
  if (linesErr) return { data: je, error: linesErr }

  return { data: je, error: null }
}

export async function reverseJournalEntry(id: string) {
  // 1. Load original entry + its lines
  const { data: original, error: fetchErr } = await supabase
    .from('journal_entries')
    .select('*, journal_lines(*)')
    .eq('id', id)
    .single()
  if (fetchErr || !original) return { data: null, error: fetchErr || new Error('Journal entry not found') }
  if (original.is_reversed) return { data: null, error: new Error('Journal entry is already reversed') }

  // 2. Create counter-entry (swap dr/cr on each line)
  const reversalLines = (original.journal_lines || []).map((l: any) => ({
    account_code: l.account_code,
    account_name: l.account_name,
    dr_amount: l.cr_amount,
    cr_amount: l.dr_amount,
    memo: `Reversal: ${l.memo || ''}`,
  }))
  const { data: reversal, error: reversalErr } = await createJournalEntry(
    {
      description: `Reversal: ${original.description}`,
      reference_type: original.reference_type,
      reference_id: id,
      doc_date: new Date().toISOString().split('T')[0],
      branch_id: original.branch_id,
      total_amount: original.total_amount,
    },
    reversalLines,
  )
  if (reversalErr) return { data: null, error: reversalErr }

  // 3. Mark original as reversed
  const { data, error } = await supabase
    .from('journal_entries')
    .update({ is_reversed: true, reversal_id: reversal?.id })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ═══════════════════════════════════════════════════════════════════
// GENERAL LEDGER & TRIAL BALANCE
// ═══════════════════════════════════════════════════════════════════
export async function fetchAccountBalances() {
  const { data, error } = await supabase
    .from('finance_accounts')
    .select('id, registered_name, account_type, account_number, current_balance')
    .eq('is_active', true)
    .order('registered_name')

  if (error || !data || data.length === 0) {
    const { data: ledgers } = await supabase
      .from('finance_ledgers')
      .select('id, ledger_code, ledger_name, ledger_type, current_balance')
      .eq('is_active', true)
      .order('ledger_code')
    const mappedLedgers = (ledgers || []).map((l: any) => ({
      code: l.ledger_code,
      name: l.ledger_name,
      account_type: (l.ledger_type || 'asset').toUpperCase(),
      balance: Number(l.current_balance || 0),
    }))
    return { data: mappedLedgers, error: null }
  }

  const mapped = (data || []).map((a: any) => ({
    code: a.account_number || a.id.substring(0, 6).toUpperCase(),
    name: a.registered_name,
    account_type: (a.account_type || 'bank').toUpperCase(),
    balance: Number(a.current_balance || 0),
  }))

  return { data: mapped, error: null }
}

export async function fetchTrialBalance() {
  const { data, error } = await supabase
    .from('v_trial_balance')
    .select('*')
    .order('code')
  return { data, error }
}

export async function fetchGeneralLedger(filters: FinanceFilters = {}) {
  let query = supabase
    .from('journal_lines')
    .select(`*, journal_entries!inner(doc_date, description, is_reversed, reference_type, branch_id)`)
    .order('created_at', { ascending: false })

  if (filters.accountCode) query = query.eq('account_code', filters.accountCode)
  if (filters.dateFrom) query = query.gte('journal_entries.doc_date', filters.dateFrom)
  if (filters.dateTo) query = query.lte('journal_entries.doc_date', filters.dateTo)
  if (filters.search) query = query.ilike('journal_entries.description', `%${filters.search}%`)
  if (filters.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  return { data, error }
}

// ═══════════════════════════════════════════════════════════════════
// CASH & BANK
// ═══════════════════════════════════════════════════════════════════
export async function fetchBankAccounts() {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('is_active', true)
    .order('name')
  return { data, error }
}

export async function fetchCogsReport(dateFrom: string, dateTo: string, branchId?: string) {
  const { data, error } = await supabase.rpc('get_cogs_report', {
    p_start_date: dateFrom ? dateFrom + 'T00:00:00Z' : null,
    p_end_date: dateTo ? dateTo + 'T23:59:59Z' : null,
    p_branch_id: branchId || null,
  })
  return { data, error }
}

export async function fetchCashFlowStatement(dateFrom: string, dateTo: string, branchId?: string) {
  const { data, error } = await supabase.rpc('get_cash_flow_statement', {
    p_start_date: dateFrom || null,
    p_end_date: dateTo || null,
    p_branch_id: branchId || null,
  })
  return { data, error }
}

export async function createBankAccount(account: any) {
  const { data, error } = await supabase
    .from('bank_accounts')
    .insert(account)
    .select()
    .single()
  return { data, error }
}

export async function fetchCashTransactions(filters: FinanceFilters = {}) {
  let query = supabase
    .from('cash_transactions')
    .select('*, bank_accounts(id, name, account_type)')
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.bankAccountId) query = query.eq('bank_account_id', filters.bankAccountId)
  if (filters.branchId) query = query.eq('branch_id', filters.branchId)
  if (filters.dateFrom) query = query.gte('txn_date', filters.dateFrom)
  if (filters.dateTo) query = query.lte('txn_date', filters.dateTo)
  if (filters.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  return { data, error }
}

export async function createCashTransaction(txn: FinanceFilters) {
  // Insert the transaction
  const { data, error } = await supabase
    .from('cash_transactions')
    .insert(txn)
    .select()
    .single()

  if (!error && data) {
    // Update bank account balance
    const multiplier = ['deposit', 'transfer_in'].includes(txn.txn_type) ? 1 : -1
    try {
      await supabase.rpc('increment_bank_balance', {
        p_account_id: txn.bank_account_id,
        p_amount: txn.amount * multiplier,
      })
    } catch {
      // RPC may not exist yet; manual update as fallback
    }
  }

  return { data, error }
}

// ═══════════════════════════════════════════════════════════════════
// ACCOUNTS RECEIVABLE
// ═══════════════════════════════════════════════════════════════════
export async function fetchReceivables(filters: FinanceFilters = {}) {
  // Combine customer_receivables (if any) and unpaid orders
  const [crRes, ordersRes] = await Promise.all([
    supabase.from('customer_receivables')
      .select('*, customers(name, email, phone, bank_name, bank_account_number)')
      .order('created_at', { ascending: false }),
    supabase.from('orders')
      .select('id, total_amount, created_at, customer_id, customers(name, email, phone)')
      .neq('payment_status', 'paid')
      .in('status', ['ready', 'served', 'invoiced', 'completed'])
      .order('created_at', { ascending: false })
  ]);

  let data = (crRes.data || []).map(r => ({ ...r, source: 'cr' }));
  
  const orders = (ordersRes.data || []).map(o => ({
    id: o.id,
    invoice_id: o.id.substring(0, 8),
    balance: o.total_amount,
    total_amount: o.total_amount,
    paid_amount: 0,
    status: 'outstanding',
    due_date: new Date(o.created_at).toISOString().split('T')[0],
    created_at: o.created_at,
    customers: o.customers,
    source: 'order'
  }));

  data = [...data, ...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return { data, error: null }
}

export async function fetchReceivableAging() {
  const { data } = await fetchReceivables();
  const now = new Date().getTime();
  
  const res = (data || []).map(r => {
    const docDate = new Date(r.created_at || r.due_date).getTime();
    const days = Math.floor((now - docDate) / (1000 * 3600 * 24));
    let bucket = 'CURRENT';
    if (days >= 1 && days <= 30) bucket = '1_30_DAYS';
    else if (days >= 31 && days <= 60) bucket = '31_60_DAYS';
    else if (days >= 61 && days <= 90) bucket = '61_90_DAYS';
    else if (days > 90) bucket = 'OVER_90_DAYS';

    return {
      id: r.id,
      customer_id: r.customer_id || r.customers?.id,
      customer_name: r.customers?.name,
      balance: r.balance,
      aging_bucket: bucket
    }
  });

  return { data: res, error: null }
}

// ═══════════════════════════════════════════════════════════════════
// ACCOUNTS PAYABLE (links to procurement AP)
// ═══════════════════════════════════════════════════════════════════
export async function fetchApInvoices(filters: FinanceFilters = {}) {
  let query = supabase
    .from('ap_invoices')
    .select('*, suppliers(name)')
    .not('status', 'in', '("cancelled","paid")')
    .order('created_at', { ascending: false })

  if (filters.limit) query = query.limit(filters.limit)
  const { data, error } = await query
  return { data, error }
}

export async function fetchPayableAging() {
  const { data } = await fetchApInvoices();
  const now = new Date().getTime();

  const res = (data || []).map(r => {
    const docDate = new Date(r.invoice_date || r.created_at).getTime();
    const days = Math.floor((now - docDate) / (1000 * 3600 * 24));
    let bucket = 'CURRENT';
    if (days >= 1 && days <= 30) bucket = '1_30_DAYS';
    else if (days >= 31 && days <= 60) bucket = '31_60_DAYS';
    else if (days >= 61 && days <= 90) bucket = '61_90_DAYS';
    else if (days > 90) bucket = 'OVER_90_DAYS';

    return {
      id: r.id,
      supplier_id: r.supplier_id,
      supplier_name: r.suppliers?.name,
      balance: r.balance_due,
      aging_bucket: bucket
    }
  });

  return { data: res, error: null }
}

// ═══════════════════════════════════════════════════════════════════
// EXPENSES
// ═══════════════════════════════════════════════════════════════════
export async function fetchExpenseCategories() {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('is_active', true)
    .order('name')
  return { data, error }
}

export async function fetchExpenses(filters: FinanceFilters = {}) {
  let vQuery = supabase
    .from('finance_vouchers')
    .select('id, voucher_no, voucher_date, amount, status, pay_to, remark, narration, created_at')
    .eq('voucher_type', 'pay')
    .order('created_at', { ascending: false })

  if (filters.status && filters.status !== 'All') vQuery = vQuery.eq('status', filters.status)
  if (filters.dateFrom) vQuery = vQuery.gte('voucher_date', filters.dateFrom)
  if (filters.dateTo) vQuery = vQuery.lte('voucher_date', filters.dateTo)
  if (filters.limit) vQuery = vQuery.limit(filters.limit)
  else vQuery = vQuery.limit(50)

  const { data: payVouchers } = await vQuery

  if (payVouchers && payVouchers.length > 0) {
    const mapped = payVouchers.map((v: any) => ({
      id: v.id,
      expense_date: v.voucher_date || v.created_at?.split('T')[0],
      expense_categories: { name: v.pay_to || 'Pay Voucher' },
      description: `${v.voucher_no} — ${v.remark || v.narration || ''}`.trim(),
      amount: Number(v.amount || 0),
      status: v.status,
    }))
    return { data: mapped, error: null }
  }

  let query = supabase
    .from('expense_entries')
    .select('*, expense_categories(name), departments(name)')
    .order('expense_date', { ascending: false })

  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.branchId) query = query.eq('branch_id', filters.branchId)
  if (filters.status && filters.status !== 'All') query = query.eq('status', filters.status)
  if (filters.dateFrom) query = query.gte('expense_date', filters.dateFrom)
  if (filters.dateTo) query = query.lte('expense_date', filters.dateTo)
  if (filters.limit) query = query.limit(filters.limit)
  else query = query.limit(50)

  const { data, error } = await query
  return { data, error }
}

export async function createExpense(expense: any) {
  const { data, error } = await supabase
    .from('expense_entries')
    .insert(expense)
    .select()
    .single()
  return { data, error }
}

export async function approveExpense(id: any, approvedBy: any) {
  const { data, error } = await supabase
    .from('expense_entries')
    .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ═══════════════════════════════════════════════════════════════════
// TAX
// ═══════════════════════════════════════════════════════════════════
export async function fetchTaxCodes() {
  const { data, error } = await supabase
    .from('tax_codes')
    .select('*')
    .order('code')
  return { data, error }
}

export async function fetchTaxTransactions(filters: FinanceFilters = {}) {
  let query = supabase
    .from('tax_transactions')
    .select('*, tax_codes(code, name, rate)')
    .order('txn_date', { ascending: false })

  if (filters.taxCodeId) query = query.eq('tax_code_id', filters.taxCodeId)
  if (filters.dateFrom) query = query.gte('txn_date', filters.dateFrom)
  if (filters.dateTo) query = query.lte('txn_date', filters.dateTo)
  if (filters.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  return { data, error }
}

export async function fetchTaxSummary() {
  const { data, error } = await supabase
    .from('tax_transactions')
    .select('direction, tax_codes(code, name), base_amount, tax_amount')
  return { data, error }
}

// ═══════════════════════════════════════════════════════════════════
// PAYROLL
// ═══════════════════════════════════════════════════════════════════
export async function fetchPayrollCycles(filters: FinanceFilters = {}) {
  let query = supabase
    .from('payroll_runs')
    .select('id, period_start, period_end, status, total_gross, total_deductions, total_net, employee_count, branch_id, created_at')
    .order('period_start', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.branchId) query = query.eq('branch_id', filters.branchId)
  if (filters.limit) query = query.limit(filters.limit)

  // map field names to match what Finance UI expects
  const { data, error } = await query
  const mapped = (data || []).map((r: any) => ({
    ...r,
    cycle_name: `Payroll ${r.period_start?.substring(0, 7) || ''}`,
    total_employees: r.employee_count,
  }))
  return { data: mapped, error }
}

export async function fetchPayrollRecords(cycleId: string) {
  const { data, error } = await supabase
    .from('payroll_records')
    .select('*, employees(first_name, last_name, employee_code, designation_id, designations(title)), payroll_line_items(*)')
    .eq('cycle_id', cycleId)
    .order('created_at')
  return { data, error }
}

export async function fetchEmployeeSalaryStructures() {
  const { data, error } = await supabase
    .from('employees')
    .select(`
      id, first_name, last_name, employee_code, employment_status,
      salary_structures(id, basic_salary, currency, effective_from),
      employee_allowances(id, amount, salary_allowance_types(name, code)),
      designations(title),
      departments(name)
    `)
    .order('first_name')
  return { data, error }
}

export async function createPayrollCycle(cycle: any) {
  const { data, error } = await supabase
    .from('payroll_cycles')
    .insert(cycle)
    .select()
    .single()
  return { data, error }
}

export async function createPayrollRecords(records: any) {
  const { data, error } = await supabase
    .from('payroll_records')
    .insert(records)
    .select()
  return { data, error }
}

export async function createPayrollLineItems(items: any) {
  const { data, error } = await supabase
    .from('payroll_line_items')
    .insert(items)
    .select()
  return { data, error }
}

export async function updatePayrollCycleStatus(id: any, status: any, extra = {}) {
  const { data, error } = await supabase
    .from('payroll_cycles')
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ═══════════════════════════════════════════════════════════════════
// PAYROLL — Phase 3 Enhancements
// ═══════════════════════════════════════════════════════════════════

/** Fetch employee salary deductions (salary_deductions table from HRMS) */
export async function fetchEmployeeDeductions(employeeId?: string) {
  let query = supabase
    .from('salary_deductions')
    .select('*')
    .order('start_date', { ascending: false })
  if (employeeId) query = query.eq('employee_id', employeeId)
  const { data, error } = await query
  return { data, error }
}

/** Fetch employee salary additions (salary_additions table from HRMS) */
export async function fetchEmployeeAdditions(employeeId?: string) {
  let query = supabase
    .from('salary_additions')
    .select('*')
    .order('start_date', { ascending: false })
  if (employeeId) query = query.eq('employee_id', employeeId)
  const { data, error } = await query
  return { data, error }
}

/** Create a salary deduction for an employee */
export async function createSalaryDeduction(deduction: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('salary_deductions')
    .insert(deduction)
    .select()
    .single()
  return { data, error }
}

/** Create a salary addition for an employee */
export async function createSalaryAddition(addition: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('salary_additions')
    .insert(addition)
    .select()
    .single()
  return { data, error }
}

/** Create an employee allowance */
export async function createEmployeeAllowance(allowance: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('employee_allowances')
    .insert(allowance)
    .select()
    .single()
  return { data, error }
}

/** Delete an employee allowance */
export async function deleteEmployeeAllowance(id: string) {
  const { error } = await supabase.from('employee_allowances').delete().eq('id', id)
  return { error }
}

/** Delete a salary deduction */
export async function deleteSalaryDeduction(id: string) {
  const { error } = await supabase.from('salary_deductions').delete().eq('id', id)
  return { error }
}

/** Fetch allowance types for dropdown */
export async function fetchAllowanceTypes() {
  const { data, error } = await supabase
    .from('salary_allowance_types')
    .select('*')
    .eq('is_active', true)
    .order('name')
  return { data, error }
}

/** Record a payroll payment for an employee */
export async function createPayrollPayment(payment: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('payroll_payments')
    .insert(payment)
    .select()
    .single()
  return { data, error }
}

/** Mark a payroll record as paid */
export async function markPayrollRecordPaid(recordId: string, paymentData: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('payroll_records')
    .update({
      payment_status: 'paid',
      payment_method: paymentData.payment_method,
      payment_reference: paymentData.bank_reference,
      payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
      paid_at: new Date().toISOString(),
    })
    .eq('id', recordId)
    .select()
    .single()
  return { data, error }
}

/** Fetch payroll payments for a cycle */
export async function fetchPayrollPayments(cycleId: string) {
  const { data, error } = await supabase
    .from('payroll_payments')
    .select('*, employees(first_name, last_name, employee_code)')
    .eq('cycle_id', cycleId)
    .order('payment_date', { ascending: false })
  return { data, error }
}

/** Post payroll cycle to finance journal
 *  Dr: Salary Expense (5100) = total_gross
 *  Cr: Salaries Payable (2200) = total_deductions
 *  Cr: Bank Account (1010) = total_net
 */
export async function postPayrollToJournal(cycleId: string, cycle: Record<string, unknown>) {
  // Create journal entry header
  const { data: je, error: jeErr } = await supabase
    .from('journal_entries')
    .insert({
      description: `Payroll — ${cycle.cycle_name}`,
      reference_type: 'payroll',
      reference_id: cycleId,
      doc_date: cycle.period_end || new Date().toISOString().split('T')[0],
      total_amount: Number(cycle.total_gross || 0),
    })
    .select()
    .single()

  if (jeErr) return { data: null, error: jeErr }

  // Compute net from gross - deductions to avoid floating-point rounding imbalance
  const grossAmount = Number(cycle.total_gross || 0)
  const deductionsAmount = Number(cycle.total_deductions || 0)
  const netAmount = Number((grossAmount - deductionsAmount).toFixed(2))

  // Insert journal lines
  const lines = [
    {
      journal_id: je.id,
      account_code: '5100',
      account_name: 'Salary Expense',
      dr_amount: grossAmount,
      cr_amount: 0,
      memo: `Payroll: ${cycle.cycle_name} — Gross salary`,
      line_number: 1,
    },
    {
      journal_id: je.id,
      account_code: '2200',
      account_name: 'Salaries Payable',
      dr_amount: 0,
      cr_amount: deductionsAmount,
      memo: `Payroll: ${cycle.cycle_name} — Statutory deductions`,
      line_number: 2,
    },
    {
      journal_id: je.id,
      account_code: '1010',
      account_name: 'Bank Account - Main',
      dr_amount: 0,
      cr_amount: netAmount,
      memo: `Payroll: ${cycle.cycle_name} — Net salary disbursement`,
      line_number: 3,
    },
  ]

  const { error: linesErr } = await supabase.from('journal_lines').insert(lines)
  if (linesErr) return { data: je, error: linesErr }

  // Update cycle to posted status with journal reference
  await supabase
    .from('payroll_cycles')
    .update({
      status: 'posted',
      journal_entry_id: je.id,
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', cycleId)

  return { data: je, error: null }
}

// ═══════════════════════════════════════════════════════════════════
// FISCAL PERIODS
// ═══════════════════════════════════════════════════════════════════
export async function fetchFiscalPeriods() {
  const { data, error } = await supabase
    .from('fiscal_periods')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
  return { data, error }
}

// ═══════════════════════════════════════════════════════════════════
// FINANCE AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════
export async function fetchFinanceAuditLogs(filters: FinanceFilters = {}) {
  let query = supabase
    .from('finance_audit_logs')
    .select('*, profiles(full_name, email)')
    .order('created_at', { ascending: false })

  if (filters.entityType) query = query.eq('entity_type', filters.entityType)
  if (filters.userId) query = query.eq('user_id', filters.userId)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)
  if (filters.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  return { data, error }
}

export async function logFinanceAction(action: FinanceFilters) {
  const { error } = await supabase
    .from('finance_audit_logs')
    .insert(action)
  return { error }
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD KPIs
// ═══════════════════════════════════════════════════════════════════
export async function fetchDashboardKPIs(branchId?: any, startDate?: string, endDate?: string) {
  const today = new Date()
  const offset = today.getTimezoneOffset() * 60000
  const localDate = new Date(today.getTime() - offset)
  const todayDateStr = localDate.toISOString().split('T')[0]

  const startStr = startDate || todayDateStr
  const endStr = endDate || todayDateStr

  let ordersQuery = supabase.from('orders').select('total_amount')
    .gte('created_at', startStr + 'T00:00:00')
    .lte('created_at', endStr + 'T23:59:59')
    .eq('payment_status', 'paid')

  let recvVouchersQuery = supabase.from('finance_vouchers').select('amount')
    .eq('voucher_type', 'received')
    .not('received_from', 'ilike', 'POS Cash Transfer%')
    .in('status', ['posted', 'approved'])
    .gte('voucher_date', startStr)
    .lte('voucher_date', endStr)

  let payVouchersQuery = supabase.from('finance_vouchers').select('amount')
    .eq('voucher_type', 'pay')
    .in('status', ['posted', 'approved'])
    .gte('voucher_date', startStr)
    .lte('voucher_date', endStr)

  let expQuery = supabase.from('expense_entries').select('amount')
    .in('status', ['approved', 'paid'])
    .gte('expense_date', startStr)
    .lte('expense_date', endStr)

  if (branchId) {
    ordersQuery = ordersQuery.eq('branch_id', branchId)
    recvVouchersQuery = recvVouchersQuery.eq('branch_id', branchId)
    payVouchersQuery = payVouchersQuery.eq('branch_id', branchId)
    expQuery = expQuery.eq('branch_id', branchId)
  }

  const [ordersRes, recvVouchersRes, payVouchersRes, expRes, accountsRes, ledgersRes, receivableRes, payableRes, payrollRes, unpaidOrdersRes] = await Promise.all([
    ordersQuery,
    recvVouchersQuery,
    payVouchersQuery,
    expQuery,

    // Real Bank & Cash Accounts balance (from finance_accounts)
    supabase.from('finance_accounts').select('current_balance').eq('is_active', true),

    // Real Ledgers balance (from finance_ledgers)
    supabase.from('finance_ledgers').select('current_balance, ledger_type').eq('is_active', true),

    // Outstanding receivables: customer_receivables + unpaid/credit orders
    supabase.from('customer_receivables').select('balance').in('status', ['outstanding', 'partial', 'overdue']),

    // Outstanding payables (AP invoices) — include ALL non-cancelled statuses
    supabase.from('ap_invoices').select('balance_due, status')
      .not('status', 'in', '("cancelled","paid")'),

    // Latest payroll
    supabase.from('payroll_cycles').select('total_net, status').order('period_end', { ascending: false }).limit(1),

    // Unpaid/credit orders (also count as receivables)
    supabase.from('orders').select('total_amount')
      .neq('payment_status', 'paid')
      .in('status', ['ready', 'served', 'invoiced', 'completed']),
  ])

  // Calculate Today Revenue = POS Paid Orders + Received Vouchers
  const posRevenue = (ordersRes.data || []).reduce((s: any, o: any) => s + Number(o.total_amount || 0), 0)
  const voucherRevenue = (recvVouchersRes.data || []).reduce((s: any, v: any) => s + Number(v.amount || 0), 0)
  const todayRevenue = posRevenue + voucherRevenue

  // Calculate Today Expenses = Pay Vouchers + Expense Entries
  const voucherExpenses = (payVouchersRes.data || []).reduce((s: any, v: any) => s + Number(v.amount || 0), 0)
  const otherExpenses = (expRes.data || []).reduce((s: any, e: any) => s + Number(e.amount || 0), 0)
  const todayExpenses = voucherExpenses + otherExpenses

  // Calculate Bank & Cash Balance = Sum of active finance_accounts current_balance
  let bankBalance = (accountsRes.data || []).reduce((s: any, a: any) => s + Number(a.current_balance || 0), 0)
  if (!accountsRes.data?.length && ledgersRes.data?.length) {
    bankBalance = ledgersRes.data
      .filter((l: any) => l.ledger_type === 'asset')
      .reduce((s: any, l: any) => s + Number(l.current_balance || 0), 0)
  }

  // AR = customer_receivables + unpaid credit orders
  const arFromReceivables = (receivableRes.data || []).reduce((s: any, r: any) => s + Number(r.balance || 0), 0)
  const arFromOrders = (unpaidOrdersRes.data || []).reduce((s: any, o: any) => s + Number(o.total_amount || 0), 0)
  const outstandingAR = arFromReceivables + arFromOrders

  // AP = sum of balance_due from all non-cancelled/non-paid AP invoices
  const outstandingAP = (payableRes.data || []).reduce((s: any, p: any) => s + Number(p.balance_due || 0), 0)

  const payrollDue = payrollRes.data?.[0]?.status !== 'posted' ? Number(payrollRes.data?.[0]?.total_net || 0) : 0

  return {
    todayRevenue,
    todayExpenses,
    bankBalance,
    outstandingAR,
    outstandingAP,
    payrollDue,
    netProfit: todayRevenue - todayExpenses,
  }
}

// ═══════════════════════════════════════════════════════════════════
// FINANCIAL REPORTS
// ═══════════════════════════════════════════════════════════════════
export async function fetchProfitAndLoss(dateFrom: any, dateTo: any) {
  // Revenue accounts (4xxx) - Expense accounts (5xxx)
  const { data, error } = await supabase
    .from('journal_lines')
    .select('account_code, account_name, dr_amount, cr_amount, journal_entries!inner(doc_date, is_reversed)')
    .gte('journal_entries.doc_date', dateFrom)
    .lte('journal_entries.doc_date', dateTo)
    .eq('journal_entries.is_reversed', false)

  if (error) return { data: null, error }

  // Group by account
  const accounts: Record<string, AccountEntry> = {}
  for (const line of (data || [])) {
    const code = line.account_code as string
    if (!accounts[code]) accounts[code] = { code, name: line.account_name as string, debit: 0, credit: 0 }
    accounts[code].debit += Number(line.dr_amount || 0)
    accounts[code].credit += Number(line.cr_amount || 0)
  }

  const revenue = Object.values(accounts).filter((a: AccountEntry) => a.code?.startsWith('4'))
  const expenses = Object.values(accounts).filter((a: AccountEntry) => a.code?.startsWith('5'))

  const totalRevenue = revenue.reduce((s: number, a: AccountEntry) => s + (a.credit - a.debit), 0)
  const totalExpenses = expenses.reduce((s: number, a: AccountEntry) => s + (a.debit - a.credit), 0)

  return {
    data: { revenue, expenses, totalRevenue, totalExpenses, netProfit: totalRevenue - totalExpenses },
    error: null,
  }
}

export async function fetchBalanceSheet() {
  const { data, error } = await supabase.from('v_account_balances').select('*').order('code')
  if (error) return { data: null, error }

  const assets = (data || []).filter((a: any) => a.account_type === 'Asset')
  const liabilities = (data || []).filter((a: any) => a.account_type === 'Liability')
  const equityAccounts = (data || []).filter((a: any) => a.account_type === 'Equity')

  // Calculate Retained Earnings = Revenue - Expenses
  // Revenue (4xxx) has credit balance, Expenses (5xxx) has debit balance
  const totalRevenue = (data || [])
    .filter((a: any) => a.account_type === 'Revenue')
    .reduce((s: number, a: any) => s + Number(a.balance || 0), 0)
  const totalExpenses = (data || [])
    .filter((a: any) => a.account_type === 'Expense')
    .reduce((s: number, a: any) => s + Number(a.balance || 0), 0)
  const retainedEarnings = totalRevenue - totalExpenses

  // Add Retained Earnings as a virtual equity line item
  const equity = [
    ...equityAccounts,
    { code: '3900', name: 'Retained Earnings (Current Period)', account_type: 'Equity', balance: retainedEarnings },
  ]

  const totalAssets = assets.reduce((s: number, a: any) => s + Number(a.balance || 0), 0)
  const totalLiabilities = liabilities.reduce((s: number, a: any) => s + Number(a.balance || 0), 0)
  const totalEquity = equity.reduce((s: number, a: any) => s + Number(a.balance || 0), 0)

  return {
    data: {
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
    },
    error: null,
  }
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 4 — COMPREHENSIVE REPORTS
// ═══════════════════════════════════════════════════════════════════

/** Expense Summary — grouped by category with date range */
export async function fetchExpenseSummary(dateFrom: string, dateTo: string) {
  let query = supabase
    .from('expense_entries')
    .select('amount, expense_date, status, expense_categories(name)')
    .in('status', ['approved', 'paid'])
  if (dateFrom) query = query.gte('expense_date', dateFrom)
  if (dateTo) query = query.lte('expense_date', dateTo)
  const { data, error } = await query
  if (error) return { data: null, error }

  const byCat: Record<string, { category: string; total: number; count: number }> = {}
  let grandTotal = 0
  for (const e of (data || [])) {
    const cat = (e as FinanceFilters).expense_categories?.name || 'Uncategorized'
    if (!byCat[cat]) byCat[cat] = { category: cat, total: 0, count: 0 }
    byCat[cat].total += Number(e.amount || 0)
    byCat[cat].count += 1
    grandTotal += Number(e.amount || 0)
  }
  return { data: { categories: Object.values(byCat).sort((a, b) => b.total - a.total), grandTotal }, error: null }
}

/** Revenue Summary — daily revenue from payments */
export async function fetchRevenueSummary(dateFrom: string, dateTo: string) {
  let query = supabase
    .from('payments')
    .select('amount, payment_method, created_at')
  if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00')
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59')
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return { data: null, error }

  const byDay: Record<string, { date: string; total: number; count: number }> = {}
  const byMethod: Record<string, number> = {}
  let grandTotal = 0
  for (const p of (data || [])) {
    const day = (p.created_at || '').substring(0, 10)
    if (!byDay[day]) byDay[day] = { date: day, total: 0, count: 0 }
    byDay[day].total += Number(p.amount || 0)
    byDay[day].count += 1
    const method = (p as FinanceFilters).payment_method || 'cash'
    byMethod[method] = (byMethod[method] || 0) + Number(p.amount || 0)
    grandTotal += Number(p.amount || 0)
  }
  return { data: { daily: Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date)), byMethod, grandTotal, totalTransactions: (data || []).length }, error: null }
}

/** Daily Cash Summary — cash in/out by day */
export async function fetchDailyCashSummary(dateFrom: string, dateTo: string) {
  let query = supabase
    .from('cash_transactions')
    .select('amount, txn_type, txn_date, bank_accounts(name)')
  if (dateFrom) query = query.gte('txn_date', dateFrom)
  if (dateTo) query = query.lte('txn_date', dateTo)
  const { data, error } = await query.order('txn_date', { ascending: false })
  if (error) return { data: null, error }

  const byDay: Record<string, { date: string; cashIn: number; cashOut: number; net: number }> = {}
  let totalIn = 0, totalOut = 0
  for (const t of (data || [])) {
    const day = t.txn_date || 'N/A'
    if (!byDay[day]) byDay[day] = { date: day, cashIn: 0, cashOut: 0, net: 0 }
    const isIn = ['deposit', 'transfer_in'].includes(t.txn_type)
    if (isIn) { byDay[day].cashIn += Number(t.amount || 0); totalIn += Number(t.amount || 0) }
    else { byDay[day].cashOut += Number(t.amount || 0); totalOut += Number(t.amount || 0) }
    byDay[day].net = byDay[day].cashIn - byDay[day].cashOut
  }
  return { data: { daily: Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date)), totalIn, totalOut, netCash: totalIn - totalOut, transactions: data || [] }, error: null }
}

/** Payroll Summary Report — all cycles with employee breakdowns */
export async function fetchPayrollSummaryReport(dateFrom: string, dateTo: string) {
  let query = supabase
    .from('payroll_cycles')
    .select('*, payroll_records(*, employees(first_name, last_name, employee_code))')
    .order('period_start', { ascending: false })
  if (dateFrom) query = query.gte('period_start', dateFrom)
  if (dateTo) query = query.lte('period_end', dateTo)
  const { data, error } = await query
  if (error) return { data: null, error }

  let totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployees = 0
  for (const c of (data || [])) {
    totalGross += Number(c.total_gross || 0)
    totalDeductions += Number(c.total_deductions || 0)
    totalNet += Number(c.total_net || 0)
    totalEmployees += Number(c.total_employees || 0)
  }
  return { data: { cycles: data || [], totalGross, totalDeductions, totalNet, totalEmployees, cycleCount: (data || []).length }, error: null }
}

/** Tax Summary Report — tax collected vs liability */
export async function fetchTaxSummaryReport(dateFrom: string, dateTo: string) {
  let query = supabase
    .from('tax_transactions')
    .select('direction, base_amount, tax_amount, txn_date, tax_codes(code, name, rate)')
  if (dateFrom) query = query.gte('txn_date', dateFrom)
  if (dateTo) query = query.lte('txn_date', dateTo)
  const { data, error } = await query.order('txn_date', { ascending: false })
  if (error) return { data: null, error }

  let totalCollected = 0, totalLiability = 0
  const byCode: Record<string, { code: string; name: string; rate: number; collected: number; liability: number; net: number }> = {}
  for (const t of (data || [])) {
    const tc = (t as FinanceFilters).tax_codes || {}
    const key = tc.code || 'UNKNOWN'
    if (!byCode[key]) byCode[key] = { code: key, name: tc.name || 'Unknown', rate: Number(tc.rate || 0), collected: 0, liability: 0, net: 0 }
    if (t.direction === 'collected') { byCode[key].collected += Number(t.tax_amount || 0); totalCollected += Number(t.tax_amount || 0) }
    else { byCode[key].liability += Number(t.tax_amount || 0); totalLiability += Number(t.tax_amount || 0) }
    byCode[key].net = byCode[key].collected - byCode[key].liability
  }
  return { data: { byTaxCode: Object.values(byCode), totalCollected, totalLiability, netTax: totalCollected - totalLiability, transactions: data || [] }, error: null }
}

/** HR & Workforce Report — employee headcount, salary, dept breakdown */
export async function fetchHRWorkforceReport() {
  const { data: employees, error } = await supabase
    .from('employees')
    .select(`
      id, first_name, last_name, employee_code, employment_status, hire_date,
      salary_structures(basic_salary, currency, effective_from, is_current),
      employee_allowances(amount, salary_allowance_types(name)),
      departments(name),
      designations(title)
    `)
    .order('first_name')
  if (error) return { data: null, error }

  const byDept: Record<string, { dept: string; count: number; totalSalary: number }> = {}
  const byStatus: Record<string, number> = {}
  let totalBasic = 0, totalAllowances = 0, headcount = 0

  const empRows = []
  for (const emp of (employees || [])) {
    const ss = Array.isArray(emp.salary_structures)
      ? emp.salary_structures.find((s: FinanceFilters) => s.is_current) || emp.salary_structures[0]
      : emp.salary_structures
    const basic = Number(ss?.basic_salary || 0)
    const allowances = (emp.employee_allowances || []).reduce((s: number, a: FinanceFilters) => s + Number(a.amount || 0), 0)
    const dept = (emp as FinanceFilters).departments?.name || 'Unassigned'
    const status = emp.employment_status || 'active'

    if (!byDept[dept]) byDept[dept] = { dept, count: 0, totalSalary: 0 }
    byDept[dept].count += 1
    byDept[dept].totalSalary += basic + allowances
    byStatus[status] = (byStatus[status] || 0) + 1
    totalBasic += basic
    totalAllowances += allowances
    headcount += 1

    empRows.push({
      id: emp.id, name: `${emp.first_name} ${emp.last_name}`, code: emp.employee_code,
      department: dept, designation: (emp as FinanceFilters).designations?.title || '-',
      status, basic, allowances, totalPay: basic + allowances,
    })
  }

  return {
    data: {
      employees: empRows, headcount, totalBasic, totalAllowances,
      totalPayroll: totalBasic + totalAllowances,
      byDepartment: Object.values(byDept).sort((a, b) => b.totalSalary - a.totalSalary),
      byStatus,
    },
    error: null,
  }
}

/** Monthly P&L Summary — monthly revenue, expenses, wages, profit */
export async function fetchMonthlyPnlSummary(year: number) {
  const yearStart = `${year}-01-01`, yearEnd = `${year}-12-31`

  const [journalRes, payrollRes, expenseRes, revenueRes] = await Promise.all([
    supabase.from('journal_lines')
      .select('account_code, dr_amount, cr_amount, journal_entries!inner(doc_date, is_reversed)')
      .gte('journal_entries.doc_date', yearStart).lte('journal_entries.doc_date', yearEnd)
      .eq('journal_entries.is_reversed', false),
    supabase.from('payroll_cycles')
      .select('period_start, total_gross, total_deductions, total_net')
      .gte('period_start', yearStart).lte('period_start', yearEnd),
    supabase.from('expense_entries')
      .select('amount, expense_date').in('status', ['approved', 'paid'])
      .gte('expense_date', yearStart).lte('expense_date', yearEnd),
    supabase.from('payments')
      .select('amount, created_at')
      .gte('created_at', yearStart + 'T00:00:00').lte('created_at', yearEnd + 'T23:59:59'),
  ])

  const months: Record<string, { month: string; revenue: number; expenses: number; wages: number; profit: number }> = {}
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    months[key] = { month: key, revenue: 0, expenses: 0, wages: 0, profit: 0 }
  }

  for (const line of (journalRes.data || [])) {
    const m = ((line as FinanceFilters).journal_entries?.doc_date || '').substring(0, 7)
    if (!months[m]) continue
    const code = line.account_code || ''
    if (code.startsWith('4')) months[m].revenue += Number(line.cr_amount || 0) - Number(line.dr_amount || 0)
    else if (code.startsWith('5')) months[m].expenses += Number(line.dr_amount || 0) - Number(line.cr_amount || 0)
  }

  for (const p of (payrollRes.data || [])) {
    const m = (p.period_start || '').substring(0, 7)
    if (months[m]) months[m].wages += Number(p.total_net || 0)
  }

  for (const e of (expenseRes.data || [])) {
    const m = (e.expense_date || '').substring(0, 7)
    if (months[m]) months[m].expenses += Number(e.amount || 0)
  }

  for (const r of (revenueRes.data || [])) {
    const m = (r.created_at || '').substring(0, 7)
    if (months[m]) months[m].revenue += Number(r.amount || 0)
  }

  let yearRevenue = 0, yearExpenses = 0, yearWages = 0
  Object.values(months).forEach(m => {
    m.profit = m.revenue - m.expenses - m.wages
    yearRevenue += m.revenue; yearExpenses += m.expenses; yearWages += m.wages
  })

  return {
    data: {
      monthly: Object.values(months),
      yearRevenue, yearExpenses, yearWages,
      yearProfit: yearRevenue - yearExpenses - yearWages,
    },
    error: null,
  }
}
