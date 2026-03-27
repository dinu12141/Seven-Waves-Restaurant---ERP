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
            <!-- Email -->
            <div class="lock-field">
              <label class="lock-label">Email / Username</label>
              <div class="lock-input-wrap" :class="{ 'has-error': !!loginError }">
                <q-icon name="mail_outline" size="18px" class="field-icon" />
                <input
                  v-model="email"
                  type="email"
                  class="lock-input"
                  placeholder="cashier@sevenwaves.lk"
                  autocomplete="email"
                  :disabled="loading"
                  @input="loginError = ''"
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
            <button type="submit" class="lock-signin-btn" :disabled="loading || !email || !password">
              <q-spinner-dots v-if="loading" color="white" size="20px" />
              <template v-else>
                <q-icon name="login" size="18px" class="q-mr-sm" />
                Sign In to POS
              </template>
            </button>
          </form>

          <!-- Footer note -->
          <div class="lock-footer-note">
            <q-icon name="security" size="12px" class="q-mr-xs" />
            Only cashier-role accounts can access this terminal
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
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

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const loginError = ref('')

// Cleared fields whenever the lock screen opens
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      email.value = ''
      password.value = ''
      showPassword.value = false
      loginError.value = ''
    }
  },
)

async function handleSignIn() {
  if (!email.value || !password.value) return

  loading.value = true
  loginError.value = ''

  try {
    const { error } = await authStore.signIn(email.value, password.value)

    if (error) {
      loginError.value = error.message || 'Invalid credentials'
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
      message: `Welcome, ${authStore.profile?.full_name || authStore.user?.email}!`,
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
  background: rgba(7, 12, 22, 0.88);
  backdrop-filter: blur(14px) saturate(0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: overlay-in 0.25s ease;
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ── Lock Card ─────────────────────────────────────────── */
.lock-card {
  width: 420px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow:
    0 32px 80px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(37, 99, 235, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  overflow: hidden;
  animation: card-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* ── Header ────────────────────────────────────────────── */
.lock-header {
  background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%);
  padding: 28px 28px 22px;
  text-align: center;
}

.lock-logo {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.lock-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.5px;
  margin-bottom: 4px;
}

.lock-subtitle {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.65);
  font-weight: 400;
}

/* ── Previous cashier chip ─────────────────────────────── */
.prev-cashier-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.73rem;
  color: rgba(255, 165, 0, 0.85);
  background: rgba(245, 158, 11, 0.08);
  border-bottom: 1px solid rgba(245, 158, 11, 0.15);
  padding: 8px 16px;
}

/* ── Form ──────────────────────────────────────────────── */
.lock-form {
  padding: 26px 28px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lock-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lock-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.lock-input-wrap {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 0 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
  height: 46px;

  &:focus-within {
    border-color: rgba(37, 99, 235, 0.6);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    background: rgba(37, 99, 235, 0.05);
  }

  &.has-error {
    border-color: rgba(220, 38, 38, 0.5);
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.08);
  }
}

.field-icon {
  color: rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
  margin-right: 10px;
}

.lock-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #f8fafc;
  font-size: 0.9rem;
  font-family: inherit;

  &::placeholder {
    color: rgba(255, 255, 255, 0.2);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.show-pw-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.15s;

  &:hover {
    color: rgba(255, 255, 255, 0.7);
  }
}

/* ── Error ─────────────────────────────────────────────── */
.lock-error {
  display: flex;
  align-items: center;
  background: rgba(220, 38, 38, 0.1);
  border: 1px solid rgba(220, 38, 38, 0.25);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.78rem;
  color: #fca5a5;
}

.err-slide-enter-active,
.err-slide-leave-active {
  transition: all 0.2s ease;
}
.err-slide-enter-from,
.err-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ── Sign In Button ────────────────────────────────────── */
.lock-signin-btn {
  height: 48px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  border: none;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35);
  margin-top: 4px;

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #1e40af, #1d4ed8);
    box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
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
