<template>
  <LoadingScreen :show="!authStore.initialized" />
  <router-view v-if="authStore.initialized" />
  <ToastContainer />
</template>

<script setup>
import { onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/auth'
import { useUIStore } from 'stores/ui'
import LoadingScreen from 'components/LoadingScreen.vue'
import ToastContainer from 'components/common/ToastContainer.vue'

const $q = useQuasar()
const authStore = useAuthStore()
const uiStore = useUIStore()

// Initialize theme without a user first (covers the login / guest pages).
onMounted(() => {
  uiStore.initThemeForUser($q, authStore.user?.id || null)
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
