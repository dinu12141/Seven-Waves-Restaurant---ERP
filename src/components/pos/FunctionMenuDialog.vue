<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    transition-show="scale"
    transition-hide="scale"
  >
    <q-card dark class="function-menu-card">
      <q-card-section class="header-section">
        <div class="row items-center no-wrap">
          <q-icon name="apps" size="24px" color="yellow" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold text-yellow">FUNCTION MENU</div>
          <q-space />
          <q-btn flat round dense icon="close" color="grey-5" v-close-popup />
        </div>
      </q-card-section>

      <q-separator color="grey-8" />

      <q-card-section class="menu-grid-section">
        <div class="fn-grid">
          <button
            class="fn-btn fn-green"
            :class="{ 'fn-disabled': shiftStore.hasActiveShift }"
            :disabled="shiftStore.hasActiveShift"
            @click="handleAction('open_shift')"
          >
            <q-icon name="lock_open" size="28px" />
            <span>Open Shift</span>
          </button>

          <button
            class="fn-btn fn-orange"
            :class="{ 'fn-disabled': !shiftStore.hasActiveShift }"
            :disabled="!shiftStore.hasActiveShift"
            @click="handleAction('cash_drop')"
          >
            <q-icon name="move_to_inbox" size="28px" />
            <span>Cash Drop</span>
          </button>

          <button
            class="fn-btn fn-blue"
            :class="{ 'fn-disabled': !shiftStore.hasActiveShift }"
            :disabled="!shiftStore.hasActiveShift"
            @click="handleAction('cash_in')"
          >
            <q-icon name="add_circle" size="28px" />
            <span>Cash In</span>
          </button>

          <button
            class="fn-btn fn-blue"
            :class="{ 'fn-disabled': !shiftStore.hasActiveShift }"
            :disabled="!shiftStore.hasActiveShift"
            @click="handleAction('cash_out')"
          >
            <q-icon name="remove_circle" size="28px" />
            <span>Cash Out</span>
          </button>

          <button
            class="fn-btn fn-teal"
            :class="{ 'fn-disabled': !shiftStore.hasActiveShift }"
            :disabled="!shiftStore.hasActiveShift"
            @click="handleAction('shift_summary')"
          >
            <q-icon name="summarize" size="28px" />
            <span>Shift Summary</span>
          </button>

          <button
            class="fn-btn fn-red"
            :class="{ 'fn-disabled': !shiftStore.hasActiveShift }"
            :disabled="!shiftStore.hasActiveShift"
            @click="handleAction('close_shift')"
          >
            <q-icon name="lock" size="28px" />
            <span>Close Shift</span>
          </button>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { useShiftStore } from 'src/stores/shiftStore'

defineProps({
  modelValue: Boolean,
})

const emit = defineEmits(['update:modelValue', 'action'])

const shiftStore = useShiftStore()

function handleAction(action) {
  emit('update:modelValue', false)
  emit('action', action)
}
</script>

<style scoped>
.function-menu-card {
  background: #1a1a1a;
  min-width: 380px;
  max-width: 440px;
  border: 1px solid #444;
}

.header-section {
  background: #222;
  padding: 12px 20px;
}

.menu-grid-section {
  padding: 16px;
}

.fn-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.fn-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 12px;
  border: 2px solid transparent;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: #fff;
  border-radius: 0 !important;
}

.fn-btn:hover:not(:disabled) {
  transform: scale(1.03);
  filter: brightness(1.2);
}

.fn-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.fn-green {
  background: #2e7d32;
  border-color: #4caf50;
}

.fn-orange {
  background: #e65100;
  border-color: #ff9800;
}

.fn-blue {
  background: #1565c0;
  border-color: #42a5f5;
}

.fn-teal {
  background: #00695c;
  border-color: #26a69a;
}

.fn-red {
  background: #c62828;
  border-color: #ef5350;
}

.fn-disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.fn-btn span {
  font-size: 12px;
}
</style>
