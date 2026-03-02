<template>
  <div>
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
            <div class="text-subtitle2 text-grey-4 q-mt-md">Allowances</div>
            <div class="row q-col-gutter-md">
              <div class="col-4">
                <q-input
                  dark
                  outlined
                  v-model.number="form.housing_allowance"
                  label="Housing"
                  type="number"
                  prefix="LKR"
                />
              </div>
              <div class="col-4">
                <q-input
                  dark
                  outlined
                  v-model.number="form.transport_allowance"
                  label="Transport"
                  type="number"
                  prefix="LKR"
                />
              </div>
              <div class="col-4">
                <q-input
                  dark
                  outlined
                  v-model.number="form.meal_allowance"
                  label="Meals"
                  type="number"
                  prefix="LKR"
                />
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
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
    format: (v) => Number(v).toLocaleString(),
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
}

function openConfig(row) {
  if (row) {
    Object.keys(defaultForm).forEach((k) => {
      form[k] = row[k] ?? defaultForm[k]
    })
    form.id = row.id
  } else {
    Object.assign(form, { ...defaultForm })
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
