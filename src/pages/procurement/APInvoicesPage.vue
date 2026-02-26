<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5">AP Invoices</div>
      <q-btn color="primary" icon="add" label="New Invoice" @click="createNewInvoice" />
    </div>

    <!-- Invoice List -->
    <q-table :rows="invoices" :columns="columns" row-key="id" :loading="loading" flat bordered>
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
          <q-btn flat round color="primary" icon="edit" size="sm" @click="editInvoice(props.row)" />
        </q-td>
      </template>
    </q-table>

    <!-- Invoice Dialog -->
    <q-dialog v-model="dialogVisible" full-width persistent>
      <q-card style="height: 90vh; display: flex; flex-direction: column">
        <q-card-section class="row items-center justify-between q-pb-none">
          <div class="text-h6">
            {{ isEditing ? 'Edit AP Invoice' : 'New AP Invoice' }}
          </div>
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section class="col scroll q-pa-md">
          <!-- Selection Mode (Only for New) -->
          <div
            v-if="!isEditing && !form.base_doc && !form.lines.length"
            class="row q-col-gutter-md q-mb-md bg-grey-1 q-pa-sm rounded-borders"
          >
            <div class="col-12 text-subtitle2">Create From:</div>
            <div class="col-12 row q-gutter-md">
              <q-radio v-model="createMode" val="grn" label="From GRN" />
              <q-radio v-model="createMode" val="direct" label="Direct Invoice" />
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
            title="AP Invoice"
            icon="receipt_long"
            :doc-number="form.doc_number"
            :status="form.status"
            v-model:docDate="form.doc_date"
            v-model:supplier="form.supplier"
            :supplier-options="supplierOptions"
            :read-only="form.status !== 'draft'"
          />

          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-4">
              <q-input
                v-model="form.supplier_inv_no"
                label="Supplier Invoice No"
                outlined
                dense
                :readonly="form.status !== 'draft'"
              />
            </div>
            <div class="col-12 col-md-4">
              <q-input
                v-model="form.due_date"
                type="date"
                label="Due Date"
                outlined
                dense
                :readonly="form.status !== 'draft'"
              />
            </div>
          </div>

          <q-separator class="q-my-md" />

          <DocLinesEditor
            :lines="form.lines"
            mode="INVOICE"
            :read-only="form.status !== 'draft'"
            :item-options="itemOptions"
            title="Invoice Lines"
            :allow-add="createMode === 'direct' || isEditing"
            :allow-edit-item="createMode === 'direct'"
            @add-line="addLine"
            @remove-line="removeLine"
            @item-change="onItemChange"
          />

          <!-- Totals -->
          <div class="row justify-end q-mt-md">
            <div class="col-12 col-md-4">
              <q-card flat bordered class="q-pa-md bg-grey-1">
                <div class="row justify-between text-h6 text-primary">
                  <div>Total</div>
                  <div>{{ formatCurrency(totalAmount) }}</div>
                </div>
              </q-card>
            </div>
          </div>
        </q-card-section>

        <PostingBar
          :status="form.status"
          @save="saveInvoice('draft')"
          @post="saveInvoice('posted')"
          @cancel="cancelInvoice"
          @print="printInvoice"
        />
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useQuasar, date } from 'quasar'
import {
  listInvoices,
  createInvoice,
  updateInvoice,
  postInvoice,
  createInvoiceFromGRN,
  listSuppliers,
  listGRNs,
  listItems,
} from 'src/services/procurementService'
import DocHeader from 'components/procurement/DocHeader.vue'
import DocLinesEditor from 'components/procurement/DocLinesEditor.vue'
import PostingBar from 'components/procurement/PostingBar.vue'

const $q = useQuasar()
const loading = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)

const invoices = ref([])
const supplierOptions = ref([])
const grnOptions = ref([])
const itemOptions = ref([])

const createMode = ref('grn')
const selectedSupplier = ref(null)
const selectedGRN = ref(null)

// Form
const defaultForm = {
  id: '',
  doc_number: 'NEW',
  supplier: undefined,
  supplier_id: null,
  doc_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  due_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  supplier_inv_no: '',
  status: 'draft',
  lines: [],
  base_doc_id: null,
  base_doc_type: null,
  base_doc: null,
  total_amount: 0,
}
const form = ref({ ...defaultForm })

// @ts-ignore
const columns = [
  {
    name: 'doc_number',
    label: 'Inv #',
    field: 'doc_number',
    align: 'left',
    sortable: true,
  },
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
  {
    name: 'amount',
    label: 'Amount',
    field: 'total_amount',
    align: 'right',
    format: (val) => formatCurrency(val),
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

onMounted(async () => {
  loading.value = true
  await Promise.all([fetchInvoices(), fetchSuppliers(), fetchItems()])
  loading.value = false
})

async function fetchInvoices() {
  invoices.value = await listInvoices()
}
async function fetchSuppliers() {
  supplierOptions.value = await listSuppliers()
}
async function fetchItems() {
  itemOptions.value = await listItems()
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
  form.value.supplier = selectedSupplier.value || undefined
  form.value.base_doc_id = selectedGRN.value.id
  form.value.base_doc_type = 'GRN'

  // Fetch GRN lines (mock logic needs them inside GRN object or separate call)
  // Assuming selectedGRN has lines or we fetch them. For mock, let's assume lines are in selectedGRN
  const lines = selectedGRN.value.lines || []

  form.value.lines = lines.map((l) => ({
    line_number: l.line_number,
    item_id: l.item_id,
    item_name: l.item_name,
    uom_id: l.uom_id,
    uom_name: l.uom_name,
    quantity: l.quantity, // Invoiced qty usually matches received qty initially
    unit_price: l.unit_cost || l.unit_price || 0,
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
  // - discount if implemented
})

function formatCurrency(val) {
  return (val || 0).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })
}

function statusColor(status) {
  if (status === 'open') return 'blue'
  if (status === 'draft') return 'grey'
  if (status === 'paid') return 'green'
  return 'red'
}

function createNewInvoice() {
  isEditing.value = false
  form.value = JSON.parse(JSON.stringify(defaultForm))
  createMode.value = 'grn'
  selectedSupplier.value = null
  selectedGRN.value = null
  dialogVisible.value = true
}

function editInvoice(row) {
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
  line.unit_price = item.last_purchase_price || 0
}

async function saveInvoice(targetStatus) {
  saving.value = true
  try {
    let invoice
    const supplierId = form.value.supplier?.id || form.value.supplier_id

    const lines = form.value.lines.map((l, idx) => ({
      line_number: idx + 1,
      item_id: l.item_id,
      description: l.description || null,
      uom_id: l.uom_id,
      quantity: l.quantity,
      unit_price: l.unit_price || 0,
      discount_pct: l.discount_pct || 0,
      tax_pct: l.tax_pct || 0,
      grn_line_id: l.grn_line_id || l.base_line_id || null,
    }))

    if (form.value.id) {
      // Update
      invoice = await updateInvoice(
        form.value.id,
        {
          supplier_id: supplierId,
          doc_date: form.value.doc_date,
          due_date: form.value.due_date,
          supplier_inv_no: form.value.supplier_inv_no,
        },
        lines,
      )
    } else if (form.value.base_doc_type === 'GRN' && form.value.base_doc_id) {
      // Create from GRN
      invoice = await createInvoiceFromGRN(form.value.base_doc_id, {
        supplier_inv_no: form.value.supplier_inv_no,
        doc_date: form.value.doc_date,
      })
    } else {
      // Direct
      if (!supplierId) {
        $q.notify({ type: 'warning', message: 'Supplier required' })
        return
      }
      invoice = await createInvoice(
        {
          supplier_id: supplierId,
          doc_date: form.value.doc_date,
          due_date: form.value.due_date,
          supplier_inv_no: form.value.supplier_inv_no,
        },
        lines,
      )
    }

    if (targetStatus === 'posted' && invoice?.id) {
      const res = await postInvoice(invoice.id)
      if (!res.success) throw new Error(res.error)
      $q.notify({ type: 'positive', message: `Invoice ${res.doc_number} Posted` })
    } else {
      $q.notify({ type: 'positive', message: 'Invoice Saved' })
    }

    dialogVisible.value = false
    fetchInvoices()
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed', caption: e.message })
  } finally {
    saving.value = false
  }
}

function cancelInvoice() {}
function printInvoice() {}
</script>
