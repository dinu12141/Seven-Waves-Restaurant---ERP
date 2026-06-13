<template>
  <div class="loading-skeleton" :style="skeletonStyle" :aria-hidden="true">
    <div class="loading-skeleton__shimmer" />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  width: { type: String, default: '100%' },
  height: { type: String, default: '16px' },
  variant: { type: String, default: 'text' },
  size: { type: Number, default: 40 },
  borderRadius: { type: String, default: '' },
})

const skeletonStyle = computed(() => {
  if (props.variant === 'circle') return { width: `${props.size}px`, height: `${props.size}px`, borderRadius: '50%' }
  if (props.variant === 'card') return { width: props.width, height: props.height || '120px', borderRadius: props.borderRadius || '8px' }
  return { width: props.width, height: props.height, borderRadius: props.borderRadius || '4px' }
})
</script>

<style scoped>
.loading-skeleton { position: relative; overflow: hidden; background: var(--erp-bg-hover, rgba(148, 163, 184, 0.1)); }
.loading-skeleton__shimmer { position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%); animation: shimmer 1.8s ease-in-out infinite; }
@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
</style>
