<template>
  <div>
    <DataTable
      title="Invoices"
      :rows="invoices"
      :columns="columns"
      :filter="filter"
      :loading="loading"
    >
      <template #top-right>
        <q-btn color="primary" icon="add" label="New Invoice" class="q-mr-sm" />
        <q-input dense outlined v-model="filter" placeholder="Search invoices..." dark>
          <template v-slot:append>
            <q-icon name="search" />
          </template>
        </q-input>
      </template>

      <template #body-cell-status="props">
        <q-td :props="props">
          <StatusChip :status="props.value" />
        </q-td>
      </template>

      <template #body-cell-amount="props">
        <q-td :props="props">
          <div class="text-weight-bold">{{ props.value }}</div>
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat round dense icon="visibility" color="grey-5" size="sm" />
          <q-btn flat round dense icon="print" color="grey-5" size="sm" />
          <q-btn flat round dense icon="more_vert" color="grey-5" size="sm" />
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
const loading = ref(false)

const columns = [
  { name: 'id', label: 'Invoice #', align: 'left', field: 'invoiceNumber', sortable: true },
  { name: 'date', label: 'Date', align: 'left', field: 'date', sortable: true },
  { name: 'customer', label: 'Customer', align: 'left', field: 'customer' },
  { name: 'amount', label: 'Amount', align: 'right', field: 'amount', sortable: true },
  { name: 'status', label: 'Status', align: 'center', field: 'status', sortable: true },
  { name: 'actions', label: 'Actions', align: 'right', field: 'actions' },
]

const invoices = ref([
  {
    id: 1,
    invoiceNumber: 'INV-1001',
    date: '2023-10-25 12:30 PM',
    customer: 'Walk-in Customer',
    amount: 'LKR 4,550.00',
    status: 'Paid',
  },
  {
    id: 2,
    invoiceNumber: 'INV-1002',
    date: '2023-10-25 01:15 PM',
    customer: 'John Doe',
    amount: 'LKR 12,000.00',
    status: 'Pending',
  },
  {
    id: 3,
    invoiceNumber: 'INV-1003',
    date: '2023-10-25 02:45 PM',
    customer: 'Table 5',
    amount: 'LKR 8,500.00',
    status: 'Paid',
  },
  {
    id: 4,
    invoiceNumber: 'INV-1004',
    date: '2023-10-24 07:30 PM',
    customer: 'Sarah Smith',
    amount: 'LKR 21,000.00',
    status: 'Cancelled',
  },
  {
    id: 5,
    invoiceNumber: 'INV-1005',
    date: '2023-10-24 08:15 PM',
    customer: 'Table 12',
    amount: 'LKR 6,500.00',
    status: 'Paid',
  },
])
</script>
