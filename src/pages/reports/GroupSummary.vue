<template>
  <ReportLayout
    title="Group Summary"
    subtitle="Department Summary — Sales broken down by menu category groups"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <!-- SAP-style Report Header -->
      <div class="gs-header">
        <div class="gs-header__top">
          <div class="gs-header__left">
            <div class="gs-header__company">SEVEN WAVES RESTAURANT (PVT) LTD</div>
            <div class="gs-header__title">Group Summary</div>
          </div>
          <div class="gs-header__right">
            <div class="gs-header__page">Page 1 of 1</div>
            <div class="gs-header__date">{{ todayFormatted }}</div>
          </div>
        </div>
        <div class="gs-header__meta">
          <div>Location: <strong>{{ branchName }}</strong></div>
          <div>From Date : <strong>{{ reportDateRange }}</strong></div>
        </div>
      </div>

      <!-- ── Data Table ───────────────────────────── -->
      <table class="gs-table">
        <thead>
          <tr class="gs-table__header">
            <th class="gs-table__th">Code</th>
            <th class="gs-table__th">Description</th>
            <th class="gs-table__th gs-table__th--num">Qty</th>
            <th class="gs-table__th gs-table__th--num">Gross Amount</th>
            <th class="gs-table__th gs-table__th--num">Return Amount</th>
            <th class="gs-table__th gs-table__th--num">Disc Amt</th>
            <th class="gs-table__th gs-table__th--num">Net Amount</th>
            <th class="gs-table__th gs-table__th--num">Tax Amt</th>
            <th class="gs-table__th gs-table__th--num">Amt with Tax</th>
            <th class="gs-table__th gs-table__th--num">Wastage Amt</th>
            <th class="gs-table__th gs-table__th--num">% of Sale</th>
          </tr>
        </thead>
        <tbody v-if="loading">
          <tr>
            <td colspan="11" class="gs-table__loading">
              <q-spinner-gears size="30px" color="primary" />
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="groupRows.length === 0">
          <tr>
            <td colspan="11" class="gs-table__empty">
              <q-icon name="category" size="36px" class="q-mb-sm" />
              <div>No group data for selected period</div>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="row in groupRows" :key="row.code" class="gs-table__row">
            <td class="gs-table__td gs-table__td--code">{{ row.code }}</td>
            <td class="gs-table__td gs-table__td--desc">{{ row.description }}</td>
            <td class="gs-table__td gs-table__td--num">{{ row.qty }}</td>
            <td class="gs-table__td gs-table__td--num">{{ fmtN(row.grossAmt) }}</td>
            <td class="gs-table__td gs-table__td--num">{{ fmtN(row.returnAmt) }}</td>
            <td class="gs-table__td gs-table__td--num">{{ fmtN(row.discAmt) }}</td>
            <td class="gs-table__td gs-table__td--num">{{ fmtN(row.netAmt) }}</td>
            <td class="gs-table__td gs-table__td--num">{{ fmtN(row.taxAmt) }}</td>
            <td class="gs-table__td gs-table__td--num text-weight-bold">{{ fmtN(row.amtWithTax) }}</td>
            <td class="gs-table__td gs-table__td--num">{{ fmtN(row.wastageAmt) }}</td>
            <td class="gs-table__td gs-table__td--num">{{ row.pctSale }}</td>
          </tr>
        </tbody>
        <tfoot v-if="groupRows.length > 0">
          <tr class="gs-table__grand-total">
            <td colspan="2" class="gs-table__td text-weight-bolder">Grand Total</td>
            <td class="gs-table__td gs-table__td--num text-weight-bolder">{{ grandTotals.qty }}</td>
            <td class="gs-table__td gs-table__td--num text-weight-bolder">{{ fmtN(grandTotals.grossAmt) }}</td>
            <td class="gs-table__td gs-table__td--num text-weight-bolder">{{ fmtN(grandTotals.returnAmt) }}</td>
            <td class="gs-table__td gs-table__td--num text-weight-bolder">{{ fmtN(grandTotals.discAmt) }}</td>
            <td class="gs-table__td gs-table__td--num text-weight-bolder">{{ fmtN(grandTotals.netAmt) }}</td>
            <td class="gs-table__td gs-table__td--num text-weight-bolder">{{ fmtN(grandTotals.taxAmt) }}</td>
            <td class="gs-table__td gs-table__td--num text-weight-bolder text-green">{{ fmtN(grandTotals.amtWithTax) }}</td>
            <td class="gs-table__td gs-table__td--num text-weight-bolder">{{ fmtN(grandTotals.wastageAmt) }}</td>
            <td class="gs-table__td" />
          </tr>
        </tfoot>
      </table>

      <!-- ── Footer Summaries (matching SAP) ──────── -->
      <div v-if="groupRows.length > 0" class="gs-footer">
        <div class="gs-footer__row">
          <span class="gs-footer__label">Complementary :</span>
          <span class="gs-footer__value">{{ fmtN(0) }}</span>
        </div>
        <div class="gs-footer__row">
          <span class="gs-footer__label">Manual Minus(Disc) :</span>
          <span class="gs-footer__value">{{ fmtN(0) }}</span>
        </div>
        <div class="gs-footer__row gs-footer__row--bold">
          <span class="gs-footer__label">Net Amount Tot :</span>
          <span class="gs-footer__value text-green">{{ fmtN(grandTotals.amtWithTax) }}</span>
        </div>
      </div>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'

const authStore = useAuthStore()
const loading = ref(false)
const rawItems = ref([])
const currentFilters = ref({})

// ── Helpers ────────────────────────────────────────────────
const branchName = computed(() => authStore.currentBranch?.name || 'SEVEN WAVES RESTAURANT')
const todayFormatted = computed(() =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
)
const reportDateRange = computed(() => {
  const f = currentFilters.value
  if (f.dateFrom && f.dateTo) return `${fmtDate(f.dateFrom)} || To Date : ${fmtDate(f.dateTo)}`
  return fmtDate(new Date().toISOString().slice(0, 10))
})

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtN(val) {
  const n = Number(val || 0)
  return n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

// ── Grouped rows from raw data ────────────────────────────
const groupRows = computed(() => {
  if (rawItems.value.length === 0) return []

  // Group by category
  const groups = {}
  for (const item of rawItems.value) {
    const cat = item.category || 'UNCATEGORIZED'
    if (!groups[cat]) {
      groups[cat] = { qty: 0, grossAmt: 0, discAmt: 0, taxAmt: 0, returnAmt: 0, wastageAmt: 0 }
    }
    groups[cat].qty += Number(item.qty || 0)
    groups[cat].grossAmt += Number(item.grossAmt || 0)
    groups[cat].discAmt += Number(item.discAmt || 0)
    groups[cat].taxAmt += Number(item.taxAmt || 0)
  }

  const totalGross = Object.values(groups).reduce((s, g) => s + g.grossAmt, 0)

  return Object.entries(groups)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, data], idx) => ({
      code: String(idx + 1).padStart(2, '0'),
      description: name,
      qty: data.qty,
      grossAmt: data.grossAmt,
      returnAmt: data.returnAmt,
      discAmt: data.discAmt,
      netAmt: data.grossAmt - data.discAmt,
      taxAmt: data.taxAmt,
      amtWithTax: data.grossAmt - data.discAmt + data.taxAmt,
      wastageAmt: data.wastageAmt,
      pctSale: totalGross > 0 ? ((data.grossAmt / totalGross) * 100).toFixed(2) : '0.00',
    }))
})

const grandTotals = computed(() => {
  const rows = groupRows.value
  return {
    qty: rows.reduce((s, r) => s + r.qty, 0),
    grossAmt: rows.reduce((s, r) => s + r.grossAmt, 0),
    returnAmt: rows.reduce((s, r) => s + r.returnAmt, 0),
    discAmt: rows.reduce((s, r) => s + r.discAmt, 0),
    netAmt: rows.reduce((s, r) => s + r.netAmt, 0),
    taxAmt: rows.reduce((s, r) => s + r.taxAmt, 0),
    amtWithTax: rows.reduce((s, r) => s + r.amtWithTax, 0),
    wastageAmt: rows.reduce((s, r) => s + r.wastageAmt, 0),
  }
})

// ── KPIs ──────────────────────────────────────────────────
const kpiData = computed(() => [
  { label: 'Categories', value: groupRows.value.length, icon: 'category', color: 'blue' },
  { label: 'Total Qty', value: grandTotals.value.qty, icon: 'shopping_cart', color: 'cyan' },
  { label: 'Gross Sales', value: `LKR ${fmtN(grandTotals.value.grossAmt)}`, icon: 'payments', color: 'green' },
  { label: 'Net with Tax', value: `LKR ${fmtN(grandTotals.value.amtWithTax)}`, icon: 'trending_up', color: 'purple' },
])

// ── Data Loading ──────────────────────────────────────────
async function loadData(filters = {}) {
  loading.value = true
  currentFilters.value = filters
  try {
    let query = supabase
      .from('order_items')
      .select(`
        id,
        quantity,
        unit_price,
        total_price,
        status,
        orders!inner (
          id, status, subtotal, tax_amount, discount_amount, total_amount,
          branch_id, created_at
        ),
        menu_items (
          id, name,
          item_categories ( id, name )
        )
      `)

    if (filters.dateFrom) query = query.gte('orders.created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('orders.created_at', filters.dateTo + 'T23:59:59')

    if (filters.branch) {
      query = query.eq('orders.branch_id', filters.branch)
    } else if (!authStore.isAdmin) {
      const branchId = authStore.currentBranch?.id
      if (branchId) query = query.eq('orders.branch_id', branchId)
    }

    query = query.not('status', 'eq', 'cancelled')

    const { data, error } = await query.limit(10000)
    if (error) throw error

    // Process into per-category aggregations
    const items = []
    for (const oi of (data || [])) {
      const order = oi.orders
      if (!order || order.status === 'cancelled') continue

      const menuItem = oi.menu_items || {}
      const category = menuItem.item_categories || {}
      const itemTotal = Number(oi.total_price || oi.quantity * oi.unit_price || 0)
      const orderSubtotal = Number(order.subtotal || order.total_amount || 1)
      const ratio = orderSubtotal > 0 ? itemTotal / orderSubtotal : 0

      items.push({
        category: (category.name || 'UNCATEGORIZED').toUpperCase(),
        qty: Number(oi.quantity || 0),
        grossAmt: itemTotal,
        discAmt: Number(order.discount_amount || 0) * ratio,
        taxAmt: Number(order.tax_amount || 0) * ratio,
      })
    }

    rawItems.value = items
  } catch (err) {
    console.error('[GroupSummary] Error:', err)
  } finally {
    loading.value = false
  }
}

// ── Export ─────────────────────────────────────────────────
const exportColumns = [
  { name: 'code', label: 'Code', field: 'code' },
  { name: 'description', label: 'Description', field: 'description' },
  { name: 'qty', label: 'Qty', field: 'qty' },
  { name: 'grossAmt', label: 'Gross Amount', field: 'grossAmt' },
  { name: 'returnAmt', label: 'Return Amount', field: 'returnAmt' },
  { name: 'discAmt', label: 'Disc Amt', field: 'discAmt' },
  { name: 'netAmt', label: 'Net Amount', field: 'netAmt' },
  { name: 'taxAmt', label: 'Tax Amt', field: 'taxAmt' },
  { name: 'amtWithTax', label: 'Amt with Tax', field: 'amtWithTax' },
  { name: 'wastageAmt', label: 'Wastage Amt', field: 'wastageAmt' },
  { name: 'pctSale', label: '% of Sale', field: 'pctSale' },
]

function exportCSV() { exportTableToCSV(exportColumns, groupRows.value, 'group_summary') }
function exportExcel() { exportTableToExcel(exportColumns, groupRows.value, 'group_summary') }
</script>

<style scoped lang="scss">
/* ── SAP Header ────────────────────────────────────────────── */
.gs-header {
  padding: 14px 16px 10px;
  border-bottom: 2px solid var(--erp-border, rgba(255, 255, 255, 0.1));
  background: rgba(255, 255, 255, 0.02);

  &__top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  &__left { flex: 1; text-align: center; }
  &__company {
    font-size: 15px;
    font-weight: 800;
    color: var(--erp-text-primary, #f8fafc);
  }
  &__title {
    font-size: 12px;
    font-weight: 700;
    color: var(--erp-text-secondary, #94a3b8);
    margin-top: 2px;
    text-decoration: underline;
  }
  &__right { text-align: right; flex-shrink: 0; }
  &__page { font-size: 11px; color: var(--erp-text-secondary, #94a3b8); }
  &__date { font-size: 11px; color: var(--erp-text-muted, #64748b); }
  &__meta {
    font-size: 11px;
    color: var(--erp-text-muted, #64748b);
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
}

/* ── Table ─────────────────────────────────────────────────── */
.gs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  margin-top: 4px;
}

.gs-table__header { background: rgba(255, 255, 255, 0.04); }

.gs-table__th {
  font-size: 10px;
  font-weight: 700;
  color: var(--erp-text-secondary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 6px 6px;
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08));
  text-align: left;
  white-space: nowrap;

  &--num { text-align: right; }
}

.gs-table__row {
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.03));

  &:hover { background: rgba(255, 255, 255, 0.02); }
}

.gs-table__td {
  font-size: 11px;
  color: var(--erp-text-primary, #f8fafc);
  padding: 5px 6px;
  height: 28px;

  &--num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-family: 'SF Mono', 'Consolas', monospace;
  }
  &--code {
    font-weight: 700;
    color: var(--erp-primary, #2563eb);
    font-family: 'SF Mono', 'Consolas', monospace;
  }
  &--desc {
    font-weight: 700;
    text-transform: uppercase;
  }
}

.gs-table__grand-total {
  background: rgba(255, 255, 255, 0.05);
  border-top: 2px solid var(--erp-border, rgba(255, 255, 255, 0.12));
  border-bottom: 2px solid var(--erp-border, rgba(255, 255, 255, 0.12));

  td {
    font-size: 12px !important;
    padding: 8px 6px !important;
  }
}

.gs-table__loading,
.gs-table__empty {
  text-align: center;
  padding: 40px;
  color: var(--erp-text-muted, #64748b);
  font-size: 13px;
}

/* ── Footer Summaries ──────────────────────────────────────── */
.gs-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
}

.gs-footer__row {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  padding: 3px 0;
  font-size: 11px;
  color: var(--erp-text-secondary, #94a3b8);

  &--bold {
    font-weight: 800;
    font-size: 12px;
    color: var(--erp-text-primary, #f8fafc);
    border-top: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08));
    padding-top: 6px;
    margin-top: 2px;
  }
}

.gs-footer__label {
  text-align: right;
  min-width: 160px;
}

.gs-footer__value {
  text-align: right;
  min-width: 120px;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
}

/* ── Print Overrides ───────────────────────────────────────── */
@media print {
  .gs-header {
    background: none !important;
    border-bottom: 2pt solid #1a1a2e !important;
    padding: 6pt 0 !important;
  }
  .gs-header__company { font-size: 13pt !important; color: #1a1a2e !important; }
  .gs-header__title { font-size: 10pt !important; color: #333 !important; }
  .gs-header__meta, .gs-header__page, .gs-header__date { color: #555 !important; font-size: 8pt !important; }

  .gs-table__th {
    font-size: 7pt !important;
    background: #1a1a2e !important;
    color: #fff !important;
    padding: 3pt 4pt !important;
  }
  .gs-table__td {
    font-size: 7pt !important;
    color: #222 !important;
    padding: 2pt 4pt !important;
    height: auto !important;
  }
  .gs-table__grand-total td {
    font-size: 8pt !important;
    color: #1a1a2e !important;
    background: #e8edf3 !important;
    border-top: 1.5pt solid #1a1a2e !important;
    border-bottom: 1.5pt solid #1a1a2e !important;
  }
  .gs-footer { padding: 4pt 0 !important; }
  .gs-footer__row { font-size: 7pt !important; color: #333 !important; }
  .gs-footer__row--bold { font-size: 8pt !important; color: #1a1a2e !important; }
}
</style>
