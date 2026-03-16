/**
 * generate-icons.mjs
 * Converts public/logo.jpeg → src-electron/icons/icon.png + icon.ico
 *
 * Run once before building:
 *   node scripts/generate-icons.mjs
 */

import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const src = path.join(root, 'public', 'logo.jpeg')
const outDir = path.join(root, 'src-electron', 'icons')

if (!fs.existsSync(src)) {
  console.error('ERROR: public/logo.jpeg not found')
  process.exit(1)
}

console.log('Generating icons from public/logo.jpeg ...')

// ── icon.png (512×512) — used by Linux & BrowserWindow ────────
await sharp(src)
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(outDir, 'icon.png'))
console.log('  ✓ icon.png (512×512)')

// ── Multiple PNGs needed for the ICO (16, 32, 48, 64, 128, 256) ─
const icoSizes = [16, 32, 48, 64, 128, 256]
const pngBuffers = await Promise.all(
  icoSizes.map((size) =>
    sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  ),
)

// ── Build ICO file manually (ICONDIR + ICONDIRENTRY + image data) ─
// ICO format: https://en.wikipedia.org/wiki/ICO_(file_format)
function buildIco(pngBufferList, sizes) {
  const count = pngBufferList.length
  const headerSize = 6 // ICONDIR
  const entrySize = 16 // ICONDIRENTRY each
  const dataOffset = headerSize + entrySize * count

  // Calculate total size
  const totalSize = dataOffset + pngBufferList.reduce((s, b) => s + b.length, 0)
  const buf = Buffer.alloc(totalSize)

  // ICONDIR
  buf.writeUInt16LE(0, 0) // reserved
  buf.writeUInt16LE(1, 2) // type: 1 = ICO
  buf.writeUInt16LE(count, 4)

  let imageOffset = dataOffset
  pngBufferList.forEach((imgBuf, i) => {
    const size = sizes[i]
    const entryOffset = headerSize + i * entrySize
    buf.writeUInt8(size >= 256 ? 0 : size, entryOffset)     // width (0 = 256)
    buf.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1) // height (0 = 256)
    buf.writeUInt8(0, entryOffset + 2)   // color count (0 = no palette)
    buf.writeUInt8(0, entryOffset + 3)   // reserved
    buf.writeUInt16LE(1, entryOffset + 4) // color planes
    buf.writeUInt16LE(32, entryOffset + 6) // bits per pixel
    buf.writeUInt32LE(imgBuf.length, entryOffset + 8)  // image size
    buf.writeUInt32LE(imageOffset, entryOffset + 12)   // image offset

    imgBuf.copy(buf, imageOffset)
    imageOffset += imgBuf.length
  })

  return buf
}

const icoBuf = buildIco(pngBuffers, icoSizes)
fs.writeFileSync(path.join(outDir, 'icon.ico'), icoBuf)
console.log('  ✓ icon.ico (16/32/48/64/128/256)')

// ── Also copy logo.jpeg into src-electron/icons for reference ──
fs.copyFileSync(src, path.join(outDir, 'logo.jpeg'))
console.log('  ✓ logo.jpeg copied')

console.log('\nDone! Now run:  quasar build -m electron')
