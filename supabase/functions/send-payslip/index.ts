// @ts-nocheck
/// <reference lib="deno.ns" />
// ══════════════════════════════════════════════════════════════════════════════
// send-payslip  — Supabase Edge Function
// Fetches payslip breakdown and sends a formatted HTML email via Resend API.
//
// Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL              – automatically injected
//   SUPABASE_SERVICE_ROLE_KEY – automatically injected
//   RESEND_API_KEY            – your Resend.com API key
//   FROM_EMAIL                – verified sender address (e.g. payroll@yourcompany.lk)
//
// Request body (JSON):
//   { payslip_id: string, period_start?: string, period_end?: string }
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function fmtLKR(v: number): string {
  return Number(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildEmailHtml(data: {
  employeeName: string
  employeeCode: string
  designation: string
  periodStart: string
  periodEnd: string
  daysWorked: number
  daysAbsent: number
  lateMinutes: number
  earnings: Array<{ label: string; amount: number }>
  deductions: Array<{ label: string; amount: number }>
  employerContributions: Array<{ label: string; amount: number }>
  gross: number
  net: number
  paymentStatus: string
}): string {
  const earningsRows = data.earnings
    .filter((e) => Number(e.amount) !== 0)
    .map(
      (e) => `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #1f2937;">${e.label}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #1f2937;text-align:right;">LKR ${fmtLKR(e.amount)}</td>
      </tr>`,
    )
    .join('')

  const deductionRows = data.deductions
    .filter((d) => Number(d.amount) !== 0)
    .map(
      (d) => `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #1f2937;">${d.label}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #1f2937;text-align:right;color:#f87171;">LKR ${fmtLKR(d.amount)}</td>
      </tr>`,
    )
    .join('')

  const employerRows = (data.employerContributions || [])
    .filter((c) => Number(c.amount) !== 0)
    .map(
      (c) => `<tr>
        <td style="padding:4px 12px;color:#9ca3af;">${c.label}</td>
        <td style="padding:4px 12px;text-align:right;color:#9ca3af;">LKR ${fmtLKR(c.amount)}</td>
      </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b0f19;font-family:Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:620px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px;text-align:center;border-bottom:3px solid #f9a825;">
      <div style="font-size:22px;font-weight:700;color:#f9a825;letter-spacing:1px;">PAYSLIP</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:4px;">${data.periodStart} — ${data.periodEnd}</div>
    </div>

    <!-- Employee Info -->
    <div style="background:#111827;padding:16px 24px;border-bottom:1px solid #1f2937;">
      <table style="width:100%;font-size:13px;">
        <tr>
          <td style="padding:4px 0;color:#9ca3af;width:40%;">Employee Name</td>
          <td style="padding:4px 0;font-weight:600;">${data.employeeName}</td>
          <td style="padding:4px 0;color:#9ca3af;width:35%;">Employee Code</td>
          <td style="padding:4px 0;font-weight:600;">${data.employeeCode}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Designation</td>
          <td style="padding:4px 0;">${data.designation || '—'}</td>
          <td style="padding:4px 0;color:#9ca3af;">Days Worked</td>
          <td style="padding:4px 0;">${data.daysWorked ?? '—'} (Absent: ${data.daysAbsent ?? 0})</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;">Late Minutes</td>
          <td style="padding:4px 0;color:#fb923c;">${data.lateMinutes ?? 0} min</td>
          <td style="padding:4px 0;color:#9ca3af;">Status</td>
          <td style="padding:4px 0;">
            <span style="background:${data.paymentStatus === 'paid' ? '#065f46' : '#92400e'};color:${data.paymentStatus === 'paid' ? '#34d399' : '#fbbf24'};padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;text-transform:uppercase;">${data.paymentStatus}</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Earnings & Deductions -->
    <div style="display:flex;gap:0;">
      <!-- Earnings -->
      <div style="flex:1;background:#111827;padding:0;">
        <div style="padding:10px 12px;background:#14532d;font-size:11px;font-weight:700;color:#86efac;letter-spacing:0.5px;">EARNINGS</div>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          ${earningsRows}
          <tr style="background:#14532d20;">
            <td style="padding:8px 12px;font-weight:700;color:#4ade80;">GROSS SALARY</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700;color:#4ade80;">LKR ${fmtLKR(data.gross)}</td>
          </tr>
        </table>
      </div>
      <!-- Deductions -->
      <div style="flex:1;background:#111827;padding:0;border-left:1px solid #1f2937;">
        <div style="padding:10px 12px;background:#7f1d1d;font-size:11px;font-weight:700;color:#fca5a5;letter-spacing:0.5px;">DEDUCTIONS</div>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          ${deductionRows}
          <tr style="background:#7f1d1d20;">
            <td style="padding:8px 12px;font-weight:700;color:#f87171;">TOTAL DEDUCTIONS</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700;color:#f87171;">LKR ${fmtLKR(data.gross - data.net)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Net Salary -->
    <div style="background:#1e3a5f;padding:16px 24px;text-align:center;border-top:2px solid #3b82f6;">
      <div style="font-size:13px;color:#93c5fd;margin-bottom:4px;">NET SALARY</div>
      <div style="font-size:26px;font-weight:700;color:#60a5fa;">LKR ${fmtLKR(data.net)}</div>
    </div>

    <!-- Employer Contributions -->
    ${
      employerRows
        ? `<div style="background:#111827;padding:12px 24px;">
      <div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Employer Contributions (Informational)</div>
      <table style="width:100%;font-size:12px;">${employerRows}</table>
    </div>`
        : ''
    }

    <!-- Footer -->
    <div style="background:#0b0f19;padding:16px 24px;text-align:center;border-radius:0 0 12px 12px;border-top:1px solid #1f2937;">
      <div style="font-size:11px;color:#4b5563;">This is a system-generated payslip. Please do not reply to this email.</div>
      <div style="font-size:10px;color:#374151;margin-top:4px;">Restaurant ERP • Confidential</div>
    </div>

  </div>
</body>
</html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey   = Deno.env.get('RESEND_API_KEY')
    const fromEmail   = Deno.env.get('FROM_EMAIL') || 'payroll@restaurant-erp.local'

    const supabase = createClient(supabaseUrl, supabaseKey)

    const body = await req.json().catch(() => ({}))
    const { payslip_id, period_start, period_end } = body

    if (!payslip_id) {
      return jsonRes({ success: false, error: 'payslip_id is required' }, 400)
    }

    // ── Fetch payslip + employee ─────────────────────────────────────────
    const { data: payslip, error: psErr } = await supabase
      .from('payslips')
      .select('*, employees(full_name, employee_code, email)')
      .eq('id', payslip_id)
      .single()

    if (psErr || !payslip) {
      return jsonRes({ success: false, error: psErr?.message || 'Payslip not found' }, 404)
    }

    const employeeEmail = payslip.employees?.email
    if (!employeeEmail) {
      return jsonRes({ success: false, error: 'Employee has no email address on file' }, 422)
    }

    // ── Fetch breakdown ─────────────────────────────────────────────────
    const { data: bd, error: bdErr } = await supabase.rpc('get_payslip_breakdown', {
      p_payslip_id: payslip_id,
    })

    if (bdErr || !bd) {
      return jsonRes({ success: false, error: bdErr?.message || 'Breakdown unavailable' }, 500)
    }

    // ── Build email ─────────────────────────────────────────────────────
    const html = buildEmailHtml({
      employeeName:  bd.employee || payslip.employees?.full_name,
      employeeCode:  bd.code     || payslip.employees?.employee_code,
      designation:   bd.designation,
      periodStart:   period_start || '',
      periodEnd:     period_end   || '',
      daysWorked:    bd.days_worked,
      daysAbsent:    bd.days_absent,
      lateMinutes:   bd.late_minutes,
      earnings:      bd.earnings              || [],
      deductions:    bd.deductions            || [],
      employerContributions: bd.employer_contributions || [],
      gross:         bd.gross,
      net:           bd.net,
      paymentStatus: bd.payment_status || 'pending',
    })

    // ── Send via Resend ─────────────────────────────────────────────────
    if (!resendKey) {
      // Dev mode: return the HTML without sending
      console.warn('[send-payslip] RESEND_API_KEY not set — email not sent')
      return jsonRes({
        success: true,
        mode: 'preview',
        to: employeeEmail,
        message: 'RESEND_API_KEY not configured. Email preview generated but not sent.',
      })
    }

    const emailPayload = {
      from: fromEmail,
      to:   [employeeEmail],
      subject: `Your Payslip — ${period_start || 'Current Period'}`,
      html,
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    })

    const resendBody = await resendRes.json().catch(() => ({}))

    if (!resendRes.ok) {
      console.error('[send-payslip] Resend error:', resendBody)
      return jsonRes(
        { success: false, error: resendBody?.message || 'Email delivery failed' },
        502,
      )
    }

    return jsonRes({
      success:  true,
      to:       employeeEmail,
      email_id: resendBody?.id,
      message:  `Payslip sent to ${employeeEmail}`,
    })
  } catch (err: any) {
    console.error('[send-payslip] Fatal:', err)
    return jsonRes({ success: false, error: err.message || 'Internal error' }, 500)
  }
})
