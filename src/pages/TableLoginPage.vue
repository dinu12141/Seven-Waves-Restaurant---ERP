<template>
  <div class="table-login-root">
    <!-- Animated background -->
    <div class="bg-layer">
      <div class="bg-orb bg-orb--1" />
      <div class="bg-orb bg-orb--2" />
      <div class="bg-grid" />
    </div>

    <!-- ── QR auto-resolve overlay ── -->
    <transition name="card-pop" appear>
      <div v-if="qrDetected" class="login-card qr-overlay">
        <div class="column items-center q-pa-xl">
          <q-circular-progress
            v-if="qrLoading"
            indeterminate
            size="64px"
            color="orange"
            class="q-mb-lg"
          />
          <q-icon v-else name="qr_code_scanner" size="64px" color="orange-5" class="q-mb-lg" />
          <div class="text-h6 text-white text-weight-bold">QR Code Detected</div>
          <div class="text-caption text-grey-5 q-mt-xs">Connecting to your table…</div>
          <div v-if="errorMsg" class="error-banner q-mt-lg full-width">
            <q-icon name="error_outline" size="16px" class="q-mr-xs" />
            {{ errorMsg }}
          </div>
          <q-btn
            v-if="errorMsg"
            flat
            no-caps
            color="orange"
            label="Enter device code instead"
            class="q-mt-md"
            @click="qrDetected = false"
          />
        </div>
      </div>

      <!-- ── Device-code login card ── -->
      <div v-else class="login-card">
        <!-- Logo bar -->
        <div class="card-header">
          <div class="brand-icon">
            <q-icon name="restaurant" size="28px" color="white" />
          </div>
          <div class="brand-text">
            <div class="brand-name">SEVEN WAVES</div>
            <div class="brand-sub">Table Access Portal</div>
          </div>
        </div>

        <div class="card-divider" />

        <!-- Form body -->
        <div class="card-body">
          <p class="instruction">
            Enter your <strong>phone number</strong> or <strong>access code</strong> to unlock the
            menu.
          </p>

          <!-- Device code -->
          <div class="field-group q-mb-md">
            <label class="field-label">Phone Number / Access Code</label>
            <q-input
              id="device-code-input"
              v-model="deviceCode"
              placeholder="e.g. 0771234567 or TB-001"
              outlined
              dark
              dense
              class="field-input"
              autofocus
              :disable="loading"
              maxlength="40"
              autocomplete="username"
              @keyup.enter="pinRef?.focus()"
              @update:model-value="(val) => (deviceCode = String(val))"
            >
              <template #prepend>
                <q-icon name="phone" color="orange-5" size="18px" />
              </template>
            </q-input>
          </div>

          <!-- PIN -->
          <div class="field-group q-mb-md">
            <label class="field-label">PIN / Secret</label>
            <q-input
              id="pin-input"
              ref="pinRef"
              v-model="pin"
              :type="showPin ? 'text' : 'password'"
              placeholder="Enter PIN"
              outlined
              dark
              dense
              class="field-input"
              :disable="loading"
              autocomplete="current-password"
              @keyup.enter="handleLogin"
            >
              <template #prepend>
                <q-icon name="lock" color="orange-5" size="18px" />
              </template>
              <template #append>
                <q-btn
                  flat
                  round
                  dense
                  :icon="showPin ? 'visibility_off' : 'visibility'"
                  size="sm"
                  color="grey-6"
                  @click="showPin = !showPin"
                />
              </template>
            </q-input>
          </div>

          <!-- Remember device code -->
          <div class="row items-center q-mb-lg">
            <q-checkbox
              id="remember-device-checkbox"
              v-model="rememberDevice"
              dark
              dense
              color="orange"
              size="sm"
            />
            <span class="remember-label q-ml-xs">Remember me on this tablet</span>
          </div>

          <!-- Error banner -->
          <transition name="error-fade">
            <div v-if="errorMsg" class="error-banner q-mb-md">
              <q-icon name="error_outline" size="16px" class="q-mr-xs" />
              {{ errorMsg }}
            </div>
          </transition>

          <!-- Login button -->
          <q-btn
            id="login-btn"
            unelevated
            no-caps
            class="login-btn full-width"
            :loading="loading"
            :disable="!deviceCode.trim() || !pin"
            @click="handleLogin"
          >
            <span class="login-btn-content">
              <q-icon name="lock_open" class="q-mr-sm" size="20px" />
              Unlock Menu
            </span>
            <template #loading>
              <q-spinner-dots color="white" size="1.5em" />
            </template>
          </q-btn>
        </div>

        <!-- Footer -->
        <div class="card-footer">
          <q-icon name="info_outline" size="13px" class="q-mr-xs" />
          Contact your manager if you don't have credentials.
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loginWithDeviceCode, loginWithQrToken } from 'src/services/tableAuthService'
import { useTableSessionStore } from 'src/stores/tableSessionStore'

const router = useRouter()
const route = useRoute()
const session = useTableSessionStore()

// ── Form state ─────────────────────────────────────────────────────────────────
const deviceCode = ref(session.savedDeviceCode ?? '')
const pin = ref('')
const showPin = ref(false)
const rememberDevice = ref(true)
const loading = ref(false)
const errorMsg = ref('')
const pinRef = ref(null)

// ── QR state ───────────────────────────────────────────────────────────────────
const qrDetected = ref(false)
const qrLoading = ref(false)

// ── On mount: handle QR token in URL query or already logged in ────────────────
onMounted(async () => {
  // Already authenticated → skip to menu
  if (session.isAuthenticated) {
    await router.replace(`/table/${encodeURIComponent(session.sessionToken)}/menu`)
    return
  }

  const qrToken = Array.isArray(route.query.token) ? route.query.token[0] : route.query.token
  if (qrToken) {
    qrDetected.value = true
    qrLoading.value = true
    errorMsg.value = ''

    const result = await loginWithQrToken(String(qrToken))
    qrLoading.value = false

    if (result.success && result.session_token) {
      session.setSession({
        session_token: result.session_token,
        session_id: result.session_id,
        table_id: result.table_id,
        branch_id: result.branch_id,
        expires_at: result.expires_at,
      })
      await router.replace(`/table/${encodeURIComponent(result.session_token)}/menu`)
    } else {
      errorMsg.value = result.error ?? 'Invalid QR code.'
    }
  }
})

// ── Rate limiting / Brute-force defense ─────────────────────────────────────────
const failedAttempts = ref(0)
const lockoutUntil = ref<number | null>(null)

// ── Device-code login ──────────────────────────────────────────────────────────
async function handleLogin() {
  if (!deviceCode.value.trim() || !pin.value) return

  // Check lockout
  if (lockoutUntil.value && Date.now() < lockoutUntil.value) {
    const remaining = Math.ceil((lockoutUntil.value - Date.now()) / 1000)
    errorMsg.value = `Too many failed attempts. Please wait ${remaining} seconds before trying again.`
    return
  }

  errorMsg.value = ''
  loading.value = true

  try {
    const result = await loginWithDeviceCode(deviceCode.value, pin.value)

    if (!result.success || !result.session_token) {
      failedAttempts.value++
      if (failedAttempts.value >= 5) {
        lockoutUntil.value = Date.now() + 30 * 1000 // 30 second cooldown
        errorMsg.value = 'Too many failed login attempts. Locked for 30 seconds.'
      } else {
        errorMsg.value = result.error ?? 'Login failed. Check your credentials.'
      }
      return
    }

    // Reset attempts on successful login
    failedAttempts.value = 0
    lockoutUntil.value = null

    if (rememberDevice.value) {
      session.rememberDeviceCode(deviceCode.value)
    }

    session.setSession({
      session_token: result.session_token,
      session_id: result.session_id,
      table_id: result.table_id,
      branch_id: result.branch_id,
      expires_at: result.expires_at,
    })

    await router.push(`/table/${encodeURIComponent(result.session_token)}/menu`)
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

// ── Root ──────────────────────────────────────────────────────────────────────
.table-login-root {
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

// ── Animated background ───────────────────────────────────────────────────────
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
    animation-delay: 0s;
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

// ── Card shell ────────────────────────────────────────────────────────────────
.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 430px;
  background: rgba(14, 14, 24, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 26px;
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  box-shadow:
    0 0 0 1px rgba(249, 115, 22, 0.06),
    0 36px 90px rgba(0, 0, 0, 0.65),
    0 8px 36px rgba(249, 115, 22, 0.07);
  overflow: hidden;
}

// ── Header ────────────────────────────────────────────────────────────────────
.card-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 30px 30px 26px;
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
  flex-shrink: 0;
}

.brand-name {
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 4px;
  color: #fb923c;
  line-height: 1;
}

.brand-sub {
  font-size: 1.08rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.5;
  margin-top: 3px;
}

// ── Divider ───────────────────────────────────────────────────────────────────
.card-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(249, 115, 22, 0.28), transparent);
  margin: 0 30px;
}

// ── Body ──────────────────────────────────────────────────────────────────────
.card-body {
  padding: 28px 30px 22px;
}

.instruction {
  font-size: 0.875rem;
  color: #9ca3af;
  margin: 0 0 24px;
  line-height: 1.65;

  strong {
    color: #d1d5db;
    font-weight: 600;
  }
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #d1d5db;
  letter-spacing: 0.7px;
  text-transform: uppercase;
}

.field-input {
  :deep(.q-field__control) {
    background: rgba(255, 255, 255, 0.045);
    border-radius: 12px;
    transition:
      background 0.2s,
      box-shadow 0.2s;
    &:hover {
      background: rgba(255, 255, 255, 0.065);
    }
  }
  :deep(.q-field--focused .q-field__control) {
    box-shadow: 0 0 0 2.5px rgba(249, 115, 22, 0.45);
    background: rgba(255, 255, 255, 0.06);
  }
  :deep(.q-field__native) {
    color: #fff;
    font-size: 0.96rem;
    font-family: 'Inter', 'Roboto', sans-serif;
  }
}

.remember-label {
  font-size: 0.82rem;
  color: #9ca3af;
}

// ── Error banner ──────────────────────────────────────────────────────────────
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
}

.error-fade-enter-active,
.error-fade-leave-active {
  transition: all 0.3s ease;
}
.error-fade-enter-from,
.error-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

// ── Login button ──────────────────────────────────────────────────────────────
.login-btn {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  color: white !important;
  border-radius: 13px;
  height: 52px;
  font-size: 0.96rem;
  font-weight: 700;
  letter-spacing: 0.3px;
  box-shadow: 0 6px 26px rgba(249, 115, 22, 0.42);
  transition:
    box-shadow 0.25s ease,
    transform 0.15s ease;

  &:not(:disabled):hover {
    box-shadow: 0 10px 36px rgba(249, 115, 22, 0.58);
    transform: translateY(-1px);
  }
  &:not(:disabled):active {
    transform: translateY(0);
  }
}

.login-btn-content {
  display: flex;
  align-items: center;
}

// ── Footer ────────────────────────────────────────────────────────────────────
.card-footer {
  padding: 14px 30px 22px;
  font-size: 0.74rem;
  color: #6b7280;
  display: flex;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.048);
  margin-top: 4px;
}

// ── QR overlay tweak ──────────────────────────────────────────────────────────
.qr-overlay {
  text-align: center;
}

// ── Card entrance ─────────────────────────────────────────────────────────────
.card-pop-enter-active {
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.card-pop-enter-from {
  opacity: 0;
  transform: scale(0.92) translateY(20px);
}
</style>
