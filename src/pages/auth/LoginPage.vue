<template>
  <q-page class="login-page">
    <!-- Full-screen split layout -->
    <div class="login-wrapper">
      <!-- Decorative Smart Background Elements for Mobile App Feel -->
      <div class="smart-bg-elements">
        <div class="bg-shape shape-1"></div>
        <div class="bg-shape shape-2"></div>
        <div class="bg-shape shape-3"></div>
      </div>

      <!-- LEFT: Form Panel -->
      <div class="form-panel">
        <!-- Logo -->
        <div class="brand">
          <img
            src="~assets/seven-waves-logo-transparent.webp"
            alt="Seven Waves"
            class="brand-logo"
            width="64"
            height="64"
            fetchpriority="high"
          />
          <div class="brand-text">
            <div class="brand-name">Seven Waves</div>
            <div class="brand-sub">Restaurant ERP</div>
          </div>
        </div>

        <!-- Form Area -->
        <div class="form-body">
          <div class="welcome-text">
            <h2 class="welcome-title">Welcome back 👋</h2>
            <p class="welcome-sub">Sign in to manage your restaurant</p>
          </div>

          <!-- Login Mode Toggle -->
          <div class="login-mode-toggle">
            <button
              class="mode-btn"
              :class="{ active: loginMode === 'email' }"
              @click="loginMode = 'email'"
            >
              <q-icon name="mail_outline" size="16px" class="q-mr-xs" />
              Email Login
            </button>
            <button
              class="mode-btn"
              :class="{ active: loginMode === 'code' }"
              @click="loginMode = 'code'"
            >
              <q-icon name="pin" size="16px" class="q-mr-xs" />
              User Code
            </button>
          </div>

          <!-- Error Banner -->
          <div v-if="errorMessage" class="error-banner">
            <q-icon name="error_outline" size="18px" class="q-mr-sm" />
            {{ errorMessage }}
            <q-btn
              flat
              dense
              round
              icon="close"
              size="xs"
              class="close-btn"
              @click="errorMessage = ''"
            />
          </div>

          <q-form @submit.prevent="handleLogin" class="login-form">
            <!-- EMAIL MODE -->
            <template v-if="loginMode === 'email'">
              <div class="field-group">
                <label class="field-label">Email Address</label>
                <div
                  class="custom-input-wrapper"
                  :class="{ focused: emailFocused, 'has-value': email }"
                >
                  <q-icon name="mail_outline" size="18px" class="input-icon" />
                  <input
                    v-model="email"
                    type="email"
                    placeholder="you@sevenwaves.lk"
                    class="custom-input"
                    autocomplete="email"
                    @focus="emailFocused = true"
                    @blur="emailFocused = false"
                  />
                </div>
              </div>
            </template>

            <!-- USER CODE MODE -->
            <template v-else>
              <div class="field-group">
                <label class="field-label">User Code</label>
                <div
                  class="custom-input-wrapper"
                  :class="{ focused: codeFocused, 'has-value': userCode }"
                >
                  <q-icon name="pin" size="18px" class="input-icon" />
                  <input
                    v-model="userCode"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    placeholder="Enter your numeric code (e.g. 1001)"
                    class="custom-input"
                    autocomplete="off"
                    maxlength="10"
                    @focus="codeFocused = true"
                    @blur="codeFocused = false"
                    @input="filterNumericOnly"
                  />
                </div>
              </div>
            </template>

            <!-- Password (shared) -->
            <div class="field-group">
              <label class="field-label">Password</label>
              <div
                class="custom-input-wrapper"
                :class="{ focused: pwFocused, 'has-value': password }"
              >
                <q-icon name="lock_outline" size="18px" class="input-icon" />
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="Enter your password"
                  class="custom-input"
                  autocomplete="current-password"
                  @focus="pwFocused = true"
                  @blur="pwFocused = false"
                  @keyup.enter="handleLogin"
                />
                <q-icon
                  :name="showPassword ? 'visibility_off' : 'visibility'"
                  size="18px"
                  class="toggle-icon cursor-pointer"
                  @click="showPassword = !showPassword"
                />
              </div>
            </div>

            <!-- Login Button -->
            <button
              type="submit"
              class="login-btn"
              :class="{ loading: loading }"
              :disabled="loading"
            >
              <q-spinner-dots v-if="loading" size="22px" color="white" />
              <template v-else>
                <q-icon name="login" size="18px" class="q-mr-sm" />
                Sign In
              </template>
            </button>
          </q-form>

        </div>

        <!-- Footer -->
        <div class="form-footer">
          <div>&copy; {{ new Date().getFullYear() }} Seven Waves &middot; All rights reserved</div>
        </div>
      </div>

      <!-- RIGHT: Image Panel -->
      <div class="image-panel">
        <!-- Overlay Gradient -->
        <div class="image-overlay"></div>

        <!-- Bottom left caption -->
        <div class="image-caption">
          <div class="caption-badge">
            <q-icon name="restaurant_menu" size="16px" class="q-mr-xs" />
            Premium Dining Experience
          </div>
          <h3 class="caption-title">
            Serve Smarter.<br />
            <span class="caption-accent">Grow Faster.</span>
          </h3>
        </div>

        <!-- Floating Stats -->
        <div class="floating-cards">
          <div class="stat-card">
            <q-icon name="receipt_long" size="20px" color="amber" />
            <div class="stat-info">
              <div class="stat-value">Real-Time</div>
              <div class="stat-label">KOT &amp; Orders</div>
            </div>
          </div>
          <div class="stat-card">
            <q-icon name="inventory_2" size="20px" color="light-green" />
            <div class="stat-info">
              <div class="stat-value">Live</div>
              <div class="stat-label">Inventory Sync</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from 'src/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const loginMode = ref('email') // 'email' or 'code'
const email = ref('')
const userCode = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const emailFocused = ref(false)
const codeFocused = ref(false)
const pwFocused = ref(false)

// Filter input to only allow digits
function filterNumericOnly(e) {
  userCode.value = e.target.value.replace(/\D/g, '')
}

const handleLogin = async () => {
  errorMessage.value = ''

  // Validation based on mode
  if (loginMode.value === 'email') {
    if (!email.value || !password.value) {
      errorMessage.value = 'Please enter your email and password.'
      return
    }
  } else {
    if (!userCode.value || !password.value) {
      errorMessage.value = 'Please enter your user code and password.'
      return
    }
    if (!/^\d+$/.test(userCode.value)) {
      errorMessage.value = 'User code must contain only numbers.'
      return
    }
  }

  loading.value = true

  try {
    let result

    if (loginMode.value === 'email') {
      // Standard email/password login
      result = await authStore.signIn(email.value, password.value)
    } else {
      // Numeric code login via Edge Function
      result = await authStore.signInWithCode(userCode.value, password.value)
    }

    if (result.error) {
      errorMessage.value = result.error.message || 'Invalid credentials'
      loading.value = false
      return
    }

    // Role-based redirect
    let redirect = '/dashboard'
    if (authStore.hasRole('kitchen') && !authStore.isAdmin && !authStore.hasRole('manager')) {
      redirect = '/kitchen'
    } else if (
      authStore.hasRole('cashier') &&
      !authStore.isAdmin &&
      !authStore.hasRole('manager')
    ) {
      redirect = '/pos'
    } else if (authStore.hasRole('waiter') && !authStore.isAdmin && !authStore.hasRole('manager')) {
      redirect = '/waiter-app'
    }

    router.push(redirect).catch(() => {})
  } catch {
    errorMessage.value = 'An unexpected error occurred. Please try again.'
    loading.value = false
  }
}
</script>

<style scoped>
/* ─── Page Reset ─────────────────────────────────── */
.login-page {
  min-height: 100vh;
  padding: 0 !important;
  background: transparent !important;
  /* Prevent Quasar page min-height from triggering CLS */
  contain: layout style;
}

.login-wrapper {
  display: flex;
  height: 100vh;
  min-height: 100vh;
  font-family: 'Inter', 'Roboto', sans-serif;
  position: relative;
  /* Prevent child reflows from shifting surrounding content */
  contain: layout;
}

/* ─── SMART BACKGROUND ELEMENTS ──────────────────── */
.smart-bg-elements {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
  display: none; /* Visible only on mobile where right panel is hidden */
}

.bg-shape {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.65;
  animation: floatShape 12s infinite alternate ease-in-out;
}

.shape-1 {
  width: 350px;
  height: 350px;
  background: linear-gradient(135deg, #1565c0, #0ea5e9);
  top: -100px;
  right: -100px;
  animation-delay: 0s;
}

.shape-2 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #0d47a1, #1e3a8a);
  bottom: -150px;
  left: -150px;
  animation-delay: -4s;
}

.shape-3 {
  width: 250px;
  height: 250px;
  background: linear-gradient(135deg, #f59e0b, #ea580c);
  top: 35%;
  left: 60%;
  opacity: 0.35;
  filter: blur(70px);
  animation-delay: -7s;
}

@keyframes floatShape {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(30px, -40px) scale(1.05); }
  100% { transform: translate(-20px, 30px) scale(0.95); }
}

/* ─── LEFT PANEL ─────────────────────────────────── */
.form-panel {
  width: 420px;
  min-width: 380px;
  height: 100vh;
  max-height: 100vh;
  overflow-y: auto;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  padding: 32px 44px;
  position: relative;
  z-index: 2;
  box-shadow: 10px 0 50px rgba(0, 0, 0, 0.5);
  border-right: 1px solid rgba(0, 0, 0, 0.05);
  /* Prevent internal reflows from shifting the layout */
  contain: layout style;
}

/* Brand */
.brand {
  display: flex;
  margin-bottom: 24px;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}
.brand-logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  /* Prevent image load from shifting layout */
  aspect-ratio: 1 / 1;
}
.brand-text {
  display: flex;
  flex-direction: column;
}
.brand-name {
  font-size: 22px;
  font-weight: 800;
  color: #0d1117;
  letter-spacing: -0.5px;
  line-height: 1.1;
}
.brand-sub {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Login Mode Toggle */
.login-mode-toggle {
  display: flex;
  background: #f1f5f9;
  border-radius: 10px;
  padding: 4px;
  margin-bottom: 16px;
  gap: 4px;
  flex-shrink: 0;
  /* Reserve space to prevent CLS when buttons render */
  min-height: 40px;
}
.mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
  font-family: inherit;
  gap: 4px;
  /* Reserve fixed height to prevent CLS */
  min-height: 32px;
}
.mode-btn:hover:not(.active) {
  color: #334155;
  background: rgba(255, 255, 255, 0.5);
}
.mode-btn.active {
  background: #ffffff;
  color: #1565c0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* Welcome */
.form-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.welcome-title {
  font-size: 28px;
  font-weight: 700;
  color: #0d1117;
  margin: 0 0 6px;
  letter-spacing: -0.5px;
}
.welcome-sub {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 16px;
}

/* Error */
.error-banner {
  display: flex;
  align-items: center;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 20px;
  position: relative;
}
.close-btn {
  margin-left: auto;
  color: #dc2626;
}

/* Fields */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  /* Reserve approximate height for the form to avoid shifts */
  min-height: 280px;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.custom-input-wrapper {
  display: flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0 14px;
  height: 48px;
  background: #ffffff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
  gap: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.custom-input-wrapper.focused {
  border-color: #1565c0;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(21, 101, 192, 0.12);
}
.custom-input-wrapper:hover:not(.focused) {
  border-color: #94a3b8;
}
.input-icon {
  color: #64748b;
  flex-shrink: 0;
  transition: color 0.2s;
}
.custom-input-wrapper.focused .input-icon {
  color: #1565c0;
}
.custom-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  font-weight: 500;
  color: #111827;
  font-family: inherit;
  width: 100%;
}
.custom-input:-webkit-autofill,
.custom-input:-webkit-autofill:hover,
.custom-input:-webkit-autofill:focus,
.custom-input:-webkit-autofill:active {
  transition: background-color 5000s ease-in-out 0s;
  -webkit-text-fill-color: #111827 !important;
}
.custom-input::placeholder {
  color: #94a3b8;
  font-weight: 400;
}
.toggle-icon {
  color: #9ca3af;
  flex-shrink: 0;
  transition: color 0.2s;
}
.toggle-icon:hover {
  color: #1565c0;
}

/* Code hint */
.code-hint {
  display: flex;
  align-items: center;
  margin-top: 14px;
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
}

/* Login Button */
.login-btn {
  margin-top: 8px;
  height: 52px;
  background: linear-gradient(135deg, #1565c0 0%, #0d47a1 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  letter-spacing: 0.3px;
  transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.25s ease;
  box-shadow: 0 4px 18px rgba(21, 101, 192, 0.3);
  width: 100%;
}
.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(21, 101, 192, 0.4);
}
.login-btn:active:not(:disabled) {
  transform: translateY(0);
}
.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* Footer */
.form-footer {
  flex-shrink: 0;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  padding-top: 16px;
  margin-top: auto;
}

/* ─── RIGHT PANEL ─────────────────────────────────── */
.image-panel {
  flex: 1;
  background-image: url('../../assets/login-food-bg.png');
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
}
.image-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.3) 0%,
    rgba(0, 0, 0, 0) 25%,
    rgba(0, 0, 0, 0) 65%,
    rgba(0, 0, 0, 0.8) 100%
  );
}

/* Caption */
.image-caption {
  position: absolute;
  bottom: 48px;
  left: 48px;
  right: 48px;
  z-index: 2;
}
.caption-badge {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 20px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 14px;
}
.caption-title {
  font-size: 36px;
  font-weight: 800;
  color: #fff;
  margin: 0 0 10px;
  line-height: 1.2;
  letter-spacing: -0.5px;
}
.caption-accent {
  color: #ffd54f;
}

/* Floating stats */
.floating-cards {
  position: absolute;
  top: 40px;
  right: 36px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 2;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  padding: 12px 18px;
  min-width: 170px;
  transition: transform 0.25s ease;
}
.stat-card:hover {
  transform: translateX(-4px);
}
.stat-info {
  line-height: 1.2;
}
.stat-value {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}
.stat-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ─── MOBILE RESPONSIVE ──────────────────────────── */
@media (max-width: 768px) {
  /* Standard gradient fallback for responsive shrunk-desktop view */
  .login-wrapper {
    flex-direction: column;
    height: auto;
    min-height: 100vh;
    align-items: center;
    justify-content: center;
    padding: 24px 20px;
    box-sizing: border-box;
    background: linear-gradient(160deg, #0d1b3e 0%, #1a2d5a 35%, #0d47a1 75%, #1565c0 100%);
  }

  /* Hide the food background panel on mobile */
  .image-panel {
    display: none;
  }

  /* Card floats over the gradient */
  .form-panel {
    width: 100%;
    min-width: unset;
    max-width: 440px;
    height: auto;
    max-height: none;
    min-height: unset;
    overflow-y: visible;
    padding: 28px 24px 24px;
    border-radius: 20px;
    box-shadow:
      0 24px 60px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.97);
    border-right: none;
  }

  /* Brand: centered row on mobile */
  .brand {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 20px;
    padding-bottom: 18px;
    border-bottom: 1px solid #f1f5f9;
  }
  .brand-logo {
    width: 42px;
    height: 42px;
  }
  .brand-name {
    font-size: 19px;
  }
  .brand-sub {
    font-size: 10px;
  }

  /* Form body: flow naturally instead of vertically centering */
  .form-body {
    flex: none;
    justify-content: flex-start;
  }

  /* Center welcome text on mobile */
  .welcome-title {
    font-size: 22px;
    text-align: center;
    margin-bottom: 4px;
  }
  .welcome-sub {
    font-size: 13px;
    text-align: center;
    margin-bottom: 20px;
  }

  /* Bigger touch targets */
  .custom-input-wrapper {
    height: 52px;
  }
  /* 16px minimum prevents iOS auto-zoom on focus */
  .custom-input {
    font-size: 16px;
  }

  .login-btn {
    height: 56px;
    font-size: 16px;
    border-radius: 14px;
    margin-top: 12px;
  }

  .mode-btn {
    padding: 10px 10px;
    font-size: 12px;
  }

  .form-footer {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #f1f5f9;
  }
}

/* Extra-small phones (≤380px) */
@media (max-width: 380px) {
  .login-wrapper {
    padding: 16px 14px;
  }
  .form-panel {
    padding: 22px 18px 20px;
  }
  .welcome-title {
    font-size: 20px;
  }
}

/* ─── SMART BACKGROUND STRICTLY FOR ACTUAL MOBILE DEVICES ─── */
body.mobile .login-wrapper,
body.capacitor .login-wrapper {
  background: #090e17 !important; /* Very dark rich blue as the base */
}

body.mobile .smart-bg-elements,
body.capacitor .smart-bg-elements {
  display: block; /* Reveal on mobile OS */
}
</style>
