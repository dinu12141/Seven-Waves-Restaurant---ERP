// @ts-nocheck
/// <reference lib="deno.ns" />
// ══════════════════════════════════════════════════════════════════════════════
// send-email — Supabase Edge Function (server-side Resend proxy)
//
// The browser must never hold the Resend API key. Client code calls
//   supabase.functions.invoke('send-email', { body: { to, subject, html, attachments? } })
// and this function sends via Resend using a server-side secret.
//
// Required secrets (fail closed if missing):
//   RESEND_API_KEY   supabase secrets set RESEND_API_KEY=re_...
// Optional:
//   FROM_EMAIL       e.g. "Seven Waves ERP <hr@sevenwaves.lk>" (verified Resend sender)
// Injected by the platform: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Authorization: caller must be an authenticated staff user holding one of
// ALLOWED_ROLES, or present the service_role key (server-to-server / cron).
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_ROLES = ['admin', 'manager', 'hr', 'finance']
const MAX_RECIPIENTS = 20
const MAX_HTML_BYTES = 512 * 1024
const MAX_ATTACHMENTS = 5
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function requireRole(req: Request, supabaseUrl: string, serviceRoleKey: string): Promise<Response | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return jsonRes({ success: false, error: 'Missing Authorization header' }, 401)
  if (token === serviceRoleKey) return null

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!anonKey) return jsonRes({ success: false, error: 'Server misconfigured' }, 500)

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user }, error } = await authClient.auth.getUser()
  if (error || !user) return jsonRes({ success: false, error: 'Invalid or expired token' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: roleRows } = await admin.from('user_roles').select('roles(name)').eq('user_id', user.id)
  const roles = (roleRows ?? []).map((r: any) => r.roles?.name).filter(Boolean)
  if (!roles.some((r: string) => ALLOWED_ROLES.includes(r))) {
    return jsonRes({ success: false, error: 'Insufficient permissions' }, 403)
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return jsonRes({ success: false, error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') || 'Seven Waves ERP <hr@sevenwaves.lk>'

  // Fail closed: never fall back to a baked-in key.
  if (!supabaseUrl || !serviceRoleKey) return jsonRes({ success: false, error: 'Server misconfigured' }, 500)
  if (!resendKey) {
    console.error('[send-email] RESEND_API_KEY secret is not set')
    return jsonRes({ success: false, error: 'Email service not configured (RESEND_API_KEY missing)' }, 503)
  }

  const denied = await requireRole(req, supabaseUrl, serviceRoleKey)
  if (denied) return denied

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return jsonRes({ success: false, error: 'Invalid JSON body' }, 400)

  const to: string[] = (Array.isArray(body.to) ? body.to : [body.to]).filter(Boolean).map((s: unknown) => String(s).trim())
  const subject = typeof body.subject === 'string' ? body.subject.slice(0, 300) : ''
  const html = typeof body.html === 'string' ? body.html : ''

  if (to.length === 0 || to.length > MAX_RECIPIENTS || !to.every((e) => EMAIL_RE.test(e))) {
    return jsonRes({ success: false, error: 'Invalid recipient list' }, 400)
  }
  if (!subject || !html) return jsonRes({ success: false, error: 'subject and html are required' }, 400)
  if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) {
    return jsonRes({ success: false, error: 'html body too large' }, 413)
  }

  let attachments: Array<{ filename: string; content: string }> | undefined
  if (Array.isArray(body.attachments) && body.attachments.length > 0) {
    if (body.attachments.length > MAX_ATTACHMENTS) return jsonRes({ success: false, error: 'Too many attachments' }, 400)
    attachments = body.attachments.map((a: any) => ({ filename: String(a?.filename ?? 'attachment'), content: String(a?.content ?? '') }))
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to, subject, html, attachments }),
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[send-email] Resend error', res.status, result?.message)
      return jsonRes({ success: false, error: result?.message || `Resend error (${res.status})` }, 502)
    }
    return jsonRes({ success: true, messageId: result?.id })
  } catch (err: any) {
    console.error('[send-email] dispatch failed', err?.message)
    return jsonRes({ success: false, error: 'Email dispatch failed' }, 502)
  }
})
