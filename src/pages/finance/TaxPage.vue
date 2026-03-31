<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Tax Management"
      breadcrumbs="Finance / Expenses & Tax / Tax"
      showRefresh
      @refresh="loadData"
    />

    <!-- Tax Summary Cards -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card fin-kpi-card--green">
          <div class="fin-kpi-card__icon">
            <q-icon name="arrow_downward" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Tax Collected</div>
            <div class="fin-kpi-card__value">{{ fmt(totalCollected) }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card fin-kpi-card--red">
          <div class="fin-kpi-card__icon">
            <q-icon name="arrow_upward" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Tax Paid</div>
            <div class="fin-kpi-card__value">{{ fmt(totalPaid) }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card fin-kpi-card--blue">
          <div class="fin-kpi-card__icon">
            <q-icon name="balance" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Net Tax Payable</div>
            <div class="fin-kpi-card__value">{{ fmt(totalCollected - totalPaid) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tax Codes -->
    <div class="fin-panel q-mb-md">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Tax Codes</span>
      </div>
      <q-table
        :rows="taxCodes"
        :columns="codeCols"
        row-key="id"
        flat
        dark
        dense
        hide-bottom
        :rows-per-page-options="[0]"
        class="fin-table"
        :loading="loading"
      />
    </div>

    <!-- Tax Transactions -->
    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Tax Transactions ({{ transactions.length }})</span>
      </div>
      <q-table
        :rows="transactions"
        :columns="txnCols"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[20, 50]"
        class="fin-table"
        :loading="loading"
        no-data-label="No tax transactions"
      >
        <template #body-cell-direction="props">
          <q-td :props="props">
            <span
              :class="
                props.row.direction === 'collected'
                  ? 'fin-badge fin-badge--success'
                  : 'fin-badge fin-badge--danger'
              "
              >{{ props.row.direction }}</span
            >
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchTaxCodes, fetchTaxTransactions } from 'src/services/financeService'

const loading = ref(false)
const taxCodes = ref([])
const transactions = ref([])

const totalCollected = computed(() =>
  transactions.value
    .filter((t) => t.direction === 'collected')
    .reduce((s, t) => s + Number(t.tax_amount || 0), 0),
)
const totalPaid = computed(() =>
  transactions.value
    .filter((t) => t.direction === 'paid')
    .reduce((s, t) => s + Number(t.tax_amount || 0), 0),
)

const codeCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width: 100px' },
  { name: 'name', label: 'Name', field: 'name', align: 'left' },
  { name: 'rate', label: 'Rate %', field: 'rate', align: 'right', style: 'width: 80px' },
  { name: 'tax_type', label: 'Type', field: 'tax_type', align: 'center', style: 'width: 100px' },
]

const txnCols = [
  {
    name: 'txn_date',
    label: 'Date',
    field: 'txn_date',
    align: 'left',
    sortable: true,
    style: 'width: 100px',
  },
  { name: 'tax', label: 'Tax Code', field: (row) => row.tax_codes?.code || '-', align: 'left' },
  {
    name: 'base_amount',
    label: 'Base Amount',
    field: 'base_amount',
    align: 'right',
    format: (v) => fmt(v),
  },
  {
    name: 'tax_amount',
    label: 'Tax Amount',
    field: 'tax_amount',
    align: 'right',
    format: (v) => fmt(v),
  },
  {
    name: 'direction',
    label: 'Direction',
    field: 'direction',
    align: 'center',
    style: 'width: 100px',
  },
  { name: 'document_ref', label: 'Doc Ref', field: 'document_ref', align: 'left' },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
}

async function loadData() {
  loading.value = true
  const [codeRes, txnRes] = await Promise.all([fetchTaxCodes(), fetchTaxTransactions()])
  taxCodes.value = codeRes.data || []
  transactions.value = txnRes.data || []
  loading.value = false
}
onMounted(loadData)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
