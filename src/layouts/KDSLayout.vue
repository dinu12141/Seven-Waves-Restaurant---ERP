<template>
  <q-layout view="hHh lpR fFf" class="kds-layout">
    <q-page-container class="kds-page-container">
      <router-view />
    </q-page-container>

    <!-- Global Notification Toasts -->
    <NotificationToast />
  </q-layout>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/auth'
import NotificationToast from 'components/common/NotificationToast.vue'

const authStore = useAuthStore()
const $q = useQuasar()
const router = useRouter()

const wakeLockSentinel = ref(null)

onMounted(async () => {
  // KDS always runs in dark mode — kitchen displays need dark backgrounds
  $q.dark.set(true)
  // Prevent screen sleep on KDS (kitchen display stays on)
  if ('wakeLock' in navigator) {
    wakeLockSentinel.value = await navigator.wakeLock.request('screen').catch(() => null)
  }
  if (!authStore.isAuthenticated) {
    router.replace('/auth/login')
  }
})

onUnmounted(() => {
  // Release wake lock when leaving KDS so device can sleep normally
  if (wakeLockSentinel.value) {
    wakeLockSentinel.value.release().catch(() => {})
    wakeLockSentinel.value = null
  }
  // Restore user's preferred theme when leaving KDS
  $q.dark.set(localStorage.getItem('q-dark-mode') === 'true')
})
</script>

<style lang="scss">
/* KDS Layout — fullscreen, always dark, no chrome */
.kds-layout {
  background: #0a0a0a !important;
  min-height: 100vh;
  min-height: 100dvh;

  /* Force dark background even if Quasar tries to override */
  .q-page-container,
  .kds-page-container {
    background: #0a0a0a !important;
    padding: 0 !important;
  }

  /* Ensure page fills the viewport completely */
  .q-page {
    min-height: 100vh !important;
    min-height: 100dvh !important;
    background: #0a0a0a !important;
  }
}
</style>
