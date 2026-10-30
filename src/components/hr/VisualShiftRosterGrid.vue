<template>
  <div class="visual-roster-container">
    <!-- ── Top Action & Controls Bar ──────────────────────────────────────── -->
    <q-card flat bordered class="roster-control-card q-mb-md" :class="$q.dark.isActive ? 'bg-grey-10 border-grey-8' : 'bg-white'">
      <q-card-section class="q-pa-md">
        <!-- Row 1: Week Navigation & Actions -->
        <div class="row items-center justify-between q-col-gutter-sm">
          <!-- Week Navigation -->
          <div class="col-12 col-md-auto row items-center q-gutter-x-sm">
            <q-btn-group unelevated class="week-nav-group">
              <q-btn
                dense
                round
                flat
                icon="chevron_left"
                @click="navigateWeek(-1)"
                :disable="loading"
              >
                <q-tooltip>Previous Week</q-tooltip>
              </q-btn>
              <q-btn
                dense
                no-caps
                flat
                icon="today"
                label="Today"
                @click="goToCurrentWeek"
                :disable="loading"
                class="q-px-sm"
              >
                <q-tooltip>Go to current week</q-tooltip>
              </q-btn>
              <q-btn
                dense
                round
                flat
                icon="chevron_right"
                @click="navigateWeek(1)"
                :disable="loading"
              >
                <q-tooltip>Next Week</q-tooltip>
              </q-btn>
            </q-btn-group>

            <!-- Week Date Display -->
            <div class="row items-center q-gutter-x-sm q-ml-sm">
              <div class="text-subtitle1 text-weight-bold" :class="$q.dark.isActive ? 'text-white' : 'text-grey-9'">
                {{ formattedWeekRange }}
              </div>
              <q-badge color="primary" class="q-px-sm text-caption" rounded>
                Week {{ weekNumber }}
              </q-badge>
            </div>
          </div>

          <!-- Quick Filters: Department & Search -->
          <div class="col-12 col-md row items-center justify-end q-gutter-sm">
            <!-- Department filter -->
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="selectedDepartment"
              :options="departmentOptions"
              option-label="name"
              option-value="id"
              emit-value
              map-options
              style="min-width: 180px"
              class="department-select"
            >
              <template #prepend>
                <q-icon name="restaurant" size="16px" color="primary" />
              </template>
            </q-select>

            <!-- Search employee -->
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="searchQuery"
              placeholder="Search staff..."
              clearable
              style="width: 170px"
            >
              <template #prepend>
                <q-icon name="search" size="16px" />
              </template>
            </q-input>

            <!-- Actions: Copy previous week & Clear -->
            <q-btn
              color="indigo"
              icon="content_copy"
              label="Copy Prev Week"
              no-caps
              dense
              unelevated
              class="q-px-sm"
              @click="confirmCopyPreviousWeek"
              :loading="copyingWeek"
            >
              <q-tooltip>Duplicate the entire schedule from previous week to this week</q-tooltip>
            </q-btn>

            <q-btn
              outline
              color="negative"
              icon="clear_all"
              label="Clear Week"
              no-caps
              dense
              class="q-px-sm"
              @click="confirmClearWeek"
              :disable="loading || totalWeekAssignmentsCount === 0"
            >
              <q-tooltip>Remove all shift assignments for this week</q-tooltip>
            </q-btn>
          </div>
        </div>

        <q-separator class="q-my-sm" />

        <!-- Row 2: Shift Palette & Quick Stamp Tool -->
        <div class="row items-center justify-between q-col-gutter-xs">
          <div class="row items-center q-gutter-x-xs">
            <span class="text-caption text-weight-bold text-grey-6 q-mr-xs">
              <q-icon name="brush" size="14px" class="q-mr-xs" />
              QUICK STAMP:
            </span>

            <q-chip
              v-for="s in activeShifts"
              :key="s.id"
              clickable
              dense
              :selected="activeStampShiftId === s.id"
              @click="toggleStamp(s.id)"
              :style="{
                backgroundColor: getShiftColor(s.name).bg,
                color: getShiftColor(s.name).text,
                border: activeStampShiftId === s.id ? '2px solid #ff9800' : '1px solid transparent',
                boxShadow: activeStampShiftId === s.id ? '0 0 8px rgba(255, 152, 0, 0.6)' : 'none'
              }"
              class="shift-stamp-chip q-px-sm"
            >
              <q-icon name="schedule" size="12px" class="q-mr-xs" />
              <strong>{{ s.name }}</strong>
              <span class="q-ml-xs text-caption" style="opacity: 0.85">({{ formatTime(s.start_time) }}-{{ formatTime(s.end_time) }})</span>
            </q-chip>

            <!-- Clear/Off Stamp -->
            <q-chip
              clickable
              dense
              :selected="activeStampShiftId === 'CLEAR'"
              @click="toggleStamp('CLEAR')"
              :style="{
                backgroundColor: activeStampShiftId === 'CLEAR' ? '#e53935' : '#f5f5f5',
                color: activeStampShiftId === 'CLEAR' ? '#ffffff' : '#616161',
                border: activeStampShiftId === 'CLEAR' ? '2px solid #d32f2f' : '1px solid #e0e0e0'
              }"
              class="shift-stamp-chip q-px-sm"
            >
              <q-icon name="block" size="12px" class="q-mr-xs" />
              <span>Rest Day / Off</span>
            </q-chip>
          </div>

          <!-- Active Stamp Indicator -->
          <div v-if="activeStampShiftId" class="stamp-active-notice row items-center q-gutter-x-xs animate-pulse">
            <q-icon name="touch_app" size="14px" color="amber-9" />
            <span class="text-caption text-amber-9 text-weight-bold">
              Stamp Active: Click any cell to assign
            </span>
            <q-btn flat round dense icon="close" size="xs" color="grey-7" @click="activeStampShiftId = null">
              <q-tooltip>Exit stamp mode (or press Esc)</q-tooltip>
            </q-btn>
          </div>
          <div v-else class="text-caption text-grey-5">
            <q-icon name="drag_indicator" size="13px" class="q-mr-xs" />
            Tip: Drag and drop shifts between staff or dates, or select a Stamp shift above for 1-click assignment.
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- ── Loading Overlay ────────────────────────────────────────────────── -->
    <div v-if="loading" class="row justify-center q-pa-xl">
      <q-spinner-cube color="primary" size="50px" />
      <div class="col-12 text-center text-grey-6 q-mt-md">Loading Seven Waves Restaurant Roster...</div>
    </div>

    <!-- ── Roster Matrix Grid ─────────────────────────────────────────────── -->
    <div v-else class="roster-grid-wrapper" :class="$q.dark.isActive ? 'dark-mode' : 'light-mode'">
      <div class="roster-table-scroll">
        <table class="roster-table">
          <thead>
            <!-- Header Row: Employee column + 7 Days of the Week -->
            <tr class="header-row">
              <!-- Staff Header -->
              <th class="staff-header-cell text-left sticky-col">
                <div class="row items-center justify-between">
                  <div>
                    <div class="text-weight-bold">Staff Member</div>
                    <div class="text-caption text-grey-6" style="font-size: 11px">
                      {{ filteredStaffList.length }} on roster
                    </div>
                  </div>
                  <q-icon name="people" size="18px" color="grey-6" />
                </div>
              </th>

              <!-- 7 Day Columns with Daily Coverage Breakdown -->
              <th
                v-for="day in weekDays"
                :key="day.dateStr"
                class="day-header-cell text-center"
                :class="{ 'today-column-header': day.isToday }"
              >
                <div class="day-header-title">
                  <div class="day-name" :class="{ 'text-primary text-weight-bolder': day.isToday }">
                    {{ day.dayName }}
                  </div>
                  <div class="day-number" :class="{ 'today-badge': day.isToday }">
                    {{ day.dayNumber }} {{ day.monthShort }}
                  </div>
                  <q-badge v-if="day.isToday" color="primary" text-color="white" class="today-chip" rounded>
                    TODAY
                  </q-badge>
                </div>

                <!-- Daily Shift Coverage Metric Bar -->
                <div class="coverage-bar q-mt-xs">
                  <div class="coverage-total" :class="getDailyStaffCount(day.dateStr) > 0 ? 'text-positive' : 'text-grey-6'">
                    <q-icon name="group" size="11px" class="q-mr-xs" />
                    <strong>{{ getDailyStaffCount(day.dateStr) }}</strong> staff
                  </div>
                  <!-- Mini dots for shifts on duty -->
                  <div class="row justify-center q-gutter-xs q-mt-xs" style="min-height: 14px">
                    <span
                      v-for="shiftSummary in getDailyShiftBreakdown(day.dateStr)"
                      :key="shiftSummary.shiftId"
                      class="coverage-pill"
                      :style="{ backgroundColor: shiftSummary.color.bg, color: shiftSummary.color.text }"
                      :title="`${shiftSummary.name}: ${shiftSummary.count} staff`"
                    >
                      {{ shiftSummary.code }}: {{ shiftSummary.count }}
                    </span>
                  </div>
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            <tr v-if="filteredStaffList.length === 0">
              <td :colspan="8" class="text-center q-pa-xl text-grey-6">
                <q-icon name="search_off" size="40px" class="q-mb-sm" />
                <div class="text-subtitle1">No staff members match the selected filters.</div>
                <div class="text-caption">Try selecting "All Departments" or clear the search.</div>
              </td>
            </tr>

            <!-- Staff Row -->
            <tr
              v-for="emp in filteredStaffList"
              :key="emp.id"
              class="staff-data-row"
            >
              <!-- Frozen Left Column: Staff Info -->
              <td class="staff-info-cell sticky-col">
                <div class="row items-center no-wrap q-gutter-x-sm">
                  <!-- Avatar -->
                  <q-avatar
                    size="36px"
                    :style="{ backgroundColor: getDepartmentColor(emp.departments?.name) }"
                    text-color="white"
                    class="text-weight-bold"
                  >
                    {{ getInitials(emp.full_name) }}
                  </q-avatar>

                  <div class="staff-details col overflow-hidden">
                    <div class="staff-name text-weight-bold text-truncate" :title="emp.full_name">
                      {{ emp.full_name }}
                    </div>
                    <div class="row items-center q-gutter-x-xs">
                      <span class="staff-code text-caption text-grey-6">{{ emp.employee_code }}</span>
                      <q-badge
                        dense
                        :label="emp.departments?.name || 'General'"
                        class="dept-badge text-caption"
                        :style="{ backgroundColor: getDepartmentColor(emp.departments?.name) + '22', color: getDepartmentColor(emp.departments?.name) }"
                      />
                    </div>
                  </div>

                  <!-- Weekly Total Hours Pill -->
                  <div class="staff-stats-pill text-right">
                    <div class="text-weight-bold" style="font-size: 11px">
                      {{ getStaffWeekHours(emp.id) }}h
                    </div>
                    <div class="text-caption text-grey-6" style="font-size: 9px">
                      {{ getStaffShiftCount(emp.id) }} shifts
                    </div>
                  </div>
                </div>
              </td>

              <!-- 7 Shift Assignment Cells for this Employee -->
              <td
                v-for="day in weekDays"
                :key="day.dateStr"
                class="roster-cell"
                :class="{
                  'today-column-cell': day.isToday,
                  'is-drag-over': isDragTarget(emp.id, day.dateStr),
                  'is-on-leave': isStaffOnLeave(emp.id, day.dateStr)
                }"
                @dragover.prevent="onDragOver(emp.id, day.dateStr)"
                @dragleave="onDragLeave(emp.id, day.dateStr)"
                @drop="onDrop(emp.id, day.dateStr)"
                @click="onCellClick(emp, day.dateStr)"
              >
                <!-- CASE 1: Employee is On Approved Leave -->
                <div v-if="isStaffOnLeave(emp.id, day.dateStr)" class="leave-cell-content">
                  <q-icon name="beach_access" size="14px" class="q-mr-xs text-pink-7" />
                  <span class="text-weight-bold text-pink-9">On Leave</span>
                  <div class="text-caption text-pink-7" style="font-size: 9px">
                    {{ getLeaveReason(emp.id, day.dateStr) }}
                  </div>
                </div>

                <!-- CASE 2: Shift Assigned -->
                <div
                  v-else-if="getAssignment(emp.id, day.dateStr)"
                  class="shift-pill-card"
                  :style="{
                    backgroundColor: getShiftColor(getAssignment(emp.id, day.dateStr).shifts?.name).bg,
                    color: getShiftColor(getAssignment(emp.id, day.dateStr).shifts?.name).text,
                    borderLeft: `4px solid ${getShiftColor(getAssignment(emp.id, day.dateStr).shifts?.name).border}`
                  }"
                  draggable="true"
                  @dragstart="onDragStart($event, getAssignment(emp.id, day.dateStr))"
                  @dragend="onDragEnd"
                >
                  <div class="row items-center justify-between no-wrap">
                    <div class="shift-pill-title text-weight-bold text-truncate">
                      {{ getAssignment(emp.id, day.dateStr).shifts?.name }}
                    </div>

                    <!-- Delete button on hover -->
                    <q-btn
                      flat
                      round
                      dense
                      icon="close"
                      size="xs"
                      class="shift-remove-btn"
                      @click.stop="deleteAssignment(getAssignment(emp.id, day.dateStr).id)"
                    >
                      <q-tooltip>Remove shift</q-tooltip>
                    </q-btn>
                  </div>

                  <!-- Shift timing snippet -->
                  <div class="shift-pill-time row items-center no-wrap">
                    <q-icon name="schedule" size="10px" class="q-mr-xs" />
                    <span>{{ formatTime(getAssignment(emp.id, day.dateStr).shifts?.start_time) }} - {{ formatTime(getAssignment(emp.id, day.dateStr).shifts?.end_time) }}</span>
                  </div>

                  <!-- Overnight indicator -->
                  <div v-if="getAssignment(emp.id, day.dateStr).shifts?.is_overnight" class="row items-center text-caption" style="font-size: 9px; opacity: 0.9">
                    <q-icon name="nightlight_round" size="10px" class="q-mr-xs text-amber" />
                    Overnight (+1)
                  </div>
                </div>

                <!-- CASE 3: Empty Cell (Off Day) -->
                <div v-else class="empty-cell-content">
                  <!-- Ghost stamp preview on hover -->
                  <div v-if="activeStampShiftId && activeStampShiftId !== 'CLEAR'" class="ghost-stamp-preview">
                    <span>+ {{ getShiftNameById(activeStampShiftId) }}</span>
                  </div>
                  <div v-else class="add-shift-btn">
                    <q-icon name="add" size="16px" />
                  </div>
                  <div class="off-label">Off</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Quick Shift Picker Dialog (when clicking empty cell without Stamp) ── -->
    <q-dialog v-model="quickPickDialog.open">
      <q-card style="min-width: 380px" :class="$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-grey-9'">
        <q-toolbar class="bg-primary text-white">
          <q-icon name="schedule" size="20px" class="q-mr-sm" />
          <q-toolbar-title class="text-subtitle1 text-weight-bold">
            Assign Shift
          </q-toolbar-title>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-toolbar>

        <q-card-section class="q-pa-md">
          <div class="q-mb-md">
            <div class="text-subtitle2 text-weight-bold">{{ quickPickDialog.employeeName }}</div>
            <div class="text-caption text-grey-6">{{ quickPickDialog.formattedDate }}</div>
          </div>

          <div class="text-caption text-weight-bold text-grey-7 q-mb-sm">SELECT SHIFT:</div>
          <div class="column q-gutter-sm">
            <q-card
              v-for="s in activeShifts"
              :key="s.id"
              v-ripple
              clickable
              flat
              bordered
              class="shift-pick-item q-pa-sm cursor-pointer"
              :style="{
                backgroundColor: getShiftColor(s.name).bg,
                color: getShiftColor(s.name).text,
                borderLeft: `5px solid ${getShiftColor(s.name).border}`
              }"
              @click="assignShiftDirect(quickPickDialog.employeeId, quickPickDialog.dateStr, s.id)"
            >
              <div class="row items-center justify-between">
                <div>
                  <div class="text-weight-bold">{{ s.name }}</div>
                  <div class="text-caption" style="opacity: 0.85">
                    {{ formatTime(s.start_time) }} - {{ formatTime(s.end_time) }}
                    <span v-if="s.is_overnight" class="q-ml-xs text-amber font-weight-bold">(Overnight)</span>
                  </div>
                </div>
                <q-icon name="chevron_right" size="20px" />
              </div>
            </q-card>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- ── Confirm Copy Week Dialog ──────────────────────────────────────── -->
    <q-dialog v-model="copyConfirmDialog.open">
      <q-card style="min-width: 420px" :class="$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-grey-9'">
        <q-card-section class="row items-center q-pb-none">
          <q-avatar icon="content_copy" color="indigo" text-color="white" />
          <div class="text-h6 text-weight-bold q-ml-md">Copy Previous Week Schedule?</div>
        </q-card-section>

        <q-card-section class="q-pa-md">
          <p class="text-body2">
            This will copy all <strong>{{ copyConfirmDialog.count }}</strong> shift assignments from
            <span class="text-weight-bold text-indigo">{{ copyConfirmDialog.prevWeekLabel }}</span>
            to the current week (<span class="text-weight-bold text-primary">{{ formattedWeekRange }}</span>).
          </p>
          <p class="text-caption text-grey-6">
            Existing shifts on the current week will be safely updated or preserved.
          </p>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" v-close-popup no-caps />
          <q-btn
            unelevated
            color="indigo"
            label="Confirm & Copy"
            icon="done_all"
            @click="executeCopyPreviousWeek"
            :loading="copyingWeek"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()

// ── State ───────────────────────────────────────────────────────────────────
const loading = ref(false)
const copyingWeek = ref(false)
const currentWeekStart = ref(getMondayOfCurrentWeek())
const shifts = ref([])
const employees = ref([])
const departments = ref([])
const assignments = ref([])
const leaveRequests = ref([])

// Filters
const selectedDepartment = ref(null)
const searchQuery = ref('')
const activeStampShiftId = ref(null)

// Drag and drop state
const draggedAssignment = ref(null)
const dragOverTarget = reactive({ employeeId: null, dateStr: null })

// Quick pick dialog
const quickPickDialog = reactive({
  open: false,
  employeeId: null,
  employeeName: '',
  dateStr: '',
  formattedDate: '',
})

// Copy confirm dialog
const copyConfirmDialog = reactive({
  open: false,
  count: 0,
  prevWeekLabel: '',
  assignmentsToCopy: [],
})

// ── Date Computations ───────────────────────────────────────────────────────
function getMondayOfCurrentWeek() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  const monday = new Date(d.setDate(diff))
  monday.setHours(0, 0, 0, 0)
  return monday
}

function toYmd(dateObj) {
  const y = dateObj.getFullYear()
  const m = String(dateObj.getMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const weekDays = computed(() => {
  const days = []
  const todayYmd = toYmd(new Date())
  const start = new Date(currentWeekStart.value)

  for (let i = 0; i < 7; i++) {
    const cur = new Date(start)
    cur.setDate(start.getDate() + i)
    const dateStr = toYmd(cur)

    days.push({
      dateStr,
      dayName: cur.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: cur.getDate(),
      monthShort: cur.toLocaleDateString('en-US', { month: 'short' }),
      isToday: dateStr === todayYmd,
      dateObj: cur,
    })
  }
  return days
})

const formattedWeekRange = computed(() => {
  if (weekDays.value.length < 7) return ''
  const first = weekDays.value[0]
  const last = weekDays.value[6]
  return `${first.dayNumber} ${first.monthShort} – ${last.dayNumber} ${last.monthShort} ${last.dateObj.getFullYear()}`
})

const weekNumber = computed(() => {
  const d = new Date(currentWeekStart.value)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
})

// ── Filtered Lists ──────────────────────────────────────────────────────────
const activeShifts = computed(() => shifts.value.filter((s) => s.is_active !== false))

const departmentOptions = computed(() => {
  const list = [{ id: null, name: 'All Departments' }]
  departments.value.forEach((d) => list.push(d))
  return list
})

const filteredStaffList = computed(() => {
  let list = employees.value

  if (selectedDepartment.value) {
    list = list.filter((e) => e.department_id === selectedDepartment.value)
  }

  if (searchQuery.value && searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(
      (e) =>
        (e.full_name && e.full_name.toLowerCase().includes(q)) ||
        (e.employee_code && e.employee_code.toLowerCase().includes(q)),
    )
  }

  return list
})

const totalWeekAssignmentsCount = computed(() => assignments.value.length)

// ── Color Schemes & Helpers ─────────────────────────────────────────────────
const SHIFT_PALETTES = {
  morning: { bg: '#fff8e1', text: '#b78103', border: '#ffb300' }, // Amber
  day: { bg: '#e1f5fe', text: '#0277bd', border: '#03a9f4' },     // Sky Blue
  evening: { bg: '#f3e5f5', text: '#7b1fa2', border: '#ab47bc' }, // Purple
  night: { bg: '#e8eaf6', text: '#283593', border: '#3f51b5' },   // Indigo
  chinese: { bg: '#e0f2f1', text: '#00695c', border: '#26a69a' }, // Teal
  default: { bg: '#eceff1', text: '#37474f', border: '#78909c' }, // Slate
}

function getShiftColor(shiftName) {
  if (!shiftName) return SHIFT_PALETTES.default
  const n = shiftName.toLowerCase()
  if (n.includes('morning')) return SHIFT_PALETTES.morning
  if (n.includes('day')) return SHIFT_PALETTES.day
  if (n.includes('evening')) return SHIFT_PALETTES.evening
  if (n.includes('night')) return SHIFT_PALETTES.night
  if (n.includes('chinese')) return SHIFT_PALETTES.chinese
  return SHIFT_PALETTES.default
}

const DEPT_COLORS = [
  '#0284c7', '#059669', '#d97706', '#dc2626', '#7c3aed',
  '#db2777', '#0891b2', '#4f46e5', '#ca8a04', '#65a30d',
]

function getDepartmentColor(deptName) {
  if (!deptName) return '#64748b'
  let hash = 0
  for (let i = 0; i < deptName.length; i++) {
    hash = deptName.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % DEPT_COLORS.length
  return DEPT_COLORS[index]
}

function getInitials(name) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('')
}

function formatTime(t) {
  if (!t) return ''
  return t.slice(0, 5)
}

function getShiftNameById(shiftId) {
  const s = shifts.value.find((x) => x.id === shiftId)
  return s ? s.name : ''
}

// ── Roster Data Lookups ─────────────────────────────────────────────────────
function getAssignment(employeeId, dateStr) {
  return assignments.value.find(
    (a) => a.employee_id === employeeId && a.assignment_date === dateStr,
  )
}

function isStaffOnLeave(employeeId, dateStr) {
  return leaveRequests.value.some(
    (l) =>
      l.employee_id === employeeId &&
      l.start_date <= dateStr &&
      l.end_date >= dateStr &&
      l.status === 'approved',
  )
}

function getLeaveReason(employeeId, dateStr) {
  const l = leaveRequests.value.find(
    (l) =>
      l.employee_id === employeeId &&
      l.start_date <= dateStr &&
      l.end_date >= dateStr &&
      l.status === 'approved',
  )
  return l?.leave_types?.name || 'Approved'
}

function getStaffWeekHours(employeeId) {
  const staffAssignments = assignments.value.filter((a) => a.employee_id === employeeId)
  let totalHours = 0

  for (const a of staffAssignments) {
    if (a.shifts?.start_time && a.shifts?.end_time) {
      const [sh, sm] = a.shifts.start_time.split(':').map(Number)
      const [eh, em] = a.shifts.end_time.split(':').map(Number)
      let spanMins = eh * 60 + em - (sh * 60 + sm)
      if (spanMins <= 0) spanMins += 24 * 60
      const netHours = (spanMins - (a.shifts.break_duration_minutes || 0)) / 60
      totalHours += netHours > 0 ? netHours : 0
    }
  }
  return Math.round(totalHours)
}

function getStaffShiftCount(employeeId) {
  return assignments.value.filter((a) => a.employee_id === employeeId).length
}

function getDailyStaffCount(dateStr) {
  return assignments.value.filter((a) => a.assignment_date === dateStr).length
}

function getDailyShiftBreakdown(dateStr) {
  const map = {}
  assignments.value
    .filter((a) => a.assignment_date === dateStr && a.shifts)
    .forEach((a) => {
      const s = a.shifts
      if (!map[s.id]) {
        map[s.id] = {
          shiftId: s.id,
          name: s.name,
          code: s.name.charAt(0),
          count: 0,
          color: getShiftColor(s.name),
        }
      }
      map[s.id].count++
    })
  return Object.values(map)
}

// ── Navigation ──────────────────────────────────────────────────────────────
function navigateWeek(delta) {
  const d = new Date(currentWeekStart.value)
  d.setDate(d.getDate() + delta * 7)
  currentWeekStart.value = d
  loadRosterData()
}

function goToCurrentWeek() {
  currentWeekStart.value = getMondayOfCurrentWeek()
  loadRosterData()
}

function toggleStamp(shiftId) {
  if (activeStampShiftId.value === shiftId) {
    activeStampShiftId.value = null
  } else {
    activeStampShiftId.value = shiftId
  }
}

// ── Cell Interactions ───────────────────────────────────────────────────────
async function onCellClick(employee, dateStr) {
  if (isStaffOnLeave(employee.id, dateStr)) {
    $q.notify({ type: 'warning', message: `${employee.full_name} is on scheduled leave on ${dateStr}.` })
    return
  }

  // Stamp mode assignment
  if (activeStampShiftId.value) {
    if (activeStampShiftId.value === 'CLEAR') {
      const existing = getAssignment(employee.id, dateStr)
      if (existing) {
        await deleteAssignment(existing.id)
      }
    } else {
      await assignShiftDirect(employee.id, dateStr, activeStampShiftId.value)
    }
    return
  }

  // Otherwise open Quick Pick Dialog
  const d = new Date(dateStr)
  quickPickDialog.employeeId = employee.id
  quickPickDialog.employeeName = employee.full_name
  quickPickDialog.dateStr = dateStr
  quickPickDialog.formattedDate = d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  quickPickDialog.open = true
}

async function assignShiftDirect(employeeId, dateStr, shiftId) {
  try {
    quickPickDialog.open = false
    const branchId = authStore.currentBranch?.id
    const companyId = authStore.currentBranch?.company_id

    const existing = getAssignment(employeeId, dateStr)
    if (existing) {
      if (existing.shift_id === shiftId) return // already assigned

      const { data, error } = await supabase
        .from('shift_assignments')
        .update({ shift_id: shiftId, status: 'scheduled' })
        .eq('id', existing.id)
        .select('id, employee_id, shift_id, assignment_date, status, shifts(name, start_time, end_time, break_duration_minutes, is_overnight)')
        .single()

      if (error) throw error
      const idx = assignments.value.findIndex((a) => a.id === existing.id)
      if (idx !== -1) assignments.value[idx] = data
      $q.notify({ type: 'positive', message: 'Shift updated', timeout: 800 })
    } else {
      const { data, error } = await supabase
        .from('shift_assignments')
        .insert({
          company_id: companyId,
          branch_id: branchId,
          employee_id: employeeId,
          shift_id: shiftId,
          assignment_date: dateStr,
          status: 'scheduled',
        })
        .select('id, employee_id, shift_id, assignment_date, status, shifts(name, start_time, end_time, break_duration_minutes, is_overnight)')
        .single()

      if (error) throw error
      assignments.value.push(data)
      $q.notify({ type: 'positive', message: 'Shift assigned', timeout: 800 })
    }
  } catch (err) {
    console.error('Failed to assign shift:', err)
    $q.notify({ type: 'negative', message: `Assignment failed: ${err.message}` })
  }
}

async function deleteAssignment(assignmentId) {
  try {
    const { error } = await supabase.from('shift_assignments').delete().eq('id', assignmentId)
    if (error) throw error

    assignments.value = assignments.value.filter((a) => a.id !== assignmentId)
    $q.notify({ type: 'info', message: 'Shift removed', timeout: 800 })
  } catch (err) {
    console.error('Failed to delete assignment:', err)
    $q.notify({ type: 'negative', message: err.message })
  }
}

// ── Drag and Drop Logic ─────────────────────────────────────────────────────
function onDragStart(event, assignment) {
  draggedAssignment.value = assignment
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', assignment.id)
  }
}

function onDragEnd() {
  draggedAssignment.value = null
  dragOverTarget.employeeId = null
  dragOverTarget.dateStr = null
}

function onDragOver(employeeId, dateStr) {
  dragOverTarget.employeeId = employeeId
  dragOverTarget.dateStr = dateStr
}

function onDragLeave(employeeId, dateStr) {
  if (dragOverTarget.employeeId === employeeId && dragOverTarget.dateStr === dateStr) {
    dragOverTarget.employeeId = null
    dragOverTarget.dateStr = null
  }
}

function isDragTarget(employeeId, dateStr) {
  return dragOverTarget.employeeId === employeeId && dragOverTarget.dateStr === dateStr
}

async function onDrop(targetEmployeeId, targetDateStr) {
  if (!draggedAssignment.value) return
  const src = draggedAssignment.value
  dragOverTarget.employeeId = null
  dragOverTarget.dateStr = null

  if (src.employee_id === targetEmployeeId && src.assignment_date === targetDateStr) {
    return // Dropped on self
  }

  if (isStaffOnLeave(targetEmployeeId, targetDateStr)) {
    $q.notify({ type: 'warning', message: 'Cannot move shift: Staff member is on approved leave on that date.' })
    return
  }

  try {
    const targetExisting = getAssignment(targetEmployeeId, targetDateStr)

    if (targetExisting) {
      // SWAP SHIFTS
      await supabase
        .from('shift_assignments')
        .update({ shift_id: targetExisting.shift_id })
        .eq('id', src.id)

      await supabase
        .from('shift_assignments')
        .update({ shift_id: src.shift_id })
        .eq('id', targetExisting.id)

      $q.notify({ type: 'positive', message: 'Shifts swapped successfully!' })
    } else {
      // MOVE SHIFT
      await supabase
        .from('shift_assignments')
        .update({
          employee_id: targetEmployeeId,
          assignment_date: targetDateStr,
        })
        .eq('id', src.id)

      $q.notify({ type: 'positive', message: 'Shift moved successfully!' })
    }

    await loadRosterData()
  } catch (err) {
    console.error('Failed to move/swap shift:', err)
    $q.notify({ type: 'negative', message: `Drag-drop failed: ${err.message}` })
  }
}

// ── Smart Actions: Copy Previous Week ───────────────────────────────────────
async function confirmCopyPreviousWeek() {
  try {
    copyingWeek.value = true
    const prevWeekStart = new Date(currentWeekStart.value)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)
    const prevStartStr = toYmd(prevWeekStart)
    const prevEnd = new Date(prevWeekStart)
    prevEnd.setDate(prevWeekStart.getDate() + 6)
    const prevEndStr = toYmd(prevEnd)

    const branchId = authStore.currentBranch?.id
    const { data: prevAssignments, error } = await supabase
      .from('shift_assignments')
      .select('id, employee_id, shift_id, assignment_date')
      .eq('branch_id', branchId)
      .gte('assignment_date', prevStartStr)
      .lte('assignment_date', prevEndStr)

    if (error) throw error

    if (!prevAssignments || prevAssignments.length === 0) {
      $q.notify({ type: 'warning', message: 'No shift assignments found in the previous week to copy.' })
      return
    }

    copyConfirmDialog.count = prevAssignments.length
    copyConfirmDialog.prevWeekLabel = `${prevStartStr} to ${prevEndStr}`
    copyConfirmDialog.assignmentsToCopy = prevAssignments
    copyConfirmDialog.open = true
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    copyingWeek.value = false
  }
}

async function executeCopyPreviousWeek() {
  copyConfirmDialog.open = false
  copyingWeek.value = true
  try {
    const branchId = authStore.currentBranch?.id
    const companyId = authStore.currentBranch?.company_id

    const rowsToInsert = []
    for (const a of copyConfirmDialog.assignmentsToCopy) {
      const origDate = new Date(a.assignment_date)
      const newDate = new Date(origDate)
      newDate.setDate(origDate.getDate() + 7)
      const newDateStr = toYmd(newDate)

      rowsToInsert.push({
        company_id: companyId,
        branch_id: branchId,
        employee_id: a.employee_id,
        shift_id: a.shift_id,
        assignment_date: newDateStr,
        status: 'scheduled',
      })
    }

    // Upsert batch
    const { error } = await supabase
      .from('shift_assignments')
      .upsert(rowsToInsert, { onConflict: 'employee_id,shift_id,assignment_date' })

    if (error) throw error

    $q.notify({ type: 'positive', message: `Successfully copied ${rowsToInsert.length} shift assignments!` })
    await loadRosterData()
  } catch (err) {
    console.error('Copy week error:', err)
    $q.notify({ type: 'negative', message: `Copy failed: ${err.message}` })
  } finally {
    copyingWeek.value = false
  }
}

function confirmClearWeek() {
  $q.dialog({
    title: 'Clear Week Roster',
    message: `Are you sure you want to delete all ${totalWeekAssignmentsCount.value} shift assignments for ${formattedWeekRange.value}?`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      loading.value = true
      const startDateStr = weekDays.value[0].dateStr
      const endDateStr = weekDays.value[6].dateStr
      const branchId = authStore.currentBranch?.id

      const { error } = await supabase
        .from('shift_assignments')
        .delete()
        .eq('branch_id', branchId)
        .gte('assignment_date', startDateStr)
        .lte('assignment_date', endDateStr)

      if (error) throw error

      $q.notify({ type: 'positive', message: 'Week schedule cleared' })
      assignments.value = []
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    } finally {
      loading.value = false
    }
  })
}

// ── Data Fetching ───────────────────────────────────────────────────────────
async function loadRosterData() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const startDateStr = weekDays.value[0].dateStr
    const endDateStr = weekDays.value[6].dateStr

    // 1. Fetch shifts
    const { data: shiftData } = await supabase
      .from('shifts')
      .select('*')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('start_time')

    shifts.value = shiftData || []

    // 2. Fetch departments
    const { data: deptData } = await supabase
      .from('departments')
      .select('id, name')
      .order('name')

    departments.value = deptData || []

    // 3. Fetch active employees
    const { data: empData } = await supabase
      .from('employees')
      .select('id, full_name, employee_code, department_id, photo_url, departments(id, name)')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('full_name')

    employees.value = empData || []

    // 4. Fetch shift assignments for this 7-day range
    const { data: asgnData, error: asgnErr } = await supabase
      .from('shift_assignments')
      .select('id, employee_id, shift_id, assignment_date, status, shifts(id, name, start_time, end_time, break_duration_minutes, is_overnight)')
      .eq('branch_id', branchId)
      .gte('assignment_date', startDateStr)
      .lte('assignment_date', endDateStr)

    if (asgnErr) console.error('asgnErr:', asgnErr)
    assignments.value = asgnData || []

    // 5. Fetch approved leaves for this range
    const { data: leaveData } = await supabase
      .from('leave_requests')
      .select('id, employee_id, start_date, end_date, status, leave_types(name)')
      .eq('branch_id', branchId)
      .eq('status', 'approved')
      .lte('start_date', endDateStr)
      .gte('end_date', startDateStr)

    leaveRequests.value = leaveData || []
  } catch (err) {
    console.error('Error loading roster data:', err)
  } finally {
    loading.value = false
  }
}

// Keyboard shortcuts (Escape exits Stamp mode)
function onKeyDown(e) {
  if (e.key === 'Escape' && activeStampShiftId.value) {
    activeStampShiftId.value = null
  }
}

onMounted(() => {
  loadRosterData()
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})

defineExpose({
  loadRosterData,
  goToCurrentWeek,
})
</script>

<style scoped>
.visual-roster-container {
  width: 100%;
}

.roster-control-card {
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.week-nav-group {
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
}

.body--dark .week-nav-group {
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.shift-stamp-chip {
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 11px;
}

.shift-stamp-chip:hover {
  transform: translateY(-1px);
}

.stamp-active-notice {
  background: rgba(255, 152, 0, 0.12);
  border: 1px dashed #ff9800;
  border-radius: 6px;
  padding: 3px 8px;
}

/* ── Matrix Table Styling ─────────────────────────────────────────────────── */
.roster-grid-wrapper {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
  overflow: hidden;
}

.roster-grid-wrapper.dark-mode {
  background: #1e1e1e;
  border-color: rgba(255, 255, 255, 0.1);
}

.roster-table-scroll {
  max-height: calc(100vh - 240px);
  overflow: auto;
}

.roster-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

/* ── Column widths ────────────────────────────────────────────────────────── */
.staff-header-cell,
.staff-info-cell {
  width: 260px;
  min-width: 260px;
  max-width: 260px;
}

.day-header-cell,
.roster-cell {
  width: 155px;
  min-width: 140px;
}

/* ── Sticky Freeze Left Column ────────────────────────────────────────────── */
.sticky-col {
  position: sticky;
  left: 0;
  z-index: 5;
  background-color: inherit;
}

.header-row th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #f8fafc;
  padding: 10px 12px;
  border-bottom: 2px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
}

.dark-mode .header-row th {
  background: #252525;
  border-bottom: 2px solid #333333;
  border-right: 1px solid #333333;
}

.header-row th.sticky-col {
  z-index: 15;
  background: #f1f5f9;
}

.dark-mode .header-row th.sticky-col {
  background: #2a2a2a;
}

/* ── Day Header Cell ──────────────────────────────────────────────────────── */
.day-name {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #475569;
}

.dark-mode .day-name {
  color: #94a3b8;
}

.day-number {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.dark-mode .day-number {
  color: #f1f5f9;
}

.today-column-header {
  background: #eff6ff !important;
  border-top: 3px solid #0284c7;
}

.dark-mode .today-column-header {
  background: #1e293b !important;
  border-top: 3px solid #38bdf8;
}

.today-badge {
  color: #0284c7 !important;
}

.today-chip {
  font-size: 9px;
  padding: 1px 5px;
  margin-top: 2px;
}

.coverage-pill {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 4px;
  display: inline-block;
}

/* ── Data Rows ────────────────────────────────────────────────────────────── */
.staff-data-row td {
  border-bottom: 1px solid #f1f5f9;
  border-right: 1px solid #f1f5f9;
  vertical-align: top;
  padding: 6px;
  background-color: #ffffff;
}

.dark-mode .staff-data-row td {
  border-bottom: 1px solid #2d2d2d;
  border-right: 1px solid #2d2d2d;
  background-color: #1e1e1e;
}

.staff-data-row:hover td {
  background-color: #fcfdfe;
}

.dark-mode .staff-data-row:hover td {
  background-color: #242424;
}

.staff-info-cell {
  background-color: #f8fafc !important;
  padding: 8px 12px !important;
  border-right: 2px solid #e2e8f0 !important;
}

.dark-mode .staff-info-cell {
  background-color: #252525 !important;
  border-right: 2px solid #383838 !important;
}

.staff-name {
  font-size: 13px;
  line-height: 1.2;
}

.dept-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
}

/* ── Roster Cell Content ──────────────────────────────────────────────────── */
.roster-cell {
  position: relative;
  height: 82px;
  transition: all 0.15s ease;
  cursor: pointer;
}

.today-column-cell {
  background-color: #f0f7ff !important;
}

.dark-mode .today-column-cell {
  background-color: #192535 !important;
}

.roster-cell:hover {
  background-color: #f1f5f9 !important;
}

.dark-mode .roster-cell:hover {
  background-color: #2a2a2a !important;
}

.roster-cell.is-drag-over {
  background-color: #ecfdf5 !important;
  border: 2px dashed #10b981 !important;
  transform: scale(0.98);
}

/* Shift Pill Card */
.shift-pill-card {
  height: 100%;
  border-radius: 8px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  cursor: grab;
  transition: all 0.15s ease;
  position: relative;
}

.shift-pill-card:hover {
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

.shift-pill-card:active {
  cursor: grabbing;
}

.shift-pill-title {
  font-size: 12px;
  line-height: 1.2;
}

.shift-pill-time {
  font-size: 10px;
  opacity: 0.9;
  font-family: monospace;
}

.shift-remove-btn {
  opacity: 0;
  transition: opacity 0.15s;
  color: inherit;
}

.shift-pill-card:hover .shift-remove-btn {
  opacity: 0.8;
}

.shift-remove-btn:hover {
  opacity: 1 !important;
  background: rgba(0, 0, 0, 0.15);
}

/* Empty Cell */
.empty-cell-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px dashed rgba(0, 0, 0, 0.08);
  transition: all 0.15s ease;
}

.dark-mode .empty-cell-content {
  border-color: rgba(255, 255, 255, 0.08);
}

.off-label {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.add-shift-btn {
  display: none;
  color: #0284c7;
}

.roster-cell:hover .empty-cell-content {
  border-color: #0284c7;
  background: rgba(2, 132, 199, 0.04);
}

.roster-cell:hover .off-label {
  display: none;
}

.roster-cell:hover .add-shift-btn {
  display: block;
}

.ghost-stamp-preview {
  font-size: 10px;
  font-weight: 700;
  color: #ff9800;
  background: rgba(255, 152, 0, 0.15);
  border: 1px dashed #ff9800;
  padding: 4px;
  border-radius: 4px;
  text-align: center;
}

/* Leave Cell */
.leave-cell-content {
  height: 100%;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}

.dark-mode .leave-cell-content {
  background: #4c0519;
  border-color: #881337;
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
</style>
