<template>
  <div class="pos-login-page">
    <div class="pos-login-container">
      <!-- Left: Branding Panel -->
      <div class="branding-panel">
        <div class="brand-overlay"></div>
        <div class="brand-content">
          <div class="brand-logo-wrap">
            <img
              src="~assets/seven-waves-logo-transparent.png"
              alt="Seven Waves"
              class="brand-logo"
            />
          </div>
          <h1 class="brand-title">Point of Sale</h1>
          <p class="brand-desc">Cashier Login Terminal</p>

          <!-- Feature badges -->
          <div class="feature-badges">
            <div class="feature-badge">
              <q-icon name="receipt_long" size="16px" />
              <span>Billing & Invoicing</span>
            </div>
            <div class="feature-badge">
              <q-icon name="payments" size="16px" />
              <span>Payment Collection</span>
            </div>
            <div class="feature-badge">
              <q-icon name="print" size="16px" />
              <span>Receipt Printing</span>
            </div>
          </div>
        </div>

        <!-- Clock -->
        <div class="brand-clock">
          <div class="clock-time">{{ currentTime }}</div>
          <div class="clock-date">{{ currentDate }}</div>
        </div>
      </div>

      <!-- Right: Login Form -->
      <div class="login-panel">
        <div class="login-inner">
          <!-- Header -->
          <div class="login-header">
            <div class="pos-icon">
              <q-icon name="point_of_sale" size="32px" color="white" />
            </div>
            <h2 class="login-title">POS Login</h2>
            <p class="login-subtitle">Sign in with your cashier credentials</p>
          </div>

          <!-- Error -->
          <transition name="error-anim">
            <div v-if="errorMessage" class="error-banner">
              <q-icon name="error_outline" size="18px" />
              <span>{{ errorMessage }}</span>
              <q-btn flat dense round icon="close" size="xs" color="red-3" @click="errorMessage = ''" />
            </div>
          </transition>

          <!-- Form -->
          <q-form @submit.prevent="handleLogin" class="pos-form">
            <!-- Email -->
            <div class="form-field">
              <label class="form-label">Email Address</label>
              <div class="input-wrap" :class="{ focused: emailFocused }">
                <q-icon name="mail_outline" size="18px" class="input-ic" />
                <input
                  v-model="email"
                  type="email"
                  placeholder="cashier@sevenwaves.lk"
                  class="form-input"
                  autocomplete="email"
                  @focus="emailFocused = true"
                  @blur="emailFocused = false"
                />
              </div>
            </div>

            <!-- Password -->
            <div class="form-field">
              <label class="form-label">Password</label>
              <div class="input-wrap" :class="{ focused: pwFocused }">
                <q-icon name="lock_outline" size="18px" class="input-ic" />
                <input
                  v-model="password"
                  :type="showPw ? 'text' : 'password'"
                  placeholder="Enter your password"
                  class="form-input"
                  autocomplete="current-password"
                  @focus="pwFocused = true"
                  @blur="pwFocused = false"
                  @keyup.enter="handleLogin"
                />
                <q-icon
                  :name="showPw ? 'visibility_off' : 'visibility'"
                  size="18px"
                  class="toggle-ic cursor-pointer"
                  @click="showPw = !showPw"
                />
              </div>
            </div>

            <!-- Login Button -->
            <button type="submit" class="pos-login-btn" :disabled="loading">
              <q-spinner-dots v-if="loading" size="22px" color="white" />
              <template v-else>
                <q-icon name="login" size="20px" />
                <span>Sign In to POS</span>
              </template>
            </button>
          </q-form>

          <!-- Footer -->
          <div class="login-footer">
            <q-btn
              flat
              no-caps
              dense
              icon="arrow_back"
              label="Back to ERP Login"
              color="grey-6"
              size="sm"
              @click="$router.push('/auth/login')"
              class="back-link"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/auth'

const router = useRouter()
const $q = useQuasar()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const showPw = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const emailFocused = ref(false)
const pwFocused = ref(false)

// Clock
const timeStr = ref('')
const dateStr = ref('')
let clockInterval = null

function updateClock () {
  const now = new Date()
  timeStr.value = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  dateStr.value = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

const currentTime = computed(() => timeStr.value)
const currentDate = computed(() => dateStr.value)

onMounted(() => {
  updateClock()
  clockInterval = setInterval(updateClock, 1000)
})

onUnmounted(() => {
  if (clockInterval) clearInterval(clockInterval)
})

// POS Access roles — anyone with cashier/admin/manager role can access POS
const POS_ROLES = ['cashier', 'admin', 'manager', 'waiter']

const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = 'Please enter your email and password.'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const { error } = await authStore.signIn(email.value, password.value)

    if (error) {
      errorMessage.value = error.message || 'Invalid email or password'
      loading.value = false
      return
    }

    // Check if user has POS access role
    const hasAccess = authStore.roles.some(r => POS_ROLES.includes(r))
    if (!hasAccess) {
      errorMessage.value = 'Access denied. You do not have POS access permission.'
      await authStore.signOut()
      loading.value = false
      return
    }

    // Redirect to cashier station
    router.push('/cashier').catch(() => {})

    $q.notify({
      color: 'positive',
      message: `Welcome, ${authStore.userDisplayName || 'Cashier'}!`,
      caption: 'POS Terminal Ready',
      icon: 'point_of_sale',
      position: 'top',
      timeout: 2000,
    })
  } catch {
    errorMessage.value = 'An unexpected error occurred. Please try again.'
    loading.value = false
  }
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

.pos-login-page {
  min-height: 100vh;
  padding: 0 !important;
  font-family: 'Inter', 'Roboto', sans-serif;
}

.pos-login-container {
  display: flex;
  min-height: 100vh;
}

/* ─── LEFT: Branding ─────────────────────────────── */
.branding-panel {
  flex: 1;
  background: linear-gradient(160deg, #0a0e27 0%, #0d1840 40%, #1a237e 100%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
  padding: 40px;
}

.brand-overlay {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 30%, rgba(33, 150, 243, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(103, 58, 183, 0.12) 0%, transparent 50%),
    radial-gradient(circle at 50% 50%, rgba(0, 150, 136, 0.08) 0%, transparent 60%);
  pointer-events: none;
}

.brand-content {
  position: relative;
  z-index: 2;
  text-align: center;
}

.brand-logo-wrap {
  width: 90px;
  height: 90px;
  margin: 0 auto 24px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
}

.brand-logo {
  height: 60px;
  object-fit: contain;
}

.brand-title {
  font-size: 38px;
  font-weight: 900;
  color: #ffffff;
  margin: 0 0 8px;
  letter-spacing: -1px;
  line-height: 1.1;
}

.brand-desc {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 36px;
  font-weight: 500;
  letter-spacing: 2px;
  text-transform: uppercase;
}

/* Feature badges */
.feature-badges {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.feature-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(8px);
  min-width: 220px;
  transition: all 0.3s ease;
}

.feature-badge:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  transform: translateX(4px);
}

/* Clock */
.brand-clock {
  position: absolute;
  bottom: 40px;
  left: 40px;
  z-index: 2;
}

.clock-time {
  font-size: 28px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}

.clock-date {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.35);
  font-weight: 500;
}

/* ─── RIGHT: Login Form ────────────────────────────── */
.login-panel {
  width: 480px;
  min-width: 420px;
  background: #0d0f1a;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  position: relative;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}

.login-inner {
  width: 100%;
  max-width: 360px;
}

/* Header */
.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.pos-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: linear-gradient(135deg, #1565c0, #0d47a1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  box-shadow: 0 8px 32px rgba(21, 101, 192, 0.35);
}

.login-title {
  font-size: 26px;
  font-weight: 800;
  color: #ffffff;
  margin: 0 0 6px;
  letter-spacing: -0.5px;
}

.login-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
  font-weight: 400;
}

/* Error */
.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(220, 38, 38, 0.12);
  border: 1px solid rgba(220, 38, 38, 0.25);
  color: #f87171;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 20px;
}

.error-anim-enter-active { transition: all 0.3s ease; }
.error-anim-leave-active { transition: all 0.2s ease; }
.error-anim-enter-from { opacity: 0; transform: translateY(-8px); }
.error-anim-leave-to { opacity: 0; transform: translateY(-8px); }

/* Form */
.pos-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.input-wrap {
  display: flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 0 14px;
  height: 50px;
  background: rgba(255, 255, 255, 0.03);
  transition: all 0.25s ease;
  gap: 12px;
}

.input-wrap.focused {
  border-color: #1565c0;
  background: rgba(21, 101, 192, 0.06);
  box-shadow: 0 0 0 3px rgba(21, 101, 192, 0.12);
}

.input-wrap:hover:not(.focused) {
  border-color: rgba(255, 255, 255, 0.2);
}

.input-ic {
  color: rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
  transition: color 0.2s;
}

.input-wrap.focused .input-ic {
  color: #42a5f5;
}

.form-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  font-weight: 500;
  color: #ffffff;
  font-family: inherit;
  width: 100%;
}

.form-input:-webkit-autofill,
.form-input:-webkit-autofill:hover,
.form-input:-webkit-autofill:focus {
  transition: background-color 5000s ease-in-out 0s;
  -webkit-text-fill-color: #ffffff !important;
}

.form-input::placeholder {
  color: rgba(255, 255, 255, 0.2);
  font-weight: 400;
}

.toggle-ic {
  color: rgba(255, 255, 255, 0.25);
  flex-shrink: 0;
  transition: color 0.2s;
}

.toggle-ic:hover {
  color: #42a5f5;
}

/* Button */
.pos-login-btn {
  margin-top: 8px;
  height: 54px;
  background: linear-gradient(135deg, #1565c0 0%, #0d47a1 100%);
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  letter-spacing: 0.3px;
  transition: all 0.3s ease;
  box-shadow: 0 6px 24px rgba(21, 101, 192, 0.35);
  font-family: inherit;
}

.pos-login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 36px rgba(21, 101, 192, 0.45);
}

.pos-login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.pos-login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* Footer */
.login-footer {
  text-align: center;
  margin-top: 28px;
}

.back-link {
  font-weight: 500;
}

/* ─── Responsive ─────────────────────────────────── */
@media (max-width: 900px) {
  .pos-login-container {
    flex-direction: column;
  }
  .branding-panel {
    min-height: 260px;
    padding: 30px;
  }
  .brand-title {
    font-size: 28px;
  }
  .feature-badges {
    display: none;
  }
  .brand-clock {
    display: none;
  }
  .login-panel {
    width: 100%;
    min-width: unset;
    flex: 1;
    border-left: none;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
}
</style>
