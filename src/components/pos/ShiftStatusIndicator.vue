<template>
  <div v-if="shiftStore.hasActiveShift" class="shift-indicator">
    <span class="shift-dot"></span>
    <span class="shift-label">SHIFT OPEN</span>
    <span class="shift-sep">•</span>
    <span class="shift-detail">{{ cashierName }}</span>
    <span class="shift-sep">•</span>
    <span class="shift-detail">{{ formattedTime }}</span>
    <span class="shift-sep">•</span>
    <span class="shift-detail">{{ terminalId }}</span>
  </div>
  <div v-else class="shift-indicator shift-closed">
    <span class="shift-dot closed-dot"></span>
    <span class="shift-label">NO SHIFT</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useShiftStore } from 'src/stores/shiftStore'
import { useAuthStore } from 'src/stores/auth'

const shiftStore = useShiftStore()
const authStore = useAuthStore()

const cashierName = computed(() => {
  return authStore.profile?.full_name || authStore.user?.email || 'Cashier'
})

const terminalId = computed(() => {
  return shiftStore.activeShift?.terminal_id || shiftStore.terminalId
})

const formattedTime = computed(() => {
  const openedAt = shiftStore.activeShift?.opened_at
  if (!openedAt) return ''

  const opened = new Date(openedAt)
  const now = new Date()
  const diffMs = now.getTime() - opened.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 60) return `${diffMin}m ago`
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  return `${hours}h ${mins}m`
})
</script>

<style scoped>
.shift-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.shift-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4caf50;
  animation: pulse-dot 2s infinite;
}

.closed-dot {
  background: #f44336;
  animation: none;
}

.shift-label {
  color: #4caf50;
  font-weight: 800;
}

.shift-closed .shift-label {
  color: #f44336;
}

.shift-sep {
  color: #555;
  font-size: 10px;
}

.shift-detail {
  color: #aaa;
  font-weight: 500;
  font-size: 10px;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
