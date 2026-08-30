import { describe, it, expect } from 'vitest'

describe('Split Payment (Multi-Tender) Logic QA', () => {
  it('should validate exact sum match for split payments', () => {
    const orderTotal = 5000
    const splitCash = 2000
    const splitCard = 3000
    const splitQr = 0

    const totalSplit = splitCash + splitCard + splitQr
    const isBalanced = Math.abs(totalSplit - orderTotal) < 0.01

    expect(totalSplit).toBe(5000)
    expect(isBalanced).toBe(true)
  })

  it('should detect underpayment in split payment breakdown', () => {
    const orderTotal = 5000
    const splitCash = 2000
    const splitCard = 2500
    const splitQr = 0

    const totalSplit = splitCash + splitCard + splitQr
    const isBalanced = Math.abs(totalSplit - orderTotal) < 0.01
    const remaining = Math.max(0, orderTotal - totalSplit)

    expect(isBalanced).toBe(false)
    expect(remaining).toBe(500)
  })

  it('should calculate remaining balance and auto-fill to card or online', () => {
    const orderTotal = 8750
    const splitCash = 3000
    const splitQr = 1500

    const remaining = orderTotal - (splitCash + splitQr)
    const autoFilledCard = remaining

    expect(remaining).toBe(4250)
    expect(splitCash + splitQr + autoFilledCard).toBe(orderTotal)
  })

  it('should flag cash drawer pulse requirement if cash portion > 0 in split payment', () => {
    const splitWithCash = { cash: 1500, card: 3500 }
    const splitWithoutCash = { cash: 0, card: 3500, qr: 1500 }

    const needsDrawerPulse1 = splitWithCash.cash > 0
    const needsDrawerPulse2 = splitWithoutCash.cash > 0

    expect(needsDrawerPulse1).toBe(true)
    expect(needsDrawerPulse2).toBe(false)
  })
})
