<template>
  <q-layout class="qr-entry-root">
    <q-page-container>
      <q-page class="column items-center justify-center">
        <div class="full-width row items-center justify-center">
          <!-- Ambient background -->
          <div class="bg-layer">
            <div class="bg-orb bg-orb--1" />
            <div class="bg-orb bg-orb--2" />
            <div class="bg-grid" />
          </div>

          <!-- Card — always rendered, content switches via v-if on child divs -->
          <div class="entry-card card-animate">
            <!-- Loading state -->
            <div v-if="loading" class="column items-center">
              <div class="brand-icon q-mb-lg">
                <q-icon name="restaurant" size="28px" color="white" />
              </div>
              <q-spinner-dots color="orange" size="42px" class="q-mb-md" />
              <div class="text-h6 text-white text-weight-bold">Connecting…</div>
              <div class="text-body2 text-grey-5 q-mt-xs">Setting up your table session</div>
            </div>

            <!-- Error state -->
            <div v-else-if="errorMsg" class="column items-center">
              <q-icon name="error_outline" size="56px" color="red-4" class="q-mb-md" />
              <div class="text-h6 text-white text-weight-bold q-mb-xs">Couldn't connect</div>
              <div class="error-banner q-mb-lg">
                <q-icon name="warning" size="15px" class="q-mr-xs" />
                {{ errorMsg }}
              </div>
              <q-btn
                unelevated
                no-caps
                class="retry-btn q-mb-sm"
                icon="refresh"
                label="Try Again"
                @click="resolveQr"
              />
              <q-btn
                flat
                no-caps
                color="grey-5"
                label="Enter device code instead"
                size="sm"
                @click="$router.push('/table-login')"
              />
            </div>

            <!-- Placeholder when redirecting (prevents empty card flash) -->
            <div v-else class="column items-center">
              <div class="brand-icon q-mb-lg">
                <q-icon name="restaurant" size="28px" color="white" />
              </div>
              <q-spinner-dots color="orange" size="42px" class="q-mb-md" />
              <div class="text-h6 text-white text-weight-bold">Redirecting…</div>
            </div>
          </div>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loginWithQrToken } from 'src/services/tableAuthService'
import { useTableSessionStore } from 'src/stores/tableSessionStore'
import { supabase } from 'src/boot/supabase'

const route = useRoute()
const router = useRouter()
const session = useTableSessionStore()

const loading = ref(true)
const errorMsg = ref('')

async function resolveQr() {
  const qrToken = String(route.params.qrToken || '')
  if (!qrToken) {
    errorMsg.value = 'No QR token found in URL.'
    loading.value = false
    return
  }

  loading.value = true
  errorMsg.value = ''

  const result = await loginWithQrToken(qrToken)

  if (result.success && result.session_token) {
    session.setSession({
      session_token: result.session_token,
      session_id: result.session_id,
      table_id: result.table_id,
      branch_id: result.branch_id,
      expires_at: result.expires_at,
    })

    try {
      const { data } = await supabase
        .from('restaurant_tables')
        .select('table_number')
        .eq('id', result.table_id)
        .single()
      if (data && data.table_number) {
        localStorage.setItem('tm_table_id', data.table_number)
      }
    } catch (e) {
      console.error(e)
    }

    localStorage.setItem('tm_session_token', result.session_token)

    // Check if customer is already authenticated
    const { useCustomerStore } = await import('src/stores/customerStore')
    const customerStore = useCustomerStore()
    await customerStore.tryRestoreFromLocal()

    if (customerStore.isLoggedIn) {
      // Already signed in, go straight to the table menu
      router.replace('/table/' + encodeURIComponent(result.session_token) + '/menu')
    } else {
      // Prompt customer to register/login (can skip)
      // Store the session token in localStorage so CustomerAuthPage can redirect back
      localStorage.setItem('qr_session_token', result.session_token)
      router.replace('/customer/register')
    }
  } else {
    errorMsg.value = result.error || 'Invalid or expired QR code. Ask your waiter for a new one.'
    loading.value = false
  }
}

onMounted(async () => {
  // By default if already authenticated, just go straight to touch menu
  if (session.isAuthenticated && session.sessionToken) {
    try {
      const { data } = await supabase
        .from('restaurant_tables')
        .select('table_number')
        .eq('id', session.tableId)
        .single()
      if (data && data.table_number) {
        localStorage.setItem('tm_table_id', data.table_number)
      }
    } catch (e) {
      console.error('Initial QR Entry error:', e)
    }

    localStorage.setItem('tm_session_token', session.sessionToken)

    const { useCustomerStore } = await import('src/stores/customerStore')
    const customerStore = useCustomerStore()
    await customerStore.tryRestoreFromLocal()

    if (customerStore.isLoggedIn) {
      router.replace('/table/' + encodeURIComponent(session.sessionToken) + '/menu')
    } else {
      localStorage.setItem('qr_session_token', session.sessionToken)
      router.replace('/customer/register')
    }
    return
  }
  resolveQr()
})
</script>

<style lang="scss" scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

.qr-entry-root {
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #07070f;
  font-family: 'Inter', 'Roboto', sans-serif;
  padding: 24px;
  overflow: hidden;
}

// Background
.bg-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.22;
  animation: orbFloat 13s ease-in-out infinite alternate;

  &--1 {
    width: 520px;
    height: 520px;
    background: radial-gradient(circle, #f97316 0%, transparent 70%);
    top: -160px;
    left: -180px;
  }
  &--2 {
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, #ef4444 0%, transparent 70%);
    bottom: -100px;
    right: -120px;
    animation-delay: -6s;
    animation-duration: 16s;
  }
}

@keyframes orbFloat {
  0% {
    transform: translate(0, 0) scale(1);
  }
  100% {
    transform: translate(45px, 35px) scale(1.06);
  }
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px);
  background-size: 52px 52px;
}

// Card
.entry-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 380px;
  background: rgba(14, 14, 24, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 26px;
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  box-shadow:
    0 0 0 1px rgba(249, 115, 22, 0.06),
    0 36px 90px rgba(0, 0, 0, 0.65),
    0 8px 36px rgba(249, 115, 22, 0.07);
  padding: 48px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.brand-icon {
  width: 54px;
  height: 54px;
  border-radius: 15px;
  background: linear-gradient(135deg, #f97316, #ef4444);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 22px rgba(249, 115, 22, 0.55);
}

.error-banner {
  display: flex;
  align-items: center;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 11px;
  padding: 10px 14px;
  color: #fca5a5;
  font-size: 0.83rem;
  font-weight: 500;
  width: 100%;
}

.retry-btn {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  color: white !important;
  border-radius: 12px;
  height: 46px;
  font-weight: 700;
  padding: 0 28px;
  box-shadow: 0 6px 22px rgba(249, 115, 22, 0.4);
  width: 100%;
}

// Entrance animation
.card-animate {
  animation: cardPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes cardPop {
  0% {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
