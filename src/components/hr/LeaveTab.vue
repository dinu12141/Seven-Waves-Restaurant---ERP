<template>
  <div class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h6">Leave Management</div>
      <q-btn color="primary" icon="add" label="Apply Leave" @click="showApplyLeave = true" />
      <q-space />
      <q-select
        dark
        dense
        outlined
        v-model="statusFilter"
        :options="['All', 'Pending', 'Approved', 'Rejected', 'Cancelled']"
        label="Status"
        style="width: 150px"
      />
    </div>

    <!-- Leave Requests Table -->
    <q-table
      dark
      flat
      bordered
      :rows="leaveRequests"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 15 }"
      class="bg-grey-9"
    >
      <template v-slot:body-cell-employee="props">
        <q-td :props="props">
          <div class="text-weight-bold">{{ props.row.employees?.full_name || '-' }}</div>
        </q-td>
      </template>

      <template v-slot:body-cell-leave_type="props">
        <q-td :props="props">
          <q-badge color="indigo" :label="props.row.leave_types?.name || '-'" />
        </q-td>
      </template>

      <template v-slot:body-cell-dates="props">
        <q-td :props="props">
          <div>{{ props.row.start_date }} -> {{ props.row.end_date }}</div>
          <div class="text-caption text-grey-5">{{ props.row.total_days }} day(s)</div>
        </q-td>
      </template>

      <template v-slot:body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="leaveStatusColor(props.row.status)"
            :label="props.row.status"
            class="text-capitalize"
          />
        </q-td>
      </template>

      <template v-slot:body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <template v-if="props.row.status === 'pending' && isHR">
            <q-btn
              flat
              dense
              round
              icon="check"
              color="green"
              size="sm"
              @click="updateLeaveStatus(props.row.id, 'approved')"
            >
              <q-tooltip>Approve</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              round
              icon="close"
              color="red"
              size="sm"
              @click="updateLeaveStatus(props.row.id, 'rejected')"
            >
              <q-tooltip>Reject</q-tooltip>
            </q-btn>
          </template>
          <span v-else class="text-grey-5 text-caption text-capitalize">{{
            props.row.status
          }}</span>
        </q-td>
      </template>
    </q-table>

    <!-- Leave Types -->
    <div class="text-h6 q-mt-lg q-mb-md">Leave Types</div>
    <div class="row q-col-gutter-md">
      <div v-for="lt in leaveTypes" :key="lt.id" class="col-12 col-sm-6 col-md-4 col-lg-3">
        <q-card class="bg-grey-9 text-white" flat bordered>
          <q-card-section>
            <div class="row items-center q-mb-sm">
              <q-icon
                name="event"
                size="24px"
                :color="lt.is_paid ? 'green' : 'orange'"
                class="q-mr-sm"
              />
              <div class="text-subtitle1 text-weight-bold">{{ lt.name }}</div>
            </div>
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <div class="text-caption text-grey-5">Quota</div>
                <div class="text-weight-bold">{{ lt.default_quota }} days / year</div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-5">Type</div>
                <q-badge
                  :color="lt.is_paid ? 'green' : 'orange'"
                  :label="lt.is_paid ? 'Paid' : 'Unpaid'"
                />
              </div>
              <div class="col-12" v-if="lt.carry_forward">
                <q-badge color="blue" label="Carry Forward" />
                <span class="text-caption text-grey-5 q-ml-xs"
                  >max {{ lt.max_carry_forward }} days</span
                >
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </div>

  <!-- Apply Leave Dialog -->
  <q-dialog v-model="showApplyLeave">
    <q-card class="bg-grey-9 text-white" style="min-width: 500px">
      <q-card-section>
        <div class="text-h6">Apply for Leave</div>
      </q-card-section>

      <q-card-section class="q-gutter-md">
        <q-select
          dark
          outlined
          v-model="newLeaveRequest.employee_id"
          :options="employeeOptions"
          label="Employee"
          emit-value
          map-options
          :rules="[(val) => !!val || 'Required']"
          :disable="!isHR"
          :readonly="!isHR"
        />
        <q-select
          dark
          outlined
          v-model="newLeaveRequest.leave_type_id"
          :options="leaveTypeOptions"
          label="Leave Type"
          emit-value
          map-options
          :rules="[(val) => !!val || 'Required']"
        />
        <div class="row q-col-gutter-md">
          <div class="col-6">
            <q-input
              dark
              outlined
              v-model="newLeaveRequest.start_date"
              type="date"
              label="Start Date"
            />
          </div>
          <div class="col-6">
            <q-input
              dark
              outlined
              v-model="newLeaveRequest.end_date"
              type="date"
              label="End Date"
            />
          </div>
        </div>
        <q-input
          dark
          outlined
          v-model="newLeaveRequest.reason"
          label="Reason"
          type="textarea"
          rows="3"
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn
          color="primary"
          label="Submit Request"
          @click="submitLeaveRequest"
          :loading="submitting"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()
const isHR = computed(() => authStore.hasAnyRole(['admin', 'hr']))
const loading = ref(false)
const submitting = ref(false)
const showApplyLeave = ref(false)
const leaveRequests = ref([])
const leaveTypes = ref([])
const employeeOptions = ref([])
const leaveTypeOptions = ref([])
const statusFilter = ref('All')

const newLeaveRequest = ref({
  employee_id: null,
  leave_type_id: null,
  start_date: '',
  end_date: '',
  reason: '',
})

const columns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (row) => row.employees?.full_name,
    sortable: true,
  },
  { name: 'leave_type', label: 'Leave Type', align: 'left', field: (row) => row.leave_types?.name },
  { name: 'dates', label: 'Period', align: 'left', field: 'start_date' },
  { name: 'status', label: 'Status', align: 'center', field: 'status', sortable: true },
  { name: 'reason', label: 'Reason', align: 'left', field: 'reason' },
  { name: 'actions', label: 'Actions', align: 'center', field: 'actions' },
]

function leaveStatusColor(status) {
  const map = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'grey' }
  return map[status] || 'grey'
}

async function loadData() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    let query = supabase
      .from('leave_requests')
      .select('*, employees(full_name), leave_types(name)')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })

    if (statusFilter.value !== 'All') {
      query = query.eq('status', statusFilter.value.toLowerCase())
    }

    const { data, error } = await query
    if (error) throw error
    leaveRequests.value = data || []

    const companyId = authStore.currentBranch?.company_id
    const { data: types } = await supabase
      .from('leave_types')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    leaveTypes.value = types || []

    leaveTypeOptions.value = (types || []).map((t) => ({ label: t.name, value: t.id }))

    // Load Employees for dropdown
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

    if (!isHR.value) {
      const { data: myEmp } = await supabase
        .from('employees')
        .select('id')
        .eq('profile_id', authStore.user?.id)
        .single()

      if (myEmp) {
        leaveRequests.value = leaveRequests.value.filter((r) => r.employee_id === myEmp.id)
        newLeaveRequest.value.employee_id = myEmp.id
      }
    }
  } catch (err) {
    console.error('Failed to load leave data:', err)
  } finally {
    loading.value = false
  }
}

async function submitLeaveRequest() {
  if (
    !newLeaveRequest.value.employee_id ||
    !newLeaveRequest.value.leave_type_id ||
    !newLeaveRequest.value.start_date ||
    !newLeaveRequest.value.end_date
  ) {
    $q.notify({ type: 'warning', message: 'Please fill all required fields' })
    return
  }

  submitting.value = true
  try {
    const start = new Date(newLeaveRequest.value.start_date)
    const end = new Date(newLeaveRequest.value.end_date)
    const diffTime = Math.abs(end - start)
    const total_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1

    const { error } = await supabase.from('leave_requests').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      employee_id: newLeaveRequest.value.employee_id,
      leave_type_id: newLeaveRequest.value.leave_type_id,
      start_date: newLeaveRequest.value.start_date,
      end_date: newLeaveRequest.value.end_date,
      total_days: total_days,
      reason: newLeaveRequest.value.reason,
      status: 'pending',
    })

    if (error) throw error

    $q.notify({ type: 'positive', message: 'Leave request submitted successfully' })
    showApplyLeave.value = false
    loadData()

    newLeaveRequest.value = {
      employee_id: null,
      leave_type_id: null,
      start_date: '',
      end_date: '',
      reason: '',
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to submit request: ' + err.message })
  } finally {
    submitting.value = false
  }
}

async function updateLeaveStatus(id, status) {
  try {
    if (status === 'approved') {
      const { error } = await supabase.rpc('approve_leave_request', {
        p_request_id: id,
        p_approved_by: authStore.user?.id,
      })
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status, approved_by: authStore.user?.id, approved_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    }

    $q.notify({ type: 'positive', message: `Leave request ${status}` })
    loadData()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  }
}

watch(statusFilter, () => loadData())
onMounted(() => loadData())
</script>
