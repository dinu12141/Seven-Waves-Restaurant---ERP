<template>
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn
        color="primary"
        icon="play_arrow"
        label="Run Payroll"
        @click="showRunDialog = true"
        no-caps
      />
      <q-space />
      <q-select
        dark
        dense
        outlined
        v-model="statusFilter"
        :options="['All', 'Draft', 'Processing', 'Processed', 'Approved', 'Paid']"
        label="Status"
        style="width: 160px"
      />
    </div>

    <q-table
      dark
      flat
      bordered
      :rows="runs"
      :columns="runColumns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 10 }"
      class="erp-data-grid"
    >
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="runStatusColor(props.row.status)"
            :label="props.row.status"
            class="text-capitalize"
          />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn
            flat
            dense
            icon="visibility"
            color="primary"
            size="sm"
            @click="viewRun(props.row)"
            label="View"
            no-caps
          />
          <q-btn
            v-if="props.row.status === 'processed'"
            flat
            dense
            icon="check"
            color="green"
            size="sm"
            @click="finalApprove(props.row)"
            label="Approve"
            no-caps
          />
        </q-td>
      </template>
    </q-table>

    <!-- Run Payroll Dialog -->
    <q-dialog v-model="showRunDialog" persistent>
      <q-card style="min-width: 450px; background: var(--erp-bg-form-card, #111827); color: #fff">
        <q-card-section><div class="text-h6">Run Monthly Payroll</div></q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input
            dark
            outlined
            v-model="payrollMonth"
            label="Payroll Month"
            type="month"
            hint="e.g. 2026-03"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey" no-caps />
          <q-btn
            color="primary"
            label="Process"
            icon="play_arrow"
            @click="runPayroll"
            :loading="processing"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Payslips Dialog -->
    <q-dialog v-model="showPayslips" maximized>
      <q-card style="background: var(--erp-bg-page, #0b0f19); color: #fff">
        <q-bar class="bg-grey-10">
          <q-icon name="payments" />
          <div class="q-ml-sm text-weight-bold">
            Payroll: {{ selectedRun?.period_start }} — {{ selectedRun?.period_end }}
          </div>
          <q-space /><q-btn dense flat icon="close" @click="showPayslips = false" />
        </q-bar>
        <q-card-section>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-3">
              <q-card flat class="erp-stat-card q-pa-md">
                <div class="text-caption text-grey-5">Total Gross</div>
                <div class="text-h5 text-weight-bold text-green">
                  LKR {{ fmt(selectedRun?.total_gross) }}
                </div>
              </q-card>
            </div>
            <div class="col-3">
              <q-card flat class="erp-stat-card q-pa-md">
                <div class="text-caption text-grey-5">Total Deductions</div>
                <div class="text-h5 text-weight-bold text-red">
                  LKR {{ fmt(selectedRun?.total_deductions) }}
                </div>
              </q-card>
            </div>
            <div class="col-3">
              <q-card flat class="erp-stat-card q-pa-md">
                <div class="text-caption text-grey-5">Total Net</div>
                <div class="text-h5 text-weight-bold text-blue">
                  LKR {{ fmt(selectedRun?.total_net) }}
                </div>
              </q-card>
            </div>
            <div class="col-3">
              <q-card flat class="erp-stat-card q-pa-md">
                <div class="text-caption text-grey-5">Employees</div>
                <div class="text-h5 text-weight-bold">{{ selectedRun?.employee_count }}</div>
              </q-card>
            </div>
          </div>
          <q-table
            dark
            flat
            bordered
            :rows="payslips"
            :columns="payslipColumns"
            row-key="id"
            :pagination="{ rowsPerPage: 50 }"
            class="erp-data-grid"
          >
            <template #body-cell-employee="props">
              <q-td :props="props">
                <div class="text-weight-bold">{{ props.row.employees?.full_name }}</div>
                <div class="text-caption text-grey-5">{{ props.row.employees?.employee_code }}</div>
              </q-td>
            </template>
            <template #body-cell-status="props">
              <q-td :props="props">
                <q-badge
                  :color="
                    props.row.is_held
                      ? 'red'
                      : props.row.payment_status === 'paid'
                        ? 'green'
                        : 'amber'
                  "
                  :label="props.row.is_held ? 'HELD' : props.row.payment_status"
                  class="text-capitalize"
                />
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
const processing = ref(false)
const runs = ref([])
const payslips = ref([])
const statusFilter = ref('All')
const showRunDialog = ref(false)
const showPayslips = ref(false)
const selectedRun = ref(null)
const payrollMonth = ref('')

const fmt = (v) => Number(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })

const runColumns = [
  {
    name: 'period',
    label: 'Period',
    align: 'left',
    field: (r) => `${r.period_start} — ${r.period_end}`,
  },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'employees', label: 'Employees', align: 'center', field: 'employee_count' },
  {
    name: 'gross',
    label: 'Gross (LKR)',
    align: 'right',
    field: 'total_gross',
    format: (v) => fmt(v),
  },
  { name: 'net', label: 'Net (LKR)', align: 'right', field: 'total_net', format: (v) => fmt(v) },
  { name: 'actions', label: '', align: 'center' },
]

const payslipColumns = [
  { name: 'employee', label: 'Employee', align: 'left', field: (r) => r.employees?.full_name },
  { name: 'basic', label: 'Basic', align: 'right', field: 'basic_salary', format: (v) => fmt(v) },
  {
    name: 'allowances',
    label: 'Allowances',
    align: 'right',
    field: 'total_allowances',
    format: (v) => fmt(v),
  },
  { name: 'ot', label: 'OT', align: 'right', field: 'overtime_amount', format: (v) => fmt(v) },
  {
    name: 'commission',
    label: 'Commission',
    align: 'right',
    field: 'commission_amount',
    format: (v) => fmt(v),
  },
  { name: 'gross', label: 'Gross', align: 'right', field: 'gross_salary', format: (v) => fmt(v) },
  {
    name: 'deductions',
    label: 'Deductions',
    align: 'right',
    field: 'total_deductions',
    format: (v) => fmt(v),
  },
  { name: 'net', label: 'Net Salary', align: 'right', field: 'net_salary', format: (v) => fmt(v) },
  { name: 'status', label: 'Status', align: 'center', field: 'payment_status' },
]

function runStatusColor(s) {
  return (
    {
      draft: 'grey',
      processing: 'amber',
      processed: 'blue',
      approved: 'teal',
      paid: 'green',
      cancelled: 'red',
    }[s] || 'grey'
  )
}

async function loadRuns() {
  loading.value = true
  const branchId = authStore.currentBranch?.id
  let q = supabase
    .from('payroll_runs')
    .select('*')
    .eq('branch_id', branchId)
    .order('period_start', { ascending: false })
  if (statusFilter.value !== 'All') q = q.eq('status', statusFilter.value.toLowerCase())
  const { data } = await q
  runs.value = data || []
  loading.value = false
}

async function runPayroll() {
  if (!payrollMonth.value) {
    $q.notify({ type: 'warning', message: 'Select a month' })
    return
  }
  processing.value = true
  try {
    const { data, error } = await supabase.rpc('process_monthly_payroll', {
      p_branch_id: authStore.currentBranch?.id,
      p_period_month: payrollMonth.value + '-01',
    })
    if (error) throw error
    if (data?.success === false) throw new Error(data.error)
    $q.notify({ type: 'positive', message: `Payroll processed: ${data.employee_count} employees` })
    showRunDialog.value = false
    loadRuns()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    processing.value = false
  }
}

async function viewRun(run) {
  selectedRun.value = run
  const { data } = await supabase
    .from('payslips')
    .select('*, employees(full_name, employee_code)')
    .eq('payroll_run_id', run.id)
    .order('net_salary', { ascending: false })
  payslips.value = data || []
  showPayslips.value = true
}

async function finalApprove(run) {
  $q.dialog({
    title: 'Final Approval',
    message: 'Approve and mark all payslips as PAID?',
    cancel: true,
    persistent: true,
    dark: true,
  }).onOk(async () => {
    try {
      const { data, error } = await supabase.rpc('approve_salary_final', {
        p_payroll_run_id: run.id,
      })
      if (error) throw error
      if (data?.success === false) throw new Error(data.error)
      $q.notify({ type: 'positive', message: 'Payroll approved and paid' })
      loadRuns()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

watch(statusFilter, () => loadRuns())
onMounted(() => loadRuns())
</script>

<style scoped>
.erp-data-grid {
  background: var(--erp-bg-form-card, #111827);
  border-radius: 12px;
}
.erp-stat-card {
  background: var(--erp-bg-form-card, #111827);
  border: 1px solid var(--erp-input-border, #374151);
  border-radius: 12px;
}
</style>
