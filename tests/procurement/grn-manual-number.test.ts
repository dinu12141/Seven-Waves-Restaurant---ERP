import { describe, it, expect } from 'vitest'
import { sanitizeDocNumber } from '../../src/services/procurementService'

describe('GRN Manual Document Number QA & Security Tests', () => {
  describe('Input Sanitization & Normalization', () => {
    it('returns empty string for null or undefined input', () => {
      expect(sanitizeDocNumber(null)).toBe('')
      expect(sanitizeDocNumber(undefined)).toBe('')
      expect(sanitizeDocNumber('')).toBe('')
    })

    it('trims leading and trailing whitespace', () => {
      expect(sanitizeDocNumber('   INV-2026-001   ')).toBe('INV-2026-001')
      expect(sanitizeDocNumber('\tBILL-990\n')).toBe('BILL-990')
    })

    it('strips HTML and script tags (XSS protection)', () => {
      expect(sanitizeDocNumber('<script>alert("xss")</script>INV-001')).toBe('INV-001')
      expect(sanitizeDocNumber('<b>BILL</b>-123')).toBe('BILL-123')
      expect(sanitizeDocNumber('<img src=x onerror=alert(1)>9988')).toBe('9988')
    })

    it('enforces maximum character length of 50', () => {
      const valid50 = 'A'.repeat(50)
      expect(sanitizeDocNumber(valid50)).toBe(valid50)

      const invalid51 = 'A'.repeat(51)
      expect(() => sanitizeDocNumber(invalid51)).toThrow('GRN / Bill Number cannot exceed 50 characters.')
    })

    it('preserves valid invoice/bill formatting characters', () => {
      expect(sanitizeDocNumber('INV/2026/09/001')).toBe('INV/2026/09/001')
      expect(sanitizeDocNumber('BILL#4921-A')).toBe('BILL#4921-A')
      expect(sanitizeDocNumber('PO-992.01')).toBe('PO-992.01')
      expect(sanitizeDocNumber('SL-COL-9902')).toBe('SL-COL-9902')
    })
  })
})
