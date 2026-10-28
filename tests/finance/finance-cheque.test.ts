// ═══════════════════════════════════════════════════════════════════════════════
// Finance Cheque service + store — behavioural tests against a mocked client
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createSupabaseMock, call, calls } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})
const audit = vi.hoisted(() => vi.fn())
vi.mock('src/modules/finance/services/finance-ledger.service', () => ({ logFinanceAudit: audit }))

import { financeChequeService } from 'src/modules/finance/services/finance-cheque.service'
import { useFinanceChequeStore } from 'src/modules/finance/stores/finance-cheque.store'

let m: ReturnType<typeof createSupabaseMock>
beforeEach(() => {
  m = sb.mock
  m.reset()
  audit.mockReset()
  setActivePinia(createPinia())
})

describe('financeChequeService.listPlanned', () => {
  it('only returns planned cheques, oldest date first', async () => {
    m.queue('finance_cheques', { data: [{ id: 'c1' }] })
    const rows = await financeChequeService.listPlanned()
    const q = m.on('finance_cheques')[0]
    expect(rows).toEqual([{ id: 'c1' }])
    expect(call(q, 'eq')?.args).toEqual(['status', 'planned'])
    expect(call(q, 'order')?.args).toEqual(['cheque_date', { ascending: true }])
    expect(calls(q, 'eq')).toHaveLength(1)
  })

  it('filters by bank account when given', async () => {
    await financeChequeService.listPlanned('bank-1')
    const q = m.on('finance_cheques')[0]
    expect(calls(q, 'eq').map((c) => c.args)).toContainEqual(['bank_account_id', 'bank-1'])
  })

  it('returns [] when data is null and throws on error', async () => {
    expect(await financeChequeService.listPlanned()).toEqual([])
    m.queue('finance_cheques', { error: { message: 'rls denied' } })
    await expect(financeChequeService.listPlanned()).rejects.toMatchObject({ message: 'rls denied' })
  })
})

describe('financeChequeService.create', () => {
  it('normalises the payload, defaults status to planned and audits', async () => {
    m.queue('finance_cheques', { data: { id: 'new-1' } })
    const created = await financeChequeService.create({
      bank_account_id: 'bank-1',
      cheque_no: '  000123 ',
      cheque_date: '2026-11-01',
      amount: '1500.50',
      issued_to: '  Acme Foods ',
    })
    const payload = call(m.on('finance_cheques')[0], 'insert')?.args[0] as any
    expect(created).toEqual({ id: 'new-1' })
    expect(payload).toMatchObject({
      bank_account_id: 'bank-1',
      cheque_no: '000123',
      cheque_date: '2026-11-01',
      amount: 1500.5,
      issued_to: 'Acme Foods',
      status: 'planned',
      company_id: null,
      branch_id: null,
    })
    expect(audit).toHaveBeenCalledWith('cheque_created', 'finance_cheque', 'new-1', null, { id: 'new-1' })
  })

  it('throws and does not audit when the insert fails (e.g. duplicate cheque no)', async () => {
    m.queue('finance_cheques', { error: { message: 'duplicate key value' } })
    await expect(
      financeChequeService.create({ bank_account_id: 'b', cheque_no: '1', amount: 10 }),
    ).rejects.toMatchObject({ message: 'duplicate key value' })
    expect(audit).not.toHaveBeenCalled()
  })

  // Known gaps (QA finding): create() does no client-side validation, so these
  // reach the DB as-is. Pinned here so a future validation fix flips them.
  it('KNOWN GAP: missing cheque_no is sent as the string "undefined"', async () => {
    m.queue('finance_cheques', { data: { id: 'x' } })
    await financeChequeService.create({ bank_account_id: 'b', amount: 10 })
    expect((call(m.on('finance_cheques')[0], 'insert')?.args[0] as any).cheque_no).toBe('undefined')
  })

  it('KNOWN GAP: non-positive / non-numeric amounts are not rejected', async () => {
    m.queue('finance_cheques', { data: { id: 'x' } }, { data: { id: 'y' } })
    await financeChequeService.create({ bank_account_id: 'b', cheque_no: '1', amount: -50 })
    await financeChequeService.create({ bank_account_id: 'b', cheque_no: '2', amount: 'abc' })
    const [a, b] = m.on('finance_cheques').map((q) => (call(q, 'insert')?.args[0] as any).amount)
    expect(a).toBe(-50)
    expect(b).toBeNaN()
  })
})

describe('financeChequeService.updateStatus', () => {
  it('requires a reason to cancel, before touching the row', async () => {
    m.queue('finance_cheques', { data: { id: 'c1', status: 'planned' } })
    await expect(financeChequeService.cancel('c1', '')).rejects.toThrow('Cancellation reason is required')
    expect(m.on('finance_cheques').some((q) => call(q, 'update'))).toBe(false)
  })

  it('stamps cleared_date when clearing and audits old→new', async () => {
    m.queue('finance_cheques', { data: { id: 'c1', status: 'issued' } }, { data: { id: 'c1', status: 'cleared' } })
    await financeChequeService.markCleared('c1', '2026-10-20')
    const upd = call(m.on('finance_cheques')[1], 'update')?.args[0] as any
    expect(upd).toMatchObject({ status: 'cleared', cleared_date: '2026-10-20' })
    expect(upd).not.toHaveProperty('cancelled_reason')
    expect(audit).toHaveBeenCalledWith(
      'cheque_cleared', 'finance_cheque', 'c1',
      { id: 'c1', status: 'issued' }, { id: 'c1', status: 'cleared' },
    )
  })
})

describe('financeChequeService.markBounced', () => {
  it('goes through the mark_cheque_bounced RPC, not a plain status update', async () => {
    m.queueRpc('mark_cheque_bounced', { data: { success: true } })
    m.queue('finance_cheques', { data: { id: 'c1', status: 'bounced' } })
    const row = await financeChequeService.markBounced('c1', 'NSF')
    expect(m.rpcCalls).toEqual([{ name: 'mark_cheque_bounced', args: { p_cheque_id: 'c1', p_reason: 'NSF' } }])
    expect(m.on('finance_cheques').some((q) => call(q, 'update'))).toBe(false)
    expect(row).toEqual({ id: 'c1', status: 'bounced' })
  })

  it('surfaces RPC-level failures', async () => {
    m.queueRpc('mark_cheque_bounced', { data: { success: false, error: 'Cheque not issued' } })
    await expect(financeChequeService.markBounced('c1')).rejects.toThrow('Cheque not issued')
    m.queueRpc('mark_cheque_bounced', { error: { message: 'permission denied' } })
    await expect(financeChequeService.markBounced('c1')).rejects.toMatchObject({ message: 'permission denied' })
  })
})

describe('useFinanceChequeStore', () => {
  it('createCheque prepends the new cheque and resets loading', async () => {
    const store = useFinanceChequeStore()
    store.cheques = [{ id: 'old' }] as any
    m.queue('finance_cheques', { data: { id: 'new' } })
    await store.createCheque({ bank_account_id: 'b', cheque_no: '9', amount: 1 })
    expect(store.cheques.map((c: any) => c.id)).toEqual(['new', 'old'])
    expect(store.loading).toBe(false)
  })

  it('createCheque records the error, rethrows and resets loading', async () => {
    const store = useFinanceChequeStore()
    m.queue('finance_cheques', { error: { message: 'boom' } })
    await expect(store.createCheque({ bank_account_id: 'b', cheque_no: '9', amount: 1 })).rejects.toBeTruthy()
    expect(store.error).toBe('boom')
    expect(store.loading).toBe(false)
    expect(store.cheques).toEqual([])
  })

  it('markBounced merges the refreshed row into the list', async () => {
    const store = useFinanceChequeStore()
    store.cheques = [{ id: 'c1', status: 'issued', amount: 5 }] as any
    m.queueRpc('mark_cheque_bounced', { data: { success: true } })
    m.queue('finance_cheques', { data: { id: 'c1', status: 'bounced' } })
    await store.markBounced('c1', 'NSF')
    expect(store.cheques[0]).toEqual({ id: 'c1', status: 'bounced', amount: 5 })
  })

  it('fetchPlannedCheques delegates without mutating the main list', async () => {
    const store = useFinanceChequeStore()
    m.queue('finance_cheques', { data: [{ id: 'p1' }] })
    expect(await store.fetchPlannedCheques('bank-1')).toEqual([{ id: 'p1' }])
    expect(store.cheques).toEqual([])
  })
})
