<template>
  <q-page class="q-pa-md">
    <ErpPageHeader
      title="Goods Issue Notes"
      subtitle="Manage internal stock issues — kitchen, wastage, transfers"
      icon="outbox"
      :breadcrumbs="[{ label: 'Procurement' }, { label: 'Goods Issues' }]"
    >
      <template #actions>
        <q-btn unelevated no-caps color="primary" icon="add" label="New GIN" @click="openCreate" />
      </template>
    </ErpPageHeader>

    <!-- GIN List -->
    <q-table
      flat
      bordered
      class="erp-table"
      :rows="filteredGins"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 20 }"
      binary-state-sort
    >
      <template #top-right>
        <q-input
          v-model="search"
          dense
          outlined
          clearable
          placeholder="Search GIN# or reference…"
          debounce="300"
          style="width: 260px"
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </template>

      <template #loading>
        <q-inner-loading showing color="primary" />
      </template>

      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="statusColor(props.row.status)"
            :label="props.row.status?.toUpperCase()"
          />
        </q-td>
      </template>

      <template #body-cell-total_cost="props">
        <q-td :props="props" class="text-right">
          {{ fmtCurrency(props.row.total_cost) }}
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props" auto-width>
          <q-btn
            flat dense round icon="visibility" color="primary" size="sm"
            @click="openView(props.row)"
          >
            <q-tooltip>View</q-tooltip>
          </q-btn>
          <q-btn
            v-if="props.row.status === 'draft'"
            flat dense round icon="delete" color="negative" size="sm"
            @click="confirmDelete(props.row)"
          >
            <q-tooltip>Delete</q-tooltip>
          </q-btn>
        </q-td>
      </template>

      <template #no-data>
        <div class="full-width text-center q-pa-xl text-grey-5">
          <q-icon name="outbox" size="56px" class="q-mb-sm" />
          <div class="text-subtitle1">No goods issue notes found</div>
          <q-btn unelevated no-caps color="primary" icon="add" label="Create First GIN" class="q-mt-md" @click="openCreate" />
        </div>
      </template>
    </q-table>

    <!-- Delete Confirmation -->
    <q-dialog v-model="deleteVisible" persistent>
      <q-card style="min-width: 360px" class="erp-dialog-card">
        <q-card-section class="row items-center">
          <q-avatar icon="warning" color="negative" text-color="white" size="42px" />
          <div class="q-ml-md">
            <div class="text-subtitle1 text-weight-bold">Delete GIN?</div>
            <div class="text-caption text-grey-6">{{ deleteTarget?.doc_number }}</div>
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <p class="text-body2">This will permanently delete the draft GIN and all its lines.</p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="deleteVisible = false" />
          <q-btn unelevated color="negative" label="Yes, Delete" :loading="deleting" @click="doDelete" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- GIN Dialog -->
    <q-dialog v-model="dialogVisible" persistent>
      <q-card
        style="width: 860px; max-width: 95vw; max-height: 88vh; display: flex; flex-direction: column"
        class="erp-dialog-card"
      >
        <q-inner-loading :showing="detailLoading">
          <q-spinner-tail color="primary" size="40px" />
        </q-inner-loading>

        <q-card-section class="row items-center justify-between q-pb-none">
          <div class="text-h6">{{ form.id ? 'Goods Issue Note' : 'New Goods Issue Note' }}</div>
          <div class="row items-center q-gutter-sm">
            <q-badge v-if="form.id" :color="statusColor(form.status)" :label="form.status?.toUpperCase()" />
            <q-btn icon="close" flat round dense v-close-popup />
          </div>
        </q-card-section>

        <q-separator />

        <q-card-section class="col scroll q-pa-md">
          <!-- Header Fields -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-4">
              <q-input
                v-model="form.doc_date"
                label="Issue Date *"
                type="date"
                outlined
                dense
                :readonly="form.status !== 'draft'"
                :rules="[v => !!v || 'Required']"
              />
            </div>
            <div class="col-12 col-md-4">
              <q-select
                v-model="form.warehouse"
                :options="warehouseOptions"
                option-label="name"
                option-value="id"
                label="From Warehouse *"
                outlined
                dense
                :readonly="form.status !== 'draft'"
                :rules="[v => !!v || 'Required']"
              />
            </div>
            <div class="col-12 col-md-4">
              <q-select
                v-model="form.issue_purpose"
                :options="issuePurposes"
                label="Issue Purpose *"
                outlined
                dense
                :readonly="form.status !== 'draft'"
                :rules="[v => !!v || 'Required']"
              />
            </div>
            <div class="col-12">
              <q-input
                v-model="form.remarks"
                label="Remarks"
                outlined
                dense
                :readonly="form.status !== 'draft'"
              />
            </div>
          </div>

          <!-- Lines Table -->
          <div class="text-subtitle2 text-weight-bold q-mb-sm">Items to Issue</div>

          <q-table
            flat
            bordered
            dense
            class="erp-table q-mb-md"
            :rows="form.lines"
            :columns="lineColumns"
            row-key="line_number"
            hide-pagination
            :pagination="{ rowsPerPage: 0 }"
          >
            <template #body-cell-item_id="props">
              <q-td :props="props">
                <q-select
                  v-if="form.status === 'draft'"
                  v-model="props.row.item_id"
                  :options="itemOptions"
                  option-label="name"
                  option-value="id"
                  dense
                  outlined
                  emit-value
                  map-options
                  input-debounce="0"
                  use-input
                  fill-input
                  hide-selected
                  style="min-width: 200px"
                  @filter="filterItems"
                  @update:model-value="(val) => onItemChange(props.row, val)"
                >
                  <template #no-option>
                    <q-item><q-item-section class="text-grey">No items found</q-item-section></q-item>
                  </template>
                </q-select>
                <span v-else>{{ props.row.item_name }}</span>
              </q-td>
            </template>

            <template #body-cell-quantity="props">
              <q-td :props="props">
                <q-input
                  v-if="form.status === 'draft'"
                  v-model.number="props.row.quantity"
                  type="number"
                  dense
                  outlined
                  min="0.001"
                  step="0.001"
                  style="width: 100px"
                  @update:model-value="recalcLine(props.row)"
                />
                <span v-else>{{ props.row.quantity }}</span>
              </q-td>
            </template>

            <template #body-cell-unit_cost="props">
              <q-td :props="props" class="text-right">
                <q-input
                  v-if="form.status === 'draft'"
                  v-model.number="props.row.unit_cost"
                  type="number"
                  dense
                  outlined
                  min="0"
                  step="0.01"
                  style="width: 110px"
                  @update:model-value="recalcLine(props.row)"
                />
                <span v-else>{{ fmtCurrency(props.row.unit_cost) }}</span>
              </q-td>
            </template>

            <template #body-cell-line_total="props">
              <q-td :props="props" class="text-right text-weight-medium">
                {{ fmtCurrency(props.row.line_total) }}
              </q-td>
            </template>

            <template #body-cell-remove="props">
              <q-td :props="props">
                <q-btn
                  v-if="form.status === 'draft'"
                  flat dense round icon="remove_circle_outline" color="negative" size="sm"
                  @click="removeLine(props.rowIndex)"
                />
              </q-td>
            </template>

            <template #no-data>
              <div class="text-center text-grey-5 q-pa-md">
                No items added yet — click "+ Add Line" below
              </div>
            </template>
          </q-table>

          <q-btn
            v-if="form.status === 'draft'"
            flat
            no-caps
            icon="add"
            label="Add Line"
            color="primary"
            size="sm"
            @click="addLine"
          />

          <!-- Total -->
          <div class="row justify-end q-mt-md">
            <div class="col-12 col-md-4">
              <div class="erp-card q-pa-md">
                <div class="row justify-between items-center">
                  <span style="font-size: 14px; color: var(--erp-text-secondary)">Total Cost</span>
                  <span style="font-size: 18px; font-weight: 700; color: var(--erp-text-primary)">
                    {{ fmtCurrency(totalCost) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </q-card-section>

        <q-separator />
        <q-card-actions class="q-pa-md row items-center justify-end q-gutter-sm">
          <q-btn flat label="Close" v-close-popup />
          <q-btn
            v-if="form.status === 'draft'"
            unelevated
            color="primary"
            icon="check"
            label="Post GIN"
            :loading="saving"
            @click="saveAndPost"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar, date } from 'quasar'
import {
  useDocumentList,
  useItemsList,
  useWarehouseList,
  createDocument,
  postDocument,
  deleteDocument,
  fetchDocumentById,
  fetchStockByWarehouse,
} from 'src/services/inventoryService'
import ErpPageHeader from 'components/common/ErpPageHeader.vue'

const $q = useQuasar()

// ── Service composables ──────────────────────────────────────────────────────
const { documents, loading, listDocuments } = useDocumentList()
const { items, listItems } = useItemsList()
const { warehouses, listWarehouses } = useWarehouseList()

// ── State ────────────────────────────────────────────────────────────────────
const search         = ref('')
const dialogVisible  = ref(false)
const detailLoading  = ref(false)
const saving         = ref(false)
const deleteVisible  = ref(false)
const deleteTarget   = ref(null)
const deleting       = ref(false)
const stockMap       = ref({})  // item_id → qty_on_hand for selected warehouse

const issuePurposes = [
  'Kitchen Use',
  'Bar Use',
  'Staff Meal',
  'Event / Catering',
  'Internal Transfer',
  'Wastage',
  'Damaged Goods',
  'Other',
]

const emptyForm = () => ({
  id: null,
  doc_number: 'NEW',
  doc_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  warehouse: null,
  issue_purpose: null,
  remarks: '',
  status: 'draft',
  lines: [],
})
const form = ref(emptyForm())

const totalCost = computed(() =>
  (form.value.lines || []).reduce((s, l) => s + (l.line_total || 0), 0)
)

// ── Options ──────────────────────────────────────────────────────────────────
const warehouseOptions = computed(() => warehouses.value)
const itemOptions      = ref([])

// ── Filtered GINs ────────────────────────────────────────────────────────────
const filteredGins = computed(() => {
  if (!search.value?.trim()) return documents.value
  const q = search.value.toLowerCase()
  return documents.value.filter(
    d =>
      d.doc_number?.toLowerCase().includes(q) ||
      d.reference_no?.toLowerCase().includes(q) ||
      d.remarks?.toLowerCase().includes(q)
  )
})

// ── Table Columns ─────────────────────────────────────────────────────────────
const columns = [
  { name: 'doc_number', label: 'GIN #',     field: 'doc_number',  align: 'left',   sortable: true, classes: 'text-weight-medium' },
  { name: 'doc_date',   label: 'Date',       field: 'doc_date',    align: 'left',   sortable: true },
  { name: 'warehouse_name', label: 'Warehouse', field: 'warehouse_name', align: 'left' },
  { name: 'remarks',    label: 'Purpose',    field: 'remarks',     align: 'left' },
  { name: 'total_qty',  label: 'Total Qty',  field: 'total_qty',   align: 'right',  sortable: true,
    format: v => Number(v || 0).toFixed(2) },
  { name: 'total_cost', label: 'Total Cost', field: 'total_cost',  align: 'right',  sortable: true },
  { name: 'status',     label: 'Status',     field: 'status',      align: 'center' },
  { name: 'actions',    label: '',           field: 'actions',     align: 'center' },
]

const lineColumns = [
  { name: 'item_id',   label: 'Item',       field: 'item_name',  align: 'left',  style: 'min-width: 220px' },
  { name: 'quantity',  label: 'Quantity',   field: 'quantity',   align: 'right', style: 'width: 120px' },
  { name: 'uom_code',  label: 'UOM',        field: 'uom_code',   align: 'center', style: 'width: 80px' },
  { name: 'unit_cost', label: 'Unit Cost',  field: 'unit_cost',  align: 'right', style: 'width: 130px' },
  { name: 'line_total', label: 'Line Total', field: 'line_total', align: 'right', style: 'width: 130px' },
  { name: 'remove',    label: '',           field: 'remove',     align: 'center', style: 'width: 48px' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusColor(s) {
  const map = { draft: 'grey', posted: 'positive', cancelled: 'negative' }
  return map[s] || 'grey'
}

function fmtCurrency(val) {
  return 'LKR ' + Number(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function filterItems(val, update) {
  const q = val?.toLowerCase() || ''
  update(() => {
    itemOptions.value = q
      ? items.value.filter(i =>
          i.name?.toLowerCase().includes(q) || i.code?.toLowerCase().includes(q)
        )
      : items.value
  })
}

// ── Lines ─────────────────────────────────────────────────────────────────────
function addLine() {
  form.value.lines.push({
    line_number: form.value.lines.length + 1,
    item_id: null,
    item_name: '',
    uom_id: null,
    uom_code: '',
    quantity: 1,
    unit_cost: 0,
    line_total: 0,
  })
}

function removeLine(idx) {
  form.value.lines.splice(idx, 1)
}

function onItemChange(line, itemId) {
  const item = items.value.find(i => i.id === itemId)
  if (!item) return
  line.item_name = item.name
  line.uom_id    = item.uom_id || item.inventory_uom_id || null
  line.uom_code  = item.uom_code || ''
  line.unit_cost = Number(item.avg_cost || 0)
  recalcLine(line)
}

function recalcLine(line) {
  line.line_total = Number(line.quantity || 0) * Number(line.unit_cost || 0)
}

// ── Load stock for validation ─────────────────────────────────────────────────
async function loadStock(warehouseId) {
  if (!warehouseId) { stockMap.value = {}; return }
  try {
    stockMap.value = await fetchStockByWarehouse(warehouseId)
  } catch {
    stockMap.value = {}
  }
}

// ── Open / Close ──────────────────────────────────────────────────────────────
function openCreate() {
  form.value = emptyForm()
  dialogVisible.value = true
}

async function openView(row) {
  form.value = emptyForm()
  form.value.id = row.id
  form.value.status = row.status
  form.value.doc_number = row.doc_number
  detailLoading.value = true
  dialogVisible.value = true

  try {
    const doc = await fetchDocumentById(row.id)
    const warehouseObj = warehouses.value.find(w => w.id === doc.header.warehouse_id) || null

    form.value = {
      id:            doc.header.id,
      doc_number:    doc.header.doc_number,
      doc_date:      doc.header.doc_date,
      warehouse:     warehouseObj,
      issue_purpose: doc.header.remarks?.startsWith('Purpose: ')
        ? doc.header.remarks.replace('Purpose: ', '').split(' | ')[0]
        : null,
      remarks:       doc.header.remarks || '',
      status:        doc.header.status,
      lines:         doc.lines.map((l, idx) => ({
        line_number: l.line_number || idx + 1,
        item_id:     l.item_id,
        item_name:   l.item_name,
        uom_id:      l.uom_id,
        uom_code:    l.uom_code,
        quantity:    l.quantity,
        unit_cost:   l.unit_cost || 0,
        line_total:  l.quantity * (l.unit_cost || 0),
      })),
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Could not load GIN details', caption: e.message })
    dialogVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

// ── Save & Post ───────────────────────────────────────────────────────────────
async function saveAndPost() {
  const warehouseId = form.value.warehouse?.id || form.value.warehouse_id
  if (!warehouseId) {
    $q.notify({ type: 'warning', message: 'Please select a warehouse.' }); return
  }
  if (!form.value.issue_purpose) {
    $q.notify({ type: 'warning', message: 'Please select an issue purpose.' }); return
  }
  if (!form.value.lines.length) {
    $q.notify({ type: 'warning', message: 'At least one item is required.' }); return
  }
  const invalidLines = form.value.lines.filter(l => !l.item_id || !l.quantity || l.quantity <= 0)
  if (invalidLines.length) {
    $q.notify({ type: 'warning', message: 'All lines must have an item and positive quantity.' }); return
  }

  // Stock check
  await loadStock(warehouseId)
  for (const line of form.value.lines) {
    const available = stockMap.value[line.item_id] ?? null
    if (available !== null && line.quantity > available) {
      $q.notify({
        type: 'warning',
        message: `Insufficient stock for "${line.item_name}": available ${available.toFixed(2)}, requested ${line.quantity}`,
        timeout: 5000,
      })
      return
    }
  }

  saving.value = true
  try {
    const remarks = form.value.issue_purpose
      + (form.value.remarks ? ` — ${form.value.remarks}` : '')

    const doc = await createDocument(
      {
        doc_type:     'GIN',
        doc_date:     form.value.doc_date,
        warehouse_id: warehouseId,
        remarks,
      },
      form.value.lines.map((l, idx) => ({
        item_id:   l.item_id,
        uom_id:    l.uom_id,
        quantity:  l.quantity,
        unit_cost: l.unit_cost || 0,
        line_number: idx + 1,
      }))
    )

    await postDocument(doc.id)
    $q.notify({ type: 'positive', message: `GIN ${doc.doc_number} posted — stock updated.` })
    dialogVisible.value = false
    await fetchGins()
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed to post GIN', caption: e.message })
  } finally {
    saving.value = false
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────────
function confirmDelete(row) {
  deleteTarget.value = row
  deleteVisible.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await deleteDocument(deleteTarget.value.id)
    $q.notify({ type: 'positive', message: `GIN ${deleteTarget.value.doc_number} deleted.` })
    deleteVisible.value = false
    await fetchGins()
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Delete failed', caption: e.message })
  } finally {
    deleting.value = false
    deleteTarget.value = null
  }
}

// ── Mount ─────────────────────────────────────────────────────────────────────
async function fetchGins() {
  await listDocuments({ docType: 'GIN' })
}

onMounted(async () => {
  await Promise.all([
    fetchGins(),
    listItems(),
    listWarehouses(),
  ])
  itemOptions.value = items.value
})
</script>
