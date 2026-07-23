#!/usr/bin/env node
/**
 * Build-time guard (finding #39): prevent the Supabase service_role key — which
 * bypasses ALL RLS — from ever being exposed to the browser bundle.
 *
 * Fails the build if:
 *   1. Any .env* file declares a VITE_-prefixed var whose name contains SERVICE_ROLE
 *      (Vite inlines every VITE_* var into the public client bundle).
 *   2. Any file under src/ references import.meta.env.<something>SERVICE_ROLE<...>
 *      (a single such reference ships an admin key to every visitor).
 *
 * Run automatically via the `prebuild` npm script.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = process.cwd();
const violations = [];

// 1) Scan .env* files for VITE_*SERVICE_ROLE* declarations.
for (const name of readdirSync(ROOT)) {
  if (!name.startsWith('.env')) continue;
  let content;
  try {
    content = readFileSync(join(ROOT, name), 'utf-8');
  } catch {
    continue;
  }
  content.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return;
    if (/^VITE_[A-Z0-9_]*SERVICE_ROLE/i.test(trimmed)) {
      violations.push(`${name}:${i + 1}  VITE_-prefixed service_role var → exposed to browser bundle`);
    }
  });
}

// 2) Scan src/ for import.meta.env references to a service key.
const SRC = join(ROOT, 'src');
const CODE_EXT = new Set(['.js', '.ts', '.jsx', '.tsx', '.vue', '.mjs', '.cjs']);
const LEAK_RE = /import\.meta\.env\.[A-Za-z0-9_]*SERVICE_ROLE[A-Za-z0-9_]*/;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walk(full);
    } else if (CODE_EXT.has(extname(entry))) {
      const content = readFileSync(full, 'utf-8');
      content.split(/\r?\n/).forEach((line, i) => {
        if (LEAK_RE.test(line)) {
          violations.push(`${full.replace(ROOT, '.')}:${i + 1}  import.meta.env service_role reference`);
        }
      });
    }
  }
}
try {
  if (statSync(SRC).isDirectory()) walk(SRC);
} catch {
  /* no src dir */
}

if (violations.length) {
  console.error('\n✖ Service-role key leak guard failed (finding #39):\n');
  violations.forEach((v) => console.error('  ' + v));
  console.error('\nThe service_role key bypasses all RLS and must never reach the browser.');
  console.error('Use a non-VITE var name (SUPABASE_SERVICE_ROLE_KEY) read only by Node scripts.\n');
  process.exit(1);
}

console.log('✓ No service-role key exposure detected.');
