<template>
  <div class="erp-form-section q-mb-xl">
    <div class="row items-baseline q-mb-md">
      <div class="text-subtitle1 text-weight-bold text-primary q-mr-sm">{{ title }}</div>
      <div v-if="description" class="text-caption text-grey-5">{{ description }}</div>
      <q-space v-if="description" />
      <div class="col-grow q-ml-md" style="height: 1px; background: var(--border)"></div>
    </div>
    <div class="erp-form-section-content">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
})
</script>
