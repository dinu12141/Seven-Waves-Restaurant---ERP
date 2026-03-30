<template>
  <div class="erp-field q-mb-sm">
    <div v-if="label" class="erp-field-label q-mb-xs">
      {{ label }} <span v-if="required" class="text-negative">*</span>
    </div>
    <q-input
      v-bind="$attrs"
      :dark="$q.dark.isActive"
      outlined
      dense
      hide-bottom-space
      :bg-color="bgColor"
    >
      <template v-for="(_, slotName) in $slots" v-slot:[slotName]="slotProps">
        <slot :name="slotName" v-bind="slotProps || {}" />
      </template>
    </q-input>
  </div>
</template>

<script setup>
defineOptions({ inheritAttrs: false })
defineProps({
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  bgColor: { type: String, default: 'surface-2' },
})
</script>

<style scoped>
.erp-field-label {
  font-size: var(--label-font);
  font-weight: 600;
  color: var(--text-muted);
}
</style>
