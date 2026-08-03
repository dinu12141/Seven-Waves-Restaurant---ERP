// @ts-nocheck
/// <reference lib="deno.ns" />

// ══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — System Backup Edge Function
// ══════════════════════════════════════════════════════════════════════════════
// Thin, read-mostly wrapper around the Supabase Management API's backup
// endpoints. Scope is intentionally minimal and non-destructive:
//
//   action=list      — list existing physical backups (date/status) + the
//                       PITR/physical-backup window for this project.
//   action=trigger    — Management API has NO documented endpoint to trigger
//                       an on-demand physical backup (backups run on a fixed
//                       server-side schedule on Pro+). This action therefore
//                       NEVER creates a backup — it re-fetches the schedule
//                       info and reports the most recent backup + confirms
//                       there is no on-demand mechanism available at this
//                       tier, so the caller can render "next scheduled" UX
//                       instead of pretending to trigger something.
//   action=download   — Management API has NO documented signed-URL/download
//                       endpoint for physical backup files either. This
//                       action returns a clear "not available" response
//                       explaining that restores/downloads must go through
//                       Supabase Dashboard support channels — it does NOT
//                       fabricate a URL.
//
// There is intentionally NO restore action of any kind in this function.
// Restores are explicitly out of scope (see designnew.md §6) — if a restore
// is ever needed it must be done directly via the Supabase Dashboard or
// Supabase support, never through this ERP.
//
// Auth: Requires a valid JWT AND the caller must hold the 'admin' role.
// Uses SUPABASE_SERVICE_ROLE_KEY for the role lookup (bypasses RLS) and a
// separate MGMT_API_TOKEN secret (Management API PAT) for the outbound
// Management API calls. The PAT is NEVER returned to the client.
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_ACTIONS = ['list', 'trigger', 'download']

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/**
 * Server-side authorization gate — mirrors the pattern used by
 * payroll-processor's requireRole(). This endpoint can list/trigger backups
 * of the ENTIRE production database, so it MUST hard-require the 'admin'
 * role — no service-role bearer bypass is offered here (unlike
 * payroll-processor) since there is no legitimate cron/server-to-server
 * caller for this function; every call must be an authenticated admin user.
 * Returns null when authorized, else a Response to short-circuit the request.
 */
async function requireAdmin(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<Response | null> {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return jsonRes({ success: false, error: 'Missing Authorization header' }, 401)

  const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error } = await authClient.auth.getUser()
  if (error || !user) return jsonRes({ success: false, error: 'Invalid or expired token' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: roleRows } = await admin
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', user.id)
  const roles = (roleRows ?? []).map((r: any) => r.roles?.name).filter(Boolean)

  if (!roles.includes('admin')) {
    console.warn(`[system-backup] Rejected non-admin caller: ${user.id} (roles: ${roles.join(',') || 'none'})`)
    return jsonRes({ success: false, error: 'Insufficient permissions: admin role required' }, 403)
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    // NOTE: secret name cannot start with "SUPABASE_" — that prefix is
    // reserved by the platform and `supabase secrets set` rejects it.
    const managementApiToken = Deno.env.get('MGMT_API_TOKEN')
    const projectRef = Deno.env.get('PROJECT_REF') ?? 'clykwuzajtwvwuavmtzs'

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    // ── Authorization: admin-only, no exceptions ──────────────────────────
    const denied = await requireAdmin(req, supabaseUrl, serviceRoleKey)
    if (denied) return denied

    // ── Parse + validate action against a strict allow-list ───────────────
    const body = await req.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : ''

    if (!ALLOWED_ACTIONS.includes(action)) {
      return jsonRes(
        { success: false, error: `Invalid action. Must be one of: ${ALLOWED_ACTIONS.join(', ')}` },
        400,
      )
    }

    if (!managementApiToken) {
      return jsonRes(
        {
          success: false,
          error: 'Management API is not configured on the server (missing MGMT_API_TOKEN secret).',
        },
        500,
      )
    }

    // project_ref is a fixed server-side constant — never taken from client
    // input — so there is no path/parameter injection surface here.
    const mgmtBase = `https://api.supabase.com/v1/projects/${projectRef}`

    // ── action=list: GET /v1/projects/{ref}/database/backups ─────────────
    if (action === 'list') {
      const res = await fetch(`${mgmtBase}/database/backups`, {
        headers: { Authorization: `Bearer ${managementApiToken}` },
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error(`[system-backup] list failed: ${res.status} ${errText}`)
        return jsonRes(
          { success: false, error: `Management API returned ${res.status} while listing backups` },
          502,
        )
      }

      const data = await res.json()
      // Management API does not return a file size for physical backups —
      // only status/timestamp/type. Do not fabricate a size field.
      const backups = (data.backups ?? []).map((b: any) => ({
        status: b.status ?? 'UNKNOWN',
        is_physical_backup: !!b.is_physical_backup,
        inserted_at: b.inserted_at ?? null,
      }))

      return jsonRes({
        success: true,
        region: data.region ?? null,
        pitr_enabled: !!data.pitr_enabled,
        walg_enabled: !!data.walg_enabled,
        physical_backup_window: data.physical_backup_data
          ? {
              earliest_unix: data.physical_backup_data.earliest_physical_backup_date_unix ?? null,
              latest_unix: data.physical_backup_data.latest_physical_backup_date_unix ?? null,
            }
          : null,
        backups,
      })
    }

    // ── action=trigger: no on-demand backup endpoint exists in the ────────
    // Management API today. Backups run automatically on Supabase's fixed
    // daily schedule for Pro+ projects. Rather than silently no-op or call
    // a restore endpoint (out of scope + destructive), report this clearly
    // so the UI can show "next scheduled backup" instead of a fake trigger.
    if (action === 'trigger') {
      const res = await fetch(`${mgmtBase}/database/backups`, {
        headers: { Authorization: `Bearer ${managementApiToken}` },
      })

      let latestUnix: number | null = null
      if (res.ok) {
        const data = await res.json()
        latestUnix = data.physical_backup_data?.latest_physical_backup_date_unix ?? null
      }

      return jsonRes({
        success: true,
        on_demand_supported: false,
        message:
          'On-demand backup triggering is not exposed by the Supabase Management API at this tier. ' +
          'Daily physical backups run automatically on a fixed server-side schedule.',
        latest_backup_unix: latestUnix,
      })
    }

    // ── action=download: no signed-URL/download endpoint exists in the ────
    // Management API for physical backup files. Do not fabricate a URL or
    // proxy bytes that don't exist — report unavailability clearly.
    if (action === 'download') {
      return jsonRes(
        {
          success: false,
          download_supported: false,
          error:
            'Backup file download is not exposed by the Supabase Management API. ' +
            'To obtain a backup file or restore from one, contact Supabase support or use the Supabase Dashboard directly.',
        },
        501,
      )
    }

    // Unreachable due to allow-list check above, but keep a safe fallback.
    return jsonRes({ success: false, error: 'Unhandled action' }, 400)
  } catch (error: any) {
    console.error('[system-backup] Fatal error:', error)
    return jsonRes({ success: false, error: error.message ?? 'Unknown error' }, 500)
  }
})
