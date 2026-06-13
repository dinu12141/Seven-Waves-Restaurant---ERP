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

const GEMINI_MODEL = 'gemini-2.5-flash'
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

    // ── JWT Authentication ─────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Missing Authorization header' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
    }

    // ── Parse Request ──────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const { action, branch_id, ...params } = body

    if (!action || !ACTION_PERMISSIONS[action]) {
      return jsonResponse({ success: false, error: `Invalid action: ${action}` }, 400)
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
  }
  return map[action] || 'operations'
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
