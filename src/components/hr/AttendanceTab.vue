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

    <!-- Attendance Table Component -->
    <AttendanceTable :records="records" :loading="loading" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import AttendanceTable from 'components/hr/AttendanceTable.vue'

const authStore = useAuthStore()
const loading = ref(false)
const records = ref([])
const dateFilter = ref(new Date().toISOString().split('T')[0])

const summary = reactive({ present: 0, absent: 0, late: 0, onLeave: 0 })

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

watch(dateFilter, () => loadAttendance())
onMounted(() => loadAttendance())
</script>
