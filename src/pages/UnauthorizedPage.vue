<template>
  <q-page class="flex flex-center column q-pa-xl text-center">
    <div class="unauthorized-container">
      <q-icon name="lock" size="80px" color="negative" class="q-mb-lg" />
      <h4 class="text-h4 text-weight-bold q-mb-md">Access Denied</h4>
      <p class="text-body1 text-grey-6 q-mb-xl" style="max-width: 480px">
        You do not have permission to access this page. If you believe this is an error, please
        contact your administrator.
      </p>

      <div class="row q-gutter-md justify-center">
        <q-btn
          label="Go to Dashboard"
          color="primary"
          rounded
          unelevated
          icon="dashboard"
          @click="goHome"
        />
        <q-btn
          label="Go Back"
          color="grey-7"
          rounded
          outline
          icon="arrow_back"
          @click="goBack"
        />
      </div>

      <div class="q-mt-xl text-caption text-grey-5">
        <q-icon name="info" size="14px" class="q-mr-xs" />
        Your roles: <strong>{{ roles.join(', ') || 'None' }}</strong>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from 'src/stores/auth'
import { computed } from 'vue'

const router = useRouter()
const authStore = useAuthStore()

const roles = computed(() => authStore.roles)

function goHome() {
  router.push(authStore.defaultLandingPage || '/dashboard')
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    goHome()
  }
}
</script>

<style scoped>
.unauthorized-container {
  max-width: 600px;
}
</style>
