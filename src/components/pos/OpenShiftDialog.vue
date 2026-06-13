<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <q-card dark class="open-shift-card">
      <q-card-section class="header-section">
        <div class="row items-center no-wrap">
          <q-icon name="lock_open" size="24px" color="green" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold text-white">Open New Shift</div>
          <q-space />
          <q-btn v-if="!forceOpen" flat round dense icon="close" color="grey-5" @click="$emit('update:modelValue', false)" />
        </div>
      </q-card-section>

      <q-separator color="grey-8" />

      <q-card-section class="form-section">
        <div class="info-row q-mb-md">
          <q-icon name="store" color="blue-4" size="18px" class="q-mr-sm" />
          <span class="info-label">Branch:</span>
          <span class="info-value">{{ branchName }}</span>
        </div>

        <div class="info-row q-mb-md">
          <q-icon name="person" color="blue-4" size="18px" class="q-mr-sm" />
          <span class="info-label">Cashier:</span>
          <span class="info-value">{{ cashierName }}</span>
        </div>

        <q-input
          v-model="form.terminalId"
          label="Terminal ID"
          outlined
          dark
          dense
          bg-color="grey-9"
          class="q-mb-md"
          hint="Unique identifier for this POS terminal"
        >
          <template v-slot:prepend>
            <q-icon name="computer" color="grey-5" />
          </template>
        </q-input>

        <q-input
          v-model.number="form.openingCashFloat"
          label="Opening Cash Float"
          outlined
          dark
          dense
          type="number"
          bg-color="grey-9"
          class="q-mb-md"
          :rules="[val => val >= 0 || 'Must be 0 or greater']"
        >
          <template v-slot:prepend>
            <q-icon name="payments" color="green" />
          </template>
          <template v-slot:append>
            <span class="text-grey-5 text-caption">LKR</span>
          </template>
        </q-input>

        <q-input
          v-model="form.openingNote"
          label="Opening Note (optional)"
          outlined
          dark
          dense
          type="textarea"
          bg-color="grey-9"
          rows="2"
          class="q-mb-sm"
        >
          <template v-slot:prepend>
            <q-icon name="notes" color="grey-5" />
          </template>
        </q-input>
      </q-card-section>

      <q-separator color="grey-8" />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          v-if="!forceOpen"
          flat
          label="Cancel"
          color="grey-5"
          no-caps
          @click="$emit('update:modelValue', false)"
        />
        <q-btn
          unelevated
          label="Open Shift"
          color="green"
          icon="lock_open"
          no-caps
          :loading="shiftStore.loading"
          @click="handleOpenShift"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Notify } from 'quasar'
import { useShiftStore } from 'src/stores/shiftStore'
import { useAuthStore } from 'src/stores/auth'
import { printService } from 'src/services/printService'

defineProps({
  modelValue: Boolean,
  forceOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'opened'])

const shiftStore = useShiftStore()
const authStore = useAuthStore()

const form = ref({
  terminalId: shiftStore.terminalId || 'POS-1',
  openingCashFloat: 0,
  openingNote: '',
})

const branchName = computed(() => authStore.currentBranch?.name || 'Main Branch')
const cashierName = computed(() => authStore.profile?.full_name || authStore.user?.email || 'Cashier')

// Sync terminal ID from store
watch(() => shiftStore.terminalId, (val) => {
  if (val) form.value.terminalId = val
})

async function handleOpenShift() {
  if (!form.value.terminalId?.trim()) {
    Notify.create({ message: 'Terminal ID is required', color: 'red', position: 'top' })
    return
  }

  shiftStore.setTerminalId(form.value.terminalId.trim())

  const success = await shiftStore.openShift(
    form.value.openingCashFloat,
    form.value.openingNote || undefined,
  )

  if (success) {
    Notify.create({
      message: 'Shift Opened Successfully',
      caption: `Terminal: ${form.value.terminalId} • Float: LKR ${form.value.openingCashFloat.toFixed(2)}`,
      color: 'positive',
      icon: 'check_circle',
      position: 'top',
      timeout: 3000,
    })

    // Print open shift ticket
    try {
      printService.printShiftOpen({
        id: shiftStore.shiftId || '',
        branch_name: branchName.value,
        terminal_id: form.value.terminalId,
        cashier_name: cashierName.value,
        opened_at: shiftStore.activeShift?.opened_at || new Date().toISOString(),
        opening_cash_float: form.value.openingCashFloat,
        opening_note: form.value.openingNote,
      })
    } catch (printErr) {
      console.error('[OpenShiftDialog] Failed to print open slip:', printErr)
    }

    emit('opened')
    emit('update:modelValue', false)

    // Reset form
    form.value.openingCashFloat = 0
    form.value.openingNote = ''
  } else {
    Notify.create({
      message: 'Failed to Open Shift',
      caption: shiftStore.error || 'Unknown error',
      color: 'red',
      icon: 'error',
      position: 'top',
    })
  }
}
</script>

<style scoped>
.open-shift-card {
  background: #1a1a1a;
  min-width: 420px;
  max-width: 500px;
  border: 1px solid #333;
}

.header-section {
  background: #222;
  padding: 16px 20px;
}

.form-section {
  padding: 20px;
}

.info-row {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.info-label {
  color: #888;
  margin-right: 8px;
  font-weight: 500;
}

.info-value {
  color: #fff;
  font-weight: 600;
}
</style>
