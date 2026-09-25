<template>
  <div>
    <q-banner dense rounded class="bg-blue-grey-10 text-grey-3 q-mb-md border-grey-8">
      <template v-slot:avatar>
        <q-icon name="info" color="amber-7" />
      </template>
      <div class="text-caption">
        <strong>HR Policy Note:</strong> Fixed monthly allowances (Housing, Transport, Meals, Other) and Basic Salary are configured here. EPF is calculated strictly on the Basic Salary (8% Employee / 12% Employer). Dynamic allowances can also be managed via <em>Finance &gt; Salary Structure</em>.
      </div>
    </q-banner>

    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn color="primary" icon="add" label="Configure Salary" @click="openConfig()" no-caps />
      <q-space />
      <q-input
        dark
        dense
        outlined
        v-model="search"
        placeholder="Search by employee..."
        class="col-12 col-sm-4"
        clearable
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
    </div>

    <q-table
      dark
      flat
      bordered
      :rows="configs"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :filter="search"
      :pagination="{ rowsPerPage: 20 }"
      class="erp-data-grid"
    >
      <template #body-cell-employee="props">
        <q-td :props="props">
          <div class="text-weight-bold">{{ props.row.employees?.full_name }}</div>
          <div class="text-caption text-grey-5">{{ props.row.employees?.employee_code }}</div>
        </q-td>
      </template>
      <template #body-cell-method="props">
        <q-td :props="props">
          <q-badge
            :color="methodColor(props.row.salary_method)"
            :label="(props.row.salary_method || 'basic').replace('_', ' ')"
            class="text-capitalize"
          />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn flat round dense icon="edit" color="amber" size="sm" @click="openConfig(props.row)"
            ><q-tooltip>Edit</q-tooltip></q-btn
          >
        </q-td>
      </template>
    </q-table>

    <!-- Config Dialog -->
    <q-dialog v-model="showDialog" persistent>
      <q-card style="min-width: 700px; background: var(--erp-bg-form-card, #111827); color: #fff">
        <q-bar class="bg-grey-10">
          <q-icon name="tune" />
          <div class="q-ml-sm">Salary Configuration</div>
          <q-space />
          <q-btn dense flat icon="close" @click="showDialog = false" />
        </q-bar>
        <q-card-section>
          <q-form @submit.prevent="save" class="q-gutter-md">
            <q-select
              dark
              outlined
              v-model="form.employee_id"
              :options="employeeOptions"
              label="Employee *"
              emit-value
              map-options
              :rules="[(v) => !!v || 'Required']"
              @update:model-value="onEmployeeSelected"
            />
            <q-select
              dark
              outlined
              v-model="form.salary_method"
              label="Salary Method *"
              :options="salaryMethods"
              emit-value
              map-options
              :rules="[(v) => !!v || 'Required']"
            />
            <div class="row q-col-gutter-md">
              <div class="col-6">
                <q-input
                  dark
                  outlined
                  v-model.number="form.basic_salary"
                  label="Basic Salary"
                  type="number"
                  prefix="LKR"
                />
              </div>
              <div class="col-6" v-if="form.salary_method === 'day_salary'">
                <q-input
                  dark
                  outlined
                  v-model.number="form.day_rate"
                  label="Day Rate"
                  type="number"
                  prefix="LKR"
                />
              </div>
              <div class="col-6" v-if="form.salary_method === 'unit_salary'">
                <q-input
                  dark
                  outlined
                  v-model.number="form.unit_rate"
                  label="Unit Rate"
                  type="number"
                  prefix="LKR"
                />
              </div>
            </div>
            <div class="row q-col-gutter-md">
              <div class="col-4">
                <q-input
                  dark
                  outlined
                  v-model.number="form.hourly_rate"
                  label="Hourly Rate"
                  type="number"
                />
              </div>
              <div class="col-4">
                <q-input
                  dark
                  outlined
                  v-model.number="form.overtime_rate_multiplier"
                  label="OT Multiplier"
                  type="number"
                />
              </div>
              <div class="col-4">
                <q-input
                  dark
                  outlined
                  v-model.number="form.epf_employee_pct"
                  label="EPF %"
                  type="number"
                />
              </div>
            </div>
            <!-- Allowances Header with + Add Custom Allowance Button -->
            <div class="row items-center justify-between q-mt-md q-mb-xs">
              <div class="text-subtitle2 text-grey-4">Allowances</div>
              <q-btn
                dense
                unelevated
                color="amber-8"
                text-color="dark"
                icon="add"
                label="Add Custom Allowance"
                no-caps
                size="sm"
                class="text-weight-bold"
                @click="openAddCustomAllowance"
                :disable="!form.employee_id"
              >
                <q-tooltip v-if="!form.employee_id">Select an employee first</q-tooltip>
                <q-tooltip v-else>Add custom/extra allowance (e.g., Attendance, Fuel, Uniform)</q-tooltip>
              </q-btn>
            </div>

            <!-- Fixed Standard Monthly Allowances -->
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-3">
                <q-input
                  dark
                  outlined
                  v-model.number="form.housing_allowance"
                  label="Housing"
                  type="number"
                  prefix="LKR"
                />
              </div>
              <div class="col-12 col-sm-3">
                <q-input
                  dark
                  outlined
                  v-model.number="form.transport_allowance"
                  label="Transport"
                  type="number"
                  prefix="LKR"
                />
              </div>
              <div class="col-12 col-sm-3">
                <q-input
                  dark
                  outlined
                  v-model.number="form.meal_allowance"
                  label="Meals"
                  type="number"
                  prefix="LKR"
                />
              </div>
              <div class="col-12 col-sm-3">
                <q-input
                  dark
                  outlined
                  v-model.number="form.other_allowances"
                  label="Other Fixed"
                  type="number"
                  prefix="LKR"
                />
              </div>
            </div>

            <!-- Additional / Custom Allowances List -->
            <div class="q-mt-sm">
              <div class="text-caption text-grey-4 q-mb-xs flex items-center justify-between">
                <span>Extra / Custom Allowances ({{ customAllowances.length }}):</span>
                <span v-if="customAllowances.length" class="text-green-4 text-weight-bold">
                  + LKR {{ Number(totalCustomAllowances).toLocaleString('en-LK', { minimumFractionDigits: 2 }) }}
                </span>
              </div>

              <div v-if="loadingCustomAllowances" class="q-pa-sm text-center">
                <q-spinner size="20px" color="amber-8" />
              </div>

              <div v-else-if="customAllowances.length" class="q-gutter-xs">
                <div
                  v-for="ca in customAllowances"
                  :key="ca.id"
                  class="row items-center justify-between q-pa-sm rounded-borders bg-grey-9"
                  style="border: 1px solid rgba(255, 255, 255, 0.08)"
                >
                  <div class="row items-center q-gutter-sm">
                    <q-icon name="stars" color="amber-7" size="18px" />
                    <div>
                      <div class="text-weight-bold text-white text-body2">
                        {{ ca.salary_allowance_types?.name || ca.name || 'Allowance' }}
                      </div>
                      <div class="text-caption text-grey-5" v-if="ca.effective_from">
                        Effective from: {{ ca.effective_from }}
                      </div>
                    </div>
                  </div>
                  <div class="row items-center q-gutter-sm">
                    <div class="text-weight-bold text-green-4 text-body2">
                      LKR {{ Number(ca.amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 }) }}
                    </div>
                    <q-btn
                      flat
                      round
                      dense
                      icon="delete"
                      color="red-4"
                      size="sm"
                      @click="removeCustomAllowance(ca)"
                      :loading="deletingAllowanceId === ca.id"
                    >
                      <q-tooltip>Remove this allowance</q-tooltip>
                    </q-btn>
                  </div>
                </div>
              </div>

              <div
                v-else
                class="q-pa-sm text-caption text-grey-5 bg-grey-10 rounded-borders text-center"
              >
                No extra custom allowances yet. Click the <strong>"+ Add Custom Allowance"</strong> button above to add extra allowances (e.g. Attendance Bonus, Uniform, Fuel, etc.).
              </div>

              <!-- Combined Total Allowances Bar -->
              <div
                class="row items-center justify-between q-pa-sm q-mt-sm bg-grey-10 rounded-borders"
                style="border: 1px dashed rgba(255, 193, 7, 0.3)"
              >
                <div class="text-caption text-grey-4">
                  Total Monthly Allowances (Fixed + Custom):
                </div>
                <div class="text-subtitle2 text-weight-bold text-amber-5">
                  LKR {{ Number(totalAllAllowances).toLocaleString('en-LK', { minimumFractionDigits: 2 }) }}
                </div>
              </div>
            </div>

            <q-select
              v-if="form.salary_method?.startsWith('commission')"
              dark
              outlined
              v-model="form.commission_package_id"
              :options="commissionOptions"
              label="Commission Package"
              emit-value
              map-options
              clearable
            />
            <div class="row justify-end q-mt-md q-gutter-sm">
              <q-btn flat label="Cancel" @click="showDialog = false" color="grey" no-caps />
              <q-btn
                type="submit"
                color="primary"
                label="Save"
                icon="save"
                :loading="saving"
                no-caps
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Custom Allowance Dialog -->
    <q-dialog v-model="showCustomAllowanceDialog" persistent>
      <q-card style="min-width: 440px; background: #1f2937; color: #fff; border-radius: 8px">
        <q-bar class="bg-grey-10">
          <q-icon name="add_circle" color="amber-7" />
          <div class="q-ml-sm text-weight-bold">Add Custom Allowance</div>
          <q-space />
          <q-btn dense flat icon="close" v-close-popup />
        </q-bar>
        <q-card-section>
          <q-form @submit.prevent="saveCustomAllowance" class="q-gutter-md">
            <q-select
              dark
              outlined
              dense
              v-model="newAllowance.type"
              :options="allowanceTypeOptions"
              label="Allowance Name / Type *"
              use-input
              new-value-mode="add-unique"
              emit-value
              map-options
              hint="Select from list or type a custom name (e.g. Attendance, Fuel)"
              :rules="[(v) => !!v || 'Required']"
            >
              <template #prepend><q-icon name="label" color="amber-7" /></template>
            </q-select>

            <q-input
              dark
              outlined
              dense
              v-model.number="newAllowance.amount"
              label="Amount (LKR) *"
              type="number"
              prefix="LKR"
              :rules="[(v) => Number(v) > 0 || 'Must be greater than 0']"
            />

            <q-input
              dark
              outlined
              dense
              v-model="newAllowance.effective_from"
              label="Effective From Date"
              type="date"
            />

            <div class="row justify-end q-gutter-sm q-mt-md">
              <q-btn flat label="Cancel" color="grey-5" v-close-popup no-caps />
              <q-btn
                type="submit"
                color="amber-8"
                text-color="dark"
                label="Add Allowance"
                icon="check"
                :loading="savingCustomAllowance"
                no-caps
                class="text-weight-bold"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const configs = ref([])
const search = ref('')
const showDialog = ref(false)
const employeeOptions = ref([])
const commissionOptions = ref([])

// Custom Allowances State
const showCustomAllowanceDialog = ref(false)
const savingCustomAllowance = ref(false)
const loadingCustomAllowances = ref(false)
const deletingAllowanceId = ref(null)
const customAllowances = ref([])
const allowanceTypeOptions = ref([])

const newAllowance = reactive({
  type: null,
  amount: null,
  effective_from: new Date().toISOString().split('T')[0],
})

const totalCustomAllowances = computed(() => {
  return customAllowances.value.reduce((sum, a) => sum + Number(a.amount || 0), 0)
})

const totalAllAllowances = computed(() => {
  const fixed =
    Number(form.housing_allowance || 0) +
    Number(form.transport_allowance || 0) +
    Number(form.meal_allowance || 0) +
    Number(form.other_allowances || 0)
  return fixed + totalCustomAllowances.value
})

const salaryMethods = [
  { label: 'Basic Salary', value: 'basic_salary' },
  { label: 'Unit Salary', value: 'unit_salary' },
  { label: 'Day Salary', value: 'day_salary' },
  { label: 'Commission (Sales)', value: 'commission_sales' },
  { label: 'Commission (Recovery)', value: 'commission_recovery' },
  { label: 'Commission (Hotline)', value: 'commission_hotline' },
]

const defaultForm = {
  id: null,
  employee_id: null,
  salary_method: 'basic_salary',
  basic_salary: 0,
  hourly_rate: 0,
  day_rate: 0,
  unit_rate: 0,
  housing_allowance: 0,
  transport_allowance: 0,
  meal_allowance: 0,
  other_allowances: 0,
  overtime_rate_multiplier: 1.5,
  epf_employee_pct: 8,
  epf_employer_pct: 12,
  etf_employer_pct: 3,
  commission_package_id: null,
}

const form = reactive({ ...defaultForm })

const columns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (r) => r.employees?.full_name,
    sortable: true,
  },
  { name: 'method', label: 'Method', align: 'center', field: 'salary_method' },
  {
    name: 'basic',
    label: 'Basic (LKR)',
    align: 'right',
    field: 'basic_salary',
    format: (v) => Number(v || 0).toLocaleString(),
  },
  {
    name: 'allowances',
    label: 'Fixed Allowances (LKR)',
    align: 'right',
    field: (r) =>
      Number(r.housing_allowance || 0) +
      Number(r.transport_allowance || 0) +
      Number(r.meal_allowance || 0) +
      Number(r.other_allowances || 0),
    format: (v) => Number(v || 0).toLocaleString(),
  },
  { name: 'epf', label: 'EPF %', align: 'center', field: 'epf_employee_pct' },
  { name: 'ot', label: 'OT ×', align: 'center', field: 'overtime_rate_multiplier' },
  { name: 'actions', label: '', align: 'center' },
]

function methodColor(m) {
  return (
    {
      basic_salary: 'blue',
      day_salary: 'teal',
      unit_salary: 'amber-8',
      commission_sales: 'deep-orange',
      commission_recovery: 'purple',
      commission_hotline: 'cyan',
    }[m] || 'grey'
  )
}

async function loadConfigs() {
  loading.value = true
  const branchId = authStore.currentBranch?.id
  const { data } = await supabase
    .from('salary_structures')
    .select('*, employees(full_name, employee_code, branch_id)')
    .eq('is_current', true)
    .filter('employees.branch_id', 'eq', branchId)
    .order('created_at', { ascending: false })
  configs.value = data || []
  loading.value = false
}

async function loadAllowanceTypes() {
  const companyId = authStore.currentBranch?.company_id
  let q = supabase
    .from('salary_allowance_types')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')
  if (companyId) {
    q = q.eq('company_id', companyId)
  }
  const { data } = await q
  allowanceTypeOptions.value = (data || []).map((t) => ({
    label: t.name,
    value: t.id,
  }))
}

async function loadEmployeeCustomAllowances(empId) {
  if (!empId) {
    customAllowances.value = []
    return
  }
  loadingCustomAllowances.value = true
  try {
    const { data, error } = await supabase
      .from('employee_allowances')
      .select('*, salary_allowance_types(id, name, code)')
      .eq('employee_id', empId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    if (error) throw error
    customAllowances.value = data || []
  } catch (err) {
    console.error('Failed to load custom allowances:', err)
    customAllowances.value = []
  } finally {
    loadingCustomAllowances.value = false
  }
}

function openAddCustomAllowance() {
  if (!form.employee_id) {
    $q.notify({ type: 'warning', message: 'Please select an employee first' })
    return
  }
  newAllowance.type = null
  newAllowance.amount = null
  newAllowance.effective_from = new Date().toISOString().split('T')[0]
  showCustomAllowanceDialog.value = true
}

async function saveCustomAllowance() {
  if (!form.employee_id) {
    $q.notify({ type: 'warning', message: 'Select an employee first' })
    return
  }
  if (!newAllowance.type) {
    $q.notify({ type: 'warning', message: 'Enter or select an allowance name' })
    return
  }
  if (!newAllowance.amount || Number(newAllowance.amount) <= 0) {
    $q.notify({ type: 'warning', message: 'Amount must be greater than 0' })
    return
  }

  savingCustomAllowance.value = true
  try {
    const companyId = authStore.currentBranch?.company_id
    let typeId = null

    if (typeof newAllowance.type === 'string') {
      const match = allowanceTypeOptions.value.find((o) => o.value === newAllowance.type)
      if (match) {
        typeId = match.value
      } else {
        const typeName = newAllowance.type.trim()
        const existingByName = allowanceTypeOptions.value.find(
          (o) => o.label.toLowerCase() === typeName.toLowerCase(),
        )
        if (existingByName) {
          typeId = existingByName.value
        } else {
          const code =
            typeName
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '_')
              .substring(0, 20) +
            '_' +
            Math.floor(Math.random() * 1000)
          const { data: createdType, error: typeErr } = await supabase
            .from('salary_allowance_types')
            .insert({
              company_id: companyId,
              code,
              name: typeName,
              is_taxable: false,
              is_active: true,
            })
            .select('id, name')
            .single()
          if (typeErr) throw typeErr
          typeId = createdType.id
          allowanceTypeOptions.value.push({ label: createdType.name, value: createdType.id })
        }
      }
    } else if (newAllowance.type?.value) {
      typeId = newAllowance.type.value
    }

    const { error: insErr } = await supabase.from('employee_allowances').insert({
      company_id: companyId,
      employee_id: form.employee_id,
      allowance_type_id: typeId,
      amount: Number(newAllowance.amount),
      effective_from: newAllowance.effective_from || new Date().toISOString().split('T')[0],
      is_active: true,
    })
    if (insErr) throw insErr

    $q.notify({ type: 'positive', message: 'Custom allowance added successfully' })
    showCustomAllowanceDialog.value = false
    await loadEmployeeCustomAllowances(form.employee_id)
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Error adding allowance: ' + err.message })
  } finally {
    savingCustomAllowance.value = false
  }
}

async function removeCustomAllowance(ca) {
  $q.dialog({
    title: 'Remove Allowance',
    message: `Are you sure you want to remove ${ca.salary_allowance_types?.name || 'this allowance'} (LKR ${Number(ca.amount).toLocaleString()})?`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    deletingAllowanceId.value = ca.id
    try {
      const { error } = await supabase.from('employee_allowances').delete().eq('id', ca.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Allowance removed' })
      await loadEmployeeCustomAllowances(form.employee_id)
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to remove: ' + err.message })
    } finally {
      deletingAllowanceId.value = null
    }
  })
}

function onEmployeeSelected(empId) {
  form.employee_id = empId
  if (empId) {
    loadEmployeeCustomAllowances(empId)
  } else {
    customAllowances.value = []
  }
}

async function loadHelpers() {
  const branchId = authStore.currentBranch?.id
  const { data: emps } = await supabase
    .from('employees')
    .select('id, full_name, employee_code')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('first_name')
  employeeOptions.value = (emps || []).map((e) => ({
    label: `${e.full_name} (${e.employee_code})`,
    value: e.id,
  }))
  const { data: pkgs } = await supabase
    .from('commission_packages')
    .select('id, name')
    .eq('is_active', true)
  commissionOptions.value = (pkgs || []).map((p) => ({ label: p.name, value: p.id }))
  await loadAllowanceTypes()
}

function openConfig(row) {
  if (row) {
    Object.keys(defaultForm).forEach((k) => {
      form[k] = row[k] ?? defaultForm[k]
    })
    form.id = row.id
    if (form.employee_id) {
      loadEmployeeCustomAllowances(form.employee_id)
    }
  } else {
    Object.assign(form, { ...defaultForm })
    customAllowances.value = []
  }
  showDialog.value = true
}

async function save() {
  saving.value = true
  try {
    const payload = { ...form }
    const id = payload.id
    delete payload.id
    payload.company_id = authStore.currentBranch?.company_id
    payload.is_current = true
    payload.effective_from = new Date().toISOString().split('T')[0]
    payload.salary_type = 'monthly'
    if (id) {
      const { error } = await supabase.from('salary_structures').update(payload).eq('id', id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('salary_structures').insert(payload)
      if (error) throw error
    }
    $q.notify({ type: 'positive', message: 'Salary config saved' })
    showDialog.value = false
    loadConfigs()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadConfigs()
  loadHelpers()
})
</script>

<style scoped>
.erp-data-grid {
  background: var(--erp-bg-form-card, #111827);
  border-radius: 12px;
}
</style>
