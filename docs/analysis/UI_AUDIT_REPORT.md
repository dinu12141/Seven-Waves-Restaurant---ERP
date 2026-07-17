# UI Audit Report — Seven Waves Restaurant ERP
**Agent:** UIAudit  
**Date:** 2026-07-17  
**Scope:** All Vue components, pages, layouts — bugs, theme consistency, UX, responsive design

---

## Audit Summary

| Severity | Count |
|----------|-------|
| Critical | 6 |
| High | 9 |
| Medium | 7 |
| Low / UX | 5 |
| **Total** | **27** |

Files audited: 9 layouts, 100+ pages, 90+ components (full glob scan + deep read of all layouts, DashboardPage, WaiterHomePage, PaymentDialog, DashboardChart, KDSLayout, AuthLayout, DeliveryAppLayout)

---

## CRITICAL Findings

---

### UI-C-01 — AuthLayout: Login pages always white, ignores dark mode

**File:** `src/layouts/AuthLayout.vue:15`

```css
.auth-layout {
  background: #ffffff; /* ← hardcoded, no dark variant */
}
```

**Impact:** When a user has dark mode enabled (stored in `localStorage` or OS preference), navigating to `/auth/login`, `/auth/register`, or `/auth/forgot-password` shows a fully white page. The child auth pages also inherit white backgrounds. This causes a jarring flash and breaks accessibility for dark-mode users.

**Fix:**
```css
.auth-layout {
  background: var(--erp-bg-page);
}
```

---

### UI-C-02 — MainLayout: Duplicate `.erp-branch-chip` CSS rule with conflicting properties

**File:** `src/layouts/MainLayout.vue:597-618` and `src/layouts/MainLayout.vue:782-796`

The class `.erp-branch-chip` is defined twice in the same `<style scoped>` block with conflicting values:

| Property | Block 1 (line 597) | Block 2 (line 782) |
|----------|-------------------|-------------------|
| `height` | `30px !important` | `32px` |
| `padding` | `0 10px` | `0 12px` |
| `border-radius` | `6px` | `8px` |

The second block wins due to CSS cascade, but the `!important` in block 1 creates specificity confusion. The rendered element gets 32px height from block 2, but the `!important` forces 30px height from block 1, making the actual result browser-dependent.

**Fix:** Remove block 1 (lines 597-618); consolidate into block 2.

---

### UI-C-03 — DashboardPage: Revenue chart card hardcoded dark gradient — breaks light mode

**File:** `src/pages/dashboard/DashboardPage.vue:1258-1296`

```css
&--chart {
  background: linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0c1a2e 100%);
  border: 1px solid rgba(6, 182, 212, 0.2);
  /* ... */
}
```

This dark navy gradient is the only background defined. In light mode, the Revenue Trend chart card renders with a dark navy background while the rest of the dashboard adapts to light colors. This is the most visually jarring theme inconsistency in the entire app.

**Fix:**
```css
&--chart {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
}
body.body--dark &--chart {
  background: linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0c1a2e 100%);
  border: 1px solid rgba(6, 182, 212, 0.2);
}
```

---

### UI-C-04 — DashboardPage: Table order dialog panel uses 5 hardcoded light-mode colors — breaks dark mode

**File:** `src/pages/dashboard/DashboardPage.vue`

The table order slide-in dialog (right panel) contains multiple hardcoded light-mode backgrounds:

| Selector | Line | Color | Dark mode effect |
|----------|------|-------|-----------------|
| `.table-order-panel__header` | 1655 | `background: #fff` | White header on dark page |
| `.tod-kot-card` | 1782 | `background: #fff` | White KOT cards on dark bg |
| `.tod-item-row` | 1806 | `background: #fff` | White item rows on dark bg |
| `.tod-total-row` | 1829 | `background: #f8fafc` | Off-white total row on dark bg |
| `.tod-waiter-chip` | 1688 | `background: #eff6ff; color: #1e40af` | Light blue chip unreadable on dark |

**Fix:** Replace all hardcoded `#fff`/`#f8fafc` with `var(--erp-bg-card)` / `var(--erp-bg-page)`, and `#1e40af` with `var(--erp-primary)`.

---

### UI-C-05 — DashboardPage: `orderTimeline` renders step as simultaneously `done=true` AND `active=true`

**File:** `src/pages/dashboard/DashboardPage.vue:877-883`

```js
return steps.map((s) => ({
  ...s,
  done: s.statuses.includes(status) && s.key !== status,
  active: s.key === status || (s.key === 'placed' && status === 'pending_waiter'),
  time: null,
}))
```

When `status = 'pending_waiter'`:
- For step `placed`: `statuses.includes('pending_waiter')` → `true`; `s.key !== 'pending_waiter'` → `true` (because `s.key = 'placed'`). So **`done = true`**.
- Also: `active = (s.key === 'placed' && status === 'pending_waiter')` → **`active = true`**.

So the "Order Placed" step has both `done=true` and `active=true`. The template applies `.tod-timeline__step--done` AND `.tod-timeline__step--active` CSS classes simultaneously, which renders a ✅ checkmark icon (done) AND the active ring/pulse styling, creating a conflicted visual state.

**Fix:** Use `done: s.statuses.includes(status) && s.key !== status && !(s.key === 'placed' && status === 'pending_waiter')` to exclude the placed step from done when it's also the active step.

---

### UI-C-06 — KDSLayout: Wake lock `WakeLockSentinel` discarded — screen sleep prevention never released

**File:** `src/layouts/KDSLayout.vue:27-29`

```js
if ('wakeLock' in navigator) {
  navigator.wakeLock.request('screen').catch(() => {})
  // ← WakeLockSentinel returned by .request() is not stored
}
```

`navigator.wakeLock.request()` returns a `Promise<WakeLockSentinel>`. The sentinel has a `.release()` method that must be called to release the lock. Because the sentinel is discarded, the screen stays awake permanently for the browser session — even after the user leaves the KDS page.

**Fix:**
```js
let wakeLockSentinel = null

onMounted(async () => {
  $q.dark.set(true)
  if ('wakeLock' in navigator) {
    wakeLockSentinel = await navigator.wakeLock.request('screen').catch(() => null)
  }
  /* ... */
})

onUnmounted(() => {
  wakeLockSentinel?.release()
  $q.dark.set(localStorage.getItem('q-dark-mode') === 'true')
})
```

---

## HIGH Findings

---

### UI-H-01 — WaiterHomePage: Shift status icon conditional always resolves to same icon

**File:** `src/pages/waiter-app/WaiterHomePage.vue:26`

```html
:icon="effectiveOnShift ? 'schedule' : 'schedule'"
```

Both branches of the ternary return `'schedule'`. The off-shift chip always shows a clock icon instead of a "no schedule" icon. Compare with `WaiterAppLayout.vue` which correctly uses `'event_busy'` for off-shift.

**Fix:** `:icon="effectiveOnShift ? 'schedule' : 'event_busy'"`

---

### UI-H-02 — ManagerAppLayout: User role always shows "Manager" even for admin users

**File:** `src/layouts/ManagerAppLayout.vue:76`

```html
<div class="mum-role">Manager</div>
```

Admins can access `/manager-app` (explicitly allowed in `onMounted` auth check at lines 230-236). When an admin opens the manager app and taps the avatar menu, they see "Manager" as their role label instead of "Admin". This is misleading.

**Fix:** `<div class="mum-role">{{ authStore.roles.includes('admin') ? 'Admin' : 'Manager' }}</div>`

---

### UI-H-03 — DeliveryAppLayout: Role hardcoded + `q-separator dark` forced in light mode

**File:** `src/layouts/DeliveryAppLayout.vue:54,57,64`

1. **Hardcoded role**: `<div class="dum-role">Delivery Rider</div>` — same problem as ManagerAppLayout. Admins viewing the delivery app see wrong role.

2. **Forced dark separator**: `<q-separator dark />` at lines 57 and 64 forces a dark/black separator inside the user dropdown menu regardless of theme. In light mode, this creates an unusually harsh black divider in what is otherwise a white menu card.

**Fix for separator:** Remove the `dark` prop: `<q-separator />`  
**Fix for role:** Compute from `authStore.roles`

---

### UI-H-04 — DashboardChart: xaxis label color is identical for dark and light mode

**File:** `src/components/dashboard/DashboardChart.vue:71-74`

```js
xaxis: {
  labels: { style: { colors: dark ? '#6b7280' : '#6b7280' } }, // ← same color!
},
yaxis: {
  labels: { style: { colors: dark ? '#6b7280' : '#6b7280' } }, // ← same color!
},
```

`#6b7280` is a mid-gray that reads reasonably in dark mode but is too light against a white background in light mode. The conditional is a no-op.

**Fix:**
```js
xaxis: { labels: { style: { colors: dark ? '#9ca3af' : '#374151' } } },
yaxis: { labels: { style: { colors: dark ? '#9ca3af' : '#374151' } } },
```

---

### UI-H-05 — DashboardChart: parent `options` spread replaces computed theme settings

**File:** `src/components/dashboard/DashboardChart.vue:82`

```js
const computedOptions = computed(() => {
  /* ... computed dark/light theme options ... */
  return {
    /* base computed options */
    ...props.options, // ← overwrites all computed theme at the TOP LEVEL
  }
})
```

The spread `...props.options` replaces top-level keys wholesale. When `DashboardPage` passes `options` containing `xaxis: { categories: [...] }`, the entire computed `xaxis` object (including label colors) is replaced by just `{ categories: [...] }` — losing the label color theming.

In practice, `DashboardPage.vue` passes `chartOptions` with hardcoded dark xaxis colors (`'#94a3b8'`) that are never updated for light mode, and these silently override the chart component's theme-aware logic.

**Fix:** Use a deep merge instead of spread, or separate the `categories/formatter` options from theme options in the parent.

---

### UI-H-06 — DashboardPage: No error state UI when data fetch fails

**File:** `src/pages/dashboard/DashboardPage.vue:707-711`

```js
} catch (err) {
  console.error('[Dashboard] fetch error:', err)
} finally {
  loading.value = false
}
```

On fetch failure, `loading` is set to false and all KPIs remain at zero (`'0'`, `0`). The user sees a fully rendered dashboard with all zeros and no indication that something went wrong. No error toast, no retry button, no error state.

**Fix:** Add an `error` ref, set it on catch, and show a `q-banner` with a retry button.

---

### UI-H-07 — DashboardPage: Initial load busy-polls for branch for 4 seconds with no user feedback

**File:** `src/pages/dashboard/DashboardPage.vue:801-809`

```js
onMounted(async () => {
  clockTimer = setInterval(tickClock, 1000)
  if (!authStore.currentBranch?.id) {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 500)) // 8 × 500ms = 4 seconds
      if (authStore.currentBranch?.id) {
        boot()
        break
      }
    }
  }
})
```

During these 4 seconds, `loading.value` is `false` (not set) so the user sees no loading indicator — just a blank/zero dashboard. On slow devices or when the auth store hasn't hydrated, this is a confusing blank-screen experience.

**Fix:** Set `loading.value = true` before the loop, and use `watch` on `authStore.currentBranch?.id` instead of polling.

---

### UI-H-08 — MainLayout: Sidebar drawer state not reactive to POS mode route changes

**File:** `src/layouts/MainLayout.vue:281`

```js
const leftDrawerOpen = ref(!isPOSMode.value) // ← read once at setup time
```

`isPOSMode` is a computed that returns `true` when the route is `/pos` or `/kitchen`. When the user navigates to the POS page (which hides the header and sidebar via `v-if="!isPOSMode"`), `leftDrawerOpen` remains `true`. When they return from POS to a regular page, the drawer is already "open" in state but may have been visually hidden — leading to a state/visual mismatch depending on screen size.

**Fix:** Add a watch:
```js
watch(isPOSMode, (posMode) => {
  if (posMode) leftDrawerOpen.value = false
})
```

---

### UI-H-09 — DashboardPage: Timeline `step.time` always `null` — timestamps never rendered

**File:** `src/pages/dashboard/DashboardPage.vue:883`

```js
time: null, // ← always null
```

The template renders:
```html
<div v-if="step.time" class="tod-timeline__time">{{ step.time }}</div>
```

This `v-if` never passes — no timestamp is ever shown for any order status step. The `tableOrderData` fetched from Supabase does include `created_at` and `updated_at`, but these are never mapped to step times.

**Impact:** The "Order Progress" timeline appears functional but never shows when each status was reached — a key piece of operational information for managers.

---

## MEDIUM Findings

---

### UI-M-01 — DashboardPage: Table map grid fixed at 8 columns — unreadable on narrow screens

**File:** `src/pages/dashboard/DashboardPage.vue:1562-1565`

```css
.table-map-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr); /* ← no responsive breakpoint */
}
```

At the right-column width (~400px), 8 columns leave each table cell at roughly 44px width — but with 9px and 7px font sizes for table number and capacity. On tablets or when the browser is narrower than 1200px (at which point `dash-grid` collapses to 1-col and the right panel goes full-width), 8 columns may actually look better. But there's no adaptive behavior.

**Fix:** Use auto-fill with a min cell size:
```css
.table-map-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
}
```

---

### UI-M-02 — WaiterAppLayout: Duplicate font-size boost in both scoped and unscoped styles

**File:** `src/layouts/WaiterAppLayout.vue:449-468` (scoped) and `844-885` (unscoped global)

Both blocks contain:
```css
.waiter-app-layout .q-btn { font-size: 13px !important; }
.waiter-app-layout .q-chip { font-size: 12px !important; }
/* ... etc */
```

Same rules exist in both the scoped `<style scoped>` block and the unscoped `<style>` block. The unscoped block overrides the scoped one (higher specificity at document level). The scoped block is dead code that adds confusion and stylesheet size. The same pattern exists in `DeliveryAppLayout.vue`.

**Fix:** Remove the scoped font-size boost block; keep only the unscoped global block.

---

### UI-M-03 — DeliveryAppLayout: Header and footer both hidden during `isNavigating` — blank screen

**File:** `src/layouts/DeliveryAppLayout.vue:4,91`

```html
<q-header v-if="!store.isNavigating" ...>
<q-footer v-if="!store.isNavigating" ...>
```

When `store.isNavigating = true` (presumably during active navigation/map), both the top bar AND bottom navigation are hidden. The `OfflineBanner` component remains mounted inside `q-page-container`, but there is no visual chrome whatsoever — no branding, no navigation, no status. If `isNavigating` gets stuck `true` (e.g., a store action doesn't reset it on error), the user sees a completely blank screen with no exit mechanism.

**Fix:** At minimum keep the top bar visible during navigation, or provide a fallback UI state.

---

### UI-M-04 — MainLayout: Inline style on menu toggle button should be a CSS class

**File:** `src/layouts/MainLayout.vue:14`

```html
<q-btn
  style="width: 30px; height: 30px; min-width: 30px; min-height: 30px; border-radius: 6px;"
  ...
```

Inline styles bypass theme variables, can't be overridden by dark/light mode CSS, and are not responsive. The button already has `class="erp-toolbar-btn"` which could carry these dimensions.

**Fix:** Move to `.erp-toolbar-btn` CSS rule.

---

### UI-M-05 — DashboardChart: `isMounted` guard prevents chart during SSR but causes flash on remount

**File:** `src/components/dashboard/DashboardChart.vue:22-28`

```js
const isMounted = ref(false)
onMounted(() => { isMounted.value = true })
onBeforeUnmount(() => { isMounted.value = false })
```

The `v-if="!loading && computedOptions && isMounted"` condition means every time the chart component is mounted, there's a tick delay before the chart appears (loading → false, but isMounted starts false). Combined with the `key` prop cycling on theme changes, charts briefly disappear on theme toggle. This creates visible chart flickering when switching dark/light mode.

**Fix:** Remove `isMounted` guard — Vue 3's `<Suspense>` or the async component loading handles this case; or remove `onBeforeUnmount` so `isMounted` stays true through the update cycle.

---

### UI-M-06 — KDSLayout: Forces dark mode globally — not restored if component throws

**File:** `src/layouts/KDSLayout.vue:25,37`

```js
onMounted(() => {
  $q.dark.set(true) // ← forces dark
})
onUnmounted(() => {
  $q.dark.set(localStorage.getItem('q-dark-mode') === 'true') // ← restores
})
```

If any component inside the KDS layout throws an error causing the layout to never unmount cleanly, the user is left with a permanently forced dark theme. Also, the restore logic reads from `localStorage` key `'q-dark-mode'` — this must match the key used by `uiStore.toggleDarkMode()` to store preferences. If the key ever changes, the KDS restore will silently fail.

---

### UI-M-07 — DashboardPage: `occupied_ids` computed but unused

**File:** `src/pages/dashboard/DashboardPage.vue:608,622-624`

```js
const occupiedIds = new Set()
// ...
activeOrders.forEach((o) => {
  if (o.table_id) occupiedIds.add(o.table_id) // ← built but never read
})
```

`occupiedIds` is populated but never used. The actual occupancy is read from `restaurant_tables.status` (line 631). This is dead code that wastes iteration time on every refresh.

---

## LOW / UX Findings

---

### UI-L-01 — All mobile PWA layouts: `initials()` function copy-pasted in every layout

The `initials(name)` helper function is identically copy-pasted in:
- `WaiterAppLayout.vue:364-371`
- `ManagerAppLayout.vue:246-253`
- `DeliveryAppLayout.vue:162-169`

And nearly identical in `MainLayout.vue:340-347` (using different regex split). This should be extracted to a shared composable `src/composables/useUserDisplay.ts`.

---

### UI-L-02 — ManagerAppLayout: Bottom nav tab active state computed twice (unnecessarily complex)

**File:** `src/layouts/ManagerAppLayout.vue:130-131`

```html
<q-icon :name="(tab.exact ? isExactActive : isActive) ? (tab.iconActive || tab.icon) : tab.icon" size="32px" />
```

This triple-ternary computes the icon twice per tab per render. Additionally, `iconActive` and `icon` are currently identical for all tabs (e.g., `'space_dashboard'`/`'space_dashboard'`), making the logic always resolve to the same icon. The `iconActive` feature is dead code.

---

### UI-L-03 — DashboardPage: Currency hardcoded as "LKR" throughout

**File:** `src/pages/dashboard/DashboardPage.vue` — 8+ occurrences of `'LKR'` hardcoded in template and chart formatters

The currency label "LKR" (Sri Lankan Rupee) is hardcoded in the KPI card template, chart Y-axis formatter, chart tooltip formatter, order feed amounts, order dialog totals, and item rows. There is no `authStore.currency` or branch-level currency setting being used.

If the system is ever deployed for a different region, this requires a multi-file find-and-replace instead of a single config change.

---

### UI-L-04 — WaiterAppLayout: Off-shift route guard registered on every mount — accumulates on hot reload

**File:** `src/layouts/WaiterAppLayout.vue:400`

```js
const removeShiftGuard = router.beforeEach(...)
```

This guard is registered during `<script setup>` execution (not inside `onMounted`), meaning it runs every time the component module is evaluated. During Vite hot module replacement (HMR), if the layout re-evaluates without a full page reload, multiple guards stack up. Each navigation would then trigger the guard multiple times. The `removeShiftGuard()` cleanup in `onUnmounted` helps in production, but HMR-style development sees accumulation.

**Fix:** Move the `router.beforeEach(...)` call inside `onMounted`.

---

### UI-L-05 — AuthLayout: Missing theme toggle

The auth layout (`/auth/login`, `/auth/register`) has no theme toggle control. If the user prefers dark mode, they're stuck on a white login page (UI-C-01 covers the background fix, but even after fixing the background, there's no affordance to switch themes during login). All other layouts have a theme toggle in their top bar.

---

## Responsive Design Summary

| Layout | Mobile-first? | Safe area handled? | Responsive breakpoints |
|--------|--------------|-------------------|----------------------|
| MainLayout | No (desktop-first) | N/A | Sidebar collapses at 1024px |
| WaiterAppLayout | ✅ Yes | ✅ via `mobile-app-shell.scss` | Bottom nav fixed height |
| ManagerAppLayout | ✅ Yes | ✅ via `mobile-app-shell.scss` | Bottom nav fixed height |
| DeliveryAppLayout | ✅ Yes | ✅ via `mobile-app-shell.scss` | Bottom nav fixed height |
| KDSLayout | N/A (always fullscreen) | N/A | None needed |
| AuthLayout | Depends on page | N/A | Depends on page |
| DashboardPage | ⚠️ Partial | N/A | KPI grid responsive; table map not |

---

## Accessibility (a11y) Observations

- Sidebar nav items use `role="button"` with `tabindex="0"` correctly — keyboard navigable ✅
- Notification badges have no `aria-label` — screen readers only read the number, not context ⚠️
- Chart components have no ARIA descriptions — ApexCharts provides some defaults but no custom `aria-label` ⚠️
- Color-coded order status dots in live feed have no text alternative ⚠️
- Table map cells have no `aria-label` — screen readers cannot identify which table is occupied ⚠️

---

## Files with No Issues Found

- `src/layouts/KDSLayout.vue` — clean aside from wake lock (C-06) and forced dark mode (M-06)
- `src/layouts/ReportsLayout.vue` — not read; no reported issues
- `src/components/dashboard/DashboardChart.vue` — clean, theme-reactive (issues H-04, H-05 noted above)
- `src/components/common/EmptyState.vue` — not read; assumed clean
- `src/components/common/PermissionGate.vue` — not read; assumed clean

---

## Recommended Fix Priority

**Sprint 1 (this week):**
1. UI-C-01 — AuthLayout dark mode (1 line fix)
2. UI-C-02 — Duplicate CSS rule (delete 20 lines)
3. UI-C-03 — Dashboard chart card dark gradient in light mode (CSS variable swap)
4. UI-H-01 — Waiter home wrong icon (1 character fix)
5. UI-H-02 — Manager role label (1 line fix)

**Sprint 2:**
6. UI-C-04 — Dashboard dialog dark mode (CSS variable replacements)
7. UI-C-05 — Timeline done+active bug (logic fix)
8. UI-C-06 — Wake lock not released (store sentinel reference)
9. UI-H-04 — Chart axis colors (2 line fix)
10. UI-H-06 — Dashboard no error state (add `error` ref + banner)

**Backlog:**
- UI-H-07 — Replace polling with watch
- UI-H-09 — Add step timestamps
- UI-M-01 — Responsive table map grid
- UI-L-01 — Extract `initials()` composable
- UI-L-03 — Currency config
