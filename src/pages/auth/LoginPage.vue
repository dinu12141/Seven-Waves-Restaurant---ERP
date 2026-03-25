<template>
  <q-page class="login-page">
    <!-- Full-screen split layout -->
    <div class="login-wrapper">
      <!-- LEFT: Form Panel -->
      <div class="form-panel">
        <!-- Logo -->
        <div class="brand">
          <img
            src="~assets/seven-waves-logo-transparent.png"
            alt="Seven Waves"
            class="brand-logo"
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
            <!-- Email -->
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

            <!-- Password -->
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
              <div class="stat-label">KOT & Orders</div>
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

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const emailFocused = ref(false)
const pwFocused = ref(false)

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

    let redirect = '/dashboard'
    // Kitchen role check FIRST — a kitchen user must land on kitchen display
    // even if they also have cashier role
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
}

.login-wrapper {
  display: flex;
  min-height: 100vh;
  font-family: 'Inter', 'Roboto', sans-serif;
}

/* ─── LEFT PANEL ─────────────────────────────────── */
.form-panel {
  width: 420px;
  min-width: 380px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  padding: 36px 44px;
  position: relative;
  z-index: 2;
  box-shadow: 10px 0 50px rgba(0, 0, 0, 0.5);
  border-right: 1px solid rgba(0, 0, 0, 0.05);
}

/* Brand */
.brand {
  display: flex;
  margin-bottom: 52px;
  align-items: center;
  gap: 16px;
}
.brand-logo {
  height: 64px;
  object-fit: contain;
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
  margin: 0 0 28px;
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
  transition: all 0.2s ease;
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

/* Button */
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
  transition: all 0.25s ease;
  box-shadow: 0 4px 18px rgba(21, 101, 192, 0.3);
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
.caption-desc {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.75);
  margin: 0;
  max-width: 380px;
  line-height: 1.6;
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

/* ─── RESPONSIVE ─────────────────────────────────── */
@media (max-width: 768px) {
  .login-wrapper {
    flex-direction: column;
  }
  .form-panel {
    width: 100%;
    min-width: unset;
    padding: 28px 24px;
    min-height: 100vh;
  }
  .image-panel {
    display: none;
  }
}
</style>
