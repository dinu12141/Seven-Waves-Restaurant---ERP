<template>
  <ReportLayout
    title="Hourly Sales Report"
    subtitle="Sales trend analysis by hour of day — identify peak and off-peak periods"
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
        row-key="hour"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[24]"
        :pagination="{ rowsPerPage: 24 }"
        hide-pagination
      >
        <template #header="props">
          <q-tr :props="props" class="report-table__header-row">
            <q-th
              v-for="col in props.cols"
              :key="col.name"
              :props="props"
              class="report-table__th"
              >{{ col.label }}</q-th
            >
          </q-tr>
        </template>
        <template #body="props">
          <q-tr :props="props" class="report-table__row">
            <q-td key="hour_label" :props="props" class="text-weight-bold">{{
              props.row.hour_label
            }}</q-td>
            <q-td key="order_count" :props="props" class="report-table__td--num">{{
              props.row.order_count
            }}</q-td>
            <q-td
              key="total_amount"
              :props="props"
              class="report-table__td--num text-weight-bolder text-green"
              >{{ fmtLKR(props.row.total_amount) }}</q-td
            >
            <q-td key="avg_order" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.avg_order)
            }}</q-td>
            <q-td key="share" :props="props" class="report-table__td--num">
              <div style="display: flex; align-items: center; gap: 8px; justify-content: flex-end">
                <div class="hourly-bar" :style="{ width: props.row.share + '%' }" />
                <span>{{ fmtPercent(props.row.share) }}</span>
              </div>
            </q-td>
          </q-tr>
        </template>
        <template #bottom-row>
          <q-tr class="report-table__total-row">
            <q-td class="report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{ totals.orders }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-green">{{
              fmtLKR(totals.amount)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              totals.orders > 0 ? fmtLKR(totals.amount / totals.orders) : '—'
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">100%</q-td>
          </q-tr>
        </template>
        <template #no-data>
          <div class="report-empty">
            <q-icon name="schedule" size="40px" class="q-mb-sm" />
            <div>No hourly data</div>
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
  { name: 'hour_label', label: 'Hour', field: 'hour_label', align: 'left' },
  { name: 'order_count', label: 'Orders', field: 'order_count', align: 'right', sortable: true },
  { name: 'total_amount', label: 'Revenue', field: 'total_amount', align: 'right', sortable: true },
  { name: 'avg_order', label: 'Avg Order', field: 'avg_order', align: 'right', sortable: true },
  { name: 'share', label: '% Share', field: 'share', align: 'right', sortable: true },
]

const totals = computed(() => ({
  orders: rows.value.reduce((s, r) => s + r.order_count, 0),
  amount: rows.value.reduce((s, r) => s + r.total_amount, 0),
}))

const kpiData = computed(() => {
  const peakHour = rows.value.reduce(
    (max, r) => (r.total_amount > (max?.total_amount || 0) ? r : max),
    null,
  )
  return [
    { label: 'Peak Hour', value: peakHour?.hour_label || '—', icon: 'trending_up', color: 'blue' },
    {
      label: 'Total Revenue',
      value: fmtLKR(totals.value.amount),
      icon: 'payments',
      color: 'green',
    },
    { label: 'Total Orders', value: totals.value.orders, icon: 'receipt_long', color: 'purple' },
    {
      label: 'Avg/Hour',
      value: fmtLKR(totals.value.amount / 24),
      icon: 'schedule',
      color: 'amber',
    },
  ]
})

async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('orders')
      .select('created_at, total_amount, status')
      .neq('status', 'cancelled')

    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    query = applyBranchSecurity(query)

    const { data, error } = await query.limit(5000)
    if (error) throw error

    // Aggregate by hour
    const hourMap = {}
    for (let h = 0; h < 24; h++) hourMap[h] = { hour: h, order_count: 0, total_amount: 0 }

    let grandTotal = 0
    ;(data || []).forEach((bill) => {
      const h = new Date(bill.created_at).getHours()
      hourMap[h].order_count++
      hourMap[h].total_amount += Number(bill.total_amount || 0)
      grandTotal += Number(bill.total_amount || 0)
    })

    rows.value = Object.values(hourMap).map((h) => ({
      ...h,
      hour_label: `${String(h.hour).padStart(2, '0')}:00 – ${String(h.hour).padStart(2, '0')}:59`,
      avg_order: h.order_count > 0 ? h.total_amount / h.order_count : 0,
      share: grandTotal > 0 ? (h.total_amount / grandTotal) * 100 : 0,
    }))
  } catch (err) {
    console.error('[HourlySales]', err)
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  exportTableToCSV(columns, rows.value, 'hourly_sales')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'hourly_sales')
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
.hourly-bar {
  height: 6px;
  min-width: 2px;
  max-width: 80px;
  background: var(--erp-primary, #2563eb);
  border-radius: 3px;
}
</style>
