<template>
  <BaseDataGrid
    :columns="columns"
    :rows="movements"
    :loading="loading"
    :actions="gridActions"
    storage-key="inventory-movements"
    search-placeholder="Search by item, type, reference..."
    no-data-label="No movement records found"
    :title="title"
    subtitle="Inventory stock movements"
    @view="$emit('view', $event)"
  >
    <!-- Custom qty cell with +/- prefix and color -->
    <template #cell-quantity="{ row }">
      <span
        class="bdg-qty"
        :class="{
          'bdg-qty--positive': row.type === 'IN',
          'bdg-qty--negative': row.type === 'OUT' || row.type === 'WASTAGE',
          'bdg-qty--warning': row.type === 'ADJUSTMENT',
        }"
      >
        {{ row.type === 'OUT' || row.type === 'WASTAGE' ? '−' : '+' }}{{ row.quantity }}
        <span class="bdg-unit">{{ row.unit }}</span>
      </span>
    </template>
  </BaseDataGrid>
</template>

<script setup>
import BaseDataGrid from 'components/common/BaseDataGrid.vue'

defineProps({
  title: {
    type: String,
    default: 'Movement History',
  },
  movements: {
    type: Array,
    default: () => [
      {
        id: 1,
        date: '2024-02-17T10:30:00',
        item: 'Tomato',
        type: 'IN',
        quantity: 50,
        unit: 'kg',
        reason: 'Purchase Order #1234',
        performedBy: 'Admin',
      },
      {
        id: 2,
        date: '2024-02-17T11:15:00',
        item: 'Onion',
        type: 'OUT',
        quantity: 5,
        unit: 'kg',
        reason: 'Kitchen Use',
        performedBy: 'Chef John',
      },
      {
        id: 3,
        date: '2024-02-16T18:45:00',
        item: 'Cheese',
        type: 'WASTAGE',
        quantity: 2,
        unit: 'kg',
        reason: 'Expired',
        performedBy: 'Manager',
      },
      {
        id: 4,
        date: '2024-02-16T09:00:00',
        item: 'Flour',
        type: 'IN',
        quantity: 100,
        unit: 'kg',
        reason: 'Purchase Order #1230',
        performedBy: 'Admin',
      },
      {
        id: 5,
        date: '2024-02-15T14:20:00',
        item: 'Chicken',
        type: 'ADJUSTMENT',
        quantity: 2,
        unit: 'kg',
        reason: 'Stock Take Correction',
        performedBy: 'Manager',
      },
    ],
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['view'])

const columns = [
  {
    name: 'date',
    label: 'Date & Time',
    field: 'date',
    type: 'datetime',
    sortable: true,
    minWidth: 130,
  },
  {
    name: 'item',
    label: 'Item',
    field: 'item',
    type: 'text',
    sortable: true,
    minWidth: 140,
  },
  {
    name: 'type',
    label: 'Type',
    field: 'type',
    type: 'status',
    align: 'center',
    sortable: true,
    width: 100,
  },
  {
    name: 'quantity',
    label: 'Quantity',
    field: 'quantity',
    type: 'number',
    align: 'right',
    sortable: true,
    width: 120,
  },
  {
    name: 'reason',
    label: 'Reason / Reference',
    field: 'reason',
    type: 'text',
    minWidth: 200,
    hideable: true,
  },
  {
    name: 'performedBy',
    label: 'Performed By',
    field: 'performedBy',
    type: 'text',
    sortable: true,
    hideable: true,
  },
]

const gridActions = [{ event: 'view', icon: 'visibility', label: 'View details' }]
</script>

<style scoped>
.bdg-qty {
  font-family: 'SF Mono', 'Roboto Mono', monospace;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.bdg-qty--positive {
  color: var(--erp-success);
}
.bdg-qty--negative {
  color: var(--erp-danger);
}
.bdg-qty--warning {
  color: var(--erp-warning);
}

.bdg-unit {
  font-size: 11px;
  font-weight: 400;
  color: var(--erp-text-secondary);
  margin-left: 3px;
}
</style>
