#!/usr/bin/env node
/**
 * Seven Waves ERP — Storage Image Compressor
 * Run: node scripts/compress-storage-images.js
 * Dry:  node scripts/compress-storage-images.js --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env manually (dotenv may not be ESM-compatible in some setups)
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env')
let SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY

try {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const [key, ...rest] = line.trim().split('=')
    const val = rest.join('=').replace(/^["']|["']$/g, '')
    if (key === 'VITE_SUPABASE_URL') SUPABASE_URL = val
    if (key === 'VITE_SUPABASE_ANON_KEY') SUPABASE_KEY = val
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') SUPABASE_SERVICE_KEY = val
  }
} catch (e) {
  console.error('Cannot read .env:', e.message)
  process.exit(1)
}

const ADMIN_EMAIL = 'admin@7waves.lk'
const ADMIN_PASS  = 'admin123'
const DRY_RUN     = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

// Use Service Role Key if available to bypass Auth, otherwise fallback to Anon Key
const useServiceKey = !!SUPABASE_SERVICE_KEY
const supabase = createClient(SUPABASE_URL, useServiceKey ? SUPABASE_SERVICE_KEY : SUPABASE_KEY)

// ── Bucket configs ─────────────────────────────────────────────────────────────
const BUCKETS = [
  {
    name: 'menu-images',
    maxWidth: 800,
    quality: 82,
    skipUnderKb: 80,
    async updateDb(oldUrl, newUrl) {
      if (oldUrl === newUrl) return
      const { error } = await supabase.from('menu_items').update({ image_url: newUrl }).eq('image_url', oldUrl)
      if (error) console.warn('   DB update failed:', error.message)
    },
  },
  {
    name: 'employee-photos',
    maxWidth: 400,
    quality: 80,
    skipUnderKb: 40,
    async updateDb(oldUrl, newUrl) {
      if (oldUrl === newUrl) return
      const { error } = await supabase.from('employees').update({ photo_url: newUrl }).eq('photo_url', oldUrl)
      if (error) console.warn('   DB update failed:', error.message)
    },
  },
]

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'avif']

// ── Helpers ────────────────────────────────────────────────────────────────────
async function listAllFiles(bucket, prefix = '') {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error) throw new Error(`List ${bucket}/${prefix}: ${error.message}`)

  const files = []
  for (const item of (data || [])) {
    if (item.id === null) {
      const sub = await listAllFiles(bucket, prefix ? `${prefix}/${item.name}` : item.name)
      files.push(...sub)
    } else {
      files.push({
        path: prefix ? `${prefix}/${item.name}` : item.name,
        size: item.metadata?.size || 0,
      })
    }
  }
  return files
}

function getPublicUrl(bucket, path) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// ── Process bucket ─────────────────────────────────────────────────────────────
async function processBucket(cfg) {
  console.log(`\n📦  Bucket: ${cfg.name}`)
  console.log('─'.repeat(55))

  let files
  try {
    files = await listAllFiles(cfg.name)
  } catch (e) {
    console.error(`  ❌ Cannot list: ${e.message}`)
    return
  }

  console.log(`  Found ${files.length} file(s)`)
  let compressed = 0, skipped = 0, errors = 0, savedBytes = 0

  for (const file of files) {
    const ext = file.path.split('.').pop()?.toLowerCase()
    if (!IMAGE_EXTS.includes(ext)) { skipped++; continue }

    const alreadySmall = ext === 'webp' && file.size > 0 && file.size < cfg.skipUnderKb * 1024
    if (alreadySmall) {
      console.log(`  ✅ SKIP  ${file.path} (${Math.round(file.size / 1024)}KB — already optimized)`)
      skipped++
      continue
    }

    process.stdout.write(`  🔄 ${file.path} (${Math.round(file.size / 1024)}KB) → `)

    try {
      const { data: blob, error: dlErr } = await supabase.storage.from(cfg.name).download(file.path)
      if (dlErr) throw new Error(`Download: ${dlErr.message}`)
      const input = Buffer.from(await blob.arrayBuffer())

      const output = await sharp(input)
        .resize({ width: cfg.maxWidth, withoutEnlargement: true })
        .webp({ quality: cfg.quality })
        .toBuffer()

      const diff = input.length - output.length
      savedBytes += Math.max(0, diff)

      if (DRY_RUN) {
        console.log(`${Math.round(output.length / 1024)}KB  [DRY RUN — saves ${Math.round(diff / 1024)}KB]`)
        compressed++
        continue
      }

      const newPath = file.path.replace(/\.[^.]+$/, '.webp')
      const oldUrl  = getPublicUrl(cfg.name, file.path)
      const newUrl  = getPublicUrl(cfg.name, newPath)

      const { error: upErr } = await supabase.storage
        .from(cfg.name)
        .upload(newPath, output, { contentType: 'image/webp', upsert: true })
      if (upErr) throw new Error(`Upload: ${upErr.message}`)

      if (newPath !== file.path) {
        await supabase.storage.from(cfg.name).remove([file.path])
      }

      await cfg.updateDb(oldUrl, newUrl)
      console.log(`${Math.round(output.length / 1024)}KB  ✅ (saved ${Math.round(diff / 1024)}KB)`)
      compressed++

    } catch (err) {
      console.log(`❌ ${err.message}`)
      errors++
    }
  }

  console.log(`\n  Summary — compressed: ${compressed} | skipped: ${skipped} | errors: ${errors} | total saved: ${Math.round(savedBytes / 1024)}KB`)
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════════════════════')
  console.log('  Seven Waves — Storage Image Compressor')
  if (DRY_RUN) console.log('  [DRY RUN — no actual changes will be made]')
  console.log('══════════════════════════════════════════════════════')

  if (!useServiceKey) {
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS })
    if (authErr) { console.error('❌ Auth failed:', authErr.message); process.exit(1) }
    console.log(`✅ Signed in as ${ADMIN_EMAIL}`)
  } else {
    console.log(`✅ Using Service Role Key (Auth bypassed)`)
  }

  for (const cfg of BUCKETS) {
    await processBucket(cfg)
  }

  console.log('\n══════════════════════════════════════════════════════')
  console.log('  Done! Hard-reload pages (Ctrl+Shift+R) to see results.')
  console.log('══════════════════════════════════════════════════════')
  process.exit(0)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
