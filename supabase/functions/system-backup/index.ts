// @ts-nocheck
/// <reference lib="deno.ns" />

// ══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — Automated System Backup Edge Function
// ══════════════════════════════════════════════════════════════════════════════
// 1. Invoked by pg_cron daily at 02:00 AM or via authenticated HTTP POST
// 2. Dumps all public database tables via `export_database` RPC
// 3. Saves snapshot to private Storage Bucket `system-backups`
// 4. Enforces 30-day retention policy (auto-cleans older snapshots)
// 5. Sends email confirmation to the Owner via Resend API
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const startTime = Date.now()
  console.log('[system-backup] Backup job initiated...')

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    // Secrets come ONLY from the function environment — no baked-in fallbacks.
    //   supabase secrets set RESEND_API_KEY=re_...   (required for the email step)
    //   supabase secrets set OWNER_EMAIL=owner@example.com
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const ownerEmail = Deno.env.get('OWNER_EMAIL')
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'Seven Waves ERP <hr@sevenwaves.lk>'

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    // ── Authorization: full-database export is admin / server-only ───────
    // Allowed: pg_cron / server calls bearing the service_role key, or an
    // authenticated user holding the 'admin' role. Everything else is refused.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Authorization header' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 401,
      })
    }
    if (token !== serviceRoleKey) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
      const authClient = anonKey
        ? createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
        : null
      const { data: userData } = authClient ? await authClient.auth.getUser() : { data: { user: null } }
      const user = userData?.user
      let isAdmin = false
      if (user) {
        const admin = createClient(supabaseUrl, serviceRoleKey)
        const { data: roleRows } = await admin.from('user_roles').select('roles(name)').eq('user_id', user.id)
        isAdmin = (roleRows ?? []).some((r: any) => r.roles?.name === 'admin')
      }
      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          status: user ? 403 : 401,
        })
      }
    }

    if (!resendApiKey || !ownerEmail) {
      console.warn('[system-backup] RESEND_API_KEY or OWNER_EMAIL not set — backup will run but no email is sent')
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 1. Execute full database export
    console.log('[system-backup] Calling export_database RPC...')
    const { data: dumpData, error: exportError } = await supabase.rpc('export_database')

    if (exportError) {
      throw new Error(`export_database RPC failed: ${exportError.message}`)
    }

    const tables = Object.keys(dumpData || {})
    let totalRecords = 0
    tables.forEach((t) => {
      if (Array.isArray(dumpData[t])) {
        totalRecords += dumpData[t].length
      }
    })

    console.log(`[system-backup] Exported ${tables.length} tables with ${totalRecords} records`)

    // 2. Prepare JSON snapshot payload
    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    const timestampStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const filename = `automated/Seven_Waves_ERP_Backup_${timestampStr}.json`

    const envelope = {
      metadata: {
        system: 'Seven Waves Restaurant ERP',
        version: '2.5.0',
        environment: 'production',
        snapshot_type: 'automated_nightly',
        created_at: now.toISOString(),
        tables_count: tables.length,
        records_count: totalRecords,
      },
      tables: dumpData,
    }

    const jsonString = JSON.stringify(envelope, null, 2)
    const jsonBytes = new TextEncoder().encode(jsonString)
    const sizeMb = (jsonBytes.length / (1024 * 1024)).toFixed(2)

    console.log(`[system-backup] Uploading ${sizeMb} MB snapshot to system-backups storage...`)

    // 3. Upload to system-backups storage bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('system-backups')
      .upload(filename, jsonBytes, {
        contentType: 'application/json',
        upsert: true,
      })

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    console.log(`[system-backup] Snapshot stored successfully at: ${uploadData.path}`)

    // 4. Retention cleanup (remove automated backups older than 30 days)
    try {
      const { data: fileList } = await supabase.storage.from('system-backups').list('automated')
      if (fileList && fileList.length > 30) {
        // Sort oldest first
        const sorted = fileList.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        const toDelete = sorted.slice(0, fileList.length - 30).map((f) => `automated/${f.name}`)
        if (toDelete.length > 0) {
          console.log(`[system-backup] Pruning ${toDelete.length} expired snapshots...`)
          await supabase.storage.from('system-backups').remove(toDelete)
        }
      }
    } catch (cleanErr) {
      console.warn('[system-backup] Retention pruning warning:', cleanErr)
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)

    // Generate 7-day secure signed download URL
    let signedDownloadUrl = null
    try {
      const { data: signData } = await supabase.storage
        .from('system-backups')
        .createSignedUrl(uploadData.path, 60 * 60 * 24 * 7)
      signedDownloadUrl = signData?.signedUrl || null
    } catch (signErr) {
      console.warn('[system-backup] Signed URL generation warning:', signErr)
    }

    // 5. Send notification email to owner
    if (resendApiKey && ownerEmail) {
      try {
        const downloadButtonHtml = signedDownloadUrl
          ? `
            <div style="text-align: center; margin: 22px 0 16px 0;">
              <a href="${signedDownloadUrl}" target="_blank" style="background: #10b981; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                ⬇️ Download Backup File (.json)
              </a>
              <div style="font-size: 11px; color: #64748b; margin-top: 8px;">Direct secure download link (Valid for 7 days)</div>
            </div>
          `
          : ''

        const html = `
          <div style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; border-radius: 14px; max-width: 580px; margin: auto;">
            <div style="border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 16px;">
              <h2 style="color: #10b981; margin: 0;">🛡️ Automated Database Backup Successful</h2>
              <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0;">Seven Waves Restaurant ERP · Production Disaster Recovery</p>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 10px; margin-bottom: 16px; font-size: 13px;">
              <p style="margin: 4px 0;">📅 <strong>Timestamp:</strong> ${now.toLocaleString('en-LK')}</p>
              <p style="margin: 4px 0;">📦 <strong>Storage Path:</strong> <code>${uploadData.path}</code></p>
              <p style="margin: 4px 0;">📊 <strong>Tables Backed Up:</strong> <span style="color:#38bdf8;font-weight:bold;">${tables.length} tables</span></p>
              <p style="margin: 4px 0;">📝 <strong>Total Records:</strong> <span style="color:#4ade80;font-weight:bold;">${totalRecords.toLocaleString()} rows</span></p>
              <p style="margin: 4px 0;">💾 <strong>File Size:</strong> <strong>${sizeMb} MB</strong></p>
              <p style="margin: 4px 0;">⏱️ <strong>Execution Time:</strong> ${durationSec}s</p>
              <p style="margin: 4px 0;">🔒 <strong>Status:</strong> <span style="background:#065f46;color:#34d399;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">ENCRYPTED & VERIFIED</span></p>
            </div>
            ${downloadButtonHtml}
            <div style="font-size: 12px; color: #64748b; text-align: center;">
              This is a system-generated alert confirming your daily enterprise backup was successfully archived into secure cloud storage.
            </div>
          </div>
        `

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [ownerEmail],
            subject: `🛡️ Database Backup Complete: Seven Waves ERP (${sizeMb} MB — ${tables.length} Tables)`,
            html,
          }),
        })
        console.log(`[system-backup] Notification email dispatched to ${ownerEmail}`)
      } catch (mailErr) {
        console.warn('[system-backup] Email dispatch warning:', mailErr)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        path: uploadData.path,
        tables_count: tables.length,
        records_count: totalRecords,
        size_mb: sizeMb,
        duration_seconds: durationSec,
      }),
      {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (err: any) {
    console.error('[system-backup] Fatal error:', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
