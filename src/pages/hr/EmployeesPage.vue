<template>
  <div>
    <!-- KPI Row -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="people" size="36px" color="blue" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Total Employees</div>
              <div class="text-h5 text-weight-bold">{{ stats.total }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="check_circle" size="36px" color="green" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Permanent</div>
              <div class="text-h5 text-weight-bold">{{ stats.permanent }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="schedule" size="36px" color="orange" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Probation</div>
              <div class="text-h5 text-weight-bold">{{ stats.probation }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="description" size="36px" color="cyan" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Contract</div>
              <div class="text-h5 text-weight-bold">{{ stats.contract }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn color="primary" icon="add" label="Add Employee" @click="openForm()" no-caps />
      <q-space />
      <q-input
        dark
        dense
        outlined
        v-model="search"
        placeholder="Search employees..."
        class="col-12 col-sm-4"
        clearable
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-select
        dark
        dense
        outlined
        v-model="statusFilter"
        :options="['All', 'Active', 'Permanent', 'Probation', 'Contract', 'Part Time', 'Resigned']"
        label="Status"
        style="width: 160px"
      />
    </div>

    <!-- Employee Table -->
    <q-table
      dark
      flat
      bordered
      :rows="filteredEmployees"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :filter="search"
      :pagination="{ rowsPerPage: 20 }"
      class="erp-data-grid"
    >
      <template #body-cell-name="props">
        <q-td :props="props">
          <div class="row items-center no-wrap q-gutter-sm">
            <q-avatar size="32px" color="primary" text-color="white" font-size="13px">
              {{ props.row.first_name?.charAt(0) }}{{ props.row.last_name?.charAt(0) }}
            </q-avatar>
            <div>
              <div class="text-weight-bold">{{ props.row.full_name }}</div>
              <div class="text-caption text-grey-5">{{ props.row.employee_code }}</div>
            </div>
          </div>
        </q-td>
      </template>

      <template #body-cell-department="props">
        <q-td :props="props">
          <q-badge color="indigo" :label="props.row.departments?.name || '—'" />
        </q-td>
      </template>

      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="statusColor(props.row.employment_status)"
            :label="(props.row.employment_status || '—').replace('_', ' ')"
            class="text-capitalize"
          />
        </q-td>
      </template>

      <template #body-cell-actions="props">
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
            <q-tooltip>View</q-tooltip>
          </q-btn>
          <q-btn flat round dense icon="edit" color="amber" size="sm" @click="openForm(props.row)">
            <q-tooltip>Edit</q-tooltip>
          </q-btn>
          <q-btn
            flat
            round
            dense
            icon="delete"
            color="negative"
            size="sm"
            @click="confirmDelete(props.row)"
          >
            <q-tooltip>Delete</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- Employee Registration Dialog -->
    <q-dialog
      v-model="showForm"
      persistent
      maximized
      transition-show="slide-up"
      transition-hide="slide-down"
    >
      <q-card class="full-width" style="background: var(--erp-bg-page, #0b0f19); color: #fff">
        <q-bar class="bg-grey-10 text-white">
          <q-icon name="badge" />
          <div class="q-ml-sm text-weight-bold">
            {{ isEditing ? 'Edit' : 'New' }} Employee Registration
          </div>
          <q-space />
          <q-btn dense flat icon="close" @click="showForm = false" />
        </q-bar>

        <q-scroll-area style="height: calc(100vh - 60px)">
          <div class="q-pa-lg" style="max-width: 1200px; margin: 0 auto">
            <q-form @submit.prevent="saveEmployee" ref="formRef" greedy>
              <!-- Section 1: Personal Info -->
              <ERPFormCard
                title="Personal Information"
                subtitle="Basic employee details"
                hideActions
              >
                <div class="row q-col-gutter-md">
                  <div class="col-12 col-md-3">
                    <q-input
                      dark
                      outlined
                      v-model="form.employee_code"
                      label="Employee Code *"
                      readonly
                      hint="Auto-generated"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input
                      dark
                      outlined
                      v-model="form.epf_no"
                      label="EPF No"
                      readonly
                      hint="Auto for Permanent"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input
                      dark
                      outlined
                      v-model="form.first_name"
                      label="First Name *"
                      :rules="[r.req]"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input
                      dark
                      outlined
                      v-model="form.last_name"
                      label="Last Name *"
                      :rules="[r.req]"
                    />
                  </div>
                  <div class="col-12 col-md-4">
                    <q-input
                      dark
                      outlined
                      v-model="form.name_with_initials"
                      label="Name with Initials"
                    />
                  </div>
                  <div class="col-12 col-md-2">
                    <q-select
                      dark
                      outlined
                      v-model="form.gender"
                      :options="['Male', 'Female', 'Other']"
                      label="Gender *"
                      :rules="[r.req]"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input dark outlined v-model="form.nationality" label="Nationality" />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-select
                      dark
                      outlined
                      v-model="form.civil_status"
                      :options="['Single', 'Married', 'Divorced', 'Widowed']"
                      label="Civil Status"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input
                      dark
                      outlined
                      v-model="form.date_of_birth"
                      label="Date of Birth"
                      type="date"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input dark outlined v-model="form.nic_number" label="NIC Number" />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input dark outlined v-model="form.passport_no" label="Passport No" />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input dark outlined v-model="form.driving_license_no" label="DL No" />
                  </div>
                </div>
              </ERPFormCard>

              <!-- Section 2: Contact & Address -->
              <ERPFormCard
                title="Contact & Address"
                subtitle="Communication details"
                hideActions
                class="q-mt-md"
              >
                <div class="row q-col-gutter-md">
                  <div class="col-12 col-md-3">
                    <q-input
                      dark
                      outlined
                      v-model="form.mobile"
                      label="Mobile *"
                      :rules="[r.req]"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input dark outlined v-model="form.residence_phone" label="Residence Phone" />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input dark outlined v-model="form.email" label="Email" type="email" />
                  </div>
                  <div class="col-12 col-md-3" />
                  <div class="col-12 col-md-4">
                    <q-input dark outlined v-model="form.address_line1" label="Address Line 1" />
                  </div>
                  <div class="col-12 col-md-4">
                    <q-input dark outlined v-model="form.address_line2" label="Address Line 2" />
                  </div>
                  <div class="col-12 col-md-4">
                    <q-input dark outlined v-model="form.address_line3" label="Address Line 3" />
                  </div>
                  <div class="col-12">
                    <q-input
                      dark
                      outlined
                      v-model="form.road_map"
                      label="Road Map / Directions"
                      type="textarea"
                      rows="2"
                    />
                  </div>
                </div>
              </ERPFormCard>

              <!-- Section 3: Employment -->
              <ERPFormCard
                title="Employment Details"
                subtitle="Position & status"
                hideActions
                class="q-mt-md"
              >
                <div class="row q-col-gutter-md">
                  <div class="col-12 col-md-3">
                    <q-select
                      dark
                      outlined
                      v-model="form.department_id"
                      :options="departmentOptions"
                      label="Department *"
                      emit-value
                      map-options
                      :rules="[r.req]"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-select
                      dark
                      outlined
                      v-model="form.designation_id"
                      :options="designationOptions"
                      label="Designation *"
                      emit-value
                      map-options
                      :rules="[r.req]"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input
                      dark
                      outlined
                      v-model="form.hire_date"
                      label="Date of Joining *"
                      type="date"
                      :rules="[r.req]"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-select
                      dark
                      outlined
                      v-model="form.employment_status"
                      :options="empStatusOptions"
                      label="Status *"
                      emit-value
                      map-options
                      :rules="[r.req]"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-select
                      dark
                      outlined
                      v-model="form.education_level"
                      :options="['O/L', 'A/L', 'Graduate', 'Post Graduate', 'Other']"
                      label="Education"
                    />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input dark outlined v-model="form.ol_results" label="O/L Details" />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-input dark outlined v-model="form.al_results" label="A/L Details" />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-toggle dark v-model="form.is_graduate" label="Graduate" color="primary" />
                  </div>
                  <div class="col-12 col-md-3">
                    <q-toggle
                      dark
                      v-model="form.welfare_active"
                      label="Welfare Active"
                      color="teal"
                    />
                  </div>
                </div>
              </ERPFormCard>

              <!-- Section 4: Bank -->
              <ERPFormCard
                title="Bank Details"
                subtitle="Salary disbursement"
                hideActions
                class="q-mt-md"
              >
                <div class="row q-col-gutter-md">
                  <div class="col-12 col-md-4">
                    <q-input dark outlined v-model="form.bank_name" label="Bank Name" />
                  </div>
                  <div class="col-12 col-md-4">
                    <q-input dark outlined v-model="form.bank_branch" label="Bank Branch" />
                  </div>
                  <div class="col-12 col-md-2">
                    <q-input dark outlined v-model="form.bank_code" label="Bank Code" />
                  </div>
                  <div class="col-12 col-md-2">
                    <q-input dark outlined v-model="form.bank_account_number" label="Account No" />
                  </div>
                </div>
              </ERPFormCard>

              <!-- Section 5: Emergency -->
              <ERPFormCard title="Emergency Contact" hideActions class="q-mt-md">
                <div class="row q-col-gutter-md">
                  <div class="col-12 col-md-6">
                    <q-input
                      dark
                      outlined
                      v-model="form.emergency_contact_name"
                      label="Contact Name"
                    />
                  </div>
                  <div class="col-12 col-md-6">
                    <q-input
                      dark
                      outlined
                      v-model="form.emergency_contact_phone"
                      label="Contact Phone"
                    />
                  </div>
                </div>
              </ERPFormCard>

              <!-- Section 6: KYC Documents -->
              <ERPFormCard
                title="KYC Documents"
                subtitle="Upload required documents"
                hideActions
                class="q-mt-md"
                v-if="isEditing"
              >
                <div class="row q-col-gutter-md">
                  <div v-for="dt in docTypes" :key="dt.value" class="col-12 col-md-4">
                    <q-card
                      flat
                      bordered
                      class="q-pa-sm"
                      style="background: rgba(255, 255, 255, 0.03)"
                    >
                      <div class="text-caption text-grey-4 q-mb-sm">{{ dt.label }}</div>
                      <q-file
                        dark
                        outlined
                        dense
                        v-model="docFiles[dt.value]"
                        :label="'Upload ' + dt.label"
                        accept=".pdf,.jpg,.jpeg,.png"
                        @update:model-value="uploadDoc(dt.value, $event)"
                      >
                        <template #prepend><q-icon name="attach_file" /></template>
                      </q-file>
                      <div v-if="existingDocs[dt.value]" class="q-mt-xs">
                        <q-badge color="green" label="Uploaded" />
                      </div>
                    </q-card>
                  </div>
                </div>
              </ERPFormCard>

              <!-- Actions -->
              <div class="row justify-end q-mt-lg q-gutter-sm q-mb-xl">
                <q-btn flat label="Cancel" @click="showForm = false" color="grey" no-caps />
                <q-btn
                  type="submit"
                  color="primary"
                  :label="isEditing ? 'Update Employee' : 'Save Employee'"
                  icon="save"
                  :loading="saving"
                  no-caps
                />
              </div>
            </q-form>
          </div>
        </q-scroll-area>
      </q-card>
    </q-dialog>

    <!-- View Detail Dialog -->
    <q-dialog v-model="showDetail">
      <q-card
        class="full-width"
        style="max-width: 800px; background: var(--erp-bg-form-card, #111827); color: #fff"
      >
        <q-card-section class="row items-center">
          <q-avatar size="56px" color="primary" text-color="white" class="q-mr-md" font-size="20px">
            {{ viewEmp?.first_name?.charAt(0) }}{{ viewEmp?.last_name?.charAt(0) }}
          </q-avatar>
          <div>
            <div class="text-h5 text-weight-bold">{{ viewEmp?.full_name }}</div>
            <div class="text-grey-5">
              {{ viewEmp?.employee_code }} · {{ viewEmp?.departments?.name }}
            </div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-separator dark />
        <q-card-section>
          <div class="row q-col-gutter-md">
            <div v-for="f in detailFields" :key="f.key" class="col-6">
              <div class="text-caption text-grey-5 q-mb-xs">{{ f.label }}</div>
              <div>{{ viewEmp?.[f.key] || '—' }}</div>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import ERPFormCard from 'components/erp/ERPFormCard.vue'

const $q = useQuasar()
const authStore = useAuthStore()

const loading = ref(false)
const saving = ref(false)
const employees = ref([])
const search = ref('')
const statusFilter = ref('All')
const showForm = ref(false)
const showDetail = ref(false)
const isEditing = ref(false)
const viewEmp = ref(null)
const formRef = ref(null)
const docFiles = reactive({})
const existingDocs = reactive({})

const stats = reactive({ total: 0, permanent: 0, probation: 0, contract: 0 })

const r = { req: (v) => (v !== null && v !== undefined && v !== '') || 'Required' }

const departmentOptions = ref([])
const designationOptions = ref([])

const empStatusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Permanent', value: 'permanent' },
  { label: 'Probation', value: 'probation' },
  { label: 'Contract', value: 'contract' },
  { label: 'Part Time', value: 'part_time' },
]

const docTypes = [
  { value: 'nic_front', label: 'NIC Front' },
  { value: 'nic_back', label: 'NIC Back' },
  { value: 'photo', label: 'Photograph' },
  { value: 'gs_letter', label: 'GS Letter' },
  { value: 'police_report', label: 'Police Report' },
  { value: 'driving_license', label: 'Driving License' },
]

const defaultForm = {
  id: null,
  employee_code: '',
  epf_no: '',
  first_name: '',
  last_name: '',
  name_with_initials: '',
  gender: null,
  nationality: 'Sri Lankan',
  civil_status: null,
  date_of_birth: '',
  nic_number: '',
  passport_no: '',
  driving_license_no: '',
  mobile: '',
  residence_phone: '',
  email: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  address_line3: '',
  road_map: '',
  department_id: null,
  designation_id: null,
  hire_date: new Date().toISOString().split('T')[0],
  employment_status: 'probation',
  education_level: null,
  ol_results: '',
  al_results: '',
  is_graduate: false,
  welfare_active: false,
  bank_name: '',
  bank_branch: '',
  bank_code: '',
  bank_account_number: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
}

const form = reactive({ ...defaultForm })

const columns = [
  { name: 'name', label: 'Employee', align: 'left', field: 'full_name', sortable: true },
  {
    name: 'department',
    label: 'Department',
    align: 'left',
    field: (r) => r.departments?.name,
    sortable: true,
  },
  { name: 'designation', label: 'Designation', align: 'left', field: (r) => r.designations?.title },
  { name: 'mobile', label: 'Mobile', align: 'left', field: 'mobile' },
  { name: 'status', label: 'Status', align: 'center', field: 'employment_status', sortable: true },
  { name: 'epf', label: 'EPF No', align: 'center', field: 'epf_no' },
  { name: 'actions', label: 'Actions', align: 'center' },
]

const detailFields = [
  { key: 'email', label: 'Email' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'nic_number', label: 'NIC' },
  { key: 'epf_no', label: 'EPF No' },
  { key: 'hire_date', label: 'Date of Joining' },
  { key: 'employment_status', label: 'Status' },
  { key: 'bank_name', label: 'Bank' },
  { key: 'bank_account_number', label: 'Account No' },
  { key: 'address_line1', label: 'Address' },
  { key: 'nationality', label: 'Nationality' },
]

const filteredEmployees = computed(() => {
  let result = employees.value
  if (statusFilter.value !== 'All') {
    const status = statusFilter.value.toLowerCase().replace(' ', '_')
    result = result.filter(
      (e) => e.employment_status === status || (status === 'active' && e.is_active),
    )
  }
  return result
})

function statusColor(s) {
  return (
    {
      active: 'green',
      permanent: 'teal',
      probation: 'amber-8',
      contract: 'cyan',
      part_time: 'purple',
      resigned: 'red',
      inactive: 'grey',
    }[s] || 'grey'
  )
}

async function loadEmployees() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return
    const { data, error } = await supabase
      .from('employees')
      .select('*, departments(name), designations(title)')
      .eq('branch_id', branchId)
      .order('first_name')
    if (error) throw error
    employees.value = data || []
    stats.total = employees.value.length
    stats.permanent = employees.value.filter((e) => e.employment_status === 'permanent').length
    stats.probation = employees.value.filter((e) => e.employment_status === 'probation').length
    stats.contract = employees.value.filter((e) => e.employment_status === 'contract').length
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  const { data: depts } = await supabase
    .from('departments')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  departmentOptions.value = (depts || []).map((d) => ({ label: d.name, value: d.id }))

  const { data: desigs } = await supabase
    .from('designations')
    .select('id, title')
    .eq('is_active', true)
    .order('title')
  designationOptions.value = (desigs || []).map((d) => ({ label: d.title, value: d.id }))
}

async function generateCode() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  const { data } = await supabase
    .from('employees')
    .select('employee_code')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (data?.length) {
    const match = data[0].employee_code.match(/\d+$/)
    if (match) {
      const prefix = data[0].employee_code.slice(0, match.index)
      form.employee_code = prefix + String(parseInt(match[0]) + 1).padStart(match[0].length, '0')
    } else {
      form.employee_code = 'EMP001'
    }
  } else {
    form.employee_code = 'EMP001'
  }
}

function openForm(emp) {
  if (emp) {
    isEditing.value = true
    Object.keys(defaultForm).forEach((k) => {
      form[k] = emp[k] ?? defaultForm[k]
    })
    form.id = emp.id
    loadExistingDocs(emp.id)
  } else {
    isEditing.value = false
    Object.assign(form, { ...defaultForm })
    generateCode()
  }
  showForm.value = true
}

function viewEmployee(emp) {
  viewEmp.value = emp
  showDetail.value = true
}

async function saveEmployee() {
  saving.value = true
  try {
    const payload = { ...form }
    delete payload.id
    payload.company_id = authStore.currentBranch?.company_id
    payload.branch_id = authStore.currentBranch?.id
    payload.created_by = authStore.user?.id

    if (isEditing.value) {
      const { error } = await supabase.from('employees').update(payload).eq('id', form.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Employee updated successfully' })
    } else {
      const { error } = await supabase.from('employees').insert(payload)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Employee added successfully' })
    }
    showForm.value = false
    loadEmployees()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

function confirmDelete(emp) {
  $q.dialog({
    title: 'Confirm Deletion',
    message: `Are you sure you want to delete ${emp.full_name}? This action cannot be undone.`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      loading.value = true
      const { error } = await supabase.from('employees').delete().eq('id', emp.id)
      if (error) throw error
      
      $q.notify({ type: 'positive', message: 'Employee deleted successfully' })
      loadEmployees()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message || 'Failed to delete' })
    } finally {
      loading.value = false
    }
  })
}

async function uploadDoc(docType, file) {
  if (!file || !form.id) return
  try {
    const path = `employee-docs/${form.id}/${docType}_${Date.now()}.${file.name.split('.').pop()}`
    const { error: upErr } = await supabase.storage.from('employee-documents').upload(path, file)
    if (upErr) throw upErr

    await supabase.from('employee_documents').insert({
      company_id: authStore.currentBranch?.company_id,
      employee_id: form.id,
      doc_type: docType,
      doc_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
    })

    existingDocs[docType] = true
    $q.notify({ type: 'positive', message: `${docType.replace('_', ' ')} uploaded` })
  } catch (err) {
    if (err.message !== 'canceled') {
      $q.notify({ type: 'negative', message: err.message })
    }
  }
}

async function loadExistingDocs(empId) {
  const { data } = await supabase
    .from('employee_documents')
    .select('doc_type')
    .eq('employee_id', empId)
  if (data)
    data.forEach((d) => {
      existingDocs[d.doc_type] = true
    })
}

watch(statusFilter, () => loadEmployees())

onMounted(() => {
  loadEmployees()
  loadOptions()
})
</script>

<style scoped lang="scss">
.erp-stat-card {
  background: var(--erp-bg-form-card, #111827);
  border: 1px solid var(--erp-input-border, #374151);
  border-radius: 12px;
}
.erp-data-grid {
  background: var(--erp-bg-form-card, #111827);
  border-radius: 12px;
}
</style>
