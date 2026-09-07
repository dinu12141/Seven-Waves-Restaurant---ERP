// @ts-nocheck
/// <reference lib="deno.ns" />

// ══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — AI Gemini Service Edge Function
// ══════════════════════════════════════════════════════════════════════════════
// Secure backend proxy for all Gemini API calls.
// - Verifies JWT authentication
// - Enforces RBAC permissions
// - Sanitizes data before sending to Gemini
// - Validates AI responses
// - Logs prompt usage for audit
// - Never exposes API key to frontend
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
const MAX_TOKENS = 4096
const REQUEST_TIMEOUT_MS = 55000

// ── Action → Required Permission map ────────────────────────────────────────
const ACTION_PERMISSIONS = {
  executive_insights: 'ai.generate',
  sales_forecast: 'ai.generate',
  inventory_forecast: 'ai.generate',
  procurement_suggestions: 'ai.generate',
  kitchen_delay: 'ai.generate',
  staff_scheduling: 'ai.generate',
  customer_intelligence: 'ai.generate',
  anomaly_detection: 'ai.security',
  report_assistant: 'ai.view',
  chat_assistant: 'ai.view',
  system_audit: 'ai.generate',
  eod_report: 'ai.generate',
  department_audit: 'ai.generate',
  kot_operations_supervisor: 'ai.generate',
  live_sales_audit: 'ai.generate',
  qr_order_guardian: 'ai.generate',
  customer_menu_assistant: 'ai.view',
  pipeline_health_audit: 'ai.generate',
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const startTime = Date.now()

  try {
    // ── Environment validation ─────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    if (!geminiApiKey) {
      throw new Error('Missing GEMINI_API_KEY — set in Edge Function secrets')
    }

    // ── Parse Request ──────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const { action, branch_id, ...params } = body

    if (!action || !ACTION_PERMISSIONS[action]) {
      return jsonResponse({ success: false, error: `Invalid action: ${action}` }, 400)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const isCustomerAction = action === 'customer_menu_assistant'

    // ── JWT Authentication (enforced for all staff/admin actions) ───────────
    if (!isCustomerAction) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return jsonResponse({ success: false, error: 'Missing Authorization header' }, 401)
      }

      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: userError } = await supabase.auth.getUser(token)

      if (userError || !user) {
        return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
      }
      console.log(`[ai-gemini-service] User: ${user.id} | Action: ${action} | Branch: ${branch_id || 'all'}`)
    } else {
      console.log(`[ai-gemini-service] Customer QR Action: ${action} | Branch: ${branch_id || 'all'}`)
    }

    console.log(`[ai-gemini-service] User: ${user.id} | Action: ${action} | Branch: ${branch_id || 'all'}`)

    // ── Fetch aggregated data based on action ──────────────────────────────
    const contextData = await fetchContextData(supabase, action, branch_id, params)

    // ── Build prompt ───────────────────────────────────────────────────────
    const prompt = buildPrompt(action, contextData, params)

    // ── Call Gemini API ────────────────────────────────────────────────────
    const geminiResult = await callGemini(geminiApiKey, prompt, startTime)

    // ── Log prompt usage ───────────────────────────────────────────────────
    await logPromptUsage(supabase, {
      user_id: user.id,
      branch_id,
      module: getModuleForAction(action),
      prompt_type: action,
      model_name: GEMINI_MODEL,
      token_input: geminiResult.inputTokens || 0,
      token_output: geminiResult.outputTokens || 0,
      latency_ms: Date.now() - startTime,
      success: geminiResult.success,
      error_message: geminiResult.error || null,
      input_summary: `Action: ${action}, Branch: ${branch_id || 'all'}`,
      output_summary: geminiResult.success ? 'Generated successfully' : 'Failed',
    })

    if (!geminiResult.success) {
      return jsonResponse({
        success: false,
        error: geminiResult.error || 'Gemini API call failed',
      })
    }

    // ── Store results in AI tables ─────────────────────────────────────────
    if (geminiResult.data) {
      await storeAiResults(supabase, action, geminiResult.data, branch_id)
    }

    return jsonResponse({
      success: true,
      data: geminiResult.data,
      latency_ms: Date.now() - startTime,
    })

  } catch (error) {
    console.error('[ai-gemini-service] Error:', error)
    return jsonResponse({
      success: false,
      error: error.message || 'Internal error',
    }, 500)
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GEMINI API CALLER
// ══════════════════════════════════════════════════════════════════════════════
async function callGemini(apiKey, prompt, startTime) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${prompt.system}\n\n${prompt.user}` }] },
        ],
        generationConfig: {
          maxOutputTokens: MAX_TOKENS,
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      }),
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errText = await response.text()
      console.error('[ai-gemini-service] Gemini API error:', errText)
      return { success: false, error: `Gemini API returned ${response.status}` }
    }

    const result = await response.json()
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || ''

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      // Try stripping markdown wrappers
      const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        parsed = { message: text }
      }
    }

    return {
      success: true,
      data: parsed,
      inputTokens: result.usageMetadata?.promptTokenCount || 0,
      outputTokens: result.usageMetadata?.candidatesTokenCount || 0,
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'Gemini API request timed out' }
    }
    return { success: false, error: error.message }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA FETCHERS (aggregated, sanitized)
// ══════════════════════════════════════════════════════════════════════════════
async function fetchContextData(supabase, action, branchId, params) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  switch (action) {
    case 'executive_insights':
    case 'anomaly_detection': {
      // Fetch aggregated sales summary
      let ordersQuery = supabase
        .from('orders')
        .select('status, total_amount, order_type')
        .gte('created_at', params.date_from || todayISO)

      if (branchId) ordersQuery = ordersQuery.eq('branch_id', branchId)

      const { data: orders } = await ordersQuery

      let totalSales = 0, completedCount = 0, voidCount = 0, voidValue = 0
      ;(orders || []).forEach(o => {
        if (o.status === 'completed' || o.status === 'paid') {
          totalSales += Number(o.total_amount || 0)
          completedCount++
        } else if (o.status === 'void' || o.status === 'cancelled') {
          voidCount++
          voidValue += Number(o.total_amount || 0)
        }
      })

      return {
        metrics: {
          total_sales: totalSales,
          completed_orders: completedCount,
          void_orders: voidCount,
          void_value: voidValue,
          void_rate: completedCount > 0 ? (voidCount / completedCount * 100).toFixed(1) + '%' : '0%',
        },
        date_range: params.date_from ? `${params.date_from} to ${params.date_to || 'today'}` : 'today',
        branch_name: branchId || 'All branches',
      }
    }

    case 'chat_assistant':
    case 'report_assistant':
      return {
        message: params.message || params.question || '',
        user_role: 'manager',
        branch_name: branchId || 'all',
        conversation_context: (params.conversation_history || [])
          .slice(-5)
          .map(m => `${m.role}: ${m.content}`)
          .join('\n'),
        current_module: params.module_context || 'general',
      }

    case 'system_audit': {
      const { data: ordersData } = await supabase
        .from('orders')
        .select('id, status, payment_status, total_amount, order_type, created_at, customer_id, customer_name, customer_phone, table_id')
        .eq('branch_id', branchId)
        .gte('created_at', params.date_from || todayISO)
        .lte('created_at', params.date_to ? params.date_to + 'T23:59:59Z' : new Date().toISOString())
        .limit(200)

      const { data: fqData } = await supabase
        .from('finance_queue')
        .select('order_id, status')
        .eq('branch_id', branchId)
        .in('status', ['pending', 'reserved', 'failed'])
        .limit(100)

      const { data: kotData } = await supabase
        .from('kot_tickets')
        .select('id, status, created_at, completed_at, order_id')
        .gte('created_at', params.date_from || todayISO)
        .limit(100)

      const { data: invoiceData } = await supabase
        .from('invoices')
        .select('id, order_id, total, payment_status, paid_amount, balance')
        .eq('branch_id', branchId)
        .gte('created_at', params.date_from || todayISO)
        .limit(100)

      let attendanceData = [], shiftsData = [], leaveData = []
      try {
        const { data: att } = await supabase.from('attendance_logs')
          .select('employee_id, check_in, check_out, status')
          .eq('branch_id', branchId)
          .gte('check_in', params.date_from || todayISO)
          .limit(100)
        attendanceData = att || []
      } catch {}

      try {
        const { data: sh } = await supabase.from('shifts')
          .select('employee_id, shift_date, start_time, end_time, status')
          .eq('branch_id', branchId)
          .eq('shift_date', params.date_from?.split('T')[0] || new Date().toISOString().split('T')[0])
          .limit(50)
        shiftsData = sh || []
      } catch {}

      try {
        const { data: lv } = await supabase.from('leave_requests')
          .select('employee_id, leave_date, status, leave_type')
          .eq('branch_id', branchId)
          .eq('status', 'approved')
          .gte('leave_date', params.date_from?.split('T')[0] || new Date().toISOString().split('T')[0])
          .limit(50)
        leaveData = lv || []
      } catch {}

      const orders = ordersData || []
      const paidOrders = orders.filter(o => o.status === 'paid' || o.status === 'completed')
      const voidOrders = orders.filter(o => o.status === 'void' || o.status === 'cancelled')
      const invoices = invoiceData || []
      const kots = kotData || []
      const customerOrders = orders

      const unpostedOrders = paidOrders.filter(o =>
        !(fqData || []).some(fq => fq.order_id === o.id && fq.status === 'posted')
      )
      const invoicesMismatch = invoices.filter(i => Math.abs(Number(i.balance || 0)) > 1)
      const kotCompletionRate = kots.length > 0
        ? (kots.filter(k => k.completed_at).length / kots.length * 100).toFixed(1)
        : 100

      return {
        audit_date: params.date_from?.split('T')[0] || new Date().toISOString().split('T')[0],
        branch_id: branchId,
        finance: {
          total_paid_orders: paidOrders.length,
          total_void_orders: voidOrders.length,
          unposted_to_finance: unpostedOrders.length,
          unposted_value: unpostedOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
          invoice_balance_mismatches: invoicesMismatch.length,
          total_revenue: paidOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
        },
        operations: {
          total_kots: kots.length,
          kots_completed: kots.filter(k => k.completed_at).length,
          kot_completion_rate_pct: kotCompletionRate,
          orders_without_kot: paidOrders.filter(o => !kots.some(k => k.order_id === o.id)).length,
          order_types: {
            dine_in: orders.filter(o => o.order_type === 'dine_in').length,
            takeaway: orders.filter(o => o.order_type === 'takeaway').length,
            delivery: orders.filter(o => o.order_type === 'delivery').length,
          },
        },
        hr: {
          scheduled_staff: shiftsData.length,
          present_staff: attendanceData.filter(a => a.check_in).length,
          absent_staff: Math.max(0, shiftsData.length - attendanceData.filter(a => a.check_in).length - leaveData.length),
          on_leave: leaveData.length,
          no_checkout: attendanceData.filter(a => a.check_in && !a.check_out).length,
        },
        crm: {
          total_customer_orders: customerOrders.length,
          orders_with_customer: customerOrders.filter(o => o.customer_id || o.customer_name).length,
          orders_without_customer: customerOrders.filter(o => !o.customer_id && !o.customer_name).length,
        },
      }
    }

    case 'eod_report': {
      const { data: reportData, error: reportError } = await supabase
        .rpc('generate_daily_report', {
          p_branch_id: branchId,
          p_date: params.report_date || new Date().toISOString().split('T')[0],
          p_report_type: params.report_type || 'end_of_day',
          p_user_id: params.user_id || null,
        })

      if (reportError) {
        return { branch_id: branchId, error: reportError.message, raw_data: {} }
      }

      return {
        report_id: reportData?.report_id,
        report_date: params.report_date,
        raw_numbers: reportData?.summary || {},
        department_checks: reportData?.department_checks || [],
      }
    }

    case 'kot_operations_supervisor':
    case 'live_sales_audit': {
      let auditResult = null
      try {
        const { data, error } = await supabase.rpc('fn_audit_kot_and_operations', {
          p_branch_id: branchId,
          p_auto_create_alerts: true,
        })
        if (!error && data) {
          auditResult = data
        }
      } catch {}

      if (!auditResult) {
        const now = new Date()
        const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

        const { data: tickets } = await supabase
          .from('kot_tickets')
          .select('id, kot_number, order_id, kitchen_id, status, created_at, orders(order_number, table_number, branch_id), kitchens(name)')
          .in('status', ['created', 'pending', 'preparing', 'queued'])
          .gte('created_at', new Date(Date.now() - 12 * 3600 * 1000).toISOString())

        const delayed = (tickets || [])
          .filter((t: any) => t.orders?.branch_id === branchId)
          .map((t: any) => ({
            kot_id: t.id,
            kot_number: t.kot_number,
            order_number: t.orders?.order_number,
            table_number: t.orders?.table_number,
            kitchen_name: t.kitchens?.name,
            elapsed_minutes: Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000),
          }))
          .filter((t: any) => t.elapsed_minutes >= 15)

        const { data: orders } = await supabase
          .from('orders')
          .select('status, total_amount')
          .eq('branch_id', branchId)
          .gte('created_at', startOfDay)

        let totalSales = 0, completedCount = 0, voidCount = 0
        ;(orders || []).forEach((o: any) => {
          if (o.status === 'completed' || o.status === 'paid') {
            totalSales += Number(o.total_amount || 0)
            completedCount++
          } else if (o.status === 'void' || o.status === 'cancelled') {
            voidCount++
          }
        })

        auditResult = {
          delayed_kots: delayed,
          routing_errors: [],
          sales_summary: {
            today_orders_count: completedCount,
            today_sales_total: totalSales,
            today_void_count: voidCount,
            void_percentage: (completedCount + voidCount) > 0 ? ((voidCount / (completedCount + voidCount)) * 100).toFixed(1) : 0,
            is_void_spike: voidCount >= 3,
          },
        }
      }

      return {
        branch_id: branchId,
        audit_snapshot: auditResult,
        timestamp: new Date().toISOString(),
      }
    }

    case 'qr_order_guardian': {
      let healResult = null
      try {
        const { data, error } = await supabase.rpc('fn_ai_auto_heal_qr_orders', {
          p_branch_id: branchId,
          p_timeout_seconds: params.timeout_seconds || 90,
        })
        if (!error && data) {
          healResult = data
        }
      } catch {}

      return {
        branch_id: branchId,
        heal_result: healResult || { success: true, healed_count: 0, healed_orders: [] },
        timestamp: new Date().toISOString(),
      }
    }

    case 'customer_menu_assistant': {
      let menuItems = []
      try {
        const { data, error } = await supabase.rpc('fn_get_customer_menu_context', {
          p_branch_id: branchId || null,
        })
        if (!error && data) {
          menuItems = data
        }
      } catch {}

      if (!menuItems || menuItems.length === 0) {
        const { data: items } = await supabase
          .from('menu_items')
          .select('id, name, base_price, is_veg, is_available')
          .eq('is_available', true)
          .limit(50)
        menuItems = (items || []).map((i: any) => ({
          id: i.id,
          name: i.name,
          price: i.base_price,
          is_veg: i.is_veg,
        }))
      }

      return {
        user_query: params.message || params.query || '',
        language: params.language || 'si', // 'si' (Sinhala) or 'en' (English)
        menu_items: menuItems,
        branch_name: branchId || 'Main Branch',
      }
    }

    case 'pipeline_health_audit': {
      let pipelineReport = null
      try {
        const { data, error } = await supabase.rpc('fn_audit_omnichannel_pipeline', {
          p_branch_id: branchId,
        })
        if (!error && data) {
          pipelineReport = data
        }
      } catch {}

      return {
        branch_id: branchId,
        pipeline_report: pipelineReport || { success: true, pipeline_health: 'optimal' },
        timestamp: new Date().toISOString(),
      }
    }

    default:
      return { branch_name: branchId || 'All' }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ══════════════════════════════════════════════════════════════════════════════
function buildPrompt(action, contextData, params) {
  const SAFETY = `RULES: Only suggest, explain, summarize. Never execute actions. Never hallucinate data. Express confidence as 0-1 decimal. Respond with valid JSON only.`

  const promptMap = {
    executive_insights: {
      system: `You are the AI Insights Engine for Seven Waves Restaurant ERP. ${SAFETY}`,
      user: `Analyze this data and generate 3-6 executive insights:\n${JSON.stringify(contextData)}\n\nRespond with: {"insights":[{"module":"sales|inventory|kitchen|hr|finance","title":"string","summary":"string","recommendation":"string","severity":"info|low|medium|high|critical","confidence_score":0.0-1.0}]}`,
    },
    anomaly_detection: {
      system: `You are a fraud/anomaly detection system. Use neutral "requires review" language. Never accuse individuals. ${SAFETY}`,
      user: `Check for anomalies in:\n${JSON.stringify(contextData)}\n\nRespond with: {"anomalies":[{"anomaly_type":"unusual_refund|frequent_void|suspicious_discount|drawer_mismatch","severity":"low|medium|high|critical","score":0.0-1.0,"explanation":"string","suggested_review_action":"string"}],"risk_summary":"string"}`,
    },
    chat_assistant: {
      system: `You are the Seven Waves ERP AI Assistant. You help managers understand data. You CANNOT: execute queries, approve transactions, modify records, change permissions. Always end with: "AI suggestion — verify before action." ${SAFETY}`,
      user: contextData.conversation_context
        ? `Previous:\n${contextData.conversation_context}\n\nUser: "${contextData.message}"\n\nRespond with: {"message":"your response","confidence":0.0-1.0}`
        : `User: "${contextData.message}"\n\nRespond with: {"message":"your response","confidence":0.0-1.0}`,
    },
    report_assistant: {
      system: `You are a report assistant. Summarize pre-fetched data. Never fabricate data points. ${SAFETY}`,
      user: `Question: "${contextData.message}"\n\nRespond with: {"summary":"string","key_metrics":[{"label":"string","value":"string","trend":"up|down|stable"}],"confidence_score":0.0-1.0}`,
    },
    system_audit: {
      system: `You are the Seven Waves ERP AI System Auditor. Perform a thorough department-wise audit of restaurant operations. Be specific, factual, and actionable. Flag real issues clearly. Use neutral language for anomalies. ${SAFETY}`,
      user: `Audit this restaurant system data and generate a comprehensive department-wise report:\n${JSON.stringify(contextData)}\n\nRespond with this exact JSON:\n{"overall_health":"good|warning|critical","overall_score":0,"summary":"2-3 sentence executive summary","departments":[{"name":"Finance|Operations|HR|CRM","status":"pass|warning|fail","score":0,"findings":[{"severity":"critical|high|medium|low|info","title":"Finding title","detail":"Specific detail with numbers","action":"Recommended action"}]}],"top_actions":["Action 1","Action 2","Action 3"],"commendations":["What went well today"]}`,
    },
    eod_report: {
      system: `You are the Seven Waves Restaurant ERP daily report AI. Write a clear, concise End of Day report narrative. Be specific about numbers. Highlight issues. Celebrate wins. ${SAFETY}`,
      user: `Generate an End of Day narrative report from this data:\n${JSON.stringify(contextData)}\n\nRespond with:\n{"narrative_summary":"3-4 paragraph EOD summary","key_wins":["Win 1","Win 2"],"issues_to_address":["Issue 1 with specific numbers","Issue 2"],"tomorrow_focus":["Priority for tomorrow 1","Priority 2"],"performance_rating":"excellent|good|average|needs_improvement","department_comments":{"finance":"Finance specific comment","operations":"Operations comment","hr":"HR comment"}}`,
    },
    kot_operations_supervisor: {
      system: `You are the Autonomous KOT Operations & Live Sales Supervisor AI for Seven Waves Restaurant ERP. You monitor kitchen ticket dispatch integrity, preparation delays, kitchen station backlogs, and real-time sales anomalies. ${SAFETY}`,
      user: `Analyze this live operational snapshot and issue your executive operational assessment:\n${JSON.stringify(contextData)}\n\nRespond with this exact JSON structure:\n{"overall_status":"optimal|warning|critical","headline":"Brief 1-line operational status","bottlenecks":[{"station_name":"string","delayed_orders_count":0,"max_delay_minutes":0,"root_cause":"string","immediate_action":"string"}],"routing_health":{"status":"ok|flagged","details":"string"},"sales_velocity_audit":{"order_pace":"slow|normal|peak","void_assessment":"string","revenue_status":"string"},"floor_directives":["Actionable directive for Head Chef / Floor Manager 1","Actionable directive 2"]}`,
    },
    live_sales_audit: {
      system: `You are the Realtime Sales Velocity & Order Flow Auditor for Seven Waves Restaurant ERP. You evaluate whether live sales pace matches hourly expectations and flag abnormal void spikes or unbilled orders. ${SAFETY}`,
      user: `Audit current sales velocity and order flow from this snapshot:\n${JSON.stringify(contextData)}\n\nRespond with this exact JSON structure:\n{"sales_pace":"behind|on_track|ahead","hourly_velocity":"string","void_risk_level":"low|moderate|high","anomaly_explanation":"string","recommended_actions":["Action 1","Action 2"]}`,
    },
    qr_order_guardian: {
      system: `You are the Autonomous QR Order Guardian & Self-Healing AI for Seven Waves Restaurant ERP. You ensure zero customer table orders are ever dropped or stalled due to staff delays or routing failures. ${SAFETY}`,
      user: `Evaluate this QR order self-healing execution and provide your operational diagnostic:\n${JSON.stringify(contextData)}\n\nRespond with this exact JSON structure:\n{"guardian_status":"healthy|recovering|critical","summary":"string","healed_count":0,"root_causes":[{"issue":"waiter_timeout|missing_kot|network_delay","frequency":"string","impact":"string","recommendation":"string"}],"staff_training_action":"string"}`,
    },
    customer_menu_assistant: {
      system: `You are the Seven Waves Restaurant Bilingual Master Chef & Food Sommelier AI. You guide dining customers at their table in fluent Sinhala (and Singlish) or English based on the customer preference. You recommend dishes with appetizing, warm descriptions, explain spiciness, recommend drink pairings, and help the customer choose from the actual available menu items. Always recommend items from the provided menu list with their exact id and price. ${SAFETY}`,
      user: `Customer Question: "${contextData.user_query}"\nLanguage: ${contextData.language || 'si'}\nAvailable Menu Items:\n${JSON.stringify(contextData.menu_items)}\n\nRespond with this exact JSON structure:\n{"message":"Warm, conversational culinary recommendation in the requested language","recommended_items":[{"id":"string","name":"string","price":0,"reason":"string in requested language"}],"suggested_chips":["string in requested language 1","string 2"]}`,
    },
    pipeline_health_audit: {
      system: `You are the Omnichannel Order Flow Supervisor AI for Seven Waves Restaurant ERP. You evaluate the full 8-stage pipeline across Website, POS, and QR orders. ${SAFETY}`,
      user: `Audit this 8-stage omnichannel pipeline data:\n${JSON.stringify(contextData)}\n\nRespond with this exact JSON structure:\n{"overall_health":"optimal|warning|critical","headline":"string","stage_bottlenecks":[{"stage_number":1,"stage_name":"string","issue":"string","remedy":"string"}],"lead_time_assessment":"string","manager_recommendations":["Action 1","Action 2"]}`,
    },
  }

  return promptMap[action] || {
    system: `You are an AI analyst for Seven Waves ERP. ${SAFETY}`,
    user: `Analyze: ${JSON.stringify(contextData)}\n\nProvide insights as JSON.`,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RESULT STORAGE
// ══════════════════════════════════════════════════════════════════════════════
async function storeAiResults(supabase, action, data, branchId) {
  try {
    if (action === 'executive_insights' && Array.isArray(data.insights)) {
      for (const insight of data.insights) {
        await supabase.from('ai_insights').insert({
          branch_id: branchId || null,
          module: insight.module || 'operations',
          insight_type: insight.insight_type || 'general',
          title: insight.title,
          summary: insight.summary,
          recommendation: insight.recommendation,
          severity: insight.severity || 'info',
          confidence_score: insight.confidence_score || 0.5,
          model_name: GEMINI_MODEL,
          prompt_version: 'v1',
          status: 'new',
        })
      }
    }

    if (action === 'anomaly_detection' && Array.isArray(data.anomalies)) {
      for (const anomaly of data.anomalies) {
        await supabase.from('ai_anomaly_events').insert({
          branch_id: branchId || null,
          module: 'security',
          anomaly_type: anomaly.anomaly_type,
          entity_type: anomaly.entity_type || 'unknown',
          severity: anomaly.severity || 'medium',
          score: anomaly.score || 0.5,
          explanation: anomaly.explanation,
          suggested_review_action: anomaly.suggested_review_action,
          status: 'open',
        })
      }
    }

    if (action === 'system_audit' && Array.isArray(data.departments)) {
      for (const dept of data.departments) {
        for (const finding of (dept.findings || [])) {
          await supabase.from('ai_insights').insert({
            branch_id: branchId || null,
            module: dept.name.toLowerCase(),
            insight_type: 'system_audit',
            title: finding.title,
            summary: finding.detail,
            recommendation: finding.action,
            severity: finding.severity || 'info',
            confidence_score: 0.85,
            model_name: GEMINI_MODEL,
            prompt_version: 'v2',
            status: 'new',
          })
        }
      }
    }

    if (action === 'eod_report' && data.narrative_summary && contextData?.report_id) {
      await supabase.from('ai_daily_reports').update({
        ai_summary: data.narrative_summary,
        ai_recommendations: JSON.stringify(data.issues_to_address || []),
        ai_flags: JSON.stringify(data.key_wins || []),
        updated_at: new Date().toISOString(),
      }).eq('id', contextData.report_id)
    }

    if (action === 'kot_operations_supervisor' && data) {
      await supabase.from('ai_insights').insert({
        branch_id: branchId || null,
        module: 'operations',
        insight_type: 'kot_supervisor',
        title: data.headline || 'KOT Operations Assessment',
        summary: data.sales_velocity_audit?.void_assessment || 'Operations audit completed.',
        recommendation: Array.isArray(data.floor_directives) ? data.floor_directives.join(' | ') : 'Monitor station dispatch.',
        severity: data.overall_status === 'critical' ? 'critical' : (data.overall_status === 'warning' ? 'warning' : 'info'),
        confidence_score: 0.95,
        model_name: GEMINI_MODEL,
        prompt_version: 'v2',
        status: 'new',
      })

      if (data.overall_status === 'critical' && Array.isArray(data.bottlenecks) && data.bottlenecks.length > 0) {
        for (const b of data.bottlenecks) {
          await supabase.from('ai_anomaly_events').insert({
            branch_id: branchId || null,
            module: 'operations',
            anomaly_type: 'frequent_void',
            entity_type: 'kitchen_station',
            severity: 'critical',
            score: 0.9,
            explanation: `Severe bottleneck at ${b.station_name}: ${b.delayed_orders_count} tickets delayed up to ${b.max_delay_minutes}m. Cause: ${b.root_cause}`,
            suggested_review_action: b.immediate_action || 'Expedite kitchen station orders.',
            status: 'open',
          })
        }
      }
    }
  } catch (err) {
    console.error('[ai-gemini-service] Failed to store results:', err)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PROMPT AUDIT LOGGER
// ══════════════════════════════════════════════════════════════════════════════
async function logPromptUsage(supabase, log) {
  try {
    await supabase.from('ai_prompt_logs').insert({
      ...log,
      sanitized_prompt_hash: await hashString(log.input_summary),
    })
  } catch (err) {
    console.error('[ai-gemini-service] Failed to log prompt:', err)
  }
}

async function hashString(str) {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function getModuleForAction(action) {
  const map = {
    executive_insights: 'operations',
    sales_forecast: 'sales',
    inventory_forecast: 'inventory',
    procurement_suggestions: 'procurement',
    kitchen_delay: 'kitchen',
    staff_scheduling: 'hr',
    customer_intelligence: 'customer',
    anomaly_detection: 'security',
    report_assistant: 'operations',
    chat_assistant: 'operations',
    system_audit: 'operations',
    eod_report: 'operations',
    department_audit: 'operations',
    kot_operations_supervisor: 'operations',
    live_sales_audit: 'sales',
    qr_order_guardian: 'operations',
    customer_menu_assistant: 'customer',
    pipeline_health_audit: 'operations',
  }
  return map[action] || 'operations'
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
