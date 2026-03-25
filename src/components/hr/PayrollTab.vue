<template>
  <div class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h6">{{ isHR ? 'Payroll Runs' : 'My Payslips' }}</div>
      <q-space />
      <q-select
        v-if="isHR"
        dark
        dense
        outlined
        v-model="statusFilter"
        :options="['All', 'Draft', 'Processing', 'Processed', 'Approved', 'Paid', 'Cancelled']"
        label="Status"
        style="width: 160px"
      />
    </div>

    <!-- HR View: Payroll Runs Table -->
    <template v-if="isHR">
      <q-table
        dark
        flat
        bordered
        :rows="payrollRuns"
        :columns="runColumns"
        row-key="id"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        class="bg-grey-9 q-mb-lg"
      >
        <template v-slot:body-cell-status="props">
          <q-td :props="props">
            <q-badge
              :color="payrollStatusColor(props.row.status)"
              :label="props.row.status"
              class="text-capitalize"
            />
          </q-td>
        </template>
        <template v-slot:body-cell-total_net="props">
          <q-td :props="props">
            <span class="text-weight-bold text-green">{{
              formatCurrency(props.row.total_net)
            }}</span>
          </q-td>
        </template>
        <template v-slot:body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              round
              icon="visibility"
              color="primary"
              size="sm"
              @click="viewPayslips(props.row)"
            >
              <q-tooltip>View Payslips</q-tooltip>
            </q-btn>
            <q-btn
              v-if="props.row.status === 'processed'"
              flat
              dense
              round
              icon="check_circle"
              color="positive"
              size="sm"
              class="q-ml-sm"
              @click="approveRun(props.row)"
            >
              <q-tooltip>Approve & Lock</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>

      <!-- Detailed View for Selected Run -->
      <div v-if="selectedRun" class="q-mt-lg">
        <div class="row items-center q-mb-md">
          <div class="text-h6">Payslip Details</div>
          <q-space />
          <q-btn flat dense icon="close" @click="selectedRun = null" />
        </div>

        <PayrollSummary :run="selectedRun" />

        <q-table
          dark
          flat
          bordered
          :rows="payslips"
          :columns="payslipColumns"
          row-key="id"
          :loading="loadingSlips"
          :pagination="{ rowsPerPage: 15 }"
          class="bg-grey-9"
        >
          <template v-slot:body-cell-employee="props">
            <q-td :props="props">
              <div class="text-weight-bold">{{ props.row.employees?.full_name || '—' }}</div>
              <div v-if="props.row.late_minutes > 0" class="text-caption text-orange">
                <q-icon name="schedule" size="12px" /> {{ props.row.late_minutes }} min late
              </div>
              <div v-if="props.row.days_absent > 0" class="text-caption text-red">
                <q-icon name="event_busy" size="12px" /> {{ props.row.days_absent }} absent
              </div>
              <div v-if="props.row.paid_leave_days > 0" class="text-caption text-blue">
                <q-icon name="beach_access" size="12px" /> {{ props.row.paid_leave_days }}d paid
                leave
              </div>
            </q-td>
          </template>
          <template v-slot:body-cell-net_pay="props">
            <q-td :props="props">
              <span class="text-weight-bold text-green">{{
                formatCurrency(props.row.net_salary)
              }}</span>
            </q-td>
          </template>
        </q-table>
      </div>
    </template>

    <!-- Employee View: My Payslips -->
    <template v-else>
      <q-table
        dark
        flat
        bordered
        :rows="myPayslips"
        :columns="myPayslipsColumns"
        row-key="id"
        :loading="loading"
        class="bg-grey-9"
      >
        <template v-slot:body-cell-net_pay="props">
          <q-td :props="props">
            <span class="text-weight-bold text-green">{{
              formatCurrency(props.row.net_salary)
            }}</span>
          </q-td>
        </template>
      </q-table>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import PayrollSummary from 'components/hr/PayrollSummary.vue'

const authStore = useAuthStore()
const $q = useQuasar()
const loading = ref(false)
const loadingSlips = ref(false)
const payrollRuns = ref([])
const payslips = ref([])
const myPayslips = ref([])
const selectedRun = ref(null)
const statusFilter = ref('All')

const isHR = computed(() => authStore.hasAnyRole(['admin', 'hr']))

const runColumns = [
  {
    name: 'period_start',
    label: 'Period Start',
    align: 'left',
    field: 'period_start',
    sortable: true,
  },
  { name: 'period_end', label: 'Period End', align: 'left', field: 'period_end' },
  { name: 'status', label: 'Status', align: 'center', field: 'status', sortable: true },
  { name: 'total_employees', label: 'Employees', align: 'center', field: 'employee_count' },
  { name: 'total_net', label: 'Net Pay', align: 'right', field: 'total_net' },
  { name: 'actions', label: '', align: 'center', field: 'actions' },
]

const payslipColumns = [
  { name: 'employee', label: 'Employee', align: 'left', field: (row) => row.employees?.full_name },
  {
    name: 'basic_salary',
    label: 'Basic',
    align: 'right',
    field: 'basic_salary',
    format: (v) => `${formatCurrency(v)}`,
  },
  {
    name: 'total_allowances',
    label: 'Allowances',
    align: 'right',
    field: 'total_allowances',
    format: (v) => `${formatCurrency(v)}`,
  },
  {
    name: 'late_deduction',
    label: 'Late Deduct',
    align: 'right',
    field: 'late_deduction',
    format: (v) => (v > 0 ? `(${formatCurrency(v)})` : '—'),
  },
  {
    name: 'short_leave_deduction',
    label: 'Short Leave',
    align: 'right',
    field: 'short_leave_deduction',
    format: (v) => (v > 0 ? `(${formatCurrency(v)})` : '—'),
  },
  {
    name: 'paid_leave_days',
    label: 'Paid Leave',
    align: 'center',
    field: 'paid_leave_days',
    format: (v) => (v > 0 ? `${v}d` : '—'),
  },
  {
    name: 'total_deductions',
    label: 'Deductions',
    align: 'right',
    field: 'total_deductions',
    format: (v) => `${formatCurrency(v)}`,
  },
  {
    name: 'epf_employee',
    label: 'EPF (Emp)',
    align: 'right',
    field: 'epf_employee',
    format: (v) => `${formatCurrency(v)}`,
  },
  { name: 'net_pay', label: 'Net Pay', align: 'right', field: 'net_salary' },
]

const myPayslipsColumns = [
  {
    name: 'period',
    label: 'Period',
    align: 'left',
    field: (row) =>
      row.payroll_runs
        ? `${row.payroll_runs.period_start} → ${row.payroll_runs.period_end}`
        : 'Unknown',
  },
  {
    name: 'basic_salary',
    label: 'Basic',
    align: 'right',
    field: 'basic_salary',
    format: (v) => `${formatCurrency(v)}`,
  },
  {
    name: 'total_allowances',
    label: 'Allowances',
    align: 'right',
    field: 'total_allowances',
    format: (v) => `${formatCurrency(v)}`,
  },
  {
    name: 'total_deductions',
    label: 'Deductions',
    align: 'right',
    field: 'total_deductions',
    format: (v) => `${formatCurrency(v)}`,
  },
  { name: 'net_pay', label: 'Net Pay', align: 'right', field: 'net_salary' },
  { name: 'status', label: 'Status', align: 'center', field: 'payment_status' },
]

function payrollStatusColor(status) {
  const map = {
    draft: 'grey',
    processing: 'blue',
    processed: 'indigo',
    approved: 'teal',
    paid: 'green',
    cancelled: 'red',
  }
  return map[status] || 'grey'
}

function formatCurrency(val) {
  return (
    'LKR ' +
    Number(val || 0).toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

async function loadRuns() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    if (isHR.value) {
      let query = supabase
        .from('payroll_runs')
        .select('*')
        .eq('branch_id', branchId)
        .order('period_start', { ascending: false })

      if (statusFilter.value !== 'All') {
        query = query.eq('status', statusFilter.value.toLowerCase())
      }

      const { data, error } = await query
      if (error) throw error
      payrollRuns.value = data || []
    } else {
      // Load My Payslips
      const { data: myEmp } = await supabase
        .from('employees')
        .select('id')
        .eq('profile_id', authStore.user?.id)
        .maybeSingle()

      if (myEmp) {
        const { data, error } = await supabase
          .from('payslips')
          .select('*, payroll_runs(period_start, period_end)')
          .eq('employee_id', myEmp.id)
          .order('id', { ascending: false }) // or created_at

        if (error) throw error
        myPayslips.value = data || []
      }
    }
  } catch (err) {
    console.error('Failed to load payroll data:', err)
  } finally {
    loading.value = false
  }
}

async function viewPayslips(run) {
  selectedRun.value = run
  loadingSlips.value = true
  try {
    const { data, error } = await supabase
      .from('payslips')
      .select('*, employees(full_name)')
      .eq('payroll_run_id', run.id)
      .order('created_at')

    if (error) throw error
    payslips.value = data || []
    // Scroll to details view
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }, 100)
  } catch (err) {
    console.error('Failed to load payslips:', err)
  } finally {
    loadingSlips.value = false
  }
}

async function approveRun(run) {
  if (
    !confirm(
      'Are you sure you want to approve and lock this payroll run? This action cannot be undone and will process loan deductions.',
    )
  )
    return

  $q.loading.show({ message: 'Approving Payroll...' })
  try {
    const { error } = await supabase.rpc('approve_payroll_run', {
      p_run_id: run.id,
      p_approved_by: authStore.user?.id,
    })

    if (error) throw error

    $q.notify({ type: 'positive', message: 'Payroll approved successfully' })
    loadRuns()
    if (selectedRun.value?.id === run.id) {
      selectedRun.value = null
    }
  } catch (err) {
    console.error('Failed to approve payroll:', err)
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    $q.loading.hide()
  }
}

watch(statusFilter, () => loadRuns())
onMounted(() => loadRuns())
</script>
