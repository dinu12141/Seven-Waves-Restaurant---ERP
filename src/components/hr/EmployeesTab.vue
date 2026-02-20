<template>
  <div class="q-pa-md">
    <!-- Header & Controls -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn-toggle
        v-model="viewMode"
        toggle-color="primary"
        color="grey-9"
        text-color="grey"
        :options="[
          { icon: 'grid_view', value: 'grid' },
          { icon: 'list', value: 'list' },
        ]"
        class="q-mr-sm"
        dense
      />
      <q-input
        dark
        dense
        outlined
        v-model="filter"
        placeholder="Search employees..."
        class="col-grow"
      >
        <template v-slot:prepend>
          <q-icon name="search" />
        </template>
      </q-input>
      <q-select
        dark
        dense
        outlined
        v-model="statusFilter"
        :options="['All', 'Active', 'Inactive', 'Suspended', 'Terminated']"
        label="Status"
        style="width: 150px"
      />
    </div>

    <!-- Grid View -->
    <div v-if="viewMode === 'grid'" class="row q-col-gutter-md">
      <div v-for="emp in filteredEmployees" :key="emp.id" class="col-12 col-sm-6 col-md-4 col-lg-3">
        <EmployeeCard :employee="emp" @edit="editEmployee" @view="viewEmployee" />
      </div>
    </div>

    <!-- List View -->
    <q-table
      v-else
      dark
      flat
      bordered
      :rows="employees"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :filter="filter"
      :pagination="{ rowsPerPage: 15 }"
      class="bg-grey-9"
    >
      <template v-slot:body-cell-name="props">
        <q-td :props="props">
          <div class="row items-center no-wrap q-gutter-sm">
            <q-avatar size="32px" color="primary" text-color="white">
              {{ props.row.first_name?.charAt(0) }}{{ props.row.last_name?.charAt(0) }}
            </q-avatar>
            <div>
              <div class="text-weight-bold">
                {{ props.row.full_name || `${props.row.first_name} ${props.row.last_name}` }}
              </div>
              <div class="text-caption text-grey-5">{{ props.row.employee_code }}</div>
            </div>
          </div>
        </q-td>
      </template>

      <template v-slot:body-cell-department="props">
        <q-td :props="props">
          <q-badge color="indigo" :label="props.row.departments?.name || '—'" />
        </q-td>
      </template>

      <template v-slot:body-cell-designation="props">
        <q-td :props="props">
          {{ props.row.designations?.title || '—' }}
        </q-td>
      </template>

      <template v-slot:body-cell-employment_status="props">
        <q-td :props="props">
          <q-badge
            :color="statusColor(props.row.employment_status)"
            :label="props.row.employment_status"
            class="text-capitalize"
          />
        </q-td>
      </template>

      <template v-slot:body-cell-salary_type="props">
        <q-td :props="props">
          <q-badge
            :color="props.row.salary_type === 'monthly' ? 'teal' : 'amber-8'"
            :label="props.row.salary_type || '—'"
            class="text-capitalize"
          />
        </q-td>
      </template>

      <template v-slot:body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn
            flat
            round
            dense
            icon="visibility"
            color="primary"
            size="sm"
            @click="viewEmployee(props.row)"
          >
            <q-tooltip>View Details</q-tooltip>
          </q-btn>
          <q-btn
            flat
            round
            dense
            icon="edit"
            color="amber"
            size="sm"
            @click="editEmployee(props.row)"
          >
            <q-tooltip>Edit</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- Employee Detail Dialog -->
    <q-dialog v-model="showDetail" full-width>
      <q-card class="bg-grey-9 text-white" style="max-width: 800px">
        <q-card-section class="row items-center">
          <q-avatar size="56px" color="primary" text-color="white" class="q-mr-md">
            {{ selectedEmployee?.first_name?.charAt(0)
            }}{{ selectedEmployee?.last_name?.charAt(0) }}
          </q-avatar>
          <div>
            <div class="text-h5 text-weight-bold">{{ selectedEmployee?.full_name }}</div>
            <div class="text-grey-5">
              {{ selectedEmployee?.employee_code }} · {{ selectedEmployee?.departments?.name }}
            </div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator dark />

        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-6">
              <div class="text-caption text-grey-5 q-mb-xs">Email</div>
              <div>{{ selectedEmployee?.email || '—' }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5 q-mb-xs">Phone</div>
              <div>{{ selectedEmployee?.phone || '—' }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5 q-mb-xs">Designation</div>
              <div>{{ selectedEmployee?.designations?.title || '—' }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5 q-mb-xs">Employment Type</div>
              <div class="text-capitalize">{{ selectedEmployee?.employment_type || '—' }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5 q-mb-xs">Hire Date</div>
              <div>{{ selectedEmployee?.hire_date || '—' }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5 q-mb-xs">NIC</div>
              <div>{{ selectedEmployee?.nic_number || '—' }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5 q-mb-xs">Bank</div>
              <div>
                {{ selectedEmployee?.bank_name || '—' }}
                {{
                  selectedEmployee?.bank_account_number
                    ? '· ' + selectedEmployee.bank_account_number
                    : ''
                }}
              </div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5 q-mb-xs">Status</div>
              <q-badge
                :color="statusColor(selectedEmployee?.employment_status)"
                :label="selectedEmployee?.employment_status"
                class="text-capitalize"
              />
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import EmployeeCard from 'components/hr/EmployeeCard.vue'

const authStore = useAuthStore()
const loading = ref(false)
const employees = ref([])
const filter = ref('')
const statusFilter = ref('All')
const showDetail = ref(false)
const selectedEmployee = ref(null)
const viewMode = ref('list')

const columns = [
  { name: 'name', label: 'Employee', align: 'left', field: 'full_name', sortable: true },
  {
    name: 'department',
    label: 'Department',
    align: 'left',
    field: (row) => row.departments?.name,
    sortable: true,
  },
  {
    name: 'designation',
    label: 'Designation',
    align: 'left',
    field: (row) => row.designations?.title,
    sortable: true,
  },
  {
    name: 'employment_status',
    label: 'Status',
    align: 'center',
    field: 'employment_status',
    sortable: true,
  },
  {
    name: 'salary_type',
    label: 'Salary Type',
    align: 'center',
    field: 'salary_type',
    sortable: true,
  },
  { name: 'phone', label: 'Phone', align: 'left', field: 'phone' },
  { name: 'actions', label: 'Actions', align: 'center', field: 'actions' },
]

function statusColor(status) {
  const map = { active: 'green', inactive: 'grey', suspended: 'orange', terminated: 'red' }
  return map[status] || 'grey'
}

const filteredEmployees = computed(() => {
  let result = employees.value
  if (filter.value) {
    const term = filter.value.toLowerCase()
    result = result.filter(
      (e) =>
        e.full_name?.toLowerCase().includes(term) ||
        e.employee_code?.toLowerCase().includes(term) ||
        e.email?.toLowerCase().includes(term),
    )
  }
  return result
})

async function loadEmployees() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    let query = supabase
      .from('employees')
      .select('*, departments(name), designations(title)')
      .eq('branch_id', branchId)
      .order('first_name')

    if (statusFilter.value !== 'All') {
      query = query.eq('employment_status', statusFilter.value.toLowerCase())
    }

    const { data, error } = await query
    if (error) throw error
    employees.value = data || []
  } catch (err) {
    console.error('Failed to load employees:', err)
  } finally {
    loading.value = false
  }
}

function viewEmployee(emp) {
  selectedEmployee.value = emp
  showDetail.value = true
}

function editEmployee(emp) {
  selectedEmployee.value = emp
  showDetail.value = true
}

watch(statusFilter, () => loadEmployees())

onMounted(() => loadEmployees())

defineExpose({ loadEmployees })
</script>
