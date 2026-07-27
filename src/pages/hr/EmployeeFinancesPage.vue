<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="hr"
      title="Employee Finances"
      breadcrumbs="Human Resources / Employee Finances"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg items-stretch">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="hr-kpi-card hr-kpi-card--amber">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon"><q-icon name="request_quote" size="22px" color="white" /></div>
            <div style="flex: 1">
              <div class="hr-kpi-label">Pending Advances</div>
              <div class="hr-kpi-value">{{ kpi.pendingAdvances }}</div>
            </div>
            <q-icon name="currency_exchange" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="hr-kpi-card hr-kpi-card--cyan">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon"><q-icon name="receipt_long" size="22px" color="white" /></div>
            <div style="flex: 1">
              <div class="hr-kpi-label">Pending Expenses</div>
              <div class="hr-kpi-value">{{ kpi.pendingExpenses }}</div>
            </div>
            <q-icon name="receipt" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="hr-kpi-card hr-kpi-card--green">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon"><q-icon name="payments" size="22px" color="white" /></div>
            <div style="flex: 1">
              <div class="hr-kpi-label">Approved Adv. (MTD)</div>
              <div class="hr-kpi-value" style="font-size: 18px">
                {{ formatCurrency(kpi.approvedAdvancesMtd) }}
              </div>
            </div>
            <q-icon name="account_balance" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="hr-kpi-card hr-kpi-card--blue">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon">
              <q-icon name="account_balance_wallet" size="22px" color="white" />
            </div>
            <div style="flex: 1">
              <div class="hr-kpi-label">Approved Exp. (MTD)</div>
              <div class="hr-kpi-value" style="font-size: 18px">
                {{ formatCurrency(kpi.approvedExpensesMtd) }}
              </div>
            </div>
            <q-icon name="wallet" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Main Tabs Card -->
    <q-card
      flat
      bordered
      :class="[$q.dark.isActive ? 'bg-dark border-dark' : 'bg-white']"
      :style="{ borderTop: '3px solid #f9a825' }"
    >
      <div class="row items-center justify-between q-px-md q-pt-sm">
        <q-tabs
          v-model="activeTab"
          :dark="$q.dark.isActive"
          dense
          align="left"
          active-color="amber-9"
          indicator-color="amber-9"
          narrow-indicator
          no-caps
          :class="[$q.dark.isActive ? 'text-grey-5' : 'text-grey-7', 'text-weight-medium']"
        >
          <q-tab name="advances" label="Salary Advances" />
          <q-tab name="expenses" label="Expenses" />
        </q-tabs>
        <div class="q-gutter-sm">
          <q-btn
            v-if="activeTab === 'advances' && canManageFinance"
            unelevated
            color="amber-8"
            text-color="dark"
            icon="add"
            label="New Advance"
            no-caps
            dense
            padding="xs md"
            class="text-weight-medium"
            @click="openNewAdvance"
          />
          <q-btn
            v-if="activeTab === 'expenses' && canManageFinance"
            unelevated
            color="amber-8"
            text-color="dark"
            icon="add"
            label="New Expense"
            no-caps
            dense
            padding="xs md"
            class="text-weight-medium"
            @click="openNewExpense"
          />
        </div>
      </div>
      <q-separator :dark="$q.dark.isActive" />

      <q-tab-panels v-model="activeTab" animated style="background: transparent">
        <!-- ══ ADVANCES TAB ════════════════════════════════════════════════ -->
        <q-tab-panel name="advances" class="q-pa-md">
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-12 col-sm-4">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Status
              </div>
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="advFilter.status"
                :options="['', 'pending', 'approved', 'rejected', 'deducted']"
              >
                <template v-slot:selected v-if="advFilter.status">
                  <span class="text-capitalize">{{ advFilter.status }}</span>
                </template>
                <template v-slot:option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section class="text-capitalize">{{
                      scope.opt || 'All Statuses'
                    }}</q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
            <div class="col-12 col-sm-4">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Employee
              </div>
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="advFilter.employee"
                :options="[{ label: 'All Employees', value: '' }, ...employeeOptions]"
                emit-value
                map-options
                clearable
              />
            </div>
            <div class="col-12 col-sm-4">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Request Month
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="advFilter.month"
                type="month"
                clearable
              />
            </div>
          </div>

          <q-table
            :dark="$q.dark.isActive"
            flat
            bordered
            dense
            :rows="filteredAdvances"
            :columns="advColumns"
            row-key="id"
            :loading="loadingAdvances"
            :pagination="{ rowsPerPage: 15 }"
            :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'text-body2']"
            table-header-class="text-weight-bold text-uppercase"
          >
            <template #body-cell-employee="props">
              <q-td :props="props">
                <div :class="['text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-dark']">
                  {{ props.row.employees?.full_name || props.row.employees?.first_name }}
                </div>
                <div :class="['text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']">
                  {{ props.row.employees?.employee_code }}
                </div>
              </q-td>
            </template>
            <template #body-cell-amount="props">
              <q-td :props="props" class="text-right text-weight-bold">
                {{ formatCurrency(props.row.amount) }}
              </q-td>
            </template>
            <template #body-cell-status="props">
              <q-td :props="props" class="text-center">
                <q-badge
                  :color="statusColor(props.row.status)"
                  :label="props.row.status"
                  class="text-capitalize"
                >
                  <q-tooltip v-if="props.row.status === 'approved'">
                    Auto-deducted from the next monthly payroll run
                  </q-tooltip>
                </q-badge>
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" class="q-gutter-xs text-center">
                <template v-if="props.row.status === 'pending'">
                  <q-btn
                    flat
                    dense
                    round
                    icon="check_circle"
                    color="green"
                    size="sm"
                    @click="updateStatus('advances', props.row.id, 'approved')"
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
                    @click="updateStatus('advances', props.row.id, 'rejected')"
                  >
                    <q-tooltip>Reject</q-tooltip>
                  </q-btn>
                </template>
                <q-btn
                  flat
                  dense
                  round
                  icon="delete"
                  color="grey-6"
                  size="xs"
                  v-if="props.row.status === 'pending'"
                  @click="deleteRecord('advances', props.row.id)"
                >
                  <q-tooltip>Delete</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ EXPENSES TAB ════════════════════════════════════════════════ -->
        <q-tab-panel name="expenses" class="q-pa-md">
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-12 col-sm-4">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Status
              </div>
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="expFilter.status"
                :options="['', 'pending', 'approved', 'rejected', 'reimbursed']"
              >
                <template v-slot:selected v-if="expFilter.status">
                  <span class="text-capitalize">{{ expFilter.status }}</span>
                </template>
                <template v-slot:option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section class="text-capitalize">{{
                      scope.opt || 'All Statuses'
                    }}</q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
            <div class="col-12 col-sm-4">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Employee
              </div>
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="expFilter.employee"
                :options="[{ label: 'All Employees', value: '' }, ...employeeOptions]"
                emit-value
                map-options
                clearable
              />
            </div>
            <div class="col-12 col-sm-4">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Expense Month
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="expFilter.month"
                type="month"
                clearable
              />
            </div>
          </div>

          <q-table
            :dark="$q.dark.isActive"
            flat
            bordered
            dense
            :rows="filteredExpenses"
            :columns="expColumns"
            row-key="id"
            :loading="loadingExpenses"
            :pagination="{ rowsPerPage: 15 }"
            :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'text-body2']"
            table-header-class="text-weight-bold text-uppercase"
          >
            <template #body-cell-employee="props">
              <q-td :props="props">
                <div :class="['text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-dark']">
                  {{ props.row.employees?.full_name || props.row.employees?.first_name }}
                </div>
                <div :class="['text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']">
                  {{ props.row.employees?.employee_code }}
                </div>
              </q-td>
            </template>
            <template #body-cell-amount="props">
              <q-td :props="props" class="text-right text-weight-bold">
                {{ formatCurrency(props.row.amount) }}
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
            <template #body-cell-receipt="props">
              <q-td :props="props" class="text-center">
                <q-btn
                  v-if="props.row.receipt_url"
                  flat
                  dense
                  round
                  size="sm"
                  icon="receipt"
                  color="blue-3"
                  type="a"
                  :href="props.row.receipt_url"
                  target="_blank"
                >
                  <q-tooltip>View Receipt</q-tooltip>
                </q-btn>
                <span v-else class="text-grey-6">-</span>
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" class="q-gutter-xs text-center">
                <template v-if="props.row.status === 'pending'">
                  <q-btn
                    flat
                    dense
                    round
                    icon="check_circle"
                    color="green"
                    size="sm"
                    @click="updateStatus('expenses', props.row.id, 'approved')"
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
                    @click="updateStatus('expenses', props.row.id, 'rejected')"
                  >
                    <q-tooltip>Reject</q-tooltip>
                  </q-btn>
                </template>
                <q-btn
                  flat
                  dense
                  round
                  icon="delete"
                  color="grey-6"
                  size="xs"
                  v-if="props.row.status === 'pending'"
                  @click="deleteRecord('expenses', props.row.id)"
                >
                  <q-tooltip>Delete</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>

    <!-- ══ NEW ADVANCE DIALOG ════════════════════════════════════════════ -->
    <q-dialog v-model="showAdvanceDialog" persistent>
      <q-card
        style="min-width: 450px"
        :class="[$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark']"
      >
        <q-card-section
          class="row items-center"
          :style="{
            borderBottom: $q.dark.isActive
              ? '1px solid rgba(255,255,255,0.07)'
              : '1px solid rgba(0,0,0,0.1)',
          }"
        >
          <q-icon name="request_quote" size="24px" color="amber-8" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">New Salary Advance</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-card-section class="q-pt-md">
          <div class="q-mb-md">
            <div
              :class="[
                'text-caption text-weight-medium q-mb-xs',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
              ]"
            >
              Employee <span class="text-red">*</span>
            </div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="advForm.employee_id"
              :options="employeeOptions"
              emit-value
              map-options
            />
          </div>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-6">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Amount <span class="text-red">*</span>
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model.number="advForm.amount"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
            <div class="col-6">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Date <span class="text-red">*</span>
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="advForm.request_date"
                type="date"
              />
            </div>
          </div>
          <div class="q-mb-sm">
            <div
              :class="[
                'text-caption text-weight-medium q-mb-xs',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
              ]"
            >
              Reason
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="advForm.reason"
              type="textarea"
              rows="2"
            />
          </div>
          <div class="text-caption text-grey-6">
            <q-icon name="info" size="14px" class="q-mr-xs" />Approved advances are auto-deducted
            from the employee's next monthly payroll.
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-7" no-caps v-close-popup />
          <q-btn
            unelevated
            color="amber-8"
            text-color="dark"
            icon="save"
            label="Submit"
            no-caps
            :loading="saving"
            @click="saveAdvance"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ NEW EXPENSE DIALOG ════════════════════════════════════════════ -->
    <q-dialog v-model="showExpenseDialog" persistent>
      <q-card
        style="min-width: 450px"
        :class="[$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark']"
      >
        <q-card-section
          class="row items-center"
          :style="{
            borderBottom: $q.dark.isActive
              ? '1px solid rgba(255,255,255,0.07)'
              : '1px solid rgba(0,0,0,0.1)',
          }"
        >
          <q-icon name="receipt_long" size="24px" color="cyan-8" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">New Employee Expense</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-card-section class="q-pt-md">
          <div class="q-mb-md">
            <div
              :class="[
                'text-caption text-weight-medium q-mb-xs',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
              ]"
            >
              Employee <span class="text-red">*</span>
            </div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="expForm.employee_id"
              :options="employeeOptions"
              emit-value
              map-options
            />
          </div>
          <div class="q-mb-md">
            <div
              :class="[
                'text-caption text-weight-medium q-mb-xs',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
              ]"
            >
              Expense Type <span class="text-red">*</span>
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="expForm.expense_type"
              hint="e.g. Travel, Supplies, Meals"
            />
          </div>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-6">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Amount <span class="text-red">*</span>
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model.number="expForm.amount"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
            <div class="col-6">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Date <span class="text-red">*</span>
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="expForm.expense_date"
                type="date"
              />
            </div>
          </div>
          <div class="q-mb-md">
            <div
              :class="[
                'text-caption text-weight-medium q-mb-xs',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
              ]"
            >
              Description
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="expForm.description"
              type="textarea"
              rows="2"
            />
          </div>
          <div class="q-mb-sm">
            <div
              :class="[
                'text-caption text-weight-medium q-mb-xs',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
              ]"
            >
              Receipt Image URL (Optional)
            </div>
            <q-input :dark="$q.dark.isActive" dense outlined v-model="expForm.receipt_url" />
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-7" no-caps v-close-popup />
          <q-btn
            unelevated
            color="amber-8"
            text-color="dark"
            icon="save"
            label="Submit"
            no-caps
            :loading="saving"
            @click="saveExpense"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import { usePermission } from 'src/core/rbac/usePermission'
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'

const $q = useQuasar()
const authStore = useAuthStore()
const { can } = usePermission()
// employee_advances / employee_expenses INSERT is RLS-limited to admin + HR.
// Use the wildcard-aware RBAC check (hr holds 'hr.*'; manager does NOT hold
// hr.finance.manage) so the create buttons only show to users who can save.
const canManageFinance = computed(() => can('hr.finance.manage'))

const activeTab = ref('advances')

const advances = ref([])
const expenses = ref([])
const loadingAdvances = ref(false)
const loadingExpenses = ref(false)
const saving = ref(false)

const allEmployees = ref([])

const advFilter = reactive({ status: '', employee: null, month: '' })
const expFilter = reactive({ status: '', employee: null, month: '' })

// Default current date
const getTodayDate = () => new Date().toISOString().split('T')[0]

const advForm = reactive({
  employee_id: null,
  amount: null,
  request_date: getTodayDate(),
  reason: '',
})
const expForm = reactive({
  employee_id: null,
  expense_type: '',
  amount: null,
  expense_date: getTodayDate(),
  description: '',
  receipt_url: '',
})

const showAdvanceDialog = ref(false)
const showExpenseDialog = ref(false)

const employeeOptions = computed(() => {
  return allEmployees.value.map((e) => ({
    label: `${e.full_name || e.first_name} (${e.employee_code})`,
    value: e.id,
  }))
})

const kpi = computed(() => {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return {
    pendingAdvances: advances.value.filter((a) => a.status === 'pending').length,
    pendingExpenses: expenses.value.filter((e) => e.status === 'pending').length,
    approvedAdvancesMtd: advances.value
      .filter((a) => a.status === 'approved' && (a.approved_at || '').startsWith(thisMonth))
      .reduce((sum, a) => sum + Number(a.amount || 0), 0),
    approvedExpensesMtd: expenses.value
      .filter((e) => e.status === 'approved' && (e.approved_at || '').startsWith(thisMonth))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0),
  }
})

// Formatting
function formatCurrency(val) {
  if (!val) return 'LKR 0.00'
  return `LKR ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function statusColor(status) {
  switch (status) {
    case 'approved':
      return 'green'
    case 'rejected':
      return 'negative'
    case 'deducted':
      return 'blue'
    case 'reimbursed':
      return 'teal'
    default:
      return 'amber-8'
  }
}

// Columns
const advColumns = [
  { name: 'date', label: 'Date', field: 'request_date', align: 'left', sortable: true },
  { name: 'employee', label: 'Employee', field: 'employee_id', align: 'left' },
  { name: 'reason', label: 'Reason', field: 'reason', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const expColumns = [
  { name: 'date', label: 'Date', field: 'expense_date', align: 'left', sortable: true },
  { name: 'employee', label: 'Employee', field: 'employee_id', align: 'left' },
  { name: 'type', label: 'Type', field: 'expense_type', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'receipt', label: 'Receipt', field: 'receipt_url', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

// Computed filters
const filteredAdvances = computed(() => {
  let rows = advances.value
  if (advFilter.status) rows = rows.filter((r) => r.status === advFilter.status)
  if (advFilter.employee) rows = rows.filter((r) => r.employee_id === advFilter.employee)
  if (advFilter.month) rows = rows.filter((r) => r.request_date?.startsWith(advFilter.month))
  return rows
})

const filteredExpenses = computed(() => {
  let rows = expenses.value
  if (expFilter.status) rows = rows.filter((r) => r.status === expFilter.status)
  if (expFilter.employee) rows = rows.filter((r) => r.employee_id === expFilter.employee)
  if (expFilter.month) rows = rows.filter((r) => r.expense_date?.startsWith(expFilter.month))
  return rows
})

// Map raw Supabase errors to actionable messages (RLS denials are cryptic).
function humanizeError(err, action) {
  const msg = err?.message || String(err || 'Unknown error')
  if (err?.code === '42501' || /row-level security|violates row-level/i.test(msg)) {
    return `You need admin or HR permission to create ${action} for employees.`
  }
  return msg
}

// Data Fetching
async function loadEmployees() {
  const branchId = authStore.currentBranch?.id
  const companyId = authStore.currentBranch?.company_id
  let data = null
  if (branchId) {
    ;({ data } = await supabase
      .from('employees')
      .select('id, full_name, first_name, employee_code')
      .eq('branch_id', branchId)
      .order('first_name'))
  }
  // Fall back to company-scoped employees when the branch filter is empty or
  // yields nothing, so the dropdown is never empty on a branch mismatch.
  if ((!data || data.length === 0) && companyId) {
    ;({ data } = await supabase
      .from('employees')
      .select('id, full_name, first_name, employee_code')
      .eq('company_id', companyId)
      .order('first_name'))
  }
  allEmployees.value = data || []
}

async function loadData() {
  const companyId = authStore.currentBranch?.company_id || authStore.profile?.company_id
  if (!companyId) return

  loadingAdvances.value = true
  loadingExpenses.value = true

  try {
    // Scope by COMPANY, not branch — an advance/expense created under a different
    // branch (or before a branch switch) must still be visible. RLS already
    // restricts rows to the user's company/branch, so this is safe.
    const [advRes, expRes] = await Promise.all([
      supabase
        .from('employee_advances')
        .select('*, employees(id, full_name, first_name, employee_code)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('employee_expenses')
        .select('*, employees(id, full_name, first_name, employee_code)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
    ])
    if (advRes.error) throw advRes.error
    if (expRes.error) throw expRes.error

    advances.value = advRes.data || []
    expenses.value = expRes.data || []
  } catch (err) {
    console.error('Error fetching data:', err.message)
    $q.notify({ type: 'negative', message: 'Failed to load data.' })
  } finally {
    loadingAdvances.value = false
    loadingExpenses.value = false
  }
}

// Dialog Triggers
function openNewAdvance() {
  Object.assign(advForm, {
    employee_id: null,
    amount: null,
    request_date: getTodayDate(),
    reason: '',
  })
  showAdvanceDialog.value = true
}

function openNewExpense() {
  Object.assign(expForm, {
    employee_id: null,
    expense_type: '',
    amount: null,
    expense_date: getTodayDate(),
    description: '',
    receipt_url: '',
  })
  showExpenseDialog.value = true
}

// Submissions
async function saveAdvance() {
  if (!advForm.employee_id || !advForm.amount || !advForm.request_date) {
    $q.notify({ type: 'warning', message: 'Please fill out required fields.' })
    return
  }
  saving.value = true
  try {
    const { error } = await supabase.from('employee_advances').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      employee_id: advForm.employee_id,
      amount: advForm.amount,
      request_date: advForm.request_date,
      reason: advForm.reason || null,
      status: 'pending',
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Salary advance created.' })
    showAdvanceDialog.value = false
    loadData()
  } catch (err) {
    console.error('[EmployeeFinances] saveAdvance:', err)
    $q.notify({
      type: 'negative',
      message: humanizeError(err, 'advances'),
      position: 'top',
      timeout: 4000,
      multiLine: true,
    })
  } finally {
    saving.value = false
  }
}

async function saveExpense() {
  if (!expForm.employee_id || !expForm.expense_type || !expForm.amount || !expForm.expense_date) {
    $q.notify({ type: 'warning', message: 'Please fill out required fields.' })
    return
  }
  saving.value = true
  try {
    const { error } = await supabase.from('employee_expenses').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      employee_id: expForm.employee_id,
      expense_type: expForm.expense_type,
      amount: expForm.amount,
      expense_date: expForm.expense_date,
      description: expForm.description || null,
      receipt_url: expForm.receipt_url || null,
      status: 'pending',
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Employee expense created.' })
    showExpenseDialog.value = false
    loadData()
  } catch (err) {
    console.error('[EmployeeFinances] saveExpense:', err)
    $q.notify({
      type: 'negative',
      message: humanizeError(err, 'expenses'),
      position: 'top',
      timeout: 4000,
      multiLine: true,
    })
  } finally {
    saving.value = false
  }
}

// Actions
async function updateStatus(type, id, newStatus) {
  try {
    const table = type === 'advances' ? 'employee_advances' : 'employee_expenses'
    const { error } = await supabase
      .from(table)
      .update({
        status: newStatus,
        approved_by: newStatus === 'approved' ? authStore.user?.id : null,
        approved_at: newStatus === 'approved' ? new Date().toISOString() : null,
      })
      .eq('id', id)

    if (error) throw error
    $q.notify({ type: 'positive', message: `Status updated to ${newStatus}` })
    loadData()
  } catch (err) {
    console.error(err)
    $q.notify({ type: 'negative', message: err.message })
  }
}

async function deleteRecord(type, id) {
  $q.dialog({
    title: 'Confirm',
    message: 'Are you sure you want to delete this record?',
    cancel: true,
    persistent: true,
    dark: true,
  }).onOk(async () => {
    try {
      const table = type === 'advances' ? 'employee_advances' : 'employee_expenses'
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Record deleted.' })
      loadData()
    } catch (err) {
      console.error(err)
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

// Initialization
onMounted(async () => {
  await loadEmployees()
  await loadData()
})
</script>

<style scoped>
/* Scoped styles removed in favor of dynamic Vue theme bindings */
</style>
