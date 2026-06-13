<template>
  <q-page class="q-pa-md flex flex-center">
    <div class="text-center">
      <q-icon name="auto_awesome" size="64px" color="primary" class="q-mb-md" />
      <div class="text-h5 text-weight-bold q-mb-sm">AI Insights has moved</div>
      <div class="text-body1 text-grey-6 q-mb-lg">
        The AI Intelligence Engine has been upgraded with enhanced security and new features.
      </div>
      <q-btn
        color="primary"
        icon="launch"
        label="Go to AI Dashboard"
        unelevated
        size="lg"
        to="/ai"
      />
    </div>
  </q-page>
</template>

<script setup>
/**
 * Legacy AIInsightsPage — replaced by the secure AI Intelligence Module.
 *
 * SECURITY FIX: The previous version of this file contained a hardcoded
 * Gemini API key (AIzaSy...) on the frontend. That key has been revoked
 * and all AI calls now route through the ai-gemini-service Edge Function.
 *
 * This page now redirects users to /ai (AiDashboardPage).
 */
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

onMounted(() => {
  // Auto-redirect after a brief display
  setTimeout(() => {
    router.push('/ai')
  }, 2000)
})
</script>
