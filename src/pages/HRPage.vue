<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="HR & Payroll"
      subtitle="Employee management, attendance, and payroll processing"
    >
      <template #actions>
        <q-btn
          v-if="isHR"
          outline
          color="primary"
          icon="person_add"
          label="Add Employee"
          @click="showAddEmployee = true"
        />
        <q-btn
          v-if="isHR"
          color="primary"
          icon="payments"
          label="Run Payroll"
          @click="showPayrollDialog = true"
        />
      </template>
    </PageHeader>

    <!-- Stats Row -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-sm-6 col-md-3">
        <StatCard
          title="Total Employees"
          :value="stats.totalEmployees"
          icon="people"
          color="blue"
        />
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <StatCard
          title="Present Today"
          :value="stats.presentToday"
          icon="check_circle"
          color="green"
        />
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <StatCard title="On Leave" :value="stats.onLeave" icon="event_busy" color="orange" />
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <StatCard
          title="Pending Approvals"
          :value="stats.pendingApprovals"
          icon="pending_actions"
          color="red"
        />
      </div>
    </div>

    <!-- Tabs -->
    <q-card class="bg-dark text-white">
      <q-tabs
        v-model="tab"
        dense
        class="text-grey"
        active-color="primary"
        indicator-color="primary"
        align="left"
        narrow-indicator
      >
        <q-tab
          v-for="t in availableTabs"
          :key="t.name"
          :name="t.name"
          :label="t.label"
          :icon="t.icon"
        />
      </q-tabs>

      <q-separator dark />

      <q-tab-panels v-model="tab" animated class="bg-dark text-white">
        <q-tab-panel name="employees" class="q-pa-none">
          <EmployeesTab ref="employeesTabRef" />
        </q-tab-panel>

        <q-tab-panel name="departments" class="q-pa-none">
          <DepartmentsTab />
        </q-tab-panel>

        <q-tab-panel name="shifts" class="q-pa-none">
          <ShiftsTab />
        </q-tab-panel>

        <q-tab-panel name="attendance" class="q-pa-none">
          <AttendanceTab />
        </q-tab-panel>

        <q-tab-panel name="leave" class="q-pa-none">
          <LeaveTab />
        </q-tab-panel>

        <q-tab-panel name="payroll" class="q-pa-none">
          <PayrollTab />
        </q-tab-panel>

        <q-tab-panel name="loans" class="q-pa-none">
          <LoansTab />
        </q-tab-panel>
      </q-tab-panels>
    </q-card>

    <!-- Add Employee Dialog -->
    <q-dialog v-model="showAddEmployee" persistent>
      <q-card class="bg-grey-9 text-white" style="min-width: 500px">
        <q-card-section class="row items-center">
          <div class="text-h6">Add New Employee</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator dark />

        <q-card-section class="q-gutter-md">
          <q-form @submit="saveEmployee" class="q-gutter-md">
            <div class="row q-col-gutter-md">
              <div class="col-6">
                <q-input
                  dark
                  outlined
                  v-model="newEmployee.first_name"
                  label="First Name"
                  :rules="[(val) => (val && val.length > 0) || 'Required']"
                />
              </div>
              <div class="col-6">
                <q-input
                  dark
                  outlined
                  v-model="newEmployee.last_name"
                  label="Last Name"
                  :rules="[(val) => (val && val.length > 0) || 'Required']"
                />
              </div>
            </div>
            <q-input
              dark
              outlined
              v-model="newEmployee.employee_code"
              label="Employee Code"
              placeholder="e.g. EMP001"
              :rules="[(val) => (val && val.length > 0) || 'Required']"
            />
            <q-input dark outlined v-model="newEmployee.email" label="Email" type="email" />
            <q-input dark outlined v-model="newEmployee.phone" label="Phone" />
            <q-select
              dark
              outlined
              v-model="newEmployee.department_id"
              :options="departmentOptions"
              label="Department"
              emit-value
              map-options
              :rules="[(val) => !!val || 'Required']"
            />
            <q-select
              dark
              outlined
              v-model="newEmployee.designation_id"
              :options="designationOptions"
              label="Designation"
              emit-value
              map-options
              :rules="[(val) => !!val || 'Required']"
            />
            <q-select
              dark
              outlined
              v-model="newEmployee.employment_type"
              :options="['full_time', 'part_time', 'contract', 'casual']"
              label="Employment Type"
            />
            <q-input dark outlined v-model="newEmployee.hire_date" label="Hire Date" type="date" />

            <div class="row reverse q-mt-md">
              <q-btn
                color="primary"
                label="Save Employee"
                icon="save"
                type="submit"
                :loading="saving"
              />
              <q-btn flat label="Cancel" v-close-popup class="q-mr-sm" />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Run Payroll Dialog -->
    <q-dialog v-model="showPayrollDialog" persistent>
      <q-card class="bg-grey-9 text-white" style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Run Payroll</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input dark outlined v-model="payrollPeriod.start" label="Period Start" type="date" />
          <q-input dark outlined v-model="payrollPeriod.end" label="Period End" type="date" />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Start Processing" icon="play_arrow" @click="startPayroll" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import PageHeader from 'components/common/PageHeader.vue'
import StatCard from 'components/common/StatCard.vue'
import EmployeesTab from 'components/hr/EmployeesTab.vue'
import DepartmentsTab from 'components/hr/DepartmentsTab.vue'
import ShiftsTab from 'components/hr/ShiftsTab.vue'
import AttendanceTab from 'components/hr/AttendanceTab.vue'
import LeaveTab from 'components/hr/LeaveTab.vue'
import PayrollTab from 'components/hr/PayrollTab.vue'
import LoansTab from 'components/hr/LoansTab.vue'

const $q = useQuasar()
const authStore = useAuthStore()

const isHR = computed(() => authStore.hasAnyRole(['admin', 'hr']))
const isManager = computed(() => authStore.hasRole('manager'))

const availableTabs = computed(() => {
  if (isHR.value) {
    return [
      { name: 'employees', label: 'Employees', icon: 'people' },
      { name: 'departments', label: 'Departments', icon: 'business' },
      { name: 'shifts', label: 'Shifts', icon: 'schedule' },
      { name: 'attendance', label: 'Attendance', icon: 'fingerprint' },
      { name: 'leave', label: 'Leave', icon: 'event_busy' },
      { name: 'payroll', label: 'Payroll', icon: 'payments' },
      { name: 'loans', label: 'Loans', icon: 'account_balance_wallet' },
    ]
  } else if (isManager.value) {
    return [
      { name: 'attendance', label: 'Attendance', icon: 'fingerprint' },
      { name: 'leave', label: 'Leave', icon: 'event_busy' },
      { name: 'payroll', label: 'Payroll', icon: 'payments' },
    ]
  } else {
    // Employee
    return [
      { name: 'leave', label: 'Leave', icon: 'event_busy' },
      { name: 'payroll', label: 'Payroll', icon: 'payments' },
    ]
  }
})

const tab = ref(availableTabs.value[0]?.name || 'employees')

watch(
  availableTabs,
  (tabs) => {
    if (!tabs.find((t) => t.name === tab.value)) {
      tab.value = tabs[0]?.name || ''
    }
  },
  { immediate: true },
)
const showAddEmployee = ref(false)
const showPayrollDialog = ref(false)
const saving = ref(false)
const employeesTabRef = ref(null)

const stats = reactive({
  totalEmployees: 0,
  presentToday: 0,
  onLeave: 0,
  pendingApprovals: 0,
})

const newEmployee = reactive({
  first_name: '',
  last_name: '',
  employee_code: '',
  email: '',
  phone: '',
  department_id: null,
  designation_id: null,
  employment_type: 'full_time',
  hire_date: new Date().toISOString().split('T')[0],
})

const payrollPeriod = reactive({
  start: '',
  end: '',
})

const departmentOptions = ref([])
const designationOptions = ref([])

async function loadStats() {
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const { count: empCount } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('is_active', true)

    const today = new Date().toISOString().split('T')[0]

    const { count: presentCount } = await supabase
      .from('attendance_records')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('attendance_date', today)
      .eq('status', 'present')

    const { count: leaveCount } = await supabase
      .from('leave_requests')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today)

    const { count: pendingCount } = await supabase
      .from('leave_requests')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('status', 'pending')

    stats.totalEmployees = empCount || 0
    stats.presentToday = presentCount || 0
    stats.onLeave = leaveCount || 0
    stats.pendingApprovals = pendingCount || 0
  } catch (err) {
    console.error('Failed to load HR stats:', err)
  }
}

async function loadOptions() {
  try {
    const { data: depts, error: deptError } = await supabase
      .from('departments')
      .select('id, name')
      .eq('is_active', true)
      .order('name')

    if (deptError) throw deptError
    departmentOptions.value = (depts || []).map((d) => ({ label: d.name, value: d.id }))

    const { data: desigs, error: desigError } = await supabase
      .from('designations')
      .select('id, title')
      .eq('is_active', true)
      .order('title')

    if (desigError) throw desigError
    designationOptions.value = (desigs || []).map((d) => ({ label: d.title, value: d.id }))
  } catch (err) {
    console.error('Failed to load options:', err)
  }
}

async function saveEmployee() {
  saving.value = true
  try {
    const { error } = await supabase.from('employees').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      ...newEmployee,
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Employee added successfully' })
    showAddEmployee.value = false
    loadStats()
    employeesTabRef.value?.loadEmployees()

    // Reset form
    Object.assign(newEmployee, {
      first_name: '',
      last_name: '',
      employee_code: '',
      email: '',
      phone: '',
      department_id: null,
      designation_id: null,
      employment_type: 'full_time',
      hire_date: new Date().toISOString().split('T')[0],
    })
  } catch (err) {
    if (err.code === '23505') {
      $q.notify({ type: 'warning', message: 'Employee code already exists' })
    } else {
      $q.notify({ type: 'negative', message: err.message })
    }
  } finally {
    saving.value = false
  }
}

async function startPayroll() {
  if (!payrollPeriod.start || !payrollPeriod.end) {
    $q.notify({ type: 'warning', message: 'Please select start and end dates' })
    return
  }

  $q.loading.show({ message: 'Generating Payroll...' })
  try {
    const { error } = await supabase.rpc('generate_payroll', {
      p_company_id: authStore.currentBranch?.company_id,
      p_branch_id: authStore.currentBranch?.id,
      p_period_start: payrollPeriod.start,
      p_period_end: payrollPeriod.end,
      p_processed_by: authStore.user?.id,
    })

    if (error) throw error

    $q.notify({ type: 'positive', message: 'Payroll generated successfully' })
    showPayrollDialog.value = false
    loadStats()

    // Refresh payroll runs if we are on that tab?
    // Ideally we emit an event or call a method on the tab ref, but simpler to just let the user see it updated next time they click.
    // Or we can try to force update if we had a ref.
    // Let's just notify for now.
  } catch (err) {
    console.error('Payroll generation failed:', err)
    $q.notify({ type: 'negative', message: 'Failed to generate payroll: ' + err.message })
  } finally {
    $q.loading.hide()
  }
}

onMounted(() => {
  loadStats()
  loadOptions()
})
</script>
