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
          <!-- Selection Mode (Only for New) -->
          <div
            v-if="!isEditing && !form.po_id && !form.lines.length"
            class="row q-col-gutter-md q-mb-md q-pa-sm rounded-borders"
            style="background: var(--erp-bg-hover); border: 1px solid var(--erp-border)"
          >
            <div class="col-12 text-subtitle2 text-weight-bold">Create From:</div>
            <div class="col-12 row q-gutter-md">
              <q-radio v-model="createMode" val="po" label="From Purchase Order" />
              <q-radio v-model="createMode" val="direct" label="Direct Receipt" />
            </div>

            <div v-if="createMode === 'po'" class="col-12 row q-col-gutter-md items-center">
              <div class="col-12 col-md-5">
                <q-select
                  v-model="selectedSupplier"
                  :options="supplierOptions"
                  option-label="name"
                  label="Select Supplier"
                  outlined
                  dense
                  @update:model-value="loadPOs"
                />
              </div>
              <div class="col-12 col-md-5">
                <q-select
                  v-model="selectedPO"
                  :options="poOptions"
                  :option-label="(opt) => opt.doc_number"
                  label="Select PO"
                  outlined
                  dense
                  :disable="!selectedSupplier"
                />
              </div>
              <div class="col-12 col-md-2">
                <q-btn
                  label="Load"
                  color="primary"
                  unelevated
                  :disable="!selectedPO"
                  @click="loadFromPO"
                />
              </div>
            </div>
          </div>

          <q-separator v-if="!isEditing && !form.po_id && !form.lines.length" class="q-my-md" />

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
            title="Items Received"
            :allow-add="createMode === 'direct' || isEditing"
            :allow-edit-item="createMode === 'direct'"
            @add-line="addLine"
            @remove-line="removeLine"
            @item-change="onItemChange"
          />

          <!-- Totals -->
          <div class="row justify-end q-mt-md">
            <div class="col-12 col-md-4">
              <div class="erp-card q-pa-md">
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
              @click="saveGRN('posted')"
            />
          </div>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
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
  listPO,
  listInventoryPOs,
  getAnyPODetails,
} from 'src/services/procurementService'
import DocHeader from 'components/procurement/DocHeader.vue'
import DocLinesEditor from 'components/procurement/DocLinesEditor.vue'
import BaseDataGrid from 'components/common/BaseDataGrid.vue'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'

const $q = useQuasar()
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
const poOptions = ref([])
const warehouseOptions = ref([])
const itemOptions = ref([])

const createMode = ref('po')
const selectedSupplier = ref(null)
const selectedPO = ref(null)

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
  po: null,
  po_id: '',
  total_amount: 0,
  remarks: '',
}
const form = ref({ ...defaultForm })

const totalAmount = computed(() =>
  (form.value.lines || []).reduce(
    (acc, l) => acc + (l.line_total || l.quantity * (l.unit_cost || l.unit_price || 0)),
    0,
  ),
)

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
  await Promise.all([fetchGRNs(), fetchSuppliers(), fetchWarehouses(), fetchItems()])
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
  itemOptions.value = await listItems()
}

// ── PO Loading ─────────────────────────────────────────────────────────
async function loadPOs(supplier) {
  selectedPO.value = null
  poOptions.value = []
  if (!supplier) return

  const [procPOs, invPOs] = await Promise.all([
    listPO({ supplier_id: supplier.id }),
    listInventoryPOs({ supplier_id: supplier.id }),
  ])

  // Merge uniquely by doc_number
  const procNumbers = new Set(procPOs.map((p) => p.doc_number))
  const uniqueInvPOs = invPOs.filter((p) => !procNumbers.has(p.doc_number))
  const allPOs = [...procPOs, ...uniqueInvPOs]

  // Allow approved, open, and partial POs (partial = already received some qty)
  poOptions.value = allPOs.filter((p) =>
    ['approved', 'open', 'partial'].includes(p.status),
  )
}

async function loadFromPO() {
  if (!selectedPO.value) return
  loading.value = true
  try {
    const po = await getAnyPODetails(selectedPO.value.id, selectedPO.value._source || 'procurement')
    if (!po) throw new Error('Could not fetch PO details')

    form.value.supplier = supplierOptions.value.find((s) => s.id === po.supplier_id) || null
    form.value.warehouse = warehouseOptions.value.find((w) => w.id === po.warehouse_id) || null
    form.value.po = po
    form.value.po_id = po.id

    // For partial POs: only load lines that still have open qty
    const lines = (po.lines || [])
      .filter((l) => (l.open_qty ?? l.quantity) > 0)
      .map((l, idx) => ({
        line_number: idx + 1,
        item_id: l.item_id,
        item_name: l.items?.name || l.item_name || '',
        uom_id: l.uom_id,
        uom_name: l.uom?.name || l.uom?.code || l.uom_name || '',
        quantity: l.open_qty ?? l.quantity,
        unit_cost: l.unit_price || 0,
        line_total: (l.open_qty ?? l.quantity) * (l.unit_price || 0),
        po_line_id: l.id,
      }))

    if (lines.length === 0) {
      $q.notify({ type: 'warning', message: 'This PO has no remaining open quantities to receive.' })
      return
    }

    form.value.lines = lines
    form.value.is_inventory_po = selectedPO.value._source === 'inventory'
    selectedSupplier.value = null
    selectedPO.value = null
    $q.notify({ type: 'positive', message: `Loaded from PO: ${po.doc_number}` })
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Load Failed', caption: e.message })
  } finally {
    loading.value = false
  }
}

function formatCurrency(val) {
  return `LKR\u00A0${(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function createNewGRN() {
  isEditing.value = false
  form.value = { ...defaultForm, lines: [] }
  createMode.value = 'po'
  selectedSupplier.value = null
  selectedPO.value = null
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
      po_line_id: l.po_line_id || null,
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
  line.uom_id = item.uom_id || item.purchase_uom_id || ''
  line.uom_name = item.uom_name || 'UNIT'
}

// ── Save / Post ─────────────────────────────────────────────────────────
async function saveGRN(targetStatus) {
  saving.value = true
  try {
    let grn
    const supplierId = form.value.supplier?.id || form.value.supplier_id
    const warehouseId = form.value.warehouse?.id || form.value.warehouse_id
    const isInvSource = !!form.value.is_inventory_po

    if (!form.value.id) {
      // New GRN
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
        po_line_id: !isInvSource ? (l.po_line_id || null) : null,
        inventory_po_line_id: isInvSource ? (l.po_line_id || null) : null,
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
          po_id: !isInvSource ? (form.value.po_id || null) : null,
          inventory_po_id: isInvSource ? (form.value.po_id || null) : null,
          remarks: form.value.remarks,
        },
        lines,
      )
    } else {
      // Existing draft GRN — update header only (lines are read-only in view mode for now)
      const lines = form.value.lines.map((l, idx) => ({
        line_number: idx + 1,
        po_line_id: l.po_line_id || null,
        inventory_po_line_id: l.inventory_po_line_id || null,
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
        { doc_date: form.value.doc_date, warehouse_id: warehouseId, remarks: form.value.remarks },
        lines,
      )
    }

    if (targetStatus === 'posted' && grn?.id) {
      const res = await postGRN(grn.id)
      if (!res.success) throw new Error(res.error)
      $q.notify({ type: 'positive', message: `GRN ${res.doc_number} Posted Successfully` })
    }

    dialogVisible.value = false
    fetchGRNs()
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed', caption: e.message })
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
</script>
