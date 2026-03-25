<template>
  <div class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h6">Attendance Overview</div>
      <q-space />
      <q-input
        dark
        dense
        outlined
        v-model="dateFilter"
        label="Date"
        type="date"
        style="width: 180px"
        class="q-mr-sm"
      />
      <q-btn color="primary" icon="refresh" label="Refresh" @click="loadAttendance" />
    </div>

    <!-- Attendance Summary Cards -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-6 col-sm-3">
        <q-card class="bg-green-9 text-white" flat>
          <q-card-section class="text-center">
            <div class="text-h4 text-weight-bold">{{ summary.present }}</div>
            <div class="text-caption">Present</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-6 col-sm-3">
        <q-card class="bg-red-9 text-white" flat>
          <q-card-section class="text-center">
            <div class="text-h4 text-weight-bold">{{ summary.absent }}</div>
            <div class="text-caption">Absent</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-6 col-sm-3">
        <q-card class="bg-orange-9 text-white" flat>
          <q-card-section class="text-center">
            <div class="text-h4 text-weight-bold">{{ summary.late }}</div>
            <div class="text-caption">Late</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-6 col-sm-3">
        <q-card class="bg-blue-9 text-white" flat>
          <q-card-section class="text-center">
            <div class="text-h4 text-weight-bold">{{ summary.onLeave }}</div>
            <div class="text-caption">On Leave</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Payroll-Linked Summary: Late / Short Leave -->
    <div class="q-mt-md q-mb-sm text-subtitle2 text-grey-4 row items-center q-gutter-xs">
      <q-icon name="attach_money" size="16px" color="amber" />
      <span>Payroll Impact Summary</span>
      <q-badge color="amber-8" text-color="dark" :label="dateFilter" class="q-ml-xs" />
    </div>
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-6 col-sm-3">
        <q-card class="bg-grey-9 text-white" flat>
          <q-card-section class="text-center q-pa-sm">
            <div class="text-h5 text-weight-bold text-orange">
              {{ payrollSummary.totalLateMinutes }}
            </div>
            <div class="text-caption text-grey-5">Total Late (min)</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-6 col-sm-3">
        <q-card class="bg-grey-9 text-white" flat>
          <q-card-section class="text-center q-pa-sm">
            <div class="text-h5 text-weight-bold text-amber">{{ payrollSummary.halfDays }}</div>
            <div class="text-caption text-grey-5">Half Days</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-6 col-sm-3">
        <q-card class="bg-grey-9 text-white" flat>
          <q-card-section class="text-center q-pa-sm">
            <div class="text-h5 text-weight-bold text-green">{{ payrollSummary.totalOTHours }}</div>
            <div class="text-caption text-grey-5">OT Hours</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-6 col-sm-3">
        <q-card class="bg-grey-9 text-white" flat>
          <q-card-section class="text-center q-pa-sm">
            <div class="text-h5 text-weight-bold text-blue">{{ payrollSummary.onLeave }}</div>
            <div class="text-caption text-grey-5">On Leave</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Attendance Table Component -->
    <AttendanceTable :records="records" :loading="loading" @toggle-holiday="onToggleHoliday" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import AttendanceTable from 'components/hr/AttendanceTable.vue'

const authStore = useAuthStore()
const loading = ref(false)
const records = ref([])
const dateFilter = ref(new Date().toISOString().split('T')[0])

const summary = reactive({ present: 0, absent: 0, late: 0, onLeave: 0 })

// Payroll-linked aggregates derived from the same records
const payrollSummary = computed(() => ({
  totalLateMinutes: records.value.reduce((sum, r) => sum + (r.late_minutes || 0), 0),
  halfDays: records.value.filter((r) => r.status === 'half_day').length,
  totalOTHours: records.value.reduce((sum, r) => sum + (r.overtime_hours || 0), 0).toFixed(1),
  onLeave: records.value.filter((r) => r.status === 'on_leave').length,
}))

async function loadAttendance() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const { data, error } = await supabase
      .from('attendance_records')
      .select('*, employees(full_name)')
      .eq('branch_id', branchId)
      .eq('attendance_date', dateFilter.value)
      .order('created_at', { ascending: false })

    if (error) throw error
    records.value = data || []

    summary.present = records.value.filter((r) => r.status === 'present').length
    summary.absent = records.value.filter((r) => r.status === 'absent').length
    summary.late = records.value.filter((r) => r.late_minutes > 0).length
    summary.onLeave = records.value.filter((r) => r.status === 'on_leave').length
  } catch (err) {
    console.error('Failed to load attendance:', err)
  } finally {
    loading.value = false
  }
}

async function onToggleHoliday({ id, value }) {
  try {
    const { error } = await supabase
      .from('attendance_records')
      .update({ is_public_holiday: value })
      .eq('id', id)
    if (error) throw error
    const rec = records.value.find((r) => r.id === id)
    if (rec) rec.is_public_holiday = value
  } catch (err) {
    console.error('[Attendance] Failed to update holiday flag:', err.message)
  }
}

watch(dateFilter, () => loadAttendance())
onMounted(() => loadAttendance())
</script>
