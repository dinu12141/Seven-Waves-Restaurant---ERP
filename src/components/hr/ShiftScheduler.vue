<template>
  <div class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md justify-between">
      <div class="row items-center">
        <div class="text-h6 q-mr-md">Shift Scheduler</div>
        <q-btn-group outline>
          <q-btn
            :outline="viewMode !== 'day'"
            :color="viewMode === 'day' ? 'primary' : 'grey'"
            label="Day"
            @click="viewMode = 'day'"
          />
          <q-btn
            :outline="viewMode !== 'week'"
            :color="viewMode === 'week' ? 'primary' : 'grey'"
            label="Week"
            @click="viewMode = 'week'"
          />
        </q-btn-group>
      </div>

      <div class="row items-center">
        <q-btn flat round icon="chevron_left" @click="changeDate(-1)" />
        <div class="text-subtitle1 q-mx-sm" style="min-width: 150px; text-align: center">
          {{ dateLabel }}
        </div>
        <q-btn flat round icon="chevron_right" @click="changeDate(1)" />
        <q-btn
          outline
          color="primary"
          icon="today"
          label="Today"
          @click="resetDate"
          class="q-ml-sm"
        />
      </div>
    </div>

    <!-- Day View -->
    <q-card v-if="viewMode === 'day'" class="bg-grey-9 text-white" flat bordered>
      <q-card-section class="q-pa-none">
        <q-list separator dark>
          <q-item v-for="emp in employees" :key="emp.id" class="q-py-md">
            <q-item-section avatar>
              <q-avatar color="primary" text-color="white">
                {{ emp.first_name?.charAt(0) }}{{ emp.last_name?.charAt(0) }}
              </q-avatar>
            </q-item-section>

            <q-item-section>
              <q-item-label class="text-weight-bold">{{ emp.full_name }}</q-item-label>
              <q-item-label caption class="text-grey-5">{{
                emp.designations?.title || 'No Designation'
              }}</q-item-label>
              <q-chip
                v-if="isEmployeeOnLeave(emp.id, selectedDate)"
                color="orange"
                text-color="white"
                icon="event_busy"
                label="On Leave"
                size="sm"
                class="q-mt-xs"
              />
            </q-item-section>

            <q-item-section side style="min-width: 250px">
              <q-select
                dark
                dense
                outlined
                v-model="assignments[emp.id][selectedDate]"
                :options="shiftOptions"
                label="Assign Shift"
                emit-value
                map-options
                clearable
                :disable="isEmployeeOnLeave(emp.id, selectedDate)"
                @update:model-value="(val) => updateAssignment(emp.id, selectedDate, val)"
              >
                <template v-slot:option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section>
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                      <q-item-label caption>{{ scope.opt.time }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
              <!-- Shortcut for repeating -->
              <div class="row justify-end q-mt-xs">
                <q-btn
                  flat
                  dense
                  size="sm"
                  color="primary"
                  label="Repeat Options"
                  @click="openRepeatDialog(emp, selectedDate)"
                  v-if="assignments[emp.id][selectedDate]"
                />
              </div>
            </q-item-section>
          </q-item>
          <div v-if="employees.length === 0" class="text-center q-pa-lg text-grey">
            No active employees found.
          </div>
        </q-list>
      </q-card-section>
    </q-card>

    <!-- Week View -->
    <q-card v-else class="bg-grey-9 text-white overflow-auto" flat bordered>
      <q-markup-table dark separator="cell" flat>
        <thead>
          <tr>
            <th class="text-left" style="min-width: 150px">Employee</th>
            <th
              v-for="day in weekDates"
              :key="day.date"
              class="text-center"
              :class="{ 'bg-primary text-white': day.isToday }"
            >
              <div>{{ day.dayName }}</div>
              <div class="text-caption">{{ day.dateFormatted }}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="emp in employees" :key="emp.id">
            <td class="text-left">
              <div class="text-weight-bold">{{ emp.full_name }}</div>
              <div class="text-caption text-grey-5">
                {{ emp.designations?.title || 'No Role' }}
              </div>
            </td>
            <td
              v-for="day in weekDates"
              :key="day.date"
              class="text-center cursor-pointer relative-position hover-cell"
              @click="openAssignmentDialog(emp, day.date)"
              :class="{
                'bg-grey-8':
                  !assignments[emp.id]?.[day.date] && !isEmployeeOnLeave(emp.id, day.date),
                'bg-orange-9': isEmployeeOnLeave(emp.id, day.date),
              }"
            >
              <template v-if="isEmployeeOnLeave(emp.id, day.date)">
                <div class="column items-center justify-center full-height">
                  <q-icon name="event_busy" size="sm" />
                  <div class="text-caption" style="font-size: 10px">On Leave</div>
                </div>
              </template>
              <template v-else-if="assignments[emp.id]?.[day.date]">
                <div
                  class="q-pa-xs rounded-borders"
                  :style="{
                    backgroundColor: getShiftColor(assignments[emp.id][day.date]),
                  }"
                >
                  <div class="text-weight-bold" style="font-size: 11px">
                    {{ getShiftName(assignments[emp.id][day.date]) }}
                  </div>
                  <div class="text-caption" style="font-size: 10px">
                    {{ getShiftTime(assignments[emp.id][day.date]) }}
                  </div>
                </div>
              </template>
              <template v-else>
                <q-icon name="add" color="grey-6" class="add-icon" />
              </template>
            </td>
          </tr>
        </tbody>
      </q-markup-table>
    </q-card>

    <!-- Assignment Dialog -->
    <q-dialog v-model="showDialog">
      <q-card class="bg-grey-9 text-white" style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Assign Shift</div>
          <div class="text-subtitle2">{{ dialogData.employeeName }} - {{ dialogData.date }}</div>
        </q-card-section>

        <q-card-section class="q-gutter-md">
          <div v-if="dialogData.isOnLeave" class="text-orange q-mb-md">
            <q-icon name="warning" class="q-mr-xs" />
            This employee is on scheduled leave for this date.
          </div>

          <q-select
            dark
            outlined
            v-model="dialogData.shiftId"
            :options="shiftOptions"
            label="Shift"
            emit-value
            map-options
            :disable="dialogData.isOnLeave"
            clearable
          >
            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                  <q-item-label caption>{{ scope.opt.time }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>

          <div v-if="!dialogData.isOnLeave">
            <q-checkbox dark v-model="dialogData.repeat" label="Repeat Weekly" />
            <div v-if="dialogData.repeat" class="q-pl-md q-pt-sm">
              <q-input
                dark
                outlined
                dense
                type="number"
                v-model.number="dialogData.repeatWeeks"
                label="For how many weeks?"
                min="1"
                max="12"
              />
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            v-if="!dialogData.isOnLeave"
            color="primary"
            label="Save"
            @click="saveDialogAssignment"
            :loading="saving"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Detailed Repeat Dialog (for Day View shortcut) -->
    <q-dialog v-model="showRepeatDialog">
      <q-card class="bg-grey-9 text-white" style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">Repeat Assignment</div>
          <div class="text-caption">Repeat this shift for future weeks</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input
            dark
            outlined
            dense
            type="number"
            v-model.number="repeatWeeksOnly"
            label="Number of weeks"
            min="1"
            max="12"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Apply" @click="applyRepeatOnly" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { useQuasar, date as qDate } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()

// State
const viewMode = ref('week') // 'day' | 'week'
const selectedDate = ref(new Date().toISOString().split('T')[0])
const employees = ref([])
const shifts = ref([])
const shiftOptions = ref([])
const assignments = ref({}) // Structure: { [empId]: { [date]: shiftId } }
const leaveRequests = ref({}) // Structure: { [empId]: [ {start, end} ] }
const saving = ref(false)

// Dialog State
const showDialog = ref(false)
const dialogData = reactive({
  employeeId: null,
  employeeName: '',
  date: '',
  shiftId: null,
  isOnLeave: false,
  repeat: false,
  repeatWeeks: 4,
})

const showRepeatDialog = ref(false)
const repeatWeeksOnly = ref(4)
const repeatTarget = reactive({ empId: null, date: null, shiftId: null })

// Computed
const dateLabel = computed(() => {
  if (viewMode.value === 'day') {
    return qDate.formatDate(selectedDate.value, 'dddd, MMMM D, YYYY')
  } else {
    // Week range
    const start = weekDates.value[0].date
    const end = weekDates.value[6].date
    return `${qDate.formatDate(start, 'MMM D')} - ${qDate.formatDate(end, 'MMM D, YYYY')}`
  }
})

const weekDates = computed(() => {
  const current = new Date(selectedDate.value)
  // Adjust to Monday
  const day = current.getDay()
  const diff = current.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  const monday = new Date(current.setDate(diff))

  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    days.push({
      date: dateStr,
      dayName: qDate.formatDate(d, 'ddd'),
      dateFormatted: qDate.formatDate(d, 'MMM D'),
      isToday: dateStr === new Date().toISOString().split('T')[0],
    })
  }
  return days
})

// Methods
function resetDate() {
  selectedDate.value = new Date().toISOString().split('T')[0]
}

function changeDate(amount) {
  const d = new Date(selectedDate.value)
  if (viewMode.value === 'day') {
    d.setDate(d.getDate() + amount)
  } else {
    d.setDate(d.getDate() + amount * 7)
  }
  selectedDate.value = d.toISOString().split('T')[0]
}

function getShiftName(shiftId) {
  const s = shifts.value.find((s) => s.id === shiftId)
  return s ? s.name : ''
}

function getShiftTime(shiftId) {
  const s = shifts.value.find((s) => s.id === shiftId)
  if (!s) return ''
  return `${s.start_time.slice(0, 5)} - ${s.end_time.slice(0, 5)}`
}

function getShiftColor(shiftId) {
  // Generate a consistent color based on char code or just cycle colors
  // For now simple logic based on known names or random
  const s = shifts.value.find((s) => s.id === shiftId)
  if (!s) return '#444'

  const name = s.name.toLowerCase()
  if (name.includes('morning')) return '#1976D2' // Blue
  if (name.includes('evening')) return '#F57C00' // Orange
  if (name.includes('night')) return '#7B1FA2' // Purple
  return '#4caf50' // Green default
}

function isEmployeeOnLeave(empId, dateStr) {
  const requests = leaveRequests.value[empId] || []
  return requests.some((req) => dateStr >= req.start_date && dateStr <= req.end_date)
}

function openAssignmentDialog(emp, dateStr) {
  dialogData.employeeId = emp.id
  dialogData.employeeName = emp.full_name
  dialogData.date = dateStr
  dialogData.shiftId = assignments.value[emp.id]?.[dateStr] || null
  dialogData.isOnLeave = isEmployeeOnLeave(emp.id, dateStr)
  dialogData.repeat = false
  dialogData.repeatWeeks = 4
  showDialog.value = true
}

function openRepeatDialog(emp, dateStr) {
  repeatTarget.empId = emp.id
  repeatTarget.date = dateStr
  repeatTarget.shiftId = assignments.value[emp.id]?.[dateStr]
  showRepeatDialog.value = true
}

async function applyRepeatOnly() {
  if (!repeatTarget.shiftId) return
  saving.value = true
  try {
    await updateAssignment(
      repeatTarget.empId,
      repeatTarget.date,
      repeatTarget.shiftId,
      true,
      repeatWeeksOnly.value,
    )
    showRepeatDialog.value = false
    $q.notify({ type: 'positive', message: 'Shift repeated successfully' })
  } catch (err) {
    console.error(err)
  } finally {
    saving.value = false
  }
}

async function saveDialogAssignment() {
  saving.value = true
  try {
    await updateAssignment(
      dialogData.employeeId,
      dialogData.date,
      dialogData.shiftId,
      dialogData.repeat,
      dialogData.repeatWeeks,
    )
    showDialog.value = false
    $q.notify({ type: 'positive', message: 'Assignment saved' })
  } finally {
    saving.value = false
  }
}

async function updateAssignment(empId, dateStr, shiftId, repeat = false, weeks = 1) {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  const payload = []

  if (!shiftId) {
    // Delete
    await supabase
      .from('shift_assignments')
      .delete()
      .eq('employee_id', empId)
      .eq('assignment_date', dateStr)

    if (assignments.value[empId]) delete assignments.value[empId][dateStr]
    return
  }

  // Current date
  payload.push({
    company_id: authStore.currentBranch?.company_id,
    branch_id: branchId,
    employee_id: empId,
    shift_id: shiftId,
    assignment_date: dateStr,
    status: 'scheduled',
  })

  // Repeats
  if (repeat && weeks > 0) {
    const baseDate = new Date(dateStr)
    for (let i = 1; i <= weeks; i++) {
      const nextDate = new Date(baseDate)
      nextDate.setDate(baseDate.getDate() + i * 7)
      payload.push({
        company_id: authStore.currentBranch?.company_id,
        branch_id: branchId,
        employee_id: empId,
        shift_id: shiftId,
        assignment_date: nextDate.toISOString().split('T')[0],
        status: 'scheduled',
      })
    }
  }

  const { error } = await supabase
    .from('shift_assignments')
    .upsert(payload, { onConflict: 'employee_id, assignment_date' })

  if (error) {
    $q.notify({ type: 'negative', message: error.message })
    throw error
  }

  // Update local state immediately for better UX
  if (!assignments.value[empId]) assignments.value[empId] = {}
  payload.forEach((p) => {
    // Only update if it's within current view roughly (optional optimization)
    assignments.value[empId][p.assignment_date] = shiftId
  })
}

async function loadData() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  // Load employees
  const { data: emps } = await supabase
    .from('employees')
    .select('id, first_name, last_name, full_name, designations(title)')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('first_name')
  employees.value = emps || []

  // Initialize assignments map structure
  const initialMap = {}
  employees.value.forEach((emp) => {
    initialMap[emp.id] = {}
  })
  assignments.value = initialMap

  // Load shift templates
  const { data: shiftTemplates } = await supabase
    .from('shifts')
    .select('id, name, start_time, end_time')
    .eq('branch_id', branchId)
    .eq('is_active', true)
  shifts.value = shiftTemplates || []

  shiftOptions.value = shifts.value.map((s) => ({
    label: s.name,
    value: s.id,
    time: `${s.start_time?.slice(0, 5)} - ${s.end_time?.slice(0, 5)}`,
  }))

  loadAssignments()
  loadLeaveRequests()
}

async function loadAssignments() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  // Determine date range to fetch
  let start, end
  if (viewMode.value === 'day') {
    start = selectedDate.value
    end = selectedDate.value
  } else {
    start = weekDates.value[0].date
    end = weekDates.value[6].date
  }

  const { data } = await supabase
    .from('shift_assignments')
    .select('employee_id, shift_id, assignment_date')
    .eq('branch_id', branchId)
    .gte('assignment_date', start)
    .lte('assignment_date', end)

  // Rebuild assignments map
  // Note: We don't clear everything, just update the range we fetched?
  // Actually simpler to clear or merge. Let's merge cautiously or just clear if logic permits.
  // Clearing is safer to avoid stale data if we switched weeks.
  // But we have `assignments[empId][date]` so we can just populate.
  // Init map for employees
  employees.value.forEach((e) => {
    if (!assignments.value[e.id]) assignments.value[e.id] = {}
  })

  // Clear current range in local state? No, let's just overwrite.
  if (data) {
    data.forEach((a) => {
      if (!assignments.value[a.employee_id]) assignments.value[a.employee_id] = {}
      assignments.value[a.employee_id][a.assignment_date] = a.shift_id
    })
  }
}

async function loadLeaveRequests() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  let start, end
  if (viewMode.value === 'day') {
    start = selectedDate.value
    end = selectedDate.value
  } else {
    start = weekDates.value[0].date
    end = weekDates.value[6].date
  }

  const { data } = await supabase
    .from('leave_requests')
    .select('employee_id, start_date, end_date')
    .eq('branch_id', branchId)
    .eq('status', 'approved')
    .lte('start_date', end)
    .gte('end_date', start) // Overlaps

  leaveRequests.value = {}
  if (data) {
    data.forEach((r) => {
      if (!leaveRequests.value[r.employee_id]) leaveRequests.value[r.employee_id] = []
      leaveRequests.value[r.employee_id].push(r)
    })
  }
}

watch([selectedDate, viewMode], () => {
  loadAssignments()
  loadLeaveRequests()
})

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.hover-cell:hover {
  background-color: rgba(255, 255, 255, 0.05);
}
.hover-cell:hover .add-icon {
  color: white !important;
  transform: scale(1.2);
}
</style>
