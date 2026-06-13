<template>
  <transition name="offline-slide">
    <div v-if="isOffline" class="offline-banner" role="alert" aria-live="assertive">
      <q-icon name="cloud_off" size="18px" />
      <span class="offline-banner__text">You are offline. Changes will sync when connection is restored.</span>
      <div v-if="pendingCount > 0" class="offline-banner__count">{{ pendingCount }} pending</div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

defineProps({
  pendingCount: { type: Number, default: 0 },
})

const isOffline = ref(typeof navigator !== 'undefined' ? !navigator.onLine : false)
function handleOnline() { isOffline.value = false }
function handleOffline() { isOffline.value = true }

onMounted(() => { window.addEventListener('online', handleOnline); window.addEventListener('offline', handleOffline) })
onUnmounted(() => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) })
</script>

<style scoped>
.offline-banner { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; font-size: 13px; font-weight: 500; position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999; box-shadow: 0 -2px 12px rgba(0,0,0,0.15); }
.offline-banner__count { margin-left: auto; background: rgba(0,0,0,0.2); padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
.offline-slide-enter-active, .offline-slide-leave-active { transition: transform 0.3s ease, opacity 0.3s ease; }
.offline-slide-enter-from, .offline-slide-leave-to { transform: translateY(100%); opacity: 0; }
</style>
