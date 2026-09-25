import { describe, it, expect } from 'vitest'

function calculateLine(quantity: number, unitCost: number, discountType: 'percentage' | 'amount' = 'percentage', discountValue: number = 0) {
  const qty = Math.max(0, Number(quantity) || 0)
  const price = Math.max(0, Number(unitCost) || 0)
  const gross = qty * price

  const type = discountType || 'percentage'
  const val = Math.max(0, Number(discountValue) || 0)
  let discAmt = 0

  if (type === 'percentage') {
    const clampedPct = Math.min(100, val)
    discAmt = (gross * clampedPct) / 100
  } else {
    discAmt = Math.min(gross, val)
  }

  const roundedDiscAmt = Math.round(discAmt * 100) / 100
  const lineTotal = Math.max(0, Math.round((gross - roundedDiscAmt) * 100) / 100)

  return {
    quantity: qty,
    unit_cost: price,
    gross_total: gross,
    discount_type: type,
    discount_value: val,
    discount_amount: roundedDiscAmt,
    line_total: lineTotal,
  }
}

function calculateDocumentTotals(lines: any[], billDiscountType: 'percentage' | 'amount' = 'percentage', billDiscountValue: number = 0, taxPct: number = 0) {
  const grossSubtotal = lines.reduce((acc, l) => acc + (l.gross_total ?? (l.quantity * l.unit_cost)), 0)
  const itemDiscountsTotal = lines.reduce((acc, l) => acc + (Number(l.discount_amount) || 0), 0)
  const netLinesSubtotal = Math.max(0, grossSubtotal - itemDiscountsTotal)

  const billVal = Math.max(0, Number(billDiscountValue) || 0)
  let billDiscount = 0
  if (billDiscountType === 'percentage') {
    billDiscount = (netLinesSubtotal * Math.min(100, billVal)) / 100
  } else {
    billDiscount = Math.min(netLinesSubtotal, billVal)
  }
  billDiscount = Math.round(billDiscount * 100) / 100

  const totalDiscount = itemDiscountsTotal + billDiscount
  const taxableAmount = Math.max(0, netLinesSubtotal - billDiscount)
  const clampedTaxPct = Math.min(100, Math.max(0, Number(taxPct) || 0))
  const taxAmount = Math.round(((taxableAmount * clampedTaxPct) / 100) * 100) / 100
  const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100

  return {
    grossSubtotal,
    itemDiscountsTotal,
    netLinesSubtotal,
    billDiscount,
    totalDiscount,
    taxableAmount,
    taxAmount,
    totalAmount,
  }
}

describe('GRN Item-Wise & Bill Discount QA & Security Tests', () => {
  describe('Line Level Discount Calculations', () => {
    it('calculates standard percentage discount accurately', () => {
      const line = calculateLine(10, 500, 'percentage', 10) // 10 * 500 = 5000, 10% = 500
      expect(line.gross_total).toBe(5000)
      expect(line.discount_amount).toBe(500)
      expect(line.line_total).toBe(4500)
    })

    it('calculates fixed amount discount accurately', () => {
      const line = calculateLine(5, 1000, 'amount', 350) // 5 * 1000 = 5000, Fix 350
      expect(line.gross_total).toBe(5000)
      expect(line.discount_amount).toBe(350)
      expect(line.line_total).toBe(4650)
    })

    it('clamps percentage discount between 0 and 100% (Security Check)', () => {
      // Negative discount should be clamped to 0
      const negativeLine = calculateLine(2, 1000, 'percentage', -25)
      expect(negativeLine.discount_amount).toBe(0)
      expect(negativeLine.line_total).toBe(2000)

      // Exceeding 100% discount should be clamped to 100%
      const excessLine = calculateLine(2, 1000, 'percentage', 150)
      expect(excessLine.discount_amount).toBe(2000)
      expect(excessLine.line_total).toBe(0)
    })

    it('clamps fixed amount discount so it never exceeds line gross total (Security Check)', () => {
      // Negative fixed discount clamped to 0
      const negFix = calculateLine(2, 500, 'amount', -100)
      expect(negFix.discount_amount).toBe(0)
      expect(negFix.line_total).toBe(1000)

      // Fixed discount greater than line gross (e.g. 5000 on 1000) clamped to line gross
      const overFix = calculateLine(2, 500, 'amount', 5000)
      expect(overFix.discount_amount).toBe(1000)
      expect(overFix.line_total).toBe(0)
    })

    it('handles zero discount gracefully', () => {
      const zeroLine = calculateLine(3, 200, 'percentage', 0)
      expect(zeroLine.discount_amount).toBe(0)
      expect(zeroLine.line_total).toBe(600)
    })
  })

  describe('Document Level Rollup with Item & Bill Discounts', () => {
    it('aggregates multiple lines with different discount types', () => {
      const line1 = calculateLine(10, 1000, 'percentage', 10) // Gross: 10,000, Disc: 1,000, Net: 9,000
      const line2 = calculateLine(5, 2000, 'amount', 500)      // Gross: 10,000, Disc: 500,   Net: 9,500
      const line3 = calculateLine(2, 500, 'percentage', 0)     // Gross: 1,000,  Disc: 0,     Net: 1,000

      const doc = calculateDocumentTotals([line1, line2, line3], 'percentage', 0, 0)

      expect(doc.grossSubtotal).toBe(21000)
      expect(doc.itemDiscountsTotal).toBe(1500)
      expect(doc.netLinesSubtotal).toBe(19500)
      expect(doc.totalDiscount).toBe(1500)
      expect(doc.totalAmount).toBe(19500)
    })

    it('applies overall bill discount on top of item discounts accurately', () => {
      const line1 = calculateLine(10, 1000, 'percentage', 10) // Net: 9,000
      const line2 = calculateLine(1, 1000, 'amount', 0)       // Net: 1,000
      // Net lines subtotal: 10,000

      // Add a 5% bill discount
      const doc = calculateDocumentTotals([line1, line2], 'percentage', 5, 0)

      expect(doc.grossSubtotal).toBe(11000)
      expect(doc.itemDiscountsTotal).toBe(1000)
      expect(doc.netLinesSubtotal).toBe(10000)
      expect(doc.billDiscount).toBe(500) // 5% of 10,000
      expect(doc.totalDiscount).toBe(1500) // 1,000 + 500
      expect(doc.totalAmount).toBe(9500)
    })

    it('calculates tax accurately on discounted taxable base', () => {
      const line1 = calculateLine(10, 1000, 'amount', 2000) // Gross: 10,000, Disc: 2,000, Net: 8,000
      const doc = calculateDocumentTotals([line1], 'amount', 1000, 10) // Net lines: 8,000, Bill disc: 1,000 => Taxable: 7,000, 10% tax = 700

      expect(doc.taxableAmount).toBe(7000)
      expect(doc.taxAmount).toBe(700)
      expect(doc.totalAmount).toBe(7700)
    })

    it('clamps overall bill discount and tax to prevent negative total amounts', () => {
      const line1 = calculateLine(1, 1000, 'percentage', 0)
      // Attempt bill discount of 5000 on 1000
      const doc = calculateDocumentTotals([line1], 'amount', 5000, 0)
      expect(doc.billDiscount).toBe(1000)
      expect(doc.totalAmount).toBe(0)
    })
  })
})
