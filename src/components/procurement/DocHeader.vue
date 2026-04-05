<template>
  <div class="q-mb-md">
    <div class="row q-col-gutter-md">
      <!-- Top Row: Doc Type/Number & Status -->
      <div class="col-12 row items-center justify-between">
        <div class="text-h5 text-weight-bold row items-center q-gutter-x-sm">
          <q-icon :name="icon" size="sm" color="primary" />
          <span>{{ title }}</span>
          <span class="text-grey-6 text-subtitle1">{{ docNumber || '(New)' }}</span>
        </div>
        <q-chip :color="statusColor" text-color="white" class="text-uppercase text-weight-bold">
          {{ statusLabel }}
        </q-chip>
      </div>

      <!-- Fields Row -->
      <div class="col-12 col-md-4">
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
                <q-item-label>{{ scope.opt.name }}</q-item-label>
                <q-item-label caption
                  >Bal: {{ scope.opt.balance }} | Limit: {{ scope.opt.credit_limit }}</q-item-label
                >
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <q-input v-else :model-value="supplier?.name" label="Supplier" outlined dense readonly />
      </div>

      <div class="col-12 col-md-3">
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

      <div class="col-12 col-md-2" v-if="warehouseOptions">
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

defineEmits(['update:supplier', 'update:docDate', 'update:expectedDate', 'update:warehouse'])

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
