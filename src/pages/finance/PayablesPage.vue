<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar moduleName="finance" title="Accounts Payable" breadcrumbs="Finance / Receivables & Payables / AP" showRefresh @refresh="loadData" />

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
        <span class="fin-panel__title">AP Ledger Entries ({{ payables.length }})</span>
      </div>
      <q-table :rows="payables" :columns="columns" row-key="id" flat dark dense :rows-per-page-options="[20, 50]" class="fin-table" :loading="loading" no-data-label="No payable entries">
        <template #body-cell-aging_bucket="props">
          <q-td :props="props">
            <span :class="bucketClass(props.row.aging_bucket)">{{ props.row.aging_bucket }}</span>
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchPayableAging } from 'src/services/financeService'

const loading = ref(false)
const payables = ref([])

const agingBuckets = computed(() => {
  const buckets = { current: 0, '1-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 }
  payables.value.forEach(p => { if (buckets[p.aging_bucket] !== undefined) buckets[p.aging_bucket] += Number(p.debit || 0) })
  return [
    { label: 'Current', total: buckets.current, bg: 'rgba(16,185,129,0.12)', color: 'green' },
    { label: '1-30 Days', total: buckets['1-30 days'], bg: 'rgba(245,158,11,0.12)', color: 'orange' },
    { label: '31-60 Days', total: buckets['31-60 days'], bg: 'rgba(239,68,68,0.12)', color: 'red' },
    { label: '61-90 Days', total: buckets['61-90 days'], bg: 'rgba(139,92,246,0.12)', color: 'purple' },
    { label: '90+ Days', total: buckets['90+ days'], bg: 'rgba(220,38,38,0.15)', color: 'red' },
  ]
})

const columns = [
  { name: 'supplier', label: 'Supplier', field: 'supplier_name', align: 'left' },
  { name: 'entry_type', label: 'Entry Type', field: 'entry_type', align: 'left' },
  { name: 'doc_number', label: 'Doc #', field: 'doc_number', align: 'left' },
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left' },
  { name: 'debit', label: 'Debit', field: 'debit', align: 'right', format: v => fmt(v) },
  { name: 'credit', label: 'Credit', field: 'credit', align: 'right', format: v => fmt(v) },
  { name: 'due_date', label: 'Due Date', field: 'due_date', align: 'left' },
  { name: 'aging_bucket', label: 'Aging', field: 'aging_bucket', align: 'center' },
]

function fmt(v) { return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }
function bucketClass(b) {
  if (b === 'current') return 'fin-badge fin-badge--success'
  if (b === '1-30 days') return 'fin-badge fin-badge--warning'
  return 'fin-badge fin-badge--danger'
}

async function loadData() {
  loading.value = true
  const { data } = await fetchPayableAging()
  payables.value = data || []
  loading.value = false
}
onMounted(loadData)
</script>

<style scoped lang="scss">@import 'src/css/finance-common.scss';</style>
