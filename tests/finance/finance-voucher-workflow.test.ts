// ═══════════════════════════════════════════════════════════════════════════════
// Finance Voucher workflow — draft → submitted → approved → posted, validation,
// role rules (server: admin / finance only) and segregation of duties.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, calls } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any, userId: 'u-approver' as string | null }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  const client = sb.mock.client as any
  client.auth = { getUser: async () => ({ data: { user: sb.userId ? { id: sb.userId } : null } }) }
  return { supabase: client }
})
const audit = vi.hoisted(() => vi.fn())
vi.mock('src/modules/finance/services/finance-ledger.service', () => ({ logFinanceAudit: audit }))
const authMock = vi.hoisted(() => ({
  roles: ['finance'] as string[],
  userRole: null as string | null,
  profile: { role: 'cashier' } as Record<string, unknown>,
  user: { id: 'u-approver' },
  currentBranch: { id: 'b1', company_id: 'c1' },
}))
vi.mock('src/stores/auth', () => ({ useAuthStore: () => authMock }))

import {
  financeVoucherService,
  validateVoucherDraft,
  narrationWithCheque,
  currentRoles,
  canWriteVouchers,
  localToday,
} from 'src/modules/finance/services/finance-voucher.service'

let m: ReturnType<typeof createSupabaseMock>
beforeEach(() => {
  m = sb.mock
  m.reset()
  audit.mockReset()
  sb.userId = 'u-approver'
  authMock.roles = ['finance']
  authMock.profile = { role: 'cashier' }
})

const base = {
  voucher_type: 'pay',
  voucher_date: '2026-10-28',
  pay_to: 'Janith',
  amount: 17740,
  payment_method: 'cash',
  ledger_id: 'iou-ledger',
  account_id: 'main-cash-acc',
  lines: [],
}

function voucher(over: Record<string, unknown> = {}) {
  return { id: 'v1', voucher_no: 'PV-000036', voucher_type: 'pay', status: 'submitted', amount: 17740, created_by: 'u-maker', lines: [], ...over }
}

describe('validateVoucherDraft', () => {
  it('accepts a complete pay voucher', () => {
    expect(validateVoucherDraft(base, { id: 'main-cash-acc', ledger_id: 'main-cash-ledger' })).toEqual([])
  })

  it('rejects zero / negative / missing amounts', () => {
    for (const amount of [0, -5, null, '', 'abc']) {
      expect(validateVoucherDraft({ ...base, amount })).toContain('Amount must be greater than 0.')
    }
  })

  it('requires ledger, account and payee', () => {
    const errs = validateVoucherDraft({ ...base, ledger_id: null, account_id: '', pay_to: ' ' })
    expect(errs).toEqual(expect.arrayContaining(['Category ledger is required.', 'Cash / bank account is required.', 'Pay To is required.']))
    expect(validateVoucherDraft({ ...base, voucher_type: 'received', received_from: '' })).toContain('Received From is required.')
  })

  it('rejects a category ledger equal to the cash / bank ledger', () => {
    expect(validateVoucherDraft({ ...base, ledger_id: 'main-cash-ledger' }, { id: 'main-cash-acc', ledger_id: 'main-cash-ledger' })).toContain(
      'The category ledger cannot be the same ledger as the cash / bank account.',
    )
  })

  it('rejects an account without a linked ledger (the RPC would raise ACCOUNT_MISSING)', () => {
    expect(validateVoucherDraft(base, { id: 'main-cash-acc', ledger_id: null })[0]).toMatch(/no linked ledger/)
  })

  it('requires balanced voucher lines with one side each', () => {
    const unbalanced = { ...base, lines: [{ ledger_id: 'a', debit_amount: 100, credit_amount: 0 }, { ledger_id: 'b', debit_amount: 0, credit_amount: 90 }] }
    expect(validateVoucherDraft(unbalanced).join(' ')).toMatch(/not balanced/)
    const both = { ...base, lines: [{ ledger_id: 'a', debit_amount: 10, credit_amount: 10 }] }
    expect(validateVoucherDraft(both)).toContain('Each voucher line needs either a debit or a credit amount.')
  })

  it('requires a cheque number for cheque vouchers', () => {
    expect(validateVoucherDraft({ ...base, payment_method: 'cheque', cheque_no: '' })).toContain('Cheque No is required for cheque vouchers.')
  })
})

describe('helpers', () => {
  it('keeps the typed cheque number in the narration', () => {
    expect(narrationWithCheque({ payment_method: 'cheque', cheque_no: '004512', cheque_date: '2026-11-01', narration: 'Rent' })).toBe(
      'Rent | Cheque No 004512 dated 2026-11-01',
    )
    expect(narrationWithCheque({ payment_method: 'cash', cheque_no: '1', narration: '' })).toBeNull()
  })

  it('uses every role of a multi-role user, not only profile.role', () => {
    expect(currentRoles({ roles: ['cashier', 'finance'], profile: { role: 'cashier' } })).toEqual(['cashier', 'finance'])
    expect(canWriteVouchers({ roles: ['cashier', 'finance'] })).toBe(true)
    expect(canWriteVouchers({ roles: ['manager'] })).toBe(false) // DB RLS denies managers
    expect(canWriteVouchers({ roles: [] })).toBe(false)
  })

  it('localToday is the local calendar date', () => {
    expect(localToday(new Date(2026, 0, 5, 1, 0))).toBe('2026-01-05')
  })
})

describe('workflow', () => {
  it('create validates against the live account before allocating a number', async () => {
    m.queue('finance_accounts', { data: { id: 'main-cash-acc', ledger_id: 'iou-ledger' } })
    await expect(financeVoucherService.createPayVoucher(base)).rejects.toThrow(/same ledger/)
    expect(m.rpcCalls).toHaveLength(0)
    expect(m.on('finance_vouchers')).toHaveLength(0)
  })

  it('create inserts a draft and rolls the header back when lines fail', async () => {
    const lines = [{ ledger_id: 'a', debit_amount: 5, credit_amount: 0 }, { ledger_id: 'b', debit_amount: 0, credit_amount: 5 }]
    m.queue('finance_accounts', { data: { id: 'main-cash-acc', ledger_id: 'main-cash-ledger' } })
    m.queueRpc('next_voucher_no', { data: 'PV-000040' })
    m.queue('finance_vouchers', { data: { id: 'new', voucher_no: 'PV-000040' } })
    m.queue('finance_voucher_lines', { error: { message: 'lines denied' } })

    await expect(financeVoucherService.createPayVoucher({ ...base, lines })).rejects.toMatchObject({ message: 'lines denied' })
    const [ins, del] = m.on('finance_vouchers')
    expect((calls(ins, 'insert')[0].args[0] as any).status).toBe('draft')
    expect(calls(del, 'delete')).toHaveLength(1)
  })

  it('submit only from draft', async () => {
    m.queue('finance_vouchers', { data: voucher({ status: 'approved' }) })
    await expect(financeVoucherService.submitVoucher('v1')).rejects.toThrow(/Only draft vouchers can be submitted/)
  })

  it('cannot approve straight from draft', async () => {
    m.queue('finance_vouchers', { data: voucher({ status: 'draft' }) })
    await expect(financeVoucherService.approveVoucher('v1')).rejects.toThrow(/only submitted vouchers can be approved/)
    expect(m.rpcCalls).toHaveLength(0)
  })

  it('creator (non-admin) cannot approve their own voucher', async () => {
    m.queue('finance_vouchers', { data: voucher({ created_by: 'u-approver' }) })
    await expect(financeVoucherService.approveVoucher('v1')).rejects.toThrow('Creator cannot approve their own voucher')
  })

  it('a manager-only user is refused (server allows admin / finance only)', async () => {
    authMock.roles = ['manager']
    await expect(financeVoucherService.approveVoucher('v1')).rejects.toThrow(/Only finance or admin users can approve/)
  })

  it('approve then post through the RPC; a failed post reports the approval', async () => {
    m.queue('finance_vouchers', { data: voucher() }, { data: voucher({ status: 'approved' }) }, { data: voucher({ status: 'approved' }) })
    m.queueRpc('post_finance_voucher', { data: { success: false, error: 'LEDGER_MISSING: PV-000036' } })

    await expect(financeVoucherService.approveVoucher('v1')).rejects.toMatchObject({
      approved: true,
      message: expect.stringContaining('was approved but posting failed: LEDGER_MISSING'),
    })
    const upd = m.on('finance_vouchers').find((q) => calls(q, 'update').length)!
    expect((calls(upd, 'update')[0].args[0] as any).status).toBe('approved')
    expect(calls(upd, 'eq')).toEqual(expect.arrayContaining([expect.objectContaining({ args: ['status', 'submitted'] })]))
    expect(m.on('finance_ledgers')).toHaveLength(0)
  })

  it('reject needs a reason and an unposted voucher', async () => {
    await expect(financeVoucherService.rejectVoucher('v1', '  ')).rejects.toThrow(/reason is required/)
    m.queue('finance_vouchers', { data: voucher({ status: 'posted' }) })
    await expect(financeVoucherService.rejectVoucher('v1', 'dup')).rejects.toThrow(/Only submitted or approved/)
  })

  it('edit refuses posted vouchers', async () => {
    m.queue('finance_vouchers', { data: voucher({ status: 'posted' }) })
    await expect(financeVoucherService.updateVoucher('v1', { amount: 1 })).rejects.toThrow('Only draft or rejected vouchers can be edited')
  })
})
