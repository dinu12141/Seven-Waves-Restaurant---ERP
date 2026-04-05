<template>
  <!-- Full-screen lock overlay — rendered ON TOP of the POS terminal -->
  <teleport to="body">
    <transition name="lock-fade">
      <div v-if="modelValue" class="pos-lock-overlay" @click.self="() => {}">
        <div class="lock-card">
          <!-- Header -->
          <div class="lock-header">
            <div class="lock-logo">
              <q-icon name="point_of_sale" size="36px" color="white" />
            </div>
            <div class="lock-title">Seven Waves POS</div>
            <div class="lock-subtitle">Terminal Locked — Sign in to continue</div>
          </div>

          <!-- Previous cashier chip -->
          <div v-if="previousCashier" class="prev-cashier-chip">
            <q-icon name="person_off" size="14px" class="q-mr-xs" />
            <span>{{ previousCashier }} signed out</span>
          </div>

          <!-- Login Form -->
          <form class="lock-form" @submit.prevent="handleSignIn">
            <!-- Email / User Code -->
            <div class="lock-field">
              <label class="lock-label">User Code / Email</label>
              <div class="lock-input-wrap" :class="{ 'has-error': !!loginError }">
                <q-icon name="pin" size="18px" class="field-icon" />
                <input
                  v-model="email"
                  type="text"
                  class="lock-input"
                  placeholder="Enter User Code or Email"
                  :disabled="loading"
                  @input="loginError = ''"
                  ref="codeInputRef"
                />
              </div>
            </div>

            <!-- Password -->
            <div class="lock-field">
              <label class="lock-label">Password</label>
              <div class="lock-input-wrap" :class="{ 'has-error': !!loginError }">
                <q-icon name="lock_outline" size="18px" class="field-icon" />
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  class="lock-input"
                  placeholder="••••••••"
                  autocomplete="current-password"
                  :disabled="loading"
                  @input="loginError = ''"
                />
                <button
                  type="button"
                  class="show-pw-btn"
                  @click="showPassword = !showPassword"
                  tabindex="-1"
                >
                  <q-icon :name="showPassword ? 'visibility_off' : 'visibility'" size="16px" />
                </button>
              </div>
            </div>

            <!-- Error banner -->
            <transition name="err-slide">
              <div v-if="loginError" class="lock-error">
                <q-icon name="error_outline" size="14px" class="q-mr-xs" />
                {{ loginError }}
              </div>
            </transition>

            <!-- Sign In button -->
            <button
              type="submit"
              class="lock-signin-btn"
              :disabled="loading || !email || !password"
            >
              <q-spinner-dots v-if="loading" color="white" size="20px" />
              <template v-else>
                <q-icon name="login" size="18px" class="q-mr-sm" />
                Unlock Terminal
              </template>
            </button>
          </form>

          <!-- Footer note -->
          <div class="lock-footer-note">
            <q-icon name="security" size="12px" class="q-mr-xs" />
            Enter your cashier code to continue
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useAuthStore } from 'src/stores/auth'
import { Notify } from 'quasar'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  /** Name of the cashier who just logged out — shown in the chip */
  previousCashier: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue', 'signed-in'])

const authStore = useAuthStore()

const email = ref('') // Used for both email and user code
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const loginError = ref('')
const codeInputRef = ref(null)

// Focus first field when locked
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      email.value = ''
      password.value = ''
      showPassword.value = false
      loginError.value = ''
      setTimeout(() => {
        codeInputRef.value?.focus()
      }, 300)
    }
  },
)

onMounted(() => {
  if (props.modelValue) {
    setTimeout(() => {
      codeInputRef.value?.focus()
    }, 500)
  }
})

async function handleSignIn() {
  if (!email.value || !password.value) return

  loading.value = true
  loginError.value = ''

  try {
    let result
    // If input is purely numeric, assume it's a User Code
    if (/^\d+$/.test(email.value)) {
      result = await authStore.signInWithCode(email.value, password.value)
    } else {
      result = await authStore.signIn(email.value, password.value)
    }

    if (result.error) {
      loginError.value = result.error.message || 'Invalid credentials'
      return
    }

    // ── Role check: only cashier / admin / manager may use POS ─────
    const allowedRoles = ['cashier', 'admin', 'manager']
    const userRoles = authStore.roles || []
    const hasAccess = allowedRoles.some((r) => userRoles.includes(r))

    if (!hasAccess) {
      loginError.value = 'This account does not have POS / cashier access'
      // Sign them back out silently
      await authStore.signOut()
      return
    }

    // ── Success ────────────────────────────────────────────────────
    Notify.create({
      message: `Welcome, ${authStore.profile?.full_name || authStore.user?.email || 'Cashier'}!`,
      caption: 'POS terminal unlocked',
      color: 'positive',
      icon: 'verified',
      position: 'top',
      timeout: 2500,
    })

    emit('update:modelValue', false)
    emit('signed-in', authStore.user)
  } catch (err) {
    loginError.value = err.message || 'Sign in failed. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
/* ── Lock Overlay ──────────────────────────────────────── */
.pos-lock-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: overlay-in 0.25s ease;
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ── Lock Card ─────────────────────────────────────────── */
.lock-card {
  width: 380px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(37, 99, 235, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  overflow: hidden;
  animation: card-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* ── Header ────────────────────────────────────────────── */
.lock-header {
  background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
  padding: 22px 24px 18px;
  text-align: center;
}

.lock-logo {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
}

.lock-title {
  font-size: 1.15rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.5px;
  margin-bottom: 2px;
}

.lock-subtitle {
  font-size: 0.73rem;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 400;
}

/* ── Previous cashier chip ─────────────────────────────── */
.prev-cashier-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.08);
  border-bottom: 1px solid rgba(251, 191, 36, 0.15);
  padding: 6px 16px;
}

/* ── Form ──────────────────────────────────────────────── */
.lock-form {
  padding: 22px 24px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.lock-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.lock-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.lock-input-wrap {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 0 10px;
  height: 42px;

  &:focus-within {
    border-color: rgba(37, 99, 235, 0.6);
    background: rgba(37, 99, 235, 0.05);
  }
}

.field-icon {
  color: rgba(255, 255, 255, 0.3);
  margin-right: 8px;
}

.lock-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #fff;
  font-size: 0.85rem;
}

.show-pw-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
}

/* ── Error ─────────────────────────────────────────────── */
.lock-error {
  display: flex;
  align-items: center;
  background: rgba(220, 38, 38, 0.1);
  border: 1px solid rgba(220, 38, 38, 0.2);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.73rem;
  color: #fca5a5;
}

/* ── Sign In Button ────────────────────────────────────── */
.lock-signin-btn {
  height: 44px;
  border-radius: 8px;
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  border: none;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #1e40af, #1d4ed8);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}


/* ── Footer note ───────────────────────────────────────── */
.lock-footer-note {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.2);
  padding: 0 28px 20px;
}

/* ── Transition for the overlay itself ─────────────────── */
.lock-fade-enter-active,
.lock-fade-leave-active {
  transition: opacity 0.25s ease;
}
.lock-fade-enter-from,
.lock-fade-leave-to {
  opacity: 0;
}
</style>
