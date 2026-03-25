<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Accounts Receivable"
      breadcrumbs="Finance / Receivables & Payables / AR"
      showRefresh
      @refresh="loadData"
    />

    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="(bucket, i) in agingBuckets" :key="i" class="col-12 col-sm-6 col-md">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" :style="{ background: bucket.bg }">
            <q-icon name="schedule" size="18px" :color="bucket.color" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">{{ bucket.label }}</div>
            <div class="fin-kpi-card__value">{{ fmt(bucket.total) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Outstanding Receivables ({{ receivables.length }})</span>
      </div>
      <q-table
        :rows="receivables"
        :columns="columns"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[20, 50]"
        class="fin-table"
        :loading="loading"
        no-data-label="No outstanding receivables"
      >
        <template #body-cell-status="props">
          <q-td :props="props">
            <span :class="statusClass(props.row.status)">{{ props.row.status }}</span>
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchReceivables, fetchReceivableAging } from 'src/services/financeService'

const loading = ref(false)
const receivables = ref([])
const agingData = ref([])

const agingBuckets = computed(() => {
  const buckets = { current: 0, '1-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 }
  agingData.value.forEach((r) => {
    if (buckets[r.aging_bucket] !== undefined) buckets[r.aging_bucket] += Number(r.balance || 0)
  })
  return [
    { label: 'Current', total: buckets.current, bg: 'rgba(16,185,129,0.12)', color: 'green' },
    {
      label: '1-30 Days',
      total: buckets['1-30 days'],
      bg: 'rgba(245,158,11,0.12)',
      color: 'orange',
    },
    { label: '31-60 Days', total: buckets['31-60 days'], bg: 'rgba(239,68,68,0.12)', color: 'red' },
    {
      label: '61-90 Days',
      total: buckets['61-90 days'],
      bg: 'rgba(139,92,246,0.12)',
      color: 'purple',
    },
    { label: '90+ Days', total: buckets['90+ days'], bg: 'rgba(220,38,38,0.15)', color: 'red' },
  ]
})

const columns = [
  {
    name: 'customer',
    label: 'Customer',
    field: (row) => row.customers?.name || '-',
    align: 'left',
  },
  {
    name: 'total_amount',
    label: 'Total',
    field: 'total_amount',
    align: 'right',
    format: (v) => fmt(v),
  },
  {
    name: 'paid_amount',
    label: 'Paid',
    field: 'paid_amount',
    align: 'right',
    format: (v) => fmt(v),
  },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right', format: (v) => fmt(v) },
  { name: 'due_date', label: 'Due Date', field: 'due_date', align: 'left' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
}
function statusClass(s) {
  const m = {
    outstanding: 'fin-badge fin-badge--warning',
    partial: 'fin-badge fin-badge--info',
    paid: 'fin-badge fin-badge--success',
    overdue: 'fin-badge fin-badge--danger',
  }
  return m[s] || 'fin-badge fin-badge--muted'
}

async function loadData() {
  loading.value = true
  const [recvRes, agingRes] = await Promise.all([fetchReceivables(), fetchReceivableAging()])
  receivables.value = recvRes.data || []
  agingData.value = agingRes.data || []
  loading.value = false
}
onMounted(loadData)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
