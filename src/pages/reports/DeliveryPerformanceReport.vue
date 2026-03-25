<template>
  <ReportLayout
    title="Delivery Performance Report"
    subtitle="Delivery timing, success rates, and performance analysis"
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
        row-key="id"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        :pagination="{ rowsPerPage: 50 }"
        binary-state-sort
      >
        <template #header="props"
          ><q-tr :props="props" class="report-table__header-row"
            ><q-th
              v-for="col in props.cols"
              :key="col.name"
              :props="props"
              class="report-table__th"
              >{{ col.label }}</q-th
            ></q-tr
          ></template
        >
        <template #body="props"
          ><q-tr :props="props" class="report-table__row">
            <q-td
              key="order_number"
              :props="props"
              class="report-table__td--mono text-weight-bold"
              >{{ props.row.order_number }}</q-td
            >
            <q-td key="date" :props="props">{{ fmtDateTime(props.row.date) }}</q-td>
            <q-td key="rider" :props="props">{{ props.row.rider }}</q-td>
            <q-td key="status" :props="props"
              ><span class="report-badge" :class="`report-badge--${props.row.status}`">{{
                props.row.status
              }}</span></q-td
            >
            <q-td key="delivery_time" :props="props" class="report-table__td--num"
              ><q-badge
                :color="
                  props.row.delivery_time > 45
                    ? 'red'
                    : props.row.delivery_time > 30
                      ? 'orange'
                      : 'green'
                "
                >{{ props.row.delivery_time }} min</q-badge
              ></q-td
            >
            <q-td key="total" :props="props" class="report-table__td--num text-weight-bold">{{
              fmtLKR(props.row.total)
            }}</q-td>
            <q-td key="area" :props="props">{{ props.row.area || '—' }}</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="local_shipping" size="40px" class="q-mb-sm" />
            <div>No delivery data for this period</div>
          </div></template
        >
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtDateTime } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const columns = [
  { name: 'order_number', label: 'Order #', field: 'order_number', align: 'left', sortable: true },
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'rider', label: 'Rider', field: 'rider', align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'left', sortable: true },
  {
    name: 'delivery_time',
    label: 'Delivery Time',
    field: 'delivery_time',
    align: 'right',
    sortable: true,
  },
  { name: 'total', label: 'Order Total', field: 'total', align: 'right', sortable: true },
  { name: 'area', label: 'Area', field: 'area', align: 'left' },
]
const kpiData = computed(() => {
  const avgTime =
    rows.value.length > 0
      ? rows.value.reduce((s, r) => s + r.delivery_time, 0) / rows.value.length
      : 0
  return [
    { label: 'Total Deliveries', value: rows.value.length, icon: 'local_shipping', color: 'blue' },
    {
      label: 'Avg Delivery Time',
      value: `${avgTime.toFixed(0)} min`,
      icon: 'schedule',
      color: avgTime > 35 ? 'red' : 'green',
    },
    {
      label: 'On-Time (<30m)',
      value: rows.value.filter((r) => r.delivery_time <= 30).length,
      icon: 'check_circle',
      color: 'green',
    },
    {
      label: 'Late (>45m)',
      value: rows.value.filter((r) => r.delivery_time > 45).length,
      icon: 'warning',
      color: 'red',
    },
  ]
})
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('delivery_assignments')
      .select(
        'id,created_at,delivered_at,status,delivery_address,orders(order_number,total_amount,branch_id),profiles(full_name)',
      )
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    rows.value = (data || []).map((r) => {
      const created = new Date(r.created_at)
      const delivered = r.delivered_at ? new Date(r.delivered_at) : new Date()
      const delTime = Math.round((delivered - created) / 60000)
      return {
        id: r.id,
        order_number: r.orders?.order_number || '—',
        date: r.created_at,
        rider: r.profiles?.full_name || '—',
        status: r.status || 'pending',
        delivery_time: delTime,
        total: Number(r.orders?.total_amount || 0),
        area: r.delivery_address || '—',
      }
    })
  } catch (e) {
    console.error('[DeliveryPerf]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'delivery_performance')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'delivery_performance')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
