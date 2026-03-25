<template>
  <ReportLayout
    title="Group Summary"
    subtitle="Department Summary — Sales broken down by menu category groups"
    :kpis="kpiData"
    :hide-sap-header="true"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <!-- SAP-style Report Header -->
      <div class="sap-header">
        <div class="sap-header__left">
          <div class="sap-header__center">
            <div class="sap-header__company">SEVEN WAVES RESTAURANT (PVT) LTD</div>
            <div class="sap-header__title sap-header__title--underline">Group Summary</div>
          </div>
          <div class="sap-header__meta">
            <div>Location: <strong>{{ branchName }}</strong></div>
            <div>From Date : <strong>{{ reportDateRange }}</strong></div>
          </div>
        </div>
        <div class="sap-header__right">
          <div class="sap-header__page">Page 1 of 1</div>
          <div class="sap-header__date">{{ todayFormatted }}</div>
        </div>
      </div>

      <!-- ── Data Table ───────────────────────────── -->
      <table class="sap-native-table">
        <thead>
          <tr>
            <th class="sap-native-table__th">Code</th>
            <th class="sap-native-table__th">Description</th>
            <th class="sap-native-table__th sap-native-table__th--num">Qty</th>
            <th class="sap-native-table__th sap-native-table__th--num">Gross Amount</th>
            <th class="sap-native-table__th sap-native-table__th--num">Return Amount</th>
            <th class="sap-native-table__th sap-native-table__th--num">Disc Amt</th>
            <th class="sap-native-table__th sap-native-table__th--num">Net Amount</th>
            <th class="sap-native-table__th sap-native-table__th--num">Tax Amt</th>
            <th class="sap-native-table__th sap-native-table__th--num">Amt with Tax</th>
            <th class="sap-native-table__th sap-native-table__th--num">Wastage Amt</th>
            <th class="sap-native-table__th sap-native-table__th--num">% of Sale</th>
          </tr>
        </thead>
        <tbody v-if="loading">
          <tr>
            <td colspan="11" class="sap-native-table__loading">
              <q-spinner-gears size="30px" color="primary" />
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="groupRows.length === 0">
          <tr>
            <td colspan="11" class="sap-native-table__empty">
              <q-icon name="category" size="36px" class="q-mb-sm" />
              <div>No group data for selected period</div>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="row in groupRows" :key="row.code" class="sap-native-table__row">
            <td class="sap-native-table__td sap-native-table__td--code">{{ row.code }}</td>
            <td class="sap-native-table__td sap-native-table__td--desc">{{ row.description }}</td>
            <td class="sap-native-table__td sap-native-table__td--num">{{ row.qty }}</td>
            <td class="sap-native-table__td sap-native-table__td--num">{{ fmtN(row.grossAmt) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num">{{ fmtN(row.returnAmt) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num">{{ fmtN(row.discAmt) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num">{{ fmtN(row.netAmt) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num">{{ fmtN(row.taxAmt) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num text-weight-bold">{{ fmtN(row.amtWithTax) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num">{{ fmtN(row.wastageAmt) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num">{{ row.pctSale }}</td>
          </tr>
        </tbody>
        <tfoot v-if="groupRows.length > 0">
          <tr class="sap-native-table__total">
            <td colspan="2" class="sap-native-table__td text-weight-bolder">Grand Total</td>
            <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">{{ grandTotals.qty }}</td>
            <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">{{ fmtN(grandTotals.grossAmt) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">{{ fmtN(grandTotals.returnAmt) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">{{ fmtN(grandTotals.discAmt) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">{{ fmtN(grandTotals.netAmt) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">{{ fmtN(grandTotals.taxAmt) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder text-green">{{ fmtN(grandTotals.amtWithTax) }}</td>
            <td class="sap-native-table__td sap-native-table__td--num text-weight-bolder">{{ fmtN(grandTotals.wastageAmt) }}</td>
            <td class="sap-native-table__td" />
          </tr>
        </tfoot>
      </table>

      <!-- ── Footer Summaries (matching SAP) ──────── -->
      <div v-if="groupRows.length > 0" class="sap-footer">
        <div class="sap-footer__row">
          <span class="sap-footer__label">Complementary :</span>
          <span class="sap-footer__value">{{ fmtN(0) }}</span>
        </div>
        <div class="sap-footer__row">
          <span class="sap-footer__label">Manual Minus(Disc) :</span>
          <span class="sap-footer__value">{{ fmtN(0) }}</span>
        </div>
        <div class="sap-footer__row sap-footer__row--bold">
          <span class="sap-footer__label">Net Amount Tot :</span>
          <span class="sap-footer__value text-green">{{ fmtN(grandTotals.amtWithTax) }}</span>
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
@import 'src/pages/reports/report-common.scss';
</style>
