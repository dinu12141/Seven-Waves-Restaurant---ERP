<template>
  <q-page class="q-pa-md">
    <ErpPageHeader
      title="Goods Receipts"
      subtitle="Manage incoming stock from suppliers"
      icon="move_to_inbox"
      :breadcrumbs="[{ label: 'Procurement' }, { label: 'Goods Receipts' }]"
    >
      <template #actions>
        <q-btn unelevated no-caps color="primary" icon="add" label="New GRN" @click="createNewGRN" />
      </template>
    </ErpPageHeader>

    <!-- GRN List using BaseDataGrid -->
    <BaseDataGrid
      title="Goods Receipts"
      :subtitle="`${grns.length} records`"
      :columns="columns"
      :rows="grns"
      :loading="loading"
      :actions="gridActions"
      storage-key="grn-list"
      search-placeholder="Search by GRN#, supplier..."
      no-data-label="No goods receipts found"
      @view="editGRN"
      @delete="confirmDeleteGRN"
    />

    <!-- Delete Confirmation Dialog -->
    <q-dialog v-model="deleteConfirmVisible" persistent>
      <q-card style="min-width: 360px" class="erp-dialog-card erp-border-radius">
        <q-card-section class="row items-center">
          <q-avatar icon="warning" color="negative" text-color="white" size="42px" />
          <div class="q-ml-md">
            <div class="text-subtitle1 text-weight-bold">Delete GRN?</div>
            <div class="text-caption text-grey-6">{{ deleteTarget?.doc_number }}</div>
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <p v-if="deleteTarget?.status === 'posted'" class="text-body2 text-orange-7">
            <q-icon name="info" /> This GRN is <strong>Posted</strong>. Deleting it will
            <strong>reverse all stock movements</strong> back to inventory.
          </p>
          <p v-else class="text-body2">
            This will permanently delete the draft GRN and all its lines.
          </p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="deleteConfirmVisible = false" />
          <q-btn
            unelevated
            color="negative"
            label="Yes, Delete"
            :loading="deleting"
            @click="doDeleteGRN"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- GRN Dialog -->
    <q-dialog v-model="dialogVisible" persistent>
      <q-card
        style="width: 900px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column"
        class="erp-dialog-card erp-border-radius shadow-5"
      >
        <!-- Loading Overlay -->
        <q-inner-loading :showing="detailLoading" dark>
          <q-spinner-tail color="primary" size="40px" />
          <div class="q-mt-sm text-subtitle2">Loading GRN Details...</div>
        </q-inner-loading>

        <q-card-section class="row items-center justify-between q-pb-none">
          <div class="text-h6">
            {{ isEditing ? 'Edit Goods Receipt' : 'New Goods Receipt' }}
          </div>
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section class="col scroll q-pa-md">
          <DocHeader
            title="Goods Receipt"
            icon="inventory"
            :doc-number="form.doc_number"
            :status="form.status"
            v-model:docDate="form.doc_date"
            v-model:supplier="form.supplier"
            :supplier-options="supplierOptions"
            v-model:warehouse="form.warehouse"
            :warehouse-options="warehouseOptions"
            :read-only="form.status !== 'draft'"
          />

          <q-separator class="q-my-md" />

          <DocLinesEditor
            :lines="form.lines"
            mode="GRN"
            :read-only="form.status !== 'draft'"
            :item-options="itemOptions"
            :uom-options="uomOptions"
            title="Items Received"
            allow-add
            allow-edit-item
            allow-edit-uom
            @add-line="addLine"
            @remove-line="removeLine"
            @item-change="onItemChange"
            @uom-change="onUomChange"
          />

          <!-- Totals -->
          <div class="row justify-end q-mt-md">
            <div class="col-12 col-md-5">
              <div class="erp-card q-pa-md">
                <div class="row justify-between items-center q-mb-sm">
                  <span style="font-size: 14px; color: var(--erp-text-secondary)">Subtotal</span>
                  <span style="font-size: 16px; font-weight: 500;">
                    {{ formatCurrency(subtotalAmount) }}
                  </span>
                </div>
                <div class="row justify-between items-center q-mb-sm q-col-gutter-sm">
                  <div class="col-auto row items-center">
                    <span style="font-size: 14px; color: var(--erp-text-secondary)" class="q-mr-sm">Discount</span>
                    <q-btn-toggle
                      v-model="form.discount_type"
                      :options="[
                        {label: '%', value: 'percentage'},
                        {label: 'Fixed', value: 'amount'}
                      ]"
                      size="sm"
                      dense
                      unelevated
                      toggle-color="primary"
                      class="border"
                      :disable="form.status !== 'draft'"
                    />
                  </div>
                  <div class="col-4">
                    <q-input
                      v-model.number="form.discount_value"
                      type="number"
                      dense
                      outlined
                      min="0"
                      :max="form.discount_type === 'percentage' ? 100 : undefined"
                      input-class="text-right"
                      :readonly="form.status !== 'draft'"
                    />
                  </div>
                  <div class="col-auto text-right text-negative" style="font-size: 16px; font-weight: 500; min-width: 90px;">
                    - {{ formatCurrency(discountAmount) }}
                  </div>
                </div>

                <!-- TAX AMOUNT -->
                <div class="row justify-between items-center q-mb-sm q-col-gutter-sm" v-if="form.supplier?.tax_id">
                  <div class="col-auto row items-center">
                    <span style="font-size: 14px; color: var(--erp-text-secondary)" class="q-mr-sm">Tax Amount</span>
                  </div>
                  <div class="col-4">
                    <q-input
                      v-model.number="form.tax_pct"
                      type="number"
                      dense
                      outlined
                      min="0"
                      max="100"
                      input-class="text-right"
                      :readonly="form.status !== 'draft'"
                    >
                      <template v-slot:append>
                        <span class="text-caption">%</span>
                      </template>
                    </q-input>
                  </div>
                  <div class="col-auto text-right text-primary" style="font-size: 16px; font-weight: 500; min-width: 90px;">
                    + {{ formatCurrency(taxAmount) }}
                  </div>
                </div>

                <q-separator class="q-my-sm" />
                <div class="row justify-between items-center">
                  <span style="font-size: 14px; color: var(--erp-text-secondary)">Total Amount</span>
                  <span style="font-size: 18px; font-weight: 700; color: var(--erp-text-primary)">
                    {{ formatCurrency(totalAmount) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </q-card-section>

        <!-- Action Bar — no Save Draft, only Post (and Close for posted GRNs) -->
        <q-separator />
        <q-card-actions class="q-pa-md row items-center justify-between">
          <div>
            <q-btn
              v-if="form.status === 'draft'"
              flat
              label="Print"
              icon="print"
              @click="printGRN"
            />
          </div>
          <div class="row q-gutter-sm">
            <q-btn flat label="Close" @click="dialogVisible = false" />
            <q-btn
              v-if="form.status === 'draft'"
              unelevated
              color="primary"
              icon="check"
              label="Post GRN"
              :loading="saving"
              @click="saveGRN"
            />
            <q-btn
              v-if="form.status !== 'draft'"
              outline
              color="warning"
              icon="lock_open"
              label="Request Edit / Void Approval"
              @click="openAmendmentRequest"
            />
          </div>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useQuasar, date } from 'quasar'
import {
  listGRNs,
  createGRN,
  updateGRN,
  postGRN,
  deleteGRN,
  getGRNDetails,
  listSuppliers,
  listWarehouses,
  listItems,
  listUoms,
  listSupplierItems,
} from 'src/services/procurementService'
import DocHeader from 'components/procurement/DocHeader.vue'
import DocLinesEditor from 'components/procurement/DocLinesEditor.vue'
import BaseDataGrid from 'components/common/BaseDataGrid.vue'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'
import { useAuthStore } from 'src/stores/auth'
import { requestDocumentAmendment } from 'src/services/amendmentService'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)
const detailLoading = ref(false)
const deleting = ref(false)
const deleteConfirmVisible = ref(false)
const deleteTarget = ref(null)

const grns = ref([])
  const supplierOptions = ref([])
  const warehouseOptions = ref([])
  const allItems = ref([])
  const uomOptions = ref([])
  
  // Cache of supplier_item_prices rows for the currently selected supplier,
  // keyed by item_id, used to pre-fill unit_cost when a line's item changes.
  const supplierPriceMap = ref({})

  const itemOptions = computed(() => {
    if (Object.keys(supplierPriceMap.value).length === 0) return allItems.value

    const supplierItems = []
    const otherItems = []

    for (const item of allItems.value) {
      if (item.id in supplierPriceMap.value) {
        supplierItems.push({
          ...item,
          display_name: `⭐ ${item.name} (Supplier Item)`
        })
      } else {
        otherItems.push(item)
      }
    }

    return [...supplierItems, ...otherItems]
  })

// Form
const defaultForm = {
  id: '',
  doc_number: 'NEW',
  supplier: null,
  supplier_id: '',
  warehouse: null,
  warehouse_id: '',
  doc_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  status: 'draft',
  lines: [],
  discount_type: 'percentage',
  discount_value: 0,
  tax_pct: 0,
  tax_amount: 0,
  total_amount: 0,
  remarks: '',
}
const form = ref({ ...defaultForm })

const subtotalAmount = computed(() =>
  (form.value.lines || []).reduce(
    (acc, l) => acc + (l.line_total || l.quantity * (l.unit_cost || l.unit_price || 0)),
    0,
  )
)

const discountAmount = computed(() => {
  const subtotal = subtotalAmount.value
  const value = Number(form.value.discount_value) || 0
  if (form.value.discount_type === 'percentage') {
    return (subtotal * value) / 100
  }
  return value
})

const taxAmount = computed(() => {
  const taxable_amount = Math.max(0, subtotalAmount.value - discountAmount.value)
  const pct = Number(form.value.tax_pct) || 0
  return (taxable_amount * pct) / 100
})

const totalAmount = computed(() => Math.max(0, subtotalAmount.value - discountAmount.value) + taxAmount.value)

// --- BaseDataGrid config ---
const columns = [
  {
    name: 'doc_number',
    label: 'GRN #',
    field: 'doc_number',
    type: 'text',
    sortable: true,
    minWidth: 200,
    classes: 'text-no-wrap text-weight-medium',
  },
  { name: 'doc_date', label: 'Date', field: 'doc_date', type: 'date', sortable: true, minWidth: 120 },
  {
    name: 'supplier',
    label: 'Supplier',
    field: (row) => row.suppliers?.name || row.supplier_name || '-',
    type: 'text',
    sortable: true,
  },
  {
    name: 'warehouse',
    label: 'Warehouse',
    field: (row) => row.warehouses?.name || row.warehouse_name || '-',
    type: 'text',
    minWidth: 150,
  },
  {
    name: 'po_ref',
    label: 'PO Ref',
    field: (row) => row.purchase_orders?.doc_number || row.inventory_documents?.doc_number || '-',
    type: 'text',
    minWidth: 150,
  },
  {
    name: 'total_amount',
    label: 'Amount',
    field: 'total_amount',
    type: 'currency',
    align: 'right',
    sortable: true,
    minWidth: 120,
  },
  { name: 'status', label: 'Status', field: 'status', type: 'status', align: 'center', width: 110 },
]

const gridActions = [
  { event: 'view', icon: 'visibility', label: 'View' },
  { event: 'delete', icon: 'delete', label: 'Delete', danger: true },
]

onMounted(async () => {
  loading.value = true
  await Promise.all([fetchGRNs(), fetchSuppliers(), fetchWarehouses(), fetchItems(), fetchUoms()])
  loading.value = false
})

async function fetchGRNs() {
  try {
    grns.value = await listGRNs()
  } catch (e) {
    console.error('Failed to load GRNs:', e)
  }
}
async function fetchSuppliers() {
  supplierOptions.value = await listSuppliers()
}
async function fetchWarehouses() {
  warehouseOptions.value = await listWarehouses()
}
  async function fetchItems() {
    allItems.value = await listItems()
  }
async function fetchUoms() {
  uomOptions.value = await listUoms()
}

// ── Supplier item price prefill ────────────────────────────────────────
// Loads supplier_item_prices for the currently selected supplier so line
// unit_cost can be pre-filled from the supplier's last quoted price.
async function loadSupplierPrices(supplierId) {
  supplierPriceMap.value = {}
  if (!supplierId) return
  try {
    const rows = await listSupplierItems(supplierId)
    const map = {}
    for (const row of rows || []) {
      if (row.item_id && row.is_active !== false) {
        map[row.item_id] = row.last_price ?? 0
      }
    }
    supplierPriceMap.value = map
  } catch (e) {
    console.error('Failed to load supplier item prices:', e)
  }
}

function formatCurrency(val) {
  return `LKR\u00A0${(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function createNewGRN() {
  isEditing.value = false
  form.value = { ...defaultForm, lines: [] }
  supplierPriceMap.value = {}
  dialogVisible.value = true
}

// ── View / Edit GRN ────────────────────────────────────────────────────
async function editGRN(row) {
  isEditing.value = true
  form.value = {
    ...defaultForm,
    id: row.id,
    doc_number: row.doc_number,
    status: row.status,
    lines: [],
  }
  detailLoading.value = true
  dialogVisible.value = true

  try {
    const full = await getGRNDetails(row.id)

    // NOTE: getGRNDetails now returns goods_receipt_lines (not mapping_lines)
    const rawLines = full.goods_receipt_lines || []
    const lines = rawLines.map((l, idx) => ({
      line_number: l.line_number || idx + 1,
      item_id: l.item_id,
      item_name: l.items?.name || l.item_name || '',
      uom_id: l.uom_id,
      uom_name: l.uom?.name || l.uom?.code || '',
      quantity: l.quantity,
      unit_cost: l.unit_cost || 0,
      unit_price: l.unit_cost || 0,
      line_total: l.line_total || l.quantity * (l.unit_cost || 0),
      batch_no: l.batch_no || '',
      expiry_date: l.expiry_date || '',
    }))

    form.value = {
      ...full,
      supplier:
        full.suppliers ||
        (full.supplier_id
          ? supplierOptions.value.find((s) => s.id === full.supplier_id) || null
          : null),
      warehouse:
        full.warehouses ||
        (full.warehouse_id
          ? warehouseOptions.value.find((w) => w.id === full.warehouse_id) || null
          : null),
      discount_type: full.discount_type || 'percentage',
      discount_value: full.discount_value || 0,
      tax_pct: full.tax_pct || 0,
      tax_amount: full.tax_amount || 0,
      total_amount: full.total_amount || 0,
      lines,
    }
  } catch (e) {
    console.error('Failed to load GRN details:', e)
    $q.notify({ type: 'negative', message: 'Could not load GRN details', caption: e.message })
    dialogVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

// ── Line Editing ────────────────────────────────────────────────────────
function addLine() {
  form.value.lines.push({
    line_number: form.value.lines.length + 1,
    item_id: '',
    item_name: '',
    uom_id: '',
    uom_name: '',
    quantity: 1,
    unit_cost: 0,
    unit_price: 0,
    line_total: 0,
  })
}

function removeLine(index) {
  form.value.lines.splice(index, 1)
}

function onItemChange(line, item) {
  if (!item) return
  line.item_id = item.id
  line.item_name = item.name
  line.uom_id = item.purchase_uom_id || item.inventory_uom_id || item.default_uom_id || item.uom_id || ''
  line.uom_name = item.uom_name || item.uom?.name || item.uom?.code || 'PCS'

  // Pre-fill unit price from supplier_item_prices.last_price as a starting
  // suggestion — user can still override with the actual invoice price.
  const suggestedPrice = supplierPriceMap.value[item.id]
  line.unit_cost = suggestedPrice != null ? suggestedPrice : 0
  line.unit_price = line.unit_cost
  line.line_total = (line.quantity || 0) * line.unit_cost
}

// Reload supplier price suggestions whenever the GRN's supplier changes
// (new GRN creation flow — supplier is chosen via DocHeader).
watch(
  () => form.value.supplier,
  (supplier) => {
    const supplierId = supplier?.id
    if (supplierId) {
      loadSupplierPrices(supplierId)
    } else {
      supplierPriceMap.value = {}
    }
  },
)

function onUomChange(line, uom) {
  if (!uom) return
  line.uom_id = uom.id
  line.uom_name = uom.name || uom.code || 'PCS'
}

// ── Save / Post ─────────────────────────────────────────────────────────
async function saveGRN() {
  saving.value = true
  try {
    let grn
    let isNewGRN = false
    const supplierId = form.value.supplier?.id || form.value.supplier_id
    const warehouseId = form.value.warehouse?.id || form.value.warehouse_id

    if (!form.value.id) {
      // New GRN — always supplier-direct, never linked to a PO.
      isNewGRN = true
      if (!supplierId || !warehouseId) {
        $q.notify({ type: 'warning', message: 'Supplier and Warehouse are required' })
        return
      }
      if (!form.value.lines?.length) {
        $q.notify({ type: 'warning', message: 'At least one line item is required' })
        return
      }

      const lines = form.value.lines.map((l, idx) => ({
        line_number: idx + 1,
        item_id: l.item_id,
        uom_id: l.uom_id,
        quantity: l.quantity,
        unit_cost: l.unit_cost || l.unit_price || 0,
        batch_no: l.batch_no || null,
        expiry_date: l.expiry_date || null,
        notes: l.notes || null,
      }))

      grn = await createGRN(
        {
          supplier_id: supplierId,
          warehouse_id: warehouseId,
          doc_date: form.value.doc_date,
          remarks: form.value.remarks,
          discount_type: form.value.discount_type,
          discount_value: form.value.discount_value,
          tax_pct: form.value.tax_pct,
          tax_amount: taxAmount.value,
        },
        lines,
      )
    } else {
      // Existing draft GRN — update header and lines
      const lines = form.value.lines.map((l, idx) => ({
        line_number: idx + 1,
        item_id: l.item_id,
        uom_id: l.uom_id,
        quantity: l.quantity,
        unit_cost: l.unit_cost || l.unit_price || 0,
        batch_no: l.batch_no || null,
        expiry_date: l.expiry_date || null,
        notes: l.notes || null,
      }))
      grn = await updateGRN(
        form.value.id,
        { 
          doc_date: form.value.doc_date, 
          warehouse_id: warehouseId, 
          remarks: form.value.remarks,
          discount_type: form.value.discount_type,
          discount_value: form.value.discount_value,
          tax_pct: form.value.tax_pct,
          tax_amount: taxAmount.value,
        },
        lines,
      )
    }

    // Always post — GRNs should never remain in draft
    if (grn?.id) {
      const res = await postGRN(grn.id)
      if (!res.success) {
        // If posting fails on a newly created GRN, clean up the draft
        if (isNewGRN) {
          try { await deleteGRN(grn.id) } catch { /* ignore cleanup errors */ }
        }
        throw new Error(res.error || 'Failed to post GRN')
      }
      $q.notify({ type: 'positive', message: `GRN ${res.doc_number} Posted Successfully` })
    }

    dialogVisible.value = false
    fetchGRNs()
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed to post GRN', caption: e.message })
  } finally {
    saving.value = false
  }
}

// ── Delete ──────────────────────────────────────────────────────────────
function confirmDeleteGRN(row) {
  deleteTarget.value = row
  deleteConfirmVisible.value = true
}

async function doDeleteGRN() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const res = await deleteGRN(deleteTarget.value.id)
    if (!res.success) throw new Error(res.error)
    $q.notify({
      type: 'positive',
      message: `GRN ${deleteTarget.value.doc_number} deleted`,
      caption:
        deleteTarget.value.status === 'posted'
          ? 'Stock movements have been reversed'
          : undefined,
    })
    deleteConfirmVisible.value = false
    deleteTarget.value = null
    fetchGRNs()
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Delete Failed', caption: e.message })
  } finally {
    deleting.value = false
  }
}

function printGRN() {}

function openAmendmentRequest() {
  $q.dialog({
    title: 'Request Edit / Void Authorization',
    message: `This GRN (${form.value.doc_number || ''}) is locked. Enter justification for Admin Approval:`,
    prompt: {
      model: '',
      type: 'textarea',
      label: 'Reason for modification / voiding',
    },
    cancel: true,
    persistent: true,
    ok: {
      label: 'Submit for Admin Approval',
      color: 'warning',
    },
  }).onOk(async (reason) => {
    if (!reason?.trim()) {
      $q.notify({ type: 'warning', message: 'Justification reason is required.' })
      return
    }
    try {
      const res = await requestDocumentAmendment({
        docType: 'GRN',
        docId: form.value.id || '',
        docNumber: form.value.doc_number || 'GRN',
        branchId: authStore.currentBranch?.id,
        requestedById: authStore.user?.id,
        requestedByName: authStore.userDisplayName || 'Storekeeper',
        requesterRole: authStore.roles?.[0] || 'Staff',
        reason,
      })
      if (!res.success) throw new Error(res.error)
      $q.notify({
        type: 'positive',
        icon: 'verified',
        message: 'Amendment request submitted to Admin Approvals Center!',
      })
      dialogVisible.value = false
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to submit request: ' + err.message })
    }
  })
}
</script>
