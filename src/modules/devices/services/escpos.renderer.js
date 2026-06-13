// ═══════════════════════════════════════════════════════════════════
// ESC/POS Renderer — Binary command builder for thermal printers
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

/**
 * ESC/POS command constants.
 * These produce the raw byte sequences that thermal printers understand.
 */
export const ESC = 0x1B
export const GS = 0x1D
export const LF = 0x0A

export const CMD = {
  INIT:           [ESC, 0x40],
  ALIGN_LEFT:     [ESC, 0x61, 0x00],
  ALIGN_CENTER:   [ESC, 0x61, 0x01],
  ALIGN_RIGHT:    [ESC, 0x61, 0x02],
  BOLD_ON:        [ESC, 0x45, 0x01],
  BOLD_OFF:       [ESC, 0x45, 0x00],
  DOUBLE_ON:      [ESC, 0x21, 0x30],
  DOUBLE_OFF:     [ESC, 0x21, 0x00],
  UNDERLINE_ON:   [ESC, 0x2D, 0x01],
  UNDERLINE_OFF:  [ESC, 0x2D, 0x00],
  CUT_PAPER:      [GS, 0x56, 0x42, 0x00],
  PARTIAL_CUT:    [GS, 0x56, 0x01],
  FEED_LINES:     (n) => [ESC, 0x64, n],
  LINE_SPACING:   (n) => [ESC, 0x33, n],
  OPEN_DRAWER_1:  [ESC, 0x70, 0x00, 0x19, 0x78],
  OPEN_DRAWER_2:  [ESC, 0x70, 0x01, 0x19, 0x78],
  BEEP:           [ESC, 0x42, 0x03, 0x02],
}

/**
 * ESC/POS document builder.
 * Builds a Uint8Array buffer of printer commands.
 */
export class EscPosBuilder {
  constructor(paperWidth = 80) {
    this._buffer = []
    this._charWidth = paperWidth === 58 ? 32 : 48
    this.init()
  }

  /** Reset printer to defaults */
  init() {
    this._push(CMD.INIT)
    return this
  }

  /** Add raw text (encoded to CP437 bytes) */
  text(str) {
    const encoder = new TextEncoder()
    this._buffer.push(...encoder.encode(str))
    return this
  }

  /** Add text + line feed */
  line(str = '') {
    this.text(str)
    this._buffer.push(LF)
    return this
  }

  /** Empty line */
  feed(lines = 1) {
    this._push(CMD.FEED_LINES(lines))
    return this
  }

  /** Center align */
  center() { this._push(CMD.ALIGN_CENTER); return this }

  /** Left align */
  left() { this._push(CMD.ALIGN_LEFT); return this }

  /** Right align */
  right() { this._push(CMD.ALIGN_RIGHT); return this }

  /** Bold on */
  bold() { this._push(CMD.BOLD_ON); return this }

  /** Bold off */
  boldOff() { this._push(CMD.BOLD_OFF); return this }

  /** Double-height + double-width on */
  big() { this._push(CMD.DOUBLE_ON); return this }

  /** Double-height + double-width off */
  bigOff() { this._push(CMD.DOUBLE_OFF); return this }

  /** Underline on */
  underline() { this._push(CMD.UNDERLINE_ON); return this }

  /** Underline off */
  underlineOff() { this._push(CMD.UNDERLINE_OFF); return this }

  /** Print a dashed separator line */
  separator(char = '-') {
    this.line(char.repeat(this._charWidth))
    return this
  }

  /** Print two columns (left-aligned + right-aligned) */
  columns(leftText, rightText) {
    const maxLeft = this._charWidth - rightText.length - 1
    const left = leftText.substring(0, maxLeft).padEnd(maxLeft, ' ')
    this.line(`${left} ${rightText}`)
    return this
  }

  /** Print three columns */
  threeColumns(col1, col2, col3) {
    const w1 = Math.floor(this._charWidth * 0.5)
    const w2 = Math.floor(this._charWidth * 0.15)
    const w3 = this._charWidth - w1 - w2
    const c1 = col1.substring(0, w1).padEnd(w1, ' ')
    const c2 = col2.substring(0, w2).padStart(w2, ' ')
    const c3 = col3.substring(0, w3).padStart(w3, ' ')
    this.line(`${c1}${c2}${c3}`)
    return this
  }

  /** Open cash drawer */
  openDrawer(pin = 1) {
    this._push(pin === 2 ? CMD.OPEN_DRAWER_2 : CMD.OPEN_DRAWER_1)
    return this
  }

  /** Sound the beeper */
  beep() { this._push(CMD.BEEP); return this }

  /** Cut paper */
  cut() {
    this.feed(4)
    this._push(CMD.CUT_PAPER)
    return this
  }

  /** Partial cut */
  partialCut() {
    this.feed(4)
    this._push(CMD.PARTIAL_CUT)
    return this
  }

  /** Build final buffer */
  build() {
    return new Uint8Array(this._buffer)
  }

  /** Internal: push command bytes */
  _push(bytes) {
    if (Array.isArray(bytes)) {
      this._buffer.push(...bytes)
    }
  }
}
