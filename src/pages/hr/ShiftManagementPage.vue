<template>
  <q-page class="q-pa-md">
    <!-- Sub-tabs: Shift Types vs Assignments -->
    <div class="row q-mb-md q-gutter-sm items-center">
      <q-btn-toggle
        v-model="viewMode"
        toggle-color="primary"
        text-color="grey-7"
        no-caps
        dense
        size="sm"
        class="shift-toggle"
        :options="[
          { label: 'Shift Definitions', value: 'definitions', icon: 'schedule' },
          { label: 'Employee Assignments', value: 'assignments', icon: 'calendar_month' },
        ]"
      />
      <q-space />
      <q-btn
        v-if="viewMode === 'definitions'"
        color="primary"
        icon="add"
        label="New Shift"
        no-caps
        dense
        size="sm"
        unelevated
        @click="openShiftDialog()"
      />
      <q-btn
        v-if="viewMode === 'assignments'"
        color="primary"
        icon="person_add"
        label="Assign Shift"
        no-caps
        dense
        size="sm"
        unelevated
        @click="openAssignDialog()"
      />
    </div>

    <!-- ─── SHIFT DEFINITIONS VIEW ─── -->
    <div v-if="viewMode === 'definitions'">
      <div class="row q-col-gutter-sm">
        <div v-for="shift in shifts" :key="shift.id" class="col-12 col-sm-6 col-md-4 col-lg-3">
          <q-card flat class="shift-card">
            <!-- Color bar based on shift type -->
            <div :class="`shift-bar shift-${getShiftType(shift)}`"></div>
            <q-card-section class="q-py-sm q-px-md">
              <div class="row items-center no-wrap">
                <div class="col">
                  <div class="text-weight-bold shift-name">{{ shift.name }}</div>
                  <div class="text-caption shift-type-label" style="font-size: 10px;">
                    {{ getShiftType(shift).toUpperCase() }} SHIFT
                  </div>
                </div>
                <q-badge :color="shift.is_active ? 'positive' : 'grey-7'" class="q-ml-sm" style="font-size: 9px;">
                  {{ shift.is_active ? 'Active' : 'Inactive' }}
                </q-badge>
              </div>
            </q-card-section>

            <q-card-section class="q-pt-none q-pb-xs q-px-md">
              <div class="row q-col-gutter-xs">
                <div class="col-6">
                  <div class="shift-time-block">
                    <q-icon name="login" size="12px" class="text-green q-mr-xs" />
                    <span class="text-caption shift-time-label" style="font-size: 10px;">Start</span>
                    <div class="text-weight-bold shift-time-value" style="font-size: 12px;">
                      {{ formatTime(shift.start_time) }}
                    </div>
                  </div>
                </div>
                <div class="col-6">
                  <div class="shift-time-block">
                    <q-icon name="logout" size="12px" class="text-red q-mr-xs" />
                    <span class="text-caption shift-time-label" style="font-size: 10px;">End</span>
                    <div class="text-weight-bold shift-time-value" style="font-size: 12px;">
                      {{ formatTime(shift.end_time) }}
                      <q-badge
                        v-if="shift.is_overnight"
                        color="purple"
                        dense
                        class="q-ml-xs"
                        label="+1"
                        style="font-size: 9px;"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div class="row q-mt-xs q-col-gutter-xs shift-meta-text" style="font-size: 10px;">
                <div class="col-auto">
                  <q-icon name="coffee" size="10px" class="q-mr-xs" />
                  {{ shift.break_duration_minutes }}min break
                </div>
                <div class="col-auto">
                  <q-icon name="timer" size="10px" class="q-mr-xs" />
                  {{ calculateHours(shift) }}hrs
                </div>
              </div>
            </q-card-section>

            <q-separator />
            <q-card-actions class="q-px-sm q-py-xs">
              <q-btn
                flat
                dense
                no-caps
                color="amber"
                icon="edit"
                label="Edit"
                size="xs"
                @click="openShiftDialog(shift)"
              />
              <q-space />
              <q-btn
                flat
                dense
                no-caps
                :color="shift.is_active ? 'negative' : 'positive'"
                :icon="shift.is_active ? 'block' : 'check_circle'"
                :label="shift.is_active ? 'Deactivate' : 'Activate'"
                size="xs"
                @click="toggleShiftActive(shift)"
              />
            </q-card-actions>
          </q-card>
        </div>

        <div
          v-if="shifts.length === 0 && !loadingShifts"
          class="col-12 text-center q-pa-xl text-grey-6"
        >
          <q-icon name="schedule" size="48px" class="q-mb-md" />
          <div>No shifts defined yet. Click <strong>New Shift</strong> to create one.</div>
        </div>
        <div v-if="loadingShifts" class="col-12 text-center q-pa-xl">
          <q-spinner-dots color="primary" size="40px" />
        </div>
      </div>
    </div>

    <!-- ─── EMPLOYEE ASSIGNMENTS VIEW ─── -->
    <div v-if="viewMode === 'assignments'">
      <!-- Filters -->
      <div class="row q-mb-md q-gutter-sm items-end">
        <!-- Date filters -->
        <q-input
          dense
          outlined
          v-model="assignFilter.dateFrom"
          type="date"
          label="From Date"
          style="width: 155px"
        />
        <q-input
          dense
          outlined
          v-model="assignFilter.dateTo"
          type="date"
          label="To Date"
          style="width: 155px"
        />
        <!-- Shift filter -->
        <q-select
          dense
          outlined
          v-model="assignFilter.shiftId"
          :options="shiftOptions"
          option-label="name"
          option-value="id"
          emit-value
          map-options
          label="Filter by Shift"
          clearable
          style="width: 190px"
        >
          <template #prepend><q-icon name="schedule" size="18px" /></template>
        </q-select>
        <!-- Employee filter -->
        <q-select
          dense
          outlined
          v-model="assignFilter.employeeId"
          :options="employeeOptions"
          option-label="full_name"
          option-value="id"
          emit-value
          map-options
          label="Filter by Employee"
          clearable
          use-input
          input-debounce="0"
          @filter="filterEmps"
          style="min-width: 200px"
        >
          <template #prepend><q-icon name="person" size="18px" /></template>
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section avatar>
                <q-avatar :color="avatarColor(scope.opt.full_name)" text-color="white" size="28px" style="font-size: 11px">
                  {{ initials(scope.opt.full_name) }}
                </q-avatar>
              </q-item-section>
              <q-item-section>
                <q-item-label>{{ scope.opt.full_name }}</q-item-label>
                <q-item-label caption>{{ scope.opt.employee_code }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <!-- Load button -->
        <q-btn color="primary" icon="refresh" label="Load" no-caps unelevated @click="loadAssignments" />
        <!-- Clear filters -->
        <q-btn
          v-if="assignFilter.shiftId || assignFilter.employeeId"
          flat
          dense
          color="grey-5"
          icon="clear"
          label="Clear"
          no-caps
          @click="clearAssignFilters"
        />
        <q-space />
        <!-- Text search -->
        <q-input
          dense
          outlined
          v-model="assignSearch"
          placeholder="Quick search..."
          clearable
          style="width: 200px"
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>

      <!-- Weekly Calendar View -->
      <div class="weekly-grid q-mb-md">
        <div v-for="day in weekDays" :key="day.date" class="week-day-col">
          <div class="week-day-header" :class="{ today: day.isToday }">
            <div class="text-weight-bold">{{ day.label }}</div>
            <div class="text-caption">{{ day.date }}</div>
          </div>
          <div class="week-day-body">
            <div
              v-for="asgn in getAssignmentsForDay(day.date)"
              :key="asgn.id"
              class="asgn-chip"
              :class="`asgn-${asgn.status}`"
            >
              <div class="asgn-emp">{{ asgn.employees?.full_name?.split(' ')[0] }}</div>
              <div class="asgn-shift">{{ asgn.shifts?.name }}</div>
            </div>
            <div v-if="getAssignmentsForDay(day.date).length === 0" class="week-day-empty">—</div>
          </div>
        </div>
      </div>

      <!-- Table View -->
      <q-table
        flat
        bordered
        :rows="filteredAssignments"
        :columns="assignColumns"
        row-key="id"
        :loading="loadingAssignments"
        :filter="assignSearch"
        :pagination="{ rowsPerPage: 25 }"
        class="erp-data-grid"
      >
        <template #body-cell-employee="props">
          <q-td :props="props">
            <div class="row items-center no-wrap q-gutter-sm">
              <q-avatar
                size="30px"
                :color="avatarColor(props.row.employees?.full_name)"
                text-color="white"
                class="text-weight-bold"
                style="font-size: 13px"
              >
                {{ initials(props.row.employees?.full_name) }}
              </q-avatar>
              <div>
                <div class="text-weight-bold">{{ props.row.employees?.full_name }}</div>
                <div class="text-caption text-grey-5">{{ props.row.employees?.employee_code }}</div>
              </div>
            </div>
          </q-td>
        </template>
        <template #body-cell-shift="props">
          <q-td :props="props">
            <q-chip
              dense
              :color="getShiftColor(props.row.shifts?.name)"
              text-color="white"
              icon="schedule"
              >{{ props.row.shifts?.name }}</q-chip
            >
          </q-td>
        </template>
        <template #body-cell-status="props">
          <q-td :props="props">
            <q-badge
              :color="statusColor(props.row.status)"
              :label="props.row.status"
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
              icon="edit"
              color="amber"
              size="sm"
              @click="editAssignment(props.row)"
            >
              <q-tooltip>Edit</q-tooltip>
            </q-btn>
            <q-btn
              flat
              round
              dense
              icon="delete"
              color="negative"
              size="sm"
              @click="deleteAssignment(props.row)"
            >
              <q-tooltip>Delete</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- ─── SHIFT DEFINITION DIALOG ─── -->
    <q-dialog v-model="shiftDialog.open" persistent>
      <q-card style="min-width: 480px">
        <q-toolbar class="bg-primary">
          <q-toolbar-title>{{
            shiftDialog.isEdit ? 'Edit Shift' : 'Create New Shift'
          }}</q-toolbar-title>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-toolbar>
        <q-card-section class="q-gutter-md q-pa-lg">
          <q-input
            outlined
            v-model="shiftForm.name"
            label="Shift Name *"
            placeholder="e.g. Morning Shift"
            :rules="[(v) => !!v || 'Required']"
          />
          <div class="row q-col-gutter-md">
            <div class="col-6">
              <q-input
                outlined
                v-model="shiftForm.start_time"
                type="time"
                label="Start Time *"
                :rules="[(v) => !!v || 'Required']"
              />
            </div>
            <div class="col-6">
              <q-input
                outlined
                v-model="shiftForm.end_time"
                type="time"
                label="End Time *"
                :rules="[(v) => !!v || 'Required']"
              />
            </div>
          </div>
          <div class="row q-col-gutter-md items-center">
            <div class="col-8">
              <q-input
                outlined
                v-model.number="shiftForm.break_duration_minutes"
                type="number"
                label="Break Duration (minutes)"
                min="0"
              />
            </div>
            <div class="col-4 q-pt-md">
              <q-toggle v-model="shiftForm.is_overnight" label="Overnight?" color="purple" />
            </div>
          </div>
          <q-toggle v-model="shiftForm.is_active" label="Active" color="positive" />

          <!-- Preview -->
          <q-card flat class="q-pa-md shift-preview-card rounded-borders">
            <div class="text-caption shift-preview-label q-mb-xs">SHIFT PREVIEW</div>
            <div class="row q-gutter-md text-center">
              <div class="col">
                <div class="text-caption shift-preview-label">Duration</div>
                <div class="text-h6 text-weight-bold">{{ previewHours }} hrs</div>
              </div>
              <div class="col">
                <div class="text-caption shift-preview-label">Effective Hours</div>
                <div class="text-h6 text-weight-bold">{{ previewEffective }} hrs</div>
              </div>
            </div>
          </q-card>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" v-close-popup no-caps />
          <q-btn
            :label="shiftDialog.isEdit ? 'Update Shift' : 'Create Shift'"
            color="primary"
            icon="save"
            @click="saveShift"
            :loading="saving"
            unelevated
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ─── ASSIGNMENT DIALOG ─── -->
    <q-dialog v-model="assignDialog.open" persistent>
      <q-card style="min-width: 560px; max-width: 640px">
        <q-toolbar class="bg-primary">
          <q-toolbar-title class="text-weight-bold">{{
            assignDialog.isEdit ? 'Edit Assignment' : 'Assign Shift to Employees'
          }}</q-toolbar-title>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-toolbar>
        <q-card-section class="q-gutter-md q-pa-lg">
          <!-- Multi Employee Select -->
          <q-select
            outlined
            v-model="assignForm.employee_ids"
            :options="employeeOptions"
            option-label="full_name"
            option-value="id"
            emit-value
            map-options
            :label="assignDialog.isEdit ? 'Employee *' : 'Employees * (select multiple)'"
            :multiple="!assignDialog.isEdit"
            use-chips
            use-input
            input-debounce="0"
            @filter="filterEmps"
            :rules="[(v) => (Array.isArray(v) ? v.length > 0 : !!v) || 'Select at least one employee']"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <q-avatar
                    :color="avatarColor(scope.opt.full_name)"
                    text-color="white"
                    size="32px"
                    style="font-size: 12px"
                  >
                    {{ initials(scope.opt.full_name) }}
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.full_name }}</q-item-label>
                  <q-item-label caption>{{ scope.opt.employee_code }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
            <template #selected-item="scope">
              <q-chip
                dense
                removable
                @remove="scope.removeAtIndex(scope.index)"
                :color="avatarColor(scope.opt.full_name)"
                text-color="white"
                size="sm"
                class="q-my-xs"
              >
                {{ scope.opt.full_name }}
              </q-chip>
            </template>
          </q-select>

          <!-- Multi Shift Select -->
          <q-select
            outlined
            v-model="assignForm.shift_ids"
            :options="activeShifts"
            option-label="name"
            option-value="id"
            emit-value
            map-options
            :label="assignDialog.isEdit ? 'Shift *' : 'Shifts * (select multiple)'"
            :multiple="!assignDialog.isEdit"
            use-chips
            :rules="[(v) => (Array.isArray(v) ? v.length > 0 : !!v) || 'Select at least one shift']"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label>{{ scope.opt.name }}</q-item-label>
                  <q-item-label caption
                    >{{ formatTime(scope.opt.start_time) }} –
                    {{ formatTime(scope.opt.end_time) }}</q-item-label
                  >
                </q-item-section>
              </q-item>
            </template>
            <template #selected-item="scope">
              <q-chip
                dense
                removable
                @remove="scope.removeAtIndex(scope.index)"
                :color="getShiftColor(scope.opt.name)"
                text-color="white"
                size="sm"
                icon="schedule"
                class="q-my-xs"
              >
                {{ scope.opt.name }}
              </q-chip>
            </template>
          </q-select>

          <!-- Summary Banner -->
          <div v-if="!assignDialog.isEdit && assignSummary" class="assign-summary-banner q-pa-sm rounded-borders">
            <q-icon name="info" size="16px" class="q-mr-xs" />
            {{ assignSummary }}
          </div>

          <!-- Date Range -->
          <div class="row q-col-gutter-md">
            <div class="col-6">
              <q-input
                outlined
                v-model="assignForm.date_from"
                type="date"
                label="From Date *"
                :rules="[(v) => !!v || 'Required']"
              />
            </div>
            <div class="col-6">
              <q-input
                outlined
                v-model="assignForm.date_to"
                type="date"
                label="To Date *"
                :rules="[(v) => !!v || 'Required']"
              />
            </div>
          </div>

          <!-- Days of Week -->
          <div>
            <div class="text-caption text-grey-5 q-mb-sm">REPEAT ON DAYS</div>
            <div class="row q-gutter-xs">
              <q-btn
                v-for="d in daysOfWeek"
                :key="d.val"
                :outline="!assignForm.days.includes(d.val)"
                :color="assignForm.days.includes(d.val) ? 'primary' : 'grey-7'"
                dense
                no-caps
                rounded
                :label="d.short"
                size="sm"
                @click="toggleDay(d.val)"
              />
            </div>
          </div>

          <q-input outlined v-model="assignForm.notes" label="Notes" autogrow />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" v-close-popup no-caps />
          <q-btn
            :label="assignDialog.isEdit ? 'Update' : 'Assign Shifts'"
            color="primary"
            icon="save"
            @click="saveAssignment"
            :loading="saving"
            unelevated
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()

// ─── State ───────────────────────────────────────────────────────────────────
const viewMode = ref('definitions')
const shifts = ref([])
const assignments = ref([])
const employees = ref([])
const employeeOptions = ref([])
const loadingShifts = ref(false)
const loadingAssignments = ref(false)
const saving = ref(false)
const assignSearch = ref('')

const assignFilter = reactive({
  dateFrom: (() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay()) // start of this week (Sunday)
    return d.toISOString().split('T')[0]
  })(),
  dateTo: (() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() + 6) // end of this week (Saturday)
    return d.toISOString().split('T')[0]
  })(),
  shiftId: null,
  employeeId: null,
})

function clearAssignFilters() {
  assignFilter.shiftId = null
  assignFilter.employeeId = null
  assignSearch.value = ''
}

// ─── Shift Dialog ──────────────────────────────────────────────────────────
const shiftDialog = reactive({ open: false, isEdit: false })
const shiftForm = reactive({
  id: null,
  name: '',
  start_time: '08:00',
  end_time: '17:00',
  break_duration_minutes: 60,
  is_overnight: false,
  is_active: true,
})

function openShiftDialog(shift = null) {
  shiftDialog.isEdit = !!shift
  if (shift) {
    Object.assign(shiftForm, {
      id: shift.id,
      name: shift.name,
      start_time: shift.start_time?.substring(0, 5) || '08:00',
      end_time: shift.end_time?.substring(0, 5) || '17:00',
      break_duration_minutes: shift.break_duration_minutes || 0,
      is_overnight: shift.is_overnight || false,
      is_active: shift.is_active !== false,
    })
  } else {
    Object.assign(shiftForm, {
      id: null,
      name: '',
      start_time: '08:00',
      end_time: '17:00',
      break_duration_minutes: 60,
      is_overnight: false,
      is_active: true,
    })
  }
  shiftDialog.open = true
}

// ─── Assignment Dialog ─────────────────────────────────────────────────────
const assignDialog = reactive({ open: false, isEdit: false })
const assignForm = reactive({
  id: null,
  employee_ids: [],  // multi-select for create, single value for edit
  shift_ids: [],     // multi-select for create, single value for edit
  date_from: new Date().toISOString().split('T')[0],
  date_to: new Date().toISOString().split('T')[0],
  days: [1, 2, 3, 4, 5], // Mon-Fri by default
  notes: '',
})

const daysOfWeek = [
  { val: 0, short: 'Sun', label: 'Sunday' },
  { val: 1, short: 'Mon', label: 'Monday' },
  { val: 2, short: 'Tue', label: 'Tuesday' },
  { val: 3, short: 'Wed', label: 'Wednesday' },
  { val: 4, short: 'Thu', label: 'Thursday' },
  { val: 5, short: 'Fri', label: 'Friday' },
  { val: 6, short: 'Sat', label: 'Saturday' },
]

// Summary of how many assignments will be created
const assignSummary = computed(() => {
  const empCount = Array.isArray(assignForm.employee_ids) ? assignForm.employee_ids.length : 0
  const shiftCount = Array.isArray(assignForm.shift_ids) ? assignForm.shift_ids.length : 0
  if (empCount === 0 || shiftCount === 0) return ''
  return `${empCount} employee(s) × ${shiftCount} shift(s) will be assigned for selected dates`
})

function toggleDay(val) {
  const idx = assignForm.days.indexOf(val)
  if (idx === -1) assignForm.days.push(val)
  else assignForm.days.splice(idx, 1)
}

function openAssignDialog() {
  Object.assign(assignForm, {
    id: null,
    employee_ids: [],
    shift_ids: [],
    date_from: new Date().toISOString().split('T')[0],
    date_to: new Date().toISOString().split('T')[0],
    days: [1, 2, 3, 4, 5],
    notes: '',
  })
  assignDialog.isEdit = false
  assignDialog.open = true
}

function editAssignment(row) {
  // Parse the actual day of the assignment to pre-select it
  const [y, m, d] = row.assignment_date.split('-').map(Number)
  const actualDay = new Date(y, m - 1, d).getDay()

  Object.assign(assignForm, {
    id: row.id,
    employee_ids: row.employee_id,   // single value for edit
    shift_ids: row.shift_id,         // single value for edit
    date_from: row.assignment_date,
    date_to: row.assignment_date,
    days: [actualDay], // Pre-select the actual day of this assignment
    notes: row.notes || '',
  })
  assignDialog.isEdit = true
  assignDialog.open = true
}

// ─── Computed ──────────────────────────────────────────────────────────────
const activeShifts = computed(() => shifts.value.filter((s) => s.is_active))
const shiftOptions = computed(() => shifts.value)

const previewHours = computed(() => {
  try {
    const [sh, sm] = shiftForm.start_time.split(':').map(Number)
    const [eh, em] = shiftForm.end_time.split(':').map(Number)
    let mins = eh * 60 + em - (sh * 60 + sm)
    if (shiftForm.is_overnight && mins < 0) mins += 24 * 60
    return (mins / 60).toFixed(1)
  } catch {
    return '—'
  }
})

const previewEffective = computed(() => {
  const dur = parseFloat(previewHours.value) || 0
  const brk = (shiftForm.break_duration_minutes || 0) / 60
  return Math.max(0, dur - brk).toFixed(1)
})

const weekDays = computed(() => {
  const days = []
  const from = new Date(assignFilter.dateFrom)
  const to = new Date(assignFilter.dateTo)
  for (let d = new Date(from); d <= to && days.length < 7; d.setDate(d.getDate() + 1)) {
    const today = new Date().toISOString().split('T')[0]
    const ds = d.toISOString().split('T')[0]
    days.push({
      date: ds,
      label: d.toLocaleDateString('en', { weekday: 'short' }),
      isToday: ds === today,
    })
  }
  return days
})

const filteredAssignments = computed(() => {
  let result = assignments.value

  // Filter by employee (client-side for instant response)
  if (assignFilter.employeeId) {
    result = result.filter((a) => a.employee_id === assignFilter.employeeId)
  }

  // Text search
  if (assignSearch.value) {
    const s = assignSearch.value.toLowerCase()
    result = result.filter(
      (a) =>
        a.employees?.full_name?.toLowerCase().includes(s) ||
        a.shifts?.name?.toLowerCase().includes(s) ||
        a.assignment_date?.includes(s),
    )
  }

  return result
})

const assignColumns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (r) => r.employees?.full_name,
    sortable: true,
  },
  { name: 'shift', label: 'Shift', align: 'left', field: (r) => r.shifts?.name, sortable: true },
  { name: 'date', label: 'Date', align: 'center', field: 'assignment_date', sortable: true },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'actions', label: '', align: 'center' },
]

// ── Helper: parse 'YYYY-MM-DD' into local Date (avoids UTC timezone shift bug) ──
function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d) // local midnight
}
function formatLocalDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── API ───────────────────────────────────────────────────────────────────
async function loadShifts() {
  loadingShifts.value = true
  const branchId = authStore.currentBranch?.id
  
  let q = supabase
    .from('shifts')
    .select('*')
    .order('start_time')
    
  if (branchId) {
    q = q.eq('branch_id', branchId)
  }
  
  const { data, error } = await q
  
  if (error) console.error(error)
  else shifts.value = data || []
  loadingShifts.value = false
}

async function loadAssignments() {
  loadingAssignments.value = true
  const branchId = authStore.currentBranch?.id
  let q = supabase
    .from('shift_assignments')
    .select(`*, employees(full_name, employee_code), shifts(name, start_time, end_time)`)
    .gte('assignment_date', assignFilter.dateFrom)
    .lte('assignment_date', assignFilter.dateTo)
    .order('assignment_date')

  if (branchId) q = q.eq('branch_id', branchId)
  if (assignFilter.shiftId) q = q.eq('shift_id', assignFilter.shiftId)
  
  const { data, error } = await q
  if (error) console.error(error)
  else assignments.value = data || []
  loadingAssignments.value = false
}

async function loadEmployees() {
  loadingAssignments.value = true // Just reusing this to indicate loading if needed, though not mapped
  const branchId = authStore.currentBranch?.id
  
  let q = supabase
    .from('employees')
    .select('id, full_name, employee_code')
    .eq('is_active', true)
    .order('full_name')
    
  if (branchId) {
    q = q.eq('branch_id', branchId)
  }
    
  const { data, error } = await q
  if (error) console.error(error)
  
  employees.value = data || []
  employeeOptions.value = data || []
  loadingAssignments.value = false
}

function filterEmps(val, update) {
  update(() => {
    if (!val) employeeOptions.value = employees.value
    else {
      const s = val.toLowerCase()
      employeeOptions.value = employees.value.filter(
        (e) => 
          (e.full_name && e.full_name.toLowerCase().includes(s)) || 
          (e.employee_code && e.employee_code.toLowerCase().includes(s)),
      )
    }
  })
}

async function saveShift() {
  if (!shiftForm.name || !shiftForm.start_time || !shiftForm.end_time) {
    $q.notify({ type: 'warning', message: 'Please fill in all required fields' })
    return
  }
  saving.value = true
  const branchId = authStore.currentBranch?.id
  const companyId = authStore.currentBranch?.company_id
  const payload = {
    company_id: companyId,
    branch_id: branchId,
    name: shiftForm.name,
    start_time: shiftForm.start_time,
    end_time: shiftForm.end_time,
    break_duration_minutes: shiftForm.break_duration_minutes || 0,
    is_overnight: shiftForm.is_overnight,
    is_active: shiftForm.is_active,
  }
  try {
    if (shiftDialog.isEdit) {
      const { error } = await supabase.from('shifts').update(payload).eq('id', shiftForm.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Shift updated successfully' })
    } else {
      const { error } = await supabase.from('shifts').insert(payload)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Shift created successfully' })
    }
    shiftDialog.open = false
    await loadShifts()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to save shift' })
  } finally {
    saving.value = false
  }
}

async function toggleShiftActive(shift) {
  const { error } = await supabase
    .from('shifts')
    .update({ is_active: !shift.is_active })
    .eq('id', shift.id)
  if (error) $q.notify({ type: 'negative', message: error.message })
  else {
    $q.notify({
      type: shift.is_active ? 'info' : 'positive',
      message: `Shift ${shift.is_active ? 'deactivated' : 'activated'}`,
    })
    await loadShifts()
  }
}

async function saveAssignment() {
  const hasEmployees = assignDialog.isEdit
    ? !!assignForm.employee_ids
    : Array.isArray(assignForm.employee_ids) && assignForm.employee_ids.length > 0
  const hasShifts = assignDialog.isEdit
    ? !!assignForm.shift_ids
    : Array.isArray(assignForm.shift_ids) && assignForm.shift_ids.length > 0

  if (!hasEmployees || !hasShifts || !assignForm.date_from || !assignForm.date_to) {
    $q.notify({ type: 'warning', message: 'Please fill in all required fields' })
    return
  }
  saving.value = true
  const branchId = authStore.currentBranch?.id
  const companyId = authStore.currentBranch?.company_id

  try {
    if (assignDialog.isEdit) {
      // Simple single-date update
      const { error } = await supabase
        .from('shift_assignments')
        .update({
          employee_id: assignForm.employee_ids,
          shift_id: assignForm.shift_ids,
          notes: assignForm.notes,
        })
        .eq('id', assignForm.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Assignment updated' })
    } else {
      // Bulk insert for date range + selected days × employees × shifts
      const from = parseLocalDate(assignForm.date_from)
      const to = parseLocalDate(assignForm.date_to)
      const empIds = assignForm.employee_ids
      const shiftIds = assignForm.shift_ids
      const inserts = []

      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay()
        if (assignForm.days.includes(dayOfWeek)) {
          const dateStr = formatLocalDate(d)
          for (const empId of empIds) {
            for (const sId of shiftIds) {
              inserts.push({
                company_id: companyId,
                branch_id: branchId,
                employee_id: empId,
                shift_id: sId,
                assignment_date: dateStr,
                status: 'scheduled',
                notes: assignForm.notes || null,
              })
            }
          }
        }
      }
      if (inserts.length === 0) {
        $q.notify({ type: 'warning', message: 'No dates matched your selected days of week. Check your date range and day selection.' })
        saving.value = false
        return
      }
      // Upsert with the NEW 3-column unique constraint
      const { error } = await supabase
        .from('shift_assignments')
        .upsert(inserts, { onConflict: 'employee_id,shift_id,assignment_date' })
      if (error) throw error
      $q.notify({ type: 'positive', message: `${inserts.length} shift assignment(s) created` })
    }
    assignDialog.open = false
    await loadAssignments()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to save assignment' })
  } finally {
    saving.value = false
  }
}

async function deleteAssignment(row) {
  $q.dialog({
    title: 'Remove Assignment',
    message: `Remove shift assignment for ${row.employees?.full_name} on ${row.assignment_date}?`,
    cancel: true,
    ok: { label: 'Remove', color: 'negative' },
  }).onOk(async () => {
    const { error } = await supabase.from('shift_assignments').delete().eq('id', row.id)
    if (error) $q.notify({ type: 'negative', message: error.message })
    else {
      $q.notify({ type: 'info', message: 'Assignment removed' })
      await loadAssignments()
    }
  })
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatTime(t) {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function getShiftType(shift) {
  const [h] = shift.start_time?.split(':').map(Number) || [8]
  if (h < 9) return 'morning'
  if (h < 14) return 'day'
  if (h < 18) return 'evening'
  return 'night'
}

function calculateHours(shift) {
  try {
    const [sh, sm] = shift.start_time.split(':').map(Number)
    const [eh, em] = shift.end_time.split(':').map(Number)
    let mins = eh * 60 + em - (sh * 60 + sm)
    if (shift.is_overnight && mins < 0) mins += 24 * 60
    return (mins / 60).toFixed(1)
  } catch {
    return '—'
  }
}

function getShiftColor(shiftName) {
  if (!shiftName) return 'grey-7'
  const name = shiftName.toLowerCase()
  if (name.includes('morning') || name.includes('early')) return 'amber-8'
  if (name.includes('day') || name.includes('mid')) return 'blue-7'
  if (name.includes('evening') || name.includes('afternoon')) return 'orange-8'
  if (name.includes('night') || name.includes('late')) return 'deep-purple-7'
  return 'indigo-7'
}

function statusColor(s) {
  return (
    { scheduled: 'blue-7', completed: 'green-7', missed: 'red-7', swapped: 'orange-7' }[s] ||
    'grey-7'
  )
}

function getAssignmentsForDay(date) {
  return assignments.value.filter((a) => a.assignment_date === date).slice(0, 4)
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0][0].toUpperCase()
}

const avatarColors = [
  'indigo-7',
  'teal-7',
  'blue-8',
  'green-8',
  'orange-8',
  'red-8',
  'purple-7',
  'cyan-8',
]
function avatarColor(name) {
  if (!name) return 'grey-7'
  return avatarColors[name.charCodeAt(0) % avatarColors.length]
}

watch(
  () => authStore.currentBranch?.id,
  (newId) => {
    if (newId) {
      loadShifts()
      loadEmployees()
      loadAssignments()
    }
  },
)

onMounted(async () => {
  await Promise.all([loadShifts(), loadEmployees()])
  await loadAssignments()
})
</script>

<style scoped lang="scss">
.shift-toggle {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  overflow: hidden;
  :deep(.q-btn) {
    padding: 4px 16px;
    font-size: 12px;
    font-weight: 600;
    min-height: 32px;
  }
}

.shift-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--erp-border-hover);
  }
}

.shift-bar {
  height: 4px;
  width: 100%;
}
.shift-morning {
  background: linear-gradient(90deg, #f59e0b, #fbbf24);
}
.shift-day {
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}
.shift-evening {
  background: linear-gradient(90deg, #f97316, #fb923c);
}
.shift-night {
  background: linear-gradient(90deg, #7c3aed, #a78bfa);
}

.shift-name {
  font-size: 1.05rem;
  color: var(--erp-text-primary);
}

.shift-type-label {
  color: var(--erp-text-muted);
}

.shift-time-label {
  color: var(--erp-text-muted);
}

.shift-time-value {
  color: var(--erp-text-primary);
}

.shift-meta-text {
  color: var(--erp-text-muted);
}

.shift-time-block {
  background: var(--erp-bg-hover);
  border-radius: 6px;
  padding: 5px 8px;
}

.shift-preview-card {
  background: var(--erp-bg-hover);
  border: 1px solid var(--erp-border);
}

.shift-preview-label {
  color: var(--erp-text-muted);
}

.erp-data-grid {
  background: var(--erp-bg-card);
  border-radius: 12px;
}

/* Weekly calendar */
.weekly-grid {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}
.week-day-col {
  flex: 1;
  min-width: 100px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--erp-border);
}
.week-day-header {
  background: var(--erp-bg-hover);
  padding: 6px 8px;
  text-align: center;
  font-size: 0.75rem;
  color: var(--erp-text-muted);

  &.today {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
  }
}
.week-day-body {
  min-height: 60px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: var(--erp-bg-card);
}
.asgn-chip {
  border-radius: 6px;
  padding: 3px 6px;
  font-size: 0.68rem;
  line-height: 1.3;
  border-left: 2px solid;
  overflow: hidden;
}
.asgn-scheduled {
  background: rgba(59, 130, 246, 0.15);
  border-color: #3b82f6;
}
.asgn-completed {
  background: rgba(34, 197, 94, 0.15);
  border-color: #22c55e;
}
.asgn-missed {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
}
.asgn-swapped {
  background: rgba(249, 115, 22, 0.15);
  border-color: #f97316;
}

.asgn-emp {
  font-weight: 700;
  color: var(--erp-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asgn-shift {
  color: var(--erp-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.assign-summary-banner {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.25);
  color: #60a5fa;
  font-size: 0.82rem;
  font-weight: 600;
  display: flex;
  align-items: center;
}
.week-day-empty {
  text-align: center;
  color: var(--erp-text-tertiary);
  font-size: 0.8rem;
  padding: 8px;
}
</style>
