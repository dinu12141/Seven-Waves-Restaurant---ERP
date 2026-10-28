// ═══════════════════════════════════════════════════════════════════════════════
// Finance Voucher service — balance-writing regression tests (#134c)
// Live bug: a 17,740 pay voucher moved its expense ledger by 53,220 (3×) because
// the client added +2×amount on top of the RPC's own +amount.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, calls } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})
const audit = vi.hoisted(() => vi.fn())
vi.mock('src/modules/finance/services/finance-ledger.service', () => ({ logFinanceAudit: audit }))
const authMock = vi.hoisted(() => ({ userRole: 'finance_manager' as string | null, profile: { role: 'finance_manager' } }))
vi.mock('src/stores/auth', () => ({ useAuthStore: () => authMock }))

import {
  financeVoucherService,
  voucherLegacyCancelDeltas,
} from 'src/modules/finance/services/finance-voucher.service'

let m: ReturnType<typeof createSupabaseMock>
beforeEach(() => {
  m = sb.mock
  m.reset()
  audit.mockReset()
  authMock.userRole = 'finance_manager'
  authMock.profile.role = 'finance_manager'
})

const AMT = 17740

function voucher(over: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    voucher_no: 'PV-1',
    voucher_type: 'pay',
    status: 'approved',
    amount: AMT,
    ledger_id: 'exp-ledger',
    account_id: 'cash-acc',
    bank_id: null,
    lines: [],
    ...over,
  }
}

/** Every `current_balance` written to `table`, as [id, value]. */
function balanceWrites(table: string) {
  return m
    .on(table)
    .filter((q) => calls(q, 'update').length > 0)
    .map((q) => {
      const upd = calls(q, 'update')[0].args[0] as { current_balance: number }
      const eq = calls(q, 'eq').find((c) => c.args[0] === 'id')
      return [eq?.args[1], upd.current_balance]
    })
}

describe('postVoucher', () => {
  it('applies NO balance deltas when the RPC reports ledger_v3 (#134c)', async () => {
    m.queue('finance_vouchers', { data: voucher() }, { data: voucher({ status: 'posted' }) })
    m.queueRpc('post_finance_voucher', { data: { success: true, ledger_v3: true, double_entry_v2: true } })

    await financeVoucherService.postVoucher('v1')

    expect(m.on('finance_ledgers')).toHaveLength(0)
    expect(m.on('finance_accounts')).toHaveLength(0)
    expect(m.rpcCalls.map((c) => c.name)).toEqual(['post_finance_voucher'])
    expect(audit).toHaveBeenCalledWith('voucher_posted', 'finance_voucher', 'v1', expect.anything(), expect.anything())
  })

  it('never re-applies the header amount against a legacy RPC (the 3× bug)', async () => {
    m.queue('finance_vouchers', { data: voucher() }, { data: voucher({ status: 'posted' }) })
    m.queueRpc('post_finance_voucher', { data: { success: true } }) // legacy: no flags

    await financeVoucherService.postVoucher('v1')

    expect(balanceWrites('finance_ledgers')).toEqual([])
    expect(balanceWrites('finance_accounts')).toEqual([])
  })

  it('legacy RPC: applies only voucher-line deltas (the old RPC ignored lines)', async () => {
    const lines = [
      { ledger_id: 'L-a', debit_amount: 500, credit_amount: 0 },
      { ledger_id: 'L-b', debit_amount: 0, credit_amount: 500 },
    ]
    m.queue('finance_vouchers', { data: voucher({ lines }) }, { data: voucher({ status: 'posted', lines }) })
    m.queueRpc('post_finance_voucher', { data: { success: true } })
    m.queue('finance_ledgers', { data: { current_balance: 100 } }, {}, { data: { current_balance: 0 } }, {})

    await financeVoucherService.postVoucher('v1')

    expect(balanceWrites('finance_ledgers')).toEqual([
      ['L-a', 600],
      ['L-b', -500],
    ])
    expect(m.on('finance_accounts')).toHaveLength(0)
  })

  it('does nothing extra when the voucher was already posted', async () => {
    m.queue('finance_vouchers', { data: voucher({ status: 'posted' }) }, { data: voucher({ status: 'posted' }) })
    m.queueRpc('post_finance_voucher', { data: { success: true, already_posted: true } })

    await financeVoucherService.postVoucher('v1')

    expect(m.on('finance_ledgers')).toHaveLength(0)
    expect(audit).not.toHaveBeenCalled()
  })

  it('throws the RPC error and writes nothing', async () => {
    m.queue('finance_vouchers', { data: voucher() })
    m.queueRpc('post_finance_voucher', { data: { success: false, error: 'LEDGER_MISSING: x' } })

    await expect(financeVoucherService.postVoucher('v1')).rejects.toThrow('LEDGER_MISSING')
    expect(m.on('finance_ledgers')).toHaveLength(0)
    expect(m.on('finance_accounts')).toHaveLength(0)
  })

  it('rejects postVoucher if voucher is in draft/unapproved status (#135)', async () => {
    m.queue('finance_vouchers', { data: voucher({ status: 'draft' }) })

    await expect(financeVoucherService.postVoucher('v1')).rejects.toThrow(
      "Cannot post voucher in 'draft' status. Voucher must be approved first"
    )
    expect(m.rpcCalls).toHaveLength(0)
  })

  it('rejects postVoucher when user has an unauthorized role (#135)', async () => {
    authMock.userRole = 'cashier'
    authMock.profile.role = 'cashier'

    await expect(financeVoucherService.postVoucher('v1')).rejects.toThrow(
      'Unauthorized: Only finance or admin users can post vouchers.'
    )
    expect(m.rpcCalls).toHaveLength(0)
  })

  it('rejects cancelVoucher when user has an unauthorized role (#135)', async () => {
    authMock.userRole = 'waiter'
    authMock.profile.role = 'waiter'

    await expect(financeVoucherService.cancelVoucher('v1', 'test')).rejects.toThrow(
      'Unauthorized: Only finance or admin users can cancel vouchers.'
    )
    expect(m.rpcCalls).toHaveLength(0)
  })
})

describe('cancelVoucher', () => {
  it('applies NO balance deltas when the RPC reports reversal_v3 (#134c)', async () => {
    m.queue('finance_vouchers', { data: voucher({ status: 'posted' }) }, { data: voucher({ status: 'cancelled' }) })
    m.queueRpc('cancel_finance_voucher', { data: { success: true, reversal_v3: true } })

    await financeVoucherService.cancelVoucher('v1', 'dup')

    expect(m.on('finance_ledgers')).toHaveLength(0)
    expect(m.on('finance_accounts')).toHaveLength(0)
    expect(audit).toHaveBeenCalledWith('voucher_cancelled', 'finance_voucher', 'v1', expect.anything(), expect.objectContaining({ cancel_reason: 'dup' }))
  })

  it('legacy #98 RPC, pay voucher: completes the exact mirror of the post', async () => {
    m.queue('finance_vouchers', { data: voucher({ status: 'posted' }) }, { data: voucher({ status: 'cancelled' }) })
    m.queueRpc('cancel_finance_voucher', { data: { success: true } })
    // category ledger read/write, cash ledger read/write
    m.queue('finance_ledgers', { data: { current_balance: 2 * AMT } }, {}, { data: { current_balance: -AMT } }, {})
    // category-linked accounts list, cash account lookup, cash account read/write
    m.queue('finance_accounts', { data: [] }, { data: { id: 'cash-acc', ledger_id: 'cash-ledger' } }, { data: { current_balance: -AMT } }, {})

    await financeVoucherService.cancelVoucher('v1', null)

    // post +AMT, #98 cancel +AMT → client −2×AMT → net 0
    expect(balanceWrites('finance_ledgers')).toEqual([
      ['exp-ledger', 0],
      ['cash-ledger', 0],
    ])
    expect(balanceWrites('finance_accounts')).toEqual([['cash-acc', 0]])
  })

  it('legacy #98 RPC, received voucher: leaves the category ledger to the RPC', async () => {
    const rv = voucher({ voucher_type: 'received', status: 'posted' })
    m.queue('finance_vouchers', { data: rv }, { data: { ...rv, status: 'cancelled' } })
    m.queueRpc('cancel_finance_voucher', { data: { success: true } })
    m.queue('finance_ledgers', { data: { current_balance: AMT } }, {})
    m.queue('finance_accounts', { data: [] }, { data: { id: 'cash-acc', ledger_id: 'cash-ledger' } }, { data: { current_balance: AMT } }, {})

    await financeVoucherService.cancelVoucher('v1', null)

    expect(balanceWrites('finance_ledgers')).toEqual([['cash-ledger', 0]])
    expect(balanceWrites('finance_accounts')).toEqual([['cash-acc', 0]])
  })

  it('a draft voucher cancel never touches balances', async () => {
    m.queue('finance_vouchers', { data: voucher({ status: 'draft' }) }, { data: voucher({ status: 'cancelled' }) })
    m.queueRpc('cancel_finance_voucher', { data: { success: true } })

    await financeVoucherService.cancelVoucher('v1', null)

    expect(m.on('finance_ledgers')).toHaveLength(0)
    expect(m.on('finance_accounts')).toHaveLength(0)
  })

  it('surfaces a failed balance write instead of swallowing it', async () => {
    m.queue('finance_vouchers', { data: voucher({ status: 'posted' }) })
    m.queueRpc('cancel_finance_voucher', { data: { success: true } })
    m.queue('finance_ledgers', { error: { message: 'rls denied' } })

    await expect(financeVoucherService.cancelVoucher('v1', null)).rejects.toMatchObject({ message: 'rls denied' })
  })
})

describe('voucherLegacyCancelDeltas', () => {
  it('pay: undoes #127 post (+cat, −cash) given #98 already added +amt to the category ledger', () => {
    expect(voucherLegacyCancelDeltas('pay', 100)).toEqual({
      categoryLedger: -200,
      categoryAccounts: -100,
      cashAccount: 100,
      cashLedger: 100,
    })
  })

  it('received: #98 already applied −amt to the category ledger', () => {
    expect(voucherLegacyCancelDeltas('received', '100')).toEqual({
      categoryLedger: 0,
      categoryAccounts: -100,
      cashAccount: -100,
      cashLedger: -100,
    })
  })
})

describe('dead code removed', () => {
  it('has no client ledger-balance helpers with the old sign', () => {
    expect((financeVoucherService as any)._updateLedgerBalance).toBeUndefined()
    expect((financeVoucherService as any)._reverseLedgerBalance).toBeUndefined()
  })
})
