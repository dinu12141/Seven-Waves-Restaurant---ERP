<template>
  <q-page class="q-pa-md">
    <ERPToolbar moduleName="hr" title="Attendance" breadcrumbs="Human Resources / Attendance" />

    <div class="row items-end q-mb-md q-gutter-x-sm q-gutter-y-md">
      <div class="col-auto">
        <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Select Date</div>
        <q-input
          :dark="$q.dark.isActive"
          dense
          outlined
          v-model="filterDate"
          type="date"
          style="width: 150px"
          @update:model-value="loadAttendance"
        />
      </div>
      <div class="col-auto">
        <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Department</div>
        <q-select
          :dark="$q.dark.isActive"
          dense
          outlined
          v-model="filterDepartment"
          :options="departments"
          option-label="name"
          option-value="id"
          emit-value
          map-options
          clearable
          style="width: 180px"
          @update:model-value="loadAttendance"
        />
      </div>
      <div class="col-auto">
        <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Employee</div>
        <q-select
          :dark="$q.dark.isActive"
          dense
          outlined
          v-model="filterEmployee"
          :options="filteredEmployeesList"
          option-label="full_name"
          option-value="id"
          emit-value
          map-options
          clearable
          style="width: 220px"
          @update:model-value="loadAttendance"
        >
          <template v-slot:option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.full_name }}</q-item-label>
                <q-item-label caption>{{ scope.opt.employee_code }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
      </div>
      
      <div class="col-auto">
        <div class="row q-gutter-x-sm">
          <q-btn color="primary" icon="refresh" @click="loadAttendance" no-caps unelevated style="height: 40px;">
             <q-tooltip>Refresh</q-tooltip>
          </q-btn>
          <q-btn color="amber-8" text-color="dark" icon="add" label="Mark" @click="openMarkAttendance" no-caps unelevated style="height: 40px;" />
        </div>
      </div>
      <q-space />
      <div class="col-12 col-sm-3 col-md-2">
        <q-input
          :dark="$q.dark.isActive"
          dense
          outlined
          v-model="search"
          placeholder="Search Table..."
          clearable
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
    </div>

    <!-- KPI Row -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat 
          :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'rounded-borders']" 
          :style="{ border: $q.dark.isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }"
        >
          <q-card-section class="q-pa-md">
            <div :class="['text-caption', $q.dark.isActive ? 'text-grey-4' : 'text-grey-8']">Present</div>
            <div class="text-h5 text-weight-bold text-green">{{ stats.present }}</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat 
          :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'rounded-borders']" 
          :style="{ border: $q.dark.isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }"
        >
          <q-card-section class="q-pa-md">
            <div :class="['text-caption', $q.dark.isActive ? 'text-grey-4' : 'text-grey-8']">Absent</div>
            <div class="text-h5 text-weight-bold text-red">{{ stats.absent }}</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat 
          :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'rounded-borders']" 
          :style="{ border: $q.dark.isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }"
        >
          <q-card-section class="q-pa-md">
            <div :class="['text-caption', $q.dark.isActive ? 'text-grey-4' : 'text-grey-8']">Late</div>
            <div class="text-h5 text-weight-bold text-amber">{{ stats.late }}</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat 
          :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'rounded-borders']" 
          :style="{ border: $q.dark.isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }"
        >
          <q-card-section class="q-pa-md">
            <div :class="['text-caption', $q.dark.isActive ? 'text-grey-4' : 'text-grey-8']">On Leave</div>
            <div class="text-h5 text-weight-bold text-cyan">{{ stats.leave }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-table
      :dark="$q.dark.isActive"
      flat
      bordered
      :rows="records"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :filter="search"
      :pagination="{ rowsPerPage: 30 }"
      :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white']"
    >
      <template #body-cell-employee="props">
        <q-td :props="props">
          <div :class="['text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-dark']">{{ props.row.employees?.full_name }}</div>
          <div :class="['text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']">{{ props.row.employees?.employee_code }}</div>
        </q-td>
      </template>
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="attColor(props.row.status)"
            :label="props.row.status"
            class="text-capitalize"
          />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn flat round dense icon="edit" color="amber" size="sm" @click="editRecord(props.row)"
            ><q-tooltip>Edit</q-tooltip></q-btn
          >
        </q-td>
      </template>
    </q-table>

    <!-- Edit Dialog -->
    <q-dialog v-model="showEdit">
      <q-card style="min-width: 400px; padding: 0" :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'">
        <q-card-section class="row items-center q-pa-md" :style="{ borderBottom: $q.dark.isActive ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.1)' }">
          <div class="text-h6 text-weight-bold">Edit Attendance</div>
        </q-card-section>
        <q-card-section class="q-gutter-md q-pa-lg">
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Check In</div>
              <q-input :dark="$q.dark.isActive" dense outlined v-model="editForm.clock_in" mask="time">
                <template v-slot:append>
                  <q-icon name="access_time" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-time :dark="$q.dark.isActive" v-model="editForm.clock_in" format24h>
                        <div class="row items-center justify-end"><q-btn v-close-popup label="Close" color="primary" flat /></div>
                      </q-time>
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
            <div class="col-6">
              <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Check Out</div>
              <q-input :dark="$q.dark.isActive" dense outlined v-model="editForm.clock_out" mask="time">
                <template v-slot:append>
                  <q-icon name="access_time" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-time :dark="$q.dark.isActive" v-model="editForm.clock_out" format24h>
                        <div class="row items-center justify-end"><q-btn v-close-popup label="Close" color="primary" flat /></div>
                      </q-time>
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
          </div>
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Status</div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="editForm.status"
              :options="['present', 'absent', 'late', 'half_day', 'on_leave']"
            />
          </div>
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Late (Mins)</div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model.number="editForm.late_minutes"
                type="number"
              />
            </div>
            <div class="col-6">
              <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">OT Hours</div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model.number="editForm.overtime_hours"
                type="number"
              />
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey-6" no-caps />
          <q-btn
            color="primary"
            label="Update Attendance"
            unelevated
            icon="save"
            @click="saveEdit"
            :loading="saving"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <!-- Mark Dialog -->
    <q-dialog v-model="showMark">
      <q-card style="min-width: 400px; padding: 0" :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'">
        <q-card-section class="row items-center q-pa-md" :style="{ borderBottom: $q.dark.isActive ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.1)' }">
          <div class="text-h6 text-weight-bold">Mark Attendance</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup :color="$q.dark.isActive ? 'grey-4' : 'grey-8'" />
        </q-card-section>
        <q-card-section class="q-gutter-md q-pa-lg">
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Select Employee *</div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="markForm.employee_id"
              :options="employees"
              option-label="full_name"
              option-value="id"
              emit-value
              map-options
            >
              <template v-slot:option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section>
                    <q-item-label>{{ scope.opt.full_name }}</q-item-label>
                    <q-item-label caption>{{ scope.opt.employee_code }}</q-item-label>
                  </q-item-section>
                </q-item>
              </template>
            </q-select>
          </div>
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Date *</div>
            <q-input :dark="$q.dark.isActive" dense outlined v-model="markForm.attendance_date" type="date" />
          </div>
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Check In *</div>
              <q-input :dark="$q.dark.isActive" dense outlined v-model="markForm.clock_in" mask="time" :rules="[(v) => !!v || 'Required']">
                <template v-slot:append>
                  <q-icon name="access_time" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-time :dark="$q.dark.isActive" v-model="markForm.clock_in" format24h>
                        <div class="row items-center justify-end"><q-btn v-close-popup label="Close" color="primary" flat /></div>
                      </q-time>
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
            <div class="col-6">
              <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Check Out</div>
              <q-input :dark="$q.dark.isActive" dense outlined v-model="markForm.clock_out" mask="time">
                <template v-slot:append>
                  <q-icon name="access_time" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-time :dark="$q.dark.isActive" v-model="markForm.clock_out" format24h>
                        <div class="row items-center justify-end"><q-btn v-close-popup label="Close" color="primary" flat /></div>
                      </q-time>
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
          </div>
          <div class="row q-col-gutter-sm">
            <div class="col-4">
              <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Status *</div>
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="markForm.status"
                :options="['present', 'absent', 'late', 'half_day', 'on_leave']"
              />
            </div>
            <div class="col-4">
              <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">Late (Mins)</div>
              <q-input :dark="$q.dark.isActive" dense outlined v-model.number="markForm.late_minutes" type="number" />
            </div>
            <div class="col-4">
              <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">OT Hours</div>
              <q-input :dark="$q.dark.isActive" dense outlined v-model.number="markForm.overtime_hours" type="number" />
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey-6" no-caps />
          <q-btn
            color="amber-8"
            text-color="dark"
            label="Save Record"
            unelevated
            icon="save"
            @click="saveMarkAttendance"
            :loading="saving"
            no-caps
          />
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
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const records = ref([])
const search = ref('')
const filterDate = ref(new Date().toISOString().split('T')[0])
const filterDepartment = ref(null)
const filterEmployee = ref(null)

const departments = ref([])

// Employees list for marking attendance
const employees = ref([])
const filteredEmployeesList = computed(() => {
  if (!filterDepartment.value) return employees.value
  return employees.value.filter(e => e.department_id === filterDepartment.value)
})

// Edit Dialog
const showEdit = ref(false)
const editForm = reactive({
  id: null,
  employee_id: null,
  clock_in: '',
  clock_out: '',
  date: '',
  status: 'present',
  late_minutes: 0,
  overtime_hours: 0,
})

// Mark Dialog
const showMark = ref(false)
const markForm = reactive({
  employee_id: null,
  attendance_date: '',
  clock_in: '',
  clock_out: '',
  status: 'present',
  late_minutes: 0,
  overtime_hours: 0,
})

const stats = reactive({ present: 0, absent: 0, late: 0, leave: 0 })

const columns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (r) => r.employees?.full_name,
    sortable: true,
  },
  { name: 'date', label: 'Date', align: 'left', field: 'attendance_date', sortable: true },
  { name: 'checkin', label: 'Check In', align: 'center', field: 'clock_in', format: (v) => v ? new Date(v).toLocaleTimeString([], {timeStyle: 'short'}) : '—' },
  { name: 'checkout', label: 'Check Out', align: 'center', field: 'clock_out', format: (v) => v ? new Date(v).toLocaleTimeString([], {timeStyle: 'short'}) : '—' },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'late', label: 'Late Mins', align: 'center', field: 'late_minutes' },
  { name: 'ot', label: 'OT Hrs', align: 'center', field: 'overtime_hours' },
  { name: 'actions', label: '', align: 'center' },
]

function attColor(s) {
  return (
    { present: 'green', absent: 'red', late: 'amber-8', half_day: 'orange', on_leave: 'cyan' }[s] ||
    'grey'
  )
}

async function loadAttendance() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    
    let query = supabase
      .from('attendance_records')
      .select('*, employees!inner(full_name, employee_code, department_id)')
      .eq('branch_id', branchId)

    if (filterDate.value) {
      query = query.eq('attendance_date', filterDate.value)
    }
    if (filterDepartment.value) {
      query = query.eq('employees.department_id', filterDepartment.value)
    }
    if (filterEmployee.value) {
      query = query.eq('employee_id', filterEmployee.value)
    }

    const { data, error } = await query.order('clock_in', { ascending: true })
    if (error) throw error

    records.value = data || []
    stats.present = records.value.filter((r) => r.status === 'present').length
    stats.absent = records.value.filter((r) => r.status === 'absent').length
    stats.late = records.value.filter((r) => r.status === 'late').length
    stats.leave = records.value.filter((r) => r.status === 'on_leave').length
  } catch (err) {
    console.error('Failed to load attendance:', err.message)
    $q.notify({ type: 'negative', message: 'Failed to load attendance records' })
  } finally {
    loading.value = false
  }
}

function formatTimeToTimestamp (dateStr, timeStr) {
  if (!timeStr) return null
  return `${dateStr}T${timeStr}:00`
}

function extractTime(timestampInfo) {
  if (!timestampInfo) return ''
  const d = new Date(timestampInfo)
  return d.toTimeString().slice(0, 5)
}

async function calculateMetricsForForm(formRef, inTime, outTime, empId, attDate) {
  if (!empId || !attDate) return
  try {
    const { data: shiftData } = await supabase
      .from('shift_assignments')
      .select('shifts(start_time, end_time, grace_minutes, break_duration_minutes, is_overnight)')
      .eq('employee_id', empId)
      .eq('assignment_date', attDate)
      .maybeSingle()

    const actualStart = inTime ? new Date(`${attDate}T${inTime}`) : null
    const shift = shiftData?.shifts

    // 1. Calculate Late Minutes
    if (shift && actualStart) {
      const shiftStart = new Date(`${attDate}T${shift.start_time}`)
      const graceMinutes = shift.grace_minutes || 10
      const graceTime = new Date(shiftStart.getTime() + graceMinutes * 60000)
      if (actualStart > graceTime) {
        formRef.late_minutes = Math.round((actualStart - shiftStart) / 60000)
        if (formRef.late_minutes > 0) formRef.status = 'late'
      } else {
        formRef.late_minutes = 0
        formRef.status = 'present'
      }
    } else {
      formRef.late_minutes = 0
    }

    // 2. Calculate OT Hours
    if (inTime && outTime) {
      const start = new Date(`${attDate}T${inTime}`)
      let end = new Date(`${attDate}T${outTime}`)
      if (end < start) end.setDate(end.getDate() + 1)
      const totalHours = (end - start) / 3600000

      if (shift) {
        const shiftStart = new Date(`${attDate}T${shift.start_time}`)
        let shiftEnd = new Date(`${attDate}T${shift.end_time}`)
        if (shift.is_overnight || shiftEnd < shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1)
        const shiftHours = (shiftEnd - shiftStart) / 3600000
        const breakHours = (shift.break_duration_minutes || 0) / 60
        const expectedWorkHours = shiftHours - breakHours
        if (totalHours > expectedWorkHours) {
          formRef.overtime_hours = parseFloat((totalHours - expectedWorkHours).toFixed(2))
        } else {
          formRef.overtime_hours = 0
        }
      } else {
        // No shift? OT could be zero or entire time depending on policy. Usually 0 if standard shift unknown.
        formRef.overtime_hours = 0
      }
    } else {
      formRef.overtime_hours = 0
    }
  } catch (err) {
    console.error('Failed calculating metrics:', err)
  }
}

watch([() => markForm.clock_in, () => markForm.clock_out, () => markForm.employee_id, () => markForm.attendance_date], 
  ([inTime, outTime, empId, attDate]) => {
    calculateMetricsForForm(markForm, inTime, outTime, empId, attDate)
})

watch([() => editForm.clock_in, () => editForm.clock_out], 
  ([inTime, outTime]) => {
    calculateMetricsForForm(editForm, inTime, outTime, editForm.employee_id, editForm.date)
})

function editRecord(row) {
  editForm.id = row.id
  editForm.employee_id = row.employee_id
  editForm.date = row.attendance_date
  editForm.clock_in = extractTime(row.clock_in)
  editForm.clock_out = extractTime(row.clock_out)
  editForm.status = row.status
  editForm.late_minutes = row.late_minutes || 0
  editForm.overtime_hours = row.overtime_hours || 0
  showEdit.value = true
}

async function saveEdit() {
  saving.value = true
  try {
    const payload = {
      status: editForm.status,
      late_minutes: editForm.late_minutes,
      overtime_hours: editForm.overtime_hours,
    }
    if (editForm.clock_in) payload.clock_in = formatTimeToTimestamp(editForm.date, editForm.clock_in)
    if (editForm.clock_out) payload.clock_out = formatTimeToTimestamp(editForm.date, editForm.clock_out)

    const { error } = await supabase
      .from('attendance_records')
      .update(payload)
      .eq('id', editForm.id)
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Attendance updated' })
    showEdit.value = false
    loadAttendance()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

async function loadEmployees() {
  const companyId = authStore.currentBranch?.company_id
  if (!companyId) return
  try {
    const { data } = await supabase
      .from('employees')
      .select('id, full_name, employee_code, department_id')
      .eq('company_id', companyId)
      .order('full_name')
    employees.value = data || []
  } catch (e) {
    console.error('Failed to load employees', e)
  }
}

function openMarkAttendance() {
  Object.assign(markForm, {
    employee_id: null,
    attendance_date: filterDate.value,
    clock_in: '',
    clock_out: '',
    status: 'present',
    late_minutes: 0,
    overtime_hours: 0,
  })
  showMark.value = true
}

async function saveMarkAttendance() {
  if (!markForm.employee_id) {
    $q.notify({ type: 'warning', message: 'Please select an employee' })
    return
  }
  if (!markForm.attendance_date) {
    $q.notify({ type: 'warning', message: 'Date is required' })
    return
  }
  saving.value = true
  try {
    const payload = {
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      employee_id: markForm.employee_id,
      attendance_date: markForm.attendance_date,
      clock_in: formatTimeToTimestamp(markForm.attendance_date, markForm.clock_in),
      clock_out: formatTimeToTimestamp(markForm.attendance_date, markForm.clock_out),
      status: markForm.status,
      late_minutes: markForm.late_minutes || 0,
      overtime_hours: markForm.overtime_hours || 0,
    }

    const { error } = await supabase.from('attendance_records').insert(payload)
    if (error) throw error

    $q.notify({ type: 'positive', message: 'Attendance successfully marked!' })
    showMark.value = false
    
    // Automatically load data if they marked attendance for the currently viewed date
    if (markForm.attendance_date === filterDate.value) {
      loadAttendance()
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

async function loadDepartments() {
  const companyId = authStore.currentBranch?.company_id
  if (!companyId) return
  try {
    const { data } = await supabase
      .from('departments')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name')
    departments.value = data || []
  } catch (e) {
    console.error('Failed to load departments', e)
  }
}

onMounted(() => {
  loadDepartments()
  loadEmployees()
  loadAttendance()
})
</script>

<style scoped>
/* Scoped styles removed in favor of dynamic Vue theme bindings */
</style>
