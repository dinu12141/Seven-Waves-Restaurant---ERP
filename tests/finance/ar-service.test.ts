// ═══════════════════════════════════════════════════════════════════════════════
// Accounts Receivable service (#144): reads hit customer_receivables only, RPC
// wrappers throw on success:false and explain a missing #144 migration.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, call, calls } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})
vi.mock('src/core/api/ApiClient', () => ({ api: {} }))

import {
  listReceivables,
  listOpenReceivablesForCustomer,
  listReceipts,
  getCustomerStatement,
  getArControl,
  receivePayment,
  createInvoice,
  cancelReceipt,
  listWriteOffs,
  writeOff,
  reverseWriteOff,
  isArSchemaMissing,
  defaultIncomeLedgerId,
} from 'src/services/finance/arService'
import { fetchReceivables, fetchReceivableAging, fetchDashboardKPIs } from 'src/services/financeService'

let m: ReturnType<typeof createSupabaseMock>
beforeEach(() => {
  m = sb.mock
  m.reset()
})

const MISSING_FN = {
  code: 'PGRST202',
  message: 'Could not find the function public.fn_ar_receive_payment(...) in the schema cache',
} as any

describe('listReceivables', () => {
  it('defaults to open statuses and normalizes rows', async () => {
    m.queue('customer_receivables', {
      data: [
        {
          id: 'r2',
          customer_id: 'c1',
          doc_number: 'AR-INV-2',
          due_date: '2099-01-01',
          total_amount: '100',
          paid_amount: '25',
          balance: '75',
          status: 'partial',
          customers: { first_name: 'Ann', last_name: 'Lee', phone: '077' },
        },
        {
          id: 'r1',
          customer_id: 'c1',
          doc_number: 'AR-INV-1',
          due_date: '2000-01-01',
          total_amount: 10,
          paid_amount: 0,
          status: 'outstanding',
          customers: null,
        },
      ],
    })
    const rows = await listReceivables()
    const q = m.on('customer_receivables')[0]
    expect(call(q, 'in')?.args).toEqual(['status', ['outstanding', 'partial', 'overdue']])
    expect(rows.map((r) => r.id)).toEqual(['r1', 'r2']) // oldest due first
    expect(rows[1]).toMatchObject({ customer_name: 'Ann Lee', balance: 75, total_amount: 100, aging_bucket: 'current' })
    expect(rows[0]).toMatchObject({ balance: 10, aging_bucket: '90+ days', customer_name: 'Walk-in / Unregistered' })
  })

  it('applies customer / branch / status filters and client search', async () => {
    m.queue('customer_receivables', {
      data: [
        { id: 'a', doc_number: 'AR-INV-9', status: 'paid', customers: { first_name: 'Zed' } },
        { id: 'b', doc_number: 'AR-INV-8', status: 'paid', customers: { first_name: 'Amy' } },
      ],
    })
    const rows = await listReceivables({ customerId: 'c9', branchId: 'b1', status: 'paid', search: 'zed' })
    const q = m.on('customer_receivables')[0]
    expect(calls(q, 'eq').map((c) => c.args)).toEqual([
      ['status', 'paid'],
      ['customer_id', 'c9'],
      ['branch_id', 'b1'],
    ])
    expect(call(q, 'in')).toBeUndefined()
    expect(rows.map((r) => r.id)).toEqual(['a'])
  })

  it('missing table/column → apply-the-SQL message', async () => {
    m.queue('customer_receivables', { error: { code: '42703', message: 'column customer_receivables.doc_number does not exist' } as any })
    await expect(listReceivables()).rejects.toThrow(/finance_accounts_receivable_144\.sql/)
  })

  it('listOpenReceivablesForCustomer drops zero balances', async () => {
    m.queue('customer_receivables', {
      data: [
        { id: 'a', status: 'outstanding', balance: 0, customer_id: 'c1' },
        { id: 'b', status: 'outstanding', balance: 5, customer_id: 'c1' },
      ],
    })
    const rows = await listOpenReceivablesForCustomer('c1')
    expect(rows.map((r) => r.id)).toEqual(['b'])
    expect(await listOpenReceivablesForCustomer('')).toEqual([])
  })
})

describe('listReceipts', () => {
  it('maps customer, account and invoice numbers', async () => {
    m.queue('ar_receipts', {
      data: [
        {
          id: 'p1',
          receipt_no: 'AR-RCPT-1',
          amount: '150',
          status: 'posted',
          customers: { first_name: 'Ann' },
          finance_accounts: { registered_name: 'Main Cash' },
          ar_receipt_allocations: [
            { amount: 100, customer_receivables: { doc_number: 'AR-INV-1' } },
            { amount: 50, customer_receivables: { doc_number: 'AR-INV-2' } },
          ],
        },
      ],
    })
    const rows = await listReceipts({ status: 'posted', dateFrom: '2026-01-01' })
    expect(rows[0]).toMatchObject({ amount: 150, customer_name: 'Ann', account_name: 'Main Cash', invoice_numbers: 'AR-INV-1, AR-INV-2' })
    const q = m.on('ar_receipts')[0]
    expect(call(q, 'eq')?.args).toEqual(['status', 'posted'])
    expect(call(q, 'gte')?.args).toEqual(['receipt_date', '2026-01-01'])
  })
})

describe('getCustomerStatement', () => {
  it('reads invoices + posted receipts up to dateTo and builds the statement', async () => {
    m.queue('customer_receivables', { data: [{ id: 'i1', doc_number: 'AR-INV-1', doc_date: '2026-01-10', total_amount: 300 }] })
    m.queue('ar_receipts', { data: [{ id: 'p1', receipt_no: 'AR-RCPT-1', receipt_date: '2026-02-01', amount: 100, status: 'posted' }] })
    const s = await getCustomerStatement('c1', '2026-02-01', '2026-02-28')
    expect(s.opening_balance).toBe(300)
    expect(s.closing_balance).toBe(200)
    const inv = m.on('customer_receivables')[0]
    const rec = m.on('ar_receipts')[0]
    expect(call(inv, 'lte')?.args).toEqual(['doc_date', '2026-02-28'])
    expect(calls(rec, 'eq').map((c) => c.args)).toContainEqual(['status', 'posted'])
  })
})

describe('getArControl', () => {
  it('compares ledger 1003 to open sub-ledger and unposted POS credit', async () => {
    m.queue('finance_ledgers', { data: [{ id: 'l1', current_balance: '400' }] })
    m.queue(
      'customer_receivables',
      { data: [{ id: 'a', status: 'outstanding', balance: 500 }] },
      { data: [{ id: 'p', source: 'pos_credit', gl_posted_at: null, status: 'outstanding', total_amount: 100 }] },
    )
    const c = await getArControl()
    expect(c).toMatchObject({
      ledger_balance: 400,
      open_receivables_total: 500,
      unposted_pos_credit_total: 100,
      difference: 100,
      unexplained_difference: 0,
      reconciled: true,
    })
    expect(call(m.on('finance_ledgers')[0], 'eq')?.args).toEqual(['ledger_code', '1003'])
    const pos = m.on('customer_receivables')[1]
    expect(call(pos, 'eq')?.args).toEqual(['source', 'pos_credit'])
    expect(call(pos, 'is')?.args).toEqual(['gl_posted_at', null])
  })
})

describe('RPC wrappers', () => {
  const pay = {
    customerId: 'c1',
    branchId: 'b1',
    receiptDate: '2026-10-28',
    accountId: 'acc1',
    amount: 150.5,
    paymentMethod: 'Bank Transfer',
    referenceNo: 'TRF-1',
    remarks: 'x',
    allocations: [
      { receivable_id: 'r1', amount: 100 },
      { receivable_id: 'r2', amount: 50.5 },
    ],
  }

  it('receivePayment sends the #144 signature', async () => {
    m.queueRpc('fn_ar_receive_payment', { data: { success: true, receipt_id: 'p1', receipt_no: 'AR-RCPT-2026-000001' } })
    const res = await receivePayment(pay)
    expect(res).toEqual({ receipt_id: 'p1', receipt_no: 'AR-RCPT-2026-000001' })
    expect(m.rpcCalls[0]).toEqual({
      name: 'fn_ar_receive_payment',
      args: {
        p_customer_id: 'c1',
        p_branch_id: 'b1',
        p_receipt_date: '2026-10-28',
        p_account_id: 'acc1',
        p_amount: 150.5,
        p_payment_method: 'bank_transfer',
        p_reference_no: 'TRF-1',
        p_remarks: 'x',
        p_allocations: [
          { receivable_id: 'r1', amount: 100 },
          { receivable_id: 'r2', amount: 50.5 },
        ],
      },
    })
  })

  it('receivePayment validates before calling the server', async () => {
    await expect(receivePayment({ ...pay, amount: 151 })).rejects.toThrow(/must equal/)
    await expect(receivePayment({ ...pay, accountId: '' })).rejects.toThrow(/account/)
    await expect(receivePayment({ ...pay, branchId: '' })).rejects.toThrow(/branch/)
    expect(m.rpcCalls).toHaveLength(0)
  })

  it('throws the server error on success:false', async () => {
    m.queueRpc('fn_ar_receive_payment', { data: { success: false, error: 'VALIDATION_ERROR: invoice AR-INV-1 is paid' } })
    await expect(receivePayment(pay)).rejects.toThrow('VALIDATION_ERROR: invoice AR-INV-1 is paid')
  })

  it('missing function (PGRST202) → apply-the-SQL message', async () => {
    m.queueRpc('fn_ar_receive_payment', { error: MISSING_FN })
    await expect(receivePayment(pay)).rejects.toThrow(/Apply supabase\/finance_accounts_receivable_144\.sql/)
  })

  it('createInvoice', async () => {
    m.queueRpc('fn_ar_create_invoice', { data: { success: true, receivable_id: 'r9', doc_number: 'AR-INV-2026-000009' } })
    const res = await createInvoice({
      customerId: 'c1',
      branchId: 'b1',
      docDate: '2026-10-28',
      dueDate: '2026-11-27',
      amount: 25000,
      incomeLedgerId: 'l5001',
      description: 'Hall',
    })
    expect(res).toEqual({ receivable_id: 'r9', doc_number: 'AR-INV-2026-000009' })
    expect(m.rpcCalls[0].args).toEqual({
      p_customer_id: 'c1',
      p_branch_id: 'b1',
      p_doc_date: '2026-10-28',
      p_due_date: '2026-11-27',
      p_amount: 25000,
      p_income_ledger_id: 'l5001',
      p_description: 'Hall',
    })
  })

  it('createInvoice rejects bad input locally', async () => {
    const base = { customerId: 'c1', branchId: 'b1', amount: 10, incomeLedgerId: 'l' }
    await expect(createInvoice({ ...base, amount: 0 })).rejects.toThrow(/greater than zero/)
    await expect(createInvoice({ ...base, customerId: '' })).rejects.toThrow(/customer/)
    await expect(createInvoice({ ...base, docDate: '2026-10-28', dueDate: '2026-10-01' })).rejects.toThrow(/Due date/)
    expect(m.rpcCalls).toHaveLength(0)
  })

  it('cancelReceipt requires a reason and passes it trimmed', async () => {
    await expect(cancelReceipt('p1', '  ')).rejects.toThrow(/reason/)
    m.queueRpc('fn_ar_cancel_receipt', { data: { success: true, receipt_no: 'AR-RCPT-1' } })
    await cancelReceipt('p1', ' wrong customer ')
    expect(m.rpcCalls[0]).toEqual({ name: 'fn_ar_cancel_receipt', args: { p_receipt_id: 'p1', p_reason: 'wrong customer' } })
  })

  it('isArSchemaMissing / defaultIncomeLedgerId', () => {
    expect(isArSchemaMissing(MISSING_FN)).toBe(true)
    expect(isArSchemaMissing({ code: '42883', message: 'function x does not exist' })).toBe(true)
    expect(isArSchemaMissing({ code: '23514', message: 'check violation' })).toBe(false)
    expect(defaultIncomeLedgerId([{ id: 'a', ledger_code: '4000' }, { id: 'b', ledger_code: '5001' }])).toBe('b')
    expect(defaultIncomeLedgerId([{ id: 'a', ledger_code: '4000' }])).toBeNull()
  })
})

describe('bad-debt write-offs', () => {
  it('listReceivables selects written_off_amount and normalizes it', async () => {
    m.queue('customer_receivables', {
      data: [{ id: 'r1', total_amount: 100, paid_amount: 100, written_off_amount: '40', status: 'written_off' }],
    })
    const rows = await listReceivables({ status: 'written_off' })
    expect(String(call(m.on('customer_receivables')[0], 'select')?.args[0])).toMatch(/written_off_amount/)
    expect(rows[0]).toMatchObject({ written_off_amount: 40, paid_amount: 100, balance: 0 })
  })

  it('listReceivables falls back to legacy columns when written_off_amount is missing', async () => {
    m.queue(
      'customer_receivables',
      { error: { code: '42703', message: 'column customer_receivables.written_off_amount does not exist' } as any },
      { data: [{ id: 'r1', total_amount: 100, paid_amount: 0, status: 'outstanding' }] },
    )
    const rows = await listReceivables()
    const [first, second] = m.on('customer_receivables')
    expect(String(call(first, 'select')?.args[0])).toMatch(/written_off_amount/)
    expect(String(call(second, 'select')?.args[0])).not.toMatch(/written_off_amount/)
    expect(rows[0]).toMatchObject({ balance: 100, written_off_amount: 0 })
  })

  it('listWriteOffs maps invoice / customer and applies filters + search', async () => {
    m.queue('ar_write_offs', {
      data: [
        {
          id: 'w1',
          write_off_no: 'AR-WO-1',
          amount: '250',
          reason: 'Untraceable',
          status: 'posted',
          customer_receivables: { doc_number: 'AR-INV-7', customers: { first_name: 'Ann', last_name: 'Lee' } },
        },
        { id: 'w2', write_off_no: 'AR-WO-2', amount: 5, reason: 'Rounding', status: 'posted', customer_receivables: null },
      ],
    })
    const rows = await listWriteOffs({ status: 'posted', customerId: 'c1', search: 'ann' })
    const q = m.on('ar_write_offs')[0]
    expect(calls(q, 'eq').map((c) => c.args)).toEqual([
      ['customer_id', 'c1'],
      ['status', 'posted'],
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: 250, doc_number: 'AR-INV-7', customer_name: 'Ann Lee' })
  })

  it('listWriteOffs: missing table -> apply-the-SQL message', async () => {
    m.queue('ar_write_offs', { error: { code: '42P01', message: 'relation "public.ar_write_offs" does not exist' } as any })
    await expect(listWriteOffs()).rejects.toThrow(/Apply supabase\/finance_accounts_receivable_144\.sql/)
  })

  it('writeOff sends the #144 signature (amount rounded, reason trimmed)', async () => {
    m.queueRpc('fn_ar_write_off', { data: { success: true, write_off_id: 'w1', write_off_no: 'AR-WO-2026-000001' } })
    const res = await writeOff({ receivableId: 'r1', amount: 99.999, reason: ' gone ', date: '2026-10-28', openBalance: 100 })
    expect(res).toEqual({ write_off_id: 'w1', write_off_no: 'AR-WO-2026-000001' })
    expect(m.rpcCalls[0]).toEqual({
      name: 'fn_ar_write_off',
      args: { p_receivable_id: 'r1', p_amount: 100, p_reason: 'gone', p_date: '2026-10-28' },
    })
  })

  it('writeOff validates locally before calling the server', async () => {
    const base = { receivableId: 'r1', amount: 50, reason: 'x', openBalance: 40 }
    await expect(writeOff(base)).rejects.toThrow(/exceed the open balance/)
    await expect(writeOff({ ...base, openBalance: 100, reason: '  ' })).rejects.toThrow(/reason/)
    await expect(writeOff({ ...base, amount: 0, openBalance: null })).rejects.toThrow(/greater than zero/)
    await expect(writeOff({ ...base, receivableId: '' })).rejects.toThrow(/Invoice/)
    expect(m.rpcCalls).toHaveLength(0)
  })

  it('writeOff surfaces the server refusal (managers) and a missing function', async () => {
    m.queueRpc(
      'fn_ar_write_off',
      { data: { success: false, error: 'Only admin or finance users can write off bad debts.' } },
      { error: { code: 'PGRST202', message: 'Could not find the function public.fn_ar_write_off in the schema cache' } as any },
    )
    const input = { receivableId: 'r1', amount: 10, reason: 'x' }
    await expect(writeOff(input)).rejects.toThrow('Only admin or finance users can write off bad debts.')
    await expect(writeOff(input)).rejects.toThrow(/Apply supabase\/finance_accounts_receivable_144\.sql/)
  })

  it('reverseWriteOff requires a reason and passes it trimmed', async () => {
    await expect(reverseWriteOff('w1', ' ')).rejects.toThrow(/reason/)
    m.queueRpc('fn_ar_reverse_write_off', { data: { success: true, write_off_no: 'AR-WO-1' } })
    expect(await reverseWriteOff('w1', ' posted in error ')).toEqual({ write_off_no: 'AR-WO-1' })
    expect(m.rpcCalls[0]).toEqual({ name: 'fn_ar_reverse_write_off', args: { p_write_off_id: 'w1', p_reason: 'posted in error' } })
  })

  it('reverseWriteOff: missing function -> apply-the-SQL message', async () => {
    m.queueRpc('fn_ar_reverse_write_off', { error: { code: '42883', message: 'function fn_ar_reverse_write_off does not exist' } as any })
    await expect(reverseWriteOff('w1', 'x')).rejects.toThrow(/Apply supabase\/finance_accounts_receivable_144\.sql/)
  })

  it('statement includes posted write-offs as credit lines', async () => {
    m.queue('customer_receivables', { data: [{ id: 'i1', doc_number: 'AR-INV-1', doc_date: '2026-01-10', total_amount: 300 }] })
    m.queue('ar_receipts', { data: [{ id: 'p1', receipt_no: 'AR-RCPT-1', receipt_date: '2026-02-01', amount: 100, status: 'posted' }] })
    m.queue('ar_write_offs', {
      data: [{ id: 'w1', write_off_no: 'AR-WO-1', write_off_date: '2026-03-01', amount: 200, reason: 'Gone', status: 'posted' }],
    })
    const s = await getCustomerStatement('c1', null, '2026-12-31')
    expect(s.closing_balance).toBe(0)
    expect(s.total_received).toBe(100)
    expect(s.total_written_off).toBe(200)
    const wo = s.lines.find((l) => l.type === 'write_off')
    expect(wo).toMatchObject({ ref: 'AR-WO-1', credit: 200, description: 'Bad debt write-off — Gone' })
    const q = m.on('ar_write_offs')[0]
    expect(calls(q, 'eq').map((c) => c.args)).toContainEqual(['status', 'posted'])
    expect(call(q, 'lte')?.args).toEqual(['write_off_date', '2026-12-31'])
  })

  it('statement still works when ar_write_offs is not on the database yet', async () => {
    m.queue('customer_receivables', { data: [{ id: 'i1', doc_number: 'AR-INV-1', doc_date: '2026-01-10', total_amount: 300 }] })
    m.queue('ar_write_offs', { error: { code: '42P01', message: 'relation "public.ar_write_offs" does not exist' } as any })
    const s = await getCustomerStatement('c1')
    expect(s.closing_balance).toBe(300)
    expect(s.total_written_off).toBe(0)
  })

  it('AR control: a written-off unposted POS credit still counts as missing from GL', async () => {
    m.queue('finance_ledgers', { data: [{ id: 'l1', current_balance: '-100' }] })
    m.queue(
      'customer_receivables',
      { data: [] },
      {
        data: [
          { id: 'p', source: 'pos_credit', gl_posted_at: null, status: 'written_off', written_off_amount: 100, total_amount: 100 },
          { id: 'legacy', source: 'pos_credit', gl_posted_at: null, status: 'written_off', written_off_amount: 0, total_amount: 50 },
        ],
      },
    )
    const c = await getArControl()
    expect(c).toMatchObject({ difference: 100, unposted_pos_credit_total: 100, unexplained_difference: 0, reconciled: true })
    expect(String(call(m.on('customer_receivables')[1], 'select')?.args[0])).toMatch(/written_off_amount/)
  })
})

describe('legacy financeService receivables', () => {
  it('fetchReceivables reads customer_receivables only (no unpaid orders)', async () => {
    m.queue('customer_receivables', { data: [{ id: 'r1', status: 'outstanding', total_amount: 10, paid_amount: 0 }] })
    const { data } = await fetchReceivables()
    expect(m.on('orders')).toHaveLength(0)
    expect(call(m.on('customer_receivables')[0], 'in')?.args).toEqual(['status', ['outstanding', 'partial', 'overdue']])
    expect(data?.[0]).toMatchObject({ balance: 10 })
  })

  it('fetchReceivableAging uses page bucket keys by due date', async () => {
    m.queue('customer_receivables', {
      data: [
        { id: 'a', status: 'outstanding', balance: 10, due_date: '2099-01-01' },
        { id: 'b', status: 'overdue', balance: 20, due_date: '2000-01-01' },
        { id: 'c', status: 'partial', balance: 0, due_date: '2000-01-01' },
      ],
    })
    const { data } = await fetchReceivableAging()
    expect(data.map((r: any) => [r.id, r.aging_bucket])).toEqual([
      ['a', 'current'],
      ['b', '90+ days'],
    ])
  })

  it('dashboard outstandingAR comes from customer_receivables only', async () => {
    m.queue('customer_receivables', {
      data: [
        { balance: 100.1, status: 'outstanding' },
        { total_amount: 50, paid_amount: 49.9, status: 'partial' },
      ],
    })
    const kpi = await fetchDashboardKPIs()
    expect(kpi.outstandingAR).toBe(100.2)
    // only the paid-orders revenue query touches orders — no unpaid-orders AR query
    expect(m.on('orders')).toHaveLength(1)
    expect(calls(m.on('orders')[0], 'eq').map((c) => c.args)).toContainEqual(['payment_status', 'paid'])
  })
})
