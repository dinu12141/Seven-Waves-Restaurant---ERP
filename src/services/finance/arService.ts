// ═══════════════════════════════════════════════════════════════════════════════
// Accounts Receivable service (#144)
//
// Sub-ledger  = customer_receivables (+ ar_receipts / ar_receipt_allocations)
// Control a/c = finance_ledgers code 1003 Accounts Receivable
// Writes go ONLY through the SECURITY DEFINER RPCs in
// supabase/finance_accounts_receivable_144.sql:
//   fn_ar_create_invoice, fn_ar_receive_payment, fn_ar_cancel_receipt,
//   fn_ar_write_off, fn_ar_reverse_write_off (admin / finance only)
// paid_amount = receipts + write-offs; written_off_amount = write-off part;
// open balance is always total − paid.
// Pure maths (aging, allocation, statement, control) lives in ./arAllocation.
// ═══════════════════════════════════════════════════════════════════════════════
import { supabase } from 'src/boot/supabase'
import {
  AR_OPEN_STATUSES,
  agingBucketFor,
  buildCustomerStatement,
  checkAllocationList,
  checkWriteOff,
  compareOldestDueFirst,
  computeArControl,
  customerDisplayName,
  daysPastDue,
  localIsoDate,
  receivableBalance,
  type ArAllocation,
  type ArControl,
  type CustomerStatement,
} from './arAllocation'

export const AR_SQL_FILE = 'supabase/finance_accounts_receivable_144.sql'

const CUSTOMER_COLUMNS = 'id, first_name, last_name, phone, email, customer_code, credit_limit'

const RECEIVABLE_BASE_COLUMNS =
  'id, company_id, branch_id, customer_id, order_id, invoice_id, doc_number, doc_date, due_date, ' +
  'total_amount, paid_amount, balance, status, source, description, income_ledger_id, gl_posted_at, created_at, ' +
  `customers(${CUSTOMER_COLUMNS})`
export const RECEIVABLE_COLUMNS = `written_off_amount, ${RECEIVABLE_BASE_COLUMNS}`

const WRITE_OFF_COLUMNS =
  'id, branch_id, write_off_no, write_off_date, receivable_id, customer_id, amount, reason, status, ' +
  'reversed_at, reverse_reason, created_at, ' +
  `customer_receivables(id, doc_number, doc_date, due_date, total_amount, customers(${CUSTOMER_COLUMNS}))`

const RECEIPT_COLUMNS =
  'id, branch_id, receipt_no, receipt_date, customer_id, account_id, payment_method, amount, reference_no, remarks, ' +
  'status, cancel_reason, cancelled_at, created_at, ' +
  `customers(${CUSTOMER_COLUMNS}), finance_accounts(id, registered_name, account_type), ` +
  'ar_receipt_allocations(id, receivable_id, amount, customer_receivables(doc_number))'

type PgError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined

/** True when the #144 objects (function / table / column) are not on the database yet. */
export function isArSchemaMissing(err: PgError): boolean {
  if (!err) return false
  if (['PGRST202', 'PGRST200', 'PGRST204', '42883', '42P01', '42703'].includes(String(err.code || ''))) return true
  return /Could not find the (function|table|relationship)|schema cache|does not exist/i.test(err.message || '')
}

function toError(err: PgError, what: string): Error {
  if (isArSchemaMissing(err)) {
    return new Error(
      `Accounts Receivable is not set up on the database (${what}). Apply ${AR_SQL_FILE} and reload.`,
    )
  }
  return new Error(err?.message || `${what} failed`)
}

/** Section 8 of the #144 SQL (written_off_amount) not applied yet. */
function isMissingWriteOffColumn(err: PgError): boolean {
  return !!err && isArSchemaMissing(err) && /written_off_amount/i.test(`${err.message || ''} ${err.details || ''}`)
}

/**
 * Run a select that includes written_off_amount; when the column is not on
 * the database yet, re-run it with the legacy column list so the page keeps
 * working until section 8 of the SQL is applied.
 */
async function selectWithWriteOffFallback(
  build: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>,
  cols: string,
  legacyCols: string,
): Promise<{ data: unknown; error: unknown }> {
  const res = await build(cols)
  if (res.error && isMissingWriteOffColumn(res.error as PgError)) return build(legacyCols)
  return res
}

type RpcResult = { success?: boolean; error?: string; [k: string]: unknown }

async function callArRpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw toError(error as PgError, name)
  const res = (data || {}) as RpcResult
  if (res.success === false) throw new Error(res.error || `${name} failed`)
  if (res.success !== true) throw new Error(`${name} returned an unexpected response`)
  return res
}

// ── Reads ──────────────────────────────────────────────────────────────────────
export interface ReceivableFilters {
  customerId?: string | null
  /** 'open' (default) = outstanding/partial/overdue, 'all', or one status */
  status?: string | null
  branchId?: string | null
  search?: string | null
}

export interface ReceivableRow {
  id: string
  customer_id: string | null
  customer_name: string
  customers?: Record<string, any> | null
  doc_number: string | null
  doc_date: string | null
  due_date: string | null
  total_amount: number
  paid_amount: number
  written_off_amount: number
  balance: number
  status: string
  source: string
  days_past_due: number
  aging_bucket: string
  [k: string]: any
}

export function normalizeReceivable(r: any, today = localIsoDate()): ReceivableRow {
  return {
    ...r,
    customer_name: customerDisplayName(r.customers),
    total_amount: Number(r.total_amount || 0),
    paid_amount: Number(r.paid_amount || 0),
    written_off_amount: Number(r.written_off_amount || 0),
    balance: receivableBalance(r),
    status: r.status || 'outstanding',
    source: r.source || 'manual',
    days_past_due: daysPastDue(r.due_date, today),
    aging_bucket: agingBucketFor(r.due_date, today),
  }
}

function matchesSearch(r: ReceivableRow, search: string): boolean {
  const s = search.trim().toLowerCase()
  if (!s) return true
  return [r.customer_name, r.doc_number, r.description, r.customers?.phone, r.customers?.customer_code]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(s))
}

export async function listReceivables(filters: ReceivableFilters = {}): Promise<ReceivableRow[]> {
  const build = (cols: string) => {
    let q = supabase.from('customer_receivables').select(cols)
    const status = filters.status || 'open'
    if (status === 'open') q = q.in('status', [...AR_OPEN_STATUSES])
    else if (status !== 'all') q = q.eq('status', status)
    if (filters.customerId) q = q.eq('customer_id', filters.customerId)
    if (filters.branchId) q = q.eq('branch_id', filters.branchId)
    return q.order('due_date', { ascending: true }).order('doc_date', { ascending: true })
  }

  const { data, error } = await selectWithWriteOffFallback(build, RECEIVABLE_COLUMNS, RECEIVABLE_BASE_COLUMNS)
  if (error) throw toError(error as PgError, 'customer_receivables')
  const today = localIsoDate()
  let rows = ((data || []) as any[]).map((r) => normalizeReceivable(r, today))
  if (filters.search) rows = rows.filter((r) => matchesSearch(r, filters.search as string))
  return rows.sort(compareOldestDueFirst)
}

/** Open receivables of one customer with a balance, oldest due first. */
export async function listOpenReceivablesForCustomer(customerId: string): Promise<ReceivableRow[]> {
  if (!customerId) return []
  const rows = await listReceivables({ customerId, status: 'open' })
  return rows.filter((r) => r.balance > 0)
}

export interface ReceiptFilters {
  customerId?: string | null
  status?: string | null
  branchId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  search?: string | null
}

export async function listReceipts(filters: ReceiptFilters = {}): Promise<any[]> {
  let q = supabase.from('ar_receipts').select(RECEIPT_COLUMNS)
  if (filters.customerId) q = q.eq('customer_id', filters.customerId)
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters.branchId) q = q.eq('branch_id', filters.branchId)
  if (filters.dateFrom) q = q.gte('receipt_date', filters.dateFrom)
  if (filters.dateTo) q = q.lte('receipt_date', filters.dateTo)
  q = q.order('receipt_date', { ascending: false }).order('created_at', { ascending: false })

  const { data, error } = await q
  if (error) throw toError(error as PgError, 'ar_receipts')
  let rows = ((data || []) as any[]).map((r) => ({
    ...r,
    amount: Number(r.amount || 0),
    customer_name: customerDisplayName(r.customers),
    account_name: r.finance_accounts?.registered_name || '-',
    invoice_numbers: (r.ar_receipt_allocations || [])
      .map((a: any) => a.customer_receivables?.doc_number)
      .filter(Boolean)
      .join(', '),
  }))
  const s = (filters.search || '').trim().toLowerCase()
  if (s) {
    rows = rows.filter((r) =>
      [r.receipt_no, r.customer_name, r.reference_no, r.invoice_numbers, r.remarks]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    )
  }
  return rows
}

export interface WriteOffFilters {
  customerId?: string | null
  /** 'posted' | 'reversed' | 'all' (default) */
  status?: string | null
  branchId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  search?: string | null
}

export interface WriteOffRow {
  id: string
  write_off_no: string
  write_off_date: string | null
  receivable_id: string
  customer_id: string | null
  customer_name: string
  doc_number: string | null
  amount: number
  reason: string
  status: string
  reverse_reason?: string | null
  reversed_at?: string | null
  [k: string]: any
}

/** Bad-debt write-offs (ar_write_offs), newest first. */
export async function listWriteOffs(filters: WriteOffFilters = {}): Promise<WriteOffRow[]> {
  let q = supabase.from('ar_write_offs').select(WRITE_OFF_COLUMNS)
  if (filters.customerId) q = q.eq('customer_id', filters.customerId)
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters.branchId) q = q.eq('branch_id', filters.branchId)
  if (filters.dateFrom) q = q.gte('write_off_date', filters.dateFrom)
  if (filters.dateTo) q = q.lte('write_off_date', filters.dateTo)
  q = q.order('write_off_date', { ascending: false }).order('created_at', { ascending: false })

  const { data, error } = await q
  if (error) throw toError(error as PgError, 'ar_write_offs')
  let rows: WriteOffRow[] = ((data || []) as any[]).map((w) => ({
    ...w,
    amount: Number(w.amount || 0),
    status: w.status || 'posted',
    reason: w.reason || '',
    doc_number: w.customer_receivables?.doc_number || null,
    customer_name: customerDisplayName(w.customer_receivables?.customers),
  }))
  const s = (filters.search || '').trim().toLowerCase()
  if (s) {
    rows = rows.filter((w) =>
      [w.write_off_no, w.customer_name, w.doc_number, w.reason]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    )
  }
  return rows
}

/**
 * Invoices (Dr), posted receipts (Cr) and posted bad-debt write-offs (Cr) of
 * one customer up to `dateTo`, chronological with running balance and opening
 * balance b/f at `dateFrom`. A database without ar_write_offs yet (section 8
 * of the SQL not applied) simply has no write-off lines.
 */
export async function getCustomerStatement(
  customerId: string,
  dateFrom?: string | null,
  dateTo?: string | null,
): Promise<CustomerStatement> {
  if (!customerId) throw new Error('Select a customer.')
  let inv = supabase
    .from('customer_receivables')
    .select('id, doc_number, doc_date, due_date, total_amount, description, status, created_at')
    .eq('customer_id', customerId)
  let rec = supabase
    .from('ar_receipts')
    .select('id, receipt_no, receipt_date, amount, payment_method, reference_no, status, created_at')
    .eq('customer_id', customerId)
    .eq('status', 'posted')
  let wo = supabase
    .from('ar_write_offs')
    .select('id, write_off_no, write_off_date, amount, reason, status, created_at')
    .eq('customer_id', customerId)
    .eq('status', 'posted')
  if (dateTo) {
    inv = inv.lte('doc_date', dateTo)
    rec = rec.lte('receipt_date', dateTo)
    wo = wo.lte('write_off_date', dateTo)
  }
  const [invRes, recRes, woRes] = await Promise.all([
    inv.order('doc_date', { ascending: true }),
    rec.order('receipt_date', { ascending: true }),
    wo.order('write_off_date', { ascending: true }),
  ])
  if (invRes.error) throw toError(invRes.error as PgError, 'customer_receivables')
  if (recRes.error) throw toError(recRes.error as PgError, 'ar_receipts')
  if (woRes.error && !isArSchemaMissing(woRes.error as PgError)) throw toError(woRes.error as PgError, 'ar_write_offs')
  const writeOffs = woRes.error ? [] : ((woRes.data || []) as any[])
  return buildCustomerStatement((invRes.data || []) as any[], (recRes.data || []) as any[], dateFrom, dateTo, writeOffs)
}

/**
 * Sub-ledger vs control account 1003. Write-offs credit 1003 and raise
 * paid_amount by the same amount, so both sides drop together.
 */
export async function getArControl(): Promise<ArControl> {
  const posCols = 'id, total_amount, status, source, gl_posted_at'
  const posQuery = (cols: string) =>
    supabase.from('customer_receivables').select(cols).eq('source', 'pos_credit').is('gl_posted_at', null)
  const [ledRes, openRes, firstPosRes] = await Promise.all([
    supabase.from('finance_ledgers').select('id, current_balance').eq('ledger_code', '1003').is('deleted_at', null),
    supabase
      .from('customer_receivables')
      .select('id, total_amount, paid_amount, balance, status')
      .in('status', [...AR_OPEN_STATUSES]),
    posQuery(`${posCols}, written_off_amount`),
  ])
  if (ledRes.error) throw toError(ledRes.error as PgError, 'finance_ledgers')
  if (openRes.error) throw toError(openRes.error as PgError, 'customer_receivables')
  const posRes = isMissingWriteOffColumn(firstPosRes.error as PgError) ? await posQuery(posCols) : firstPosRes
  if (posRes.error) throw toError(posRes.error as PgError, 'customer_receivables')
  const ledger = ((ledRes.data || []) as any[]).reduce((s, l) => s + Math.round(Number(l.current_balance || 0) * 100), 0) / 100
  return computeArControl(ledger, (openRes.data || []) as any[], (posRes.data || []) as any[])
}

// ── Writes (RPC only) ──────────────────────────────────────────────────────────
export interface ReceivePaymentInput {
  customerId: string
  branchId: string
  receiptDate?: string | null
  accountId: string
  amount: number
  paymentMethod?: string | null
  referenceNo?: string | null
  remarks?: string | null
  allocations: ArAllocation[]
}

export async function receivePayment(input: ReceivePaymentInput): Promise<{ receipt_id: string; receipt_no: string }> {
  if (!input.customerId) throw new Error('Select a customer.')
  if (!input.branchId) throw new Error('No active branch — select a branch first.')
  if (!input.accountId) throw new Error('Select the cash/bank account that received the money.')
  const errors = checkAllocationList(input.allocations, input.amount)
  if (errors.length) throw new Error(errors[0])

  const res = await callArRpc('fn_ar_receive_payment', {
    p_customer_id: input.customerId,
    p_branch_id: input.branchId,
    p_receipt_date: input.receiptDate || localIsoDate(),
    p_account_id: input.accountId,
    p_amount: Math.round(Number(input.amount) * 100) / 100,
    p_payment_method: (input.paymentMethod || 'cash').toLowerCase().replace(/\s+/g, '_'),
    p_reference_no: input.referenceNo || null,
    p_remarks: input.remarks || null,
    p_allocations: input.allocations.map((a) => ({
      receivable_id: a.receivable_id,
      amount: Math.round(Number(a.amount) * 100) / 100,
    })),
  })
  return { receipt_id: String(res.receipt_id), receipt_no: String(res.receipt_no) }
}

export interface CreateInvoiceInput {
  customerId: string
  branchId: string
  docDate?: string | null
  dueDate?: string | null
  amount: number
  incomeLedgerId: string
  description?: string | null
}

export async function createInvoice(input: CreateInvoiceInput): Promise<{ receivable_id: string; doc_number: string }> {
  if (!input.customerId) throw new Error('Select a registered customer.')
  if (!input.branchId) throw new Error('No active branch — select a branch first.')
  if (!input.incomeLedgerId) throw new Error('Select an income ledger.')
  if (!(Number(input.amount) > 0)) throw new Error('Amount must be greater than zero.')
  if (input.docDate && input.dueDate && input.dueDate < input.docDate) {
    throw new Error('Due date cannot be before the invoice date.')
  }
  const res = await callArRpc('fn_ar_create_invoice', {
    p_customer_id: input.customerId,
    p_branch_id: input.branchId,
    p_doc_date: input.docDate || localIsoDate(),
    p_due_date: input.dueDate || null,
    p_amount: Math.round(Number(input.amount) * 100) / 100,
    p_income_ledger_id: input.incomeLedgerId,
    p_description: input.description || null,
  })
  return { receivable_id: String(res.receivable_id), doc_number: String(res.doc_number) }
}

export async function cancelReceipt(receiptId: string, reason: string): Promise<{ receipt_no: string }> {
  if (!receiptId) throw new Error('Receipt not found.')
  if (!String(reason || '').trim()) throw new Error('A reason is required.')
  const res = await callArRpc('fn_ar_cancel_receipt', { p_receipt_id: receiptId, p_reason: String(reason).trim() })
  return { receipt_no: String(res.receipt_no ?? '') }
}

export interface WriteOffInput {
  receivableId: string
  amount: number
  reason: string
  date?: string | null
  /** open balance shown to the user — checked locally when given */
  openBalance?: number | null
}

/**
 * Bad-debt write-off (admin / finance only, enforced server-side):
 * Dr 10002 Bad Debts / Cr 1003 Accounts Receivable.
 */
export async function writeOff(input: WriteOffInput): Promise<{ write_off_id: string; write_off_no: string }> {
  if (!input.receivableId) throw new Error('Invoice not found.')
  // Without a known balance the cap is left to the server (amount checked against itself).
  const errors = checkWriteOff({ amount: input.amount, balance: input.openBalance ?? input.amount, reason: input.reason })
  if (errors.length) throw new Error(errors[0])
  const res = await callArRpc('fn_ar_write_off', {
    p_receivable_id: input.receivableId,
    p_amount: Math.round(Number(input.amount) * 100) / 100,
    p_reason: String(input.reason).trim(),
    p_date: input.date || localIsoDate(),
  })
  return { write_off_id: String(res.write_off_id), write_off_no: String(res.write_off_no) }
}

export async function reverseWriteOff(writeOffId: string, reason: string): Promise<{ write_off_no: string }> {
  if (!writeOffId) throw new Error('Write-off not found.')
  if (!String(reason || '').trim()) throw new Error('A reason is required.')
  const res = await callArRpc('fn_ar_reverse_write_off', {
    p_write_off_id: writeOffId,
    p_reason: String(reason).trim(),
  })
  return { write_off_no: String(res.write_off_no ?? '') }
}

// ── Pickers ────────────────────────────────────────────────────────────────────
export async function searchCustomers(term: string, limit = 20): Promise<any[]> {
  let q = supabase
    .from('customers')
    .select(CUSTOMER_COLUMNS)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('first_name', { ascending: true })
    .limit(limit)
  const t = (term || '').trim().replace(/[%,()]/g, ' ')
  if (t) {
    q = q.or(
      `first_name.ilike.%${t}%,last_name.ilike.%${t}%,phone.ilike.%${t}%,customer_code.ilike.%${t}%,email.ilike.%${t}%`,
    )
  }
  const { data, error } = await q
  if (error) throw toError(error as PgError, 'customers')
  return ((data || []) as any[]).map((c) => ({ ...c, display_name: customerDisplayName(c) }))
}

export async function listReceivingAccounts(): Promise<any[]> {
  const { data, error } = await supabase
    .from('finance_accounts')
    .select('id, registered_name, account_type, bank_name, account_number, current_balance, ledger_id')
    .in('account_type', ['cash', 'bank'])
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('registered_name', { ascending: true })
  if (error) throw toError(error as PgError, 'finance_accounts')
  return (data || []) as any[]
}

export async function listIncomeLedgers(): Promise<any[]> {
  const { data, error } = await supabase
    .from('finance_ledgers')
    .select('id, ledger_code, ledger_name, ledger_type')
    .eq('ledger_type', 'income')
    .is('deleted_at', null)
    .order('ledger_code', { ascending: true })
  if (error) throw toError(error as PgError, 'finance_ledgers')
  return (data || []) as any[]
}

/** Default income ledger for a manual customer invoice: 5001 Function Hall Revenue if present. */
export function defaultIncomeLedgerId(ledgers: { id: string; ledger_code?: string | null }[]): string | null {
  return (ledgers || []).find((l) => l.ledger_code === '5001')?.id || null
}
