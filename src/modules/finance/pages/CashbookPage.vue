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
      <div class="col-12 col-md-3"><q-btn color="primary" icon="picture_as_pdf" label="Export" unelevated class="full-width" @click="exportPdf" /></div>
    </div>
    <CashbookTable :rows="cashbookStore.entries" :loading="cashbookStore.loading" />
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useFinanceCashbookStore } from '../stores/finance-cashbook.store'
import CashbookTable from '../components/CashbookTable.vue'

const cashbookStore = useFinanceCashbookStore()
const filters = ref({ date_from: '', date_to: '', source_type: null })
const sourceOptions = [
  { label: 'POS Dine-In', value: 'pos_dine_in' }, { label: 'POS Takeaway', value: 'pos_takeaway' },
  { label: 'Delivery', value: 'delivery' }, { label: 'Pay Voucher', value: 'pay_voucher' },
  { label: 'Received Voucher', value: 'received_voucher' }, { label: 'Invoice', value: 'invoice' },
  { label: 'Petty Cash', value: 'petty_cash' }, { label: 'Bank Transfer', value: 'bank_transfer' },
]

async function load() { await cashbookStore.fetchCashbook(filters.value) }
function exportPdf() { window.print() }
onMounted(load)
</script>
