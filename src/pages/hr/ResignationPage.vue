<template>
  <q-page class="q-pa-md">
    <ERPToolbar moduleName="hr" title="Resignations" breadcrumbs="Human Resources / Resignations" />

    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn
        color="deep-orange"
        icon="add"
        label="Submit Resignation"
        @click="openForm()"
        no-caps
      />
      <div class="q-gutter-x-sm q-ml-sm">
        <q-btn
          color="positive"
          icon="download"
          label="Excel"
          @click="exportExcel"
          no-caps
          unelevated
        />
        <q-btn
          color="red-6"
          icon="picture_as_pdf"
          label="PDF"
          @click="exportPDF"
          no-caps
          unelevated
        />
      </div>
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
          <q-btn
            v-if="props.row.status === 'approved'"
            flat
            dense
            icon="calculate"
            color="amber"
            size="sm"
            @click="openSettlement(props.row)"
            label="F&F"
            no-caps
          >
            <q-tooltip>Full & Final Settlement</q-tooltip>
          </q-btn>
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

    <!-- Full & Final Settlement Dialog -->
    <q-dialog v-model="showSettlement" persistent>
      <q-card
        style="
          width: 680px;
          max-width: 95vw;
          background: var(--erp-bg-form-card, #111827);
          color: #fff;
        "
      >
        <q-bar class="bg-grey-10">
          <q-icon name="calculate" color="amber" />
          <div class="q-ml-sm text-weight-bold">
            Full & Final Settlement — {{ settlementRow?.employees?.full_name }}
          </div>
          <q-space />
          <q-btn dense flat icon="close" @click="showSettlement = false" />
        </q-bar>

        <q-card-section v-if="loadingSettlement" class="text-center q-pa-xl">
          <q-spinner size="40px" color="amber" />
          <div class="q-mt-sm text-grey-5">Calculating settlement…</div>
        </q-card-section>

        <q-card-section v-else-if="settlement" class="q-gutter-sm">
          <!-- Key Info Strip -->
          <div class="row q-col-gutter-sm text-caption">
            <div class="col-6 col-sm-3">
              <div class="q-pa-sm rounded-borders" style="background: rgba(255, 255, 255, 0.04)">
                <div class="text-grey-5">Hire Date</div>
                <div class="text-weight-bold">{{ settlement.hire_date }}</div>
              </div>
            </div>
            <div class="col-6 col-sm-3">
              <div class="q-pa-sm rounded-borders" style="background: rgba(255, 255, 255, 0.04)">
                <div class="text-grey-5">Last Day</div>
                <div class="text-weight-bold">{{ settlement.last_working_day }}</div>
              </div>
            </div>
            <div class="col-6 col-sm-3">
              <div class="q-pa-sm rounded-borders" style="background: rgba(255, 255, 255, 0.04)">
                <div class="text-grey-5">Service</div>
                <div class="text-weight-bold">{{ settlement.years_of_service }} yrs</div>
              </div>
            </div>
            <div class="col-6 col-sm-3">
              <div class="q-pa-sm rounded-borders" style="background: rgba(255, 255, 255, 0.04)">
                <div class="text-grey-5">Daily Rate</div>
                <div class="text-weight-bold">LKR {{ fmtS(settlement.daily_rate) }}</div>
              </div>
            </div>
          </div>

          <!-- Earnings Table -->
          <div>
            <div class="text-subtitle2 text-weight-bold text-green row items-center q-mb-xs">
              <q-icon name="trending_up" class="q-mr-xs" /> Earnings
            </div>
            <q-markup-table
              dark
              flat
              bordered
              dense
              separator="cell"
              style="background: rgba(255, 255, 255, 0.02)"
            >
              <tbody>
                <tr>
                  <td class="text-grey-4 text-caption">
                    Pro-Rata Salary ({{ settlement.days_worked_last_month }} days × LKR
                    {{ fmtS(settlement.daily_rate) }})
                  </td>
                  <td class="text-right text-white text-caption">
                    LKR {{ fmtS(settlement.pro_rata_salary) }}
                  </td>
                </tr>
                <tr>
                  <td class="text-grey-4 text-caption">
                    Leave Encashment ({{ settlement.unused_leave_days }} days unused annual leave)
                  </td>
                  <td class="text-right text-white text-caption">
                    LKR {{ fmtS(settlement.leave_encashment) }}
                  </td>
                </tr>
                <tr>
                  <td class="text-grey-4 text-caption">
                    Gratuity (14 days × {{ settlement.years_of_service }} yrs × LKR
                    {{ fmtS(settlement.daily_rate) }})
                    <q-badge
                      v-if="!settlement.gratuity_eligible"
                      color="grey"
                      label="Not eligible (<5 yrs)"
                      class="q-ml-xs"
                      style="font-size: 9px"
                    />
                  </td>
                  <td class="text-right text-white text-caption">
                    LKR {{ fmtS(settlement.gratuity_amount) }}
                  </td>
                </tr>
                <tr style="border-top: 2px solid rgba(34, 197, 94, 0.4)">
                  <td class="text-green text-weight-bold text-caption">Total Earnings</td>
                  <td class="text-right text-green text-weight-bold text-caption">
                    LKR {{ fmtS(settlement.total_earnings) }}
                  </td>
                </tr>
              </tbody>
            </q-markup-table>
          </div>

          <!-- Deductions Table -->
          <div>
            <div class="text-subtitle2 text-weight-bold text-red row items-center q-mb-xs">
              <q-icon name="trending_down" class="q-mr-xs" /> Outstanding Recoveries
            </div>
            <q-markup-table
              dark
              flat
              bordered
              dense
              separator="cell"
              style="background: rgba(255, 255, 255, 0.02)"
            >
              <tbody>
                <tr>
                  <td class="text-grey-4 text-caption">Salary Advance Recovery</td>
                  <td class="text-right text-red-3 text-caption">
                    LKR {{ fmtS(settlement.advance_recovery) }}
                  </td>
                </tr>
                <tr>
                  <td class="text-grey-4 text-caption">Loan Recovery</td>
                  <td class="text-right text-red-3 text-caption">
                    LKR {{ fmtS(settlement.loan_recovery) }}
                  </td>
                </tr>
                <tr style="border-top: 2px solid rgba(239, 68, 68, 0.4)">
                  <td class="text-white text-weight-bold text-caption">Total Deductions</td>
                  <td class="text-right text-red text-weight-bold text-caption">
                    LKR {{ fmtS(settlement.total_deductions) }}
                  </td>
                </tr>
              </tbody>
            </q-markup-table>
          </div>

          <!-- Net Settlement Banner -->
          <div
            class="q-pa-md text-center rounded-borders"
            style="background: #1e3a5f; border: 1px solid #3b82f6"
          >
            <div class="text-caption text-blue-3 q-mb-xs">NET SETTLEMENT AMOUNT</div>
            <div class="text-h5 text-weight-bold text-blue">
              LKR {{ fmtS(settlement.net_settlement) }}
            </div>
          </div>

          <!-- Notes -->
          <q-input
            dark
            outlined
            v-model="settlementNotes"
            label="Notes (optional)"
            type="textarea"
            rows="2"
          />
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md q-gutter-sm" v-if="settlement">
          <q-btn flat label="Close" color="grey" no-caps @click="showSettlement = false" />
          <q-btn
            outline
            color="amber"
            label="Download PDF"
            icon="picture_as_pdf"
            no-caps
            @click="downloadSettlementPDF"
          />
          <q-btn
            v-if="!settlementRecord || settlementRecord.status === 'draft'"
            unelevated
            color="green"
            label="Approve Settlement"
            icon="done_all"
            no-caps
            :loading="approvingSettlement"
            @click="approveSettlement"
          />
          <q-btn
            v-if="settlementRecord?.status === 'approved'"
            unelevated
            color="primary"
            label="Pay Settlement"
            icon="payments"
            no-caps
            :loading="payingSettlement"
            @click="paySettlement"
          />
          <q-badge
            v-if="settlementRecord?.status === 'paid'"
            color="positive"
            label="PAID"
            class="q-pa-sm"
          />
        </q-card-actions>
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
  </q-page>
</template>

<script setup>
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'
import { ref, reactive, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { localYmd } from 'src/services/hr/hrDates'
import { useAuthStore } from 'stores/auth'
import {
  postFinalSettlementToFinance,
  FINANCE_POSTING_UNAVAILABLE,
} from 'src/services/hr/staffReceivableService'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

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
  resignation_date: localYmd(),
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
  const branchId = authStore.currentBranch?.id
  if (!branchId) {
    resignations.value = []
    return
  }
  loading.value = true
  try {
    let q = supabase
      .from('employee_resignations')
      .select('*, employees(full_name, employee_code)')
      .eq('branch_id', branchId)
      .order('resignation_date', { ascending: false })
    if (statusFilter.value !== 'All')
      q = q.eq('status', statusFilter.value.toLowerCase().replace(/ /g, '_'))
    const { data, error } = await q
    if (error) throw error
    resignations.value = data || []
  } catch (err) {
    $q.notify({ type: 'negative', message: `Failed to load resignations: ${err.message}` })
  } finally {
    loading.value = false
  }
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
    resignation_date: localYmd(),
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
  if (form.last_working_day && form.last_working_day < form.resignation_date) {
    $q.notify({ type: 'warning', message: 'Last working day cannot be before the resignation date' })
    return
  }
  saving.value = true
  try {
    const { error } = await supabase.from('employee_resignations').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      ...form,
      // '' is not a valid DATE — send NULL when the optional field is blank.
      last_working_day: form.last_working_day || null,
      created_by: authStore.user?.id,
    })
    if (error) throw error
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
  const { error } = await supabase.from('employee_resignations').update({ status }).eq('id', row.id)
  if (error) $q.notify({ type: 'negative', message: `Status not updated: ${error.message}` })
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
  if (!interviewDate.value) {
    $q.notify({ type: 'warning', message: 'Select an interview date' })
    return
  }
  const { error } = await supabase
    .from('employee_resignations')
    .update({
      status: 'interview_scheduled',
      interview_date: interviewDate.value,
      interviewed_by: interviewBy.value,
      interview_notes: interviewNotes.value,
    })
    .eq('id', selectedRow.value.id)
  if (error) {
    $q.notify({ type: 'negative', message: `Interview not scheduled: ${error.message}` })
    return
  }
  showInterview.value = false
  loadResignations()
}

async function approveResign(row) {
  $q.dialog({
    title: 'Approve Resignation',
    message: `Approve ${row.employees?.full_name}'s resignation? This will deactivate the employee.`,
    cancel: true,
    persistent: true,
    dark: $q.dark.isActive,
  }).onOk(async () => {
    const { error } = await supabase
      .from('employee_resignations')
      .update({
        status: 'approved',
        approved_by: authStore.user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (error) {
      $q.notify({ type: 'negative', message: `Resignation not approved: ${error.message}` })
      return
    }
    $q.notify({ type: 'positive', message: 'Resignation approved. Employee status changed.' })
    loadResignations()
  })
}

// ── Full & Final Settlement ─────────────────────────────────────────────────
const showSettlement = ref(false)
const loadingSettlement = ref(false)
const approvingSettlement = ref(false)
const settlementRow = ref(null)
const settlement = ref(null)
const settlementNotes = ref('')
// stored resignation_settlements row (id + status) — needed to pay it
const settlementRecord = ref(null)
const payingSettlement = ref(false)

async function loadSettlementRecord(resignationId) {
  const { data, error } = await supabase
    .from('resignation_settlements')
    .select('id, status')
    .eq('resignation_id', resignationId)
    .maybeSingle()
  settlementRecord.value = error ? null : data
}

const fmtS = (v) => Number(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })

async function openSettlement(row) {
  settlementRow.value = row
  settlement.value = null
  settlementRecord.value = null
  settlementNotes.value = ''
  showSettlement.value = true
  loadingSettlement.value = true
  try {
    const { data, error } = await supabase.rpc('calculate_final_settlement', {
      p_resignation_id: row.id,
    })
    if (error) throw error
    settlement.value = data
    await loadSettlementRecord(row.id)
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to calculate settlement: ' + err.message })
    showSettlement.value = false
  } finally {
    loadingSettlement.value = false
  }
}

async function approveSettlement() {
  if (!settlement.value) return
  approvingSettlement.value = true
  try {
    const { error } = await supabase
      .from('resignation_settlements')
      .update({
        status: 'approved',
        notes: settlementNotes.value || null,
        approved_by: authStore.user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq('resignation_id', settlementRow.value.id)
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Settlement approved successfully' })
    showSettlement.value = false
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    approvingSettlement.value = false
  }
}

// Pay an APPROVED settlement through Finance (#134b
// post_final_settlement_to_finance): Dr 7000 / Cr 1004 / Cr 2009 / Cr cash-bank,
// closes recovered advances/loans and marks the settlement 'paid'.
async function paySettlement() {
  if (!settlementRecord.value?.id) return
  const { data: accounts, error: accErr } = await supabase
    .from('finance_accounts')
    .select('id, registered_name, account_type')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('registered_name')
  if (accErr || !accounts?.length) {
    $q.notify({
      type: 'negative',
      message: accErr?.message || 'No active finance cash/bank account to pay from.',
    })
    return
  }
  const def = accounts.find((a) => a.account_type === 'cash') || accounts[0]
  $q.dialog({
    title: 'Pay Final Settlement',
    message: `Pay LKR ${fmtS(settlement.value?.net_settlement)} from:`,
    options: {
      type: 'radio',
      model: def.id,
      items: accounts.map((a) => ({
        label: `${a.registered_name}${a.account_type ? ' (' + a.account_type + ')' : ''}`,
        value: a.id,
      })),
    },
    cancel: true,
    persistent: true,
    dark: $q.dark.isActive,
  }).onOk(async (accountId) => {
    payingSettlement.value = true
    try {
      const res = await postFinalSettlementToFinance(supabase, settlementRecord.value.id, accountId)
      if (!res.ok) throw new Error(res.missing ? FINANCE_POSTING_UNAVAILABLE : res.error)
      $q.notify({ type: 'positive', message: 'Final settlement paid and posted to Finance' })
      await loadSettlementRecord(settlementRow.value.id)
    } catch (err) {
      $q.notify({ type: 'negative', message: `Settlement not paid: ${err.message}`, multiLine: true, timeout: 8000 })
    } finally {
      payingSettlement.value = false
    }
  })
}

function downloadSettlementPDF() {
  if (!settlement.value) return
  const s = settlement.value
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = margin

  // Header
  doc.setFillColor(17, 24, 39)
  doc.rect(0, 0, pageW, 32, 'F')
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(249, 168, 37)
  doc.text('FULL & FINAL SETTLEMENT', pageW / 2, 13, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(156, 163, 175)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-LK')}`, pageW / 2, 22, {
    align: 'center',
  })
  y = 40

  // Employee info
  autoTable(doc, {
    startY: y,
    head: [],
    body: [
      ['Employee', s.employee_name, 'Code', s.employee_code],
      ['Hire Date', s.hire_date, 'Last Day', s.last_working_day],
      ['Years of Service', s.years_of_service + ' yrs', 'Daily Rate', 'LKR ' + fmtS(s.daily_rate)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [80, 80, 80], cellWidth: 45 },
      1: { cellWidth: 55 },
      2: { fontStyle: 'bold', textColor: [80, 80, 80], cellWidth: 40 },
      3: { cellWidth: 45 },
    },
    margin: { left: margin, right: margin },
  })
  y = doc.lastAutoTable.finalY + 8

  // Earnings
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(34, 197, 94)
  doc.text('EARNINGS', margin, y)
  y += 2
  autoTable(doc, {
    startY: y,
    head: [['Component', 'Calculation', 'Amount (LKR)']],
    body: [
      [
        'Pro-Rata Salary',
        `${s.days_worked_last_month} days × LKR ${fmtS(s.daily_rate)}`,
        fmtS(s.pro_rata_salary),
      ],
      [
        'Leave Encashment',
        `${s.unused_leave_days} days × LKR ${fmtS(s.daily_rate)}`,
        fmtS(s.leave_encashment),
      ],
      [
        'Gratuity',
        s.gratuity_eligible
          ? `14 × ${s.years_of_service} yrs × LKR ${fmtS(s.daily_rate)}`
          : 'Not eligible (< 5 years)',
        fmtS(s.gratuity_amount),
      ],
      ['Total Earnings', '', fmtS(s.total_earnings)],
    ],
    theme: 'striped',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [22, 163, 74], textColor: 255 },
    columnStyles: { 2: { halign: 'right' } },
    margin: { left: margin, right: margin },
  })
  y = doc.lastAutoTable.finalY + 6

  // Deductions
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(239, 68, 68)
  doc.text('OUTSTANDING RECOVERIES', margin, y)
  y += 2
  autoTable(doc, {
    startY: y,
    head: [['Component', 'Amount (LKR)']],
    body: [
      ['Salary Advance Recovery', fmtS(s.advance_recovery)],
      ['Loan Recovery', fmtS(s.loan_recovery)],
      ['Total Deductions', fmtS(s.total_deductions)],
    ],
    theme: 'striped',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [220, 38, 38], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: margin, right: margin },
  })
  y = doc.lastAutoTable.finalY + 8

  // Net settlement
  doc.setFillColor(17, 24, 39)
  doc.rect(margin, y, pageW - margin * 2, 14, 'F')
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('NET SETTLEMENT:', margin + 4, y + 9)
  doc.setTextColor(96, 165, 250)
  doc.text('LKR ' + fmtS(s.net_settlement), pageW - margin - 4, y + 9, { align: 'right' })
  y += 20

  if (settlementNotes.value) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('Notes: ' + settlementNotes.value, margin, y)
    y += 8
  }

  // Signature
  y = Math.max(y, 240)
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, margin + 65, y)
  doc.line(pageW - margin - 65, y, pageW - margin, y)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('Employee Signature & Date', margin, y + 5)
  doc.text('HR / Finance Signature & Date', pageW - margin - 65, y + 5)

  doc.setFontSize(7)
  doc.setTextColor(160, 160, 160)
  doc.text('Restaurant ERP • Full & Final Settlement • Confidential', pageW / 2, 290, {
    align: 'center',
  })

  const filename = `F&F_${s.employee_code || 'emp'}_${localYmd()}.pdf`
  doc.save(filename)
  $q.notify({ type: 'positive', message: 'Settlement PDF downloaded' })
}

// ── Export List ──────────────────────────────────────────────────────────────
function exportPDF() {
  if (!resignations.value || resignations.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Resignations Report', 14, 15)

  doc.setFontSize(10)
  doc.setTextColor(100)
  if (statusFilter.value !== 'All') doc.text(`Status Filter: ${statusFilter.value}`, 14, 22)
  doc.text(
    `Total Records: ${resignations.value.length}`,
    14,
    statusFilter.value !== 'All' ? 27 : 22,
  )

  const head = [
    ['#', 'Employee Code', 'Employee Name', 'Resign Date', 'Last Day', 'Category', 'Status'],
  ]
  const body = resignations.value.map((r, i) => [
    i + 1,
    r.employees?.employee_code || '—',
    r.employees?.full_name || '—',
    r.resignation_date || '—',
    r.last_working_day || '—',
    (r.reason_category || '').replace('_', ' ') || '—',
    (r.status || '').replace('_', ' ') || '—',
  ])

  autoTable(doc, {
    startY: statusFilter.value !== 'All' ? 32 : 27,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [33, 150, 243] },
    styles: { fontSize: 8 },
  })

  doc.save('resignations_report.pdf')
}

function exportExcel() {
  if (!resignations.value || resignations.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const exportData = resignations.value.map((r, i) => ({
    '#': i + 1,
    'Employee Code': r.employees?.employee_code || '',
    'Employee Name': r.employees?.full_name || '',
    'Resign Date': r.resignation_date || '',
    'Last Day': r.last_working_day || '',
    Category: (r.reason_category || '').replace('_', ' '),
    Status: (r.status || '').replace('_', ' '),
  }))

  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Resignations')
  XLSX.writeFile(wb, 'resignations_report.xlsx')
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
