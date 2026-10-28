// ═══════════════════════════════════════════════════════════════════════════════
// Supplier payments: open-invoice lookup, create/post, cheque date stamp,
// cancellation, PO approve/cancel — procurementService against a mocked client.
//
// Cheque register (finance_cheques) sync is server-side (#134, Finance). The
// client must never read/write finance_cheques or finance_cashbook_entries:
// both are admin/finance-only under RLS, which is what produced
// "posted, but cheque registration failed" for procurement users.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, call, calls } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})
const auth = vi.hoisted(() => ({
  state: { currentBranch: { id: 'br-1', company_id: 'co-1' } as any, user: { id: 'u-1' } as any },
}))
vi.mock('src/stores/auth', () => ({ useAuthStore: () => auth.state }))
vi.mock('src/services/inventoryService', () => ({ fetchDocumentById: vi.fn() }))

import {
  getOpenInvoicesForSupplier,
  createAndPostPayment,
  postPayment,
  setPaymentChequeDate,
  cancelPayment,
  approvePO,
  approvePORpc,
  cancelPO,
} from 'src/services/procurementService'

let m: ReturnType<typeof createSupabaseMock>
beforeEach(() => {
  m = sb.mock
  m.reset()
  auth.state = { currentBranch: { id: 'br-1', company_id: 'co-1' }, user: { id: 'u-1' } }
})

const header = {
  supplier_id: 'sup-1',
  supplier_name: 'Acme Foods',
  doc_date: '2026-10-26',
  payment_method: 'cheque',
  cheque_no: ' 000777 ',
  total_amount: 2500,
  bank_account_code: '1010',
  bank_account_id: 'bank-ui',
}
const allocations = [{ invoice_id: 'inv-1', amount: 2500 }]

function expectNoFinanceTablesTouched() {
  expect(m.on('finance_cheques')).toHaveLength(0)
  expect(m.on('finance_cashbook_entries')).toHaveLength(0)
  expect(m.on('supplier_payments')).toHaveLength(0) // no direct UPDATE (RLS admin-only + IMMUTABLE_DOC)
}

describe('getOpenInvoicesForSupplier', () => {
  it('scopes to company + supplier and only offers posted / partially-paid invoices', async () => {
    m.queue('ap_invoices', { data: [] })
    await getOpenInvoicesForSupplier('sup-1')
    const q = m.on('ap_invoices')[0]
    expect(calls(q, 'eq').map((c) => c.args)).toEqual([
      ['supplier_id', 'sup-1'],
      ['company_id', 'co-1'],
    ])
    // draft/approved invoices were never credited to AP; #128 rejects them at post
    expect(call(q, 'in')?.args).toEqual(['status', ['posted', 'partial_paid']])
    expect(call(q, 'not')).toBeUndefined()
  })

  it('normalises amounts, derives missing balance and drops fully-settled rows', async () => {
    m.queue('ap_invoices', {
      data: [
        { id: 'a', total_amount: '1000', paid_amount: '400', balance_due: null },
        { id: 'b', total_amount: '500', paid_amount: '500', balance_due: 0 },
        { id: 'c', total_amount: '300', paid_amount: null, balance_due: '300' },
        { id: 'd', total_amount: '100', paid_amount: '150', balance_due: null },
      ],
    })
    const rows = await getOpenInvoicesForSupplier('sup-1')
    expect(rows.map((r: any) => [r.id, r.total_amount, r.paid_amount, r.balance_due])).toEqual([
      ['a', 1000, 400, 600],
      ['c', 300, 0, 300],
    ])
  })

  it('throws the DB error message', async () => {
    m.queue('ap_invoices', { error: { message: 'permission denied for table ap_invoices' } })
    await expect(getOpenInvoicesForSupplier('sup-1')).rejects.toThrow('permission denied for table ap_invoices')
  })

  // Without branch context, getContext() throws to prevent cross-company leakage
  it('throws when no active branch context is selected', async () => {
    auth.state = { currentBranch: null, user: { id: 'u-1' } }
    await expect(getOpenInvoicesForSupplier('sup-1')).rejects.toThrow('No active branch found')
  })
})

describe('createAndPostPayment', () => {
  it('passes context + header to the atomic RPC (cheque no trimmed)', async () => {
    m.queueRpc('create_and_post_payment', { data: { success: true, payment_id: 'pay-1', doc_number: 'SP-1' } })
    await createAndPostPayment(header, allocations)
    expect(m.rpcCalls[0]).toEqual({
      name: 'create_and_post_payment',
      args: {
        p_company_id: 'co-1',
        p_branch_id: 'br-1',
        p_supplier_id: 'sup-1',
        p_doc_date: '2026-10-26',
        p_payment_method: 'cheque',
        p_total_amount: 2500,
        p_reference_no: null,
        p_cheque_no: '000777',
        p_allocations: allocations,
        p_post_now: true,
        p_bank_account_code: '1010',
      },
    })
  })

  it('cheque payment without a PDC date: one RPC, no client-side cheque bookkeeping', async () => {
    m.queueRpc('create_and_post_payment', { data: { success: true, payment_id: 'pay-1', doc_number: 'SP-1' } })
    const res = await createAndPostPayment({ ...header, cheque_id: 'planned-1' }, allocations)
    expect(res).toEqual({ success: true, payment_id: 'pay-1', doc_number: 'SP-1' })
    expect(m.rpcCalls.map((c) => c.name)).toEqual(['create_and_post_payment'])
    expectNoFinanceTablesTouched()
  })

  it('cheque payment with a PDC date: stamps it via the role-checked RPC', async () => {
    m.queueRpc('create_and_post_payment', { data: { success: true, payment_id: 'pay-1', doc_number: 'SP-1' } })
    m.queueRpc('set_supplier_payment_cheque_date', { data: { success: true } })
    const res = await createAndPostPayment({ ...header, cheque_date: '2026-11-05' }, allocations)
    expect(res).toEqual({ success: true, payment_id: 'pay-1', doc_number: 'SP-1' })
    expect(m.rpcCalls[1]).toEqual({
      name: 'set_supplier_payment_cheque_date',
      args: { p_payment_id: 'pay-1', p_cheque_date: '2026-11-05' },
    })
    expectNoFinanceTablesTouched()
  })

  // QA finding (double-submit): a post-processing failure used to come back as
  // success=false although the payment was posted, so Save created a duplicate.
  it('cheque date stamp failure → still success (payment exists) with a warning', async () => {
    m.queueRpc('create_and_post_payment', { data: { success: true, payment_id: 'pay-1', doc_number: 'SP-1' } })
    m.queueRpc('set_supplier_payment_cheque_date', { data: { success: false, error: 'Not authorised to edit supplier payments' } })
    const res = await createAndPostPayment({ ...header, cheque_date: '2026-11-05' }, allocations)
    expect(res.success).toBe(true)
    expect(res.payment_id).toBe('pay-1')
    expect(res.warning).toMatch(/SP-1 was saved, but the cheque date could not be recorded: Not authorised/)
  })

  it('cheque date stamp transport error → success with warning', async () => {
    m.queueRpc('create_and_post_payment', { data: { success: true, payment_id: 'pay-1', doc_number: 'SP-1' } })
    m.queueRpc('set_supplier_payment_cheque_date', { error: { message: 'Could not find the function' } })
    const res = await createAndPostPayment({ ...header, cheque_date: '2026-11-05' }, allocations)
    expect(res).toMatchObject({ success: true, payment_id: 'pay-1', warning: expect.stringContaining('Could not find the function') })
  })

  it('cash payment ignores a stray cheque date', async () => {
    m.queueRpc('create_and_post_payment', { data: { success: true, payment_id: 'pay-1' } })
    const res = await createAndPostPayment({ ...header, payment_method: 'cash', cheque_date: '2026-11-05' }, allocations)
    expect(res.success).toBe(true)
    expect(m.rpcCalls).toHaveLength(1)
    expectNoFinanceTablesTouched()
  })

  it('RPC error → failure, nothing else touched', async () => {
    m.queueRpc('create_and_post_payment', { error: { message: 'Allocation exceeds balance' } })
    const res = await createAndPostPayment({ ...header, cheque_date: '2026-11-05' }, allocations)
    expect(res).toEqual({ success: false, error: 'Allocation exceeds balance' })
    expect(m.queries).toHaveLength(0)
    expect(m.rpcCalls).toHaveLength(1)
  })

  it('RPC business failure (success:false) → no cheque date stamp', async () => {
    m.queueRpc('create_and_post_payment', { data: { success: false, error: 'ACCOUNT_MISSING' } })
    const res = await createAndPostPayment({ ...header, cheque_date: '2026-11-05' }, allocations)
    expect(res).toEqual({ success: false, error: 'ACCOUNT_MISSING' })
    expect(m.rpcCalls).toHaveLength(1)
  })
})

describe('postPayment', () => {
  it('returns the RPC result with no follow-up queries', async () => {
    m.queueRpc('post_supplier_payment_rpc', { data: { success: true, doc_number: 'SP-2' } })
    expect(await postPayment('pay-2')).toEqual({ success: true, doc_number: 'SP-2' })
    expect(m.rpcCalls[0]).toEqual({ name: 'post_supplier_payment_rpc', args: { p_payment_id: 'pay-2' } })
    expect(m.queries).toHaveLength(0)
  })

  it('RPC failure is returned as-is', async () => {
    m.queueRpc('post_supplier_payment_rpc', { data: { success: false, error: 'Already posted' } })
    expect(await postPayment('pay-1')).toEqual({ success: false, error: 'Already posted' })
  })

  it('transport error → { success:false }', async () => {
    m.queueRpc('post_supplier_payment_rpc', { error: { message: 'boom' } })
    expect(await postPayment('pay-1')).toEqual({ success: false, error: 'boom' })
  })
})

describe('setPaymentChequeDate / cancelPayment', () => {
  it('setPaymentChequeDate passes args and maps errors', async () => {
    m.queueRpc('set_supplier_payment_cheque_date', { data: { success: true } }, { error: { message: 'x' } })
    expect(await setPaymentChequeDate('pay-1', '2026-12-01')).toEqual({ success: true })
    expect(await setPaymentChequeDate('pay-1', '2026-12-01')).toEqual({ success: false, error: 'x' })
  })

  it('cancelPayment calls the role-checked RPC with the reason', async () => {
    m.queueRpc('cancel_supplier_payment', { data: { success: true, doc_number: 'SP-1', status: 'cancelled' } })
    const res = await cancelPayment('pay-1', 'Wrong supplier')
    expect(res.success).toBe(true)
    expect(m.rpcCalls[0]).toEqual({ name: 'cancel_supplier_payment', args: { p_payment_id: 'pay-1', p_reason: 'Wrong supplier' } })
    expect(m.queries).toHaveLength(0)
  })

  it('cancelPayment surfaces server refusals (e.g. cleared cheque)', async () => {
    m.queueRpc('cancel_supplier_payment', { data: { success: false, error: 'Cheque 000777 ... has already cleared/bounced' } })
    expect((await cancelPayment('pay-1', 'x')).error).toMatch(/cleared/)
  })

  it('cancelPayment null payload → failure', async () => {
    expect(await cancelPayment('pay-1', 'x')).toEqual({ success: false, error: 'No response' })
  })
})

describe('PO approve / cancel', () => {
  it('approvePORpc passes through multi-level pending_approval results', async () => {
    const payload = { success: true, status: 'pending_approval', current_level: 1, required_level: 2, doc_number: 'PO-1' }
    m.queueRpc('approve_po', { data: payload })
    expect(await approvePORpc('po-1')).toEqual(payload)
    expect(m.rpcCalls[0]).toEqual({ name: 'approve_po', args: { p_po_id: 'po-1' } })
  })

  it('approvePORpc maps transport errors to { success:false }', async () => {
    m.queueRpc('approve_po', { error: { message: 'Maker cannot approve own PO' } })
    expect(await approvePORpc('po-1')).toEqual({ success: false, error: 'Maker cannot approve own PO' })
  })

  it('approvePO goes through approve_po and never touches the table when approval is on', async () => {
    m.queueRpc('approve_po', { data: { success: true, status: 'approved' } })
    expect(await approvePO('po-1')).toEqual({ success: true, status: 'approved', message: undefined })
    expect(m.on('purchase_orders')).toHaveLength(0)
  })

  it('approvePO rejects maker-checker / threshold refusals', async () => {
    m.queueRpc('approve_po', { data: { success: false, error: 'Maker cannot approve own PO' } })
    await expect(approvePO('po-1')).rejects.toThrow('Maker cannot approve own PO')
    expect(m.on('purchase_orders')).toHaveLength(0)
  })

  it('approvePO falls back to a direct draft → approved update only when approval is disabled', async () => {
    m.queueRpc('approve_po', { data: { success: false, error: 'PO approval is not enabled for this company.' } })
    const res = await approvePO('po-1')
    expect(res.status).toBe('approved')
    const q = m.on('purchase_orders')[0]
    expect(call(q, 'update')?.args[0]).toMatchObject({ status: 'approved', approved_by: 'u-1' })
    expect(calls(q, 'eq').map((c) => c.args)).toEqual([
      ['id', 'po-1'],
      ['status', 'draft'],
    ])
  })

  it('cancelPO only cancels draft/approved and reports a silent no-op', async () => {
    m.queue('purchase_orders', { data: [{ id: 'po-1' }] }, { data: [] })
    await expect(cancelPO('po-1', 'dup')).resolves.toEqual({ success: true })
    const q = m.on('purchase_orders')[0]
    expect(call(q, 'update')?.args[0]).toMatchObject({ status: 'cancelled', cancel_reason: 'dup' })
    expect(call(q, 'in')?.args).toEqual(['status', ['draft', 'approved']])
    await expect(cancelPO('po-2')).rejects.toThrow(/PO was not cancelled/)
  })
})
