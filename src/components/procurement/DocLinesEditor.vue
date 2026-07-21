<template>
  <q-table
    :rows="lines"
    :columns="columns"
    row-key="id"
    dense
    flat
    bordered
    :hide-bottom="true"
    separator="cell"
  >
    <!-- Header Slot for Add Button -->
    <template v-slot:top>
      <div class="text-h6">{{ title }}</div>
      <q-space />
      <q-btn
        v-if="!readOnly && allowAdd"
        color="primary"
        icon="add"
        label="Add Line"
        @click="$emit('add-line')"
        size="sm"
      />
    </template>

    <!-- Body Slot for Inline Editing -->
    <template v-slot:body="props">
      <q-tr :props="props">
        <!-- Line Number -->
        <q-td key="line_number" :props="props">
          {{ props.row.line_number }}
        </q-td>

        <!-- Item: Select (Editable) or Text (Readonly) -->
        <q-td key="item" :props="props" style="min-width: 200px">
          <div v-if="readOnly || !allowEditItem">{{ props.row.item_name }}</div>
          <q-select
            v-else
            v-model="props.row.item_id"
            :options="itemOptions"
            option-label="name"
            option-value="id"
            dense
            borderless
            emit-value
            map-options
            @update:model-value="(val) => {
              const selectedItem = itemOptions.find(opt => opt.id === val)
              $emit('item-change', props.row, selectedItem)
            }"
          />
        </q-td>

        <!-- UOM -->
        <q-td key="uom" :props="props">
          {{ props.row.uom_name }}
        </q-td>

        <!-- Quantity -->
        <q-td key="quantity" :props="props" style="width: 100px">
          <div v-if="readOnly">{{ props.row.quantity }}</div>
          <q-input
            v-else
            v-model.number="props.row.quantity"
            type="number"
            dense
            borderless
            input-class="text-right"
            :min="0"
          />
        </q-td>

        <!-- Unit Price (Only for PO/Invoice) -->
        <q-td key="unit_price" :props="props" v-if="showPrice" style="width: 120px">
          <div v-if="readOnly">{{ formatCurrency(props.row.unit_price) }}</div>
          <q-input
            v-else
            v-model.number="props.row.unit_price"
            type="number"
            dense
            borderless
            input-class="text-right"
            :min="0"
          />
        </q-td>

        <!-- Discount (Optional) -->
        <q-td key="discount" :props="props" v-if="showDiscount">
          <q-input
            v-if="!readOnly"
            v-model.number="props.row.discount"
            type="number"
            dense
            borderless
            input-class="text-right"
          />
          <span v-else>{{ props.row.discount }}%</span>
        </q-td>

        <!-- Total -->
        <q-td key="line_total" :props="props" class="text-right text-weight-bold">
          {{ formatCurrency(props.row.line_total) }}
        </q-td>

        <!-- Actions -->
        <q-td key="actions" :props="props" v-if="!readOnly">
          <q-btn
            icon="delete"
            color="negative"
            flat
            dense
            size="sm"
            @click="$emit('remove-line', props.rowIndex)"
          />
        </q-td>
      </q-tr>
    </template>
  </q-table>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  lines: { type: Array, required: true },
  mode: { type: String, required: true }, // 'PO' | 'GRN' | 'INVOICE' | 'RETURN'
  readOnly: { type: Boolean, required: false },
  itemOptions: { type: Array, required: false },
  title: { type: String, required: false },
  allowAdd: { type: Boolean, required: false },
  allowEditItem: { type: Boolean, required: false },
})

defineEmits(['add-line', 'remove-line', 'item-change'])

const showPrice = computed(() => ['PO', 'INVOICE', 'RETURN'].includes(props.mode))
const showDiscount = computed(() => ['PO', 'INVOICE'].includes(props.mode))

// @ts-ignore
const columns = computed(() => {
  const cols = [
    { name: 'line_number', label: '#', align: 'left', field: 'line_number' },
    { name: 'item', label: 'Item', align: 'left', field: 'item_name' },
    { name: 'uom', label: 'UOM', align: 'left', field: 'uom_name' },
    { name: 'quantity', label: 'Qty', align: 'right', field: 'quantity' },
  ]
  if (showPrice.value) {
    cols.push({ name: 'unit_price', label: 'Unit Price', align: 'right', field: 'unit_price' })
  }
  if (showDiscount.value) {
    cols.push({ name: 'discount', label: 'Disc %', align: 'right', field: 'discount' })
  }
  cols.push({ name: 'line_total', label: 'Total', align: 'right', field: 'line_total' })
  if (!props.readOnly) {
    cols.push({ name: 'actions', label: '', align: 'center', field: 'actions' })
  }
  return cols
})

const formatCurrency = (val) => {
  return (val || 0).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })
}
</script>
