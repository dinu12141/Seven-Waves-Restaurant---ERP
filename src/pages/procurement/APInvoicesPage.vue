<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div>
        <div class="text-h5 text-weight-bold">AP Invoices</div>
        <div class="text-caption text-grey">Accounts Payable — Supplier Invoices</div>
      </div>
      <q-btn unelevated color="primary" icon="add" label="New Invoice" @click="createNewInvoice" />
    </div>

    <!-- Invoice List -->
    <q-table
      :rows="invoices"
      :columns="columns"
      row-key="id"
      :loading="loading"
      flat
      bordered
      :rows-per-page-options="[15, 25, 50]"
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
            {{ props.row.status?.replace('_', ' ') }}
          </q-chip>
        </q-td>
      </template>
      <template v-slot:body-cell-actions="props">
        <q-td :props="props" align="right">
          <q-btn
            flat
            round
            color="primary"
            icon="edit"
            size="sm"
            @click="editInvoice(props.row)"
          />
        </q-td>
      </template>
    </q-table>

    <!-- Invoice Dialog -->
    <q-dialog v-model="dialogVisible" persistent>
      <q-card
        style="width: 900px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column"
        class="erp-dialog-card erp-border-radius shadow-5"
      >
        <!-- Loading overlay -->
        <q-inner-loading :showing="detailLoading">
          <q-spinner-tail color="primary" size="40px" />
          <div class="q-mt-sm text-subtitle2">Loading Invoice...</div>
        </q-inner-loading>

        <q-card-section class="row items-center justify-between q-pb-none">
          <div class="row items-center q-gutter-sm">
            <div class="text-h6">{{ isEditing ? 'Edit AP Invoice' : 'New AP Invoice' }}</div>
            <q-chip
              v-if="form.doc_number && form.doc_number !== 'NEW'"
              dense
              color="blue-1"
              text-color="blue-9"
              size="sm"
              class="text-weight-bold"
            >
              {{ form.doc_number }}
            </q-chip>
          </div>
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section class="col scroll q-pa-md">
          <!-- Source Selection (New Invoice only) -->
          <div
            v-if="!isEditing && !form.base_doc_id && !form.lines?.length"
            class="row q-col-gutter-md q-mb-md q-pa-sm rounded-borders"
            style="background: var(--erp-bg-hover); border: 1px solid var(--erp-border)"
          >
            <div class="col-12 text-subtitle2 text-weight-bold">Create From:</div>
            <div class="col-12 row q-gutter-md">
              <q-radio v-model="createMode" val="direct" label="Direct Invoice" />
            </div>
            <div class="col-12 text-caption text-grey-6">
              <q-icon name="info" size="14px" /> AP Invoices are auto-created when a GRN is posted.
              Use "Direct Invoice" only for non-GRN purchases.
            </div>
          </div>

          <!-- Header Fields -->
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

          <div class="row q-col-gutter-md q-mb-md q-mt-sm">
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
            <div v-if="form.grn_ref" class="col-12 col-md-4">
              <q-input
                :model-value="form.grn_ref"
                label="GRN Reference"
                outlined
                dense
                readonly
                prepend-icon="inventory"
              >
                <template v-slot:prepend>
                  <q-icon name="inventory" color="grey-6" />
                </template>
              </q-input>
            </div>
          </div>

          <q-separator class="q-my-md" />

          <DocLinesEditor
            :lines="form.lines"
            mode="INVOICE"
            :read-only="form.status !== 'draft'"
            :item-options="itemOptions"
            title="Invoice Lines"
            :allow-add="createMode === 'direct' || (!isEditing && !form.base_doc_id)"
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
                <div v-if="form.paid_amount > 0" class="row justify-between items-center q-mt-xs">
                  <span style="font-size: 13px; color: var(--erp-text-secondary)">Paid</span>
                  <span style="font-size: 14px; color: var(--q-positive)">
                    {{ formatCurrency(form.paid_amount) }}
                  </span>
                </div>
                <div v-if="form.balance_due > 0" class="row justify-between items-center q-mt-xs">
                  <span style="font-size: 13px; color: var(--erp-text-secondary)">Balance Due</span>
                  <span style="font-size: 15px; font-weight: 700; color: var(--q-negative)">
                    {{ formatCurrency(form.balance_due) }}
                  </span>
                </div>
                <!-- PAID banner -->
                <div
                  v-if="form.status === 'paid'"
                  class="row items-center justify-center q-mt-sm q-pa-xs rounded-borders"
                  style="background: #e8f5e9; border: 1.5px solid #43a047;"
                >
                  <q-icon name="check_circle" color="positive" size="18px" class="q-mr-xs" />
                  <span class="text-positive text-weight-bold">FULLY PAID</span>
                </div>
                <!-- PARTIAL banner -->
                <div
                  v-else-if="form.status === 'partial_paid'"
                  class="row items-center justify-center q-mt-sm q-pa-xs rounded-borders"
                  style="background: #fff3e0; border: 1.5px solid #fb8c00;"
                >
                  <q-icon name="hourglass_bottom" color="orange" size="18px" class="q-mr-xs" />
                  <span class="text-orange text-weight-bold">PARTIALLY PAID</span>
                </div>
              </div>
            </div>
          </div>
        </q-card-section>

        <!-- Action Bar -->
        <q-separator />
        <q-card-actions class="q-pa-md row items-center justify-between">
          <div>
            <q-btn v-if="form.status !== 'draft'" flat label="Print" icon="print" @click="printInvoice" />
          </div>
          <div class="row q-gutter-sm">
            <q-btn flat label="Close" @click="dialogVisible = false" />
            <q-btn
              v-if="form.status === 'draft'"
              unelevated
              color="primary"
              icon="check"
              label="Post Invoice"
              :loading="saving"
              @click="saveInvoice('posted')"
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
  listInvoices,
  createInvoice,
  updateInvoice,
  postInvoice,
  getInvoiceDetails,
  listSuppliers,
  listItems,
} from 'src/services/procurementService'
import DocHeader from 'components/procurement/DocHeader.vue'
import DocLinesEditor from 'components/procurement/DocLinesEditor.vue'

const $q = useQuasar()
const loading = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)
const detailLoading = ref(false)

const invoices = ref([])
const supplierOptions = ref([])
const itemOptions = ref([])

const createMode = ref('direct')

// Form
const defaultForm = {
  id: '',
  doc_number: 'NEW',
  supplier: null,
  supplier_id: null,
  doc_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  due_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  supplier_inv_no: '',
  status: 'draft',
  lines: [],
  base_doc_id: null,
  grn_ref: '',
  total_amount: 0,
  paid_amount: 0,
  balance_due: 0,
}
const form = ref({ ...defaultForm })

const columns = [
  {
    name: 'doc_number',
    label: 'Inv #',
    field: 'doc_number',
    classes: 'text-no-wrap text-weight-medium',
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
    // ✅ Fixed: API returns nested `suppliers` object, not `supplier`
    field: (row) => row.suppliers?.name || row.supplier_name || '-',
    align: 'left',
  },
  {
    name: 'grn_ref',
    label: 'GRN Ref',
    field: (row) => row.goods_receipts?.doc_number || '-',
    align: 'left',
  },
  {
    name: 'amount',
    label: 'Amount',
    field: 'total_amount',
    align: 'right',
    format: (val) => formatCurrency(val),
  },
  {
    name: 'balance_due',
    label: 'Balance Due',
    field: 'balance_due',
    align: 'right',
    format: (val) => (val > 0 ? formatCurrency(val) : '-'),
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center', width: 110 },
  { name: 'actions', label: '', field: 'actions', align: 'right', width: 60 },
]

onMounted(async () => {
  loading.value = true
  await Promise.all([fetchInvoices(), fetchSuppliers(), fetchItems()])
  loading.value = false
})

async function fetchInvoices() {
  try {
    invoices.value = await listInvoices()
  } catch (e) {
    console.error('Failed to load invoices:', e)
  }
}
async function fetchSuppliers() {
  supplierOptions.value = await listSuppliers()
}
async function fetchItems() {
  itemOptions.value = await listItems()
}

const totalAmount = computed(() => {
  if (form.value.id && form.value.status !== 'draft') {
    return form.value.total_amount || 0
  }
  return (form.value.lines || []).reduce(
    (acc, line) => acc + (line.quantity || 0) * (line.unit_price || 0),
    0,
  )
})

function formatCurrency(val) {
  return `LKR\u00A0${(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function statusColor(status) {
  if (status === 'draft') return 'grey-7'
  if (status === 'posted') return 'blue-7'
  if (status === 'partial_paid') return 'orange-7'
  if (status === 'paid') return 'green-7'
  return 'red-7'
}

function createNewInvoice() {
  isEditing.value = false
  form.value = { ...defaultForm, lines: [] }
  createMode.value = 'direct'
  dialogVisible.value = true
}

// ── Edit: fetch full invoice details ──────────────────────────────────
async function editInvoice(row) {
  isEditing.value = true
  detailLoading.value = true
  dialogVisible.value = true

  // Pre-populate with list data immediately
  form.value = {
    ...defaultForm,
    id: row.id,
    doc_number: row.doc_number,
    status: row.status,
    total_amount: row.total_amount || 0,
    paid_amount: row.paid_amount || 0,
    balance_due: row.balance_due || 0,
    supplier:
      row.suppliers ||
      supplierOptions.value.find((s) => s.id === row.supplier_id) ||
      null,
    grn_ref: row.goods_receipts?.doc_number || '',
    lines: [],
  }

  try {
    const full = await getInvoiceDetails(row.id)

    // Map invoice lines
    const rawLines = full.ap_invoice_lines || []
    const lines = rawLines.map((l, idx) => ({
      line_number: l.line_number || idx + 1,
      item_id: l.item_id,
      item_name: l.items?.name || '',
      uom_id: l.uom_id,
      uom_name: l.uom?.name || l.uom?.code || '',
      quantity: l.quantity,
      unit_price: l.unit_price || 0,
      discount_pct: l.discount_pct || 0,
      tax_pct: l.tax_pct || 0,
      line_total: l.quantity * (l.unit_price || 0),
      grn_line_id: l.grn_line_id || null,
      po_line_id: l.po_line_id || null,
    }))

    form.value = {
      ...full,
      supplier:
        full.suppliers ||
        supplierOptions.value.find((s) => s.id === full.supplier_id) ||
        null,
      grn_ref: full.goods_receipts?.doc_number || '',
      lines,
    }
  } catch (e) {
    console.error('Failed to load invoice details:', e)
    $q.notify({ type: 'negative', message: 'Could not load invoice details', caption: e.message })
    dialogVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

function addLine() {
  form.value.lines.push({
    line_number: form.value.lines.length + 1,
    item_id: null,
    item_name: '',
    uom_id: null,
    uom_name: '',
    quantity: 1,
    unit_price: 0,
    discount_pct: 0,
    tax_pct: 0,
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
  line.uom_id = item.uom_id
  line.uom_name = item.uom_name || 'UNIT'
  line.unit_price = item.last_purchase_price || 0
}

// ── Save / Post ─────────────────────────────────────────────────────────
async function saveInvoice(targetStatus) {
  saving.value = true
  try {
    let invoice
    const supplierId = form.value.supplier?.id || form.value.supplier_id

    const lines = (form.value.lines || []).map((l, idx) => ({
      line_number: idx + 1,
      item_id: l.item_id || null,
      description: l.description || null,
      uom_id: l.uom_id || null,
      quantity: l.quantity,
      unit_price: l.unit_price || 0,
      discount_pct: l.discount_pct || 0,
      tax_pct: l.tax_pct || 0,
      grn_line_id: l.grn_line_id || null,
      po_line_id: l.po_line_id || null,
    }))

    if (form.value.id) {
      // Update existing draft invoice
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
    } else {
      // Direct new invoice
      if (!supplierId) {
        $q.notify({ type: 'warning', message: 'Supplier required' })
        return
      }
      if (!lines.length) {
        $q.notify({ type: 'warning', message: 'At least one line item is required' })
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

function printInvoice() {}
</script>
