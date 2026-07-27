<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="menu_book" size="md" color="primary" class="q-mr-sm" />
      <div class="text-h5 text-weight-bold">Cashbook</div>
    </div>
    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-md-3"><q-input v-model="filters.date_from" label="From" outlined dense type="date" @update:model-value="load" /></div>
      <div class="col-12 col-md-3"><q-input v-model="filters.date_to" label="To" outlined dense type="date" @update:model-value="load" /></div>
      <div class="col-12 col-md-3">
        <q-select v-model="filters.source_type" label="Source" outlined dense clearable emit-value map-options
          :options="sourceOptions" @update:model-value="load" />
      </div>
      <div class="col-12 col-md-3">
        <q-btn-dropdown color="primary" icon="download" label="Export" class="full-width" unelevated>
          <q-list>
            <q-item clickable v-close-popup @click="exportToCsv">
              <q-item-section avatar><q-icon name="description" /></q-item-section>
              <q-item-section>Export to CSV</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="exportToExcel">
              <q-item-section avatar><q-icon name="table_view" /></q-item-section>
              <q-item-section>Export to Excel</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="exportToPdf">
              <q-item-section avatar><q-icon name="picture_as_pdf" /></q-item-section>
              <q-item-section>Export to PDF</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
      </div>
    </div>
    <CashbookTable :rows="cashbookStore.entries" :loading="cashbookStore.loading" />
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useFinanceCashbookStore } from '../stores/finance-cashbook.store'
import CashbookTable from '../components/CashbookTable.vue'
import { exportTableToCSV, exportTableToExcel, exportTableToPDF } from 'src/services/exportService'

const cashbookStore = useFinanceCashbookStore()
const filters = ref({ date_from: '', date_to: '', source_type: null })
const sourceOptions = [
  { label: 'POS Dine-In', value: 'pos_dine_in' }, { label: 'POS Takeaway', value: 'pos_takeaway' },
  { label: 'Delivery', value: 'delivery' }, { label: 'Pay Voucher', value: 'pay_voucher' },
  { label: 'Received Voucher', value: 'received_voucher' }, { label: 'Invoice', value: 'invoice' },
  { label: 'Petty Cash', value: 'petty_cash' }, { label: 'Bank Transfer', value: 'bank_transfer' },
]

const columns = [
  { name: 'entry_date', label: 'Date', field: 'entry_date' },
  { name: 'source_type', label: 'Source', field: 'source_type' },
  { name: 'description', label: 'Description', field: 'description' },
  { name: 'debit_amount', label: 'Debit (LKR)', field: 'debit_amount' },
  { name: 'credit_amount', label: 'Credit (LKR)', field: 'credit_amount' },
  { name: 'running_balance', label: 'Balance', field: 'running_balance' },
]

async function load() { await cashbookStore.fetchCashbook(filters.value) }

async function exportToCsv() {
  exportTableToCSV(columns, cashbookStore.entries, 'Cashbook_Report')
}

async function exportToExcel() {
  exportTableToExcel(columns, cashbookStore.entries, 'Cashbook_Report')
}

async function exportToPdf() {
  let subtitle = ''
  if (filters.value.date_from || filters.value.date_to) {
    subtitle = `Period: ${filters.value.date_from || 'Start'} to ${filters.value.date_to || 'End'}`
  }
  await exportTableToPDF(columns, cashbookStore.entries, 'Cashbook Report', subtitle)
}

onMounted(load)
</script>
