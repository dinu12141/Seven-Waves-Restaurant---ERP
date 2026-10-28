import { describe, it, expect, vi } from 'vitest'
import {
  isMissingRpcError,
  friendlyReceivableError,
  disburseStaffReceivable,
  disburseEmployeeAdvance,
  postFinalSettlementToFinance,
  type RpcClient,
} from 'src/services/hr/staffReceivableService'
import { buildLoanInsert, lastDayOfMonthOffset } from 'src/services/hr/loanPayload'
import { hrTargetStatus, requiresDisbursement, LOAN_STATUSES } from 'src/services/hr/hrApprovalStatus'

const MISSING = {
  code: 'PGRST202',
  message: 'Could not find the function public.disburse_staff_receivable(...) in the schema cache',
}

function fakeClient(impl: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => impl(fn, args))
  return { client: { rpc } as unknown as RpcClient, rpc }
}

describe('staffReceivableService', () => {
  it('detects a missing RPC (#134b not applied)', () => {
    expect(isMissingRpcError(MISSING)).toBe(true)
    expect(isMissingRpcError({ status: 404 })).toBe(true)
    expect(isMissingRpcError({ code: '42501', message: 'Only Admin, HR or Finance' })).toBe(false)
    expect(isMissingRpcError(null)).toBe(false)
  })

  it('strips trigger error prefixes', () => {
    expect(friendlyReceivableError('NOT_DISBURSED: salary_advances must be disbursed')).toBe(
      'salary_advances must be disbursed',
    )
  })

  it('calls disburse_staff_receivable with the #134b argument names', async () => {
    const { client, rpc } = fakeClient(() => ({ data: { success: true }, error: null }))
    const res = await disburseStaffReceivable(client, 'employee_loan', 'loan-1', 'acc-1')
    expect(res).toMatchObject({ ok: true, missing: false })
    expect(rpc).toHaveBeenCalledWith('disburse_staff_receivable', {
      p_source: 'employee_loan',
      p_source_id: 'loan-1',
      p_cash_bank_account_id: 'acc-1',
    })
  })

  it('degrades gracefully when the RPC is missing', async () => {
    const { client } = fakeClient(() => ({ data: null, error: MISSING }))
    const res = await disburseStaffReceivable(client, 'salary_advance', 'adv-1', 'acc-1')
    expect(res).toMatchObject({ ok: false, missing: true })
  })

  it('reports a server-side rejection as an error, not as missing', async () => {
    const { client } = fakeClient(() => ({
      data: null,
      error: { code: 'P0001', message: 'STAFF_RECEIVABLE_LOCKED: already disbursed' },
    }))
    const res = await disburseStaffReceivable(client, 'salary_advance', 'adv-1', 'acc-1')
    expect(res).toMatchObject({ ok: false, missing: false, error: 'already disbursed' })
  })

  it('treats {success:false} payloads as failures', async () => {
    const { client } = fakeClient(() => ({ data: { success: false, error: 'Insufficient balance' }, error: null }))
    const res = await disburseStaffReceivable(client, 'salary_advance', 'adv-1', 'acc-1')
    expect(res).toMatchObject({ ok: false, missing: false, error: 'Insufficient balance' })
  })

  it('employee advances fall back to the legacy RPC only when #134b is missing', async () => {
    const { client, rpc } = fakeClient((fn) =>
      fn === 'disburse_staff_receivable' ? { data: null, error: MISSING } : { data: { success: true }, error: null },
    )
    const res = await disburseEmployeeAdvance(client, 'adv-1', 'acc-1', 'user-1')
    expect(res.ok).toBe(true)
    expect(rpc).toHaveBeenLastCalledWith('disburse_employee_advance', {
      p_advance_id: 'adv-1',
      p_cash_bank_account_id: 'acc-1',
      p_disbursed_by: 'user-1',
    })

    const second = fakeClient(() => ({ data: { success: true }, error: null }))
    await disburseEmployeeAdvance(second.client, 'adv-1', 'acc-1')
    expect(second.rpc).toHaveBeenCalledTimes(1)
    expect(second.rpc.mock.calls[0][0]).toBe('disburse_staff_receivable')
  })

  it('posts a final settlement with the #134b argument names', async () => {
    const { client, rpc } = fakeClient(() => ({ data: { success: true }, error: null }))
    await postFinalSettlementToFinance(client, 'set-1', 'acc-1')
    expect(rpc).toHaveBeenCalledWith('post_final_settlement_to_finance', {
      p_settlement_id: 'set-1',
      p_cash_bank_account_id: 'acc-1',
    })
  })
})

describe('buildLoanInsert (employee_loans real columns)', () => {
  const branch = { id: 'br-1', company_id: 'co-1' }
  const form = {
    employee_id: 'emp-1',
    loan_amount: 12000,
    total_installments: 12,
    installment_amount: 1000,
    start_date: '2026-10-15',
    reason: 'Medical',
  }

  it('only uses columns that exist on employee_loans', () => {
    const p = buildLoanInsert(form, branch)
    expect(Object.keys(p).sort()).toEqual(
      [
        'branch_id',
        'company_id',
        'employee_id',
        'expected_completion_date',
        'loan_amount',
        'loan_date',
        'monthly_installment',
        'reason',
        'remaining_balance',
        'status',
        'total_paid',
      ].sort(),
    )
    expect(p).toMatchObject({
      loan_amount: 12000,
      monthly_installment: 1000,
      remaining_balance: 12000,
      total_paid: 0,
      status: 'pending',
      loan_date: '2026-10-15',
    })
    expect(p).not.toHaveProperty('remaining_amount')
    expect(p).not.toHaveProperty('installments_paid')
  })

  it('derives the installment and a completion date with one month of slack', () => {
    const p = buildLoanInsert({ ...form, installment_amount: 0 }, branch)
    expect(p.monthly_installment).toBe(1000)
    // 12 installments from Oct 2026 → last one Sep 2027, +1 month slack → 2027-10-31
    expect(p.expected_completion_date).toBe('2027-10-31')
  })

  it('validates input', () => {
    expect(() => buildLoanInsert({ ...form, loan_amount: 0 }, branch)).toThrow()
    expect(() => buildLoanInsert({ ...form, total_installments: 0 }, branch)).toThrow()
    expect(() => buildLoanInsert({ ...form, employee_id: null }, branch)).toThrow()
    expect(() => buildLoanInsert(form, null)).toThrow()
  })

  it('computes month ends correctly', () => {
    expect(lastDayOfMonthOffset('2026-01-31', 1)).toBe('2026-02-28')
    expect(lastDayOfMonthOffset('2028-02-10', 0)).toBe('2028-02-29')
  })
})

describe('hrTargetStatus', () => {
  it('never writes a status outside chk_loan_status for loans', () => {
    for (const action of ['approved', 'rejected'] as const) {
      expect(LOAN_STATUSES).toContain(hrTargetStatus('loans', action))
    }
    expect(hrTargetStatus('loans', 'approved')).toBe('active')
    expect(hrTargetStatus('loans', 'rejected')).toBe('cancelled')
    expect(hrTargetStatus('leaves', 'approved')).toBe('approved')
  })

  it('requires disbursement to approve advances and loans', () => {
    expect(requiresDisbursement('advances', 'approved')).toBe(true)
    expect(requiresDisbursement('loans', 'approved')).toBe(true)
    expect(requiresDisbursement('loans', 'rejected')).toBe(false)
    expect(requiresDisbursement('expenses', 'approved')).toBe(false)
  })
})
