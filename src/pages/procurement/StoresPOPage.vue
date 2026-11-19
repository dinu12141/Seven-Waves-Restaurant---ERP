<template>
  <q-page class="q-pa-md">
    <ErpPageHeader
      title="Stores Purchase Orders"
      subtitle="Review and approve or reject Purchase Orders submitted by Stores"
      icon="storefront"
      :breadcrumbs="[{ label: 'Procurement' }, { label: 'Stores PO' }]"
    >
      <template #actions>
        <q-btn flat round dense icon="refresh" :loading="loading" @click="fetchStoresPOs">
          <q-tooltip>Refresh</q-tooltip>
        </q-btn>
      </template>
    </ErpPageHeader>

    <!-- Status Tabs -->
    <div class="erp-tab-bar q-mb-md">
      <button
        v-for="t in tabOptions"
        :key="t.value"
        class="erp-tab"
        :class="{ 'erp-tab--active': activeTab === t.value }"
        @click="activeTab = t.value"
      >
        {{ t.label }}
        <span class="erp-tab__count" :class="{ 'bg-amber-8 text-white': t.value === 'pending_approval' && tabCount(t.value) > 0 }">
          {{ tabCount(t.value) }}
        </span>
      </button>
    </div>

    <!-- Search & Filter Controls -->
    <div class="row q-col-gutter-sm q-mb-md items-center">
      <div class="col-12 col-sm-6 col-md-4">
        <q-input
          v-model="searchQuery"
          dense
          outlined
          clearable
          placeholder="Search by PO#, supplier, or remarks…"
          debounce="300"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-select
          v-model="supplierFilter"
          :options="supplierSelectOptions"
          dense
          outlined
          clearable
          emit-value
          map-options
          label="Filter by Supplier"
        />
      </div>

      <q-space />

      <div class="col-auto text-caption text-grey-7">
        Showing {{ filteredPOs.length }} Stores POs
      </div>
    </div>

    <!-- Stores POs Table -->
    <q-table
      flat
      bordered
      class="erp-table shadow-1"
      :rows="filteredPOs"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 15 }"
      no-data-label="No stores purchase orders found"
    >
      <!-- Doc Number -->
      <template #body-cell-doc_number="cellProps">
        <q-td :props="cellProps">
          <span class="text-weight-bold text-primary cursor-pointer" @click="openReviewDialog(cellProps.row)">
            {{ cellProps.value }}
          </span>
        </q-td>
      </template>

      <!-- Status -->
      <template #body-cell-status="cellProps">
        <q-td :props="cellProps">
          <q-chip
            dense
            size="sm"
            :color="getStatusColor(cellProps.value)"
            :text-color="getStatusTextColor(cellProps.value)"
            :icon="getStatusIcon(cellProps.value)"
            class="text-weight-medium text-capitalize q-px-sm"
          >
            {{ formatStatus(cellProps.value) }}
          </q-chip>
          <div
            v-if="cellProps.row.status === 'rejected' && cellProps.row.reject_reason"
            class="text-caption text-negative q-mt-xs text-italic"
          >
            Reason: {{ cellProps.row.reject_reason }}
          </div>
        </q-td>
      </template>

      <!-- Total Amount -->
      <template #body-cell-total_amount="cellProps">
        <q-td :props="cellProps" class="text-right text-weight-bold">
          {{ formatCurrency(cellProps.value) }}
        </q-td>
      </template>

      <!-- Actions -->
      <template #body-cell-actions="cellProps">
        <q-td :props="cellProps" class="text-right">
          <q-btn
            v-if="cellProps.row.status === 'pending_approval'"
            unelevated
            dense
            no-caps
            size="sm"
            icon="rate_review"
            label="Review & Action"
            color="amber-9"
            text-color="dark"
            class="text-weight-bold q-px-sm"
            @click="openReviewDialog(cellProps.row)"
          />
          <q-btn
            v-else
            flat
            dense
            round
            size="sm"
            icon="visibility"
            color="primary"
            @click="openReviewDialog(cellProps.row)"
          >
            <q-tooltip>View Details</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- ── Review PO Dialog (Read-Only View with Approve/Reject Actions) ──── -->
    <q-dialog v-model="reviewDialogVisible" persistent maximized-mobile>
      <q-card style="width: 1000px; max-width: 96vw; max-height: 90vh; display: flex; flex-direction: column" class="erp-dialog-card shadow-5">
        <q-card-section class="row items-center justify-between bg-primary text-white q-py-sm">
          <div class="row items-center q-gutter-sm">
            <q-icon name="storefront" size="24px" />
            <div class="text-h6 text-weight-bold">
              Review Stores PO: {{ currentPO?.doc_number }}
            </div>
          </div>
          <q-btn icon="close" flat round dense v-close-popup text-color="white" />
        </q-card-section>

        <q-separator />

        <q-card-section class="col scroll q-pa-md" v-if="currentPO">
          <!-- Status Banner -->
          <q-banner
            rounded
            class="q-mb-md"
            :class="{
              'bg-amber-1 text-amber-10': currentPO.status === 'pending_approval',
              'bg-positive text-white': currentPO.status === 'approved',
              'bg-negative text-white': currentPO.status === 'rejected',
              'bg-grey-3 text-dark': currentPO.status === 'draft',
            }"
          >
            <template #avatar>
              <q-icon :name="getStatusIcon(currentPO.status)" size="32px" />
            </template>
            <div class="text-subtitle1 text-weight-bold">
              Status: {{ formatStatus(currentPO.status) }}
            </div>
            <div v-if="currentPO.status === 'pending_approval'" class="text-body2">
              This Purchase Order was created by Stores and requires Procurement review. You can either approve or reject it.
            </div>
            <div v-else-if="currentPO.status === 'approved'" class="text-body2">
              Approved by Procurement. This PO is now authorized for supplier ordering.
              <span v-if="currentPO.approved_at" class="q-ml-sm text-caption">
                (Approved: {{ currentPO.approved_at.slice(0, 16).replace('T', ' ') }})
              </span>
            </div>
            <div v-else-if="currentPO.status === 'rejected'" class="text-body2">
              Rejected. Reason: {{ currentPO.reject_reason || 'No specific reason provided' }}
              <span v-if="currentPO.cancelled_at" class="q-ml-sm text-caption">
                (Rejected: {{ currentPO.cancelled_at.slice(0, 16).replace('T', ' ') }})
              </span>
            </div>
          </q-banner>

          <!-- PO Overview Cards -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-sm-6 col-md-3">
              <q-card flat bordered class="q-pa-sm bg-grey-1">
                <div class="text-caption text-grey-7">PO Number</div>
                <div class="text-weight-bold text-subtitle2">{{ currentPO.doc_number }}</div>
              </q-card>
            </div>

            <div class="col-12 col-sm-6 col-md-3">
              <q-card flat bordered class="q-pa-sm bg-grey-1">
                <div class="text-caption text-grey-7">Supplier</div>
                <div class="text-weight-bold text-subtitle2">{{ currentPO.suppliers?.name || '—' }}</div>
                <div v-if="currentPO.suppliers?.code" class="text-caption text-grey-6">
                  Code: {{ currentPO.suppliers.code }}
                </div>
              </q-card>
            </div>

            <div class="col-12 col-sm-6 col-md-3">
              <q-card flat bordered class="q-pa-sm bg-grey-1">
                <div class="text-caption text-grey-7">Order Date</div>
                <div class="text-weight-bold text-subtitle2">{{ currentPO.doc_date }}</div>
              </q-card>
            </div>

            <div class="col-12 col-sm-6 col-md-3">
              <q-card flat bordered class="q-pa-sm bg-grey-1">
                <div class="text-caption text-grey-7">Expected Delivery</div>
                <div class="text-weight-bold text-subtitle2">{{ currentPO.expected_date || 'Not specified' }}</div>
              </q-card>
            </div>

            <div class="col-12" v-if="currentPO.remarks">
              <q-card flat bordered class="q-pa-sm bg-grey-1">
                <div class="text-caption text-grey-7">Stores Remarks / Instructions</div>
                <div class="text-body2">{{ currentPO.remarks }}</div>
              </q-card>
            </div>
          </div>

          <!-- Items Table -->
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-subtitle1 text-weight-bold">
              Requested Items ({{ currentPOLines.length }})
            </div>
            <div class="text-caption text-grey-7">
              View-only format — verify quantities and pricing before action
            </div>
          </div>

          <q-inner-loading :showing="loadingLines">
            <q-spinner color="primary" size="30px" />
          </q-inner-loading>

          <div class="q-table__container erp-table erp-border-radius overflow-hidden shadow-1 q-mb-md">
            <table class="q-table q-table--horizontal-separator" style="width: 100%">
              <thead>
                <tr class="bg-grey-2 text-dark">
                  <th style="width: 40px" class="text-center">#</th>
                  <th class="text-left">Item Name & Code</th>
                  <th class="text-left">Description</th>
                  <th style="width: 120px" class="text-left">UOM</th>
                  <th style="width: 100px" class="text-right">Qty</th>
                  <th style="width: 140px" class="text-right">Unit Price (LKR)</th>
                  <th style="width: 150px" class="text-right">Total (LKR)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(l, idx) in currentPOLines" :key="l.id || idx">
                  <td class="text-center text-grey-7">{{ idx + 1 }}</td>
                  <td>
                    <div class="text-weight-medium">{{ l.items?.name || l.item_name || 'Item' }}</div>
                    <div v-if="l.items?.code" class="text-caption text-grey-6">Code: {{ l.items.code }}</div>
                  </td>
                  <td class="text-grey-8">{{ l.description || '—' }}</td>
                  <td>{{ l.uom?.name || l.uom?.code || l.uom_name || '—' }}</td>
                  <td class="text-right text-weight-bold">{{ Number(l.quantity).toLocaleString() }}</td>
                  <td class="text-right">{{ formatCurrency(l.unit_price) }}</td>
                  <td class="text-right text-weight-bold">
                    {{ formatCurrency((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Total Summary -->
          <div class="row justify-end q-mt-md">
            <div class="col-12 col-md-5">
              <q-card flat bordered class="q-pa-md bg-grey-1">
                <div class="row justify-between items-center text-h6 text-weight-bold text-primary">
                  <span>Grand Total:</span>
                  <span>{{ formatCurrency(currentPO.total_amount) }}</span>
                </div>
              </q-card>
            </div>
          </div>
        </q-card-section>

        <q-separator />

        <!-- Action Footer -->
        <q-card-actions align="between" class="q-pa-md bg-grey-1">
          <q-btn flat no-caps label="Close" color="grey-7" v-close-popup />

          <!-- Approve / Reject actions ONLY when pending_approval -->
          <div v-if="currentPO?.status === 'pending_approval'" class="row q-gutter-sm">
            <q-btn
              unelevated
              no-caps
              label="Reject PO"
              color="negative"
              icon="close"
              :loading="actionLoading"
              @click="promptReject"
            />
            <q-btn
              unelevated
              no-caps
              label="Approve PO"
              color="positive"
              icon="check_circle"
              class="text-weight-bold q-px-md"
              :loading="actionLoading"
              @click="confirmApprove"
            />
          </div>

          <!-- Already finalized status view -->
          <div v-else class="text-caption text-grey-8 row items-center q-gutter-xs">
            <q-icon :name="getStatusIcon(currentPO?.status)" size="18px" :color="getStatusColor(currentPO?.status)" />
            <span>PO is {{ formatStatus(currentPO?.status) }} — no further actions required</span>
          </div>
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Reject Reason Dialog -->
    <q-dialog v-model="rejectDialogVisible" persistent>
      <q-card style="width: 480px; max-width: 90vw">
        <q-card-section class="bg-negative text-white q-py-sm">
          <div class="text-h6 text-weight-bold">Reject Stores Purchase Order</div>
        </q-card-section>
        <q-card-section class="q-pa-md">
          <div class="text-body2 q-mb-md">
            Please provide a reason for rejecting PO <strong>{{ currentPO?.doc_number }}</strong>. Stores staff will be able to see this reason.
          </div>
          <q-input
            v-model="rejectReason"
            type="textarea"
            rows="3"
            dense
            outlined
            placeholder="e.g. Price too high, stock already sufficient in Main Store, alternate supplier preferred…"
            autofocus
            :rules="[val => !!(val && val.trim()) || 'Rejection reason is required']"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md bg-grey-1">
          <q-btn flat no-caps label="Cancel" color="grey-7" v-close-popup />
          <q-btn
            unelevated
            no-caps
            label="Confirm Rejection"
            color="negative"
            :loading="actionLoading"
            @click="submitReject"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'
import {
  listStoresPOs,
  approveStoresPO,
  rejectStoresPO,
  getPODetails,
  listSuppliers,
} from 'src/services/procurementService'

const $q = useQuasar()

const loading = ref(false)
const actionLoading = ref(false)
const loadingLines = ref(false)

const storesPOs = ref([])
const activeTab = ref('all')
const searchQuery = ref('')
const supplierFilter = ref(null)
const suppliers = ref([])

// Review Dialog
const reviewDialogVisible = ref(false)
const currentPO = ref(null)
const currentPOLines = ref([])

// Reject Dialog
const rejectDialogVisible = ref(false)
const rejectReason = ref('')

const tabOptions = [
  { label: 'All Stores POs', value: 'all' },
  { label: 'Pending Approval', value: 'pending_approval' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

const columns = [
  { name: 'doc_number', label: 'PO #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'expected_date', label: 'Expected Date', field: 'expected_date', align: 'left', sortable: true },
  { name: 'supplier_name', label: 'Supplier', field: row => row.suppliers?.name || '—', align: 'left', sortable: true },
  { name: 'total_amount', label: 'Total Amount', field: 'total_amount', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'created_at', label: 'Created At', field: row => row.created_at ? row.created_at.slice(0, 10) : '—', align: 'left', sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

function tabCount(val) {
  if (val === 'all') return storesPOs.value.length
  return storesPOs.value.filter(p => p.status === val).length
}

const filteredPOs = computed(() => {
  return storesPOs.value.filter(p => {
    if (activeTab.value !== 'all' && p.status !== activeTab.value) return false
    if (supplierFilter.value && p.supplier_id !== supplierFilter.value) return false
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase().trim()
      const matchDoc = p.doc_number?.toLowerCase().includes(q)
      const matchSupplier = p.suppliers?.name?.toLowerCase().includes(q)
      const matchRemarks = p.remarks?.toLowerCase().includes(q)
      if (!matchDoc && !matchSupplier && !matchRemarks) return false
    }
    return true
  })
})

const supplierSelectOptions = computed(() => {
  return suppliers.value.map(s => ({
    label: s.name,
    value: s.id,
  }))
})

function formatCurrency(val) {
  return (
    'LKR ' +
    Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function getStatusColor(st) {
  switch (st) {
    case 'approved': return 'positive'
    case 'pending_approval': return 'amber-9'
    case 'rejected': return 'negative'
    case 'draft': return 'grey-6'
    default: return 'primary'
  }
}

function getStatusTextColor(st) {
  if (st === 'pending_approval') return 'dark'
  return 'white'
}

function getStatusIcon(st) {
  switch (st) {
    case 'approved': return 'check_circle'
    case 'pending_approval': return 'hourglass_empty'
    case 'rejected': return 'cancel'
    default: return 'edit_note'
  }
}

function formatStatus(st) {
  switch (st) {
    case 'pending_approval': return 'Pending Approval'
    case 'approved': return 'Approved'
    case 'rejected': return 'Rejected'
    case 'draft': return 'Draft'
    default: return st || 'Draft'
  }
}

async function fetchStoresPOs() {
  loading.value = true
  try {
    storesPOs.value = await listStoresPOs()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to load Stores POs: ' + (err.message || err) })
  } finally {
    loading.value = false
  }
}

async function openReviewDialog(po) {
  currentPO.value = { ...po }
  currentPOLines.value = []
  reviewDialogVisible.value = true
  loadingLines.value = true

  try {
    const details = await getPODetails(po.id)
    if (details && details.lines) {
      currentPOLines.value = details.lines
    }
  } catch (err) {
    console.error('Error fetching PO lines:', err)
  } finally {
    loadingLines.value = false
  }
}

function confirmApprove() {
  if (!currentPO.value) return

  $q.dialog({
    title: 'Approve Purchase Order',
    message: `Are you sure you want to approve PO ${currentPO.value.doc_number}? Total amount: ${formatCurrency(currentPO.value.total_amount)}`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    actionLoading.value = true
    try {
      await approveStoresPO(currentPO.value.id)
      $q.notify({
        type: 'positive',
        message: `PO ${currentPO.value.doc_number} successfully approved.`,
      })
      currentPO.value.status = 'approved'
      currentPO.value.approved_at = new Date().toISOString()
      await fetchStoresPOs()
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to approve PO: ' + (err.message || err) })
    } finally {
      actionLoading.value = false
    }
  })
}

function promptReject() {
  rejectReason.value = ''
  rejectDialogVisible.value = true
}

async function submitReject() {
  if (!rejectReason.value || !rejectReason.value.trim()) {
    $q.notify({ type: 'warning', message: 'Please enter a reason for rejection.' })
    return
  }

  actionLoading.value = true
  try {
    await rejectStoresPO(currentPO.value.id, rejectReason.value.trim())
    $q.notify({
      type: 'warning',
      message: `PO ${currentPO.value.doc_number} has been rejected.`,
    })
    currentPO.value.status = 'rejected'
    currentPO.value.reject_reason = rejectReason.value.trim()
    currentPO.value.cancelled_at = new Date().toISOString()
    rejectDialogVisible.value = false
    await fetchStoresPOs()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to reject PO: ' + (err.message || err) })
  } finally {
    actionLoading.value = false
  }
}

onMounted(async () => {
  await fetchStoresPOs()
  try {
    suppliers.value = await listSuppliers()
  } catch (e) {
    console.error('Error fetching suppliers:', e)
  }
})
</script>

<style scoped>
.erp-tab-bar {
  display: flex;
  gap: 8px;
  border-bottom: 2px solid var(--erp-border, #e2e8f0);
  padding-bottom: 2px;
}

.erp-tab {
  background: transparent;
  border: none;
  outline: none;
  cursor: pointer;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--erp-text-secondary, #64748b);
  border-radius: 6px 6px 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.erp-tab:hover {
  background: var(--erp-bg-hover, #f1f5f9);
  color: var(--erp-text-primary, #0f172a);
}

.erp-tab--active {
  color: var(--q-primary, #1976d2);
  border-bottom: 2px solid var(--q-primary, #1976d2);
  font-weight: 600;
}

.erp-tab__count {
  background: var(--erp-badge-bg, #e2e8f0);
  color: var(--erp-badge-text, #334155);
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
}
</style>
