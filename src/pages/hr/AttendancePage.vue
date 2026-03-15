<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="hr"
      title="Attendance"
      breadcrumbs="Human Resources / Attendance"
    />

    <div class="row items-center q-mb-md q-gutter-sm">
      <q-input
        dark
        dense
        outlined
        v-model="filterDate"
        type="date"
        label="Date"
        style="width: 180px"
      />
      <q-btn color="primary" icon="refresh" label="Load" @click="loadAttendance" no-caps />
      <q-space />
      <q-input
        dark
        dense
        outlined
        v-model="search"
        placeholder="Search..."
        class="col-12 col-sm-3"
        clearable
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
    </div>

    <!-- KPI Row -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="erp-stat-card">
          <q-card-section class="q-pa-md">
            <div class="text-caption text-grey-5">Present</div>
            <div class="text-h5 text-weight-bold text-green">{{ stats.present }}</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="erp-stat-card">
          <q-card-section class="q-pa-md">
            <div class="text-caption text-grey-5">Absent</div>
            <div class="text-h5 text-weight-bold text-red">{{ stats.absent }}</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="erp-stat-card">
          <q-card-section class="q-pa-md">
            <div class="text-caption text-grey-5">Late</div>
            <div class="text-h5 text-weight-bold text-amber">{{ stats.late }}</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="erp-stat-card">
          <q-card-section class="q-pa-md">
            <div class="text-caption text-grey-5">On Leave</div>
            <div class="text-h5 text-weight-bold text-cyan">{{ stats.leave }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-table
      dark
      flat
      bordered
      :rows="records"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :filter="search"
      :pagination="{ rowsPerPage: 30 }"
      class="erp-data-grid"
    >
      <template #body-cell-employee="props">
        <q-td :props="props">
          <div class="text-weight-bold">{{ props.row.employees?.full_name }}</div>
          <div class="text-caption text-grey-5">{{ props.row.employees?.employee_code }}</div>
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
      <q-card style="min-width: 400px; background: var(--erp-bg-form-card, #111827); color: #fff">
        <q-card-section><div class="text-h6">Edit Attendance</div></q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input dark outlined v-model="editForm.check_in_time" label="Check In" type="time" />
          <q-input dark outlined v-model="editForm.check_out_time" label="Check Out" type="time" />
          <q-select
            dark
            outlined
            v-model="editForm.status"
            :options="['present', 'absent', 'late', 'half_day', 'on_leave']"
            label="Status"
          />
          <q-input
            dark
            outlined
            v-model.number="editForm.overtime_hours"
            label="OT Hours"
            type="number"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey" no-caps />
          <q-btn
            color="primary"
            label="Update"
            icon="save"
            @click="saveEdit"
            :loading="saving"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
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
const showEdit = ref(false)
const editForm = reactive({
  id: null,
  check_in_time: '',
  check_out_time: '',
  status: 'present',
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
  { name: 'checkin', label: 'Check In', align: 'center', field: 'check_in_time' },
  { name: 'checkout', label: 'Check Out', align: 'center', field: 'check_out_time' },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
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
  const branchId = authStore.currentBranch?.id
  const { data } = await supabase
    .from('attendance_records')
    .select('*, employees(full_name, employee_code)')
    .eq('branch_id', branchId)
    .eq('attendance_date', filterDate.value)
    .order('check_in_time', { ascending: true })
  records.value = data || []
  stats.present = records.value.filter((r) => r.status === 'present').length
  stats.absent = records.value.filter((r) => r.status === 'absent').length
  stats.late = records.value.filter((r) => r.status === 'late').length
  stats.leave = records.value.filter((r) => r.status === 'on_leave').length
  loading.value = false
}

function editRecord(row) {
  editForm.id = row.id
  editForm.check_in_time = row.check_in_time || ''
  editForm.check_out_time = row.check_out_time || ''
  editForm.status = row.status
  editForm.overtime_hours = row.overtime_hours || 0
  showEdit.value = true
}

async function saveEdit() {
  saving.value = true
  try {
    const { error } = await supabase
      .from('attendance_records')
      .update({
        check_in_time: editForm.check_in_time,
        check_out_time: editForm.check_out_time,
        status: editForm.status,
        overtime_hours: editForm.overtime_hours,
      })
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

onMounted(() => loadAttendance())
</script>

<style scoped>
.erp-data-grid {
  background: var(--erp-bg-form-card, #111827);
  border-radius: 12px;
}
.erp-stat-card {
  background: var(--erp-bg-form-card, #111827);
  border: 1px solid var(--erp-input-border, #374151);
  border-radius: 12px;
}
</style>
