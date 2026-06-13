<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="savings" size="md" color="orange" class="q-mr-sm" />
      <div class="text-h5 text-weight-bold">Petty Cash Book</div>
    </div>
    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-md-3"><q-input v-model="filters.date_from" label="From" outlined dense type="date" @update:model-value="load" /></div>
      <div class="col-12 col-md-3"><q-input v-model="filters.date_to" label="To" outlined dense type="date" @update:model-value="load" /></div>
    </div>
    <q-table flat bordered :rows="cashbookStore.pettyCashEntries" :columns="columns" row-key="id" :loading="cashbookStore.loading" :pagination="{ rowsPerPage: 25 }">
      <template v-slot:body-cell-debit_amount="p"><q-td :props="p" class="text-red-8">{{ p.value > 0 ? 'LKR ' + Number(p.value).toLocaleString() : '' }}</q-td></template>
      <template v-slot:body-cell-credit_amount="p"><q-td :props="p" class="text-green-8">{{ p.value > 0 ? 'LKR ' + Number(p.value).toLocaleString() : '' }}</q-td></template>
      <template v-slot:body-cell-running_balance="p"><q-td :props="p" class="text-weight-bold">LKR {{ Number(p.value).toLocaleString() }}</q-td></template>
    </q-table>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useFinanceCashbookStore } from '../stores/finance-cashbook.store'
const cashbookStore = useFinanceCashbookStore()
const filters = ref({ date_from: '', date_to: '' })
const columns = [
  { name: 'entry_date', label: 'Date', field: 'entry_date', align: 'left', sortable: true },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'debit_amount', label: 'Outgoing', field: 'debit_amount', align: 'right' },
  { name: 'credit_amount', label: 'Incoming', field: 'credit_amount', align: 'right' },
  { name: 'running_balance', label: 'Balance', field: 'running_balance', align: 'right' },
]
async function load() { await cashbookStore.fetchPettyCash(filters.value) }
onMounted(load)
</script>
