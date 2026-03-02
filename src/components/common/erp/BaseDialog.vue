<template>
  <q-dialog v-model="isOpen" persistent transition-show="scale" transition-hide="scale">
    <q-card class="erp-dialog-card" :style="computedStyle">
      <q-card-section
        class="row items-center q-pb-none"
        style="padding: var(--sp-4) var(--sp-5); border-bottom: 1px solid var(--border)"
      >
        <div class="text-h6 text-weight-bold">{{ title }}</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup color="grey-5" />
      </q-card-section>

      <q-card-section class="scroll q-pa-lg erp-dialog-body" style="max-height: 70vh">
        <slot></slot>
      </q-card-section>

      <q-separator dark style="background: var(--border)" />

      <q-card-actions
        align="right"
        style="padding: var(--sp-4) var(--sp-5); background: var(--surface)"
      >
        <slot name="actions"></slot>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, required: true },
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
})

const emit = defineEmits(['update:modelValue'])

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const computedStyle = computed(() => {
  const sizes = {
    sm: 'width: var(--dialog-w-sm); max-width: 95vw;',
    md: 'width: var(--dialog-w-md); max-width: 95vw;',
    lg: 'width: var(--dialog-w-lg); max-width: 95vw;',
  }
  return sizes[props.size]
})
</script>

<style scoped>
.erp-dialog-body {
  padding-top: var(--sp-5);
}
</style>
