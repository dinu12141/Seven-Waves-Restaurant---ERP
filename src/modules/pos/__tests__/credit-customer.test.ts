import { describe, it, expect, vi } from 'vitest'
import {
  requiresCreditCustomer,
  creditAmountFor,
  canConfirmCredit,
  checkCreditLimit,
  sumOpenBalance,
  customerDisplayName,
  normalizeCustomerSearch,
  isMissingRpcError,
  attachCustomerToOrders,
  probeSetCustomerRpc,
  MISSING_SET_CUSTOMER_RPC_MSG,
} from '../creditCustomer'

describe('POS credit sale — requires a registered customer', () => {
  it('OTHER → CREDIT requires a customer; other methods do not', () => {
    expect(requiresCreditCustomer('other', 'credit', 1000)).toBe(true)
    expect(requiresCreditCustomer('other', 'qr', 1000)).toBe(false)
    expect(requiresCreditCustomer('other', 'bank', 1000)).toBe(false)
    expect(requiresCreditCustomer('cash', '', 1000)).toBe(false)
    expect(requiresCreditCustomer('card', 'visa', 1000)).toBe(false)
    expect(requiresCreditCustomer('split', '', 1000, { cash: 500, card: 500 })).toBe(false)
  })

  it('a split with a credit part requires a customer', () => {
    expect(requiresCreditCustomer('split', '', 1000, { cash: 400, credit: 600 })).toBe(true)
    expect(creditAmountFor('split', '', 1000, { cash: 400, credit: 600 })).toBe(600)
  })

  it('credit amount is the full total for OTHER → CREDIT, 0 otherwise', () => {
    expect(creditAmountFor('other', 'credit', 2500)).toBe(2500)
    expect(creditAmountFor('card', 'visa', 2500)).toBe(0)
  })

  it('confirm is blocked until a customer with an id is chosen', () => {
    expect(canConfirmCredit('other', 'credit', 1000, null)).toBe(false)
    expect(canConfirmCredit('other', 'credit', 1000, { id: '' })).toBe(false)
    expect(canConfirmCredit('other', 'credit', 1000, { id: 'c1' })).toBe(true)
    expect(canConfirmCredit('cash', '', 1000, null)).toBe(true)
  })
})

describe('credit limit check (warn only)', () => {
  it('no limit configured never exceeds', () => {
    const r = checkCreditLimit(0, 99999, 5000)
    expect(r.hasLimit).toBe(false)
    expect(r.exceeds).toBe(false)
    expect(r.projected).toBe(104999)
    expect(checkCreditLimit(null, 0, 1).exceeds).toBe(false)
  })

  it('exceeds when open balance + credit > limit', () => {
    const r = checkCreditLimit('10000', 8000, 2500.5)
    expect(r.exceeds).toBe(true)
    expect(r.overBy).toBe(500.5)
    expect(r.projected).toBe(10500.5)
  })

  it('exactly at the limit is fine', () => {
    expect(checkCreditLimit(10000, 7500, 2500).exceeds).toBe(false)
  })
})

describe('helpers', () => {
  it('sums open receivables only', () => {
    expect(
      sumOpenBalance([
        { total_amount: 1000, paid_amount: 200, status: 'partial' },
        { total_amount: '500', paid_amount: 0, status: 'outstanding' },
        { total_amount: 300, paid_amount: 300, status: 'paid' },
      ]),
    ).toBe(1300)
    expect(sumOpenBalance(null)).toBe(0)
  })

  it('display name falls back sensibly', () => {
    expect(customerDisplayName({ id: '1', full_name: ' Nimal Perera ' })).toBe('Nimal Perera')
    expect(customerDisplayName({ id: '1', first_name: 'Kamal', last_name: null })).toBe('Kamal')
    expect(customerDisplayName({ id: '1', customer_code: 'C-001' })).toBe('C-001')
    expect(customerDisplayName(null)).toBe('')
  })

  it('normalizes pos_search_customers payloads', () => {
    expect(normalizeCustomerSearch({ success: true, data: [{ customer_id: 'a' }, { id: null }] })).toEqual([
      { customer_id: 'a', id: 'a' },
    ])
    expect(normalizeCustomerSearch([{ id: 'b' }])).toHaveLength(1)
    expect(normalizeCustomerSearch({ success: false, error: 'x' })).toEqual([])
    expect(normalizeCustomerSearch(null)).toEqual([])
  })

  it('detects a missing RPC', () => {
    expect(isMissingRpcError({ code: 'PGRST202', message: '' })).toBe(true)
    expect(isMissingRpcError({ message: 'Could not find the function public.fn_pos_set_order_customer' })).toBe(true)
    expect(isMissingRpcError({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isMissingRpcError(null)).toBe(false)
  })
})

describe('attachCustomerToOrders', () => {
  const ok = (extra = {}) => ({ data: { success: true, credit_limit: 5000, open_balance: 1200, ...extra }, error: null })

  it('calls fn_pos_set_order_customer for every order and returns limit/balance', async () => {
    const rpc = vi.fn().mockResolvedValue(ok())
    const r = await attachCustomerToOrders({ rpc }, ['o1', 'o2', null], 'c1')
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith('fn_pos_set_order_customer', { p_order_id: 'o1', p_customer_id: 'c1' })
    expect(rpc).toHaveBeenCalledWith('fn_pos_set_order_customer', { p_order_id: 'o2', p_customer_id: 'c1' })
    expect(r).toEqual({ success: true, creditLimit: 5000, openBalance: 1200 })
  })

  it('stops at the first business failure', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { success: false, error: 'Order is already paid.' }, error: null })
      .mockResolvedValue(ok())
    const r = await attachCustomerToOrders({ rpc }, ['o1', 'o2'], 'c1')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ success: false, error: 'Order is already paid.' })
  })

  it('flags a missing RPC (PGRST202) with the apply-SQL message', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    const r = await attachCustomerToOrders({ rpc }, ['o1'], 'c1')
    expect(r.success).toBe(false)
    expect(r.missingRpc).toBe(true)
    expect(r.error).toBe(MISSING_SET_CUSTOMER_RPC_MSG)
    expect(r.error).toContain('finance_pos_sales_gl_145.sql')
  })

  it('rejects when no customer or no order is given', async () => {
    const rpc = vi.fn()
    expect((await attachCustomerToOrders({ rpc }, ['o1'], '')).success).toBe(false)
    expect((await attachCustomerToOrders({ rpc }, [], 'c1')).success).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('probeSetCustomerRpc', () => {
  it('available when the function answers "Order not found"', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: false, error: 'Order not found.' }, error: null })
    expect(await probeSetCustomerRpc({ rpc })).toEqual({ success: true })
  })

  it('missing function is reported', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
    const r = await probeSetCustomerRpc({ rpc })
    expect(r.success).toBe(false)
    expect(r.missingRpc).toBe(true)
  })

  it('role refusal blocks the sale', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { success: false, error: 'Only cashier, manager or admin can do this.' }, error: null })
    const r = await probeSetCustomerRpc({ rpc })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/Only cashier/)
  })
})
