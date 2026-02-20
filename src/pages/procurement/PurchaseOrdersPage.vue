<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5">Purchase Orders</div>
      <q-btn color="primary" icon="add" label="New PO" @click="createNewPO" />
    </div>

    <!-- Tabs -->
    <q-tabs
      v-model="tab"
      dense
      class="text-grey"
      active-color="primary"
      indicator-color="primary"
      align="justify"
      narrow-indicator
    >
      <q-tab name="all" label="All" />
      <q-tab name="draft" label="Drafts" />
      <q-tab name="open" label="Open" />
      <q-tab name="closed" label="Closed" />
    </q-tabs>

    <q-separator />

    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="all" class="q-pa-none">
        <q-table
          :rows="filteredPOs"
          :columns="columns"
          row-key="id"
          :loading="loading"
          flat
          bordered
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
              <q-btn flat round color="primary" icon="edit" size="sm" @click="editPO(props.row)" />
            </q-td>
          </template>
        </q-table>
      </q-tab-panel>
      <!-- We use 'all' panel logic for others filtered computed property -->
      <q-tab-panel name="draft" class="q-pa-none">
        <q-table
          :rows="filteredPOs"
          :columns="columns"
          row-key="id"
          :loading="loading"
          flat
          bordered
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
          <template v-slot:body-cell-actions="props"
            ><q-td :props="props" align="right"
              ><q-btn
                flat
                round
                color="primary"
                icon="edit"
                size="sm"
                @click="editPO(props.row)" /></q-td
          ></template>
        </q-table>
      </q-tab-panel>
      <q-tab-panel name="open" class="q-pa-none">
        <q-table
          :rows="filteredPOs"
          :columns="columns"
          row-key="id"
          :loading="loading"
          flat
          bordered
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
          <template v-slot:body-cell-actions="props"
            ><q-td :props="props" align="right"
              ><q-btn
                flat
                round
                color="primary"
                icon="edit"
                size="sm"
                @click="editPO(props.row)" /></q-td
          ></template>
        </q-table>
      </q-tab-panel>
      <q-tab-panel name="closed" class="q-pa-none">
        <q-table
          :rows="filteredPOs"
          :columns="columns"
          row-key="id"
          :loading="loading"
          flat
          bordered
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
          <template v-slot:body-cell-actions="props"
            ><q-td :props="props" align="right"
              ><q-btn
                flat
                round
                color="primary"
                icon="edit"
                size="sm"
                @click="editPO(props.row)" /></q-td
          ></template>
        </q-table>
      </q-tab-panel>
    </q-tab-panels>

    <!-- PO Dialog -->
    <q-dialog v-model="dialogVisible" full-width persistent>
      <q-card style="height: 90vh; display: flex; flex-direction: column">
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
          @save="savePO('draft')"
          @post="savePO('open')"
          @cancel="cancelPO"
          @print="printPO"
        />
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
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
  { name: 'doc_number', label: 'PO #', field: 'doc_number', align: 'left', sortable: true },
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
    field: (row) => row.suppliers?.name || row.supplier?.name,
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

function statusColor(status) {
  if (status === 'draft') return 'grey'
  if (status === 'open') return 'blue'
  if (status === 'closed') return 'green'
  if (status === 'cancelled') return 'red'
  if (status === 'partial') return 'orange'
  return 'grey'
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
