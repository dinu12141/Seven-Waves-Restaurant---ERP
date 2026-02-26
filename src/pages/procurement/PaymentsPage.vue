<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5">Supplier Payments</div>
      <q-btn color="primary" icon="add" label="New Payment" @click="createNewPayment" />
    </div>

    <!-- Payments List -->
    <q-table :rows="payments" :columns="columns" row-key="id" :loading="loading" flat bordered>
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
          <q-btn flat round color="primary" icon="edit" size="sm" @click="editPayment(props.row)" />
        </q-td>
      </template>
    </q-table>

    <!-- Payment Dialog -->
    <q-dialog v-model="dialogVisible" persistent>
      <q-card style="width: 800px; max-width: 90vw">
        <q-card-section class="row items-center justify-between q-pb-none">
          <div class="text-h6">
            {{ isEditing ? 'Edit Payment' : 'New Payment' }}
          </div>
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator />

        <q-card-section class="q-pa-md">
          <div class="row q-col-gutter-md">
            <!-- Header -->
            <div class="col-12 col-md-6">
              <q-select
                v-model="form.supplier"
                :options="supplierOptions"
                option-label="name"
                label="Supplier"
                outlined
                dense
                :readonly="form.status !== 'draft'"
                @update:model-value="onSupplierChange"
              />
            </div>
            <div class="col-12 col-md-6">
              <q-input
                v-model="form.doc_date"
                type="date"
                label="Date"
                outlined
                dense
                :readonly="form.status !== 'draft'"
              />
            </div>

            <!-- Amount & Method -->
            <div class="col-12 col-md-4">
              <q-input
                v-model.number="form.amount"
                type="number"
                label="Payment Amount"
                outlined
                dense
                :readonly="form.status !== 'draft'"
                input-class="text-right text-weight-bold text-primary"
                :rules="[(val) => val > 0 || 'Amount required']"
              />
            </div>
            <div class="col-12 col-md-4">
              <q-select
                v-model="form.payment_method"
                :options="['Cash', 'Bank Transfer', 'Cheque', 'Card']"
                label="Method"
                outlined
                dense
                :readonly="form.status !== 'draft'"
              />
            </div>
            <div class="col-12 col-md-4">
              <q-input
                v-model="form.reference"
                label="Ref / Cheque #"
                outlined
                dense
                :readonly="form.status !== 'draft'"
              />
            </div>

            <!-- Allocation Button -->
            <div class="col-12 text-right">
              <q-btn
                label="Allocate to Invoices"
                icon="assignment"
                color="secondary"
                outline
                @click="openAllocation"
                :disable="!form.supplier || form.amount <= 0"
              />
              <div class="text-caption text-grey q-mt-sm">
                Allocated: {{ formatCurrency(totalAllocated) }} | Unallocated:
                {{ formatCurrency(form.amount - totalAllocated) }}
              </div>
            </div>

            <!-- Allocation Summary List -->
            <div class="col-12" v-if="form.allocations.length > 0">
              <div class="text-subtitle2">Allocations:</div>
              <q-list dense separator bordered>
                <q-item v-for="(alloc, index) in form.allocations" :key="index">
                  <q-item-section>Invoice #{{ getInvoiceNumber(alloc.invoice_id) }}</q-item-section>
                  <q-item-section side>{{ formatCurrency(alloc.amount) }}</q-item-section>
                </q-item>
              </q-list>
            </div>
          </div>
        </q-card-section>

        <PostingBar
          :status="form.status"
          @save="savePayment('draft')"
          @post="savePayment('posted')"
          @cancel="cancelPayment"
          @print="printPayment"
        />
      </q-card>
    </q-dialog>

    <AllocationDialog
      v-model="allocationDialogVisible"
      :invoices="openInvoices"
      :total-payment="form.amount"
      @confirm="onAllocationConfirm"
    />
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useQuasar, date } from 'quasar'
import {
  listPayments,
  createPayment,
  allocatePayment,
  postPayment,
  getOpenInvoicesForSupplier,
  listSuppliers,
} from 'src/services/procurementService'
import PostingBar from 'components/procurement/PostingBar.vue'
import AllocationDialog from 'components/procurement/AllocationDialog.vue'

const $q = useQuasar()
const loading = ref(false)
const dialogVisible = ref(false)
const allocationDialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)

const payments = ref([])
const supplierOptions = ref([])
const openInvoices = ref([])

// Form
const defaultForm = {
  id: '',
  doc_number: 'NEW',
  supplier: undefined,
  supplier_id: null,
  doc_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  amount: 0,
  payment_method: 'Cash',
  reference: '',
  remarks: '',
  status: 'draft',
  allocations: [],
}
const form = ref({ ...defaultForm })

// @ts-ignore
const columns = [
  { name: 'doc_number', label: 'Payment #', field: 'doc_number', align: 'left', sortable: true },
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
    field: 'amount',
    align: 'right',
    format: (val) => formatCurrency(val),
  },
  { name: 'method', label: 'Method', field: 'payment_method', align: 'left' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

onMounted(async () => {
  loading.value = true
  await Promise.all([fetchPayments(), fetchSuppliers()])
  loading.value = false
})

async function fetchPayments() {
  payments.value = await listPayments()
}
async function fetchSuppliers() {
  supplierOptions.value = await listSuppliers()
}

async function onSupplierChange(supplier) {
  form.value.allocations = []
  if (supplier) {
    openInvoices.value = await getOpenInvoicesForSupplier(supplier.id)
  } else {
    openInvoices.value = []
  }
}

function formatCurrency(val) {
  return (val || 0).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })
}

function statusColor(status) {
  if (status === 'posted') return 'green'
  if (status === 'draft') return 'grey'
  return 'red'
}

function createNewPayment() {
  isEditing.value = false
  form.value = JSON.parse(JSON.stringify(defaultForm))
  dialogVisible.value = true
}

function editPayment(row) {
  isEditing.value = true
  form.value = JSON.parse(JSON.stringify(row))
  // Re-fetch invoices if editing draft to allow re-allocation
  if (row.supplier) {
    onSupplierChange(row.supplier)
  }
  dialogVisible.value = true
}

function openAllocation() {
  allocationDialogVisible.value = true
}

function onAllocationConfirm(allocations) {
  form.value.allocations = allocations
}

const totalAllocated = computed(() => {
  return form.value.allocations.reduce((sum, a) => sum + a.amount, 0)
})

function getInvoiceNumber(invId) {
  const inv = openInvoices.value.find((i) => i.id === invId)
  return inv ? inv.doc_number : invId
}

async function savePayment(targetStatus) {
  saving.value = true
  try {
    const supplierId = form.value.supplier?.id || form.value.supplier_id
    if (!supplierId || !form.value.amount) {
      $q.notify({ type: 'warning', message: 'Supplier and Amount required' })
      return
    }
    let paymentId = form.value.id
    if (!paymentId) {
      const pay = await createPayment({
        doc_date: form.value.doc_date,
        supplier_id: supplierId,

        // @ts-ignore
        payment_method: form.value.payment_method?.toLowerCase().replace(' ', '_') || 'cash',
        reference_no: form.value.reference || null,
        total_amount: form.value.amount,
        remarks: form.value.remarks || null,
      })
      paymentId = pay.id
      $q.notify({ type: 'info', message: `Payment ${pay.doc_number} Created` })
    }
    if (form.value.allocations.length > 0) {
      await allocatePayment(paymentId, form.value.allocations)
    }
    if (targetStatus === 'posted') {
      const res = await postPayment(paymentId)
      if (!res.success) throw new Error(res.error || 'Post failed')
      $q.notify({ type: 'positive', message: `Payment ${res.doc_number} Posted` })
    } else {
      $q.notify({ type: 'positive', message: 'Payment Saved as Draft' })
    }
    dialogVisible.value = false
    fetchPayments()
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Failed', caption: e.message })
  } finally {
    saving.value = false
  }
}

function cancelPayment() {}
function printPayment() {}
</script>
