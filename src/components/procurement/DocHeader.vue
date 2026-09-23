<template>
  <div class="q-mb-md">
    <div class="row q-col-gutter-md">
      <!-- Top Row: Doc Type/Number & Status -->
      <div class="col-12 row items-center justify-between">
        <div class="text-h5 text-weight-bold row items-center q-gutter-x-sm">
          <q-icon :name="icon" size="sm" color="primary" />
          <span>{{ title }}</span>
          <span v-if="!editableDocNumber" class="text-grey-6 text-subtitle1">{{ docNumber || '(New)' }}</span>
          <span v-else-if="docNumber" class="text-grey-7 text-subtitle1 font-mono"># {{ docNumber }}</span>
          <span v-else class="text-grey-5 text-subtitle2 text-weight-regular">(Enter Bill No)</span>
        </div>
        <q-chip :color="statusColor" text-color="white" class="text-uppercase text-weight-bold">
          {{ statusLabel }}
        </q-chip>
      </div>

      <!-- Fields Row -->
      <div class="col-12 col-md-3" v-if="editableDocNumber">
        <q-input
          v-if="!readOnly"
          :model-value="docNumber"
          @update:model-value="$emit('update:docNumber', $event)"
          :label="docNumberLabel"
          placeholder="e.g. INV-10024"
          outlined
          dense
          maxlength="50"
          :rules="[
            (val) => !!val?.trim() || 'GRN / Bill No is required',
            (val) => (val || '').trim().length <= 50 || 'Max 50 characters allowed',
            (val) => !/[<>]/.test(val) || 'Invalid characters (< or > not allowed)',
          ]"
        >
          <template v-slot:prepend>
            <q-icon name="receipt" color="primary" size="xs" />
          </template>
        </q-input>
        <q-input v-else :model-value="docNumber" :label="docNumberLabel" outlined dense readonly>
          <template v-slot:prepend>
            <q-icon name="receipt" color="grey-6" size="xs" />
          </template>
        </q-input>
      </div>

      <div :class="editableDocNumber ? 'col-12 col-md-4' : 'col-12 col-md-4'">
        <q-select
          v-if="!readOnly"
          :model-value="supplier"
          @update:model-value="$emit('update:supplier', $event)"
          :options="supplierOptions"
          option-label="name"
          option-value="id"
          label="Supplier"
          outlined
          dense
          :rules="[(val) => !!val || 'Supplier is required']"
        >
          <template v-slot:option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>
                  {{ scope.opt.name }}
                  <q-badge v-if="scope.opt.tax_id" color="primary" class="q-ml-sm" dense>TAX</q-badge>
                </q-item-label>
                <q-item-label caption>Bal: {{ scope.opt.balance }} | Limit: {{ scope.opt.credit_limit }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
          <template v-slot:selected-item="scope">
            <div class="row items-center q-gutter-x-sm">
              <span>{{ scope.opt.name }}</span>
              <q-badge v-if="scope.opt.tax_id" color="primary" dense>TAX</q-badge>
            </div>
          </template>
        </q-select>
        <q-input v-else :model-value="supplier?.name" label="Supplier" outlined dense readonly>
          <template v-slot:append>
            <q-badge v-if="supplier?.tax_id" color="primary" dense>TAX</q-badge>
          </template>
        </q-input>
      </div>

      <div :class="editableDocNumber ? 'col-12 col-md-2' : 'col-12 col-md-3'">
        <q-input
          :model-value="docDate"
          @update:model-value="$emit('update:docDate', $event)"
          label="Date"
          type="date"
          outlined
          dense
          :readonly="readOnly"
        />
      </div>

      <div class="col-12 col-md-3" v-if="showExpectedDate">
        <q-input
          :model-value="expectedDate"
          @update:model-value="$emit('update:expectedDate', $event)"
          label="Expected Date"
          type="date"
          outlined
          dense
          :readonly="readOnly"
        />
      </div>

      <div :class="editableDocNumber ? 'col-12 col-md-3' : 'col-12 col-md-2'" v-if="warehouseOptions">
        <q-select
          v-if="!readOnly"
          :model-value="warehouse"
          @update:model-value="$emit('update:warehouse', $event)"
          :options="warehouseOptions"
          option-label="name"
          option-value="id"
          label="Warehouse"
          outlined
          dense
        />
        <q-input v-else :model-value="warehouse?.name" label="Warehouse" outlined dense readonly />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  icon: { type: String, required: true },
  docNumber: { type: String, required: false },
  editableDocNumber: { type: Boolean, default: false },
  docNumberLabel: { type: String, default: 'GRN / Bill No *' },
  status: { type: String, required: true },
  docDate: { type: String, required: true },
  expectedDate: { type: String, required: false },
  supplier: { type: Object, required: false },
  supplierOptions: { type: Array, required: false },
  warehouse: { type: Object, required: false },
  warehouseOptions: { type: Array, required: false },
  readOnly: { type: Boolean, required: false },
  showExpectedDate: { type: Boolean, required: false },
})

defineEmits(['update:supplier', 'update:docDate', 'update:expectedDate', 'update:warehouse', 'update:docNumber'])

const statusColor = computed(() => {
  switch (props.status) {
    case 'draft':
      return 'grey'
    case 'open':
    case 'approved':
      return 'blue'
    case 'posted':
      return 'blue-7'
    case 'closed':
      return 'green-10'
    case 'cancelled':
      return 'red'
    case 'partial':
    case 'partial_paid':
      return 'orange'
    case 'paid':
      return 'green'
    default:
      return 'grey'
  }
})

const statusLabel = computed(() => {
  switch (props.status) {
    case 'partial_paid': return 'PARTIAL PAID'
    case 'draft':        return 'DRAFT'
    case 'posted':       return 'POSTED'
    case 'paid':         return 'PAID ✓'
    case 'cancelled':    return 'CANCELLED'
    case 'closed':       return 'CLOSED'
    case 'approved':     return 'APPROVED'
    default:             return (props.status || '').toUpperCase()
  }
})
</script>
