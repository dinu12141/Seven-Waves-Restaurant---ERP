<template>
  <ReportLayout
    title="Sales Statement"
    subtitle="Comprehensive breakdown of daily revenues, settlements, and collections"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <div v-if="loading" class="row justify-center q-pa-lg">
        <q-spinner-gears size="40px" color="primary" />
      </div>
      <div v-else-if="summary" class="column q-col-gutter-lg q-pa-md">
        <!-- Main Statement Grid Layout matching the screenshot requirements -->
        <div class="row q-col-gutter-md">
          <!-- Left Side: Gross Sales & Deductions -->
          <div class="col-12 col-md-6">
            <q-card class="bg-grey-10 text-white" flat bordered>
              <q-card-section class="bg-primary text-white text-h6 q-pa-sm">
                Revenue & Deductions
              </q-card-section>
              <q-list separator class="report-statement-list">
                <q-item>
                  <q-item-section>Gross Sales</q-item-section>
                  <q-item-section side class="text-white text-weight-bold">{{
                    formatCurrency(summary.gross_sales)
                  }}</q-item-section>
                </q-item>
                <q-item>
                  <q-item-section>Discount</q-item-section>
                  <q-item-section side class="text-red"
                    >({{ formatCurrency(summary.discount) }})</q-item-section
                  >
                </q-item>
                <q-item>
                  <q-item-section>Staff Meal</q-item-section>
                  <q-item-section side class="text-white">{{
                    formatCurrency(summary.staff_meal)
                  }}</q-item-section>
                </q-item>
                <q-item>
                  <q-item-section>Complimentary</q-item-section>
                  <q-item-section side class="text-white">{{
                    formatCurrency(summary.complimentary)
                  }}</q-item-section>
                </q-item>
                <q-item>
                  <q-item-section>Void / Refund</q-item-section>
                  <q-item-section side class="text-red"
                    >({{ formatCurrency(summary.void_refund) }})</q-item-section
                  >
                </q-item>
                <q-item>
                  <q-item-section>Delivery Charges</q-item-section>
                  <q-item-section side class="text-white">{{
                    formatCurrency(summary.delivery_charges)
                  }}</q-item-section>
                </q-item>
                <q-item>
                  <q-item-section>Other Amount</q-item-section>
                  <q-item-section side class="text-white">0.00</q-item-section>
                </q-item>
                <q-item class="bg-grey-9 text-weight-bold">
                  <q-item-section>TOTAL DEBIT</q-item-section>
                  <q-item-section side class="text-orange text-subtitle1">{{
                    formatCurrency(totalDebit)
                  }}</q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>

          <!-- Right Side: Collections & Payments -->
          <div class="col-12 col-md-6">
            <q-card class="bg-grey-10 text-white" flat bordered>
              <q-card-section class="bg-secondary text-white text-h6 q-pa-sm">
                Settlements & Collections
              </q-card-section>
              <q-list separator class="report-statement-list">
                <q-item>
                  <q-item-section>Cash</q-item-section>
                  <q-item-section side class="text-white text-weight-bold">{{
                    formatCurrency(summary.cash)
                  }}</q-item-section>
                </q-item>
                <q-item>
                  <q-item-section>Credit Cards</q-item-section>
                  <q-item-section side class="text-white">{{
                    formatCurrency(summary.credit_cards)
                  }}</q-item-section>
                </q-item>
                <q-item>
                  <q-item-section>Credit Customer / Payment</q-item-section>
                  <q-item-section side class="text-white">{{
                    formatCurrency(summary.credit_customer)
                  }}</q-item-section>
                </q-item>
                <q-item>
                  <q-item-section>FX Currency</q-item-section>
                  <q-item-section side class="text-white">0.00</q-item-section>
                </q-item>
                <q-item>
                  <q-item-section>Loyalty Redemption</q-item-section>
                  <q-item-section side class="text-white">0.00</q-item-section>
                </q-item>
                <q-item class="bg-grey-9 text-weight-bold">
                  <q-item-section>TOTAL COLLECTION (CREDIT)</q-item-section>
                  <q-item-section side class="text-green text-subtitle1">{{
                    formatCurrency(totalCredit)
                  }}</q-item-section>
                </q-item>
                <q-item class="bg-grey-9 text-weight-bold">
                  <q-item-section>NET DIFFERENCE</q-item-section>
                  <q-item-section side :class="netDiff >= 0 ? 'text-green' : 'text-red'">{{
                    formatCurrency(netDiff)
                  }}</q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>
        </div>

        <!-- Sales Analysis By Type -->
        <q-card class="bg-grey-10 text-white q-mt-lg" flat bordered>
          <q-card-section class="bg-accent text-white text-h6 q-pa-sm">
            Sales Analysis By Type
          </q-card-section>

          <q-table
            :rows="summary.order_types || []"
            :columns="analysisColumns"
            row-key="order_type"
            flat
            class="report-table"
            hide-pagination
            :pagination="{ rowsPerPage: 0 }"
          >
            <template #header="props">
              <q-tr :props="props" class="report-table__header-row">
                <q-th
                  v-for="col in props.cols"
                  :key="col.name"
                  :props="props"
                  class="report-table__th text-left"
                >
                  {{ col.label }}
                </q-th>
              </q-tr>
            </template>
            <template #body-cell-pct_total="props">
              <q-td :props="props"> {{ formatNumber(props.value) }}% </q-td>
            </template>
            <template #body-cell-gross_sales="props">
              <q-td :props="props" class="text-weight-bold">
                {{ formatCurrency(props.value) }}
              </q-td>
            </template>
          </q-table>
        </q-card>
      </div>
      <div v-else class="full-width row flex-center text-grey-5 q-pa-xl">
        No sales statement data generated for selected period.
      </div>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV } from 'src/services/exportService'

const authStore = useAuthStore()
const loading = ref(false)
const summary = ref(null)
const kpiData = ref([])

const analysisColumns = [
  { name: 'order_type', label: 'Order Type', field: 'order_type', align: 'left' },
  { name: 'gross_sales', label: 'Gross Sales', field: 'gross_sales', align: 'left' },
  { name: 'pct_total', label: '% of Total', field: 'pct_total', align: 'left' },
  { name: 'guests', label: 'Guests', field: 'guests', align: 'left', format: () => 0 }, // Extendable
  {
    name: 'pct_guests',
    label: '% of Guests',
    field: 'pct_guests',
    align: 'left',
    format: () => '0.00%',
  },
  { name: 'checks', label: 'Checks', field: 'checks', align: 'left' },
  { name: 'tables', label: 'Tables', field: 'tables', align: 'left', format: () => 0 },
]

const totalDebit = computed(() => {
  if (!summary.value) return 0
  return (
    summary.value.discount +
    summary.value.void_refund +
    summary.value.complimentary +
    summary.value.staff_meal
  )
})

const totalCredit = computed(() => {
  if (!summary.value) return 0
  return summary.value.cash + summary.value.credit_cards + summary.value.credit_customer
})

const netDiff = computed(() => {
  if (!summary.value) return 0
  return summary.value.gross_sales - totalDebit.value - totalCredit.value
})

async function loadData(filters = {}) {
  loading.value = true
  try {
    const companyId = authStore.currentBranch?.company_id || authStore.profile?.company_id
    const branchId = filters.branch || authStore.currentBranch?.id

    let start = filters.dateFrom || new Date().toISOString().split('T')[0]
    let end = filters.dateTo || new Date().toISOString().split('T')[0]

    const { data, error } = await supabase.rpc('fn_rpt_sales_statement', {
      p_company_id: companyId,
      p_branch_id: branchId,
      p_start_date: start,
      p_end_date: end,
    })

    if (error) throw error
    summary.value = data

    kpiData.value = [
      {
        label: 'Gross Sales',
        value: formatCurrency(summary.value?.gross_sales || 0),
        color: 'green',
      },
      { label: 'Total Deductions', value: formatCurrency(totalDebit.value), color: 'red' },
      { label: 'Total Collected', value: formatCurrency(totalCredit.value), color: 'blue' },
    ]
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  if (!summary.value || !summary.value.order_types) return
  exportTableToCSV(analysisColumns, summary.value.order_types, 'sales_statement_analysis')
}
function exportExcel() {
  exportCSV()
}

function formatCurrency(val) {
  return Number(val || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function formatNumber(val) {
  return Number(val || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.report-statement-list {
  background: transparent;
}
.report-statement-list .q-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
</style>
