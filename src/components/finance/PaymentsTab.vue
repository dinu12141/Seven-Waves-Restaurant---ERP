<template>
  <div>
    <DataTable title="Payments" :rows="payments" :columns="columns" :filter="filter">
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
import DataTable from 'components/common/DataTable.vue'
import StatusChip from 'components/common/StatusChip.vue'

const filter = ref('')

const columns = [
  { name: 'id', label: 'Reference ID', align: 'left', field: 'referenceId', sortable: true },
  { name: 'date', label: 'Date', align: 'left', field: 'date', sortable: true },
  { name: 'invoice', label: 'Invoice #', align: 'left', field: 'invoiceNumber' },
  { name: 'method', label: 'Method', align: 'left', field: 'method', sortable: true },
  { name: 'amount', label: 'Amount', align: 'right', field: 'amount', sortable: true },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
]

const payments = ref([
  {
    id: 1,
    referenceId: 'PAY-8821',
    date: '2023-10-25 12:35 PM',
    invoiceNumber: 'INV-1001',
    method: 'Cash',
    amount: 'LKR 4,550.00',
    status: 'Completed',
  },
  {
    id: 2,
    referenceId: 'PAY-8822',
    date: '2023-10-25 02:50 PM',
    invoiceNumber: 'INV-1003',
    method: 'Credit Card',
    amount: 'LKR 8,520.00',
    status: 'Completed',
  },
  {
    id: 3,
    referenceId: 'PAY-8823',
    date: '2023-10-24 08:20 PM',
    invoiceNumber: 'INV-1005',
    method: 'Online',
    amount: 'LKR 6,500.00',
    status: 'Completed',
  },
  {
    id: 4,
    referenceId: 'PAY-8824',
    date: '2023-10-24 09:00 PM',
    invoiceNumber: 'INV-1006',
    method: 'Debit Card',
    amount: 'LKR 20,000.00',
    status: 'Failed',
  },
])

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
