<template>
  <div class="erp-field q-mb-lg">
    <div class="erp-field-label q-mb-xs">
      {{ label }} <span v-if="required" class="text-negative">*</span>
    </div>
    <div class="erp-field-content">
      <slot></slot>
    </div>
    <div v-if="hint" class="erp-field-hint q-mt-xs">{{ hint }}</div>
    <div v-if="error" class="erp-field-error q-mt-xs text-negative">{{ error }}</div>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  required: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
})
</script>

<style scoped>
.erp-field-label {
  font-size: var(--label-font);
  font-weight: 600;
  color: var(--text-muted);
}
.erp-field-hint {
  font-size: var(--helper-font);
  color: var(--text-muted);
}
.erp-field-error {
  font-size: var(--helper-font);
}
</style>
