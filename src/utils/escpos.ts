/**
 * ESC/POS Binary Command Generator for Thermal Printers
 * Standard Epson / Xprinter / Star / Rongta ESC/POS implementation
 */

export const ESC = 0x1b
export const GS = 0x1d
export const FS = 0x1c
export const DLE = 0x10

export type Alignment = 'left' | 'center' | 'right'
export type CutMode = 'full' | 'partial' | 'feed_partial' | 'feed_full'
export type DrawerPin = 'pin2' | 'pin5'

export interface EscPosPrintOptions {
  paperWidth?: '58mm' | '80mm'
  characterSet?: number
  cutMode?: CutMode
  openDrawer?: boolean
  drawerPin?: DrawerPin
}

export class EscPosBuilder {
  private buffer: number[] = []

  constructor() {
    this.init()
  }

  /** Reset/Initialize printer */
  init(): this {
    this.buffer.push(ESC, 0x40) // ESC @
    return this
  }

  /** Append raw bytes */
  raw(bytes: number[] | Uint8Array): this {
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i])
    }
    return this
  }

  /**
   * Cash Drawer Kick (Standard pulse command)
   * Pin 2 (Standard): ESC p 0 25 250 (pulse 50ms ON, 500ms OFF)
   * Pin 5:            ESC p 1 25 250
   */
  cashDrawer(pin: DrawerPin = 'pin2'): this {
    const pinByte = pin === 'pin5' ? 0x01 : 0x00
    // Pulse ON 50ms (25 * 2ms), OFF 500ms (250 * 2ms)
    this.buffer.push(ESC, 0x70, pinByte, 0x19, 0xfa)
    return this
  }

  /**
   * Realtime Cash Drawer Kick (works even if printer buffer has items)
   * DLE DC4 1 1 1
   */
  cashDrawerRealtime(): this {
    this.buffer.push(DLE, 0x14, 0x01, 0x00, 0x05)
    return this
  }

  /**
   * Paper Cut
   * Partial Cut: GS V 1 / GS V 66 n (feed n lines and partial cut)
   * Full Cut:    GS V 0 / GS V 65 n (feed n lines and full cut)
   */
  cut(mode: CutMode = 'feed_partial', feedLines: number = 3): this {
    switch (mode) {
      case 'full':
        this.buffer.push(GS, 0x56, 0x00) // GS V 0
        break
      case 'partial':
        this.buffer.push(GS, 0x56, 0x01) // GS V 1
        break
      case 'feed_full':
        this.buffer.push(GS, 0x56, 0x41, feedLines) // GS V 65 n
        break
      case 'feed_partial':
      default:
        this.buffer.push(GS, 0x56, 0x42, feedLines) // GS V 66 n
        break
    }
    return this
  }

  /** Set Text Alignment */
  align(align: Alignment): this {
    let code = 0x00
    if (align === 'center') code = 0x01
    if (align === 'right') code = 0x02
    this.buffer.push(ESC, 0x61, code) // ESC a n
    return this
  }

  /** Set Bold mode */
  bold(enable: boolean = true): this {
    this.buffer.push(ESC, 0x45, enable ? 0x01 : 0x00) // ESC E n
    return this
  }

  /** Set Underline */
  underline(mode: 0 | 1 | 2 = 1): this {
    this.buffer.push(ESC, 0x2d, mode) // ESC - n
    return this
  }

  /** Set Invert (White text on black background) */
  invert(enable: boolean = true): this {
    this.buffer.push(GS, 0x42, enable ? 0x01 : 0x00) // GS B n
    return this
  }

  /** Set Double Height & Double Width */
  size(widthMultiplier: 1 | 2 | 3 | 4 = 1, heightMultiplier: 1 | 2 | 3 | 4 = 1): this {
    const w = Math.max(1, Math.min(widthMultiplier, 8)) - 1
    const h = Math.max(1, Math.min(heightMultiplier, 8)) - 1
    const sizeByte = (w << 4) | h
    this.buffer.push(GS, 0x21, sizeByte) // GS ! n
    return this
  }

  /** Reset text size to normal (1x1) */
  normal(): this {
    return this.size(1, 1).bold(false).underline(0).invert(false)
  }

  /** Feed lines */
  feed(lines: number = 1): this {
    this.buffer.push(ESC, 0x64, Math.max(1, lines)) // ESC d n
    return this
  }

  /** Append text encoded in ASCII / CP437 / UTF-8 */
  text(str: string): this {
    const bytes = new TextEncoder().encode(str)
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i])
    }
    return this
  }

  /** Append text with a newline */
  line(str: string = ''): this {
    this.text(str)
    this.buffer.push(0x0a) // LF
    return this
  }

  /** Print a horizontal dashed or solid line matching the paper width */
  hr(char: string = '-', width: number = 48): this {
    this.align('left')
    this.line(char.repeat(width).slice(0, width))
    return this
  }

  /** Print 2-column key-value row (e.g. "Subtotal:        LKR 1,500.00") */
  twoColumn(left: string, right: string, width: number = 48): this {
    const maxLeftLen = width - right.length - 1
    let leftText = left
    if (leftText.length > maxLeftLen) {
      leftText = leftText.slice(0, maxLeftLen)
    }
    const spaceCount = Math.max(1, width - leftText.length - right.length)
    this.line(leftText + ' '.repeat(spaceCount) + right)
    return this
  }

  /** Print 3-column table row (Item, Qty, Amount) */
  threeColumn(col1: string, col2: string, col3: string, col1W: number = 28, col2W: number = 6, col3W: number = 14): this {
    const c1 = col1.padEnd(col1W, ' ').slice(0, col1W)
    const c2 = col2.padStart(col2W, ' ').slice(0, col2W)
    const c3 = col3.padStart(col3W, ' ').slice(0, col3W)
    this.line(`${c1}${c2}${c3}`)
    return this
  }

  /**
   * QR Code Generation (ESC/POS Model 2)
   */
  qrCode(data: string, size: number = 6): this {
    const bytes = new TextEncoder().encode(data)
    const len = bytes.length + 3
    const pL = len % 256
    const pH = Math.floor(len / 256)

    this.align('center')

    // Set QR Model 2: GS ( k 4 0 49 65 50 0
    this.buffer.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00)

    // Set Module Size: GS ( k 3 0 49 67 size
    this.buffer.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(1, Math.min(size, 16)))

    // Set Error Correction Level M: GS ( k 3 0 49 69 49
    this.buffer.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31)

    // Store QR Data: GS ( k pL pH 49 80 48 <data>
    this.buffer.push(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30)
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i])
    }

    // Print QR Data: GS ( k 3 0 49 81 48
    this.buffer.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30)
    this.feed(1)
    return this
  }

  /** Export as Uint8Array */
  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer)
  }

  /** Export as ArrayBuffer */
  toArrayBuffer(): ArrayBuffer {
    const uint8 = this.toUint8Array()
    return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer
  }
}
