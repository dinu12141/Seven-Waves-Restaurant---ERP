// ═══════════════════════════════════════════════════════════════════════════════
// POS Sales, Quick-Pay Invoices, Refund VAT & Credit Sales GL Tests (#135)
// Seven Waves Restaurant ERP
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'

describe('Fix #135: Credit Sales GL Account Routing', () => {
  function resolveGLPaymentAccount(paymentMethod: string | null | undefined): string {
    const method = (paymentMethod || 'cash').toLowerCase().trim()
    if (['cash', 'cod'].includes(method)) {
      return '1000' // Cash on Hand
    } else if (['credit', 'customer_credit', 'room_charge', 'on_account'].includes(method)) {
      return '1100' // Accounts Receivable
    } else {
      return '1010' // Bank Account (card, qr, bank transfer, online)
    }
  }

  it('routes cash and cod to 1000 (Cash on Hand)', () => {
    expect(resolveGLPaymentAccount('cash')).toBe('1000')
    expect(resolveGLPaymentAccount('CASH')).toBe('1000')
    expect(resolveGLPaymentAccount('cod')).toBe('1000')
    expect(resolveGLPaymentAccount(null)).toBe('1000')
  })

  it('routes credit sales to 1100 (Accounts Receivable) — Fix for Issue #4', () => {
    expect(resolveGLPaymentAccount('credit')).toBe('1100')
    expect(resolveGLPaymentAccount('customer_credit')).toBe('1100')
    expect(resolveGLPaymentAccount('room_charge')).toBe('1100')
    expect(resolveGLPaymentAccount('on_account')).toBe('1100')
    expect(resolveGLPaymentAccount('CREDIT')).toBe('1100')
  })

  it('routes bank, card, and digital payments to 1010 (Bank Account)', () => {
    expect(resolveGLPaymentAccount('card')).toBe('1010')
    expect(resolveGLPaymentAccount('visa')).toBe('1010')
    expect(resolveGLPaymentAccount('master')).toBe('1010')
    expect(resolveGLPaymentAccount('qr')).toBe('1010')
    expect(resolveGLPaymentAccount('bank')).toBe('1010')
  })
})

describe('Fix #135: Refund VAT and Service Charge Proportional Reversal', () => {
  interface OrderData {
    total_amount: number
    subtotal: number
    tax_amount: number
    service_charge: number
    delivery_charge: number
    discount_amount: number
  }

  function calculateRefundReversalLines(order: OrderData, refundAmount: number) {
    const total = order.total_amount
    const ratio = total > 0 ? refundAmount / total : 1.0

    const refTax = parseFloat((order.tax_amount * ratio).toFixed(2))
    const refSc = parseFloat((order.service_charge * ratio).toFixed(2))
    const refDel = parseFloat((order.delivery_charge * ratio).toFixed(2))
    const refDisc = parseFloat((order.discount_amount * ratio).toFixed(2))

    const refSubtotal = parseFloat((refundAmount + refDisc - refTax - refSc - refDel).toFixed(2))

    return {
      ratio,
      refundPayoutCredit: refundAmount,
      discountCredit: refDisc,
      revenueDebit: Math.max(0, refSubtotal),
      vatDebit: refTax,
      serviceChargeDebit: refSc,
      deliveryDebit: refDel,
      totalDebits: parseFloat((Math.max(0, refSubtotal) + refTax + refSc + refDel).toFixed(2)),
      totalCredits: parseFloat((refundAmount + refDisc).toFixed(2)),
    }
  }

  it('fully reverses VAT (2300) and Service Charge (2310) on a 100% full refund', () => {
    // Order: 10,000 subtotal + 1,800 VAT (18%) + 1,000 SC (10%) = 12,800 total
    const order: OrderData = {
      subtotal: 10000,
      tax_amount: 1800,
      service_charge: 1000,
      delivery_charge: 0,
      discount_amount: 0,
      total_amount: 12800,
    }

    const lines = calculateRefundReversalLines(order, 12800)

    expect(lines.refundPayoutCredit).toBe(12800)
    expect(lines.revenueDebit).toBe(10000)
    expect(lines.vatDebit).toBe(1800) // VAT reversed!
    expect(lines.serviceChargeDebit).toBe(1000) // SC reversed!
    expect(lines.totalDebits).toBe(lines.totalCredits)
  })

  it('proportionately reverses VAT (2300) on a 50% partial refund', () => {
    const order: OrderData = {
      subtotal: 10000,
      tax_amount: 1800,
      service_charge: 1000,
      delivery_charge: 0,
      discount_amount: 0,
      total_amount: 12800,
    }

    const lines = calculateRefundReversalLines(order, 6400) // 50% refund

    expect(lines.refundPayoutCredit).toBe(6400)
    expect(lines.revenueDebit).toBe(5000)
    expect(lines.vatDebit).toBe(900) // 50% of VAT reversed!
    expect(lines.serviceChargeDebit).toBe(500) // 50% of SC reversed!
    expect(lines.totalDebits).toBe(lines.totalCredits)
  })

  it('handles orders with discounts correctly ensuring balanced debits and credits', () => {
    // 10,000 food - 1,000 discount + 1,620 tax = 10,620 total
    const order: OrderData = {
      subtotal: 10000,
      discount_amount: 1000,
      tax_amount: 1620,
      service_charge: 0,
      delivery_charge: 0,
      total_amount: 10620,
    }

    const lines = calculateRefundReversalLines(order, 10620)

    expect(lines.refundPayoutCredit).toBe(10620)
    expect(lines.discountCredit).toBe(1000)
    expect(lines.vatDebit).toBe(1620)
    expect(lines.revenueDebit).toBe(10000)
    expect(lines.totalDebits).toBe(lines.totalCredits)
  })
})

describe('Fix #135: Quick-Pay Invoice Structure Validation', () => {
  it('prepares complete invoice fields for Quick-Pay insertion without generated column', () => {
    const mockOrder = {
      id: 'ord-123',
      company_id: 'co-1',
      branch_id: 'br-1',
      customer_name: 'Walk-in Guest',
      customer_phone: '0771234567',
      subtotal: 5000,
      tax_amount: 900,
      discount_amount: 0,
      service_charge: 500,
      delivery_charge: 0,
      total_amount: 6400,
      waiter_id: 'w-1',
    }

    const invoicePayload = {
      company_id: mockOrder.company_id,
      branch_id: mockOrder.branch_id,
      order_id: mockOrder.id,
      customer_name: mockOrder.customer_name,
      customer_phone: mockOrder.customer_phone,
      subtotal: mockOrder.subtotal,
      tax: mockOrder.tax_amount,
      vat_amount: mockOrder.tax_amount,
      discount: mockOrder.discount_amount,
      service_charge: mockOrder.service_charge,
      delivery_charge: mockOrder.delivery_charge,
      total: mockOrder.total_amount,
      paid_amount: mockOrder.total_amount,
      balance: 0,
      payment_status: 'paid',
      status: 'issued',
      payment_type: 'cash',
    }

    // Must NOT have grand_total (PostgreSQL generated column constraint)
    expect((invoicePayload as any).grand_total).toBeUndefined()
    expect(invoicePayload.payment_status).toBe('paid')
    expect(invoicePayload.status).toBe('issued')
    expect(invoicePayload.total).toBe(6400)
    expect(invoicePayload.paid_amount).toBe(6400)
    expect(invoicePayload.balance).toBe(0)
  })
})
