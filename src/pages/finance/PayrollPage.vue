<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Payroll Overview"
      breadcrumbs="Finance / Payroll / Overview"
      showRefresh
      @refresh="loadData"
    />

    <!-- KPIs -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-6 col-md-3">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" style="background: rgba(59, 130, 246, 0.12)">
            <q-icon name="groups" size="20px" color="blue" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Active Employees</div>
            <div class="fin-kpi-card__value">{{ employeeData.length }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" style="background: rgba(16, 185, 129, 0.12)">
            <q-icon name="payments" size="20px" color="green" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Latest Payroll</div>
            <div class="fin-kpi-card__value">{{ fmt(latestCycle?.total_net || 0) }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" style="background: rgba(245, 158, 11, 0.12)">
            <q-icon name="event" size="20px" color="orange" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Total Cycles</div>
            <div class="fin-kpi-card__value">{{ cycles.length }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" style="background: rgba(139, 92, 246, 0.12)">
            <q-icon name="account_balance" size="20px" color="purple" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">YTD Payroll</div>
            <div class="fin-kpi-card__value">{{ fmt(ytdTotal) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-auto">
        <q-btn
          unelevated
          icon="play_circle"
          label="Run Payroll"
          color="green-8"
          @click="$router.push('/finance/payroll/run')"
        />
      </div>
      <div class="col-auto">
        <q-btn
          outline
          icon="account_tree"
          label="Salary Structures"
          color="blue-5"
          @click="$router.push('/finance/payroll/salary-structure')"
        />
      </div>
      <div class="col-auto">
        <q-btn
          outline
          icon="receipt_long"
          label="View Payslips"
          color="grey-5"
          @click="$router.push('/finance/payroll/payslips')"
        />
      </div>
    </div>

    <!-- Salary Structures -->
    <div class="fin-panel q-mb-md">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Employee Salary Structures</span>
      </div>
      <q-table
        :rows="employeeData"
        :columns="empCols"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[15, 30, 0]"
        class="fin-table"
        :loading="loading"
        no-data-label="No employees"
      >
        <template #body-cell-salary="props">
          <q-td :props="props">
            {{ fmt(props.row.salary_structures?.[0]?.basic_salary || 0) }}
          </q-td>
        </template>
        <template #body-cell-allowances="props">
          <q-td :props="props">
            <span class="text-green-4"
              >+{{
                fmt(
                  (props.row.employee_allowances || []).reduce(
                    (s, a) => s + Number(a.amount || 0),
                    0,
                  ),
                )
              }}</span
            >
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              icon="edit"
              size="sm"
              color="blue-4"
              @click="$router.push('/finance/payroll/salary-structure')"
              ><q-tooltip>Manage Salary</q-tooltip></q-btn
            >
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Payroll Cycles -->
    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Payroll Cycles ({{ cycles.length }})</span>
      </div>
      <q-table
        :rows="cycles"
        :columns="cycleCols"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[10, 20]"
        class="fin-table"
        :loading="loading"
        no-data-label="No payroll cycles"
      >
        <template #body-cell-status="props">
          <q-td :props="props">
            <span :class="cycleStatusClass(props.row.status)">{{ props.row.status }}</span>
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              icon="visibility"
              size="sm"
              color="grey-5"
              @click="$router.push('/finance/payroll/payslips?cycle=' + props.row.id)"
              ><q-tooltip>View Payslips</q-tooltip></q-btn
            >
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { supabase } from 'src/boot/supabase'
import { fetchPayrollCycles, fetchEmployeeSalaryStructures } from 'src/services/financeService'

const loading = ref(false)
const cycles = ref([])
const employeeData = ref([])
let realtimeChannel = null

const latestCycle = computed(() => cycles.value[0] || null)
const ytdTotal = computed(() => {
  const year = new Date().getFullYear()
  return cycles.value
    .filter(
      (c) =>
        c.period_start?.startsWith(year) && (c.status === 'posted' || c.status === 'confirmed'),
    )
    .reduce((s, c) => s + Number(c.total_net || 0), 0)
})

const empCols = [
  { name: 'code', label: 'Code', field: 'employee_code', align: 'left', style: 'width: 90px' },
  {
    name: 'name',
    label: 'Name',
    field: (row) => `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    align: 'left',
  },
  {
    name: 'designation',
    label: 'Designation',
    field: (row) => row.designations?.title || '-',
    align: 'left',
  },
  {
    name: 'department',
    label: 'Department',
    field: (row) => row.departments?.name || '-',
    align: 'left',
  },
  { name: 'salary', label: 'Basic Salary', align: 'right', style: 'width: 130px' },
  { name: 'allowances', label: 'Allowances', align: 'right', style: 'width: 120px' },
  { name: 'actions', label: '', align: 'center', style: 'width: 50px' },
]

const cycleCols = [
  { name: 'cycle_name', label: 'Cycle', field: 'cycle_name', align: 'left' },
  {
    name: 'period',
    label: 'Period',
    field: (row) => `${row.period_start} → ${row.period_end}`,
    align: 'left',
  },
  {
    name: 'employees',
    label: 'Employees',
    field: 'total_employees',
    align: 'center',
    style: 'width: 90px',
  },
  {
    name: 'total_gross',
    label: 'Total Gross',
    field: 'total_gross',
    align: 'right',
    format: (v) => fmt(v),
  },
  {
    name: 'total_deductions',
    label: 'Deductions',
    field: 'total_deductions',
    align: 'right',
    format: (v) => fmt(v),
  },
  {
    name: 'total_net',
    label: 'Total Net',
    field: 'total_net',
    align: 'right',
    format: (v) => fmt(v),
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center', style: 'width: 100px' },
  { name: 'actions', label: '', align: 'center', style: 'width: 50px' },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
}
function cycleStatusClass(s) {
  const m = {
    draft: 'fin-badge fin-badge--muted',
    processing: 'fin-badge fin-badge--warning',
    confirmed: 'fin-badge fin-badge--info',
    posted: 'fin-badge fin-badge--success',
    cancelled: 'fin-badge fin-badge--danger',
  }
  return m[s] || 'fin-badge fin-badge--muted'
}

async function loadData() {
  loading.value = true
  const [cycRes, empRes] = await Promise.all([
    fetchPayrollCycles(),
    fetchEmployeeSalaryStructures(),
  ])
  cycles.value = cycRes.data || []
  employeeData.value = empRes.data || []
  loading.value = false
}

// Realtime: auto-refresh when HR changes employee/salary data
function setupRealtime() {
  realtimeChannel = supabase
    .channel('payroll-overview-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => loadData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'salary_structures' }, () =>
      loadData(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_allowances' }, () =>
      loadData(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_cycles' }, () =>
      loadData(),
    )
    .subscribe()
}

onMounted(() => {
  loadData()
  setupRealtime()
})
onUnmounted(() => {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel)
})
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
