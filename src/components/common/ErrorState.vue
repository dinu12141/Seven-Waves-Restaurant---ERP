<template>
  <div class="erp-error-state column items-center justify-center q-pa-xl text-center" role="alert">
    <q-icon :name="icon" size="64px" color="negative" />
    <div class="text-h6 text-grey-3 q-mt-md">{{ title }}</div>
    <div class="text-caption text-grey-6 q-mb-md" style="max-width: 360px">{{ message }}</div>
    <div class="row q-gutter-sm">
      <q-btn v-if="retryable" outline color="primary" no-caps label="Retry" icon="refresh" :loading="retrying" @click="$emit('retry')" aria-label="Retry loading" />
      <q-btn v-if="showHome" flat color="grey-6" no-caps label="Go to Dashboard" icon="home" to="/" aria-label="Go to dashboard" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: 'error_outline' },
  title: { type: String, default: 'Something went wrong' },
  message: { type: String, default: 'An unexpected error occurred. Please try again.' },
  retryable: { type: Boolean, default: true },
  retrying: { type: Boolean, default: false },
  showHome: { type: Boolean, default: false },
})
defineEmits(['retry'])
</script>

<style scoped>
.erp-error-state { min-height: 300px; }
</style>
