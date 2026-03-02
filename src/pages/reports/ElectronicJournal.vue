<template>
  <ReportLayout
    title="Electronic Journal Report"
    subtitle="Full audit trail of all bills including voids and cancellations"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #extra-filters>
      <div class="report-filter-group">
        <label class="report-filter-label">Order Type</label>
        <q-select
          v-model="extraFilters.orderType"
          :options="['All', 'Dine-In', 'Take Away', 'Online', 'PickMe', 'Uber']"
          dense
          outlined
          emit-value
          map-options
          class="report-filter-input"
        />
      </div>
    </template>

    <template #default>
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        rows-per-page-label="Rows/page"
        :pagination="{ rowsPerPage: 50 }"
      >
        <template #body-cell-void_marked="props">
          <q-td :props="props" class="text-red text-weight-bold">
            {{ props.value }}
          </q-td>
        </template>
        <template #body-cell-sales_price="props">
          <q-td :props="props">
            {{ formatCurrency(props.value) }}
          </q-td>
        </template>
        <template #body-cell-disc_amt="props">
          <q-td :props="props">
            {{ formatCurrency(props.value) }}
          </q-td>
        </template>
        <template #body-cell-tax_amt="props">
          <q-td :props="props">
            {{ formatCurrency(props.value) }}
          </q-td>
        </template>
      </q-table>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'

const authStore = useAuthStore()
const loading = ref(false)
const rows = ref([])

const extraFilters = ref({
  orderType: 'All',
})

const kpiData = ref([])

const columns = [
  { name: 'bill_no', label: 'Bill No', field: 'bill_no', align: 'left', sortable: true },
  { name: 'pos_terminal', label: 'POS', field: 'pos_terminal', align: 'left' },
  { name: 'clerk', label: 'Clerk', field: 'clerk', align: 'left' },
  { name: 'waiter', label: 'Waiter', field: 'waiter', align: 'left' },
  { name: 'kot_no', label: 'Kot No', field: 'kot_no', align: 'left' },
  { name: 'customer', label: 'Cust', field: 'customer', align: 'left' },
  { name: 'item_code', label: 'Item Code', field: 'item_code', align: 'left' },
  { name: 'department', label: 'Dept', field: 'department', align: 'left' },
  { name: 'prod_ref', label: 'Prod.ref', field: 'prod_ref', align: 'left' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'disc_amt', label: 'Disc Amt', field: 'disc_amt', align: 'right' },
  { name: 'tax_amt', label: 'Tax Amt', field: 'tax_amt', align: 'right' },
  { name: 'sales_price', label: 'Sales Price', field: 'sales_price', align: 'right' },
  { name: 'qty', label: 'Qty', field: 'qty', align: 'right' },
  { name: 'bill_time', label: 'Time', field: 'bill_time', align: 'center' },
  { name: 'order_type', label: 'Type', field: 'order_type', align: 'center' },
  { name: 'bill_ref', label: 'Bill Ref', field: 'bill_ref', align: 'left' },
  { name: 'void_marked', label: 'V', field: 'void_marked', align: 'center' },
]

async function loadData(filters = {}) {
  loading.value = true
  try {
    const companyId = authStore.currentBranch?.company_id || authStore.profile?.company_id
    let query = supabase.from('v_rpt_electronic_journal').select('*').eq('company_id', companyId)

    if (filters.dateFrom) query = query.gte('bill_date', filters.dateFrom)
    if (filters.dateTo) query = query.lte('bill_date', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    if (extraFilters.value.orderType !== 'All') {
      query = query.eq('order_type', extraFilters.value.orderType)
    }

    const { data, error } = await query
    if (error) throw error
    rows.value = data || []

    // Calculate KPIs
    const totalSales = rows.value.reduce((sum, r) => sum + r.qty * r.sales_price, 0)
    const totalDiscounts = rows.value.reduce((sum, r) => sum + r.disc_amt, 0)

    kpiData.value = [
      { label: 'Total Records', value: rows.value.length },
      { label: 'Gross Sales', value: formatCurrency(totalSales), color: 'green' },
      { label: 'Total Discounts', value: formatCurrency(totalDiscounts), color: 'orange' },
    ]
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  exportTableToCSV(columns, rows.value, 'electronic_journal')
}

function exportExcel() {
  exportTableToExcel(columns, rows.value, 'electronic_journal')
}

function formatCurrency(val) {
  return Number(val || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

onMounted(() => {
  loadData()
})
</script>
