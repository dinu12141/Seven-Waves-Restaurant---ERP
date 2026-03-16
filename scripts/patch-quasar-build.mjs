/**
 * post-install patch for @quasar/app-vite build.js
 *
 * Wraps fse.removeSync(outputFolder) in a try/catch so that Windows
 * Defender file locks on app.asar do not crash the build.
 *
 * Run automatically via "postinstall" in package.json.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = 'node_modules/@quasar/app-vite/lib/cmd/build.js'
const MARKER = '/* patched: eperm-guard */'

let src = readFileSync(FILE, 'utf8')
if (src.includes(MARKER)) {
  console.log('[patch] Already applied.')
  process.exit(0)
}

const original = `fse.removeSync(outputFolder)`
const patched = [
  `${MARKER}`,
  `try {`,
  `  fse.removeSync(outputFolder)`,
  `} catch (e) {`,
  `  if (e.code === 'EPERM' || e.code === 'EBUSY') {`,
  `    console.warn('[quasar] Warning: could not fully clean output folder (file locked). Continuing...')`,
  `    try { fse.emptyDirSync(outputFolder) } catch (_) {}`,
  `  } else { throw e }`,
  `}`,
].join('\n')

if (!src.includes(original)) {
  console.log('[patch] Target line not found — maybe already patched or Quasar updated. Skipping.')
  process.exit(0)
}

src = src.replace(original, patched)
writeFileSync(FILE, src, 'utf8')
console.log('[patch] Successfully patched build.js (EPERM guard).')
