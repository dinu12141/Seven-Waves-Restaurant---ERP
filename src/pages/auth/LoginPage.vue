<template>
  <q-page class="login-page row justify-center items-center">
    <!-- Background particles / ambient effect -->
    <div class="bg-ambient">
      <div class="ambient-orb orb-1"></div>
      <div class="ambient-orb orb-2"></div>
      <div class="ambient-orb orb-3"></div>
    </div>

    <div class="row login-container shadow-24" style="max-width: 960px; width: 100%">
      <!-- Left Panel: Branding -->
      <div class="col-md-5 col-12 left-branding column justify-center items-center q-pa-xl gt-sm">
        <div class="text-center">
          <!-- Logo -->
          <div class="logo-wrapper q-mb-lg">
            <q-icon name="restaurant" size="56px" color="white" />
          </div>

          <h4 class="text-white text-weight-bold q-mb-sm q-mt-none" style="letter-spacing: 1px">
            Seven Waves
          </h4>
          <div class="text-blue-2 text-body2" style="opacity: 0.8; letter-spacing: 0.5px">
            Restaurant ERP System
          </div>

          <!-- Decorative line -->
          <div class="divider-line q-my-lg"></div>

          <div class="text-blue-3 text-caption" style="opacity: 0.6; line-height: 1.6">
            Manage orders, kitchen, inventory,<br />
            finance, and more — all in one place.
          </div>
        </div>
      </div>

      <!-- Right Panel: Login Form -->
      <div class="col-md-7 col-12 right-form column justify-center q-pa-xl">
        <!-- Mobile logo (shown only on small screens) -->
        <div class="text-center q-mb-lg lt-md">
          <q-icon name="restaurant" size="40px" color="primary" />
          <div class="text-h6 text-white text-weight-bold q-mt-sm">Seven Waves ERP</div>
        </div>

        <div class="form-inner" style="max-width: 380px; margin: 0 auto; width: 100%">
          <div class="text-h5 text-white text-weight-bold q-mb-xs">Sign In</div>
          <div class="text-grey-5 text-body2 q-mb-lg">
            Enter your credentials to access the system
          </div>

          <!-- Error Alert -->
          <q-banner
            v-if="errorMessage"
            class="bg-red-9 text-white q-mb-md rounded-borders"
            dense
            rounded
          >
            <template v-slot:avatar>
              <q-icon name="error" />
            </template>
            {{ errorMessage }}
            <template v-slot:action>
              <q-btn flat dense icon="close" @click="errorMessage = ''" />
            </template>
          </q-banner>

          <!-- Login Form -->
          <q-form @submit.prevent="handleLogin" class="q-gutter-y-md">
            <!-- Email -->
            <div>
              <label class="text-grey-4 text-caption text-weight-medium q-mb-xs block">
                EMAIL ADDRESS
              </label>
              <q-input
                v-model="email"
                type="email"
                placeholder="Enter your email"
                dense
                outlined
                dark
                color="primary"
                class="login-field"
                autocomplete="email"
                :rules="[
                  (val) => !!val || 'Email is required',
                  (val) => val.includes('@') || 'Enter a valid email',
                ]"
                lazy-rules
                hide-bottom-space
              >
                <template v-slot:prepend>
                  <q-icon name="mail_outline" size="18px" color="grey-5" />
                </template>
              </q-input>
            </div>

            <!-- Password -->
            <div>
              <label class="text-grey-4 text-caption text-weight-medium q-mb-xs block">
                PASSWORD
              </label>
              <q-input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your password"
                dense
                outlined
                dark
                color="primary"
                class="login-field"
                autocomplete="current-password"
                :rules="[(val) => !!val || 'Password is required']"
                lazy-rules
                hide-bottom-space
                @keyup.enter="handleLogin"
              >
                <template v-slot:prepend>
                  <q-icon name="lock_outline" size="18px" color="grey-5" />
                </template>
                <template v-slot:append>
                  <q-icon
                    :name="showPassword ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    size="18px"
                    color="grey-5"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>
            </div>

            <!-- Remember + Forgot -->
            <div class="row items-center justify-between q-mt-sm">
              <q-checkbox
                v-model="rememberMe"
                label="Remember me"
                dark
                dense
                color="primary"
                class="text-grey-5 text-caption"
              />
              <a href="#" class="text-primary text-caption text-weight-medium forgot-link">
                Forgot password?
              </a>
            </div>

            <!-- Login Button -->
            <q-btn
              unelevated
              no-caps
              type="submit"
              color="primary"
              class="full-width login-btn q-mt-md"
              :loading="loading"
              :disable="loading"
              size="lg"
            >
              <q-icon name="login" class="q-mr-sm" size="20px" />
              Sign In
              <template v-slot:loading>
                <q-spinner-dots class="on-left" size="20px" />
                Signing in...
              </template>
            </q-btn>
          </q-form>

          <!-- Footer -->
          <div class="text-center q-mt-xl">
            <div class="text-grey-6 text-caption">
              &copy; 2026 Seven Waves &middot; All rights reserved
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
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/auth'

const router = useRouter()
const $q = useQuasar()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const rememberMe = ref(false)
const loading = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
  if (!email.value || !password.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    const { error } = await authStore.signIn(email.value, password.value)

    if (error) {
      errorMessage.value = error.message || 'Invalid email or password'
      loading.value = false
      return
    }

    // Navigate IMMEDIATELY — don't wait for anything
    const redirect = router.currentRoute.value.query.redirect || authStore.defaultLandingPage
    router.push(redirect)

    // Toast fires in background — doesn't block navigation
    $q.notify({
      color: 'positive',
      message: `Welcome back!`,
      icon: 'check_circle',
      position: 'top',
      timeout: 1200,
    })
  } catch {
    errorMessage.value = 'An unexpected error occurred. Please try again.'
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  background: #0d1117;
  position: relative;
  overflow: hidden;
}

/* ── Ambient Background ── */
.bg-ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.ambient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;

  &.orb-1 {
    width: 500px;
    height: 500px;
    background: #1976d2;
    top: -150px;
    left: -100px;
    animation: float 12s ease-in-out infinite;
  }

  &.orb-2 {
    width: 400px;
    height: 400px;
    background: #26a69a;
    bottom: -100px;
    right: -100px;
    animation: float 15s ease-in-out infinite reverse;
  }

  &.orb-3 {
    width: 250px;
    height: 250px;
    background: #7c4dff;
    top: 40%;
    right: 20%;
    animation: float 10s ease-in-out infinite 2s;
  }
}

@keyframes float {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(30px, -20px) scale(1.05);
  }
  66% {
    transform: translate(-20px, 15px) scale(0.95);
  }
}

/* ── Login Container ── */
.login-container {
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

/* ── Left Branding ── */
.left-branding {
  background: linear-gradient(160deg, #1565c0 0%, #0d47a1 50%, #1a237e 100%);
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 30% 70%, rgba(255, 255, 255, 0.05) 0%, transparent 70%);
  }
}

.logo-wrapper {
  width: 100px;
  height: 100px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
}

.divider-line {
  width: 40px;
  height: 3px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  margin: 0 auto;
}

/* ── Right Form ── */
.right-form {
  background: #161b22;
}

/* ── Input Fields ── */
.login-field {
  :deep(.q-field__control) {
    height: 44px;
    min-height: 44px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.25s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.18);
    }
  }

  :deep(.q-field--focused .q-field__control) {
    background: rgba(25, 118, 210, 0.06);
    border-color: #1976d2;
    box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.12);
  }

  :deep(.q-field__native) {
    color: #e6edf3 !important;
    font-size: 0.9rem;

    &::placeholder {
      color: #484f58 !important;
    }
  }

  :deep(.q-field__control:before) {
    border: none !important;
  }

  :deep(.q-field__control:after) {
    border: none !important;
  }
}

/* ── Login Button ── */
.login-btn {
  height: 48px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  letter-spacing: 0.3px;
  background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
  transition: all 0.25s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(25, 118, 210, 0.35);
  }

  &:active {
    transform: translateY(0);
  }
}

/* ── Forgot Link ── */
.forgot-link {
  text-decoration: none;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.8;
  }
}

/* ── Responsive ── */
@media (max-width: 1023px) {
  .login-container {
    margin: 16px;
    max-width: 440px !important;
  }
}

@media (max-width: 599px) {
  .login-container {
    margin: 12px;
    border-radius: 12px;
  }

  .right-form {
    padding: 24px !important;
  }
}
</style>
