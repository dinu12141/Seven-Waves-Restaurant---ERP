<template>
  <q-dialog
    v-model="isOpen"
    :persistent="persistent"
    transition-show="scale"
    transition-hide="scale"
  >
    <q-card class="erp-dialog-card" :style="cardStyle">
      <!-- Header toolbar -->
      <q-toolbar class="bg-primary text-white erp-dialog__toolbar">
        <q-icon
          v-if="icon"
          :name="icon"
          size="20px"
          class="q-mr-sm"
        />
        <q-toolbar-title>
          <div class="text-subtitle2 erp-dialog__title">{{ title }}</div>
          <div v-if="subtitle" class="text-caption erp-dialog__subtitle">{{ subtitle }}</div>
        </q-toolbar-title>
        <q-btn
          flat
          round
          dense
          icon="close"
          aria-label="Close dialog"
          @click="close"
        />
      </q-toolbar>

      <q-separator />

      <!-- Body (scrollable) -->
      <q-card-section class="erp-dialog__body scroll">
        <q-inner-loading :showing="loading">
          <q-spinner-dots size="40px" color="primary" />
        </q-inner-loading>
        <slot />
      </q-card-section>

      <!-- Actions footer — only rendered when the slot has content -->
      <template v-if="hasActions">
        <q-separator />
        <q-card-actions align="right" class="q-pa-md erp-dialog__actions">
          <slot name="actions" />
        </q-card-actions>
      </template>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { computed, useSlots } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: '',
  },
  subtitle: {
    type: String,
    default: '',
  },
  maxWidth: {
    type: String,
    default: '700px',
  },
  persistent: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const slots = useSlots()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const cardStyle = computed(() => ({
  minWidth: '340px',
  maxWidth: props.maxWidth,
  width: '100%',
  background: 'var(--erp-bg-card)',
}))

// Only render the footer separator + actions card when the slot has actual content
const hasActions = computed(() => !!slots.actions)

function close() {
  emit('update:modelValue', false)
}
</script>

<style scoped lang="scss">
.erp-dialog-card {
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  border: 1px solid var(--erp-border);
  box-shadow: var(--erp-shadow-lg);
  border-radius: var(--erp-radius-xl) !important;
  overflow: hidden;
}

.erp-dialog__toolbar {
  min-height: 48px;
  flex-shrink: 0;
  border-radius: 0;
}

.erp-dialog__title {
  font-size: 14px;
  font-weight: var(--erp-font-weight-semibold);
  line-height: 1.3;
}

.erp-dialog__subtitle {
  font-size: 11px;
  opacity: 0.8;
  margin-top: 1px;
}

.erp-dialog__body {
  flex: 1 1 auto;
  overflow-y: auto;
  max-height: 70vh;
  padding: var(--sp-5);
  position: relative;
}

.erp-dialog__actions {
  flex-shrink: 0;
  background: var(--erp-bg-card);
  gap: var(--erp-spacing-md);
}
</style>
