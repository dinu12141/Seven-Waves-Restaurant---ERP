<template>
  <div class="row items-center justify-between q-mb-md">
    <div>
      <h1 class="text-h5 text-white q-my-none text-weight-bold">{{ title }}</h1>
      <div v-if="subtitle" class="text-grey-5 q-mt-xs">{{ subtitle }}</div>
    </div>
    <div class="row q-gutter-sm">
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
})
</script>
