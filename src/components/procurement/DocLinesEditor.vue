<template>
  <q-table
    :rows="lines"
    :columns="columns"
    row-key="id"
    dense
    flat
    bordered
    :hide-bottom="true"
    :pagination="{ rowsPerPage: 0 }"
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
            :option-label="(opt) => opt.display_name || opt.name"
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

        <!-- UOM: Select (Editable) or Text (Readonly) -->
        <q-td key="uom" :props="props" style="min-width: 130px">
          <div v-if="readOnly || !allowEditUom || !uomOptions || uomOptions.length === 0">
            {{ props.row.uom_name || getUomName(props.row.uom_id) }}
          </div>
          <q-select
            v-else
            v-model="props.row.uom_id"
            :options="uomOptions"
            option-label="name"
            option-value="id"
            dense
            borderless
            emit-value
            map-options
            @update:model-value="(val) => {
              const selectedUom = uomOptions.find(opt => opt.id === val)
              if (selectedUom) {
                props.row.uom_name = selectedUom.name || selectedUom.code
              }
              $emit('uom-change', props.row, selectedUom)
            }"
          />
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
            @update:model-value="recalcLine(props.row)"
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
            @update:model-value="onPriceChange(props.row)"
          />
        </q-td>

        <!-- Discount Column (Percentage or Fixed Amount) -->
        <q-td key="discount" :props="props" v-if="showDiscount" style="min-width: 160px">
          <!-- Editable Mode -->
          <div v-if="!readOnly" class="row items-center no-wrap q-gutter-x-xs justify-end">
            <q-btn-toggle
              v-model="props.row.discount_type"
              :options="[
                { label: '%', value: 'percentage' },
                { label: 'Fix', value: 'amount' }
              ]"
              size="xs"
              dense
              unelevated
              toggle-color="primary"
              color="grey-3"
              text-color="grey-8"
              class="border text-weight-bold"
              style="font-size: 10px"
              @update:model-value="recalcLine(props.row)"
            />
            <q-input
              v-model.number="props.row.discount_value"
              type="number"
              dense
              borderless
              style="width: 70px"
              input-class="text-right text-weight-medium q-px-xs"
              :min="0"
              :max="props.row.discount_type === 'percentage' ? 100 : undefined"
              @update:model-value="recalcLine(props.row)"
            />
          </div>

          <!-- Readonly View -->
          <div v-else class="text-right">
            <span v-if="!props.row.discount_value || props.row.discount_value === 0" class="text-grey-5">-</span>
            <div v-else>
              <span class="text-weight-bold text-negative">
                {{ props.row.discount_type === 'percentage' ? `${props.row.discount_value}%` : formatCurrency(props.row.discount_value) }}
              </span>
              <div v-if="props.row.discount_type === 'percentage' && props.row.discount_amount" class="text-caption text-grey-6" style="font-size: 11px">
                -{{ formatCurrency(props.row.discount_amount) }}
              </div>
            </div>
          </div>
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
  uomOptions: { type: Array, required: false, default: () => [] },
  title: { type: String, required: false },
  allowAdd: { type: Boolean, required: false },
  allowEditItem: { type: Boolean, required: false },
  allowEditUom: { type: Boolean, required: false, default: true },
})

defineEmits(['add-line', 'remove-line', 'item-change', 'uom-change', 'price-change'])

// Recalculate line total when quantity, price, or discount changes
function recalcLine(row) {
  const qty = Number(row.quantity) || 0
  const price = Number(row.unit_price ?? row.unit_cost ?? 0)
  const gross = qty * price

  if (!row.discount_type) {
    row.discount_type = 'percentage'
  }

  // Support legacy 'discount' field from PO/Invoice
  if (row.discount_value === undefined && row.discount !== undefined) {
    row.discount_value = row.discount
  }

  const val = Math.max(0, Number(row.discount_value) || 0)
  let discAmt = 0

  if (row.discount_type === 'percentage') {
    const clampedPct = Math.min(100, val)
    discAmt = (gross * clampedPct) / 100
    row.discount = clampedPct
    row.discount_value = clampedPct
  } else {
    discAmt = Math.min(gross, val)
    row.discount_value = discAmt
    row.discount = gross > 0 ? (discAmt / gross) * 100 : 0
  }

  row.discount_amount = Math.round(discAmt * 100) / 100
  row.line_total = Math.max(0, Math.round((gross - row.discount_amount) * 100) / 100)
}

// When user manually edits unit_price, sync unit_cost and recalculate total
function onPriceChange(row) {
  row.unit_cost = row.unit_price
  recalcLine(row)
}

const getUomName = (uomId) => {
  if (!uomId) return ''
  const found = (props.uomOptions || []).find((u) => u.id === uomId)
  return found?.name || found?.code || ''
}

const showPrice = computed(() => ['PO', 'GRN', 'INVOICE', 'RETURN'].includes(props.mode))
const showDiscount = computed(() => ['PO', 'GRN', 'INVOICE'].includes(props.mode))

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
    cols.push({ name: 'discount', label: 'Discount', align: 'right', field: 'discount_value', minWidth: 160 })
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
