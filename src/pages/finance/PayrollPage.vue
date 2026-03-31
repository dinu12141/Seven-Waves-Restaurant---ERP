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
        <div class="fin-kpi-card fin-kpi-card--blue">
          <div class="fin-kpi-card__icon">
            <q-icon name="groups" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Total Employees</div>
            <div class="fin-kpi-card__value">{{ employeeData.length }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <div class="fin-kpi-card fin-kpi-card--green">
          <div class="fin-kpi-card__icon">
            <q-icon name="payments" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Latest Payroll</div>
            <div class="fin-kpi-card__value">{{ fmt(latestCycle?.total_net || 0) }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <div class="fin-kpi-card fin-kpi-card--amber">
          <div class="fin-kpi-card__icon">
            <q-icon name="event" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Total Cycles</div>
            <div class="fin-kpi-card__value">{{ cycles.length }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <div class="fin-kpi-card fin-kpi-card--purple">
          <div class="fin-kpi-card__icon">
            <q-icon name="account_balance" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">YTD Payroll</div>
            <div class="fin-kpi-card__value">{{ fmt(ytdTotal) }}</div>
          </div>
        </div>
      </div>
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
              icon="people"
              size="sm"
              color="blue-4"
              @click="openPayslipsDialog(props.row)"
              ><q-tooltip>View Employee Payslips</q-tooltip></q-btn
            >
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- ── Employee Payslips Dialog ── -->
    <q-dialog v-model="showPayslipsDialog" maximized>
      <q-card class="bg-grey-10 text-white">
        <q-card-section class="row items-center q-pb-none">
          <div>
            <div class="text-h6 text-weight-bold">Employee Payslips</div>
            <div class="text-caption text-grey-4">
              {{ selectedCycle?.cycle_name }} &nbsp;|&nbsp; {{ selectedCycle?.period_start }} →
              {{ selectedCycle?.period_end }} &nbsp;|&nbsp;
              <span :class="cycleStatusClass(selectedCycle?.status)">{{
                selectedCycle?.status
              }}</span>
            </div>
          </div>
          <q-space />
          <q-btn flat round icon="close" v-close-popup />
        </q-card-section>

        <!-- Summary row -->
        <q-card-section class="row q-col-gutter-md q-py-sm">
          <div class="col-auto">
            <div class="text-caption text-grey-4">Employees</div>
            <div class="text-h6">{{ payslipRows.length }}</div>
          </div>
          <div class="col-auto">
            <div class="text-caption text-grey-4">Total Gross</div>
            <div class="text-h6 text-green-4">{{ fmt(selectedCycle?.total_gross) }}</div>
          </div>
          <div class="col-auto">
            <div class="text-caption text-grey-4">Total Deductions</div>
            <div class="text-h6 text-red-4">{{ fmt(selectedCycle?.total_deductions) }}</div>
          </div>
          <div class="col-auto">
            <div class="text-caption text-grey-4">Total Net</div>
            <div class="text-h6 text-white text-weight-bold">
              {{ fmt(selectedCycle?.total_net) }}
            </div>
          </div>
        </q-card-section>

        <q-separator dark />

        <q-card-section class="q-pa-none">
          <q-table
            :rows="payslipRows"
            :columns="payslipCols"
            row-key="id"
            flat
            dark
            dense
            :rows-per-page-options="[20, 50, 0]"
            :loading="payslipLoading"
            no-data-label="No payslips found for this cycle"
          >
            <template #body-cell-name="props">
              <q-td :props="props">
                <div class="text-weight-medium">
                  {{ props.row.employees?.first_name }} {{ props.row.employees?.last_name }}
                </div>
                <div class="text-caption text-grey-5">{{ props.row.employees?.employee_code }}</div>
              </q-td>
            </template>
            <template #body-cell-payment_status="props">
              <q-td :props="props">
                <span :class="payStatusClass(props.row.payment_status)">
                  {{ props.row.payment_status || 'pending' }}
                </span>
              </q-td>
            </template>
            <template #body-cell-gross="props">
              <q-td :props="props" class="text-right">
                {{ fmt(props.row.gross_salary) }}
              </q-td>
            </template>
            <template #body-cell-deductions="props">
              <q-td :props="props" class="text-right text-red-4">
                -{{ fmt(props.row.total_deductions) }}
              </q-td>
            </template>
            <template #body-cell-net="props">
              <q-td :props="props" class="text-right text-weight-bold text-green-4">
                {{ fmt(props.row.net_salary) }}
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>
    </q-dialog>
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

// Payslips dialog state
const showPayslipsDialog = ref(false)
const selectedCycle = ref(null)
const payslipRows = ref([])
const payslipLoading = ref(false)

const latestCycle = computed(() => cycles.value[0] || null)
const ytdTotal = computed(() => {
  const year = new Date().getFullYear().toString()
  return cycles.value
    .filter(
      (c) =>
        (c.period_start || '').startsWith(year) &&
        ['posted', 'confirmed', 'paid', 'approved'].includes(c.status),
    )
    .reduce((s, c) => s + Number(c.total_net || 0), 0)
})

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

const payslipCols = [
  { name: 'name', label: 'Employee', align: 'left', style: 'min-width: 180px' },
  { name: 'gross', label: 'Gross', align: 'right', style: 'width: 120px' },
  {
    name: 'epf',
    label: 'EPF (8%)',
    field: 'epf_employee',
    align: 'right',
    format: (v) => fmt(v),
    style: 'width: 110px',
  },
  { name: 'deductions', label: 'Deductions', align: 'right', style: 'width: 120px' },
  { name: 'net', label: 'Net Salary', align: 'right', style: 'width: 130px' },
  {
    name: 'payment_method',
    label: 'Method',
    field: 'payment_method',
    align: 'center',
    style: 'width: 90px',
  },
  { name: 'payment_status', label: 'Status', align: 'center', style: 'width: 90px' },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
}

function cycleStatusClass(s) {
  const m = {
    draft: 'fin-badge fin-badge--muted',
    processing: 'fin-badge fin-badge--warning',
    processed: 'fin-badge fin-badge--info',
    approved: 'fin-badge fin-badge--info',
    confirmed: 'fin-badge fin-badge--info',
    paid: 'fin-badge fin-badge--success',
    posted: 'fin-badge fin-badge--success',
    cancelled: 'fin-badge fin-badge--danger',
  }
  return m[s] || 'fin-badge fin-badge--muted'
}

function payStatusClass(s) {
  const m = {
    paid: 'fin-badge fin-badge--success',
    pending: 'fin-badge fin-badge--warning',
    unpaid: 'fin-badge fin-badge--danger',
    held: 'fin-badge fin-badge--danger',
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

async function openPayslipsDialog(cycle) {
  selectedCycle.value = cycle
  showPayslipsDialog.value = true
  payslipLoading.value = true
  payslipRows.value = []

  const { data } = await supabase
    .from('payslips')
    .select(
      `
      id, basic_salary, total_allowances, gross_salary,
      epf_employee, epf_employer, etf_employer,
      total_deductions, net_salary,
      payment_method, payment_status, paid_at,
      advance_deduction, loan_deduction, other_deductions,
      employees(first_name, last_name, employee_code, designations(title), departments(name))
    `,
    )
    .eq('payroll_run_id', cycle.id)
    .order('net_salary', { ascending: false })

  payslipRows.value = data || []
  payslipLoading.value = false
}

// Realtime: auto-refresh when HR changes employee/salary data
function setupRealtime() {
  realtimeChannel = supabase
    .channel('payroll-overview-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => loadData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_runs' }, () =>
      loadData(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payslips' }, () => loadData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'salary_structures' }, () =>
      loadData(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_allowances' }, () =>
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
