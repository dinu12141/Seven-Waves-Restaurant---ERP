<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Run Payroll"
      breadcrumbs="Finance / Payroll / Run Payroll"
      showRefresh
      @refresh="loadEmployees"
    />

    <!-- Step 1: Configure Period -->
    <div class="fin-panel q-mb-md">
      <div class="fin-panel__header">
        <span class="fin-panel__title">1. Configure Payroll Period</span>
      </div>
      <div class="fin-panel__body q-pa-md">
        <div class="row q-col-gutter-md fin-form">
          <div class="col-12 col-sm-4">
            <q-input
              v-model="cycleName"
              label="Cycle Name *"
              dense
              dark
              outlined
              placeholder="e.g. March 2026"
            />
          </div>
          <div class="col-12 col-sm-4">
            <q-input v-model="periodStart" label="Period Start *" type="date" dense dark outlined />
          </div>
          <div class="col-12 col-sm-4">
            <q-input v-model="periodEnd" label="Period End *" type="date" dense dark outlined />
          </div>
        </div>
      </div>
    </div>

    <!-- Step 2: Preview Calculations -->
    <div class="fin-panel q-mb-md">
      <div class="fin-panel__header">
        <span class="fin-panel__title"
          >2. Employee Payroll Preview ({{ employees.length }} employees)</span
        >
        <q-btn
          flat
          dense
          size="sm"
          label="Calculate All"
          icon="calculate"
          color="blue-5"
          @click="calculatePayroll"
          :loading="calculating"
        />
      </div>
      <q-table
        :rows="payrollPreview"
        :columns="previewCols"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[0]"
        hide-bottom
        class="fin-table"
        :loading="loading"
        no-data-label="Load employees first"
      >
        <template #body-cell-net="props">
          <q-td :props="props"
            ><span class="text-green-4 text-weight-bold">{{
              fmt(props.row.net_salary)
            }}</span></q-td
          >
        </template>
        <template #body-cell-details="props">
          <q-td :props="props">
            <q-btn flat dense icon="info" size="sm" color="grey-5" @click="viewBreakdown(props.row)"
              ><q-tooltip>View Breakdown</q-tooltip></q-btn
            >
          </q-td>
        </template>
      </q-table>
      <div class="fin-summary-row">
        <div>
          <span class="fin-summary-row__label">Total Gross: </span
          ><span class="fin-summary-row__value">{{ fmt(totalGross) }}</span>
        </div>
        <div>
          <span class="fin-summary-row__label">Total Deductions: </span
          ><span class="fin-summary-row__value text-red-4">{{ fmt(totalDeductions) }}</span>
        </div>
        <div>
          <span class="fin-summary-row__label">Total Net: </span
          ><span class="fin-summary-row__value text-green-4">{{ fmt(totalNet) }}</span>
        </div>
      </div>
    </div>

    <!-- Step 3: Confirm & Post -->
    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">3. Confirm & Post Payroll</span>
      </div>
      <div class="fin-panel__body q-pa-md">
        <div class="row q-col-gutter-md items-center justify-center">
          <div class="col-auto">
            <q-btn
              unelevated
              label="Confirm & Create Payroll"
              icon="check_circle"
              color="green-8"
              size="md"
              :disable="payrollPreview.length === 0 || !cycleName"
              @click="confirmPayroll"
              :loading="posting"
            />
          </div>
          <div class="col-auto" v-if="createdCycleId">
            <q-btn
              unelevated
              label="Post to Finance Journal"
              icon="book"
              color="blue-8"
              size="md"
              @click="postToJournal"
              :loading="postingJournal"
              :disable="journalPosted"
            />
          </div>
        </div>
        <div v-if="createdCycleId" class="text-center q-mt-md">
          <span class="fin-badge fin-badge--success">Payroll cycle created</span>
          <span v-if="journalPosted" class="fin-badge fin-badge--info q-ml-sm"
            >Posted to Journal</span
          >
        </div>
      </div>
    </div>

    <!-- Breakdown Dialog -->
    <q-dialog v-model="showBreakdown" class="fin-dialog">
      <q-card dark style="min-width: 500px; background: #161b22; border: 1px solid #30363d">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold text-white">
            {{ selectedEmployee?.employee_name }} — Payroll Breakdown
          </div>
          <div class="text-caption text-grey-5">{{ selectedEmployee?.employee_code }}</div>
        </q-card-section>
        <q-card-section>
          <div class="text-caption text-grey-5 q-mb-xs">Earnings</div>
          <q-list dense dark>
            <q-item class="fin-activity-item"
              ><q-item-section>Basic Salary</q-item-section
              ><q-item-section side class="text-green-4"
                >+{{ fmt(selectedEmployee?.basic_salary) }}</q-item-section
              ></q-item
            >
            <q-item
              v-for="item in selectedEmployee?.allowance_details || []"
              :key="'a' + item.name"
              class="fin-activity-item"
            >
              <q-item-section>{{ item.name }}</q-item-section
              ><q-item-section side class="text-green-4">+{{ fmt(item.amount) }}</q-item-section>
            </q-item>
            <q-item
              v-for="item in selectedEmployee?.addition_details || []"
              :key="'ad' + item.description"
              class="fin-activity-item"
            >
              <q-item-section
                >{{ item.description }}
                <span class="text-caption text-grey-5"
                  >({{ item.addition_type }})</span
                ></q-item-section
              >
              <q-item-section side class="text-green-4">+{{ fmt(item.amount) }}</q-item-section>
            </q-item>
          </q-list>
          <q-separator dark class="q-my-sm" />
          <div class="text-caption text-grey-5 q-mb-xs">Deductions</div>
          <q-list dense dark>
            <q-item
              v-for="item in selectedEmployee?.deduction_details || []"
              :key="'d' + item.description"
              class="fin-activity-item"
            >
              <q-item-section
                >{{ item.description }}
                <span class="text-caption text-grey-5"
                  >({{ item.deduction_type }})</span
                ></q-item-section
              >
              <q-item-section side class="text-red-4">-{{ fmt(item.amount) }}</q-item-section>
            </q-item>
            <q-item v-if="!selectedEmployee?.deduction_details?.length" class="fin-activity-item"
              ><q-item-section class="text-grey-5">No deductions</q-item-section></q-item
            >
          </q-list>
          <q-separator dark class="q-my-sm" />
          <div class="row q-mt-sm">
            <div class="col-6">
              <span class="text-grey-5">Gross:</span>
              <span class="text-white text-weight-bold">{{
                fmt(selectedEmployee?.gross_salary)
              }}</span>
            </div>
            <div class="col-6 text-right">
              <span class="text-grey-5">Net:</span>
              <span class="text-green-4 text-h6">{{ fmt(selectedEmployee?.net_salary) }}</span>
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right"
          ><q-btn flat label="Close" color="grey-5" v-close-popup
        /></q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Notify } from 'quasar'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { supabase } from 'src/boot/supabase'
import {
  fetchEmployeeSalaryStructures,
  createPayrollCycle,
  createPayrollRecords,
  createPayrollLineItems,
  fetchEmployeeDeductions,
  fetchEmployeeAdditions,
  postPayrollToJournal,
} from 'src/services/financeService'

let realtimeChannel = null
const loading = ref(false)
const calculating = ref(false)
const posting = ref(false)
const postingJournal = ref(false)
const employees = ref([])
const payrollPreview = ref([])
const createdCycleId = ref(null)
const journalPosted = ref(false)
const showBreakdown = ref(false)
const selectedEmployee = ref(null)

const now = new Date()
const cycleName = ref(`${now.toLocaleString('en', { month: 'long' })} ${now.getFullYear()}`)
const periodStart = ref(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
const periodEnd = ref(
  new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
)

const totalGross = computed(() => payrollPreview.value.reduce((s, r) => s + r.gross_salary, 0))
const totalDeductions = computed(() =>
  payrollPreview.value.reduce((s, r) => s + r.total_deductions, 0),
)
const totalNet = computed(() => payrollPreview.value.reduce((s, r) => s + r.net_salary, 0))

const previewCols = [
  { name: 'code', label: 'Code', field: 'employee_code', align: 'left', style: 'width: 80px' },
  { name: 'name', label: 'Employee', field: 'employee_name', align: 'left' },
  { name: 'basic', label: 'Basic', field: 'basic_salary', align: 'right', format: (v) => fmt(v) },
  {
    name: 'allowances',
    label: 'Allowances',
    field: 'total_allowances',
    align: 'right',
    format: (v) => fmt(v),
  },
  {
    name: 'additions',
    label: 'Additions',
    field: 'total_additions',
    align: 'right',
    format: (v) => fmt(v),
  },
  { name: 'gross', label: 'Gross', field: 'gross_salary', align: 'right', format: (v) => fmt(v) },
  {
    name: 'deductions',
    label: 'Deductions',
    field: 'total_deductions',
    align: 'right',
    format: (v) => fmt(v),
    style: 'color: #f87171',
  },
  { name: 'net', label: 'Net Salary', field: 'net_salary', align: 'right' },
  { name: 'details', label: '', align: 'center', style: 'width: 40px' },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
}
function viewBreakdown(row) {
  selectedEmployee.value = row
  showBreakdown.value = true
}

async function loadEmployees() {
  loading.value = true
  const { data } = await fetchEmployeeSalaryStructures()
  employees.value = data || []
  loading.value = false
}

async function calculatePayroll() {
  calculating.value = true
  // Fetch deductions and additions for all employees
  const [dedRes, addRes] = await Promise.all([fetchEmployeeDeductions(), fetchEmployeeAdditions()])
  const allDeductions = dedRes.data || []
  const allAdditions = addRes.data || []

  payrollPreview.value = employees.value.map((emp) => {
    const salary = emp.salary_structures?.[0]
    const basic = Number(salary?.basic_salary || 0)
    const empAllowances = emp.employee_allowances || []
    const allowanceTotal = empAllowances.reduce((s, a) => s + Number(a.amount || 0), 0)
    const allowanceDetails = empAllowances.map((a) => ({
      name: a.salary_allowance_types?.name || 'Allowance',
      amount: Number(a.amount || 0),
    }))

    // Real deductions from salary_deductions table
    const empDeductions = allDeductions.filter(
      (d) =>
        d.employee_id === emp.id &&
        d.start_date <= periodEnd.value &&
        (!d.end_date || d.end_date >= periodStart.value),
    )
    const deductionTotal = empDeductions.reduce((s, d) => s + Number(d.amount || 0), 0)

    // Real additions from salary_additions table
    const empAdditions = allAdditions.filter(
      (a) =>
        a.employee_id === emp.id &&
        a.start_date <= periodEnd.value &&
        (!a.end_date || a.end_date >= periodStart.value),
    )
    const additionTotal = empAdditions.reduce((s, a) => s + Number(a.amount || 0), 0)

    const gross = basic + allowanceTotal + additionTotal
    const net = gross - deductionTotal

    return {
      id: emp.id,
      employee_code: emp.employee_code,
      employee_name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
      employee_id: emp.id,
      basic_salary: basic,
      total_allowances: allowanceTotal,
      total_additions: additionTotal,
      gross_salary: gross,
      total_deductions: deductionTotal,
      overtime_amount: 0,
      commission: 0,
      net_salary: net,
      allowance_details: allowanceDetails,
      deduction_details: empDeductions,
      addition_details: empAdditions,
    }
  })
  calculating.value = false
}

async function confirmPayroll() {
  if (!cycleName.value || !periodStart.value || !periodEnd.value) {
    Notify.create({ type: 'warning', message: 'Configure period first' })
    return
  }
  posting.value = true
  try {
    const { data: cycle, error: cycErr } = await createPayrollCycle({
      cycle_name: cycleName.value,
      period_start: periodStart.value,
      period_end: periodEnd.value,
      total_gross: totalGross.value,
      total_deductions: totalDeductions.value,
      total_net: totalNet.value,
      total_employees: payrollPreview.value.length,
      status: 'confirmed',
      processed_at: new Date().toISOString(),
    })
    if (cycErr) throw cycErr
    createdCycleId.value = cycle.id

    // Insert payroll records
    const records = payrollPreview.value.map((r) => ({
      cycle_id: cycle.id,
      employee_id: r.employee_id,
      basic_salary: r.basic_salary,
      total_allowances: r.total_allowances,
      total_deductions: r.total_deductions,
      overtime_amount: r.overtime_amount,
      commission: r.commission,
      gross_salary: r.gross_salary,
      net_salary: r.net_salary,
    }))
    const { data: createdRecords, error: recErr } = await createPayrollRecords(records)
    if (recErr) throw recErr

    // Insert line items for each record (allowances + deductions)
    const lineItems = []
    for (let i = 0; i < payrollPreview.value.length; i++) {
      const preview = payrollPreview.value[i]
      const record = createdRecords[i]
      if (!record) continue

      // Allowance line items
      for (const a of preview.allowance_details || []) {
        lineItems.push({
          record_id: record.id,
          line_type: 'allowance',
          description: a.name,
          amount: a.amount,
        })
      }
      // Addition line items
      for (const a of preview.addition_details || []) {
        lineItems.push({
          record_id: record.id,
          line_type: 'allowance',
          description: `Addition: ${a.description}`,
          amount: Number(a.amount || 0),
        })
      }
      // Deduction line items
      for (const d of preview.deduction_details || []) {
        lineItems.push({
          record_id: record.id,
          line_type: 'deduction',
          description: d.description,
          amount: Number(d.amount || 0),
        })
      }
    }
    if (lineItems.length > 0) await createPayrollLineItems(lineItems)

    Notify.create({
      type: 'positive',
      message: `Payroll cycle created with ${records.length} employees`,
    })
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || 'Failed to create payroll' })
  } finally {
    posting.value = false
  }
}

async function postToJournal() {
  if (!createdCycleId.value) return
  postingJournal.value = true
  try {
    const { error } = await postPayrollToJournal(createdCycleId.value, {
      cycle_name: cycleName.value,
      period_end: periodEnd.value,
      total_gross: totalGross.value,
      total_deductions: totalDeductions.value,
      total_net: totalNet.value,
    })
    if (error) throw error
    journalPosted.value = true
    Notify.create({
      type: 'positive',
      message: 'Payroll posted to Finance Journal (Dr: Salary Expense, Cr: Bank/Payable)',
    })
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || 'Failed to post journal' })
  } finally {
    postingJournal.value = false
  }
}

// Realtime: auto-refresh employee list when HR changes salary data
function setupRealtime() {
  realtimeChannel = supabase
    .channel('payroll-run-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () =>
      loadEmployees(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'salary_structures' }, () =>
      loadEmployees(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_allowances' }, () =>
      loadEmployees(),
    )
    .subscribe()
}

onMounted(() => {
  loadEmployees()
  setupRealtime()
})
onUnmounted(() => {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel)
})
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
