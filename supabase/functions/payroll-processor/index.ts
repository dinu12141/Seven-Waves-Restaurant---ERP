// @ts-nocheck
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/**
 * Server-side authorization gate. verify_jwt only proves *some* valid JWT; this
 * function runs a full payroll cycle with the service_role key (bypasses RLS),
 * so it MUST enforce the caller's role. Allows a service_role bearer for
 * cron/server-to-server. Returns null when authorized, else a Response.
 */
async function requireRole(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  allowedRoles: string[],
): Promise<Response | null> {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return jsonRes({ success: false, error: 'Missing Authorization header' }, 401)
  if (token === serviceRoleKey) return null

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
  if (!roles.some((r: string) => allowedRoles.includes(r))) {
    return jsonRes({ success: false, error: 'Insufficient permissions' }, 403)
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    // ── Authorization: running a payroll cycle is admin/hr/finance-only ──
    const denied = await requireRole(req, supabaseUrl, supabaseKey, ['admin', 'hr', 'finance'])
    if (denied) return denied

    const supabase = createClient(supabaseUrl, supabaseKey)

    // ── Parse request body ──────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const period: string = body.period ?? '' // Expected format: "2026-03"

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing or invalid "period" (expected YYYY-MM)' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const [yearStr, monthStr] = period.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)
    const periodStart = `${yearStr}-${monthStr}-01`
    const periodEnd = new Date(year, month, 0).toISOString().split('T')[0] // last day of month

    console.log(`[payroll-processor] Starting payroll for period ${periodStart} → ${periodEnd}`)

    // ── 1. Fetch active employees ───────────────────────────────────
    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('id, full_name, basic_salary, hourly_rate, commission_rate')
      .eq('is_active', true)

    if (empErr) {
      console.error('[payroll-processor] Error fetching employees:', empErr)
      throw empErr
    }

    if (!employees || employees.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed_records: 0, message: 'No active employees found' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`[payroll-processor] Found ${employees.length} active employees`)

    let processedCount = 0
    const errors: Array<{ employee_id: string; error: string }> = []

    // ── 2. Process each employee ────────────────────────────────────
    for (const emp of employees) {
      try {
        // ── 2a. Attendance hours ──────────────────────────────────
        const { data: attendanceLogs, error: attErr } = await supabase
          .from('attendance_logs')
          .select('punch_time, punch_type')
          .eq('employee_code', emp.id)
          .gte('punch_time', `${periodStart}T00:00:00`)
          .lte('punch_time', `${periodEnd}T23:59:59`)
          .order('punch_time', { ascending: true })

        if (attErr) {
          console.error(`[payroll-processor] Attendance error for ${emp.id}:`, attErr)
          throw attErr
        }

        // Pair in/out punches to calculate hours worked
        let totalHours = 0
        const punches = attendanceLogs ?? []
        let lastIn: Date | null = null

        for (const p of punches) {
          if (p.punch_type === 'in') {
            lastIn = new Date(p.punch_time)
          } else if (p.punch_type === 'out' && lastIn) {
            const outTime = new Date(p.punch_time)
            totalHours += (outTime.getTime() - lastIn.getTime()) / (1000 * 60 * 60)
            lastIn = null
          }
        }

        // ── 2b. Commissions ───────────────────────────────────────
        const { data: commissions, error: commErr } = await supabase
          .from('commissions')
          .select('amount')
          .eq('employee_id', emp.id)
          .gte('date', periodStart)
          .lte('date', periodEnd)

        if (commErr) {
          console.error(`[payroll-processor] Commission error for ${emp.id}:`, commErr)
          throw commErr
        }

        const totalCommission = (commissions ?? []).reduce(
          (sum: number, r: { amount: number }) => sum + (r.amount ?? 0),
          0,
        )

        // ── 2c. Deductions (tax, loans, etc.) ─────────────────────
        const { data: deductions, error: dedErr } = await supabase
          .from('deductions')
          .select('amount, type')
          .eq('employee_id', emp.id)
          .gte('date', periodStart)
          .lte('date', periodEnd)

        if (dedErr) {
          console.error(`[payroll-processor] Deduction error for ${emp.id}:`, dedErr)
          throw dedErr
        }

        const totalDeduction = (deductions ?? []).reduce(
          (sum: number, r: { amount: number }) => sum + (r.amount ?? 0),
          0,
        )

        // ── 2d. Salary calculation ────────────────────────────────
        const basicSalary = emp.basic_salary ?? 0
        const hourlyPay = (emp.hourly_rate ?? 0) * totalHours
        const grossSalary = basicSalary + hourlyPay + totalCommission
        const netSalary = grossSalary - totalDeduction

        // ── 2e. Insert into payroll_history ────────────────────────
        const { error: insErr } = await supabase.from('payroll_history').upsert(
          {
            employee_id: emp.id,
            period_start: periodStart,
            period_end: periodEnd,
            total_hours: parseFloat(totalHours.toFixed(2)),
            commission: parseFloat(totalCommission.toFixed(2)),
            deductions: parseFloat(totalDeduction.toFixed(2)),
            gross_salary: parseFloat(netSalary.toFixed(2)),
            processed_at: new Date().toISOString(),
          },
          { onConflict: 'employee_id, period_start, period_end' },
        )

        if (insErr) {
          console.error(`[payroll-processor] Insert error for ${emp.id}:`, insErr)
          throw insErr
        }

        processedCount++
      } catch (empError: any) {
        errors.push({ employee_id: emp.id, error: empError.message ?? 'Unknown error' })
      }
    }

    console.log(
      `[payroll-processor] Done. Processed: ${processedCount}, Errors: ${errors.length}`,
    )

    return new Response(
      JSON.stringify({
        success: true,
        processed_records: processedCount,
        total_employees: employees.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[payroll-processor] Fatal error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message ?? 'Unknown error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
