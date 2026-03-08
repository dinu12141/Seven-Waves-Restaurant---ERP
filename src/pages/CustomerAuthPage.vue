<template>
  <div class="auth-root">
    <!-- Ambient Background Effects -->
    <div class="bg-layer">
      <div class="bg-orb bg-orb--1" />
      <div class="bg-orb bg-orb--2" />
      <div class="bg-orb bg-orb--3" />
      <div class="bg-grid" />
    </div>

    <transition name="card-pop" appear>
      <div class="auth-card">
        <!-- Brand Header -->
        <div class="brand-row">
          <div class="brand-icon">
            <q-icon name="restaurant" size="22px" color="white" />
          </div>
          <div>
            <div class="brand-name">SEVEN WAVES</div>
            <div class="brand-sub">
              <q-icon name="table_restaurant" size="12px" class="q-mr-xs" />
              {{ tableLabel }}
            </div>
          </div>
          <q-space />
          <div v-if="tableNumber" class="table-badge">
            <q-icon name="place" size="14px" />
            Table {{ tableNumber }}
          </div>
        </div>

        <!-- Tab Switcher -->
        <div class="auth-tabs">
          <button
            id="tab-login"
            class="auth-tab"
            :class="{ 'auth-tab--active': activeTab === 'login' }"
            @click="activeTab = 'login'"
          >
            <q-icon name="login" size="16px" class="q-mr-xs" />
            Sign In
          </button>
          <button
            id="tab-register"
            class="auth-tab"
            :class="{ 'auth-tab--active': activeTab === 'register' }"
            @click="activeTab = 'register'"
          >
            <q-icon name="person_add" size="16px" class="q-mr-xs" />
            Register
          </button>
        </div>

        <!-- ── LOGIN FORM ──────────────────────────────────────────────────── -->
        <transition name="step" mode="out-in">
          <div v-if="activeTab === 'login'" key="login">
            <div class="step-heading">
              <div class="step-title">Welcome Back! 👋</div>
              <div class="step-sub">Sign in with your email to access the menu</div>
            </div>

            <div class="field-group">
              <label class="field-label">Email Address</label>
              <div
                class="input-wrap"
                :class="{ 'input-wrap--focus': focusedField === 'login_email' }"
              >
                <q-icon name="mail_outline" size="18px" class="input-icon" />
                <q-input
                  v-model="loginForm.email"
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  dense
                  borderless
                  class="flex-1"
                  input-class="auth-input-native"
                  @keyup.enter="focusField('login_password')"
                  @focus="focusedField = 'login_email'"
                  @blur="focusedField = ''"
                />
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">Password</label>
              <div
                class="input-wrap"
                :class="{ 'input-wrap--focus': focusedField === 'login_password' }"
              >
                <q-icon name="lock_outline" size="18px" class="input-icon" />
                <q-input
                  v-model="loginForm.password"
                  id="login-password"
                  :type="showLoginPass ? 'text' : 'password'"
                  placeholder="Your password"
                  dense
                  borderless
                  class="flex-1"
                  input-class="auth-input-native"
                  @keyup.enter="handleLogin"
                  @focus="focusedField = 'login_password'"
                  @blur="focusedField = ''"
                />
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  :icon="showLoginPass ? 'visibility_off' : 'visibility'"
                  class="text-grey-5"
                  @click="showLoginPass = !showLoginPass"
                />
              </div>
            </div>

            <div v-if="authError" class="error-box">
              <q-icon name="error_outline" size="14px" class="q-mr-xs" />
              {{ authError }}
            </div>

            <q-btn
              unelevated
              no-caps
              id="btn-login-submit"
              class="cta-btn full-width q-mt-lg"
              :loading="isLoading"
              @click="handleLogin"
            >
              <q-icon name="login" class="q-mr-sm" />
              <span>Sign In to Menu</span>
              <template #loading>
                <q-spinner-dots color="white" size="1.4em" />
              </template>
            </q-btn>

            <button class="skip-link" @click="skipAuth">Browse without signing in</button>
          </div>

          <!-- ── REGISTER FORM ─────────────────────────────────────────────── -->
          <div v-else key="register">
            <div class="step-heading">
              <div class="step-title">Join the Experience ✨</div>
              <div class="step-sub">Create your account to earn loyalty rewards</div>
            </div>

            <div class="field-group">
              <label class="field-label">Full Name *</label>
              <div class="input-wrap" :class="{ 'input-wrap--focus': focusedField === 'reg_name' }">
                <q-icon name="person_outline" size="18px" class="input-icon" />
                <q-input
                  v-model="registerForm.fullName"
                  id="reg-name"
                  placeholder="E.g. Ashan Fernando"
                  dense
                  borderless
                  class="flex-1"
                  input-class="auth-input-native"
                  @keyup.enter="focusField('reg_email')"
                  @focus="focusedField = 'reg_name'"
                  @blur="focusedField = ''"
                />
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">Email Address *</label>
              <div
                class="input-wrap"
                :class="{ 'input-wrap--focus': focusedField === 'reg_email' }"
              >
                <q-icon name="mail_outline" size="18px" class="input-icon" />
                <q-input
                  v-model="registerForm.email"
                  id="reg-email"
                  type="email"
                  placeholder="your@email.com"
                  dense
                  borderless
                  class="flex-1"
                  input-class="auth-input-native"
                  @keyup.enter="focusField('reg_phone')"
                  @focus="focusedField = 'reg_email'"
                  @blur="focusedField = ''"
                />
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">
                Phone Number
                <span class="optional-label">(optional)</span>
              </label>
              <div class="phone-row">
                <div class="country-prefix">+94</div>
                <div
                  class="input-wrap flex-1"
                  :class="{ 'input-wrap--focus': focusedField === 'reg_phone' }"
                >
                  <q-input
                    v-model="registerForm.phone"
                    id="reg-phone"
                    type="tel"
                    placeholder="771 234 567"
                    dense
                    borderless
                    class="flex-1"
                    input-class="auth-input-native"
                    maxlength="12"
                    @keyup.enter="focusField('reg_password')"
                    @focus="focusedField = 'reg_phone'"
                    @blur="focusedField = ''"
                  />
                </div>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">Password *</label>
              <div
                class="input-wrap"
                :class="{ 'input-wrap--focus': focusedField === 'reg_password' }"
              >
                <q-icon name="lock_outline" size="18px" class="input-icon" />
                <q-input
                  v-model="registerForm.password"
                  id="reg-password"
                  :type="showRegPass ? 'text' : 'password'"
                  placeholder="Min 8 characters"
                  dense
                  borderless
                  class="flex-1"
                  input-class="auth-input-native"
                  @keyup.enter="focusField('reg_confirm')"
                  @focus="focusedField = 'reg_password'"
                  @blur="focusedField = ''"
                />
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  :icon="showRegPass ? 'visibility_off' : 'visibility'"
                  class="text-grey-5"
                  @click="showRegPass = !showRegPass"
                />
              </div>
              <!-- Password strength indicator -->
              <div v-if="registerForm.password" class="password-strength">
                <div
                  v-for="i in 4"
                  :key="i"
                  class="strength-bar"
                  :class="{
                    'strength-bar--active': passwordStrength >= i,
                    [`strength-bar--${strengthLevel}`]: passwordStrength >= i,
                  }"
                />
                <span class="strength-label" :class="`text-${strengthColor}`">{{
                  strengthText
                }}</span>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">Confirm Password *</label>
              <div
                class="input-wrap"
                :class="{
                  'input-wrap--focus': focusedField === 'reg_confirm',
                  'input-wrap--error': confirmMismatch,
                }"
              >
                <q-icon name="lock_outline" size="18px" class="input-icon" />
                <q-input
                  v-model="registerForm.confirmPassword"
                  id="reg-confirm"
                  :type="showRegPass ? 'text' : 'password'"
                  placeholder="Repeat password"
                  dense
                  borderless
                  class="flex-1"
                  input-class="auth-input-native"
                  @keyup.enter="handleRegister"
                  @focus="focusedField = 'reg_confirm'"
                  @blur="focusedField = ''"
                />
                <q-icon
                  v-if="registerForm.confirmPassword"
                  :name="confirmMismatch ? 'close' : 'check'"
                  :class="confirmMismatch ? 'text-negative' : 'text-positive'"
                  size="18px"
                />
              </div>
            </div>

            <div v-if="authError" class="error-box">
              <q-icon name="error_outline" size="14px" class="q-mr-xs" />
              {{ authError }}
            </div>

            <q-btn
              unelevated
              no-caps
              id="btn-register-submit"
              class="cta-btn full-width q-mt-lg"
              :loading="isLoading"
              @click="handleRegister"
            >
              <q-icon name="person_add" class="q-mr-sm" />
              <span>Create Account & Start</span>
              <template #loading>
                <q-spinner-dots color="white" size="1.4em" />
              </template>
            </q-btn>

            <button class="skip-link" @click="skipAuth">Browse without registering</button>
          </div>
        </transition>

        <!-- Loyalty Teaser -->
        <div class="loyalty-teaser">
          <q-icon name="stars" size="14px" color="amber" class="q-mr-xs" />
          Earn loyalty points with every order — unlock exclusive rewards!
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { useCustomerStore } from 'src/stores/customerStore'
import { useTableSessionStore } from 'src/stores/tableSessionStore'
import {
  registerCustomerWithEmail,
  loginCustomerWithEmail,
  linkCustomerToSessionV2,
} from 'src/services/customerAuthService'

const router = useRouter()
const route = useRoute()
const $q = useQuasar()
const customer = useCustomerStore()
const session = useTableSessionStore()

// ── State ──────────────────────────────────────────────────────────────────────

const activeTab = ref(route.query.tab === 'register' ? 'register' : 'login')
const isLoading = ref(false)
const authError = ref(null)
const focusedField = ref('')
const showLoginPass = ref(false)
const showRegPass = ref(false)

const loginForm = ref({ email: '', password: '' })
const registerForm = ref({
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
})

// ── Computed ───────────────────────────────────────────────────────────────────

const tableLabel = computed(() => {
  if (session.tableId) return 'Table Session Active'
  return 'Digital Menu'
})

const tableNumber = computed(() => {
  return localStorage.getItem('tm_table_id') || null
})

const confirmMismatch = computed(
  () =>
    registerForm.value.confirmPassword.length > 0 &&
    registerForm.value.password !== registerForm.value.confirmPassword,
)

// Password strength
const passwordStrength = computed(() => {
  const p = registerForm.value.password
  if (!p) return 0
  let score = 0
  if (p.length >= 8) score++
  if (/[A-Z]/.test(p)) score++
  if (/[0-9]/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  return score
})

const strengthLevel = computed(() => {
  const s = passwordStrength.value
  if (s <= 1) return 'weak'
  if (s === 2) return 'fair'
  if (s === 3) return 'good'
  return 'strong'
})

const strengthText = computed(() => {
  const map = { weak: 'Weak', fair: 'Fair', good: 'Good', strong: 'Strong' }
  return map[strengthLevel.value] || ''
})

const strengthColor = computed(() => {
  const map = { weak: 'negative', fair: 'warning', good: 'info', strong: 'positive' }
  return map[strengthLevel.value] || 'grey'
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function focusField(id) {
  const el = document.getElementById(id)
  el?.focus()
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ── Login ──────────────────────────────────────────────────────────────────────

async function handleLogin() {
  authError.value = null
  const { email, password } = loginForm.value

  if (!email.trim()) {
    authError.value = 'Please enter your email address.'
    return
  }
  if (!validateEmail(email.trim())) {
    authError.value = 'Please enter a valid email address.'
    return
  }
  if (!password) {
    authError.value = 'Please enter your password.'
    return
  }

  isLoading.value = true
  try {
    const result = await loginCustomerWithEmail(email.trim(), password)

    if (!result.success) {
      authError.value = result.error || 'Login failed. Please try again.'
      return
    }

    customer.setCustomer({
      customer_id: result.customer_id,
      full_name: result.full_name,
      email: result.email,
      phone: result.phone,
      card_number: result.card_number || result.loyalty_card_no,
      points_balance: result.points_balance ?? result.loyalty_points ?? 0,
      current_coins: result.points_balance ?? result.loyalty_points ?? 0,
      tier: result.tier ?? 'bronze',
      is_new: false,
    })
    customer.subscribeToLoyaltyRealtime()

    await finishAuth()
  } catch (err) {
    authError.value = 'An error occurred. Please try again.'
    console.error('[CustomerAuth] Login error:', err)
  } finally {
    isLoading.value = false
  }
}

// ── Register ───────────────────────────────────────────────────────────────────

async function handleRegister() {
  authError.value = null
  const { fullName, email, phone, password, confirmPassword } = registerForm.value

  if (!fullName.trim()) {
    authError.value = 'Please enter your full name.'
    return
  }
  if (!email.trim()) {
    authError.value = 'Please enter your email address.'
    return
  }
  if (!validateEmail(email.trim())) {
    authError.value = 'Please enter a valid email address.'
    return
  }
  if (password.length < 8) {
    authError.value = 'Password must be at least 8 characters.'
    return
  }
  if (password !== confirmPassword) {
    authError.value = 'Passwords do not match.'
    return
  }

  isLoading.value = true
  try {
    const result = await registerCustomerWithEmail(
      fullName.trim(),
      email.trim(),
      phone.trim(),
      password,
    )

    if (!result.success) {
      authError.value = result.error || 'Registration failed. Please try again.'
      return
    }

    customer.setCustomer({
      customer_id: result.customer_id,
      full_name: result.full_name,
      email: result.email,
      phone: result.phone,
      card_number: result.card_number || result.loyalty_card_no,
      points_balance: result.points_balance ?? result.loyalty_points ?? 0,
      current_coins: result.points_balance ?? result.loyalty_points ?? 0,
      tier: result.tier ?? 'bronze',
      is_new: true,
    })
    customer.subscribeToLoyaltyRealtime()

    await finishAuth(true)
  } catch (err) {
    authError.value = 'An error occurred. Please try again.'
    console.error('[CustomerAuth] Register error:', err)
  } finally {
    isLoading.value = false
  }
}

// ── Finish Auth ────────────────────────────────────────────────────────────────

async function finishAuth(isNew = false) {
  // Link customer to table session
  if (session.sessionId && customer.customerId) {
    await linkCustomerToSessionV2(
      customer.customerId,
      session.sessionId,
      session.tableId,
      session.branchId,
    )
  }

  // Welcome toast
  $q.notify({
    type: 'positive',
    icon: isNew ? 'celebration' : 'waving_hand',
    message: isNew
      ? `🎉 Welcome, ${customer.displayName}! Your loyalty account is ready.`
      : `👋 Welcome back, ${customer.displayName}!`,
    caption: isNew
      ? `Loyalty card #${customer.cardNumber} created — start earning points!`
      : undefined,
    position: 'top',
    timeout: 4000,
  })

  // Redirect to menu
  const token = session.sessionToken || localStorage.getItem('tm_session_token')
  if (token) {
    router.replace('/touch')
  } else {
    router.replace('/menu')
  }
}

// ── Skip Auth ──────────────────────────────────────────────────────────────────

function skipAuth() {
  const token = session.sessionToken || localStorage.getItem('tm_session_token')
  if (token) {
    router.replace('/touch')
  } else {
    router.replace('/menu')
  }
}

// ── On Mount ───────────────────────────────────────────────────────────────────

onMounted(() => {
  // If already logged in, skip to menu
  if (customer.isLoggedIn) {
    finishAuth()
    return
  }
  customer.tryRestoreFromLocal()
  if (customer.isLoggedIn) {
    finishAuth()
  }
})
</script>

<style lang="scss" scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

.auth-root {
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #07070f;
  font-family: 'Inter', sans-serif;
  padding: 24px 16px;
  overflow: hidden;
}

// ── Background ─────────────────────────────────────────────────────────────────
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
  opacity: 0.18;
  animation: orbFloat 14s ease-in-out infinite alternate;

  &--1 {
    width: 520px;
    height: 520px;
    background: radial-gradient(circle, #f97316 0%, transparent 70%);
    top: -200px;
    left: -200px;
  }
  &--2 {
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, #ef4444 0%, transparent 70%);
    bottom: -120px;
    right: -140px;
    animation-delay: -5s;
    animation-duration: 18s;
  }
  &--3 {
    width: 320px;
    height: 320px;
    background: radial-gradient(circle, #8b5cf6 0%, transparent 70%);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    opacity: 0.07;
    animation-delay: -10s;
    animation-duration: 22s;
  }
}

@keyframes orbFloat {
  0% {
    transform: translate(0, 0) scale(1);
  }
  100% {
    transform: translate(40px, 30px) scale(1.07);
  }
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px);
  background-size: 48px 48px;
}

// ── Card ────────────────────────────────────────────────────────────────────────
.auth-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  background: rgba(12, 12, 22, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  box-shadow:
    0 0 0 1px rgba(249, 115, 22, 0.04),
    0 40px 110px rgba(0, 0, 0, 0.75),
    0 8px 40px rgba(249, 115, 22, 0.06);
  padding: 32px 30px 28px;
}

// ── Brand ───────────────────────────────────────────────────────────────────────
.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.brand-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f97316, #ef4444);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(249, 115, 22, 0.5);
  flex-shrink: 0;
}

.brand-name {
  font-size: 0.52rem;
  font-weight: 800;
  letter-spacing: 3px;
  color: #fb923c;
  line-height: 1;
}

.brand-sub {
  font-size: 0.76rem;
  font-weight: 600;
  color: #e5e7eb;
  display: flex;
  align-items: center;
  margin-top: 3px;
}

.table-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #fb923c;
  background: rgba(249, 115, 22, 0.1);
  border: 1px solid rgba(249, 115, 22, 0.2);
  border-radius: 8px;
  padding: 4px 10px;
}

// ── Tabs ────────────────────────────────────────────────────────────────────────
.auth-tabs {
  display: flex;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 4px;
  margin-bottom: 24px;
  gap: 4px;
}

.auth-tab {
  flex: 1;
  background: none;
  border: none;
  color: #6b7280;
  font-size: 0.86rem;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  padding: 10px 12px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &--active {
    background: linear-gradient(135deg, #f97316, #ef4444);
    color: white;
    box-shadow: 0 4px 14px rgba(249, 115, 22, 0.35);
  }

  &:hover:not(&--active) {
    color: #d1d5db;
    background: rgba(255, 255, 255, 0.05);
  }
}

// ── Step headings ───────────────────────────────────────────────────────────────
.step-heading {
  margin-bottom: 22px;
}

.step-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: #fff;
  margin-bottom: 5px;
}

.step-sub {
  font-size: 0.83rem;
  color: #9ca3af;
  line-height: 1.5;
}

// ── Fields ──────────────────────────────────────────────────────────────────────
.field-group {
  margin-bottom: 14px;
}

.field-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #9ca3af;
  letter-spacing: 0.4px;
  margin-bottom: 6px;
}

.optional-label {
  font-weight: 400;
  color: #6b7280;
}

.input-wrap {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  padding: 0 12px;
  gap: 8px;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  min-height: 46px;

  &--focus {
    border-color: rgba(249, 115, 22, 0.5);
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08);
  }

  &--error {
    border-color: rgba(239, 68, 68, 0.5);
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.08);
  }

  .input-icon {
    color: #6b7280;
    flex-shrink: 0;
  }

  .flex-1 {
    flex: 1;
    min-width: 0;
  }

  :deep(.q-field__control) {
    background: transparent !important;
    padding: 0 !important;
    &::before,
    &::after {
      display: none;
    }
  }

  :deep(input) {
    color: #fff !important;
    font-size: 0.92rem !important;
    font-family: 'Inter', sans-serif !important;
    &::placeholder {
      color: #4b5563 !important;
    }
  }
}

// Phone row
.phone-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.country-prefix {
  display: flex;
  align-items: center;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #9ca3af;
  white-space: nowrap;
  min-height: 46px;
}

// Password strength
.password-strength {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}

.strength-bar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  transition: background-color 0.3s;

  &--active {
    &.strength-bar--weak {
      background: #ef4444;
    }
    &.strength-bar--fair {
      background: #f59e0b;
    }
    &.strength-bar--good {
      background: #3b82f6;
    }
    &.strength-bar--strong {
      background: #22c55e;
    }
  }
}

.strength-label {
  font-size: 0.72rem;
  font-weight: 600;
  margin-left: 4px;
  min-width: 40px;
}

// ── Error ───────────────────────────────────────────────────────────────────────
.error-box {
  display: flex;
  align-items: center;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 10px;
  padding: 10px 12px;
  color: #fca5a5;
  font-size: 0.8rem;
  font-weight: 500;
  margin-top: 10px;
}

// ── CTA Button ──────────────────────────────────────────────────────────────────
.cta-btn {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  color: white !important;
  border-radius: 14px !important;
  height: 50px;
  font-size: 0.95rem !important;
  font-weight: 700 !important;
  box-shadow: 0 6px 24px rgba(249, 115, 22, 0.38);
  transition:
    transform 0.15s,
    box-shadow 0.15s;

  &:active {
    transform: scale(0.98);
  }
  &:hover {
    box-shadow: 0 8px 30px rgba(249, 115, 22, 0.5);
  }
}

// ── Skip Link ───────────────────────────────────────────────────────────────────
.skip-link {
  background: none;
  border: none;
  color: #6b7280;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 4px 0;
  font-family: 'Inter', sans-serif;
  display: block;
  text-align: center;
  width: 100%;
  margin-top: 12px;

  &:hover {
    color: #9ca3af;
    text-decoration: underline;
  }
}

// ── Loyalty ─────────────────────────────────────────────────────────────────────
.loyalty-teaser {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.78rem;
  color: #6b7280;
  font-weight: 500;
}

// ── Transitions ─────────────────────────────────────────────────────────────────
.card-pop-enter-active {
  animation: cardPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes cardPop {
  0% {
    opacity: 0;
    transform: translateY(24px) scale(0.94);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.step-enter-active,
.step-leave-active {
  transition: all 0.22s ease;
}
.step-enter-from {
  opacity: 0;
  transform: translateX(16px);
}
.step-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
</style>
