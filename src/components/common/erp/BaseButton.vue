<template>
  <q-btn
    v-bind="$attrs"
    :icon="icon"
    :label="label"
    :color="computedColor"
    :outline="variant === 'secondary'"
    :flat="variant === 'ghost'"
    :dense="size === 'sm'"
    class="erp-btn"
    :class="[`erp-btn-${size}`, `erp-btn-${variant}`]"
    no-caps
    style="border-radius: var(--radius-sm)"
  />
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, default: '' },
  icon: { type: String, default: '' },
  variant: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'secondary', 'danger', 'ghost'].includes(v),
  },
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md'].includes(v) },
  color: { type: String, default: null },
})

const computedColor = computed(() => {
  if (props.color) return props.color
  if (props.variant === 'primary') return 'primary'
  if (props.variant === 'danger') return 'negative'
  return 'grey-4'
})
</script>

<style scoped>
.erp-btn {
  font-weight: 600;
  font-size: 14px;
}
.erp-btn-sm {
  font-size: 13px;
  min-height: 32px !important;
}
.erp-btn-md {
  min-height: 36px !important;
}
</style>
