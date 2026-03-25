<template>
  <LoadingScreen :show="!authStore.initialized" />
  <router-view v-if="authStore.initialized" />
  <ToastContainer />
</template>

<script setup>
import { onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/auth'
import { useUIStore } from 'stores/ui'
import LoadingScreen from 'components/LoadingScreen.vue'
import ToastContainer from 'components/common/ToastContainer.vue'

const $q = useQuasar()
const authStore = useAuthStore()
const uiStore = useUIStore()

// Initialize theme from saved preference / system preference
onMounted(() => {
  uiStore.initTheme($q)
})
</script>
