<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="hr"
      title="Leave Management"
      breadcrumbs="Human Resources / Leave Management"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="pending_actions" size="36px" color="amber" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Pending Requests</div>
              <div class="text-h5 text-weight-bold text-amber">{{ kpi.pending }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="check_circle" size="36px" color="green" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Approved This Month</div>
              <div class="text-h5 text-weight-bold text-green">{{ kpi.approvedMonth }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="cancel" size="36px" color="red" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Rejected This Month</div>
              <div class="text-h5 text-weight-bold text-red">{{ kpi.rejectedMonth }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="category" size="36px" color="cyan" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Leave Types</div>
              <div class="text-h5 text-weight-bold">{{ kpi.types }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Main Tabs Card -->
    <q-card
      flat
      bordered
      style="
        background: var(--erp-bg-form-card, #111827);
        border-color: rgba(255, 255, 255, 0.08);
        border-top: 3px solid #f9a825;
      "
    >
      <div class="row items-center justify-between q-px-md q-pt-sm">
        <q-tabs
          v-model="activeTab"
          dark
          dense
          align="left"
          active-color="amber-4"
          indicator-color="amber-4"
        >
          <q-tab name="requests" icon="event_note" label="Leave Requests" />
          <q-tab name="types" icon="category" label="Leave Types" />
          <q-tab name="balances" icon="balance" label="Balances" />
        </q-tabs>
        <div class="q-gutter-sm">
          <q-btn
            v-if="activeTab === 'requests'"
            unelevated
            color="amber-8"
            text-color="dark"
            icon="add"
            label="New Request"
            no-caps
            size="sm"
            @click="openNewRequest"
          />
          <q-btn
            v-if="activeTab === 'types'"
            unelevated
            color="amber-8"
            text-color="dark"
            icon="add"
            label="Add Leave Type"
            no-caps
            size="sm"
            @click="openLeaveTypeDialog()"
          />
          <q-btn
            v-if="activeTab === 'balances'"
            outline
            color="amber-8"
            icon="refresh"
            label="Initialize All Balances"
            no-caps
            size="sm"
            :loading="initializingAll"
            @click="initAllBalances"
          />
        </div>
      </div>
      <q-separator dark style="opacity: 0.08" />

      <q-tab-panels v-model="activeTab" animated style="background: transparent">
        <!-- ══ LEAVE REQUESTS TAB ══════════════════════════════════════════ -->
        <q-tab-panel name="requests" class="q-pa-md">
          <!-- Filters -->
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-12 col-sm-3">
              <q-select
                dark
                dense
                outlined
                v-model="reqStatusFilter"
                :options="[
                  { label: 'All Statuses', value: '' },
                  { label: 'Pending', value: 'pending' },
                  { label: 'Approved', value: 'approved' },
                  { label: 'Rejected', value: 'rejected' },
                  { label: 'Cancelled', value: 'cancelled' },
                ]"
                label="Status"
                emit-value
                map-options
              />
            </div>
            <div class="col-12 col-sm-3">
              <q-select
                dark
                dense
                outlined
                v-model="reqEmpFilter"
                :options="[{ label: 'All Employees', value: '' }, ...employeeOptions]"
                label="Employee"
                emit-value
                map-options
                clearable
              />
            </div>
            <div class="col-12 col-sm-3">
              <q-select
                dark
                dense
                outlined
                v-model="reqTypeFilter"
                :options="[{ label: 'All Types', value: '' }, ...leaveTypeOptions]"
                label="Leave Type"
                emit-value
                map-options
                clearable
              />
            </div>
            <div class="col-12 col-sm-3">
              <q-input
                dark
                dense
                outlined
                v-model="reqDateFilter"
                type="month"
                label="Month"
                stack-label
                clearable
              />
            </div>
          </div>

          <q-table
            dark
            flat
            bordered
            :rows="filteredRequests"
            :columns="requestColumns"
            row-key="id"
            :loading="loadingRequests"
            :pagination="{ rowsPerPage: 15 }"
            class="erp-data-grid"
          >
            <template #body-cell-employee="props">
              <q-td :props="props">
                <div class="text-weight-medium text-grey-2">
                  {{ props.row.employees?.full_name || props.row.employees?.first_name }}
                </div>
                <div class="text-caption text-grey-5">{{ props.row.employees?.employee_code }}</div>
              </q-td>
            </template>

            <template #body-cell-leave_type="props">
              <q-td :props="props">
                <q-badge
                  :color="props.row.leave_types?.is_paid ? 'green-9' : 'orange-9'"
                  :label="props.row.leave_types?.name || '—'"
                />
              </q-td>
            </template>

            <template #body-cell-dates="props">
              <q-td :props="props">
                <div class="text-caption text-grey-3">
                  {{ props.row.start_date }} → {{ props.row.end_date }}
                </div>
                <div class="text-caption text-amber">{{ props.row.total_days }} day(s)</div>
              </q-td>
            </template>

            <template #body-cell-status="props">
              <q-td :props="props" class="text-center">
                <q-badge
                  :color="statusColor(props.row.status)"
                  :label="props.row.status"
                  class="text-capitalize"
                />
              </q-td>
            </template>

            <template #body-cell-actions="props">
              <q-td :props="props" class="q-gutter-xs">
                <template v-if="props.row.status === 'pending'">
                  <q-btn
                    flat
                    dense
                    round
                    icon="check_circle"
                    color="green"
                    size="sm"
                    @click="approveRequest(props.row)"
                  >
                    <q-tooltip>Approve</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    round
                    icon="cancel"
                    color="negative"
                    size="sm"
                    @click="openRejectDialog(props.row)"
                  >
                    <q-tooltip>Reject</q-tooltip>
                  </q-btn>
                </template>
                <q-btn
                  flat
                  dense
                  round
                  icon="delete"
                  color="negative"
                  size="xs"
                  @click="deleteRequest(props.row)"
                >
                  <q-tooltip>Delete</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ LEAVE TYPES TAB ════════════════════════════════════════════ -->
        <q-tab-panel name="types" class="q-pa-md">
          <q-table
            dark
            flat
            bordered
            :rows="leaveTypes"
            :columns="typeColumns"
            row-key="id"
            :loading="loadingTypes"
            :pagination="{ rowsPerPage: 20 }"
            class="erp-data-grid"
          >
            <template #body-cell-is_paid="props">
              <q-td :props="props" class="text-center">
                <q-badge
                  :color="props.row.is_paid ? 'green' : 'orange'"
                  :label="props.row.is_paid ? 'Paid' : 'Unpaid'"
                />
              </q-td>
            </template>
            <template #body-cell-carry_forward="props">
              <q-td :props="props" class="text-center">
                <q-icon
                  :name="props.row.carry_forward ? 'check' : 'close'"
                  :color="props.row.carry_forward ? 'green' : 'grey'"
                />
                <span v-if="props.row.carry_forward" class="text-caption text-grey-4 q-ml-xs"
                  >max {{ props.row.max_carry_forward_days }}d</span
                >
              </q-td>
            </template>
            <template #body-cell-is_active="props">
              <q-td :props="props" class="text-center">
                <q-toggle
                  :model-value="props.row.is_active"
                  color="green"
                  size="sm"
                  @update:model-value="toggleLeaveType(props.row)"
                />
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" class="q-gutter-xs">
                <q-btn
                  flat
                  dense
                  round
                  icon="edit"
                  color="amber"
                  size="sm"
                  @click="openLeaveTypeDialog(props.row)"
                >
                  <q-tooltip>Edit</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  dense
                  round
                  icon="delete"
                  color="negative"
                  size="sm"
                  @click="deleteLeaveType(props.row)"
                >
                  <q-tooltip>Delete</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ LEAVE BALANCES TAB ═════════════════════════════════════════ -->
        <q-tab-panel name="balances" class="q-pa-md">
          <div class="row q-col-gutter-sm q-mb-md items-center">
            <div class="col-auto">
              <q-select
                dark
                dense
                outlined
                v-model="balanceYear"
                :options="yearOptions"
                label="Year"
                style="width: 120px"
                @update:model-value="loadBalances"
              />
            </div>
            <div class="col-auto">
              <q-select
                dark
                dense
                outlined
                v-model="balanceEmpFilter"
                :options="[{ label: 'All Employees', value: '' }, ...employeeOptions]"
                label="Employee"
                emit-value
                map-options
                clearable
                style="width: 220px"
              />
            </div>
            <div class="col-auto">
              <q-select
                dark
                dense
                outlined
                v-model="balanceTypeFilter"
                :options="[{ label: 'All Types', value: '' }, ...leaveTypeOptions]"
                label="Leave Type"
                emit-value
                map-options
                clearable
                style="width: 200px"
              />
            </div>
          </div>

          <q-table
            dark
            flat
            bordered
            :rows="filteredBalances"
            :columns="balanceColumns"
            row-key="id"
            :loading="loadingBalances"
            :pagination="{ rowsPerPage: 25 }"
            class="erp-data-grid"
          >
            <template #body-cell-employee="props">
              <q-td :props="props">
                <div class="text-weight-medium text-grey-2">
                  {{ props.row.employees?.full_name || props.row.employees?.first_name }}
                </div>
                <div class="text-caption text-grey-5">{{ props.row.employees?.employee_code }}</div>
              </q-td>
            </template>
            <template #body-cell-leave_type="props">
              <q-td :props="props">
                <q-badge
                  :color="props.row.leave_types?.is_paid ? 'green-9' : 'orange-9'"
                  :label="props.row.leave_types?.name"
                />
              </q-td>
            </template>
            <template #body-cell-remaining_days="props">
              <q-td :props="props" class="text-center">
                <span
                  :class="
                    Number(props.row.remaining_days) > 0
                      ? 'text-green text-weight-bold'
                      : 'text-red text-weight-bold'
                  "
                >
                  {{ props.row.remaining_days }}
                </span>
              </q-td>
            </template>
            <template #body-cell-progress="props">
              <q-td :props="props" style="min-width: 120px">
                <q-linear-progress
                  :value="
                    props.row.total_entitlement > 0
                      ? props.row.used_days / props.row.total_entitlement
                      : 0
                  "
                  :color="Number(props.row.remaining_days) > 0 ? 'amber' : 'red'"
                  track-color="grey-8"
                  rounded
                  size="6px"
                />
                <div class="text-caption text-grey-5 q-mt-xs">
                  {{ props.row.used_days }} / {{ props.row.total_entitlement }} used
                </div>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>

    <!-- ══ NEW LEAVE REQUEST DIALOG ══════════════════════════════════════ -->
    <q-dialog v-model="showNewRequest" persistent>
      <q-card style="min-width: 520px; background: #111827; color: #fff">
        <q-card-section class="row items-center">
          <q-icon name="event_note" size="24px" color="amber-6" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">New Leave Request</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator dark />
        <q-card-section class="q-gutter-md">
          <q-select
            dark
            outlined
            v-model="reqForm.employee_id"
            :options="employeeOptions"
            label="Employee *"
            emit-value
            map-options
          />
          <q-select
            dark
            outlined
            v-model="reqForm.leave_type_id"
            :options="activeLeaveTypeOptions"
            label="Leave Type *"
            emit-value
            map-options
          />
          <div class="row q-col-gutter-md">
            <div class="col-6">
              <q-input
                dark
                outlined
                v-model="reqForm.start_date"
                type="date"
                label="Start Date *"
                stack-label
                @update:model-value="calcDays"
              />
            </div>
            <div class="col-6">
              <q-input
                dark
                outlined
                v-model="reqForm.end_date"
                type="date"
                label="End Date *"
                stack-label
                @update:model-value="calcDays"
              />
            </div>
          </div>
          <div
            v-if="reqForm.start_date && reqForm.end_date"
            class="q-pa-sm rounded-borders text-center"
            style="background: rgba(249, 168, 37, 0.1); border: 1px solid rgba(249, 168, 37, 0.3)"
          >
            <span class="text-amber text-weight-bold">{{ reqForm.total_days }} working day(s)</span>
          </div>
          <q-input dark outlined v-model="reqForm.reason" label="Reason" type="textarea" rows="2" />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="amber-8"
            text-color="dark"
            icon="save"
            label="Submit Request"
            no-caps
            :loading="savingRequest"
            @click="saveLeaveRequest"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ REJECT REASON DIALOG ══════════════════════════════════════════ -->
    <q-dialog v-model="showRejectDialog" persistent>
      <q-card style="min-width: 420px; background: #111827; color: #fff">
        <q-card-section class="row items-center">
          <q-icon name="cancel" size="24px" color="negative" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">Reject Leave Request</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator dark />
        <q-card-section>
          <div class="text-caption text-grey-4 q-mb-sm">
            Rejecting leave for
            <strong class="text-white">{{ rejectTarget?.employees?.full_name }}</strong> ({{
              rejectTarget?.total_days
            }}
            day(s))
          </div>
          <q-input
            dark
            outlined
            v-model="rejectionReason"
            label="Reason for Rejection *"
            type="textarea"
            rows="3"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="negative"
            icon="cancel"
            label="Reject"
            no-caps
            :loading="rejectingRequest"
            @click="confirmReject"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ LEAVE TYPE DIALOG ══════════════════════════════════════════════ -->
    <q-dialog v-model="showLeaveTypeDialog" persistent>
      <q-card style="min-width: 480px; background: #111827; color: #fff">
        <q-card-section class="row items-center">
          <q-icon name="category" size="24px" color="cyan" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">
            {{ editingType ? 'Edit Leave Type' : 'New Leave Type' }}
          </div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator dark />
        <q-card-section class="q-gutter-md">
          <div class="row q-col-gutter-md">
            <div class="col-8">
              <q-input dark outlined v-model="typeForm.name" label="Leave Type Name *" />
            </div>
            <div class="col-4">
              <q-input
                dark
                outlined
                v-model="typeForm.code"
                label="Code *"
                hint="e.g. AL, SL, CL"
              />
            </div>
          </div>
          <div class="row q-col-gutter-md">
            <div class="col-6">
              <q-input
                dark
                outlined
                v-model.number="typeForm.annual_quota"
                type="number"
                label="Annual Quota (days) *"
              />
            </div>
            <div class="col-6 column justify-center">
              <q-toggle dark v-model="typeForm.is_paid" label="Paid Leave" color="green" />
            </div>
          </div>
          <div class="row q-col-gutter-md items-center">
            <div class="col-6">
              <q-toggle
                dark
                v-model="typeForm.carry_forward"
                label="Allow Carry Forward"
                color="blue"
              />
            </div>
            <div class="col-6" v-if="typeForm.carry_forward">
              <q-input
                dark
                outlined
                v-model.number="typeForm.max_carry_forward_days"
                type="number"
                label="Max Carry Forward (days)"
              />
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="cyan"
            icon="save"
            :label="editingType ? 'Update' : 'Create'"
            no-caps
            :loading="savingType"
            @click="saveLeaveType"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()

// ── Tab state ─────────────────────────────────────────────────────────────────
const activeTab = ref('requests')

// ── Leave Requests ─────────────────────────────────────────────────────────────
const requests = ref([])
const loadingRequests = ref(false)
const reqStatusFilter = ref('pending')
const reqEmpFilter = ref('')
const reqTypeFilter = ref('')
const reqDateFilter = ref('')

// ── Leave Types ────────────────────────────────────────────────────────────────
const leaveTypes = ref([])
const loadingTypes = ref(false)
const showLeaveTypeDialog = ref(false)
const editingType = ref(null)
const savingType = ref(false)
const typeForm = reactive({
  name: '',
  code: '',
  annual_quota: 14,
  is_paid: true,
  carry_forward: false,
  max_carry_forward_days: 0,
})

// ── Leave Balances ─────────────────────────────────────────────────────────────
const balances = ref([])
const loadingBalances = ref(false)
const initializingAll = ref(false)
const balanceYear = ref(new Date().getFullYear())
const balanceEmpFilter = ref('')
const balanceTypeFilter = ref('')

const yearOptions = computed(() => {
  const y = new Date().getFullYear()
  return [y - 1, y, y + 1]
})

// ── New request dialog ─────────────────────────────────────────────────────────
const showNewRequest = ref(false)
const savingRequest = ref(false)
const reqForm = reactive({
  employee_id: null,
  leave_type_id: null,
  start_date: '',
  end_date: '',
  total_days: 0,
  reason: '',
})

// ── Reject dialog ──────────────────────────────────────────────────────────────
const showRejectDialog = ref(false)
const rejectTarget = ref(null)
const rejectionReason = ref('')
const rejectingRequest = ref(false)

// ── Employees list (for dropdowns) ────────────────────────────────────────────
const allEmployees = ref([])
const employeeOptions = computed(() =>
  allEmployees.value.map((e) => ({
    label: `${e.full_name || e.first_name} (${e.employee_code})`,
    value: e.id,
  })),
)
const leaveTypeOptions = computed(() =>
  leaveTypes.value.map((t) => ({ label: t.name, value: t.id })),
)
const activeLeaveTypeOptions = computed(() =>
  leaveTypes.value
    .filter((t) => t.is_active)
    .map((t) => ({ label: `${t.name} (${t.code})`, value: t.id })),
)

// ── KPI ───────────────────────────────────────────────────────────────────────
const kpi = computed(() => {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return {
    pending: requests.value.filter((r) => r.status === 'pending').length,
    approvedMonth: requests.value.filter(
      (r) => r.status === 'approved' && (r.approved_at || '').startsWith(thisMonth),
    ).length,
    rejectedMonth: requests.value.filter(
      (r) => r.status === 'rejected' && (r.updated_at || '').startsWith(thisMonth),
    ).length,
    types: leaveTypes.value.length,
  }
})

// ── Filtered rows ─────────────────────────────────────────────────────────────
const filteredRequests = computed(() => {
  let rows = requests.value
  if (reqStatusFilter.value) rows = rows.filter((r) => r.status === reqStatusFilter.value)
  if (reqEmpFilter.value) rows = rows.filter((r) => r.employee_id === reqEmpFilter.value)
  if (reqTypeFilter.value) rows = rows.filter((r) => r.leave_type_id === reqTypeFilter.value)
  if (reqDateFilter.value) rows = rows.filter((r) => r.start_date?.startsWith(reqDateFilter.value))
  return rows
})

const filteredBalances = computed(() => {
  let rows = balances.value
  if (balanceEmpFilter.value) rows = rows.filter((b) => b.employee_id === balanceEmpFilter.value)
  if (balanceTypeFilter.value)
    rows = rows.filter((b) => b.leave_type_id === balanceTypeFilter.value)
  return rows
})

// ── Table columns ──────────────────────────────────────────────────────────────
const requestColumns = [
  { name: 'employee', label: 'Employee', align: 'left', field: 'employee_id' },
  { name: 'leave_type', label: 'Leave Type', align: 'left', field: 'leave_type_id' },
  { name: 'dates', label: 'Dates', align: 'left', field: 'start_date' },
  { name: 'reason', label: 'Reason', align: 'left', field: 'reason', format: (v) => v || '—' },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'actions', label: '', align: 'center', field: 'id' },
]

const typeColumns = [
  { name: 'name', label: 'Name', align: 'left', field: 'name' },
  { name: 'code', label: 'Code', align: 'center', field: 'code' },
  { name: 'annual_quota', label: 'Quota (days)', align: 'center', field: 'annual_quota' },
  { name: 'is_paid', label: 'Paid?', align: 'center', field: 'is_paid' },
  { name: 'carry_forward', label: 'Carry Forward', align: 'center', field: 'carry_forward' },
  { name: 'is_active', label: 'Active', align: 'center', field: 'is_active' },
  { name: 'actions', label: '', align: 'center', field: 'id' },
]

const balanceColumns = [
  { name: 'employee', label: 'Employee', align: 'left', field: 'employee_id' },
  { name: 'leave_type', label: 'Leave Type', align: 'left', field: 'leave_type_id' },
  { name: 'total_entitlement', label: 'Entitled', align: 'center', field: 'total_entitlement' },
  { name: 'used_days', label: 'Used', align: 'center', field: 'used_days' },
  { name: 'remaining_days', label: 'Remaining', align: 'center', field: 'remaining_days' },
  { name: 'progress', label: 'Usage', align: 'left', field: 'used_days' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusColor(s) {
  if (s === 'approved') return 'green'
  if (s === 'rejected') return 'negative'
  if (s === 'cancelled') return 'grey'
  return 'amber-8'
}

function calcDays() {
  if (!reqForm.start_date || !reqForm.end_date) {
    reqForm.total_days = 0
    return
  }
  const start = new Date(reqForm.start_date)
  const end = new Date(reqForm.end_date)
  if (end < start) {
    reqForm.total_days = 0
    return
  }
  let days = 0
  const cur = new Date(start)
  while (cur <= end) {
    const d = cur.getDay()
    if (d !== 0 && d !== 6) days++
    cur.setDate(cur.getDate() + 1)
  }
  reqForm.total_days = days
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadRequests() {
  loadingRequests.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return
    const { data, error } = await supabase
      .from('leave_requests')
      .select(
        '*, employees(id, full_name, first_name, employee_code), leave_types(id, name, is_paid)',
      )
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
    if (error) throw error
    requests.value = data || []
  } catch (err) {
    console.error('[Leave] loadRequests:', err.message)
  } finally {
    loadingRequests.value = false
  }
}

async function loadLeaveTypes() {
  loadingTypes.value = true
  try {
    const companyId = authStore.currentBranch?.company_id
    if (!companyId) return
    const { data, error } = await supabase
      .from('leave_types')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    if (error) throw error
    leaveTypes.value = data || []
  } catch (err) {
    console.error('[Leave] loadLeaveTypes:', err.message)
  } finally {
    loadingTypes.value = false
  }
}

async function loadBalances() {
  loadingBalances.value = true
  try {
    const companyId = authStore.currentBranch?.company_id
    if (!companyId) return
    const { data, error } = await supabase
      .from('leave_balances')
      .select(
        '*, employees(id, full_name, first_name, employee_code), leave_types(id, name, is_paid)',
      )
      .eq('company_id', companyId)
      .eq('year', balanceYear.value)
      .order('employee_id')
    if (error) throw error
    balances.value = data || []
  } catch (err) {
    console.error('[Leave] loadBalances:', err.message)
  } finally {
    loadingBalances.value = false
  }
}

async function loadEmployees() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  const { data } = await supabase
    .from('employees')
    .select('id, full_name, first_name, employee_code')
    .eq('branch_id', branchId)
    .order('first_name')
  allEmployees.value = data || []
}

// ── Actions — Requests ─────────────────────────────────────────────────────────
function openNewRequest() {
  Object.assign(reqForm, {
    employee_id: null,
    leave_type_id: null,
    start_date: '',
    end_date: '',
    total_days: 0,
    reason: '',
  })
  showNewRequest.value = true
}

async function saveLeaveRequest() {
  if (!reqForm.employee_id || !reqForm.leave_type_id || !reqForm.start_date || !reqForm.end_date) {
    $q.notify({ type: 'warning', message: 'Employee, leave type, and dates are required' })
    return
  }
  if (reqForm.total_days <= 0) {
    $q.notify({ type: 'warning', message: 'Invalid date range — no working days selected' })
    return
  }
  savingRequest.value = true
  try {
    const { error } = await supabase.from('leave_requests').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      employee_id: reqForm.employee_id,
      leave_type_id: reqForm.leave_type_id,
      start_date: reqForm.start_date,
      end_date: reqForm.end_date,
      total_days: reqForm.total_days,
      reason: reqForm.reason || null,
      status: 'pending',
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Leave request submitted' })
    showNewRequest.value = false
    loadRequests()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    savingRequest.value = false
  }
}

async function approveRequest(req) {
  try {
    const { error } = await supabase
      .from('leave_requests')
      .update({
        status: 'approved',
        approved_by: authStore.user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', req.id)
    if (error) throw error

    // Update leave balance used_days
    const year = new Date(req.start_date).getFullYear()
    const { data: bal } = await supabase
      .from('leave_balances')
      .select('id, used_days')
      .eq('employee_id', req.employee_id)
      .eq('leave_type_id', req.leave_type_id)
      .eq('year', year)
      .maybeSingle()
    if (bal) {
      await supabase
        .from('leave_balances')
        .update({ used_days: Number(bal.used_days) + Number(req.total_days) })
        .eq('id', bal.id)
    }

    $q.notify({ type: 'positive', message: 'Leave request approved' })
    loadRequests()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  }
}

function openRejectDialog(req) {
  rejectTarget.value = req
  rejectionReason.value = ''
  showRejectDialog.value = true
}

async function confirmReject() {
  if (!rejectionReason.value.trim()) {
    $q.notify({ type: 'warning', message: 'Please provide a rejection reason' })
    return
  }
  rejectingRequest.value = true
  try {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status: 'rejected', rejection_reason: rejectionReason.value })
      .eq('id', rejectTarget.value.id)
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Leave request rejected' })
    showRejectDialog.value = false
    loadRequests()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    rejectingRequest.value = false
  }
}

async function deleteRequest(req) {
  $q.dialog({
    title: 'Delete Request',
    message: 'Delete this leave request?',
    cancel: true,
    dark: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      const { error } = await supabase.from('leave_requests').delete().eq('id', req.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Request deleted' })
      loadRequests()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

// ── Actions — Leave Types ──────────────────────────────────────────────────────
function openLeaveTypeDialog(type = null) {
  editingType.value = type
  if (type) {
    Object.assign(typeForm, {
      name: type.name,
      code: type.code,
      annual_quota: type.annual_quota,
      is_paid: type.is_paid,
      carry_forward: type.carry_forward,
      max_carry_forward_days: type.max_carry_forward_days,
    })
  } else {
    Object.assign(typeForm, {
      name: '',
      code: '',
      annual_quota: 14,
      is_paid: true,
      carry_forward: false,
      max_carry_forward_days: 0,
    })
  }
  showLeaveTypeDialog.value = true
}

async function saveLeaveType() {
  if (!typeForm.name || !typeForm.code) {
    $q.notify({ type: 'warning', message: 'Name and code are required' })
    return
  }
  savingType.value = true
  try {
    const payload = {
      name: typeForm.name,
      code: typeForm.code.toUpperCase(),
      annual_quota: typeForm.annual_quota,
      is_paid: typeForm.is_paid,
      carry_forward: typeForm.carry_forward,
      max_carry_forward_days: typeForm.carry_forward ? typeForm.max_carry_forward_days : 0,
    }
    let error
    if (editingType.value) {
      ;({ error } = await supabase
        .from('leave_types')
        .update(payload)
        .eq('id', editingType.value.id))
    } else {
      ;({ error } = await supabase.from('leave_types').insert({
        ...payload,
        company_id: authStore.currentBranch?.company_id,
        is_active: true,
      }))
    }
    if (error) throw error
    $q.notify({
      type: 'positive',
      message: editingType.value ? 'Leave type updated' : 'Leave type created',
    })
    showLeaveTypeDialog.value = false
    loadLeaveTypes()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    savingType.value = false
  }
}

async function toggleLeaveType(type) {
  try {
    const { error } = await supabase
      .from('leave_types')
      .update({ is_active: !type.is_active })
      .eq('id', type.id)
    if (error) throw error
    type.is_active = !type.is_active
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  }
}

async function deleteLeaveType(type) {
  $q.dialog({
    title: 'Delete Leave Type',
    message: `Delete "${type.name}"? This cannot be undone.`,
    cancel: true,
    dark: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      const { error } = await supabase.from('leave_types').delete().eq('id', type.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Leave type deleted' })
      loadLeaveTypes()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

// ── Actions — Balances ─────────────────────────────────────────────────────────
async function initAllBalances() {
  initializingAll.value = true
  try {
    const { error } = await supabase.rpc('initialize_leave_balances', {
      p_year: balanceYear.value,
      p_employee_id: null,
    })
    if (error) throw error
    $q.notify({
      type: 'positive',
      message: `Leave balances initialized for all employees (${balanceYear.value})`,
    })
    loadBalances()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    initializingAll.value = false
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([loadRequests(), loadLeaveTypes(), loadEmployees()])
  loadBalances()
})
</script>
