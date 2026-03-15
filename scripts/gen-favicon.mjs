import sharp from 'sharp'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const src = 'C:/Users/ROG STRIX/.gemini/antigravity/brain/6a5c9769-a9f3-45b4-8858-f8078ed17069/seven_waves_favicon_icon_1773593006101.png'
const iconsDir = resolve(root, 'public/icons')

// Load as raw RGBA
const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width, height, channels } = info
const buf = Buffer.from(data)

// Helper: get pixel index
const idx = (x, y) => (y * width + x) * channels

// Helper: is a pixel "background-like" (grey/white, low saturation)
function isBg(i) {
  const r = buf[i], g = buf[i+1], b = buf[i+2]
  // Low saturation = abs(max-min) < threshold → grey/white
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const saturation = max - min
  return saturation < 30 && max > 180  // grey-ish and bright
}

// BFS flood-fill from all 4 corners + edges to mark background pixels
const visited = new Uint8Array(width * height)
const queue = []

// Seed from all 4 corners and edges
function seed(x, y) {
  const pi = y * width + x
  if (!visited[pi] && isBg(idx(x, y))) {
    visited[pi] = 1
    queue.push([x, y])
  }
}

for (let x = 0; x < width; x++) {
  seed(x, 0)
  seed(x, height - 1)
}
for (let y = 0; y < height; y++) {
  seed(0, y)
  seed(width - 1, y)
}

// BFS
const dx = [1, -1, 0, 0]
const dy = [0, 0, 1, -1]
let qi = 0
while (qi < queue.length) {
  const [cx, cy] = queue[qi++]
  for (let d = 0; d < 4; d++) {
    const nx = cx + dx[d], ny = cy + dy[d]
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
    const pi = ny * width + nx
    if (!visited[pi] && isBg(idx(nx, ny))) {
      visited[pi] = 1
      queue.push([nx, ny])
    }
  }
}

// Zero out all flood-filled background pixels
let removed = 0
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const pi = y * width + x
    if (visited[pi]) {
      const i = idx(x, y)
      buf[i] = buf[i+1] = buf[i+2] = buf[i+3] = 0
      removed++
    }
  }
}

console.log(`Removed ${removed} background pixels out of ${width * height}`)

// Build cleaned image
const cleanedImg = sharp(buf, { raw: { width, height, channels } }).png()

// Save all sizes
const sizes = [16, 32, 96, 128]
for (const s of sizes) {
  const out = resolve(iconsDir, `favicon-${s}x${s}.png`)
  await cleanedImg
    .clone()
    .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(out)
  console.log(`✅ ${s}x${s} saved`)
}

const icoOut = resolve(root, 'public/favicon.ico')
await cleanedImg
  .clone()
  .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toFile(icoOut)
console.log(`✅ favicon.ico saved`)
console.log('🎉 Done — transparent background removed!')
