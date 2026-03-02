<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div>
        <div
          class="text-h2 text-white"
          style="font-size: var(--erp-font-size-h2); font-weight: 600"
        >
          Purchase Orders
        </div>
        <div class="text-caption" style="color: var(--erp-text-secondary)">
          Manage stock procurement
        </div>
      </div>
      <q-btn unelevated icon="add" label="New PO" class="erp-btn-primary" @click="createNewPO" />
    </div>

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

    <!-- PO Dialog (unchanged — business logic preserved) -->
    <q-dialog v-model="dialogVisible" full-width persistent>
      <q-card
        style="height: 90vh; display: flex; flex-direction: column"
        class="bg-dark text-white"
      >
        <q-card-section class="row items-center justify-between q-pb-none">
          <div class="text-h6">
            {{ isEditing ? 'Edit Purchase Order' : 'New Purchase Order' }}
          </div>
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator color="grey-9" />

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

          <q-separator class="q-my-md" color="grey-9" />

          <DocLinesEditor
            :lines="form.lines"
            mode="PO"
            :read-only="form.status !== 'draft'"
            :item-options="itemOptions"
            title="Items"
            allow-add
            allow-edit-item
            @add-line="addLine"
            @remove-line="removeLine"
            @item-change="onItemChange"
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
import { useQuasar, date } from 'quasar'
import {
  listPO,
  createPO,
  listSuppliers,
  listItems,
  approvePO,
} from 'src/services/procurementService'
import DocHeader from 'components/procurement/DocHeader.vue'
import DocLinesEditor from 'components/procurement/DocLinesEditor.vue'
import PostingBar from 'components/procurement/PostingBar.vue'
import BaseDataGrid from 'components/common/BaseDataGrid.vue'

const $q = useQuasar()
const tab = ref('all')
const loading = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)

const purchaseOrders = ref([])
const supplierOptions = ref([])
const itemOptions = ref([])

// Form
const defaultForm = {
  id: undefined,
  doc_number: 'NEW',
  supplier_id: undefined,
  _supplier: undefined, // transient UI object for q-select
  doc_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  expected_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  status: 'draft',
  lines: [],
  total_amount: 0,
  warehouse_id: undefined,
  currency: 'LKR',
  remarks: '',
}
const form = ref({ ...defaultForm })

const columns = [
  {
    name: 'doc_number',
    label: 'PO #',
    field: 'doc_number',
    type: 'text',
    sortable: true,
    minWidth: 100,
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
  await Promise.all([fetchPOs(), fetchSuppliers(), fetchItems()])
  loading.value = false
})

async function fetchPOs() {
  purchaseOrders.value = await listPO()
}

async function fetchSuppliers() {
  supplierOptions.value = await listSuppliers()
}

async function fetchItems() {
  itemOptions.value = await listItems()
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

function editPO(row) {
  isEditing.value = true
  form.value = JSON.parse(JSON.stringify(row)) // Deep copy
  dialogVisible.value = true
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
  line.uom_id = item.default_uom_id || ''
  line.uom_name = item.uom?.name || 'UNIT'
  line.unit_price = item.unit_cost || 0
  recalcLine(line)
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

  saving.value = true
  try {
    const headPayload = {
      supplier_id: supplierId,
      doc_date: form.value.doc_date || new Date().toISOString().slice(0, 10),
      expected_date: form.value.expected_date || undefined,
      warehouse_id: form.value.warehouse_id || undefined,
      currency: form.value.currency || 'LKR',
      remarks: form.value.remarks || undefined,
    }
    const lines = (form.value.lines || []).map((l, idx) => ({
      line_number: idx + 1,
      item_id: l.item_id,
      description: l.description,
      uom_id: l.uom_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct || 0,
      tax_pct: l.tax_pct || 0,
      warehouse_id: l.warehouse_id || null,
      notes: l.notes || null,
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
    $q.notify({ type: 'negative', message: 'Failed', caption: e.message })
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
