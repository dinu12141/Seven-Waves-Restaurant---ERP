<template>
  <div class="realtime-status-badge" :class="`realtime-status-badge--${status}`" :title="statusText" role="status" :aria-label="`Realtime status: ${statusText}`">
    <span class="realtime-status-badge__dot" />
    <span v-if="showLabel" class="realtime-status-badge__label">{{ statusText }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  connected: { type: Boolean, default: null },
  showLabel: { type: Boolean, default: false },
})

const status = computed(() => {
  if (props.connected === true) return 'connected'
  if (props.connected === false) return 'disconnected'
  return 'connected'
})
const statusText = computed(() => ({ connected: 'Live', disconnected: 'Offline', reconnecting: 'Reconnecting...' }[status.value] || 'Unknown'))
</script>

<style scoped>
.realtime-status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; user-select: none; }
.realtime-status-badge--connected { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
.realtime-status-badge--disconnected { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
.realtime-status-badge--reconnecting { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
.realtime-status-badge__dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.realtime-status-badge--connected .realtime-status-badge__dot { animation: rtPulse 2s ease-in-out infinite; }
@keyframes rtPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
</style>
