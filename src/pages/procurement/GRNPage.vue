<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5">Goods Receipt (GRN)</div>
      <q-btn color="primary" icon="add" label="New GRN" @click="createNewGRN" />
    </div>

    <!-- GRN List -->
    <q-table :rows="grns" :columns="columns" row-key="id" :loading="loading" flat bordered>
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
          <q-btn flat round color="primary" icon="edit" size="sm" @click="editGRN(props.row)" />
        </q-td>
      </template>
    </q-table>

    <!-- GRN Dialog -->
    <q-dialog v-model="dialogVisible" full-width persistent>
      <q-card style="height: 90vh; display: flex; flex-direction: column">
        <q-card-section class="row items-center justify-between q-pb-none">
          <div class="text-h6">
            {{ isEditing ? 'Edit GRN' : 'New Goods Receipt' }}
          </div>
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section class="col scroll q-pa-md">
          <!-- Selection Mode (Only for New) -->
          <div
            v-if="!isEditing && !form.po && !form.lines.length"
            class="row q-col-gutter-md q-mb-md bg-grey-1 q-pa-sm rounded-borders"
          >
            <div class="col-12 text-subtitle2">Create From:</div>
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
                <q-btn label="Load" color="primary" :disable="!selectedPO" @click="loadFromPO" />
              </div>
            </div>
          </div>

          <q-separator v-if="!isEditing && !form.po && !form.lines.length" class="q-my-md" />

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
        </q-card-section>

        <PostingBar
          :status="form.status"
          @save="saveGRN('draft')"
          @post="saveGRN('posted')"
          @cancel="cancelGRN"
          @print="printGRN"
        />
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar, date } from 'quasar'
import {
  listGRNs,
  createGRN,
  updateGRN,
  postGRN,
  createGRNFromPO,
  listSuppliers,
  listWarehouses,
  listItems,
  listPO,
} from 'src/services/procurementService'
import DocHeader from 'components/procurement/DocHeader.vue'
import DocLinesEditor from 'components/procurement/DocLinesEditor.vue'
import PostingBar from 'components/procurement/PostingBar.vue'

const $q = useQuasar()
const loading = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)

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
  supplier: undefined,
  supplier_id: '',
  warehouse: undefined,
  warehouse_id: '',
  doc_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  status: 'draft',
  lines: [],
  po: undefined,
  po_id: '',
}
const form = ref({ ...defaultForm })

const columns = [
  { name: 'doc_number', label: 'GRN #', field: 'doc_number', align: 'left', sortable: true },
  {
    name: 'doc_date',
    label: 'Date',
    field: 'doc_date',
    align: 'left',
    format: (val) => date.formatDate(val, 'DD/MM/YYYY'),
  },
  {
    name: 'supplier',
    label: 'Supplier',
    field: (row) => row.supplier?.name || '-',
    align: 'left',
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

onMounted(async () => {
  loading.value = true
  await Promise.all([fetchGRNs(), fetchSuppliers(), fetchWarehouses(), fetchItems()])
  loading.value = false
})

async function fetchGRNs() {
  grns.value = await listGRNs()
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

async function loadPOs(supplier) {
  selectedPO.value = null
  poOptions.value = []
  if (!supplier) return
  const allPOs = await listPO({ supplier_id: supplier.id, status: 'approved' })
  poOptions.value = allPOs.filter(
    (p) => p.status === 'approved' || p.status === 'open' || p.status === 'partial',
  )
}

async function loadFromPO() {
  if (!selectedPO.value) return
  form.value.supplier = selectedSupplier.value || undefined
  form.value.po = selectedPO.value
  // Map PO lines to GRN lines
  form.value.lines = (selectedPO.value.lines || []).map((l) => ({
    line_number: l.line_number,
    item_id: l.item_id,
    item_name: l.item_name,
    uom_id: l.uom_id,
    uom_name: l.uom_name,
    quantity: l.quantity, // Default to receiving full ordered qty
    unit_price: l.unit_price, // Needed for valuation?
    line_total: 0, // Not shown in GRN usually or calculated differently
    po_line_id: l.id,
  }))
  // Clear selection UI
  selectedSupplier.value = null
  selectedPO.value = null
}

function statusColor(status) {
  if (status === 'posted') return 'green'
  if (status === 'draft') return 'grey'
  return 'red'
}

function createNewGRN() {
  isEditing.value = false
  form.value = JSON.parse(JSON.stringify(defaultForm))
  createMode.value = 'po'
  selectedSupplier.value = null
  selectedPO.value = null
  dialogVisible.value = true
}

function editGRN(row) {
  isEditing.value = true
  form.value = JSON.parse(JSON.stringify(row))
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
  line.uom_id = item.uom_id
  line.uom_name = item.uom_name || 'UNIT'
}

async function saveGRN(targetStatus) {
  saving.value = true
  try {
    let grn
    const supplierId = form.value.supplier?.id || form.value.supplier_id
    const warehouseId = form.value.warehouse?.id || form.value.warehouse_id

    const lines = form.value.lines.map((l, idx) => ({
      line_number: idx + 1,
      po_line_id: l.po_line_id || l.id || null,
      item_id: l.item_id,
      uom_id: l.uom_id,
      quantity: l.quantity,
      unit_cost: l.unit_cost || l.unit_price || 0,
      batch_no: l.batch_no || null,
      expiry_date: l.expiry_date || null,
      notes: l.notes || null,
    }))

    if (form.value.id) {
      // Update
      grn = await updateGRN(
        form.value.id,
        {
          doc_date: form.value.doc_date,
          warehouse_id: warehouseId,
        },
        lines,
      )
    } else if (createMode.value === 'po' && form.value.po_id) {
      // Create from PO
      grn = await createGRNFromPO(form.value.po_id, {
        doc_date: form.value.doc_date,
        warehouse_id: warehouseId,
      })
    } else {
      // Direct GRN
      if (!supplierId || !warehouseId) {
        $q.notify({ type: 'warning', message: 'Supplier and Warehouse are required' })
        return
      }
      grn = await createGRN(
        { supplier_id: supplierId, warehouse_id: warehouseId, doc_date: form.value.doc_date },
        lines,
      )
    }

    if (targetStatus === 'posted' && grn?.id) {
      const res = await postGRN(grn.id)
      if (!res.success) throw new Error(res.error)
      $q.notify({ type: 'positive', message: `GRN ${res.doc_number} Posted` })
    } else {
      $q.notify({ type: 'positive', message: 'GRN Saved' })
    }

    dialogVisible.value = false
    fetchGRNs()
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed', caption: e.message })
  } finally {
    saving.value = false
  }
}

function cancelGRN() {}
function printGRN() {}
</script>
