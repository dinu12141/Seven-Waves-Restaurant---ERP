// ═══════════════════════════════════════════════════════════════════
// SECRETS & EDGE-FUNCTION HARDENING — regression tests
// Seven Waves ERP — Security
//  - no hardcoded API keys / JWTs / account passwords in the working tree
//  - email goes through the `send-email` edge function (Resend key server-side)
//  - edge functions fail closed when RESEND_API_KEY is missing
//  - security_definer_hardening_133.sql keeps the pre-auth / QR RPCs anon-callable
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.quasar', 'target', 'coverage', 'docs'])
const CODE_EXT = /\.(c?js|mjs|ts|vue|sql|json|ya?ml|toml|md)$/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.env')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (CODE_EXT.test(name) && st.size < 2_000_000) out.push(full)
  }
  return out
}

// Root-level scripts + every code-bearing directory.
const SCAN_DIRS = ['src', 'scripts', 'tests', 'supabase', 'src-tauri', '.github']
const FILES: string[] = [
  ...readdirSync(ROOT)
    .filter((n) => /\.(c?js|mjs|md)$/.test(n))
    .map((n) => join(ROOT, n)),
  ...SCAN_DIRS.filter((d) => existsSync(join(ROOT, d))).flatMap((d) => walk(join(ROOT, d))),
]
const THIS_FILE = relative(ROOT, __filename).replace(/\\/g, '/')

function findings(re: RegExp): string[] {
  const hits: string[] = []
  for (const f of FILES) {
    const rel = relative(ROOT, f).replace(/\\/g, '/')
    if (rel === THIS_FILE) continue
    const src = readFileSync(f, 'utf8')
    if (re.test(src)) hits.push(rel)
    re.lastIndex = 0
  }
  return hits
}

describe('No hardcoded secrets in the working tree', () => {
  it('scans a meaningful number of files', () => {
    expect(FILES.length).toBeGreaterThan(200)
  })

  it('contains no full JWTs (Supabase anon / service_role keys)', () => {
    expect(findings(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/)).toEqual([])
  })

  it('contains no Resend API keys', () => {
    expect(findings(/\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{16,}/)).toEqual([])
  })

  it('contains no Stripe secret keys, Supabase PATs or Google API keys', () => {
    expect(findings(/sk_(live|test)_[A-Za-z0-9]{16,}|sbp_[a-f0-9]{30,}|AIza[0-9A-Za-z_-]{35}/)).toEqual([])
  })

  it('contains no hardcoded production account passwords', () => {
    expect(
      findings(/Admin@123456|Juice@123456|Italian@123456|Benmar@123456|Indian@123456|Waiter@123456|['"`]Test@123['"`]/),
    ).toEqual([])
  })

  it('scripts read the service_role key only from the environment', () => {
    // a literal assignment like  serviceKey = 'eyJ...'  or  SERVICE_ROLE_KEY = "..."
    expect(findings(/SERVICE_ROLE_KEY\s*[:=]\s*['"`][A-Za-z0-9._-]{20,}['"`]/)).toEqual([])
  })
})

// ─── notificationGatewayService: no browser-side Resend ─────────────

const invokeMock = vi.fn()
vi.mock('src/boot/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { code: 'PGRST116' } }) }) }),
      upsert: async () => ({ error: null }),
    }),
  },
}))

function installLocalStorage() {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  }
  return store
}

describe('Email is routed through the send-email edge function', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    installLocalStorage()
  })

  it('source never calls api.resend.com or carries a default key', () => {
    const src = read('src/services/notifications/notificationGatewayService.ts')
    expect(src).not.toMatch(/api\.resend\.com/)
    expect(src).not.toMatch(/resend_api_key:\s*['"`]re_/)
  })

  it('sendEmail invokes send-email and never fetches Resend directly', async () => {
    const fetchSpy = vi.fn()
    const origFetch = globalThis.fetch
    ;(globalThis as any).fetch = fetchSpy
    invokeMock.mockResolvedValue({ data: { success: true, messageId: 'm_1' }, error: null })
    try {
      const { sendEmail } = await import('src/services/notifications/notificationGatewayService')
      const res = await sendEmail({ to: 'owner@example.com', subject: 'S', html: '<p>x</p>' })
      expect(res).toEqual({ success: true, messageId: 'm_1' })
      expect(invokeMock).toHaveBeenCalledTimes(1)
      const [fn, opts] = invokeMock.mock.calls[0] as [string, { body: Record<string, unknown> }]
      expect(fn).toBe('send-email')
      expect(opts.body.to).toEqual(['owner@example.com'])
      expect(opts.body).not.toHaveProperty('resend_api_key')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      ;(globalThis as any).fetch = origFetch
    }
  })

  it('surfaces the edge function error (e.g. RESEND_API_KEY not configured)', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'Email service not configured (RESEND_API_KEY missing)' }) } },
    })
    const { sendEmail } = await import('src/services/notifications/notificationGatewayService')
    const res = await sendEmail({ to: 'a@b.co', subject: 'S', html: 'h' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/RESEND_API_KEY/)
  })

  it('never persists a Resend key to localStorage / system_settings and purges cached ones', async () => {
    const store = installLocalStorage()
    store.set('sw_notification_gateway_config', JSON.stringify({ resend_api_key: 're_leaked', email_from_name: 'X' }))
    const svc = await import('src/services/notifications/notificationGatewayService')
    const cfg = await svc.getGatewayConfig()
    expect(cfg).not.toHaveProperty('resend_api_key')
    expect(store.get('sw_notification_gateway_config')).not.toMatch(/re_leaked/)

    await svc.saveGatewayConfig({ ...cfg, resend_api_key: 're_typed_in_ui' } as any)
    expect(store.get('sw_notification_gateway_config')).not.toMatch(/re_typed_in_ui/)
    expect(svc.sanitizeGatewayConfig({ resend_api_key: 'x', smtp_port: 1 } as any)).toEqual({ smtp_port: 1 })
  })
})

// ─── Edge functions: fail closed, no fallbacks ──────────────────────

describe('Edge functions keep the Resend key server-side and fail closed', () => {
  it('send-email reads RESEND_API_KEY from Deno.env and returns an error when missing', () => {
    const src = read('supabase/functions/send-email/index.ts')
    expect(src).toMatch(/Deno\.env\.get\('RESEND_API_KEY'\)/)
    expect(src).toMatch(/if \(!resendKey\)[\s\S]{0,200}503/)
    expect(src).not.toMatch(/RESEND_API_KEY'\)\s*\|\|/)
    // caller must be authenticated + role-checked before anything is sent
    expect(src).toMatch(/requireRole\(/)
    expect(src).toMatch(/ALLOWED_ROLES = \[/)
  })

  it('system-backup has no baked-in Resend key / owner email and requires admin or service_role', () => {
    const src = read('supabase/functions/system-backup/index.ts')
    expect(src).not.toMatch(/RESEND_API_KEY'\)\s*\|\|/)
    expect(src).not.toMatch(/OWNER_EMAIL'\)\s*\|\|/)
    expect(src).toMatch(/token !== serviceRoleKey/)
    expect(src).toMatch(/r\.roles\?\.name === 'admin'/)
  })

  it('no edge function falls back to a literal secret', () => {
    const fnRoot = join(ROOT, 'supabase', 'functions')
    const offenders = walk(fnRoot).filter((f) =>
      /Deno\.env\.get\('[A-Z_]*(KEY|SECRET|TOKEN)[A-Z_]*'\)\s*(\|\||\?\?)\s*['"`][^'"`]{12,}['"`]/.test(readFileSync(f, 'utf8')),
    )
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([])
  })
})

// ─── SQL hardening files ───────────────────────────────────────────

describe('security_definer_hardening_133.sql', () => {
  const sql = read('supabase/security_definer_hardening_133.sql')
  const code = sql.replace(/--.*$/gm, '')

  it('is transactional', () => {
    expect(code).toMatch(/^\s*BEGIN;/m)
    expect(code).toMatch(/^\s*COMMIT;/m)
  })

  it.each([
    'get_email_by_user_code',
    'get_or_create_session_by_qr',
    'create_kiosk_order',
    'create_order_from_session',
    'get_kiosk_orders',
    'check_qr_rate_limit',
  ])('keeps pre-auth RPC %s anon-callable (allowlisted)', (fn) => {
    const allow = code.match(/v_allow text\[\] := ARRAY\[([\s\S]*?)\];/)
    expect(allow).not.toBeNull()
    expect(allow![1]).toContain(`'${fn}'`)
  })

  it('pins search_path and revokes anon only on SECURITY DEFINER functions', () => {
    expect(code).toMatch(/SET search_path = public, extensions, pg_temp/)
    expect(code).toMatch(/REVOKE EXECUTE ON FUNCTION %s FROM anon/)
    // staff access preserved before PUBLIC is revoked
    expect(code.indexOf('TO authenticated, service_role')).toBeLessThan(code.indexOf('FROM PUBLIC'))
  })

  it('never grants anything to anon/PUBLIC except the restricted restaurant_tables columns', () => {
    const grants = code.match(/GRANT[^;]*TO[^;]*\b(anon|PUBLIC)\b[^;]*/gi) ?? []
    expect(grants.every((g) => /restaurant_tables TO anon/.test(g))).toBe(true)
  })

  it('removes anon access to QR secrets', () => {
    expect(code).toMatch(/'table_qr_tokens'/)
    expect(code).toMatch(/REVOKE ALL ON TABLE public\.restaurant_tables FROM anon/)
    const cols = code.match(/c\.column_name IN \(([\s\S]*?)\)/)
    expect(cols).not.toBeNull()
    expect(cols![1]).not.toMatch(/qr_token|qr_code/)
  })
})

describe('security_hardening_131.sql', () => {
  const code = read('supabase/security_hardening_131.sql').replace(/--.*$/gm, '')

  it('keeps login-by-user-code working for anon while rate limiting it', () => {
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_email_by_user_code\(text\) TO anon, authenticated/)
    expect(code).toMatch(/check_qr_rate_limit\('login_code:'/)
  })

  it('drops the USING(true) realtime bypass and profile lookup policies', () => {
    expect(code).toMatch(/DROP POLICY IF EXISTS "ord_realtime_bypass"/)
    expect(code).toMatch(/DROP POLICY IF EXISTS "profiles_lookup"/)
    expect(code).not.toMatch(/USING\s*\(\s*true\s*\)/i)
  })
})
