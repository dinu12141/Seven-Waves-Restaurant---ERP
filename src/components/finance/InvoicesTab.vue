<template>
  <div>
    <DataTable
      title="Invoices"
      :rows="store.dailyInvoices"
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
import { useFinanceStore } from 'src/stores/financeStore'
import DataTable from 'components/common/DataTable.vue'
import StatusChip from 'components/common/StatusChip.vue'

const store = useFinanceStore()

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

// invoices removed as it's now coming from store
</script>
