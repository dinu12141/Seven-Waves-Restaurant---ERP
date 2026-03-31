<template>
  <ReportLayout
    title="Payment Method Summary"
    subtitle="Revenue breakdown by payment method — cash, card, online, etc."
    :kpis="kpiData"
    :export-columns="columns"
    :export-rows="rows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="method"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25]"
        :pagination="{ rowsPerPage: 25 }"
        hide-pagination
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
            <q-td key="method" :props="props"
              ><span
                class="report-badge"
                :class="`report-badge--${props.row.method?.toLowerCase()}`"
                >{{ props.row.method }}</span
              ></q-td
            >
            <q-td key="count" :props="props" class="report-table__td--num">{{
              props.row.count
            }}</q-td>
            <q-td
              key="total"
              :props="props"
              class="report-table__td--num text-weight-bolder text-green"
              >{{ fmtLKR(props.row.total) }}</q-td
            >
            <q-td key="avg" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.avg)
            }}</q-td>
            <q-td key="share" :props="props" class="report-table__td--num">
              <div style="display: flex; align-items: center; gap: 8px; justify-content: flex-end">
                <div
                  class="payment-bar"
                  :style="{
                    width: Math.min(props.row.share, 100) + '%',
                    background: getMethodColor(props.row.method),
                  }"
                />
                <span>{{ fmtPercent(props.row.share) }}</span>
              </div>
            </q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td class="report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{ totals.count }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-green">{{
              fmtLKR(totals.total)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              totals.count > 0 ? fmtLKR(totals.total / totals.count) : '—'
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">100%</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="payments" size="40px" class="q-mb-sm" />
            <div>No payment data</div>
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
import { fmtLKR, fmtPercent, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const columns = [
  { name: 'method', label: 'Payment Method', field: 'method', align: 'left', sortable: true },
  { name: 'count', label: 'Transactions', field: 'count', align: 'right', sortable: true },
  { name: 'total', label: 'Total Amount', field: 'total', align: 'right', sortable: true },
  { name: 'avg', label: 'Avg Transaction', field: 'avg', align: 'right', sortable: true },
  { name: 'share', label: '% Share', field: 'share', align: 'right', sortable: true },
]
const totals = computed(() => ({
  count: rows.value.reduce((s, r) => s + r.count, 0),
  total: rows.value.reduce((s, r) => s + r.total, 0),
}))
const kpiData = computed(() => {
  const topMethod = rows.value[0]
  return [
    { label: 'Payment Methods', value: rows.value.length, icon: 'payments', color: 'blue' },
    {
      label: 'Total Revenue',
      value: fmtLKR(totals.value.total),
      icon: 'account_balance',
      color: 'green',
    },
    { label: 'Top Method', value: topMethod?.method || '—', icon: 'emoji_events', color: 'amber' },
    {
      label: 'Total Transactions',
      value: totals.value.count,
      icon: 'receipt_long',
      color: 'purple',
    },
  ]
})
function getMethodColor(m) {
  const c = { cash: '#16a34a', card: '#2563eb', online: '#7c3aed' }
  return c[m?.toLowerCase()] || '#64748b'
}
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('orders')
      .select('total_amount,status,invoices(payments(amount,payment_methods(name)))')
      .neq('status', 'cancelled')
      .neq('status', 'void')
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    query = applyBranchSecurity(query)
    const { data, error } = await query.limit(5000)
    if (error) throw error
    const pMap = {}
    let gt = 0
    ;(data || []).forEach((order) => {
      const amt = Number(order.total_amount || 0)
      // Extract payment method from invoices→payments→payment_methods
      let methodName = 'Unpaid'
      const invs = Array.isArray(order.invoices)
        ? order.invoices
        : order.invoices
          ? [order.invoices]
          : []
      for (const inv of invs) {
        const pays = Array.isArray(inv.payments) ? inv.payments : inv.payments ? [inv.payments] : []
        for (const p of pays) {
          if (p.payment_methods?.name) {
            methodName = p.payment_methods.name
            break
          }
        }
        if (methodName !== 'Unpaid') break
      }
      if (!pMap[methodName]) pMap[methodName] = { method: methodName, count: 0, total: 0 }
      pMap[methodName].count++
      pMap[methodName].total += amt
      gt += amt
    })
    rows.value = Object.values(pMap)
      .map((p) => ({
        ...p,
        avg: p.count > 0 ? p.total / p.count : 0,
        share: gt > 0 ? (p.total / gt) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
  } catch (e) {
    console.error('[PaymentSummary]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'payment_method_summary')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'payment_method_summary')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
.payment-bar {
  height: 6px;
  min-width: 2px;
  max-width: 80px;
  border-radius: 3px;
}
</style>
