<template>
  <div>
    <DataTable title="Payments" :rows="store.dailyPayments" :columns="columns" :filter="filter">
      <template #top-right>
        <q-input dense outlined v-model="filter" placeholder="Search payments..." dark>
          <template v-slot:append>
            <q-icon name="search" />
          </template>
        </q-input>
      </template>

      <template #body-cell-method="props">
        <q-td :props="props">
          <q-chip
            dense
            :color="getPaymentMethodColor(props.value)"
            text-color="white"
            :icon="getPaymentMethodIcon(props.value)"
          >
            {{ props.value }}
          </q-chip>
        </q-td>
      </template>

      <template #body-cell-status="props">
        <q-td :props="props">
          <StatusChip :status="props.value" />
        </q-td>
      </template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useFinanceStore } from 'src/stores/financeStore'
import DataTable from 'components/common/DataTable.vue'
import StatusChip from 'components/common/StatusChip.vue'

const store = useFinanceStore()

const filter = ref('')

const columns = [
  { name: 'id', label: 'Reference ID', align: 'left', field: 'id', sortable: true },
  { name: 'date', label: 'Date', align: 'left', field: 'created_at', sortable: true },
  { name: 'invoice', label: 'Invoice #', align: 'left', field: (row) => row.invoice_id },
  { name: 'method', label: 'Method', align: 'left', field: 'payment_method_id', sortable: true },
  { name: 'amount', label: 'Amount', align: 'right', field: 'amount', sortable: true },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
]

// payments removed as it's now coming from store

const getPaymentMethodColor = (method) => {
  switch (method) {
    case 'Cash':
      return 'green'
    case 'Credit Card':
      return 'blue'
    case 'Debit Card':
      return 'blue-8'
    case 'Online':
      return 'orange'
    default:
      return 'grey'
  }
}

const getPaymentMethodIcon = (method) => {
  switch (method) {
    case 'Cash':
      return 'payments'
    case 'Credit Card':
      return 'credit_card'
    case 'Debit Card':
      return 'credit_card'
    case 'Online':
      return 'qr_code'
    default:
      return 'attach_money'
  }
}
</script>
