<template>
  <q-toggle
    v-bind="$attrs"
    :label="label"
    left-label
    dark
    color="green"
    class="text-weight-medium erp-toggle"
  />
</template>

<script setup>
defineOptions({ inheritAttrs: false })
defineProps({
  label: { type: String, required: true },
})
</script>

<style scoped>
.erp-toggle {
  font-size: 14px;
}
</style>
