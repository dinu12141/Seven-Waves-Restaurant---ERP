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
          <!-- Status / Authorization Banners -->
          <q-banner v-if="activeApproval && isAuthorizedEditor" rounded class="bg-positive text-white q-mb-md shadow-1">
            <template v-slot:avatar>
              <q-icon name="lock_open" color="white" />
            </template>
            <div class="text-weight-bold">Authorized for One-Time Edit</div>
            <div class="text-caption">
              Admin approved your modification request: "{{ activeApproval.admin_notes || activeApproval.reason || 'Approved' }}". 
              You have single-use authorization to edit this GRN. Once you click "Save Changes & Lock", the document will be securely locked again.
            </div>
          </q-banner>

          <q-banner v-else-if="activeApproval && !isAuthorizedEditor" rounded class="bg-amber-2 text-dark q-mb-md border-amber shadow-1">
            <template v-slot:avatar>
              <q-icon name="lock" color="warning" />
            </template>
            <div class="text-weight-bold">Locked (Authorized for {{ activeApproval.requested_by_name || 'Requester' }})</div>
            <div class="text-caption">
              Admin approved this GRN for <b>{{ activeApproval.requested_by_name }}</b> to make a single correction. Only {{ activeApproval.requested_by_name }} is authorized to edit it.
            </div>
          </q-banner>

          <q-banner v-else-if="pendingApproval" rounded class="bg-blue-1 text-dark q-mb-md border-blue shadow-1">
            <template v-slot:avatar>
              <q-icon name="hourglass_top" color="primary" />
            </template>
            <div class="text-weight-bold">Admin Approval Pending</div>
            <div class="text-caption">
              An edit request was submitted by <b>{{ pendingApproval.requested_by_name }}</b> ("{{ pendingApproval.reason }}"). Awaiting review in the Admin Approvals Center.
            </div>
          </q-banner>

          <q-banner v-else-if="form.status !== 'draft' && form.id" rounded class="bg-grey-2 text-grey-9 q-mb-md shadow-1">
            <template v-slot:avatar>
              <q-icon name="lock" color="grey-7" />
            </template>
            <div class="text-weight-bold">Document Locked (POSTED)</div>
            <div class="text-caption">
              This Goods Receipt is locked in the system. To make any corrections, submit a request for Admin Approval below.
            </div>
          </q-banner>

          <DocHeader
            title="Goods Receipt"
            icon="inventory"
            :doc-number="form.doc_number"
            @update:doc-number="form.doc_number = $event"
            :editable-doc-number="true"
            doc-number-label="GRN / Bill No *"
            :status="form.status"
            v-model:docDate="form.doc_date"
            v-model:supplier="form.supplier"
            :supplier-options="supplierOptions"
            v-model:warehouse="form.warehouse"
            :warehouse-options="warehouseOptions"
            :read-only="!isAuthorizedEditor"
          />

          <q-separator class="q-my-md" />

          <DocLinesEditor
            :lines="form.lines"
            mode="GRN"
            :read-only="!isAuthorizedEditor"
            :item-options="itemOptions"
            :uom-options="uomOptions"
            title="Items Received"
            :allow-add="isAuthorizedEditor"
            :allow-edit-item="isAuthorizedEditor"
            :allow-edit-uom="isAuthorizedEditor"
            @add-line="addLine"
            @remove-line="removeLine"
            @item-change="onItemChange"
            @uom-change="onUomChange"
          />

          <!-- Totals -->
          <div class="row justify-end q-mt-md">
            <div class="col-12 col-md-5">
              <div class="erp-card q-pa-md">
                <!-- Subtotal (Gross before line discounts) -->
                <div class="row justify-between items-center q-mb-sm">
                  <span style="font-size: 14px; color: var(--erp-text-secondary)">Subtotal</span>
                  <span style="font-size: 16px; font-weight: 500;">
                    {{ formatCurrency(grossSubtotal) }}
                  </span>
                </div>

                <!-- Item Discounts (shown if any line has discount) -->
                <div class="row justify-between items-center q-mb-sm text-negative" v-if="itemDiscountsTotal > 0">
                  <span style="font-size: 14px;">Item Discounts</span>
                  <span style="font-size: 16px; font-weight: 500;">
                    - {{ formatCurrency(itemDiscountsTotal) }}
                  </span>
                </div>

                <!-- Bill Discount (% or Fixed) -->
                <div class="row justify-between items-center q-mb-sm q-col-gutter-sm">
                  <div class="col-auto row items-center">
                    <span style="font-size: 14px; color: var(--erp-text-secondary)" class="q-mr-sm">Bill Discount</span>
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
                      :disable="!isAuthorizedEditor"
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
                      :readonly="!isAuthorizedEditor"
                    />
                  </div>
                  <div class="col-auto text-right text-negative" style="font-size: 16px; font-weight: 500; min-width: 90px;">
                    - {{ formatCurrency(billDiscountAmount) }}
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
                      :readonly="!isAuthorizedEditor"
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
                  <span style="font-size: 15px; font-weight: 700; color: var(--erp-text-secondary)">Total Amount</span>
                  <span style="font-size: 18px; font-weight: 700; color: var(--erp-text-primary)">
                    {{ formatCurrency(totalAmount) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </q-card-section>

        <!-- Action Bar -->
        <q-separator />
        <q-card-actions class="q-pa-md row items-center justify-between">
          <div>
            <q-btn
              v-if="form.status === 'draft' || isAuthorizedEditor"
              flat
              label="Print"
              icon="print"
              @click="printGRN"
            />
          </div>
          <div class="row q-gutter-sm">
            <q-btn flat label="Close" @click="dialogVisible = false" />
            <q-btn
              v-if="isAuthorizedEditor"
              unelevated
              color="primary"
              icon="check"
              :label="activeApproval ? 'Save Changes & Lock' : 'Post GRN'"
              :loading="saving"
              @click="saveGRN"
            />
            <q-btn
              v-if="!isAuthorizedEditor && !pendingApproval"
              outline
              color="warning"
              icon="lock_open"
              label="Request Edit / Void Approval"
              @click="openAmendmentRequest"
            />
            <q-btn
              v-if="!isAuthorizedEditor && pendingApproval"
              outline
              color="grey-7"
              icon="hourglass_top"
              label="Approval Pending"
              disable
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
import {
  requestDocumentAmendment,
  getActiveApprovedAmendment,
  getPendingAmendment,
  consumeDocumentAmendment,
} from 'src/services/amendmentService'

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

const activeApproval = ref(null)
const pendingApproval = ref(null)

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
  doc_number: '',
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

const grossSubtotal = computed(() =>
  (form.value.lines || []).reduce((acc, l) => {
    const qty = Number(l.quantity) || 0
    const price = Number(l.unit_cost || l.unit_price) || 0
    return acc + qty * price
  }, 0)
)

const itemDiscountsTotal = computed(() =>
  (form.value.lines || []).reduce((acc, l) => acc + (Number(l.discount_amount) || 0), 0)
)

const netLinesSubtotal = computed(() => Math.max(0, grossSubtotal.value - itemDiscountsTotal.value))

const billDiscountAmount = computed(() => {
  const base = netLinesSubtotal.value
  const value = Math.max(0, Number(form.value.discount_value) || 0)
  if (form.value.discount_type === 'percentage') {
    return (base * Math.min(100, value)) / 100
  }
  return Math.min(base, value)
})

const totalDiscountAmount = computed(() => itemDiscountsTotal.value + billDiscountAmount.value)

const taxAmount = computed(() => {
  const taxable_amount = Math.max(0, netLinesSubtotal.value - billDiscountAmount.value)
  const pct = Math.min(100, Math.max(0, Number(form.value.tax_pct) || 0))
  return (taxable_amount * pct) / 100
})

const totalAmount = computed(() => Math.max(0, netLinesSubtotal.value - billDiscountAmount.value) + taxAmount.value)

// Strictly authorize edit access:
// Only brand new documents, ordinary drafts, OR the user who requested the approved amendment can edit!
const isAuthorizedEditor = computed(() => {
  if (!form.value.id) return true

  if (form.value.status === 'draft' && !activeApproval.value) {
    return true
  }

  if (activeApproval.value) {
    const currentUserId = authStore.user?.id
    const isRequester = currentUserId && activeApproval.value.requested_by_id === currentUserId
    const isAdmin = authStore.isAdmin || authStore.roles?.includes('admin') || authStore.roles?.includes('super_admin')
    return Boolean(isRequester || isAdmin)
  }

  return false
})

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

// In-memory cache for loaded GRN details so viewing previously opened GRNs is instantaneous
const grnDetailsCache = new Map()

function createNewGRN() {
  isEditing.value = false
  activeApproval.value = null
  pendingApproval.value = null
  form.value = { ...defaultForm, lines: [] }
  supplierPriceMap.value = {}
  dialogVisible.value = true
}

// ── View / Edit GRN ────────────────────────────────────────────────────
async function editGRN(row) {
  isEditing.value = true
  activeApproval.value = getActiveApprovedAmendment('GRN', row.id, row.remarks)
  pendingApproval.value = getPendingAmendment('GRN', row.id, row.remarks)

  const supplierObj =
    row.suppliers ||
    (row.supplier_id ? supplierOptions.value.find((s) => s.id === row.supplier_id) || null : null)
  const warehouseObj =
    row.warehouses ||
    (row.warehouse_id ? warehouseOptions.value.find((w) => w.id === row.warehouse_id) || null : null)

  const cached = grnDetailsCache.get(row.id)

  // 1. Immediately prefill form with everything already available on the row
  // This makes doc number, date, supplier, warehouse, discount, and totals appear instantly
  form.value = {
    ...defaultForm,
    id: row.id,
    doc_number: row.doc_number,
    doc_date: row.doc_date || date.formatDate(Date.now(), 'YYYY-MM-DD'),
    status: row.status || 'draft',
    supplier: supplierObj,
    supplier_id: row.supplier_id || '',
    warehouse: warehouseObj,
    warehouse_id: row.warehouse_id || '',
    discount_type: row.discount_type || 'percentage',
    discount_value: row.discount_value || 0,
    tax_pct: row.tax_pct || 0,
    tax_amount: row.tax_amount || 0,
    total_amount: row.total_amount || 0,
    remarks: row.remarks || '',
    lines: cached ? cached.lines : [],
  }

  dialogVisible.value = true

  // 2. If already in memory cache, avoid redundant network queries & loading spinner
  if (cached) {
    detailLoading.value = false
    return
  }

  detailLoading.value = true

  try {
    const full = await getGRNDetails(row.id)
    activeApproval.value = getActiveApprovedAmendment('GRN', full.id, full.remarks)
    pendingApproval.value = getPendingAmendment('GRN', full.id, full.remarks)

    // NOTE: getGRNDetails returns goods_receipt_lines
    const rawLines = full.goods_receipt_lines || []
    const lines = rawLines.map((l, idx) => {
      let discType = l.discount_type || 'percentage'
      let discVal = Number(l.discount_value) || 0
      let discAmt = Number(l.discount_amount) || 0
      let userNotes = l.notes || ''

      // Parse JSON discount metadata from notes if packed
      if (l.notes && typeof l.notes === 'string' && l.notes.startsWith('{"__discount":true')) {
        try {
          const parsed = JSON.parse(l.notes)
          discType = parsed.type || 'percentage'
          discVal = Number(parsed.value) || 0
          discAmt = Number(parsed.amount) || 0
          userNotes = parsed.user_notes || ''
        } catch {
          // fallback
        }
      }

      const qty = Number(l.quantity) || 0
      const cost = Number(l.unit_cost || l.unit_price) || 0
      const gross = qty * cost
      if (discVal > 0 && discAmt === 0) {
        discAmt = discType === 'percentage' ? (gross * Math.min(100, discVal)) / 100 : Math.min(gross, discVal)
      }
      const lineTotal = l.line_total != null ? (discAmt > 0 && l.line_total === gross ? gross - discAmt : l.line_total) : gross - discAmt

      return {
        id: l.id || `line-${l.line_number || idx + 1}`,
        line_number: l.line_number || idx + 1,
        item_id: l.item_id,
        item_name: l.items?.name || l.item_name || '',
        uom_id: l.uom_id,
        uom_name: l.uom?.name || l.uom?.code || '',
        quantity: qty,
        unit_cost: cost,
        unit_price: cost,
        discount_type: discType,
        discount_value: discVal,
        discount_amount: discAmt,
        line_total: lineTotal,
        batch_no: l.batch_no || '',
        expiry_date: l.expiry_date || '',
        notes: userNotes,
      }
    })

    const populated = {
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

    form.value = populated
    grnDetailsCache.set(row.id, { ...populated, lines })
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
    discount_type: 'percentage',
    discount_value: 0,
    discount_amount: 0,
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
  
  if (!line.discount_type) line.discount_type = 'percentage'
  if (line.discount_value === undefined) line.discount_value = 0

  const qty = Number(line.quantity) || 0
  const gross = qty * line.unit_cost
  let discAmt = 0
  if (line.discount_type === 'percentage') {
    discAmt = (gross * Math.min(100, Math.max(0, Number(line.discount_value) || 0))) / 100
  } else {
    discAmt = Math.min(gross, Math.max(0, Number(line.discount_value) || 0))
  }
  line.discount_amount = Math.round(discAmt * 100) / 100
  line.line_total = Math.max(0, gross - line.discount_amount)
}

// Reload supplier price suggestions whenever the GRN's supplier changes
// (new GRN creation flow — supplier is chosen via DocHeader).
watch(
  () => form.value.supplier,
  (supplier) => {
    // Only fetch supplier prices when creating a new GRN or editing a DRAFT GRN.
    // Posted / view-only GRNs are read-only and do not need supplier pricing lookups.
    if (form.value.status !== 'draft') {
      supplierPriceMap.value = {}
      return
    }
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
    const supplierId = form.value.supplier?.id || form.value.supplier_id
    const warehouseId = form.value.warehouse?.id || form.value.warehouse_id

    if (!form.value.id) {
      // New GRN — always supplier-direct, never linked to a PO.
      if (!form.value.doc_number?.trim()) {
        $q.notify({ type: 'warning', message: 'GRN / Bill Number is required' })
        return
      }
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
        quantity: Math.max(0, Number(l.quantity) || 0),
        unit_cost: Math.max(0, Number(l.unit_cost || l.unit_price) || 0),
        discount_type: l.discount_type || 'percentage',
        discount_value: Math.max(0, Number(l.discount_value) || 0),
        discount_amount: Math.max(0, Number(l.discount_amount) || 0),
        batch_no: l.batch_no || null,
        expiry_date: l.expiry_date || null,
        notes: l.notes || null,
      }))

      grn = await createGRN(
        {
          doc_number: form.value.doc_number.trim(),
          supplier_id: supplierId,
          warehouse_id: warehouseId,
          doc_date: form.value.doc_date,
          remarks: form.value.remarks,
          discount_type: form.value.discount_type,
          discount_value: form.value.discount_value,
          discount_amount: totalDiscountAmount.value,
          subtotal: grossSubtotal.value,
          tax_pct: form.value.tax_pct,
          tax_amount: taxAmount.value,
          total_amount: totalAmount.value,
        },
        lines,
      )

      if (grn?.id) {
        const res = await postGRN(grn.id)
        if (!res.success) {
          try { await deleteGRN(grn.id) } catch { /* ignore */ }
          throw new Error(res.error || 'Failed to post GRN')
        }
        $q.notify({ type: 'positive', message: `GRN ${res.doc_number} Posted Successfully` })
      }
    } else {
      // Existing draft GRN — update header and lines
      if (!form.value.doc_number?.trim()) {
        $q.notify({ type: 'warning', message: 'GRN / Bill Number cannot be empty' })
        return
      }
      const lines = form.value.lines.map((l, idx) => ({
        line_number: idx + 1,
        item_id: l.item_id,
        uom_id: l.uom_id,
        quantity: Math.max(0, Number(l.quantity) || 0),
        unit_cost: Math.max(0, Number(l.unit_cost || l.unit_price) || 0),
        discount_type: l.discount_type || 'percentage',
        discount_value: Math.max(0, Number(l.discount_value) || 0),
        discount_amount: Math.max(0, Number(l.discount_amount) || 0),
        batch_no: l.batch_no || null,
        expiry_date: l.expiry_date || null,
        notes: l.notes || null,
      }))
      grn = await updateGRN(
        form.value.id,
        { 
          doc_number: form.value.doc_number.trim(),
          doc_date: form.value.doc_date, 
          warehouse_id: warehouseId, 
          remarks: form.value.remarks,
          discount_type: form.value.discount_type,
          discount_value: form.value.discount_value,
          discount_amount: totalDiscountAmount.value,
          subtotal: grossSubtotal.value,
          tax_pct: form.value.tax_pct,
          tax_amount: taxAmount.value,
          total_amount: totalAmount.value,
        },
        lines,
      )

      if (activeApproval.value) {
        // One-time edit on an approved amendment:
        // Consume authorization and lock document back to posted in Supabase
        await consumeDocumentAmendment('GRN', form.value.id, activeApproval.value.id, {
          consumed_by_id: authStore.user?.id,
          consumed_by_name: authStore.userDisplayName || 'Staff',
        })
        activeApproval.value = null
        $q.notify({
          type: 'positive',
          icon: 'verified',
          message: 'GRN corrections saved! Document is now securely locked.',
        })
      } else if (grn?.id && form.value.status === 'draft') {
        const res = await postGRN(grn.id)
        if (!res.success) throw new Error(res.error || 'Failed to post GRN')
        $q.notify({ type: 'positive', message: `GRN ${res.doc_number} Posted Successfully` })
      } else {
        $q.notify({ type: 'positive', message: 'GRN updated successfully' })
      }
    }

    dialogVisible.value = false
    grnDetailsCache.clear()
    fetchGRNs()
  } catch (e) {
    console.error('Failed to save GRN:', e)
    const errText = e?.message || ''
    if (errText.includes('goods_receipts_company_id_doc_number_key') || errText.toLowerCase().includes('duplicate key')) {
      $q.notify({
        type: 'negative',
        message: `GRN / Bill Number "${form.value.doc_number}" is already used. Please enter a unique bill number.`,
      })
    } else {
      $q.notify({ type: 'negative', message: 'Failed to save GRN', caption: errText })
    }
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
    grnDetailsCache.clear()
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
      pendingApproval.value = res.data
      grnDetailsCache.clear()
      $q.notify({
        type: 'positive',
        icon: 'verified',
        message: 'Amendment request submitted to Admin Approvals Center!',
      })
      fetchGRNs()
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to submit request: ' + err.message })
    }
  })
}
</script>
