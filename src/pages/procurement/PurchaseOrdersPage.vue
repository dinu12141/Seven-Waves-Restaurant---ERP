<template>
  <q-page class="q-pa-md">
    <ErpPageHeader
      title="Purchase Orders"
      subtitle="Manage stock procurement from suppliers"
      icon="shopping_cart"
      :breadcrumbs="[{ label: 'Procurement' }, { label: 'Purchase Orders' }]"
    >
      <template #actions>
        <q-btn unelevated no-caps icon="add" label="New PO" color="primary" @click="createNewPO" />
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
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar, date } from 'quasar'
import { listPO, createPO, listSuppliers, listItems, listUoms, approvePO, listInventoryPOs, getAnyPODetails } from 'src/services/procurementService'
import DocHeader from 'components/procurement/DocHeader.vue'
import DocLinesEditor from 'components/procurement/DocLinesEditor.vue'
import PostingBar from 'components/procurement/PostingBar.vue'
import BaseDataGrid from 'components/common/BaseDataGrid.vue'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const tab = ref('all')
const loading = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)
const detailLoading = ref(false)

const purchaseOrders = ref([])
const supplierOptions = ref([])
const itemOptions = ref([])
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
]

// Filter drawer config
const gridFilters = [
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
]

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
    const merged = [...procPOs, ...uniqueInvPOs]
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
  supplierOptions.value = await listSuppliers()
}

async function fetchItems() {
  itemOptions.value = await listItems()
}

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
        await approvePO(po.id)
        $q.notify({ type: 'positive', message: 'PO Created & Approved' })
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
  $q.notify({ type: 'info', message: 'Cancellation Logic invoked' })
}

function printPO() {
  $q.notify({ type: 'info', message: 'Print Logic invoked' })
}
</script>
