<template>
  <q-table flat bordered dense :rows="rows" :columns="columns" row-key="id" :loading="loading"
    :pagination="{ rowsPerPage: 25 }" class="finance-cashbook-table">
    <template v-slot:top>
      <div class="text-h6 q-mr-md"><q-icon name="book" class="q-mr-sm" />Cashbook</div>
      <q-space />
      <div class="text-subtitle2 q-mr-md">
        <span class="text-green-8">Credit: LKR {{ totalCredit.toLocaleString() }}</span> |
        <span class="text-red-8">Debit: LKR {{ totalDebit.toLocaleString() }}</span> |
        <strong>Balance: LKR {{ balance.toLocaleString() }}</strong>
      </div>
    </template>
    <template v-slot:body-cell-debit_amount="props">
      <q-td :props="props" class="text-red-8 text-weight-bold">{{ props.value > 0 ? Number(props.value).toLocaleString() : '' }}</q-td>
    </template>
    <template v-slot:body-cell-credit_amount="props">
      <q-td :props="props" class="text-green-8 text-weight-bold">{{ props.value > 0 ? Number(props.value).toLocaleString() : '' }}</q-td>
    </template>
    <template v-slot:body-cell-running_balance="props">
      <q-td :props="props" class="text-weight-bold">LKR {{ Number(props.value).toLocaleString() }}</q-td>
    </template>
    <template v-slot:body-cell-source_type="props">
      <q-td :props="props"><q-badge :color="sourceColor(props.value)">{{ props.value?.replace(/_/g, ' ') }}</q-badge></q-td>
    </template>
  </q-table>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ rows: { type: Array, default: () => [] }, loading: Boolean })

const totalDebit = computed(() => props.rows.reduce((s, e) => s + Number(e.debit_amount), 0))
const totalCredit = computed(() => props.rows.reduce((s, e) => s + Number(e.credit_amount), 0))
const balance = computed(() => totalCredit.value - totalDebit.value)

const columns = [
  { name: 'entry_date', label: 'Date', field: 'entry_date', align: 'left', sortable: true },
  { name: 'source_type', label: 'Source', field: 'source_type', align: 'left' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'debit_amount', label: 'Debit (LKR)', field: 'debit_amount', align: 'right', sortable: true },
  { name: 'credit_amount', label: 'Credit (LKR)', field: 'credit_amount', align: 'right', sortable: true },
  { name: 'running_balance', label: 'Balance', field: 'running_balance', align: 'right' },
]

function sourceColor(type) {
  const map = { pos_dine_in: 'green', pos_takeaway: 'teal', delivery: 'cyan', pay_voucher: 'red', received_voucher: 'blue', petty_cash: 'orange', bank_transfer: 'purple', invoice: 'indigo', manual_adjustment: 'grey' }
  return map[type] || 'grey'
}
</script>
