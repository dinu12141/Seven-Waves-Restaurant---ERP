<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div>
        <div class="text-h5 text-weight-bold">Purchase Returns</div>
        <div class="text-caption text-grey">Return received goods to suppliers (reduces stock and supplier balance on post)</div>
      </div>
      <q-btn unelevated color="negative" icon="add" label="New Return" @click="createNewReturn" />
    </div>

    <!-- Filter Bar -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="q-py-sm">
        <div class="row q-col-gutter-sm items-center">
          <div class="col-12 col-sm-6 col-md-3">
            <q-input v-model="listFilter.search" outlined dense clearable debounce="200" label="Search Return # / GRN / Supplier">
              <template #prepend><q-icon name="search" /></template>
            </q-input>
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-select v-model="listFilter.supplier_id" :options="supplierOptions" option-value="id" option-label="name" emit-value map-options outlined dense clearable label="Supplier (All)" />
          </div>
          <div class="col-6 col-md-2">
            <q-select v-model="listFilter.status" :options="returnStatusOptions" emit-value map-options outlined dense clearable label="Status (All)" />
          </div>
          <div class="col-6 col-md-2">
            <q-input v-model="listFilter.from_date" type="date" outlined dense label="From" stack-label />
          </div>
          <div class="col-6 col-md-1">
            <q-input v-model="listFilter.to_date" type="date" outlined dense label="To" stack-label />
          </div>
          <div class="col-6 col-md-1 text-right">
            <q-btn flat dense icon="restart_alt" label="Reset" no-caps @click="resetListFilter" />
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Returns List -->
    <q-table
      :rows="visibleReturns"
      :columns="columns"
      row-key="id"
      :loading="loading"
      flat
      bordered
      :rows-per-page-options="[15, 25, 50, 100, 0]"
      no-data-label="No purchase returns match these filters"
    >
      <template v-slot:body-cell-status="props">
        <q-td :props="props" align="center">
          <q-chip
            :color="statusColor(props.row.status)"
            text-color="white"
            dense
            size="sm"
            class="text-uppercase text-weight-bold"
          >
            {{ props.row.status }}
          </q-chip>
        </q-td>
      </template>
      <template v-slot:body-cell-actions="props">
        <q-td :props="props" align="right">
          <q-btn flat round color="primary" icon="edit" size="sm" @click="editReturn(props.row)" />
        </q-td>
      </template>
    </q-table>

    <!-- Return Dialog -->
    <q-dialog v-model="dialogVisible" persistent>
      <q-card
        style="width: 900px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column"
        class="erp-dialog-card erp-border-radius shadow-5"
      >
        <q-card-section class="row items-center justify-between q-pb-none">
          <div class="text-h6">
            {{ isEditing ? 'Edit Purchase Return' : 'New Purchase Return' }}
          </div>
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section class="col scroll q-pa-md">
          <!-- Selection Mode (Only for New) -->
          <div
            v-if="!isEditing && !form.base_doc && !form.lines.length"
            class="row q-col-gutter-md q-mb-md q-pa-sm rounded-borders"
            :class="$q.dark.isActive ? 'bg-grey-9' : 'bg-grey-1'"
          >
            <div class="col-12 text-subtitle2">Create From:</div>
            <div class="col-12 row q-gutter-md">
              <q-radio v-model="createMode" val="grn" label="From GRN" />
              <q-radio v-model="createMode" val="direct" label="Direct Return" />
            </div>

            <div v-if="createMode === 'grn'" class="col-12 row q-col-gutter-md items-center">
              <div class="col-12 col-md-5">
                <q-select
                  v-model="selectedSupplier"
                  :options="supplierOptions"
                  option-label="name"
                  label="Select Supplier"
                  outlined
                  dense
                  @update:model-value="loadGRNs"
                />
              </div>
              <div class="col-12 col-md-5">
                <q-select
                  v-model="selectedGRN"
                  :options="grnOptions"
                  :option-label="(opt) => opt.doc_number"
                  label="Select GRN"
                  outlined
                  dense
                  :disable="!selectedSupplier"
                />
              </div>
              <div class="col-12 col-md-2">
                <q-btn label="Load" color="primary" :disable="!selectedGRN" @click="loadFromGRN" />
              </div>
            </div>
          </div>

          <q-separator v-if="!isEditing && !form.base_doc && !form.lines.length" class="q-my-md" />

          <DocHeader
            title="Purchase Return"
            icon="assignment_return"
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
            mode="RETURN"
            :read-only="form.status !== 'draft'"
            :item-options="itemOptions"
            title="Items to Return"
            :allow-add="createMode === 'direct' || isEditing"
            :allow-edit-item="createMode === 'direct'"
            @add-line="addLine"
            @remove-line="removeLine"
            @item-change="onItemChange"
          />

          <!-- Totals -->
          <div class="row justify-end q-mt-md">
            <div class="col-12 col-md-4">
              <q-card flat bordered class="q-pa-md">
                <div class="row justify-between text-h6 text-negative">
                  <div>Total Refund/Credit</div>
                  <div>{{ formatCurrency(totalAmount) }}</div>
                </div>
              </q-card>
            </div>
          </div>
        </q-card-section>

        <PostingBar
          :status="form.status"
          @save="saveReturn('draft')"
          @post="saveReturn('posted')"
          @cancel="cancelReturn"
          @print="printReturn"
        />
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useQuasar, date } from 'quasar'
import {
  listReturns,
  createReturn,
  updateReturn,
  postReturn,
  getGRNDetails,
  getReturnDetails,
  filterProcRows,
  validateReturnLines,
  listSuppliers,
  listGRNs,
  listItems,
  listWarehouses,
} from 'src/services/procurementService'
import DocHeader from 'components/procurement/DocHeader.vue'
import DocLinesEditor from 'components/procurement/DocLinesEditor.vue'
import PostingBar from 'components/procurement/PostingBar.vue'

const $q = useQuasar()
const loading = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)

const returns = ref([])
const supplierOptions = ref([])
const grnOptions = ref([])
const itemOptions = ref([])
const warehouseOptions = ref([])

const createMode = ref('grn')
const selectedSupplier = ref(null)
const selectedGRN = ref(null)

// Form
const defaultForm = {
  id: '',
  doc_number: 'NEW',
  supplier: undefined,
  warehouse: undefined,
  doc_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  status: 'draft',
  lines: [],
  base_doc_id: null,
  base_doc_type: null,
  base_doc: null,
  return_reason: null,
  total_amount: 0,
}
const form = ref({ ...defaultForm })

// List filters - exact status match, YYYY-MM-DD string dates (no TZ shift).
const emptyListFilter = () => ({ search: '', supplier_id: null, status: null, from_date: '', to_date: '' })
const listFilter = ref(emptyListFilter())
const returnStatusOptions = [
  { label: 'Draft', value: 'draft' },
  { label: 'Posted', value: 'posted' },
  { label: 'Cancelled', value: 'cancelled' },
]
const visibleReturns = computed(() =>
  filterProcRows(returns.value, listFilter.value, [
    (r) => r.doc_number,
    (r) => r.suppliers?.name,
    (r) => r.goods_receipts?.doc_number,
    (r) => r.return_reason,
  ]),
)
function resetListFilter() {
  listFilter.value = emptyListFilter()
}

const columns = [
  { name: 'doc_number', label: 'Return #', field: 'doc_number', align: 'left', sortable: true },
  {
    name: 'doc_date',
    label: 'Date',
    field: 'doc_date',
    align: 'left',
    sortable: true,
    format: (val) => date.formatDate(val, 'DD/MM/YYYY'),
  },
  {
    name: 'supplier',
    label: 'Supplier',
    // API returns the nested `suppliers` relation (was `supplier` -> always '-')
    field: (row) => row.suppliers?.name || row.supplier?.name || '-',
    align: 'left',
    sortable: true,
  },
  {
    name: 'grn',
    label: 'GRN Ref',
    field: (row) => row.goods_receipts?.doc_number || '-',
    align: 'left',
  },
  {
    name: 'amount',
    label: 'Amount',
    field: 'total_amount',
    align: 'right',
    sortable: true,
    sort: (a, b) => Number(a) - Number(b),
    format: (val) => formatCurrency(val),
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

onMounted(async () => {
  loading.value = true
  await Promise.all([fetchReturns(), fetchSuppliers(), fetchItems(), fetchWarehouses()])
  loading.value = false
})

async function fetchReturns() {
  try {
    returns.value = await listReturns()
  } catch (e) {
    console.error('Failed to load purchase returns:', e)
    $q.notify({ type: 'negative', message: 'Failed to load purchase returns', caption: e?.message })
  }
}
async function fetchSuppliers() {
  supplierOptions.value = await listSuppliers()
}
async function fetchItems() {
  itemOptions.value = await listItems()
}
async function fetchWarehouses() {
  warehouseOptions.value = await listWarehouses()
}

async function loadGRNs(supplier) {
  selectedGRN.value = null
  grnOptions.value = []
  if (!supplier) return
  const allGRNs = await listGRNs({ supplier_id: supplier.id, status: 'posted' })
  grnOptions.value = allGRNs.filter((g) => g.status === 'posted')
}

async function loadFromGRN() {
  if (!selectedGRN.value) return
  // listGRNs() returns no lines - fetch the GRN with its lines (previously the
  // editor came up empty and the FULL GRN was silently returned on save).
  let grn
  try {
    grn = await getGRNDetails(selectedGRN.value.id)
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed to load GRN lines', caption: e?.message })
    return
  }
  form.value.supplier = selectedSupplier.value || grn.suppliers || undefined
  form.value.warehouse =
    warehouseOptions.value.find((w) => w.id === grn.warehouse_id) || grn.warehouses || undefined
  form.value.base_doc_id = grn.id
  form.value.base_doc_type = 'GRN'

  form.value.lines = (grn.goods_receipt_lines || []).map((l, idx) => ({
    line_number: l.line_number || idx + 1,
    item_id: l.item_id,
    item_name: l.items?.name || l.item_id,
    uom_id: l.uom_id,
    uom_name: l.uom?.name || l.uom?.code || '',
    quantity: Number(l.quantity) || 0, // user may reduce; 0 = do not return this line
    max_qty: Number(l.quantity) || 0,
    unit_price: Number(l.unit_cost) || 0,
    unit_cost: Number(l.unit_cost) || 0,
    batch_no: l.batch_no || null,
    base_line_id: l.id,
  }))

  // Clear selection
  selectedSupplier.value = null
  selectedGRN.value = null
}

const totalAmount = computed(() => {
  return (form.value.lines || []).reduce(
    (acc, line) => acc + (line.quantity || 0) * (line.unit_price || 0),
    0,
  )
})

function formatCurrency(val) {
  return (val || 0).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })
}

function statusColor(status) {
  if (status === 'posted') return 'green'
  if (status === 'draft') return 'grey'
  return 'red'
}

function createNewReturn() {
  isEditing.value = false
  form.value = { ...JSON.parse(JSON.stringify(defaultForm)), doc_date: date.formatDate(Date.now(), 'YYYY-MM-DD') }
  createMode.value = 'grn'
  selectedSupplier.value = null
  selectedGRN.value = null
  dialogVisible.value = true
}

async function editReturn(row) {
  // The list row has no lines / supplier / warehouse objects - load the full
  // doc, otherwise saving a draft sent zero lines and no warehouse.
  let ret
  try {
    ret = await getReturnDetails(row.id)
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed to load return', caption: e?.message })
    return
  }
  isEditing.value = true
  createMode.value = ret.grn_id ? 'grn' : 'direct'
  form.value = {
    ...JSON.parse(JSON.stringify(defaultForm)),
    id: ret.id,
    doc_number: ret.doc_number,
    doc_date: ret.doc_date,
    status: ret.status,
    return_reason: ret.return_reason,
    total_amount: ret.total_amount,
    base_doc_id: ret.grn_id || null,
    base_doc_type: ret.grn_id ? 'GRN' : null,
    supplier: supplierOptions.value.find((s) => s.id === ret.supplier_id) || ret.suppliers || undefined,
    warehouse: warehouseOptions.value.find((w) => w.id === ret.warehouse_id) || undefined,
    lines: (ret.purchase_return_lines || [])
      .slice()
      .sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
      .map((l, idx) => ({
        line_number: l.line_number || idx + 1,
        item_id: l.item_id,
        item_name: l.items?.name || l.item_id,
        uom_id: l.uom_id,
        uom_name: l.uom?.name || l.uom?.code || '',
        quantity: Number(l.quantity) || 0,
        unit_price: Number(l.unit_cost) || 0,
        unit_cost: Number(l.unit_cost) || 0,
        batch_no: l.batch_no || null,
        grn_line_id: l.grn_line_id || null,
      })),
  }
  dialogVisible.value = true
}

function addLine() {
  form.value.lines.push({
    line_number: form.value.lines.length + 1,
    quantity: 1,
    unit_price: 0,
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
  line.unit_price = item.last_purchase_price || item.cost_price || item.unit_cost || 0
}

async function saveReturn(targetStatus) {
  saving.value = true
  try {
    let ret
    const supplierId = form.value.supplier?.id
    const warehouseId = form.value.warehouse?.id

    const lineError = validateReturnLines(form.value.lines)
    if (lineError) {
      $q.notify({ type: 'warning', message: lineError })
      return
    }
    const keptLines = form.value.lines.filter((l) => Number(l.quantity) > 0)

    const lines = keptLines.map((l, idx) => ({
      line_number: idx + 1,
      item_id: l.item_id,
      uom_id: l.uom_id,
      quantity: l.quantity,
      unit_cost: l.unit_cost || l.unit_price || 0,
      batch_no: l.batch_no || null,
      grn_line_id: l.grn_line_id || l.base_line_id || null,
    }))

    if (form.value.id) {
      // Update
      ret = await updateReturn(
        form.value.id,
        {
          doc_date: form.value.doc_date,
          warehouse_id: warehouseId,
          return_reason: form.value.return_reason,
        },
        lines,
      )
    } else if (form.value.base_doc_id) {
      // From GRN - save the quantities the user actually entered (previously
      // createReturnFromGRN copied the FULL GRN qty and ignored edits).
      if (!supplierId || !warehouseId) {
        $q.notify({ type: 'warning', message: 'Supplier and Warehouse required' })
        return
      }
      ret = await createReturn(
        {
          supplier_id: supplierId,
          warehouse_id: warehouseId,
          grn_id: form.value.base_doc_id,
          doc_date: form.value.doc_date,
          return_reason: form.value.return_reason,
        },
        lines,
      )
    } else {
      // Direct
      if (!supplierId || !warehouseId) {
        $q.notify({ type: 'warning', message: 'Supplier and Warehouse required' })
        return
      }
      ret = await createReturn(
        {
          supplier_id: supplierId,
          warehouse_id: warehouseId,
          doc_date: form.value.doc_date,
          return_reason: form.value.return_reason,
        },
        lines,
      )
    }

    if (targetStatus === 'posted' && ret?.id) {
      const res = await postReturn(ret.id)
      if (!res.success) throw new Error(res.error)
      $q.notify({ type: 'positive', message: `Return ${res.doc_number} Posted` })
    } else {
      $q.notify({ type: 'positive', message: 'Return Saved' })
    }

    dialogVisible.value = false
    fetchReturns()
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed', caption: e.message })
  } finally {
    saving.value = false
  }
}

function cancelReturn() {
  // No cancel/reverse RPC exists for posted purchase returns yet (audit backlog).
  $q.notify({
    type: 'info',
    message: 'Posted returns cannot be cancelled here',
    caption: 'Ask Finance to raise an adjusting entry for the supplier balance.',
  })
}
function printReturn() {
  window.print()
}
</script>
