<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center justify-between q-mb-md">
      <div>
        <div class="text-h5 text-weight-bold row items-center">
          <q-icon name="verified" color="primary" size="32px" class="q-mr-sm" />
          Approvals & Governance Center
        </div>
        <div class="text-caption text-grey-7">
          Unified governance inbox for Kitchen Wastage, Procurement POs, Finance Vouchers, Shift Changes, and Role Permissions
        </div>
      </div>
      <div class="row q-gutter-sm">
        <q-btn
          outline
          icon="refresh"
          label="Refresh Inbox"
          color="primary"
          :loading="loading"
          @click="loadAllPending"
        />
      </div>
    </div>

    <!-- Summary KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg items-stretch">
      <div class="col-12 col-sm-6 col-md-2" v-for="k in kpiCards" :key="k.label">
        <q-card flat bordered class="cursor-pointer" :class="k.bgClass" @click="activeTab = k.tab">
          <q-card-section class="row items-center no-wrap q-pa-sm">
            <q-avatar :icon="k.icon" :color="k.color" text-color="white" size="38px" class="q-mr-sm" />
            <div>
              <div class="text-h6 text-weight-bolder">{{ k.count }}</div>
              <div class="text-caption text-weight-medium text-grey-8" style="font-size: 11px">{{ k.label }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Main Approvals Hub -->
    <q-card flat bordered class="shadow-1">
      <q-tabs
        v-model="activeTab"
        dense
        align="left"
        active-color="primary"
        indicator-color="primary"
        class="text-grey-8 bg-grey-1 border-bottom"
      >
        <q-tab name="wastage" icon="delete_sweep" label="Kitchen & Store Wastage">
          <q-badge v-if="wastageList.length" color="negative" floating>{{ wastageList.length }}</q-badge>
        </q-tab>
        <q-tab name="procurement" icon="shopping_cart" label="Purchase Orders">
          <q-badge v-if="poList.length" color="amber-9" floating>{{ poList.length }}</q-badge>
        </q-tab>
        <q-tab name="finance" icon="receipt_long" label="Finance & Pay Vouchers">
          <q-badge v-if="voucherList.length" color="primary" floating>{{ voucherList.length }}</q-badge>
        </q-tab>
        <q-tab name="amendments" icon="lock_open" label="Doc Amendments & Unlocks">
          <q-badge v-if="amendmentList.length" color="teal" floating>{{ amendmentList.length }}</q-badge>
        </q-tab>
        <q-tab name="hr" icon="badge" label="HR & Shift Requests">
          <q-badge v-if="hrTotalPending > 0" color="purple" floating>{{ hrTotalPending }}</q-badge>
        </q-tab>
        <q-tab name="permissions" icon="security" label="Role & Permission Gate">
          <q-badge v-if="pendingPermissions.length" color="indigo" floating>{{ pendingPermissions.length }}</q-badge>
        </q-tab>
        <q-tab name="shifts" icon="point_of_sale" label="POS Shift Variance">
          <q-badge v-if="shiftVarianceList.length" color="deep-orange" floating>{{ shiftVarianceList.length }}</q-badge>
        </q-tab>
      </q-tabs>

      <q-tab-panels v-model="activeTab" animated class="q-pa-none">
        <!-- ══ 1. KITCHEN & STORE WASTAGE APPROVALS ═════════════════════ -->
        <q-tab-panel name="wastage" class="q-pa-md">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold">Pending Wastage / Spoilage Documents</div>
            <div class="text-caption text-grey">Approving deducts stock ledger and updates food cost reports</div>
          </div>
          <q-table
            :rows="wastageList"
            :columns="wastageColumns"
            row-key="id"
            flat
            bordered
            :loading="loading"
            no-data-label="No pending kitchen/store wastage documents"
          >
            <template #body-cell-doc_date="props">
              <q-td :props="props">{{ formatDate(props.value) }}</q-td>
            </template>
            <template #body-cell-total_cost="props">
              <q-td :props="props" align="right" class="text-weight-bold text-negative">
                {{ formatCurrency(props.value) }}
              </q-td>
            </template>
            <template #body-cell-status="props">
              <q-td :props="props" align="center">
                <q-badge color="warning" text-color="dark">Pending Approval</q-badge>
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" align="center">
                <div class="row q-gutter-xs justify-center">
                  <q-btn
                    unelevated
                    dense
                    size="sm"
                    color="positive"
                    icon="check"
                    label="Approve"
                    @click="approveWastage(props.row)"
                  />
                  <q-btn
                    flat
                    dense
                    size="sm"
                    color="negative"
                    icon="close"
                    label="Reject"
                    @click="rejectWastage(props.row)"
                  />
                </div>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ 2. PROCUREMENT PO APPROVALS ═════════════════════════════ -->
        <q-tab-panel name="procurement" class="q-pa-md">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold">Pending Purchase Orders (POs)</div>
            <div class="text-caption text-grey">Approved POs become Open and ready for Supplier Goods Receipts (GRN)</div>
          </div>
          <q-table
            :rows="poList"
            :columns="poColumns"
            row-key="id"
            flat
            bordered
            :loading="loading"
            no-data-label="No draft purchase orders requiring approval"
          >
            <template #body-cell-doc_date="props">
              <q-td :props="props">{{ formatDate(props.value) }}</q-td>
            </template>
            <template #body-cell-total_amount="props">
              <q-td :props="props" align="right" class="text-weight-bold">
                {{ formatCurrency(props.value) }}
              </q-td>
            </template>
            <template #body-cell-status="props">
              <q-td :props="props" align="center">
                <q-badge color="amber-8" text-color="dark">Draft / Pending</q-badge>
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" align="center">
                <div class="row q-gutter-xs justify-center">
                  <q-btn
                    unelevated
                    dense
                    size="sm"
                    color="positive"
                    icon="check"
                    label="Approve PO"
                    @click="approvePOItem(props.row)"
                  />
                  <q-btn
                    flat
                    dense
                    size="sm"
                    color="negative"
                    icon="close"
                    label="Reject"
                    @click="rejectPOItem(props.row)"
                  />
                </div>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ 3. FINANCE VOUCHERS APPROVALS ═══════════════════════════ -->
        <q-tab-panel name="finance" class="q-pa-md">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold">Pending Finance Pay Vouchers</div>
            <div class="text-caption text-grey">Approved vouchers authorize payment release from Cashbook / Bank Accounts</div>
          </div>
          <q-table
            :rows="voucherList"
            :columns="voucherColumns"
            row-key="id"
            flat
            bordered
            :loading="loading"
            no-data-label="No draft vouchers requiring approval"
          >
            <template #body-cell-voucher_date="props">
              <q-td :props="props">{{ formatDate(props.value) }}</q-td>
            </template>
            <template #body-cell-amount="props">
              <q-td :props="props" align="right" class="text-weight-bold text-primary">
                {{ formatCurrency(props.value) }}
              </q-td>
            </template>
            <template #body-cell-status="props">
              <q-td :props="props" align="center">
                <q-badge color="amber-8" text-color="dark">Draft</q-badge>
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" align="center">
                <div class="row q-gutter-xs justify-center">
                  <q-btn
                    unelevated
                    dense
                    size="sm"
                    color="positive"
                    icon="check"
                    label="Approve Voucher"
                    @click="approveVoucherItem(props.row)"
                  />
                  <q-btn
                    flat
                    dense
                    size="sm"
                    color="negative"
                    icon="close"
                    label="Reject"
                    @click="rejectVoucherItem(props.row)"
                  />
                </div>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ 4. DOCUMENT AMENDMENTS & UNLOCK REQUESTS ══════════════ -->
        <q-tab-panel name="amendments" class="q-pa-md">
          <div class="row items-center justify-between q-mb-sm">
            <div>
              <div class="text-subtitle1 text-weight-bold row items-center">
                <q-icon name="lock_open" color="teal" size="24px" class="q-mr-xs" />
                Locked Document Amendment & Unlock Requests
              </div>
              <div class="text-caption text-grey">
                Submitted GRN, GIN, AP Invoices, Vouchers, and POs require explicit Admin Approval before they can be edited or voided.
              </div>
            </div>
          </div>
          <q-table
            :rows="amendmentList"
            :columns="amendmentColumns"
            row-key="id"
            flat
            bordered
            :loading="loading"
            no-data-label="No pending document amendment or unlock requests"
          >
            <template #body-cell-doc_type="props">
              <q-td :props="props" align="center">
                <q-badge :color="getDocTypeColor(props.value)">{{ props.value }}</q-badge>
              </q-td>
            </template>
            <template #body-cell-created_at="props">
              <q-td :props="props">{{ new Date(props.value).toLocaleString() }}</q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" align="center">
                <div class="row q-gutter-xs justify-center">
                  <q-btn
                    unelevated
                    dense
                    size="sm"
                    color="positive"
                    icon="lock_open"
                    label="Approve & Unlock"
                    @click="handleApproveAmendment(props.row)"
                  />
                  <q-btn
                    flat
                    dense
                    size="sm"
                    color="negative"
                    icon="close"
                    label="Reject"
                    @click="handleRejectAmendment(props.row)"
                  />
                </div>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ 5. HR REQUESTS & SHIFT CHANGES ══════════════════════════ -->
        <q-tab-panel name="hr" class="q-pa-md">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold">Staff Requests (Shift Changes, Leaves, Advances, Loans, Claims)</div>
            <q-btn-toggle
              v-model="hrSubTab"
              dense
              no-caps
              rounded
              unelevated
              toggle-color="primary"
              :options="[
                { label: `Shift Changes (${hrShiftSwaps.length})`, value: 'shiftswaps' },
                { label: `Leaves (${hrLeaves.length})`, value: 'leaves' },
                { label: `Advances (${hrAdvances.length})`, value: 'advances' },
                { label: `Loans (${hrLoans.length})`, value: 'loans' },
                { label: `Claims (${hrExpenses.length})`, value: 'expenses' },
              ]"
            />
          </div>

          <!-- Shift Changes Table -->
          <div v-if="hrSubTab === 'shiftswaps'">
            <q-table
              :rows="hrShiftSwaps"
              :columns="hrShiftSwapColumns"
              row-key="id"
              flat
              bordered
              :loading="loading"
              no-data-label="No pending shift change or swap requests"
            >
              <template #body-cell-shift_date="props">
                <q-td :props="props">{{ formatDate(props.value) }}</q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" align="center">
                  <div class="row q-gutter-xs justify-center">
                    <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve Swap" @click="approveShiftSwap(props.row)" />
                    <q-btn flat dense size="sm" color="negative" icon="close" label="Reject" @click="rejectShiftSwap(props.row)" />
                  </div>
                </q-td>
              </template>
            </q-table>
          </div>

          <!-- Leaves Table -->
          <div v-if="hrSubTab === 'leaves'">
            <q-table
              :rows="hrLeaves"
              :columns="hrLeaveColumns"
              row-key="id"
              flat
              bordered
              :loading="loading"
              no-data-label="No pending leave requests"
            >
              <template #body-cell-actions="props">
                <q-td :props="props" align="center">
                  <div class="row q-gutter-xs justify-center">
                    <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve" @click="handleHRAction('leaves', props.row.id, 'approved')" />
                    <q-btn flat dense size="sm" color="negative" icon="close" label="Reject" @click="handleHRAction('leaves', props.row.id, 'rejected')" />
                  </div>
                </q-td>
              </template>
            </q-table>
          </div>

          <!-- Advances Table -->
          <div v-if="hrSubTab === 'advances'">
            <q-table
              :rows="hrAdvances"
              :columns="hrAdvanceColumns"
              row-key="id"
              flat
              bordered
              :loading="loading"
              no-data-label="No pending salary advance requests"
            >
              <template #body-cell-amount="props">
                <q-td :props="props" align="right" class="text-weight-bold">{{ formatCurrency(props.value) }}</q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" align="center">
                  <div class="row q-gutter-xs justify-center">
                    <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve" @click="handleHRAction('advances', props.row.id, 'approved')" />
                    <q-btn flat dense size="sm" color="negative" icon="close" label="Reject" @click="handleHRAction('advances', props.row.id, 'rejected')" />
                  </div>
                </q-td>
              </template>
            </q-table>
          </div>

          <!-- Loans Table -->
          <div v-if="hrSubTab === 'loans'">
            <q-table
              :rows="hrLoans"
              :columns="hrLoanColumns"
              row-key="id"
              flat
              bordered
              :loading="loading"
              no-data-label="No pending loan applications"
            >
              <template #body-cell-loan_amount="props">
                <q-td :props="props" align="right" class="text-weight-bold">{{ formatCurrency(props.value) }}</q-td>
              </template>
              <template #body-cell-installment_amount="props">
                <q-td :props="props" align="right">{{ formatCurrency(props.value) }}</q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" align="center">
                  <div class="row q-gutter-xs justify-center">
                    <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve Loan" @click="handleHRAction('loans', props.row.id, 'approved')" />
                    <q-btn flat dense size="sm" color="negative" icon="close" label="Reject" @click="handleHRAction('loans', props.row.id, 'rejected')" />
                  </div>
                </q-td>
              </template>
            </q-table>
          </div>

          <!-- Expenses Claims Table -->
          <div v-if="hrSubTab === 'expenses'">
            <q-table
              :rows="hrExpenses"
              :columns="hrExpenseColumns"
              row-key="id"
              flat
              bordered
              :loading="loading"
              no-data-label="No pending employee expense claims"
            >
              <template #body-cell-amount="props">
                <q-td :props="props" align="right" class="text-weight-bold">{{ formatCurrency(props.value) }}</q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" align="center">
                  <div class="row q-gutter-xs justify-center">
                    <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve" @click="handleHRAction('expenses', props.row.id, 'approved')" />
                    <q-btn flat dense size="sm" color="negative" icon="close" label="Reject" @click="handleHRAction('expenses', props.row.id, 'rejected')" />
                  </div>
                </q-td>
              </template>
            </q-table>
          </div>
        </q-tab-panel>

        <!-- ══ 5. ROLE & PERMISSION ELEVATION GATE ══════════════════════ -->
        <q-tab-panel name="permissions" class="q-pa-md">
          <div class="row items-center justify-between q-mb-sm">
            <div>
              <div class="text-subtitle1 text-weight-bold">Elevated Privilege & Permission Gate</div>
              <div class="text-caption text-grey">HR or Supervisor granted extra privileges require explicit Admin Approval before taking effect</div>
            </div>
          </div>
          <q-table
            :rows="pendingPermissions"
            :columns="permissionColumns"
            row-key="id"
            flat
            bordered
            :loading="loading"
            no-data-label="No elevated permission requests awaiting admin approval"
          >
            <template #body-cell-permission="props">
              <q-td :props="props">
                <q-badge color="indigo-8">{{ props.value }}</q-badge>
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" align="center">
                <div class="row q-gutter-xs justify-center">
                  <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve Access" @click="approvePermission(props.row)" />
                  <q-btn flat dense size="sm" color="negative" icon="close" label="Deny Access" @click="denyPermission(props.row)" />
                </div>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ 6. POS SHIFT VARIANCE REVIEW ════════════════════════════ -->
        <q-tab-panel name="shifts" class="q-pa-md">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold">POS Cash Variance Audits (|Variance| > LKR 1,000)</div>
            <div class="text-caption text-grey">Management sign-off for cashier drawer discrepancies</div>
          </div>
          <q-table
            :rows="shiftVarianceList"
            :columns="shiftVarianceColumns"
            row-key="id"
            flat
            bordered
            :loading="loading"
            no-data-label="No major shift cash variances recorded"
          >
            <template #body-cell-created_at="props">
              <q-td :props="props">{{ formatDate(props.value) }}</q-td>
            </template>
            <template #body-cell-cash_variance="props">
              <q-td :props="props" align="right" class="text-weight-bold" :class="props.value < 0 ? 'text-negative' : 'text-positive'">
                {{ formatCurrency(props.value) }}
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" align="center">
                <q-btn
                  unelevated
                  dense
                  size="sm"
                  color="primary"
                  icon="task_alt"
                  label="Sign Off"
                  @click="signOffShift(props.row)"
                />
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { approvePO } from 'src/services/procurementService'
import {
  fetchPendingAmendments,
  approveDocumentAmendment,
  rejectDocumentAmendment,
} from 'src/services/amendmentService'

const $q = useQuasar()

const activeTab = ref('wastage')
const hrSubTab = ref('shiftswaps')
const loading = ref(false)

const wastageList = ref([])
const poList = ref([])
const voucherList = ref([])
const amendmentList = ref([])
const hrShiftSwaps = ref([])
const hrLeaves = ref([])
const hrAdvances = ref([])
const hrLoans = ref([])
const hrExpenses = ref([])
const pendingPermissions = ref([])
const shiftVarianceList = ref([])

const hrTotalPending = computed(() => {
  return hrShiftSwaps.value.length + hrLeaves.value.length + hrAdvances.value.length + hrLoans.value.length + hrExpenses.value.length
})

const kpiCards = computed(() => [
  { label: 'Wastage Docs', count: wastageList.value.length, icon: 'delete_sweep', color: 'negative', tab: 'wastage', bgClass: 'bg-red-1' },
  { label: 'Purchase Orders', count: poList.value.length, icon: 'shopping_cart', color: 'amber-9', tab: 'procurement', bgClass: 'bg-amber-1' },
  { label: 'Pay Vouchers', count: voucherList.value.length, icon: 'receipt_long', color: 'primary', tab: 'finance', bgClass: 'bg-blue-1' },
  { label: 'Doc Amendments', count: amendmentList.value.length, icon: 'lock_open', color: 'teal', tab: 'amendments', bgClass: 'bg-teal-1' },
  { label: 'HR & Shifts', count: hrTotalPending.value, icon: 'badge', color: 'purple', tab: 'hr', bgClass: 'bg-purple-1' },
  { label: 'Permission Gates', count: pendingPermissions.value.length, icon: 'security', color: 'indigo', tab: 'permissions', bgClass: 'bg-indigo-1' },
  { label: 'Shift Variance', count: shiftVarianceList.value.length, icon: 'point_of_sale', color: 'deep-orange', tab: 'shifts', bgClass: 'bg-orange-1' },
])

// ── Formatting ───────────────────────────────────────────────
function formatCurrency(val) {
  if (val === undefined || val === null) return 'LKR 0.00'
  return `LKR ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(val) {
  if (!val) return '—'
  return new Date(val).toLocaleDateString()
}

// ── Table Columns ────────────────────────────────────────────
const wastageColumns = [
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'doc_number', label: 'Doc Number', field: 'doc_number', align: 'left', sortable: true },
  { name: 'warehouse_id', label: 'Warehouse / Kitchen', field: (r) => r.warehouses?.name || 'Main Kitchen', align: 'left' },
  { name: 'remarks', label: 'Remarks / Reason', field: 'remarks', align: 'left' },
  { name: 'total_cost', label: 'Loss Value', field: 'total_cost', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const poColumns = [
  { name: 'doc_date', label: 'PO Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'doc_number', label: 'PO #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'supplier', label: 'Supplier', field: (r) => r.suppliers?.name || '—', align: 'left' },
  { name: 'total_amount', label: 'Amount', field: 'total_amount', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const voucherColumns = [
  { name: 'voucher_date', label: 'Voucher Date', field: 'voucher_date', align: 'left', sortable: true },
  { name: 'voucher_no', label: 'Voucher #', field: 'voucher_no', align: 'left', sortable: true },
  { name: 'pay_to', label: 'Paid To', field: 'pay_to', align: 'left' },
  { name: 'narration', label: 'Narration', field: 'narration', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const amendmentColumns = [
  { name: 'doc_number', label: 'Doc Number', field: 'doc_number', align: 'left', sortable: true },
  { name: 'doc_type', label: 'Type', field: 'doc_type', align: 'center' },
  { name: 'requested_by_name', label: 'Requested By', field: (r) => `${r.requested_by_name} (${r.requester_role})`, align: 'left' },
  { name: 'reason', label: 'Reason / Justification', field: 'reason', align: 'left' },
  { name: 'created_at', label: 'Requested At', field: 'created_at', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

function getDocTypeColor(type) {
  const map = {
    GRN: 'orange-9',
    GIN: 'blue-9',
    AP_INV: 'purple-9',
    VOUCHER: 'green-9',
    PO: 'amber-9',
    WASTAGE: 'red-9',
  }
  return map[type] || 'teal'
}

const hrShiftSwapColumns = [
  { name: 'shift_date', label: 'Shift Date', field: 'shift_date', align: 'left' },
  { name: 'employee', label: 'Employee', field: (r) => r.employees?.full_name || 'Staff', align: 'left' },
  { name: 'current_shift', label: 'Current Shift', field: (r) => r.current_shift?.name || 'Morning', align: 'left' },
  { name: 'requested_shift', label: 'Target Shift', field: (r) => r.requested_shift?.name || 'Evening', align: 'left' },
  { name: 'reason', label: 'Reason', field: 'reason', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const hrLeaveColumns = [
  { name: 'employee', label: 'Employee', field: (r) => r.employees?.full_name || '—', align: 'left' },
  { name: 'leave_type', label: 'Type', field: (r) => r.leave_types?.name || 'Leave', align: 'left' },
  { name: 'start_date', label: 'From', field: 'start_date', align: 'left' },
  { name: 'end_date', label: 'To', field: 'end_date', align: 'left' },
  { name: 'total_days', label: 'Days', field: 'total_days', align: 'center' },
  { name: 'reason', label: 'Reason', field: 'reason', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const hrAdvanceColumns = [
  { name: 'request_date', label: 'Date', field: 'request_date', align: 'left' },
  { name: 'employee', label: 'Employee', field: (r) => r.employees?.full_name || '—', align: 'left' },
  { name: 'reason', label: 'Reason', field: 'reason', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const hrLoanColumns = [
  { name: 'created_at', label: 'Requested Date', field: 'created_at', align: 'left' },
  { name: 'employee', label: 'Employee', field: (r) => r.employees?.full_name || '—', align: 'left' },
  { name: 'loan_amount', label: 'Loan Amount', field: 'loan_amount', align: 'right' },
  { name: 'total_installments', label: 'Months', field: 'total_installments', align: 'center' },
  { name: 'installment_amount', label: 'Monthly EMI', field: 'installment_amount', align: 'right' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const hrExpenseColumns = [
  { name: 'expense_date', label: 'Date', field: 'expense_date', align: 'left' },
  { name: 'employee', label: 'Employee', field: (r) => r.employees?.full_name || '—', align: 'left' },
  { name: 'expense_type', label: 'Type', field: 'expense_type', align: 'left' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const permissionColumns = [
  { name: 'user', label: 'Target User', field: (r) => r.user_email || r.user_name || 'Staff User', align: 'left' },
  { name: 'role', label: 'Assigned Role', field: (r) => r.role || 'Cashier / Manager', align: 'left' },
  { name: 'permission', label: 'Elevated Privilege', field: 'permission', align: 'left' },
  { name: 'requested_by', label: 'Granted By', field: (r) => r.granted_by || 'HR / Manager', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const shiftVarianceColumns = [
  { name: 'created_at', label: 'Shift Date', field: 'created_at', align: 'left' },
  { name: 'cashier_name', label: 'Cashier', field: 'cashier_name', align: 'left' },
  { name: 'opening_cash', label: 'Opening Cash', field: 'opening_cash', align: 'right' },
  { name: 'closing_cash', label: 'Closing Cash', field: 'closing_cash', align: 'right' },
  { name: 'cash_variance', label: 'Variance', field: 'cash_variance', align: 'right' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

// ── Data Fetching ────────────────────────────────────────────
async function loadAllPending() {
  loading.value = true
  try {
    const [wRes, poRes, vRes, amendRes, ssRes, lRes, aRes, loRes, eRes, pRes, sRes] = await Promise.allSettled([
      supabase.from('inventory_documents').select('*, warehouses(name)').eq('doc_type', 'WASTAGE').in('status', ['draft', 'pending', 'pending_approval']),
      supabase.from('procurement_purchase_orders').select('*, suppliers(name)').eq('status', 'draft'),
      supabase.from('finance_vouchers').select('*').in('status', ['draft', 'pending']),
      fetchPendingAmendments(),
      supabase.from('shift_swap_requests').select('*, employees(full_name), current_shift:shifts!current_shift_id(name), requested_shift:shifts!requested_shift_id(name)').eq('status', 'pending'),
      supabase.from('leave_requests').select('*, employees(full_name), leave_types(name)').eq('status', 'pending'),
      supabase.from('employee_advances').select('*, employees(full_name)').eq('status', 'pending'),
      supabase.from('employee_loans').select('*, employees(full_name)').eq('status', 'pending'),
      supabase.from('employee_expenses').select('*, employees(full_name)').eq('status', 'pending'),
      supabase.from('user_permissions').select('*').eq('is_active', false),
      supabase.from('pos_shifts').select('*').or('cash_variance.gt.1000,cash_variance.lt.-1000').order('created_at', { ascending: false }).limit(20),
    ])

    if (wRes.status === 'fulfilled') wastageList.value = wRes.value.data || []
    if (poRes.status === 'fulfilled') poList.value = poRes.value.data || []
    if (vRes.status === 'fulfilled') voucherList.value = vRes.value.data || []
    if (amendRes.status === 'fulfilled') amendmentList.value = amendRes.value || []
    if (ssRes.status === 'fulfilled') hrShiftSwaps.value = ssRes.value.data || []
    if (lRes.status === 'fulfilled') hrLeaves.value = lRes.value.data || []
    if (aRes.status === 'fulfilled') hrAdvances.value = aRes.value.data || []
    if (loRes.status === 'fulfilled') hrLoans.value = loRes.value.data || []
    if (eRes.status === 'fulfilled') hrExpenses.value = eRes.value.data || []
    if (pRes.status === 'fulfilled') pendingPermissions.value = pRes.value.data || []
    if (sRes.status === 'fulfilled') shiftVarianceList.value = sRes.value.data || []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadAllPending()
})

// ── Actions ──────────────────────────────────────────────────
async function approveWastage(doc) {
  try {
    const { error } = await supabase
      .from('inventory_documents')
      .update({ status: 'posted', approved_at: new Date().toISOString() })
      .eq('id', doc.id)

    if (error) throw error
    $q.notify({ type: 'positive', message: `Wastage Document ${doc.doc_number || ''} Approved` })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to approve wastage', caption: err.message })
  }
}

async function rejectWastage(doc) {
  $q.dialog({
    title: 'Reject Wastage Document',
    message: 'Provide rejection notes:',
    prompt: { model: '', type: 'text' },
    cancel: true,
  }).onOk(async (notes) => {
    try {
      const { error } = await supabase
        .from('inventory_documents')
        .update({ status: 'rejected', remarks: `${doc.remarks || ''} [Rejected: ${notes}]` })
        .eq('id', doc.id)

      if (error) throw error
      $q.notify({ type: 'warning', message: 'Wastage document marked as rejected' })
      loadAllPending()
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to reject wastage', caption: err.message })
    }
  })
}

async function approvePOItem(po) {
  try {
    await approvePO(po.id)
    $q.notify({ type: 'positive', message: `PO ${po.doc_number || ''} Approved & Opened` })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to approve PO', caption: err.message })
  }
}

async function rejectPOItem(po) {
  try {
    const { error } = await supabase
      .from('procurement_purchase_orders')
      .update({ status: 'cancelled' })
      .eq('id', po.id)

    if (error) throw error
    $q.notify({ type: 'warning', message: `PO ${po.doc_number || ''} Cancelled` })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to cancel PO', caption: err.message })
  }
}

async function approveVoucherItem(v) {
  try {
    const { error } = await supabase
      .from('finance_vouchers')
      .update({ status: 'approved' })
      .eq('id', v.id)

    if (error) throw error
    $q.notify({ type: 'positive', message: `Voucher ${v.voucher_no || ''} Approved` })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to approve voucher', caption: err.message })
  }
}

async function rejectVoucherItem(v) {
  try {
    const { error } = await supabase
      .from('finance_vouchers')
      .update({ status: 'cancelled' })
      .eq('id', v.id)

    if (error) throw error
    $q.notify({ type: 'warning', message: `Voucher ${v.voucher_no || ''} Cancelled` })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to cancel voucher', caption: err.message })
  }
}

async function approveShiftSwap(swap) {
  try {
    const { error } = await supabase
      .from('shift_swap_requests')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', swap.id)

    if (error) throw error

    // Update assignment if shift_assignments ID exists
    if (swap.assignment_id && swap.requested_shift_id) {
      await supabase
        .from('shift_assignments')
        .update({ shift_id: swap.requested_shift_id })
        .eq('id', swap.assignment_id)
    }

    $q.notify({ type: 'positive', message: 'Shift change approved and updated in roster' })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to approve shift swap', caption: err.message })
  }
}

async function rejectShiftSwap(swap) {
  try {
    const { error } = await supabase
      .from('shift_swap_requests')
      .update({ status: 'rejected' })
      .eq('id', swap.id)

    if (error) throw error
    $q.notify({ type: 'warning', message: 'Shift change request rejected' })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to reject shift swap', caption: err.message })
  }
}

async function approvePermission(perm) {
  try {
    const { error } = await supabase
      .from('user_permissions')
      .update({ is_active: true, approved_at: new Date().toISOString() })
      .eq('id', perm.id)

    if (error) throw error
    $q.notify({ type: 'positive', message: 'Elevated permission verified and activated' })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to approve permission', caption: err.message })
  }
}

async function denyPermission(perm) {
  try {
    const { error } = await supabase
      .from('user_permissions')
      .delete()
      .eq('id', perm.id)

    if (error) throw error
    $q.notify({ type: 'warning', message: 'Elevated permission access denied and revoked' })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to deny permission', caption: err.message })
  }
}

async function handleHRAction(type, id, status) {
  const tableMap = {
    leaves: 'leave_requests',
    advances: 'employee_advances',
    loans: 'employee_loans',
    expenses: 'employee_expenses',
  }
  const table = tableMap[type]
  try {
    const { error } = await supabase
      .from(table)
      .update({ status, approved_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    $q.notify({ type: status === 'approved' ? 'positive' : 'warning', message: `Request ${status}` })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: `Failed to update request: ${err.message}` })
  }
}

function signOffShift(row) {
  $q.notify({ type: 'positive', message: `Shift Variance for ${row.cashier_name || 'Cashier'} signed off` })
}

async function handleApproveAmendment(row) {
  $q.dialog({
    title: 'Approve & Unlock Document',
    message: `Are you sure you want to unlock ${row.doc_type} "${row.doc_number}" for editing? This will return the document status to Draft.`,
    prompt: {
      model: '',
      type: 'text',
      label: 'Admin Authorization Note (Optional)',
    },
    cancel: true,
    persistent: true,
    ok: {
      label: 'Approve & Unlock',
      color: 'positive',
    },
  }).onOk(async (adminNotes) => {
    try {
      const res = await approveDocumentAmendment(row.id, row.doc_type, row.doc_id, adminNotes)
      if (!res.success) throw new Error(res.error)
      $q.notify({ type: 'positive', icon: 'lock_open', message: `Document ${row.doc_number} unlocked for editing!` })
      loadAllPending()
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to approve amendment: ' + err.message })
    }
  })
}

async function handleRejectAmendment(row) {
  $q.dialog({
    title: 'Reject Amendment Request',
    message: `Provide rejection justification for ${row.doc_number}:`,
    prompt: {
      model: '',
      type: 'text',
      label: 'Rejection Reason',
    },
    cancel: true,
    persistent: true,
    ok: {
      label: 'Reject Request',
      color: 'negative',
    },
  }).onOk(async (notes) => {
    try {
      const res = await rejectDocumentAmendment(row.id, notes)
      if (!res.success) throw new Error(res.error)
      $q.notify({ type: 'warning', message: `Amendment request for ${row.doc_number} rejected.` })
      loadAllPending()
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to reject amendment: ' + err.message })
    }
  })
}
</script>

<style scoped>
.border-bottom {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
</style>
