# AI Module Audit — Seven Waves ERP
**Auditor:** AIFix  
**Date:** 2026-07-18  
**Scope:** `src/modules/ai/` — service, store, pages, components, schemas, composables, tests

---

## CRITICAL Issues

### AI-CRIT-001 — Cross-branch recommendation count in `getAiDashboardSummary`
- **[ai.service.js:369]** The `ai_recommendations` query in `getAiDashboardSummary()` does NOT filter by `branch_id`. All pending recommendations from all branches are counted and shown in the KPI card.
- **Root cause:** `.eq('status', 'pending')` only — missing `.eq('branch_id', branchId)`
- **Impact:** Multi-branch tenants see inflated "Pending Actions" count. Potential cross-branch data leakage.
- **Fix:** Add `.eq('branch_id', branchId)` to the recommendations count query.

---

## HIGH Issues

### AI-HIGH-001 — Forecast page shows no stored data on load
- **[AiForecastPage.vue]** No `onMounted` call to load existing forecasts. `aiStore.loadForecasts(branchId.value)` is never called. Page always shows "No forecasts generated yet" even when the DB has stored forecasts.
- **Fix:** Add `onMounted(() => aiStore.loadForecasts(branchId.value))` to `AiForecastPage.vue`.

### AI-HIGH-002 — Chat history sent with current message duplicated
- **[ai.store.js:230-238]** `sendMessage()` pushes the user message to `chatMessages.value` at line 231, then passes the full `chatMessages.value` array as `conversationHistory` at line 238. This means the current user message appears both as the dedicated `message` field AND as the last item of `conversation_history` sent to the Edge Function. Gemini may process the user's last message twice.
- **Fix:** Pass history without the current message: `chatMessages.value.slice(0, -1)` as `conversationHistory`.

---

## MEDIUM Issues

### AI-MED-001 — No null guard on `branchId` before store calls
- **[AiDashboardPage.vue:150]** `aiStore.loadDashboard(branchId.value)` is called on mount even when `branchId.value` is `undefined` (user has no branch assigned). Supabase queries with `.eq('branch_id', undefined)` may return unexpected results or throw.
- Same issue in **AiAnomalyCenterPage.vue:119,126** for `loadAnomalies` and `runAnomalyDetection`.
- **Fix:** Guard with `if (!branchId.value) return` before calling store actions.

### AI-MED-002 — Double filtering on anomaly page
- **[AiAnomalyCenterPage.vue:109-123]** Filters are passed to `loadAnomalies()` (server-side) AND applied again in the `filteredAnomalies` computed property (client-side). When user changes filters, the server re-fetches with them, then the computed re-filters the already-filtered results. Redundant but not currently a correctness bug since both filters are identical.
- **Fix:** Either do server-only filtering (remove computed filter, use `aiStore.anomalies` directly) or do client-only filtering (load all, filter in computed). Server-side is preferred for large datasets.

### AI-MED-003 — `runAnomalyDetection` reloads without active filters
- **[ai.store.js:138]** After a scan completes, `loadAnomalies(branchId)` is called with no filters. If the user had severity/status filters active on the anomaly page, the store now holds unfiltered data. The page's `filteredAnomalies` computed re-applies filters client-side, so UI is correct, but the store state is inconsistent.
- **Fix:** Acceptable as-is given client-side filtering, or pass filters from the page's reactive filter state to `runAnomalyDetection`.

---

## LOW Issues

### AI-LOW-001 — Array index used as `:key` in chat messages
- **[AiChatPanel.vue:37]** `v-for="(msg, idx) in messages" :key="idx"` — using array index as key causes Vue to re-render wrong nodes if messages are ever spliced or prepended.
- **Fix:** Add a `id` or `timestamp` field to messages and use it as the key: `:key="msg.timestamp + msg.role"`.

### AI-LOW-002 — Non-date forecast periods use misleading "actual" revenue fallback
- **[AiForecastChart.vue:172-175]** For forecast periods like "Day 1" or "Week 1" (non-date strings), the actual revenue is computed as `total_actual / forecast_count`. This arbitrary division is shown as if it's the "actual" for that specific period, which would mislead users.
- **Fix:** Show "N/A" for actual when forecast_period is not a parseable date, instead of the divided estimate.

### AI-LOW-003 — Empty states use hardcoded colors
- **[AiDashboardPage.vue:90]** `style="border-radius: 12px; background: rgba(255,255,255,0.03);"` — hardcoded rgba colors don't adapt to light theme.
- **Fix:** Use CSS variable `var(--erp-bg-card)` consistent with design system.

---

## Fixes Applied

### Fix 1 — AI-CRIT-001: Branch filter on recommendations count
**File:** `src/modules/ai/services/ai.service.js`

```js
// BEFORE (line 369):
supabase.from('ai_recommendations').select('id', { count: 'exact' }).eq('status', 'pending'),

// AFTER:
supabase.from('ai_recommendations').select('id', { count: 'exact' }).eq('status', 'pending').eq('branch_id', branchId),
```

### Fix 2 — AI-HIGH-001: Load forecasts on mount in AiForecastPage
**File:** `src/modules/ai/pages/AiForecastPage.vue`

Added `onMounted` to load stored forecasts from DB.

### Fix 3 — AI-HIGH-002: Chat history excludes current message
**File:** `src/modules/ai/stores/ai.store.js`

Pass `chatMessages.value.slice(0, -1)` instead of `chatMessages.value` as conversation history, so the current user message is not duplicated.

### Fix 4 — AI-MED-001: Branch ID null guard
**Files:** `AiDashboardPage.vue`, `AiAnomalyCenterPage.vue`

Added early return guards: `if (!branchId.value) return`.

### Fix 5 — AI-LOW-001: Stable chat message keys
**File:** `src/modules/ai/components/AiChatPanel.vue`

Changed key from array index to composite timestamp+role.
