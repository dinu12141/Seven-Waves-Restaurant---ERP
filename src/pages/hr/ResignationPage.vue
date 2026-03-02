<template>
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn
        color="deep-orange"
        icon="add"
        label="Submit Resignation"
        @click="openForm()"
        no-caps
      />
      <q-space />
      <q-select
        dark
        dense
        outlined
        v-model="statusFilter"
        :options="[
          'All',
          'Submitted',
          'Under Review',
          'Interview Scheduled',
          'Approved',
          'Rejected',
          'Withdrawn',
        ]"
        label="Status"
        style="width: 200px"
      />
    </div>

    <q-table
      dark
      flat
      bordered
      :rows="resignations"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 15 }"
      class="erp-data-grid"
    >
      <template #body-cell-employee="props">
        <q-td :props="props">
          <div class="text-weight-bold">{{ props.row.employees?.full_name }}</div>
          <div class="text-caption text-grey-5">{{ props.row.employees?.employee_code }}</div>
        </q-td>
      </template>
      <template #body-cell-category="props">
        <q-td :props="props">
          <q-badge
            :color="catColor(props.row.reason_category)"
            :label="(props.row.reason_category || '').replace('_', ' ')"
            class="text-capitalize"
          />
        </q-td>
      </template>
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="stColor(props.row.status)"
            :label="(props.row.status || '').replace('_', ' ')"
            class="text-capitalize"
          />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn
            flat
            dense
            icon="visibility"
            color="primary"
            size="sm"
            @click="viewResign(props.row)"
            no-caps
          />
          <q-btn
            v-if="props.row.status === 'submitted'"
            flat
            dense
            icon="check"
            color="green"
            size="sm"
            @click="updateStatus(props.row, 'under_review')"
            label="Review"
            no-caps
          />
          <q-btn
            v-if="props.row.status === 'under_review'"
            flat
            dense
            icon="event"
            color="amber"
            size="sm"
            @click="scheduleInterview(props.row)"
            label="Interview"
            no-caps
          />
          <q-btn
            v-if="['under_review', 'interview_scheduled'].includes(props.row.status)"
            flat
            dense
            icon="done_all"
            color="green"
            size="sm"
            @click="approveResign(props.row)"
            label="Approve"
            no-caps
          />
        </q-td>
      </template>
    </q-table>

    <!-- Submit Resignation Dialog -->
    <q-dialog v-model="showForm" persistent>
      <q-card style="min-width: 600px; background: var(--erp-bg-form-card, #111827); color: #fff">
        <q-bar class="bg-grey-10"
          ><q-icon name="exit_to_app" />
          <div class="q-ml-sm">Employee Resignation</div>
          <q-space /><q-btn dense flat icon="close" @click="showForm = false"
        /></q-bar>
        <q-card-section class="q-gutter-md">
          <q-select
            dark
            outlined
            v-model="form.employee_id"
            :options="employeeOptions"
            label="Employee *"
            emit-value
            map-options
            :rules="[(v) => !!v || 'Required']"
          />
          <q-input
            dark
            outlined
            v-model="form.resignation_date"
            label="Resignation Date"
            type="date"
          />
          <q-input
            dark
            outlined
            v-model="form.last_working_day"
            label="Last Working Day"
            type="date"
          />
          <q-select
            dark
            outlined
            v-model="form.reason_category"
            :options="[
              'personal',
              'career',
              'relocation',
              'health',
              'compensation',
              'management',
              'other',
            ]"
            label="Category"
          />
          <q-input
            dark
            outlined
            v-model="form.reason"
            label="Reason *"
            type="textarea"
            rows="3"
            :rules="[(v) => !!v || 'Required']"
          />
          <div class="row justify-end q-gutter-sm">
            <q-btn flat label="Cancel" @click="showForm = false" color="grey" no-caps />
            <q-btn
              color="deep-orange"
              label="Submit"
              icon="send"
              @click="submitResign"
              :loading="saving"
              no-caps
            />
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- View Detail Dialog -->
    <q-dialog v-model="showDetail">
      <q-card style="min-width: 600px; background: var(--erp-bg-form-card, #111827); color: #fff">
        <q-card-section>
          <div class="text-h6 q-mb-md">Resignation Details</div>
          <div class="row q-col-gutter-md">
            <div class="col-6">
              <div class="text-caption text-grey-5">Employee</div>
              <div>{{ viewData?.employees?.full_name }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5">Date</div>
              <div>{{ viewData?.resignation_date }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5">Last Day</div>
              <div>{{ viewData?.last_working_day || '—' }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5">Category</div>
              <div class="text-capitalize">{{ viewData?.reason_category }}</div>
            </div>
            <div class="col-12">
              <div class="text-caption text-grey-5">Reason</div>
              <div>{{ viewData?.reason }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5">Status</div>
              <q-badge
                :color="stColor(viewData?.status)"
                :label="viewData?.status"
                class="text-capitalize"
              />
            </div>
            <div class="col-6" v-if="viewData?.interview_notes">
              <div class="text-caption text-grey-5">Interview Notes</div>
              <div>{{ viewData?.interview_notes }}</div>
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right"
          ><q-btn flat label="Close" v-close-popup color="grey" no-caps
        /></q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Interview Dialog -->
    <q-dialog v-model="showInterview">
      <q-card style="min-width: 400px; background: var(--erp-bg-form-card, #111827); color: #fff">
        <q-card-section class="q-gutter-md">
          <div class="text-h6">Schedule Exit Interview</div>
          <q-input dark outlined v-model="interviewDate" label="Interview Date" type="date" />
          <q-select
            dark
            outlined
            v-model="interviewBy"
            :options="employeeOptions"
            label="Interviewer"
            emit-value
            map-options
          />
          <q-input dark outlined v-model="interviewNotes" label="Notes" type="textarea" rows="3" />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey" no-caps />
          <q-btn color="primary" label="Schedule" icon="event" @click="confirmInterview" no-caps />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const resignations = ref([])
const statusFilter = ref('All')
const showForm = ref(false)
const showDetail = ref(false)
const showInterview = ref(false)
const viewData = ref(null)
const employeeOptions = ref([])
const selectedRow = ref(null)
const interviewDate = ref('')
const interviewBy = ref(null)
const interviewNotes = ref('')

const form = reactive({
  employee_id: null,
  resignation_date: new Date().toISOString().split('T')[0],
  last_working_day: '',
  reason: '',
  reason_category: 'personal',
})

const columns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (r) => r.employees?.full_name,
    sortable: true,
  },
  { name: 'date', label: 'Resign Date', align: 'left', field: 'resignation_date', sortable: true },
  { name: 'lastDay', label: 'Last Day', align: 'left', field: 'last_working_day' },
  { name: 'category', label: 'Category', align: 'center', field: 'reason_category' },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'actions', label: '', align: 'center' },
]

function catColor(c) {
  return (
    {
      personal: 'blue',
      career: 'teal',
      relocation: 'purple',
      health: 'red',
      compensation: 'amber',
      management: 'orange',
      terminated: 'red',
    }[c] || 'grey'
  )
}
function stColor(s) {
  return (
    {
      submitted: 'amber',
      under_review: 'blue',
      interview_scheduled: 'cyan',
      approved: 'green',
      rejected: 'red',
      withdrawn: 'grey',
    }[s] || 'grey'
  )
}

async function loadResignations() {
  loading.value = true
  const branchId = authStore.currentBranch?.id
  let q = supabase
    .from('employee_resignations')
    .select('*, employees(full_name, employee_code)')
    .eq('branch_id', branchId)
    .order('resignation_date', { ascending: false })
  if (statusFilter.value !== 'All')
    q = q.eq('status', statusFilter.value.toLowerCase().replace(/ /g, '_'))
  const { data } = await q
  resignations.value = data || []
  loading.value = false
}

async function loadHelpers() {
  const branchId = authStore.currentBranch?.id
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
}

function openForm() {
  Object.assign(form, {
    employee_id: null,
    resignation_date: new Date().toISOString().split('T')[0],
    last_working_day: '',
    reason: '',
    reason_category: 'personal',
  })
  showForm.value = true
}

async function submitResign() {
  if (!form.employee_id || !form.reason) {
    $q.notify({ type: 'warning', message: 'Fill required fields' })
    return
  }
  saving.value = true
  try {
    await supabase.from('employee_resignations').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      ...form,
      created_by: authStore.user?.id,
    })
    $q.notify({ type: 'positive', message: 'Resignation submitted' })
    showForm.value = false
    loadResignations()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

function viewResign(row) {
  viewData.value = row
  showDetail.value = true
}

async function updateStatus(row, status) {
  await supabase.from('employee_resignations').update({ status }).eq('id', row.id)
  loadResignations()
}

function scheduleInterview(row) {
  selectedRow.value = row
  interviewDate.value = ''
  interviewBy.value = null
  interviewNotes.value = ''
  showInterview.value = true
}

async function confirmInterview() {
  await supabase
    .from('employee_resignations')
    .update({
      status: 'interview_scheduled',
      interview_date: interviewDate.value,
      interviewed_by: interviewBy.value,
      interview_notes: interviewNotes.value,
    })
    .eq('id', selectedRow.value.id)
  showInterview.value = false
  loadResignations()
}

async function approveResign(row) {
  $q.dialog({
    title: 'Approve Resignation',
    message: `Approve ${row.employees?.full_name}'s resignation? This will deactivate the employee.`,
    cancel: true,
    persistent: true,
    dark: true,
  }).onOk(async () => {
    await supabase
      .from('employee_resignations')
      .update({
        status: 'approved',
        approved_by: authStore.user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    $q.notify({ type: 'positive', message: 'Resignation approved. Employee status changed.' })
    loadResignations()
  })
}

watch(statusFilter, () => loadResignations())
onMounted(() => {
  loadResignations()
  loadHelpers()
})
</script>

<style scoped>
.erp-data-grid {
  background: var(--erp-bg-form-card, #111827);
  border-radius: 12px;
}
</style>
