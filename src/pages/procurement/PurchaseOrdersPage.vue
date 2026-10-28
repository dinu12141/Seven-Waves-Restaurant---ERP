<template>
  <q-page class="q-pa-md">
    <ErpPageHeader
      title="Purchase Orders"
      subtitle="Manage stock procurement from suppliers"
      icon="shopping_cart"
      :breadcrumbs="[{ label: 'Procurement' }, { label: 'Purchase Orders' }]"
    >
      <template #actions>
        <div class="row q-gutter-sm">
          <q-btn
            unelevated
            no-caps
            icon="auto_awesome"
            label="Auto-Reorder Low Stock"
            color="amber-9"
            text-color="dark"
            class="text-weight-bold"
            @click="openAutoReorderDialog"
          >
            <q-tooltip>Scan stock levels and auto-generate draft PO for low-stock items</q-tooltip>
          </q-btn>
          <q-btn unelevated no-caps icon="add" label="New PO" color="primary" @click="createNewPO" />
        </div>
      </template>
    </ErpPageHeader>

    <!-- Status filter tabs (ERP standard) -->
    <div class="erp-tab-bar q-mb-md">
      <button
        v-for="t in tabOptions"
        :key="t.value"
        class="erp-tab"
        :class="{ 'erp-tab--active': tab === t.value }"
        @click="tab = t.value"
      >
        {{ t.label }}
        <span class="erp-tab__count">{{ tabCount(t.value) }}</span>
      </button>
    </div>

    <!-- ERP DataGrid -->
    <BaseDataGrid
      title="Purchase Orders"
      :subtitle="`${filteredPOs.length} records`"
      :columns="columns"
      :rows="filteredPOs"
      :loading="loading"
      :actions="gridActions"
      :filters="gridFilters"
      storage-key="purchase-orders"
      search-placeholder="Search by PO#, supplier..."
      no-data-label="No purchase orders found"
      @edit="editPO"
      @view="editPO"
      @close="confirmClosePO"
    />

    <!-- PO Dialog (Professionalized & Balanced) -->
    <q-dialog v-model="dialogVisible" persistent>
      <q-card
        style="width: 900px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column"
        class="erp-dialog-card erp-border-radius shadow-5"
      >
        <!-- Detail Loading Overlay -->
        <q-inner-loading :showing="detailLoading" dark>
          <q-spinner-tail color="primary" size="40px" />
          <div class="q-mt-sm text-subtitle2">Fetching PO Details...</div>
        </q-inner-loading>
        <q-card-section class="row items-center justify-between q-pb-none">
          <div class="text-h6">
            {{ isEditing ? 'Edit Purchase Order' : 'New Purchase Order' }}
          </div>
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section class="col scroll q-pa-md">
          <DocHeader
            title="Purchase Order"
            icon="shopping_cart"
            :doc-number="form.doc_number"
            :status="form.status"
            v-model:docDate="form.doc_date"
            v-model:expectedDate="form.expected_date"
            v-model:supplier="form._supplier"
            :supplier-options="supplierOptions"
            :read-only="form.status !== 'draft'"
            show-expected-date
          />

          <q-separator class="q-my-md" />

          <DocLinesEditor
            :lines="form.lines"
            mode="PO"
            :read-only="form.status !== 'draft'"
            :item-options="itemOptions"
            :uom-options="uomOptions"
            title="Items"
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
            <div class="col-12 col-md-4">
              <div class="erp-card q-pa-md">
                <div class="row justify-between">
                  <span style="font-size: 14px; color: var(--erp-text-secondary)">Total</span>
                  <span style="font-size: 18px; font-weight: 700; color: var(--erp-text-primary)">
                    {{ formatCurrency(totalAmount) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </q-card-section>

        <PostingBar
          :status="form.status"
          @save="savePO('draft')"
          @post="savePO('open')"
          @cancel="cancelPO"
          @print="printPO"
        />
      </q-card>
    </q-dialog>

    <!-- Auto-Reorder Low Stock Dialog (ERPNext standard) -->
    <q-dialog v-model="autoReorderVisible" persistent>
      <q-card style="width: 780px; max-width: 95vw" class="erp-dialog-card erp-border-radius">
        <q-card-section class="row items-center justify-between">
          <div class="row items-center">
            <q-avatar icon="auto_awesome" color="amber-9" text-color="dark" size="36px" class="q-mr-sm" />
            <div>
              <div class="text-h6 text-weight-bold">Auto-Reorder Low Stock</div>
              <div class="text-caption text-grey">Generate draft purchase order for items below reorder level</div>
            </div>
          </div>
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-separator />
        <q-card-section class="q-pa-md">
          <div v-if="scanningLowStock" class="text-center q-pa-lg">
            <q-spinner-dots color="primary" size="40px" />
            <div class="text-caption text-grey q-mt-sm">Scanning stock levels across warehouses...</div>
          </div>
          <div v-else-if="lowStockItems.length === 0" class="text-center q-pa-lg text-grey">
            <q-icon name="check_circle" size="48px" color="positive" />
            <div class="text-subtitle1 text-weight-medium q-mt-sm">All Stock Levels Optimal</div>
            <div class="text-caption">No items are currently below their configured reorder thresholds.</div>
          </div>
          <div v-else>
            <div class="row q-col-gutter-sm items-center q-mb-md">
              <div class="col-12 col-md-6">
                <q-select
                  outlined
                  dense
                  v-model="reorderSupplier"
                  :options="supplierOptions"
                  option-label="name"
                  label="Target Supplier *"
                  emit-value
                  map-options
                />
              </div>
              <div class="col-12 col-md-6 text-right">
                <q-btn flat dense no-caps color="primary" label="Select All" @click="selectAllLowStock(true)" class="q-mr-sm" />
                <q-btn flat dense no-caps color="grey-6" label="Clear All" @click="selectAllLowStock(false)" />
              </div>
            </div>

            <q-table
              :rows="lowStockItems"
              :columns="lowStockCols"
              row-key="id"
              flat
              bordered
              dense
              selection="multiple"
              v-model:selected="selectedLowStock"
              :pagination="{ rowsPerPage: 10 }"
            >
              <template #body-cell-current_stock="props">
                <q-td :props="props" align="right">
                  <q-badge color="negative">{{ props.value }} {{ props.row.uom_code || '' }}</q-badge>
                </q-td>
              </template>
              <template #body-cell-reorder_level="props">
                <q-td :props="props" align="right">
                  <span class="text-weight-medium">{{ props.value }} {{ props.row.uom_code || '' }}</span>
                </q-td>
              </template>
              <template #body-cell-suggested_qty="props">
                <q-td :props="props" align="right">
                  <q-input
                    dense
                    outlined
                    type="number"
                    v-model.number="props.row.suggested_qty"
                    min="1"
                    style="width: 90px; display: inline-block"
                  />
                </q-td>
              </template>
            </q-table>
          </div>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            unelevated
            color="amber-9"
            text-color="dark"
            icon="receipt_long"
            label="Create Draft PO"
            :disable="selectedLowStock.length === 0"
            @click="generatePOFromLowStock"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar, date } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { listPO, createPO, listSuppliers, listItems, listUoms, approvePO, cancelPO as cancelPOService, listInventoryPOs, getAnyPODetails, closePO, listSupplierItems } from 'src/services/procurementService'
import DocHeader from 'components/procurement/DocHeader.vue'
import DocLinesEditor from 'components/procurement/DocLinesEditor.vue'
import PostingBar from 'components/procurement/PostingBar.vue'
import BaseDataGrid from 'components/common/BaseDataGrid.vue'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'
import { usePermission } from 'src/core/rbac/usePermission'

const $q = useQuasar()
const { can } = usePermission()
// GRN no longer auto-closes POs (supplier-direct GRN rework, designnew.md
// Section 5) — closing a PO is now a manual action, gated the same as other
// procurement-admin actions.
const canClosePO = computed(() => can('procurement.suppliers.edit'))
const route = useRoute()
const router = useRouter()
const tab = ref('all')
const loading = ref(false)

// ── Auto-Reorder Low Stock (ERPNext Standard) ────────────────
const autoReorderVisible = ref(false)
const scanningLowStock = ref(false)
const lowStockItems = ref([])
const selectedLowStock = ref([])
const reorderSupplier = ref(null)

const lowStockCols = [
  { name: 'name', label: 'Item Name', field: 'name', align: 'left', sortable: true },
  { name: 'current_stock', label: 'Current Stock', field: 'current_stock', align: 'right', sortable: true },
  { name: 'reorder_level', label: 'Reorder Level', field: 'reorder_level', align: 'right', sortable: true },
  { name: 'suggested_qty', label: 'Order Qty', field: 'suggested_qty', align: 'right' },
]
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)
const detailLoading = ref(false)

const purchaseOrders = ref([])
const supplierOptions = ref([])
const allItems = ref([])
const supplierItemsList = ref([])

const itemOptions = computed(() => {
  if (!supplierItemsList.value.length) return allItems.value

  const supplierItemIds = new Set(supplierItemsList.value.map(si => si.item_id))
  
  const supplierItems = []
  const otherItems = []

  for (const item of allItems.value) {
    if (supplierItemIds.has(item.id)) {
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

const uomOptions = ref([])

// Form
const defaultForm = {
  id: undefined,
  doc_number: '',
  doc_date: date.formatDate(new Date(), 'YYYY-MM-DD'),
  expected_date: date.formatDate(date.addToDate(new Date(), { days: 7 }), 'YYYY-MM-DD'),
  supplier_id: undefined,
  _supplier: null,
  warehouse_id: undefined,
  _warehouse: null,
  lines: [],
  remarks: '',
  status: 'draft',
  total_amount: 0,
  currency: 'LKR',
}
const form = ref({ ...defaultForm })

const columns = [
  {
    name: 'doc_number',
    label: 'PO #',
    field: 'doc_number',
    type: 'text',
    classes: 'text-no-wrap text-weight-medium',
    sortable: true,
    minWidth: 200,
  },
  {
    name: 'doc_date',
    label: 'Date',
    field: 'doc_date',
    type: 'date',
    sortable: true,
  },
  {
    name: 'expected_date',
    label: 'Exp. Date',
    field: 'expected_date',
    type: 'date',
    sortable: true,
    hideable: true,
  },
  {
    name: 'supplier',
    label: 'Supplier',
    field: (row) => row.suppliers?.name || row.supplier?.name || '—',
    type: 'text',
    sortable: true,
    minWidth: 160,
  },
  {
    name: 'amount',
    label: 'Amount',
    field: 'total_amount',
    type: 'currency',
    sortable: true,
    align: 'right',
    minWidth: 120,
  },
  { name: 'status', label: 'Status', field: 'status', type: 'status', align: 'center', width: 110 },
]

// Grid actions
const gridActions = [
  { event: 'view', icon: 'visibility', label: 'View PO', color: 'primary' },
  {
    event: 'edit',
    icon: 'edit',
    label: 'Edit PO',
    color: 'primary',
    show: (row) => row.status === 'draft',
  },
  {
    event: 'close',
    icon: 'task_alt',
    label: 'Close PO',
    color: 'positive',
    show: (row) => canClosePO.value && ['open', 'approved', 'partial'].includes(row.status),
  },
]

// Filter drawer config
const gridFilters = computed(() => [
  {
    field: 'doc_date',
    label: 'PO Date',
    type: 'date-range',
  },
  {
    field: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { label: 'All', value: '' },
      { label: 'Draft', value: 'draft' },
      { label: 'Open', value: 'open' },
      { label: 'Closed', value: 'closed' },
      { label: 'Cancelled', value: 'cancelled' },
    ],
  },
  {
    field: 'supplier_id',
    label: 'Supplier',
    type: 'select',
    options: [
      { label: 'All', value: '' },
      ...supplierOptions.value.map((s) => ({ label: s.name, value: s.id })),
    ],
  },
  {
    field: 'supplier_tax_status',
    label: 'Tax Status',
    type: 'select',
    options: [
      { label: 'All', value: '' },
      { label: 'Tax Registered (VAT)', value: 'TAX' },
      { label: 'Non-Tax', value: 'NON_TAX' },
    ],
  },
])

// Tab config
const tabOptions = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
]

function tabCount(tabVal) {
  if (tabVal === 'all') return purchaseOrders.value.length
  return purchaseOrders.value.filter((po) => po.status === tabVal).length
}

onMounted(async () => {
  loading.value = true
  await Promise.all([fetchPOs(), fetchSuppliers(), fetchItems(), fetchUoms()])
  loading.value = false

  // Handle ?action=new (redirect from inventory module)
  if (route.query.action === 'new') {
    createNewPO()
    router.replace({ path: '/procurement/purchase-orders' })
  }

})

async function fetchPOs() {
  try {
    const [procPOs, invPOs] = await Promise.all([listPO(), listInventoryPOs()])
    // Merge: avoid duplicates by doc_number
    const procNumbers = new Set(procPOs.map((p) => p.doc_number))
    const uniqueInvPOs = invPOs.filter((p) => !procNumbers.has(p.doc_number))
    const merged = [...procPOs, ...uniqueInvPOs].map(po => ({
      ...po,
      supplier_tax_status: po.suppliers?.tax_id ? 'TAX' : 'NON_TAX'
    }))
    // Manual sort by newest first (doc_date then created_at)
    purchaseOrders.value = merged.sort((a, b) => {
      const d1 = new Date(a.doc_date).getTime()
      const d2 = new Date(b.doc_date).getTime()
      if (d1 !== d2) return d2 - d1
      const c1 = new Date(a.created_at || 0).getTime()
      const c2 = new Date(b.created_at || 0).getTime()
      return c2 - c1
    })
  } catch (e) {
    console.error('Failed to fetch POs:', e)
    purchaseOrders.value = []
  }
}

async function fetchSuppliers() {
  supplierOptions.value = await listSuppliers(true)
}

async function fetchItems() {
  allItems.value = await listItems()
}

watch(() => form.value._supplier, async (newSupplier) => {
  if (newSupplier && newSupplier.id) {
    try {
      supplierItemsList.value = await listSupplierItems(newSupplier.id)
    } catch (e) {
      console.error(e)
      supplierItemsList.value = []
    }
  } else {
    supplierItemsList.value = []
  }
})

async function fetchUoms() {
  uomOptions.value = await listUoms()
}

const filteredPOs = computed(() => {
  if (tab.value === 'all') return purchaseOrders.value
  return purchaseOrders.value.filter((po) => po.status === tab.value)
})

const totalAmount = computed(() => {
  return (form.value.lines || []).reduce((acc, line) => acc + (line.line_total || 0), 0)
})

function formatCurrency(val) {
  return (val || 0).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })
}

function createNewPO() {
  isEditing.value = false
  form.value = JSON.parse(JSON.stringify(defaultForm)) // Deep copy
  form.value.lines = []
  dialogVisible.value = true
  addLine()
}

async function editPO(row) {
  isEditing.value = true
  // Reset form to avoid showing previous PO details while loading
  form.value = { ...defaultForm, id: row.id, doc_number: row.doc_number, status: row.status }
  
  detailLoading.value = true
  dialogVisible.value = true
  
  try {
    const fullPO = await getAnyPODetails(row.id, row._source || 'procurement')
    
    // Map supplier and other attributes correctly for components
    const mappedPO = {
      ...fullPO,
      _supplier: fullPO.suppliers || (fullPO.supplier_id ? { id: fullPO.supplier_id, name: fullPO.supplier_name } : null),
      _warehouse: fullPO.warehouse || (fullPO.warehouse_id ? { id: fullPO.warehouse_id, name: fullPO.warehouse_name } : null),
      expected_date: fullPO.delivery_date || fullPO.expected_date || fullPO.delivery_date,
      doc_date: fullPO.doc_date || fullPO.date
    }
    
    form.value = mappedPO
    
    // Ensure lines is always an array
    if (!Array.isArray(form.value.lines)) {
      form.value.lines = []
    }
  } catch (e) {
    console.error('Failed to fetch PO details:', e)
    $q.notify({ color: 'negative', message: 'Could not load PO details' })
    dialogVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

function confirmClosePO(row) {
  $q.dialog({
    title: 'Close Purchase Order?',
    message: `Mark ${row.doc_number} as closed? This is now a manual action — GRN receipts no longer auto-close POs.`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      await closePO(row.id)
      $q.notify({ type: 'positive', message: `PO ${row.doc_number} closed` })
      fetchPOs()
    } catch (e) {
      $q.notify({ type: 'negative', message: 'Failed to close PO', caption: e.message })
    }
  })
}

function addLine() {
  if (!form.value.lines) form.value.lines = []
  form.value.lines.push({
    line_number: (form.value.lines.length || 0) + 1,
    item_id: '',
    uom_id: '',
    quantity: 1,
    unit_price: 0,
    line_total: 0,
  })
}

function removeLine(index) {
  if (form.value.lines) {
    form.value.lines.splice(index, 1)
    // Renumber
    form.value.lines.forEach((l, idx) => (l.line_number = idx + 1))
  }
}

function onItemChange(line, item) {
  if (!item) return
  line.item_id = item.id
  line.item_name = item.name
  line.uom_id = item.purchase_uom_id || item.inventory_uom_id || item.default_uom_id || item.uom_id || ''
  line.uom_name = item.uom_name || item.uom?.name || item.uom?.code || 'PCS'
  line.unit_price = item.last_purchase_price || item.cost_price || item.unit_cost || 0
  recalcLine(line)
}

function onUomChange(line, uom) {
  if (!uom) return
  line.uom_id = uom.id
  line.uom_name = uom.name || uom.code || 'PCS'
}

function recalcLine(line) {
  line.line_total = (line.quantity || 0) * (line.unit_price || 0)
}

// Watch lines to recalc totals (deep watch might be expensive, so direct mutation in DocLines is handled via v-model, but computed need updates)
watch(
  () => form.value.lines,
  (lines) => {
    lines?.forEach(recalcLine)
  },
  { deep: true },
)

async function savePO(targetStatus) {
  const supplierId = form.value.supplier_id || form.value._supplier?.id
  if (!supplierId) {
    $q.notify({ type: 'warning', message: 'Supplier is required' })
    return
  }

  // Filter valid lines where item_id is selected
  const rawLines = form.value.lines || []
  const validLines = rawLines.filter((l) => l && l.item_id && typeof l.item_id === 'string' && l.item_id.trim() !== '')

  if (validLines.length === 0) {
    $q.notify({ type: 'warning', message: 'Please select at least one item line.' })
    return
  }

  if (saving.value) return // double-submit guard
  saving.value = true
  try {
    const headPayload = {
      supplier_id: supplierId,
      doc_date: form.value.doc_date || new Date().toISOString().slice(0, 10),
      expected_date: form.value.expected_date || undefined,
      warehouse_id: (form.value.warehouse_id && typeof form.value.warehouse_id === 'string' && form.value.warehouse_id.trim()) ? form.value.warehouse_id.trim() : undefined,
      currency: form.value.currency || 'LKR',
      remarks: form.value.remarks || undefined,
    }
    const lines = validLines.map((l, idx) => ({
      line_number: idx + 1,
      item_id: l.item_id.trim(),
      description: l.description || l.item_name || null,
      uom_id: (l.uom_id && typeof l.uom_id === 'string' && l.uom_id.trim()) ? l.uom_id.trim() : null,
      quantity: Number(l.quantity) || 1,
      unit_price: Number(l.unit_price) || 0,
      discount_pct: Number(l.discount_pct) || 0,
      tax_pct: Number(l.tax_pct) || 0,
      warehouse_id: (l.warehouse_id && typeof l.warehouse_id === 'string' && l.warehouse_id.trim()) ? l.warehouse_id.trim() : null,
      notes: (l.notes && typeof l.notes === 'string' && l.notes.trim()) ? l.notes.trim() : null,
    }))

    if (form.value.id) {
      $q.notify({ type: 'warning', message: 'PO edits coming soon – save a new PO' })
    } else {
      const po = await createPO(headPayload, lines)
      if (targetStatus === 'open' && po?.id) {
        try {
          const res = await approvePO(po.id)
          $q.notify(
            res.status === 'approved'
              ? { type: 'positive', message: 'PO Created & Approved' }
              : { type: 'info', message: 'PO Created — awaiting further approval', caption: res.message },
          )
        } catch (e) {
          // Saved as draft; approval is enforced server-side (e.g. maker-checker)
          $q.notify({ type: 'warning', message: 'PO Created as draft — approval required', caption: e.message })
        }
      } else {
        $q.notify({ type: 'positive', message: 'PO Created' })
      }
    }
    dialogVisible.value = false
    fetchPOs()
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed to save PO', caption: e.message })
  } finally {
    saving.value = false
  }
}

function cancelPO() {
  if (!form.value.id) {
    dialogVisible.value = false
    return
  }
  $q.dialog({
    title: `Cancel PO ${form.value.doc_number || ''}?`,
    message: 'Only draft or approved POs can be cancelled. Enter a reason:',
    prompt: { model: '', type: 'text', isValid: (v) => !!v && v.trim().length > 2 },
    cancel: true,
    persistent: true,
  }).onOk(async (reason) => {
    try {
      await cancelPOService(form.value.id, reason.trim())
      $q.notify({ type: 'positive', message: `PO ${form.value.doc_number || ''} cancelled` })
      dialogVisible.value = false
      fetchPOs()
    } catch (e) {
      $q.notify({ type: 'negative', message: 'Failed to cancel PO', caption: e.message })
    }
  })
}

function printPO() {
  $q.notify({ type: 'info', message: 'Print Logic invoked' })
}

// ── Auto-Reorder Methods (ERPNext Standard) ──────────────────
async function openAutoReorderDialog() {
  autoReorderVisible.value = true
  scanningLowStock.value = true
  selectedLowStock.value = []
  reorderSupplier.value = null

  try {
    const { data: stockItems, error } = await supabase
      .from('stock_items')
      .select('id, name, reorder_level, min_order_qty, standard_cost, uom_id, uoms(code)')
      .eq('is_active', true)
      .gt('reorder_level', 0)

    if (error) throw error

    const { data: soh } = await supabase
      .from('stock_on_hand')
      .select('item_id, quantity')

    const stockMap = new Map()
    if (soh) {
      for (const s of soh) {
        const prev = stockMap.get(s.item_id) || 0
        stockMap.set(s.item_id, prev + Number(s.quantity || 0))
      }
    }

    const low = []
    for (const item of (stockItems || [])) {
      const current = stockMap.get(item.id) || 0
      const reorderLvl = Number(item.reorder_level || 0)
      if (current <= reorderLvl) {
        const deficit = Math.max(reorderLvl * 2 - current, Number(item.min_order_qty || 10))
        low.push({
          id: item.id,
          name: item.name,
          current_stock: current,
          reorder_level: reorderLvl,
          suggested_qty: Math.ceil(deficit),
          unit_price: Number(item.standard_cost || 0),
          uom_id: item.uom_id,
          uom_code: item.uoms?.code || 'Units',
        })
      }
    }
    lowStockItems.value = low
    selectedLowStock.value = [...low]
  } catch (err) {
    console.error('Failed to scan low stock items:', err)
    $q.notify({ type: 'negative', message: 'Failed to scan low stock items' })
  } finally {
    scanningLowStock.value = false
  }
}

function selectAllLowStock(select) {
  selectedLowStock.value = select ? [...lowStockItems.value] : []
}

function generatePOFromLowStock() {
  if (!selectedLowStock.value.length) {
    $q.notify({ type: 'warning', message: 'Please select at least one item' })
    return
  }

  isEditing.value = false
  form.value = JSON.parse(JSON.stringify(defaultForm))
  if (reorderSupplier.value) {
    form.value.supplier_id = reorderSupplier.value
    form.value._supplier = supplierOptions.value.find(s => s.id === reorderSupplier.value) || null
  }

  form.value.lines = selectedLowStock.value.map((item, idx) => ({
    line_number: idx + 1,
    item_id: item.id,
    item_name: item.name,
    description: item.name,
    uom_id: item.uom_id || null,
    quantity: Number(item.suggested_qty) || 1,
    unit_price: Number(item.unit_price) || 0,
    discount_pct: 0,
    tax_pct: 0,
    line_total: (Number(item.suggested_qty) || 1) * (Number(item.unit_price) || 0),
  }))

  autoReorderVisible.value = false
  dialogVisible.value = true
  $q.notify({
    type: 'positive',
    icon: 'auto_awesome',
    message: `Draft PO pre-filled with ${selectedLowStock.value.length} low-stock item(s)`
  })
}
</script>
