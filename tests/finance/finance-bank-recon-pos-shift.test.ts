// ═══════════════════════════════════════════════════════════════════════════════
// Bank reconciliation (GL-sourced lines, GL-posted adjustments) and POS shift
// GL status — behavioural tests against a mocked Supabase client
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, call, calls } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  ;(sb.mock.client as any).auth = { getUser: async () => ({ data: { user: { id: 'u1' } } }) }
  return { supabase: sb.mock.client }
})
vi.mock('src/modules/finance/services/finance-ledger.service', () => ({ logFinanceAudit: vi.fn() }))
vi.mock('src/stores/auth', () => ({ useAuthStore: () => ({ currentBranch: { id: 'br-auth' } }) }))

import { financeBankReconciliationService as brs } from 'src/modules/finance/services/finance-bank-reconciliation.service'
import {
  buildShiftGlStatus,
  shiftTenderBreakdown,
  financePosShiftService,
  localDayBoundsIso,
} from 'src/modules/finance/services/finance-pos-shift.service'

let m: ReturnType<typeof createSupabaseMock>
beforeEach(() => {
  m = sb.mock
  m.reset()
})

const RECON = {
  id: 'r1',
  status: 'draft',
  bank_account_id: 'acc-1',
  branch_id: 'br-1',
  reconciliation_month: '2026-10',
  statement_start_date: '2026-10-01',
  statement_end_date: '2026-10-31',
  opening_bank_balance: 0,
  closing_bank_balance: 0,
  bank_account: { id: 'acc-1', ledger_id: 'led-bank', branch_id: 'br-1' },
  lines: [] as any[],
}

describe('bank reconciliation — fetchAndPopulateTransactions', () => {
  it('pulls only GL legs of the bank account ledger, once each, enriched with cheque info', async () => {
    m.queue('finance_bank_reconciliations', { data: RECON }, { data: RECON }, { data: RECON }, { data: RECON })
    m.queue('finance_cashbook_entries', {
      data: [
        { id: 'cb1', source_type: 'supplier_payment', source_id: 'sp1', entry_date: '2026-10-05', description: 'Pay SUP', debit_amount: 0, credit_amount: 38400 },
        { id: 'cb2', source_type: 'voucher', source_id: 'v1', entry_date: '2026-10-06', description: 'Receipt', debit_amount: 1000, credit_amount: 0 },
        { id: 'cb3', source_type: 'supplier_payment', source_id: 'sp1', entry_date: '2026-10-20', description: 'REVERSAL bounce', debit_amount: 38400, credit_amount: 0 },
      ],
    })
    m.queue('finance_cheques', {
      data: [{ id: 'ch1', cheque_no: '578425', status: 'cleared', cleared_date: '2026-10-10', supplier_payment_id: 'sp1', voucher_id: null }],
    })

    await brs.fetchAndPopulateTransactions('r1')

    const cbq = m.on('finance_cashbook_entries')[0]
    expect(calls(cbq, 'eq').map((c) => c.args)).toEqual(
      expect.arrayContaining([['account_id', 'acc-1'], ['ledger_id', 'led-bank']]),
    )
    // vouchers are NOT pulled separately any more (they were double counted)
    expect(m.on('finance_vouchers').length).toBe(0)

    const inserted = call(m.on('finance_bank_reconciliation_lines')[0], 'insert')?.args[0] as any[]
    expect(inserted.map((l) => l.source_id)).toEqual(['cb1', 'cb2', 'cb3'])
    expect(inserted[0]).toMatchObject({ source_type: 'cheque', debit_amount: 38400, credit_amount: 0, is_matched: true })
    expect(inserted[0].description).toContain('578425')
    expect(inserted[1]).toMatchObject({ source_type: 'deposit', debit_amount: 0, credit_amount: 1000, is_matched: false })
    expect(inserted[2]).toMatchObject({ source_type: 'deposit', is_matched: false })
  })

  it('skips legs already on the reconciliation', async () => {
    const withLine = { ...RECON, lines: [{ id: 'l1', source_id: 'cb2' }] }
    m.queue('finance_bank_reconciliations', { data: withLine }, { data: withLine }, { data: withLine }, { data: withLine })
    m.queue('finance_cashbook_entries', {
      data: [{ id: 'cb2', source_type: 'voucher', source_id: 'v1', entry_date: '2026-10-06', debit_amount: 1000, credit_amount: 0 }],
    })
    m.queue('finance_cheques', { data: [] })
    await brs.fetchAndPopulateTransactions('r1')
    expect(m.on('finance_bank_reconciliation_lines').length).toBe(0)
  })

  it('refuses when the bank account has no GL ledger', async () => {
    const noLedger = { ...RECON, bank_account: { id: 'acc-1', ledger_id: null } }
    m.queue('finance_bank_reconciliations', { data: noLedger })
    m.queue('finance_accounts', { data: { id: 'acc-1', ledger_id: null } })
    await expect(brs.fetchAndPopulateTransactions('r1')).rejects.toThrow('not linked to a GL ledger')
  })
})

describe('bank reconciliation — addAdjustment posts balanced GL via RPC', () => {
  it('bank charge: Dr contra / Cr bank (with bank account_id), then a matched line on the cashbook leg', async () => {
    m.queue('finance_bank_reconciliations', { data: RECON }, { data: RECON }, { data: RECON }, { data: RECON })
    m.queueRpc('fn_fin_post_manual_journal', { data: { success: true, journal_id: 'j1' } })
    m.queue('finance_cashbook_entries', { data: { id: 'cb-adj' } })
    m.queue('finance_bank_reconciliation_lines', { data: { id: 'line-1' } })

    await brs.addAdjustment('r1', {
      source_type: 'bank_charge', direction: 'debit', transaction_date: '2026-10-31',
      amount: 250, description: 'SMS fee', contra_ledger_id: 'led-charges',
    })

    const rpc = m.rpcCalls[0] as any
    expect(rpc.name).toBe('fn_fin_post_manual_journal')
    expect(rpc.args.p_branch_id).toBe('br-1')
    expect(rpc.args.p_lines).toEqual([
      { ledger_id: 'led-charges', dr_amount: 250, cr_amount: 0, memo: null },
      { ledger_id: 'led-bank', account_id: 'acc-1', dr_amount: 0, cr_amount: 250, memo: null },
    ])
    const line = call(m.on('finance_bank_reconciliation_lines')[0], 'insert')?.args[0] as any
    expect(line).toMatchObject({ source_type: 'bank_charge', source_id: 'cb-adj', debit_amount: 250, credit_amount: 0, is_matched: true })
  })

  it('card settlement: Dr bank net + Dr fee / Cr 1021 gross', async () => {
    m.queue('finance_bank_reconciliations', { data: RECON }, { data: RECON }, { data: RECON }, { data: RECON })
    m.queueRpc('fn_fin_post_manual_journal', { data: { success: true, journal_id: 'j2' } })
    m.queue('finance_cashbook_entries', { data: { id: 'cb-set' } })
    m.queue('finance_bank_reconciliation_lines', { data: { id: 'line-2' } })

    await brs.addAdjustment('r1', {
      source_type: 'card_settlement', transaction_date: '2026-10-15', amount: 10000, fee_amount: 250,
      fee_ledger_id: 'led-mdr', description: 'Visa batch 15 Oct', contra_ledger_id: 'led-1021',
    })
    const lines = (m.rpcCalls[0] as any).args.p_lines
    expect(lines).toEqual([
      { ledger_id: 'led-bank', account_id: 'acc-1', dr_amount: 9750, cr_amount: 0, memo: null },
      { ledger_id: 'led-mdr', dr_amount: 250, cr_amount: 0, memo: 'Settlement fee' },
      { ledger_id: 'led-1021', dr_amount: 0, cr_amount: 10000, memo: null },
    ])
    const line = call(m.on('finance_bank_reconciliation_lines')[0], 'insert')?.args[0] as any
    expect(line).toMatchObject({ source_type: 'deposit', credit_amount: 9750, debit_amount: 0 })
  })

  it('never writes a line when the GL posting fails, and requires a contra ledger', async () => {
    m.queue('finance_bank_reconciliations', { data: RECON })
    await expect(
      brs.addAdjustment('r1', { transaction_date: '2026-10-31', amount: 10, description: 'x' }),
    ).rejects.toThrow('Select the GL ledger')

    m.queue('finance_bank_reconciliations', { data: RECON })
    m.queueRpc('fn_fin_post_manual_journal', { data: { success: false, error: 'Only admin or finance users can post journal entries.' } })
    await expect(
      brs.addAdjustment('r1', { transaction_date: '2026-10-31', amount: 10, description: 'x', contra_ledger_id: 'c' }),
    ).rejects.toThrow('Only admin or finance')
    expect(m.on('finance_bank_reconciliation_lines').length).toBe(0)
  })
})

describe('bank reconciliation — line guards', () => {
  it('refuses to toggle lines on an approved reconciliation', async () => {
    m.queue('finance_bank_reconciliation_lines', { data: { id: 'l1', reconciliation: { status: 'approved' } } })
    await expect(brs.toggleMatch('l1', true)).rejects.toThrow('approved')
  })

  it('refuses to delete a GL-backed line', async () => {
    m.queue('finance_bank_reconciliation_lines', { data: { id: 'l1', source_id: 'cb1', reconciliation: { status: 'draft' } } })
    await expect(brs.deleteLine('l1')).rejects.toThrow('Reverse the journal')
  })
})

describe('POS shift GL status', () => {
  it('visa/master are card sub-buckets and are not double counted', () => {
    const t = shiftTenderBreakdown({ cash_sales_total: 100, card_sales_total: 300, visa_sales_total: 200, master_sales_total: 100, qr_sales_total: 50, credit_sales_total: 25 })
    expect(t.total).toBe(475)
  })

  it('classifies posted / unposted / failed shifts', () => {
    const shifts = [
      { id: 's1', status: 'closed', variance: -10 },
      { id: 's2', status: 'closed', variance: 0 },
      { id: 's3', status: 'closed', variance: 0 },
    ]
    const payments = [
      { shift_id: 's1', order_id: 'o1' }, { shift_id: 's1', order_id: 'o1' },
      { shift_id: 's2', order_id: 'o2' }, { shift_id: 's2', order_id: 'o3' },
      { shift_id: 's3', order_id: 'o4' },
    ]
    const movements = [{ id: 'm1', shift_id: 's1', type: 'cash_out', amount: 500 }, { id: 'm2', shift_id: 's1', type: 'cash_drop', amount: 1000 }]
    const legs = [
      { source_type: 'pos_sale', source_id: 'o1', debit_amount: 1000, credit_amount: 0 },
      { source_type: 'pos_shift', source_id: 's1', debit_amount: 10, credit_amount: 0 },
      { source_type: 'pos_payout', source_id: 'm1', debit_amount: 500, credit_amount: 0 },
      { source_type: 'pos_sale', source_id: 'o2', debit_amount: 300, credit_amount: 0 },
    ]
    const failures = [{ id: 'f1', kind: 'sale', ref_id: 'o4', error: 'no ledger', resolved: false }]
    const st = buildShiftGlStatus({ shifts, payments, movements, legs, failures })
    expect(st.get('s1')).toMatchObject({ status: 'posted', orders: 1, payouts: 1, payoutsPosted: 1, variancePosted: true, cashDrops: 1000 })
    expect(st.get('s2')).toMatchObject({ status: 'unposted', ordersUnposted: 1, unpostedOrderIds: ['o3'] })
    expect(st.get('s3')!.status).toBe('failed')
  })

  it('catch-up calls fn_pos_post_unposted_sales and surfaces server refusals', async () => {
    m.queueRpc('fn_pos_post_unposted_sales', { data: { success: true, posted: 3, failed: 1 } })
    expect(await financePosShiftService.postUnpostedSales('2026-10-01')).toEqual({ posted: 3, failed: 1 })
    expect(m.rpcCalls[0]).toEqual({ name: 'fn_pos_post_unposted_sales', args: { p_from: '2026-10-01' } })
    m.queueRpc('fn_pos_post_unposted_sales', { data: { success: false, error: 'Only admin or finance can run this.' } })
    await expect(financePosShiftService.postUnpostedSales()).rejects.toThrow('Only admin or finance')
  })

  it('listShifts filters on local-day bounds and pages', async () => {
    m.queue('pos_shifts', { data: [{ id: 's1' }] })
    await financePosShiftService.listShifts({ dateFrom: '2026-10-01', dateTo: '2026-10-02', status: 'closed' })
    const q = m.on('pos_shifts')[0]
    expect(call(q, 'gte')?.args).toEqual(['opened_at', localDayBoundsIso('2026-10-01')])
    expect(call(q, 'lte')?.args).toEqual(['opened_at', localDayBoundsIso('2026-10-02', true)])
    expect(call(q, 'range')?.args).toEqual([0, 999])
  })
})
