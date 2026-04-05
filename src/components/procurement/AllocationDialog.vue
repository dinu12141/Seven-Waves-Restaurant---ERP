<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 750px; max-width: 85vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Allocate Payment to Invoices</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <!-- Summary Row -->
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-12 col-md-4">
            <q-input
              :model-value="formatCurrency(totalPayment)"
              label="Total Payment Amount"
              outlined
              dense
              readonly
              class="text-weight-bold"
            />
          </div>
          <div class="col-12 col-md-4">
            <q-input
              :model-value="formatCurrency(totalAllocated)"
              label="Total Allocated"
              outlined
              dense
              readonly
              :color="isExactMatch ? 'positive' : 'warning'"
            />
          </div>
          <div class="col-12 col-md-4">
            <q-input
              :model-value="formatCurrency(remainingToAllocate)"
              label="Remaining to Allocate"
              outlined
              dense
              readonly
              :color="remainingToAllocate < -0.005 ? 'negative' : remainingToAllocate < 0.005 ? 'positive' : 'warning'"
            />
          </div>
        </div>

        <!-- Validation message -->
        <q-banner v-if="!isExactMatch && localInvoices.length > 0" dense rounded class="bg-orange-1 text-orange-9 q-mb-sm">
          <template v-slot:avatar>
            <q-icon name="info" color="orange" />
          </template>
          Total Payment must equal Total Allocated to confirm.
        </q-banner>

        <q-banner v-if="isExactMatch" dense rounded class="bg-green-1 text-green-9 q-mb-sm">
          <template v-slot:avatar>
            <q-icon name="check_circle" color="green" />
          </template>
          Allocation balanced — ready to confirm.
        </q-banner>

        <!-- Auto-fill button -->
        <div class="row q-mb-sm">
          <q-btn
            flat
            dense
            color="secondary"
            icon="auto_fix_high"
            label="Auto-fill (oldest first)"
            @click="autoFill"
            :disable="localInvoices.length === 0"
            class="q-mr-sm"
          />
          <q-btn
            flat
            dense
            color="grey"
            icon="clear_all"
            label="Clear All"
            @click="clearAll"
          />
        </div>

        <!-- Invoices Table -->
        <q-table
          :rows="localInvoices"
          :columns="columns"
          row-key="id"
          dense
          flat
          bordered
          :pagination="{ rowsPerPage: 0 }"
          hide-bottom
        >
          <template v-slot:body="props">
            <q-tr :props="props" :class="props.row.allocation > 0 ? 'bg-green-1' : ''">
              <q-td key="doc_number" :props="props">
                <span class="text-weight-medium">{{ props.row.doc_number }}</span>
              </q-td>
              <q-td key="doc_date" :props="props">{{ props.row.doc_date }}</q-td>
              <q-td key="due_date" :props="props">
                {{ props.row.due_date || '—' }}
                <q-badge v-if="isOverdue(props.row.due_date)" color="red" label="Overdue" class="q-ml-xs" />
              </q-td>
              <q-td key="total_amount" :props="props" class="text-right">
                {{ formatCurrency(props.row.total_amount) }}
              </q-td>
              <q-td key="balance_due" :props="props" class="text-right text-weight-bold">
                {{ formatCurrency(props.row.balance_due) }}
              </q-td>
              <q-td key="allocation" :props="props" style="width: 160px">
                <q-input
                  v-model.number="props.row.allocation"
                  type="number"
                  dense
                  outlined
                  input-class="text-right"
                  :min="0"
                  :max="props.row.balance_due"
                  :rules="[v => v >= 0 || 'Min 0', v => v <= props.row.balance_due || 'Exceeds balance']"
                  @update:model-value="recalcTotal"
                >
                  <template v-slot:append>
                    <q-btn
                      flat
                      dense
                      round
                      size="xs"
                      icon="payments"
                      color="primary"
                      @click="props.row.allocation = props.row.balance_due; recalcTotal()"
                    >
                      <q-tooltip>Pay full balance</q-tooltip>
                    </q-btn>
                  </template>
                </q-input>
              </q-td>
            </q-tr>
          </template>

          <template v-slot:no-data>
            <div class="full-width text-center q-pa-md text-grey-6">
              No unpaid invoices found for this supplier.
            </div>
          </template>
        </q-table>
      </q-card-section>

      <q-separator />
      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Cancel" color="grey" v-close-popup />
        <q-btn
          unelevated
          label="Confirm Allocation"
          color="primary"
          icon="check"
          @click="confirm"
          :disable="!isExactMatch"
        >
          <q-tooltip v-if="!isExactMatch">
            Allocated total must equal payment amount
          </q-tooltip>
        </q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
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
const isExactMatch = computed(() => Math.abs(remainingToAllocate.value) < 0.01 && totalAllocated.value > 0)

const columns = [
  { name: 'doc_number', label: 'Invoice #', align: 'left', field: 'doc_number' },
  { name: 'doc_date', label: 'Invoice Date', align: 'left', field: 'doc_date' },
  { name: 'due_date', label: 'Due Date', align: 'left', field: 'due_date' },
  { name: 'total_amount', label: 'Invoice Total', align: 'right', field: 'total_amount' },
  { name: 'balance_due', label: 'Balance Due', align: 'right', field: 'balance_due' },
  { name: 'allocation', label: 'Allocate', align: 'right', field: 'allocation' },
]

const formatCurrency = (val) => {
  return (val || 0).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })
}

const isOverdue = (dueDate) => {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

const recalcTotal = () => {
  // Reactivity is handled by computed — this is a no-op hook for v-model
}

/**
 * Auto-fill: distribute totalPayment across invoices sorted by due_date (oldest first).
 * Each invoice gets min(balance_due, remaining_to_allocate).
 */
const autoFill = () => {
  let remaining = props.totalPayment
  // Sort by due_date ascending (oldest debt first), then by doc_date
  const sorted = [...localInvoices.value].sort((a, b) => {
    const dA = a.due_date || a.doc_date || ''
    const dB = b.due_date || b.doc_date || ''
    return dA.localeCompare(dB)
  })

  // Clear all first
  localInvoices.value.forEach((inv) => (inv.allocation = 0))

  // Allocate oldest-first
  for (const inv of sorted) {
    if (remaining <= 0.005) break
    const allocatable = Math.min(inv.balance_due, remaining)
    // Find the same invoice in localInvoices (by id) and set allocation
    const target = localInvoices.value.find((i) => i.id === inv.id)
    if (target) {
      target.allocation = Math.round(allocatable * 100) / 100
      remaining -= target.allocation
    }
  }
}

const clearAll = () => {
  localInvoices.value.forEach((inv) => (inv.allocation = 0))
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
