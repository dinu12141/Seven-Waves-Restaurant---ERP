# Design System — Seven Waves Restaurant ERP

> **Source of truth:** `src/css/erp-theme.scss` (tokens), `src/css/quasar.variables.scss` (Quasar SCSS vars)  
> **Font:** Inter (Google Fonts), fallbacks: Segoe UI, system-ui  
> **Inspiration:** SAP Business One HANA — compact, dense, data-rich

---

## 1. Color Palette

### Brand Colors
| Name | Light Value | Dark Value | SCSS Var | CSS Token |
|------|------------|-----------|----------|-----------|
| Primary | `#2563eb` (Blue-600) | `#2563eb` | `$primary` | `--erp-primary` |
| Primary Hover | `#1d4ed8` | `#1d4ed8` | — | `--erp-primary-hover` |
| Primary Light | `#3b82f6` | `#60a5fa` | — | `--erp-primary-light` |
| Accent (Purple) | `#7c3aed` | `#7c3aed` | `$accent` | `--erp-accent` |
| Secondary (Grey) | `#6c757d` | `#6c757d` | `$secondary` | — |

### Semantic Colors
| Purpose | Light | Dark | Token |
|---------|-------|------|-------|
| Success | `#16a34a` | `#16a34a` | `--erp-success` |
| Warning | `#d97706` | `#f59e0b` | `--erp-warning` |
| Danger | `#dc2626` | `#dc2626` | `--erp-danger` |
| Info | `#0284c7` | `#0ea5e9` | `--erp-info` |
| Teal | `#0d9488` | `#0d9488` | `--erp-teal` |
| Orange | `#ea580c` | `#ea580c` | `--erp-orange` |

### Background Scale
| Layer | Light | Dark | Token |
|-------|-------|------|-------|
| Page | `#f8fafc` | `#080e18` | `--erp-bg-page` |
| Main | `#f1f5f9` | `#0f172a` | `--erp-bg-main` |
| Card | `#ffffff` | `#1e293b` | `--erp-bg-card` |
| Input | `#f8fafc` | `#111827` | `--erp-bg-input` |
| Sidebar | `#ffffff` | `#0b1220` | `--erp-bg-sidebar` |
| Header | `#ffffff` | `#0f172a` | `--erp-bg-header` |

### Text Scale
| Role | Light | Dark | Token |
|------|-------|------|-------|
| Primary | `#0f172a` | `#f8fafc` | `--erp-text-primary` |
| Secondary | `#475569` | `#94a3b8` | `--erp-text-secondary` |
| Muted | `#64748b` | `#64748b` | `--erp-text-muted` |
| Tertiary | `#94a3b8` | `#475569` | `--erp-text-tertiary` |
| Placeholder | `#94a3b8` | `#475569` | `--erp-text-placeholder` |
| On-Primary | `#ffffff` | `#ffffff` | `--erp-text-on-primary` |

### Module Accent Colors
Each module has a distinct accent for visual wayfinding:

| Module | Color | Hex | Token |
|--------|-------|-----|-------|
| POS | Orange | `#f97316` | `--erp-mod-pos` |
| Kitchen | Red | `#ef4444` | `--erp-mod-kitchen` |
| Inventory | Green | `#22c55e` | `--erp-mod-inventory` |
| Finance | Blue | `#3b82f6` | `--erp-mod-finance` |
| HR | Purple | `#8b5cf6` | `--erp-mod-hr` |
| Procurement | Amber | `#f59e0b` | `--erp-mod-procurement` |
| CRM | Pink | `#ec4899` | `--erp-mod-crm` |
| Delivery | Teal | `#14b8a6` | `--erp-mod-delivery` |
| Security | Red | `#dc2626` | `--erp-mod-security` |
| Reports | Indigo | `#6366f1` | `--erp-mod-reports` |
| Website | Cyan | `#06b6d4` | `--erp-mod-website` |

### Role Accent Colors
| Role | Color | Hex | Token |
|------|-------|-----|-------|
| Admin | Authority Red | `#dc2626` | `--erp-role-admin` |
| Manager | Trust Blue | `#2563eb` | `--erp-role-manager` |
| Cashier | Money Green | `#16a34a` | `--erp-role-cashier` |
| Waiter | Service Orange | `#f97316` | `--erp-role-waiter` |
| Kitchen | Urgency Red | `#ef4444` | `--erp-role-kitchen` |
| Delivery | Movement Teal | `#14b8a6` | `--erp-role-delivery` |
| Finance | Trust Purple | `#8b5cf6` | `--erp-role-finance` |

---

## 2. Typography

**Font stack:** `'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif`

### Type Scale
| Name | Size | Weight | Token |
|------|------|--------|-------|
| H1 (Page Title) | 20px | 700 Bold | `--erp-font-size-h1` |
| H2 (Section Title) | 16px | 600 Semibold | `--erp-font-size-h2` |
| H3 (Card Title) | 14px | 600 Semibold | `--erp-font-size-h3` |
| H4 (Label) | 13px | 600 Semibold | `--erp-font-size-h4` |
| Body | 13px | 400 Regular | `--erp-font-size-base` |
| Table | 12px | 400 Regular | `--erp-font-size-table` |
| Small | 11px | 400–500 | `--erp-font-size-small` |
| Caption | 10px | 400 | `--erp-font-size-caption` |
| Tiny | 9px | 600 | `--erp-font-size-tiny` |
| KPI Value | 22px | 800 Black | `--erp-font-size-kpi` |

**Mobile override (≤599px):** Base bumps to 14px, H1 to 18px, H2 to 15px.

### Font Weights
| Name | Value | Token |
|------|-------|-------|
| Regular | 400 | `--erp-font-weight-regular` |
| Medium | 500 | `--erp-font-weight-medium` |
| Semibold | 600 | `--erp-font-weight-semibold` |
| Bold | 700 | `--erp-font-weight-bold` |
| Black | 800 | `--erp-font-weight-black` |

---

## 3. Spacing System

**Base unit: 4px** (compact ERP grid, not 8px consumer grid)

| Name | Value | Token |
|------|-------|-------|
| XS | 2px | `--erp-spacing-xs` |
| SM | 4px | `--erp-spacing-sm` |
| MD2 | 12px | `--erp-spacing-md2` |
| MD | 8px | `--erp-spacing-md` |
| LG | 16px | `--erp-spacing-lg` |
| XL | 24px | `--erp-spacing-xl` |
| 2XL | 32px | `--erp-spacing-2xl` |
| 3XL | 48px | `--erp-spacing-3xl` |
| 4XL | 64px | `--erp-spacing-4xl` |

---

## 4. Border Radius

| Name | Value | Token | Use |
|------|-------|-------|-----|
| XS | 2px | `--erp-radius-xs` | Micro badges |
| SM | 3px | `--erp-radius-sm` | Badges, chips |
| MD | 4px | `--erp-radius-md` | Inputs, buttons, nav items |
| LG | 6px | `--erp-radius-lg` | Cards, menus |
| XL | 8px | `--erp-radius-xl` | Dialogs |
| 2XL | 12px | `--erp-radius-2xl` | Larger cards |
| 3XL | 16px | `--erp-radius-3xl` | Panels |
| Card | 14px | `--erp-radius-card` | KPI cards |
| Pill | 9999px | `--erp-radius-pill` | Status pills |

---

## 5. Dimension Constants

| Name | Value | Token |
|------|-------|-------|
| Input Height | 32px | `--erp-input-height` |
| Button Height | 30px | `--erp-btn-height` |
| Row Height | 36px | `--erp-row-height` |
| Sidebar Width | 220px | `--erp-sidebar-width` |
| Header Height | 42px (row 1) + 33px (row 2) = 75px total | `--erp-header-height` |
| Dialog SM | 520px | `--erp-dialog-w-sm` |
| Dialog MD | 720px | `--erp-dialog-w-md` |
| Dialog LG | 960px | `--erp-dialog-w-lg` |

### Touch Targets
| Context | Size | Token |
|---------|------|-------|
| WCAG minimum | 44px | `--erp-touch-min` |
| Material comfortable | 48px | `--erp-touch-comfortable` |
| POS large tap | 56px | `--erp-touch-pos` |
| KDS kitchen buttons | 64px | `--erp-touch-kds` |

---

## 6. Component Library Specification

### Buttons
Use Quasar `QBtn` with ERP CSS classes:

```html
<!-- Primary -->
<q-btn class="erp-btn-primary" label="Save" />

<!-- Secondary / Ghost -->
<q-btn class="erp-btn-secondary" label="Cancel" />
<q-btn class="erp-btn-ghost" label="Options" />

<!-- Danger -->
<q-btn class="erp-btn-danger" label="Delete" />

<!-- Icon-only (toolbar) -->
<q-btn flat dense round icon="refresh" />
```

| Variant | Class | Height | Border Radius | Use |
|---------|-------|--------|--------------|-----|
| Primary | `.erp-btn-primary` | 30px | 4px | Save, Submit, Confirm |
| Secondary | `.erp-btn-secondary` | 30px | 4px | Cancel, Back, Secondary actions |
| Ghost | `.erp-btn-ghost` | 30px | 4px | Toolbar, optional actions |
| Danger | `.erp-btn-danger` | 30px | 4px | Delete, Void, Reject |
| POS Large | Custom, min 56px | 56px | 8px | POS menu item cards |
| KDS Large | Custom, min 64px | 64px | 8px | KDS mark-ready buttons |

### Forms
```html
<!-- Standard ERP input -->
<q-input
  v-model="value"
  outlined
  dense
  label="Field Label"
  class="erp-input"
/>

<!-- Select -->
<q-select
  v-model="selected"
  :options="options"
  outlined
  dense
  label="Select..."
/>
```

- Input height: 32px (compact), 40px in dialogs
- Label size: 11px (`--erp-font-size-small`)
- Border: `var(--erp-border)`, focus: `var(--erp-border-focus)` blue
- Background: `var(--erp-bg-input)`
- Use `dense` prop on all ERP inputs
- Date pickers: `QDate` component in popup
- Time pickers: `QTime` component in popup

### Tables
```html
<q-table
  class="erp-table"
  :rows="rows"
  :columns="columns"
  row-key="id"
  dense
  flat
  :rows-per-page-options="[25, 50, 100]"
/>
```

- Header font: 10px, uppercase, 600 weight (`--erp-font-size-caption`)
- Row height: 36px (`--erp-row-height`)
- Cell font: 12px (`--erp-font-size-table`)
- Alternating row background: `--erp-bg-stripe`
- Hover: `--erp-bg-card-hover`

### Cards

```html
<!-- Standard ERP card -->
<q-card class="erp-card">
  <q-card-section>Content</q-card-section>
</q-card>

<!-- KPI / Metric card -->
<q-card class="hr-kpi-card hr-kpi-card--blue q-card">
  <div class="hr-kpi-inner">
    <div class="hr-kpi-icon"><q-icon name="payments" size="22px" color="white" /></div>
    <div>
      <div class="hr-kpi-label">Revenue Today</div>
      <div class="hr-kpi-value">SAR 12,450</div>
      <div class="hr-kpi-sub">+12% vs yesterday</div>
    </div>
  </div>
</q-card>
```

KPI card variants: `--blue`, `--green`, `--amber`, `--red`, `--purple`, `--cyan`, `--teal`, `--rose`, `--indigo`, `--orange`

### Modals & Dialogs

```html
<q-dialog v-model="open" :maximized="$q.screen.lt.sm">
  <q-card class="erp-dialog-card" style="width: var(--erp-dialog-w-md)">
    <q-toolbar>
      <q-toolbar-title>Dialog Title</q-toolbar-title>
      <q-btn flat round dense icon="close" v-close-popup />
    </q-toolbar>
    <q-card-section class="scroll">Body content</q-card-section>
    <q-card-actions align="right">
      <q-btn class="erp-btn-secondary" label="Cancel" v-close-popup />
      <q-btn class="erp-btn-primary" label="Save" />
    </q-card-actions>
  </q-card>
</q-dialog>
```

- Max-height: 90vh
- On mobile: maximized (full screen)
- Border radius: 8px (`--erp-radius-xl`)
- Background: `--erp-bg-elevated`

### Toast Notifications

Use Quasar `$q.notify()` with ERP-standard options:
```js
$q.notify({
  type: 'positive',     // positive | negative | warning | info
  message: 'Order saved',
  caption: 'Table #5',
  position: 'top-right',
  timeout: 3000,
  icon: 'check_circle',
})
```

Special: `order-reminder-toast` class for 5-min persistent order alerts (shake animation).

### Loading Skeletons

```html
<!-- Row skeleton -->
<div class="erp-skeleton erp-skeleton--row" />

<!-- Card skeleton -->
<div class="erp-skeleton erp-skeleton--kpi" />

<!-- Chart skeleton -->
<div class="erp-skeleton erp-skeleton--chart" />
```

Variants: `--text`, `--heading`, `--circle`, `--avatar`, `--card`, `--kpi`, `--row`, `--chart`, `--btn`

Animation: Pulse + wave shimmer. Respects `prefers-reduced-motion`.

### Empty States

```html
<div class="erp-empty-state">
  <q-icon name="inbox" class="erp-empty-state__icon" />
  <h3 class="erp-empty-state__title">No Orders Yet</h3>
  <p class="erp-empty-state__desc">When new orders arrive, they'll appear here.</p>
  <q-btn class="erp-empty-state__action erp-btn-primary" label="Refresh" @click="reload" />
</div>
```

Min-height: 240px. Icon: 56px, 40% opacity muted.

### Error States

```html
<!-- Full page error -->
<div class="erp-error-state">
  <q-icon name="error_outline" />
  <p class="erp-error-state__message">Failed to load orders. Check your connection.</p>
  <q-btn flat label="Retry" @click="reload" />
</div>

<!-- Inline error (e.g. inside card) -->
<div class="erp-error-state erp-error-state--inline">
  <q-icon name="warning" />
  <span>VAT calculation error</span>
  <q-btn flat dense label="Fix" />
</div>
```

### Status Badges

```html
<span class="erp-badge erp-badge--pending">Pending</span>
<span class="erp-badge erp-badge--preparing">Preparing</span>
<span class="erp-badge erp-badge--ready">Ready</span>
<span class="erp-badge erp-badge--paid">Paid</span>
<span class="erp-badge erp-badge--cancelled">Cancelled</span>
```

### Tabs

```html
<div class="erp-tab-bar">
  <button class="erp-tab erp-tab--active">
    Overview <span class="erp-tab__count">24</span>
  </button>
  <button class="erp-tab">Details</button>
</div>
```

---

## 7. Icon System

**Source:** Google Material Icons (via Quasar's `material-icons` set)

Key icon mapping:

| Context | Icon |
|---------|------|
| POS / Point of Sale | `point_of_sale` |
| Kitchen | `soup_kitchen` |
| Orders | `receipt_long` |
| Tables | `table_restaurant` |
| Waiter Inbox | `move_to_inbox` |
| Delivery | `delivery_dining` |
| Inventory | `inventory_2` |
| Finance | `account_balance` |
| HR | `people` |
| Reports | `assessment` |
| Settings | `settings` |
| Notifications | `notifications_active` |
| Offline | `wifi_off` |
| Loading | `hourglass_empty` |
| Success | `check_circle` |
| Error | `error_outline` |
| Warning | `warning_amber` |
| Search | `search` |
| Logout | `logout` |
| Branch | `store_mall_directory` |
| QR Scan | `qr_code_scanner` |
| Fingerprint | `fingerprint` |
| Receipt | `receipt` |
| Cart | `shopping_basket` |
| Loyalty | `stars` |

---

## 8. Animation & Transitions

| Name | Duration | Easing | Token |
|------|----------|--------|-------|
| Fast | 120ms | ease | `--erp-duration-fast` |
| Normal | 200ms | ease | `--erp-duration-normal` |
| Slow | 300ms | ease | `--erp-duration-slow` |
| Enter | 250ms | ease-out | `--erp-duration-enter` |
| Leave | 200ms | ease-in | `--erp-duration-leave` |

Page transitions (PWA): `tab-fade` (opacity 0.15s)  
Banner transitions: `banner-slide` (max-height + opacity)  
KPI card hover: `translateY(-2px)` lift  
All animations disabled by `prefers-reduced-motion`.

---

## 9. Dark Mode Specification

Dark mode is mandatory for:
- **Kitchen Display (KDS)** — The primary use case. Bright screens in dark kitchens cause eye strain and obscure ticket readability.
- **Waiter App** — Dim restaurant environments.
- **Delivery App** — Night driving.

**Current implementation:**
- `body.body--dark` / `body.body--light` CSS class toggle
- Quasar `$q.dark.toggle()` with `useUIStore().toggleDarkMode($q)`
- Persisted via `localStorage` (`q-dark-mode` key in Quasar)
- TouchMenu has its own dark persistence (`tm_dark_mode` key)

**Required KDS dark palette:**
```scss
// KDS-specific — override for kitchen display
.kds-layout {
  --kds-bg: #0a0a0a;          // Near-black page
  --kds-card-bg: #1a1a1a;     // Dark card
  --kds-border: rgba(255,255,255,0.08);
  --kds-text: #f5f5f5;
  --kds-text-muted: #888;
  --kds-new-order: #ef4444;   // Red for new/urgent
  --kds-in-progress: #f59e0b; // Amber for in-progress
  --kds-ready: #22c55e;       // Green for ready
}
```

---

## 10. Responsive Breakpoints

| Name | Width | Quasar | Use |
|------|-------|--------|-----|
| Mobile | ≤599px | `xs` | Waiter PWA, Delivery PWA |
| Tablet | 600–1023px | `sm`, `md` | Manager App, Kiosk tablet |
| Desktop | 1024px+ | `lg` | Main ERP, KDS |
| Large | 1440px+ | `xl` | Dashboard multi-column |

Utility classes: `.erp-hide-mobile`, `.erp-show-mobile`, `.erp-hide-tablet`, `.erp-show-tablet`, `.erp-hide-desktop`, `.erp-show-desktop`

---

## 11. Accessibility Requirements

- **WCAG 2.1 AA compliance required**
- Focus ring: `*:focus-visible` — 2px solid primary, offset 2px (implemented in erp-theme.scss)
- Mouse users: focus ring hidden via `:focus:not(:focus-visible)`
- Skip-to-content link: `.erp-skip-link` class defined, must be added to each layout
- Screen reader text: `.sr-only` utility class exists
- Minimum touch target: 44px (`--erp-touch-min`) per WCAG 2.5.8
- Color contrast: Primary blue `#2563eb` on white = 5.87:1 (passes AA)
- High-contrast mode: `forced-colors: active` handled for badges, skeletons, status dots
- `prefers-reduced-motion`: All animations disabled when set

**Missing ARIA attributes on:**
- Sidebar nav items (use `role="button"` but no `aria-current="page"`)
- Bottom nav tabs in PWA layouts (no `aria-label` on buttons)
- Modal dialogs (missing `aria-labelledby`)
- Toast notifications (missing `role="alert"` live region)
