<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="account_tree"
      subtitle="Basic salary, allowances, deductions and additions per employee"
      title="Salary Structure"
      breadcrumbs="Finance / Payroll / Salary Structure"
      show-refresh
      @refresh="loadData"
    />

    <!-- Employee selector -->
    <div class="fin-filters q-mb-md">
      <q-select
        v-model="selectedEmployee"
        :options="employeeOptions"
        label="Select Employee"
        dense
        outlined
        style="min-width: 340px"
        use-input
        input-debounce="200"
        @filter="filterEmployees"
        emit-value
        map-options
        option-value="id"
        option-label="label"
        @update:model-value="loadEmployeeDetails"
        clearable
      >
        <template #no-option
          ><q-item
            ><q-item-section class="text-grey-5">No results</q-item-section></q-item
          ></template
        >
      </q-select>
    </div>

    <div v-if="selectedEmployee && employee" class="row q-col-gutter-md">
      <!-- Left: Employee Info + Salary -->
      <div class="col-12 col-md-4">
        <div class="fin-panel q-mb-md">
          <div class="fin-panel__header"><span class="fin-panel__title">Employee Info</span></div>
          <div class="fin-panel__body q-pa-md">
            <div class="text-h6 q-mb-xs">
              {{ employee.first_name }} {{ employee.last_name }}
            </div>
            <div class="text-caption text-grey-5">
              {{ employee.employee_code }} · {{ employee.designations?.title || '-' }}
            </div>
            <div class="text-caption text-grey-5">{{ employee.departments?.name || '-' }}</div>
            <q-separator class="q-my-md" />
            <div class="text-caption text-grey-5">Salary Method</div>
            <div class=" q-mb-sm">
              {{ salaryStructure?.salary_method || 'basic_salary' }}
            </div>
            <div class="text-caption text-grey-5">Basic Salary</div>
            <div class="text-h6 text-blue-4">{{ fmt(salaryStructure?.basic_salary || 0) }}</div>
          </div>
        </div>

        <!-- Projected Net -->
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Projected Monthly</span>
          </div>
          <div class="fin-panel__body q-pa-md">
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <div class="text-caption text-grey-5">Basic</div>
                <div class="">{{ fmt(salaryStructure?.basic_salary || 0) }}</div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-5">Allowances</div>
                <div class="text-green-4">+{{ fmt(totalAllowances) }}</div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-5">Additions</div>
                <div class="text-green-4">+{{ fmt(totalAdditions) }}</div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-5">Deductions (incl. EPF 8%)</div>
                <div class="text-red-4">-{{ fmt(totalDeductions) }}</div>
              </div>
            </div>
            <q-separator class="q-my-sm" />
            <div class="text-right">
              <div class="text-caption text-grey-5">Projected Gross</div>
              <div class=" text-weight-bold">{{ fmt(projectedGross) }}</div>
            </div>
            <div class="text-right q-mt-xs">
              <div class="text-caption text-grey-5">Projected Net</div>
              <div class="text-h5 text-green-4">{{ fmt(projectedNet) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Allowances, Additions, Deductions -->
      <div class="col-12 col-md-8">
        <!-- Allowances -->
        <div class="fin-panel q-mb-md">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Allowances ({{ allowances.length }})</span>
            <q-btn
              flat
              dense
              size="sm"
              icon="add"
              label="Add"
              color="blue-5"
              @click="showAllowanceDialog = true"
            />
          </div>
          <q-table
            :rows="allowances"
            :columns="allowanceCols"
            row-key="id"
            flat
            dense
            :rows-per-page-options="[0]"
            hide-bottom
            class="fin-table"
            no-data-label="No allowances configured"
          >
            <template #body-cell-type="props">
              <q-td :props="props"
                ><span class="fin-badge fin-badge--info">{{
                  props.row.salary_allowance_types?.name || props.row.allowance_type_id
                }}</span></q-td
              >
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props"
                ><q-btn
                  flat
                  dense
                  icon="delete"
                  size="sm"
                  color="red-4"
                  @click="removeAllowance(props.row.id)"
              /></q-td>
            </template>
          </q-table>
        </div>

        <!-- Salary Additions -->
        <div class="fin-panel q-mb-md">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Salary Additions ({{ additions.length }})</span>
            <q-btn
              flat
              dense
              size="sm"
              icon="add"
              label="Add"
              color="green-5"
              @click="showAdditionDialog = true"
            />
          </div>
          <q-table
            :rows="additions"
            :columns="additionCols"
            row-key="id"
            flat
            dense
            :rows-per-page-options="[0]"
            hide-bottom
            class="fin-table"
            no-data-label="No additions"
          >
            <template #body-cell-type="props">
              <q-td :props="props"
                ><span class="fin-badge fin-badge--success">{{
                  props.row.addition_type
                }}</span></q-td
              >
            </template>
          </q-table>
        </div>

        <!-- Salary Deductions -->
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Salary Deductions ({{ deductions.length }})</span>
            <q-btn
              flat
              dense
              size="sm"
              icon="add"
              label="Add"
              color="red-5"
              @click="showDeductionDialog = true"
            />
          </div>
          <q-table
            :rows="deductions"
            :columns="deductionCols"
            row-key="id"
            flat
            dense
            :rows-per-page-options="[0]"
            hide-bottom
            class="fin-table"
            no-data-label="No deductions"
          >
            <template #body-cell-type="props">
              <q-td :props="props"
                ><span class="fin-badge fin-badge--danger">{{
                  props.row.deduction_type
                }}</span></q-td
              >
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props"
                ><q-btn
                  flat
                  dense
                  icon="delete"
                  size="sm"
                  color="red-4"
                  @click="removeDeduction(props.row.id)"
              /></q-td>
            </template>
          </q-table>
        </div>
      </div>
    </div>

    <div v-else class="text-center text-grey-5 q-mt-xl">
      <q-icon name="person_search" size="64px" class="q-mb-md" /><br />
      Select an employee to view and manage their salary structure
    </div>

    <!-- Add Allowance Dialog -->
    <q-dialog v-model="showAllowanceDialog" class="fin-dialog">
      <q-card style="width: 420px; max-width: 95vw; background: var(--erp-bg-card); border: 1px solid var(--erp-border)">
        <q-card-section><div class="text-subtitle1">Add Allowance</div></q-card-section>
        <q-card-section class="fin-form">
          <q-select
            v-model="newAllowance.allowance_type_id"
            :options="allowanceTypeOptions"
            label="Allowance Type *"
            dense
            outlined
            emit-value
            map-options
            option-value="id"
            option-label="name"
            class="q-mb-sm"
          />
          <q-input
            v-model.number="newAllowance.amount"
            label="Monthly Amount *"
            type="number"
            dense
            outlined
            prefix="LKR"
            class="q-mb-sm"
          />
          <q-input
            v-model="newAllowance.effective_from"
            label="Effective From"
            type="date"
            dense
            outlined
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            unelevated
            label="Save"
            color="blue-8"
            @click="saveAllowance"
            :disable="!newAllowance.allowance_type_id || !newAllowance.amount"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Add Deduction Dialog -->
    <q-dialog v-model="showDeductionDialog" class="fin-dialog">
      <q-card style="width: 420px; max-width: 95vw; background: var(--erp-bg-card); border: 1px solid var(--erp-border)">
        <q-card-section><div class="text-subtitle1">Add Deduction</div></q-card-section>
        <q-card-section class="fin-form">
          <q-input
            v-model="newDeduction.description"
            label="Description *"
            dense
            outlined
            class="q-mb-sm"
          />
          <q-input
            v-model.number="newDeduction.amount"
            label="Amount *"
            type="number"
            dense
            outlined
            prefix="LKR"
            class="q-mb-sm"
          />
          <q-select
            v-model="newDeduction.deduction_type"
            :options="deductionTypes"
            label="Type"
            dense
            outlined
            class="q-mb-sm"
          />
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input
                v-model="newDeduction.start_date"
                label="Start"
                type="date"
                dense
                outlined
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="newDeduction.end_date"
                label="End"
                type="date"
                dense
                outlined
              />
            </div>
          </div>
          <q-toggle
            v-model="newDeduction.is_recurring"
            label="Recurring monthly"
            class="q-mt-sm"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            unelevated
            label="Save"
            color="red-8"
            @click="saveDeduction"
            :disable="!newDeduction.description || !newDeduction.amount"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Add Addition Dialog -->
    <q-dialog v-model="showAdditionDialog" class="fin-dialog">
      <q-card style="width: 420px; max-width: 95vw; background: var(--erp-bg-card); border: 1px solid var(--erp-border)">
        <q-card-section
          ><div class="text-subtitle1">Add Salary Addition</div></q-card-section
        >
        <q-card-section class="fin-form">
          <q-input
            v-model="newAddition.description"
            label="Description *"
            dense
            outlined
            class="q-mb-sm"
          />
          <q-input
            v-model.number="newAddition.amount"
            label="Amount *"
            type="number"
            dense
            outlined
            prefix="LKR"
            class="q-mb-sm"
          />
          <q-select
            v-model="newAddition.addition_type"
            :options="additionTypes"
            label="Type"
            dense
            outlined
            class="q-mb-sm"
          />
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input
                v-model="newAddition.start_date"
                label="Start"
                type="date"
                dense
                outlined
              />
            </div>
            <div class="col-6">
              <q-input v-model="newAddition.end_date" label="End" type="date" dense outlined />
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            unelevated
            label="Save"
            color="green-8"
            @click="saveAddition"
            :disable="!newAddition.description || !newAddition.amount"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { todayLK } from 'src/modules/finance/utils/finance-dates'
import { ref, computed, onMounted } from 'vue'
import { Notify } from 'quasar'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import { supabase } from 'src/boot/supabase'
import {
  fetchEmployeeDeductions,
  fetchEmployeeAdditions,
  fetchAllowanceTypes,
  createEmployeeAllowance,
  deleteEmployeeAllowance,
  createSalaryDeduction,
  deleteSalaryDeduction,
  createSalaryAddition,
} from 'src/services/financeService'
import {
  projectMonthlySalary,
  monthBounds,
} from 'src/modules/finance/services/finance-payroll.service'

const allEmployees = ref([])
const selectedEmployee = ref(null)
const employee = ref(null)
const salaryStructure = ref(null)
const allowances = ref([])
const deductions = ref([])
const additions = ref([])
const allowanceTypeOptions = ref([])

const showAllowanceDialog = ref(false)
const showDeductionDialog = ref(false)
const showAdditionDialog = ref(false)
const newAllowance = ref({
  allowance_type_id: null,
  amount: 0,
  effective_from: todayLK(),
})
const newDeduction = ref({
  description: '',
  amount: 0,
  deduction_type: 'emergency',
  start_date: todayLK(),
  end_date: null,
  is_recurring: false,
})
const newAddition = ref({
  description: '',
  amount: 0,
  addition_type: 'temporary',
  start_date: todayLK(),
  end_date: null,
})

const deductionTypes = ['emergency', 'recurring', 'installment', 'welfare', 'penalty', 'other']
const additionTypes = ['temporary', 'permanent', 'bonus', 'arrears', 'advance_recovery', 'other']

const employeeOptions = ref([])

// Projection for the current month, mirroring process_monthly_payroll (#135):
// structure allowances + active allowances/additions/deductions in range + EPF 8%.
const projection = computed(() => {
  const { start, end } = monthBounds()
  return projectMonthlySalary({
    structure: salaryStructure.value,
    allowances: allowances.value,
    additions: additions.value,
    deductions: deductions.value,
    periodStart: start,
    periodEnd: end,
  })
})
const totalAllowances = computed(() => projection.value.allowances)
const totalDeductions = computed(() => projection.value.totalDeductions)
const totalAdditions = computed(() => projection.value.additions)
const projectedGross = computed(() => projection.value.gross)
const projectedNet = computed(() => projection.value.net)

const allowanceCols = [
  { name: 'type', label: 'Type', field: 'allowance_type_id', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', format: (v) => fmt(v) },
  { name: 'from', label: 'From', field: 'effective_from', align: 'center' },
  { name: 'to', label: 'To', field: (row) => row.effective_to || '—', align: 'center' },
  { name: 'actions', label: '', align: 'center', style: 'width: 40px' },
]
const deductionCols = [
  { name: 'desc', label: 'Description', field: 'description', align: 'left' },
  { name: 'type', label: 'Type', field: 'deduction_type', align: 'center' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', format: (v) => fmt(v) },
  {
    name: 'period',
    label: 'Period',
    field: (row) => `${row.start_date || '—'} → ${row.end_date || 'ongoing'}`,
    align: 'left',
  },
  { name: 'actions', label: '', align: 'center', style: 'width: 40px' },
]
const additionCols = [
  { name: 'desc', label: 'Description', field: 'description', align: 'left' },
  { name: 'type', label: 'Type', field: 'addition_type', align: 'center' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', format: (v) => fmt(v) },
  {
    name: 'period',
    label: 'Period',
    field: (row) => `${row.start_date || '—'} → ${row.end_date || 'ongoing'}`,
    align: 'left',
  },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
}

function filterEmployees(val, update) {
  update(() => {
    const needle = val.toLowerCase()
    employeeOptions.value = allEmployees.value.filter((e) => e.label.toLowerCase().includes(needle))
  })
}

function buildEmployeeOptions(emps) {
  return emps.map((e) => ({
    id: e.id,
    label: `${e.employee_code || 'N/A'} — ${e.first_name || ''} ${e.last_name || ''}`.trim(),
  }))
}

async function loadData() {
  // Fetch ALL employees directly from the employees table (not via salary_structures)
  const [empRes, typesRes] = await Promise.all([
    supabase
      .from('employees')
      .select(
        'id, first_name, last_name, employee_code, employment_status, designations(title), departments(name)',
      )
      .order('first_name'),
    fetchAllowanceTypes(),
  ])
  const emps = empRes.data || []
  allEmployees.value = buildEmployeeOptions(emps)
  employeeOptions.value = [...allEmployees.value]
  allowanceTypeOptions.value = typesRes.data || []
}

async function loadEmployeeDetails() {
  if (!selectedEmployee.value) {
    employee.value = null
    salaryStructure.value = null
    return
  }

  // Step 1: Fetch employee info directly (simple, guaranteed to work)
  const { data: empData, error: empErr } = await supabase
    .from('employees')
    .select(
      'id, company_id, branch_id, first_name, last_name, employee_code, employment_status, designations(title), departments(name)',
    )
    .eq('id', selectedEmployee.value)
    .single()

  if (empErr || !empData) {
    console.error('[SalaryStructure] Employee fetch failed:', empErr?.message)
    employee.value = null
    salaryStructure.value = null
    return
  }
  employee.value = empData

  // Step 2: Load salary structure — using exact same query as HR module
  salaryStructure.value = null
  try {
    const { data: salData } = await supabase
      .from('salary_structures')
      .select('*')
      .eq('employee_id', selectedEmployee.value)
      .eq('is_current', true)
      .limit(1)
      .single()
    salaryStructure.value = salData || null
  } catch {
    // No is_current record — try getting the latest record by effective_from
    try {
      const { data: fallback } = await supabase
        .from('salary_structures')
        .select('*')
        .eq('employee_id', selectedEmployee.value)
        .order('effective_from', { ascending: false })
        .limit(1)
        .single()
      salaryStructure.value = fallback || null
    } catch {
      salaryStructure.value = null
    }
  }

  // Step 3: Load allowances
  try {
    const { data: allData } = await supabase
      .from('employee_allowances')
      .select('*, salary_allowance_types(name, code)')
      .eq('employee_id', selectedEmployee.value)
      .eq('is_active', true)
    allowances.value = allData || []
  } catch {
    allowances.value = []
  }

  // Step 4: Load deductions & additions
  const [dedRes, addRes] = await Promise.all([
    fetchEmployeeDeductions(selectedEmployee.value),
    fetchEmployeeAdditions(selectedEmployee.value),
  ])
  deductions.value = dedRes.data || []
  additions.value = addRes.data || []
}

function hasCompany() {
  if (employee.value?.company_id) return true
  Notify.create({ type: 'negative', message: 'Employee has no company assigned — fix the employee record first.' })
  return false
}

async function saveAllowance() {
  if (!hasCompany()) return
  const { error } = await createEmployeeAllowance({
    company_id: employee.value?.company_id,
    employee_id: selectedEmployee.value,
    allowance_type_id: newAllowance.value.allowance_type_id,
    amount: newAllowance.value.amount,
    effective_from: newAllowance.value.effective_from,
  })
  if (error) {
    Notify.create({ type: 'negative', message: error.message })
    return
  }
  Notify.create({ type: 'positive', message: 'Allowance added' })
  showAllowanceDialog.value = false
  newAllowance.value = {
    allowance_type_id: null,
    amount: 0,
    effective_from: todayLK(),
  }
  await loadEmployeeDetails()
}

async function saveDeduction() {
  if (!hasCompany()) return
  const { error } = await createSalaryDeduction({
    company_id: employee.value?.company_id,
    branch_id: employee.value?.branch_id,
    employee_id: selectedEmployee.value,
    description: newDeduction.value.description,
    amount: newDeduction.value.amount,
    deduction_type: newDeduction.value.deduction_type,
    start_date: newDeduction.value.start_date,
    end_date: newDeduction.value.end_date || null,
    is_recurring: newDeduction.value.is_recurring,
  })
  if (error) {
    Notify.create({ type: 'negative', message: error.message })
    return
  }
  Notify.create({ type: 'positive', message: 'Deduction added' })
  showDeductionDialog.value = false
  newDeduction.value = {
    description: '',
    amount: 0,
    deduction_type: 'emergency',
    start_date: todayLK(),
    end_date: null,
    is_recurring: false,
  }
  await loadEmployeeDetails()
}

async function saveAddition() {
  if (!hasCompany()) return
  const { error } = await createSalaryAddition({
    company_id: employee.value?.company_id,
    branch_id: employee.value?.branch_id,
    employee_id: selectedEmployee.value,
    description: newAddition.value.description,
    amount: newAddition.value.amount,
    addition_type: newAddition.value.addition_type,
    start_date: newAddition.value.start_date,
    end_date: newAddition.value.end_date || null,
  })
  if (error) {
    Notify.create({ type: 'negative', message: error.message })
    return
  }
  Notify.create({ type: 'positive', message: 'Addition added' })
  showAdditionDialog.value = false
  newAddition.value = {
    description: '',
    amount: 0,
    addition_type: 'temporary',
    start_date: todayLK(),
    end_date: null,
  }
  await loadEmployeeDetails()
}

async function removeAllowance(id) {
  const { error } = await deleteEmployeeAllowance(id)
  if (error) {
    Notify.create({ type: 'negative', message: error.message })
    return
  }
  Notify.create({ type: 'info', message: 'Allowance removed' })
  await loadEmployeeDetails()
}

async function removeDeduction(id) {
  const ded = deductions.value.find((d) => d.id === id)
  if (ded?.is_applied) {
    Notify.create({
      type: 'warning',
      message: 'This deduction was already applied in a payroll run — end-date it instead of deleting.',
    })
    return
  }
  const { error } = await deleteSalaryDeduction(id)
  if (error) {
    Notify.create({ type: 'negative', message: error.message })
    return
  }
  Notify.create({ type: 'info', message: 'Deduction removed' })
  await loadEmployeeDetails()
}

onMounted(() => {
  loadData()
})
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
