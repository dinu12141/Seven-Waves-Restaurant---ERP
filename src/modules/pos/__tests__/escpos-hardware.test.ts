import { describe, it, expect, beforeEach } from 'vitest'
import { EscPosBuilder, ESC, GS, DLE } from '../../../utils/escpos'
import { escposPrintService } from '../../../services/escposPrintService'

describe('ESC/POS Thermal Printing & Hardware Engine', () => {
  it('should initialize printer with ESC @ reset sequence', () => {
    const builder = new EscPosBuilder()
    const bytes = Array.from(builder.toUint8Array())
    expect(bytes[0]).toBe(ESC)
    expect(bytes[1]).toBe(0x40) // ESC @
  })

  describe('Cash Drawer Kick Commands', () => {
    it('should generate standard pulse command for Pin 2 (RJ11/RJ12 drawer port)', () => {
      const builder = new EscPosBuilder()
      builder.cashDrawer('pin2')
      const bytes = Array.from(builder.toUint8Array())

      // Check for ESC p 0 25 250
      const pulseIndex = bytes.findIndex((b, idx) => b === ESC && bytes[idx + 1] === 0x70)
      expect(pulseIndex).toBeGreaterThanOrEqual(0)
      expect(bytes[pulseIndex + 2]).toBe(0x00) // Pin 2
      expect(bytes[pulseIndex + 3]).toBe(0x19) // ON time (25 * 2ms = 50ms)
      expect(bytes[pulseIndex + 4]).toBe(0xfa) // OFF time (250 * 2ms = 500ms)
    })

    it('should generate pulse command for Pin 5', () => {
      const builder = new EscPosBuilder()
      builder.cashDrawer('pin5')
      const bytes = Array.from(builder.toUint8Array())

      const pulseIndex = bytes.findIndex((b, idx) => b === ESC && bytes[idx + 1] === 0x70)
      expect(pulseIndex).toBeGreaterThanOrEqual(0)
      expect(bytes[pulseIndex + 2]).toBe(0x01) // Pin 5
    })

    it('should generate realtime cash drawer kick command (DLE DC4)', () => {
      const builder = new EscPosBuilder()
      builder.cashDrawerRealtime()
      const bytes = Array.from(builder.toUint8Array())

      const rtIndex = bytes.findIndex((b, idx) => b === DLE && bytes[idx + 1] === 0x14)
      expect(rtIndex).toBeGreaterThanOrEqual(0)
      expect(bytes[rtIndex + 2]).toBe(0x01)
      expect(bytes[rtIndex + 3]).toBe(0x00)
      expect(bytes[rtIndex + 4]).toBe(0x05)
    })
  })

  describe('Paper Cut Commands', () => {
    it('should generate feed lines and partial cut command (GS V 66 3)', () => {
      const builder = new EscPosBuilder()
      builder.cut('feed_partial', 3)
      const bytes = Array.from(builder.toUint8Array())

      const cutIndex = bytes.findIndex((b, idx) => b === GS && bytes[idx + 1] === 0x56)
      expect(cutIndex).toBeGreaterThanOrEqual(0)
      expect(bytes[cutIndex + 2]).toBe(0x42) // Feed and partial cut (ASCII 'B')
      expect(bytes[cutIndex + 3]).toBe(3) // 3 feed lines
    })

    it('should generate full cut command (GS V 0)', () => {
      const builder = new EscPosBuilder()
      builder.cut('full')
      const bytes = Array.from(builder.toUint8Array())

      const cutIndex = bytes.findIndex((b, idx) => b === GS && bytes[idx + 1] === 0x56)
      expect(cutIndex).toBeGreaterThanOrEqual(0)
      expect(bytes[cutIndex + 2]).toBe(0x00)
    })

    it('should generate partial cut command (GS V 1)', () => {
      const builder = new EscPosBuilder()
      builder.cut('partial')
      const bytes = Array.from(builder.toUint8Array())

      const cutIndex = bytes.findIndex((b, idx) => b === GS && bytes[idx + 1] === 0x56)
      expect(cutIndex).toBeGreaterThanOrEqual(0)
      expect(bytes[cutIndex + 2]).toBe(0x01)
    })
  })

  describe('Text Formatting, Alignment & QR Code', () => {
    it('should set text alignment correctly (left, center, right)', () => {
      const builder = new EscPosBuilder()
      builder.align('center')
      let bytes = Array.from(builder.toUint8Array())
      expect(bytes[bytes.length - 3]).toBe(ESC)
      expect(bytes[bytes.length - 2]).toBe(0x61)
      expect(bytes[bytes.length - 1]).toBe(0x01) // 0x01 = center

      builder.align('right')
      bytes = Array.from(builder.toUint8Array())
      expect(bytes[bytes.length - 1]).toBe(0x02) // 0x02 = right

      builder.align('left')
      bytes = Array.from(builder.toUint8Array())
      expect(bytes[bytes.length - 1]).toBe(0x00) // 0x00 = left
    })

    it('should format 2-column key-value rows matching paper width', () => {
      const builder = new EscPosBuilder()
      builder.twoColumn('Total', 'LKR 1,500.00', 48)
      const text = new TextDecoder().decode(builder.toUint8Array())
      expect(text).toContain('Total')
      expect(text).toContain('LKR 1,500.00')
    })

    it('should format 3-column item rows matching item, qty, price structure', () => {
      const builder = new EscPosBuilder()
      builder.threeColumn('Chicken Kottu (R)', '2', 'LKR 2,400.00')
      const text = new TextDecoder().decode(builder.toUint8Array())
      expect(text).toContain('Chicken Kottu (R)')
      expect(text).toContain('2')
      expect(text).toContain('LKR 2,400.00')
    })

    it('should encode QR Code model 2 binary sequences', () => {
      const builder = new EscPosBuilder()
      builder.qrCode('https://sevenwaves.lk/receipt/12345', 6)
      const bytes = Array.from(builder.toUint8Array())

      // Verify GS ( k header for QR model 2
      const qrIndex = bytes.findIndex((b, idx) => b === GS && bytes[idx + 1] === 0x28 && bytes[idx + 2] === 0x6b)
      expect(qrIndex).toBeGreaterThanOrEqual(0)
    })
  })

  describe('escposPrintService Hardware Controller', () => {
    const memoryStorage = new Map<string, string>()

    beforeEach(() => {
      memoryStorage.clear()
      // Setup mock localStorage
      globalThis.localStorage = {
        getItem: (k: string) => memoryStorage.get(k) ?? null,
        setItem: (k: string, v: string) => memoryStorage.set(k, String(v)),
        removeItem: (k: string) => memoryStorage.delete(k),
        clear: () => memoryStorage.clear(),
        key: (idx: number) => Array.from(memoryStorage.keys())[idx] ?? null,
        length: memoryStorage.size,
      } as Storage
    })

    it('should load default printer config with autoDrawer and autoCut enabled', () => {
      const config = escposPrintService.getConfig()
      expect(config.autoCut).toBe(true)
      expect(config.autoDrawer).toBe(true)
      expect(config.paperWidth).toBe('80mm')
      expect(config.drawerPin).toBe('pin2')
    })

    it('should update and persist printer preferences', () => {
      escposPrintService.saveSettings({ paperWidth: '58mm', drawerPin: 'pin5' })
      const updated = escposPrintService.getConfig()
      expect(updated.paperWidth).toBe('58mm')
      expect(updated.drawerPin).toBe('pin5')
    })

    it('should trigger openCashDrawer and return success in browser fallback mode', async () => {
      const res = await escposPrintService.openCashDrawer()
      expect(res.success).toBe(true)
    })

    it('should trigger cutPaper and return success', async () => {
      const res = await escposPrintService.cutPaper()
      expect(res.success).toBe(true)
    })

    it('should generate test receipt without error', async () => {
      const res = await escposPrintService.printTestReceipt()
      expect(res.success).toBe(true)
    })
  })
})
