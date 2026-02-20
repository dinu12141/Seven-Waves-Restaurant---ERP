<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 700px; max-width: 80vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Allocate Payment</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-12 col-md-6">
            <q-input
              :model-value="totalPayment"
              label="Total Payment Amount"
              outlined
              dense
              readonly
            />
          </div>
          <div class="col-12 col-md-6">
            <q-input
              :model-value="remainingToAllocate"
              label="Remaining to Allocate"
              outlined
              dense
              readonly
              :color="remainingToAllocate < 0 ? 'negative' : 'primary'"
            />
          </div>
        </div>

        <q-table :rows="localInvoices" :columns="columns" row-key="id" dense flat bordered>
          <template v-slot:body="props">
            <q-tr :props="props">
              <q-td key="doc_number" :props="props">{{ props.row.doc_number }}</q-td>
              <q-td key="doc_date" :props="props">{{ props.row.doc_date }}</q-td>
              <q-td key="balance_due" :props="props" class="text-right">{{
                formatCurrency(props.row.balance_due)
              }}</q-td>
              <q-td key="allocation" :props="props" style="width: 150px">
                <q-input
                  v-model.number="props.row.allocation"
                  type="number"
                  dense
                  outlined
                  input-class="text-right"
                  :min="0"
                  :max="props.row.balance_due"
                  @update:model-value="recalcTotal"
                />
              </q-td>
            </q-tr>
          </template>
        </q-table>
      </q-card-section>

      <q-card-section align="right">
        <q-btn flat label="Cancel" color="primary" v-close-popup />
        <q-btn
          flat
          label="Confirm Allocation"
          color="primary"
          @click="confirm"
          :disable="remainingToAllocate < 0"
        />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  invoices: { type: Array, required: true },
  totalPayment: { type: Number, required: true },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const localInvoices = ref([])

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      // Clone invoices and add 'allocation' field initialized to 0
      localInvoices.value = props.invoices.map((inv) => ({ ...inv, allocation: 0 }))
    }
  },
)

const totalAllocated = computed(() =>
  localInvoices.value.reduce((sum, inv) => sum + (inv.allocation || 0), 0),
)
const remainingToAllocate = computed(() => props.totalPayment - totalAllocated.value)

const columns = [
  { name: 'doc_number', label: 'Invoice #', align: 'left', field: 'doc_number' },
  { name: 'doc_date', label: 'Date', align: 'left', field: 'doc_date' },
  { name: 'balance_due', label: 'Balance Due', align: 'right', field: 'balance_due' },
  { name: 'allocation', label: 'Allocation', align: 'right', field: 'allocation' },
]

const formatCurrency = (val) => {
  return (val || 0).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })
}

const recalcTotal = () => {
  // Just triggers reactivity if needed
}

const confirm = () => {
  const allocations = localInvoices.value
    .filter((i) => i.allocation > 0)
    .map((i) => ({
      invoice_id: i.id,
      amount: i.allocation,
    }))
  emit('confirm', allocations)
  emit('update:modelValue', false)
}
</script>
