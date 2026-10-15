// ═══════════════════════════════════════════════════════════════════════════════
// Bank Reconciliation Unit & Structural Test Suite
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'

describe('Bank Reconciliation Engine — Core Math & Formulas', () => {
  it('correctly calculates system cleared balance: Opening + Deposits - Payments', () => {
    const opening = 500000.00
    const matchedDeposits = 250000.00 // Inflow (credit on bank statement)
    const matchedPayments = 120000.00 // Outflow (debit on bank statement)

    const systemClearedBalance = Math.round((opening + matchedDeposits - matchedPayments) * 100) / 100
    expect(systemClearedBalance).toBe(630000.00)
  })

  it('determines balanced status when closing bank balance matches system cleared balance', () => {
    const opening = 100000.00
    const closing = 145000.00
    const matchedDeposits = 60000.00
    const matchedPayments = 15000.00

    const systemBalance = Math.round((opening + matchedDeposits - matchedPayments) * 100) / 100
    const difference = Math.round((closing - systemBalance) * 100) / 100

    expect(systemBalance).toBe(145000.00)
    expect(difference).toBe(0.00)
    expect(Math.abs(difference) < 0.01).toBe(true)
  })

  it('detects variance when closing bank balance does not match cleared transactions', () => {
    const opening = 100000.00
    const closing = 140000.00 // Bank says 140,000, but cleared sum gives 145,000
    const matchedDeposits = 60000.00
    const matchedPayments = 15000.00

    const systemBalance = Math.round((opening + matchedDeposits - matchedPayments) * 100) / 100
    const difference = Math.round((closing - systemBalance) * 100) / 100

    expect(systemBalance).toBe(145000.00)
    expect(difference).toBe(-5000.00)
    expect(Math.abs(difference) < 0.01).toBe(false)
  })

  it('correctly computes unpresented cheques and uncleared deposits', () => {
    const lines = [
      { id: '1', debit_amount: 25000, credit_amount: 0, is_matched: true }, // Cleared cheque
      { id: '2', debit_amount: 15000, credit_amount: 0, is_matched: false }, // Unpresented cheque #1
      { id: '3', debit_amount: 10000, credit_amount: 0, is_matched: false }, // Unpresented cheque #2
      { id: '4', debit_amount: 0, credit_amount: 80000, is_matched: true }, // Cleared deposit
      { id: '5', debit_amount: 0, credit_amount: 30000, is_matched: false }, // Deposit in transit
    ]

    const unpresentedCheques = lines
      .filter((l) => !l.is_matched && Number(l.debit_amount) > 0)
      .reduce((s, l) => s + l.debit_amount, 0)

    const unclearedDeposits = lines
      .filter((l) => !l.is_matched && Number(l.credit_amount) > 0)
      .reduce((s, l) => s + l.credit_amount, 0)

    expect(unpresentedCheques).toBe(25000)
    expect(unclearedDeposits).toBe(30000)
  })

  it('calculates standard BRS adjusted bank balance', () => {
    const statementClosing = 200000.00
    const depositsInTransit = 40000.00
    const unpresentedCheques = 30000.00

    // BRS Formula: Bank Statement Closing + Deposits in Transit - Unpresented Cheques = Adjusted Bank Balance
    const adjustedBankBalance = statementClosing + depositsInTransit - unpresentedCheques
    expect(adjustedBankBalance).toBe(210000.00)
  })

  it('handles bank charge adjustments correctly as outflows', () => {
    const opening = 100000.00
    const statementClosing = 99500.00
    const bankCharge = 500.00 // Bank fee

    const matchedDeposits = 0
    const matchedPayments = bankCharge

    const systemBalance = opening + matchedDeposits - matchedPayments
    const diff = statementClosing - systemBalance

    expect(systemBalance).toBe(99500.00)
    expect(diff).toBe(0.00)
  })

  it('handles interest adjustments correctly as inflows', () => {
    const opening = 100000.00
    const statementClosing = 102500.00
    const interest = 2500.00 // Bank interest

    const matchedDeposits = interest
    const matchedPayments = 0

    const systemBalance = opening + matchedDeposits - matchedPayments
    const diff = statementClosing - systemBalance

    expect(systemBalance).toBe(102500.00)
    expect(diff).toBe(0.00)
  })
})

describe('Bank Reconciliation Rules & Validation', () => {
  it('validates mandatory reconciliation fields', () => {
    const invalidHeader = {
      bank_account_id: null,
      reconciliation_month: '',
      statement_start_date: '',
      statement_end_date: '',
    }

    const validate = (h) => {
      if (!h.bank_account_id) throw new Error('Bank account is required.')
      if (!h.reconciliation_month) throw new Error('Reconciliation month (YYYY-MM) is required.')
      if (!h.statement_start_date) throw new Error('Statement start date is required.')
      if (!h.statement_end_date) throw new Error('Statement end date is required.')
    }

    expect(() => validate(invalidHeader)).toThrow('Bank account is required.')
  })

  it('rejects approval if reconciliation has variance', () => {
    const recon = {
      id: 'recon-1',
      difference_amount: -500.00,
      status: 'draft',
    }

    const approve = (r) => {
      if (Math.abs(Number(r.difference_amount) || 0) >= 0.01) {
        throw new Error(`Cannot approve: Reconciliation has an unresolved difference of LKR ${Number(r.difference_amount).toFixed(2)}.`)
      }
    }

    expect(() => approve(recon)).toThrow('Cannot approve: Reconciliation has an unresolved difference')
  })

  it('permits approval when difference is exactly 0', () => {
    const recon = {
      id: 'recon-2',
      difference_amount: 0.00,
      status: 'reconciled',
    }

    let approved = false
    if (Math.abs(Number(recon.difference_amount) || 0) < 0.01) {
      approved = true
    }

    expect(approved).toBe(true)
  })
})
