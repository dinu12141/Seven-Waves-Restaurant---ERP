<template>
  <LoadingScreen :show="!authStore.initialized" />
  <router-view v-if="authStore.initialized" />
  <ToastContainer />
</template>

<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/auth'
import { useUIStore } from 'stores/ui'
import LoadingScreen from 'components/LoadingScreen.vue'
import ToastContainer from 'components/common/ToastContainer.vue'
import { checkForAppUpdate } from 'src/composables/useAppUpdateCheck'

const $q = useQuasar()
const authStore = useAuthStore()
const uiStore = useUIStore()

// Initialize theme without a user first (covers the login / guest pages).
onMounted(() => {
  uiStore.initThemeForUser($q, authStore.user?.id || null)
})

// Android APK (Capacitor) has no Play Store / OTA update detection — check a
// small public table for a newer build and prompt to download it. No-op on
// web/PWA (handled separately by the service worker update prompt below).
onMounted(() => {
  checkForAppUpdate($q)
})

// ── PWA update prompt ─────────────────────────────────────────────────────
// src-pwa/register-service-worker.js dispatches this once a new build's
// service worker has activated in the background. Show a persistent, non-
// blocking notification so the user (waiter/cashier/kitchen mid-shift) can
// choose when to reload, instead of the previous silent forced reload.
function handleSwUpdateAvailable() {
  $q.notify({
    message: 'A new version is available.',
    caption: 'Tap Update to load the latest version.',
    color: 'dark',
    icon: 'system_update',
    position: 'bottom',
    timeout: 0,
    multiLine: true,
    actions: [
      {
        label: 'Update Now',
        color: 'amber',
        handler: () => window.location.reload(),
      },
      { label: 'Later', color: 'grey-5', handler: () => {} },
    ],
  })
}

onMounted(() => {
  window.addEventListener('sw-update-available', handleSwUpdateAvailable)
})
onUnmounted(() => {
  window.removeEventListener('sw-update-available', handleSwUpdateAvailable)
})

// Re-initialize theme whenever the logged-in user changes.
// This ensures each role/login uses their own saved preference.
watch(
  () => authStore.user?.id,
  (userId) => {
    uiStore.initThemeForUser($q, userId || null)
  },
)
</script>
