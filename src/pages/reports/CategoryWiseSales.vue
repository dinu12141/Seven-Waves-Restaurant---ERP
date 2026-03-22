<template>
  <ReportLayout
    title="Category Wise Sales"
    subtitle="Sales breakdown by menu category with revenue share analysis"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="category"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        :pagination="{ rowsPerPage: 50, sortBy: 'total_amount', descending: true }"
      >
        <template #header="props">
          <q-tr :props="props" class="report-table__header-row">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <template #body="props">
          <q-tr :props="props" class="report-table__row">
            <q-td key="category" :props="props" class="text-weight-bold">{{ props.row.category }}</q-td>
            <q-td key="item_count" :props="props" class="report-table__td--num">{{ props.row.item_count }}</q-td>
            <q-td key="total_qty" :props="props" class="report-table__td--num">{{ props.row.total_qty }}</q-td>
            <q-td key="total_amount" :props="props" class="report-table__td--num text-weight-bolder text-green">{{ fmtLKR(props.row.total_amount) }}</q-td>
            <q-td key="total_discount" :props="props" class="report-table__td--num text-red">{{ fmtLKR(props.row.total_discount) }}</q-td>
            <q-td key="net_amount" :props="props" class="report-table__td--num text-weight-bold">{{ fmtLKR(props.row.net_amount) }}</q-td>
            <q-td key="share" :props="props" class="report-table__td--num">
              <q-badge :color="props.row.share > 20 ? 'blue' : 'grey'">
                {{ fmtPercent(props.row.share) }}
              </q-badge>
            </q-td>
          </q-tr>
        </template>

        <template #bottom-row>
          <q-tr class="report-table__total-row">
            <q-td class="report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{ totals.items }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{ totals.qty }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-green">{{ fmtLKR(totals.amount) }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-red">{{ fmtLKR(totals.discount) }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{ fmtLKR(totals.net) }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">100%</q-td>
          </q-tr>
        </template>

        <template #no-data>
          <div class="report-empty">
            <q-icon name="donut_small" size="40px" class="q-mb-sm" />
            <div>No category sales data for the selected period</div>
          </div>
        </template>
      </q-table>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtPercent, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])

const columns = [
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  { name: 'item_count', label: 'Items Sold', field: 'item_count', align: 'right', sortable: true },
  { name: 'total_qty', label: 'Total Qty', field: 'total_qty', align: 'right', sortable: true },
  { name: 'total_amount', label: 'Gross Amount', field: 'total_amount', align: 'right', sortable: true },
  { name: 'total_discount', label: 'Discount', field: 'total_discount', align: 'right', sortable: true },
  { name: 'net_amount', label: 'Net Amount', field: 'net_amount', align: 'right', sortable: true },
  { name: 'share', label: '% Share', field: 'share', align: 'right', sortable: true },
]

const totals = computed(() => {
  const t = { items: 0, qty: 0, amount: 0, discount: 0, net: 0 }
  rows.value.forEach((r) => {
    t.items += r.item_count
    t.qty += r.total_qty
    t.amount += r.total_amount
    t.discount += r.total_discount
    t.net += r.net_amount
  })
  return t
})

const kpiData = computed(() => [
  { label: 'Categories', value: rows.value.length, icon: 'category', color: 'blue' },
  { label: 'Total Qty Sold', value: totals.value.qty, icon: 'shopping_cart', color: 'green' },
  { label: 'Gross Revenue', value: fmtLKR(totals.value.amount), icon: 'payments', color: 'purple' },
  { label: 'Top Category', value: rows.value[0]?.category || '—', icon: 'emoji_events', color: 'amber' },
])

async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('order_items')
      .select(`
        quantity,
        unit_price,
        total_price,
        menu_items!inner ( name, item_categories ( name ) ),
        orders!inner ( created_at, branch_id, status )
      `)
      .neq('orders.status', 'cancelled')

    if (filters.dateFrom) query = query.gte('orders.created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('orders.created_at', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('orders.branch_id', filters.branch)
    query = applyBranchSecurity(query, 'orders.branch_id')

    const { data, error } = await query.limit(5000)
    if (error) throw error

    // Aggregate by category
    const catMap = {}
    let grandTotal = 0
    ;(data || []).forEach((item) => {
      const cat = item.menu_items?.item_categories?.name || 'Uncategorized'
      if (!catMap[cat]) catMap[cat] = { category: cat, item_count: 0, total_qty: 0, total_amount: 0, total_discount: 0, net_amount: 0, items: new Set() }
      const qty = Number(item.quantity || 0)
      const amt = Number(item.total_price || 0) || qty * Number(item.unit_price || 0)
      catMap[cat].total_qty += qty
      catMap[cat].total_amount += amt
      catMap[cat].net_amount += amt
      catMap[cat].items.add(item.menu_items?.name)
      grandTotal += amt
    })

    rows.value = Object.values(catMap)
      .map((c) => ({
        ...c,
        item_count: c.items.size,
        share: grandTotal > 0 ? (c.total_amount / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total_amount - a.total_amount)
  } catch (err) {
    console.error('[CategoryWiseSales]', err)
  } finally {
    loading.value = false
  }
}

function exportCSV() { exportTableToCSV(columns, rows.value, 'category_wise_sales') }
function exportExcel() { exportTableToExcel(columns, rows.value, 'category_wise_sales') }
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
