<template>
  <div class="auth-root">
    <!-- Background -->
    <div class="bg-layer">
      <div class="bg-orb bg-orb--1" />
      <div class="bg-orb bg-orb--2" />
      <div class="bg-orb bg-orb--3" />
      <div class="bg-grid" />
    </div>

    <transition name="card-pop" appear>
      <div class="auth-card">
        <!-- Brand -->
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
        </div>

        <!-- Step 1: Registration / Phone input -->
        <transition name="step" mode="out-in">
          <div v-if="!customer.awaitingOtp" key="register">
            <div class="step-heading">
              <div class="step-title">{{ isReturning ? 'Welcome Back!' : 'Quick Sign-In' }}</div>
              <div class="step-sub">
                {{
                  isReturning
                    ? 'Enter your phone to continue'
                    : "Your table is ready — let's personalize your experience"
                }}
              </div>
            </div>

            <!-- Phone field (always shown) -->
            <div class="field-group">
              <label class="field-label">Phone Number *</label>
              <div class="phone-input-row">
                <div class="country-prefix">+94</div>
                <q-input
                  v-model="form.phone"
                  id="customer-phone"
                  type="tel"
                  placeholder="771 234 567"
                  dense
                  borderless
                  class="phone-field"
                  input-class="phone-input-inner"
                  maxlength="12"
                  @keyup.enter="handlePhoneNext"
                />
              </div>
            </div>

            <!-- New customer fields -->
            <transition name="expand">
              <div v-if="!isReturning">
                <div class="field-group">
                  <label class="field-label">Full Name *</label>
                  <q-input
                    v-model="form.name"
                    id="customer-name"
                    placeholder="E.g. Ashan Fernando"
                    dense
                    outlined
                    dark
                    class="erp-input"
                  />
                </div>

                <div class="field-group">
                  <label class="field-label"
                    >National ID <span class="optional-label">(optional)</span></label
                  >
                  <q-input
                    v-model="form.nationalId"
                    id="customer-national-id"
                    placeholder="199901012345"
                    dense
                    outlined
                    dark
                    class="erp-input"
                  />
                </div>
              </div>
            </transition>

            <!-- Toggle -->
            <button class="toggle-link" @click="isReturning = !isReturning">
              {{
                isReturning ? '✦ First visit? Register here' : '✦ Already have an account? Sign in'
              }}
            </button>

            <!-- Error -->
            <div v-if="customer.authError" class="error-box">
              <q-icon name="error_outline" size="14px" class="q-mr-xs" />
              {{ customer.authError }}
            </div>

            <!-- CTA -->
            <q-btn
              unelevated
              no-caps
              id="customer-auth-submit"
              class="cta-btn full-width q-mt-lg"
              :loading="customer.isLoading"
              @click="handlePhoneNext"
            >
              <q-icon name="send" class="q-mr-sm" />
              <span>{{ isReturning ? 'Send OTP' : 'Register & Continue' }}</span>
              <template #loading>
                <q-spinner-dots color="white" size="1.4em" />
              </template>
            </q-btn>

            <!-- Skip -->
            <button class="skip-link" @click="skipAuth">
              Skip for now — browse without logging in
            </button>
          </div>

          <!-- Step 2: OTP Verification -->
          <div v-else key="otp">
            <div class="step-heading">
              <div class="step-title">Enter OTP</div>
              <div class="step-sub">
                A 6-digit code was sent to<br />
                <strong class="text-white">{{ displayPhone }}</strong>
              </div>
            </div>

            <!-- OTP Boxes -->
            <div class="otp-row">
              <input
                v-for="(_, i) in otpDigits"
                :key="i"
                :id="`otp-${i}`"
                v-model="otpDigits[i]"
                type="text"
                inputmode="numeric"
                maxlength="1"
                class="otp-box"
                @input="handleOtpInput(i, $event)"
                @keydown.backspace="handleOtpBackspace(i)"
                @paste="handleOtpPaste($event)"
              />
            </div>

            <!-- Countdown -->
            <div class="otp-meta">
              <span v-if="countdown > 0" class="countdown-text">Resend in {{ countdown }}s</span>
              <button v-else class="resend-link" @click="resendOtp">Resend OTP</button>
            </div>

            <!-- Error -->
            <div v-if="customer.authError" class="error-box">
              <q-icon name="error_outline" size="14px" class="q-mr-xs" />
              {{ customer.authError }}
            </div>

            <q-btn
              unelevated
              no-caps
              id="otp-verify-btn"
              class="cta-btn full-width q-mt-lg"
              :loading="customer.isLoading"
              :disable="otpValue.length < 6"
              @click="verifyOtp"
            >
              <q-icon name="verified" class="q-mr-sm" />
              Verify & Continue
              <template #loading>
                <q-spinner-dots color="white" size="1.4em" />
              </template>
            </q-btn>

            <button class="skip-link" @click="customer.awaitingOtp = false">← Change number</button>
          </div>
        </transition>

        <!-- Loyalty teaser -->
        <div class="loyalty-teaser">
          <q-icon name="stars" size="14px" color="amber" class="q-mr-xs" />
          Earn loyalty points with every order!
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useCustomerStore } from 'src/stores/customerStore'
import { useTableSessionStore } from 'src/stores/tableSessionStore'
import {
  upsertCustomerByPhone,
  getCustomerByPhone,
  sendPhoneOtp,
  verifyPhoneOtp,
  linkCustomerToSession,
} from 'src/services/customerAuthService'
import { supabase } from 'src/boot/supabase' // eslint-disable-line no-unused-vars

const router = useRouter()
const $q = useQuasar()
const customer = useCustomerStore()
const session = useTableSessionStore()

// ── Form ─────────────────────────────────────────────────────────────────────

const isReturning = ref(true)
const form = ref({ phone: '', name: '', nationalId: '' })
const otpDigits = ref(Array(6).fill(''))

const otpValue = computed(() => otpDigits.value.join(''))
const displayPhone = computed(() => customer.pendingPhone ?? form.value.phone)
const tableLabel = computed(() => {
  return session.tableId ? 'Table Session Active' : 'Table Session'
})

// ── Countdown ─────────────────────────────────────────────────────────────────

const countdown = ref(0)
let countdownTimer = null

function startCountdown() {
  countdown.value = 30
  countdownTimer = setInterval(() => {
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
    } else {
      countdown.value--
    }
  }, 1000)
}

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

// ── OTP Input ─────────────────────────────────────────────────────────────────

function handleOtpInput(idx, event) {
  const val = event.target.value.replace(/\D/g, '')
  otpDigits.value[idx] = val.slice(-1)
  if (val && idx < 5) {
    const next = document.getElementById(`otp-${idx + 1}`)
    next?.focus()
  }
}

function handleOtpBackspace(idx) {
  if (!otpDigits.value[idx] && idx > 0) {
    const prev = document.getElementById(`otp-${idx - 1}`)
    prev?.focus()
  }
}

function handleOtpPaste(e) {
  const text = e.clipboardData?.getData('text') ?? ''
  const digits = text.replace(/\D/g, '').slice(0, 6).split('')
  digits.forEach((d, i) => {
    if (i < 6) otpDigits.value[i] = d
  })
  const nextEmpty = digits.length < 6 ? digits.length : 5
  const el = document.getElementById(`otp-${nextEmpty}`)
  el?.focus()
  e.preventDefault()
}

// ── Phone Next: register or send OTP ─────────────────────────────────────────

async function handlePhoneNext() {
  customer.authError = null
  const rawPhone = form.value.phone.trim()

  if (!rawPhone || rawPhone.length < 7) {
    customer.authError = 'Please enter a valid phone number.'
    return
  }

  if (!isReturning.value && !form.value.name.trim()) {
    customer.authError = 'Please enter your full name.'
    return
  }

  customer.isLoading = true
  try {
    let customerResult

    if (isReturning.value) {
      // Check existing customer
      customerResult = await getCustomerByPhone(rawPhone)
      if (!customerResult.success) {
        // Not found — switch to register mode
        isReturning.value = false
        customer.authError = 'Phone not found. Please register below.'
        customer.isLoading = false
        return
      }
    } else {
      // Upsert customer
      customerResult = await upsertCustomerByPhone(
        form.value.name.trim(),
        rawPhone,
        form.value.nationalId.trim() || undefined,
      )
      if (!customerResult.success) {
        customer.authError = customerResult.error || 'Registration failed.'
        customer.isLoading = false
        return
      }
    }

    // Store customer data
    customer.setCustomer({
      customer_id: customerResult.customer_id,
      full_name: customerResult.full_name,
      phone: customerResult.phone,
      national_id: customerResult.national_id,
      loyalty_id: customerResult.loyalty_id,
      card_number: customerResult.card_number,
      points_balance: customerResult.points_balance ?? 0,
      tier: customerResult.tier,
      is_new: customerResult.is_new,
    })

    // Try phone OTP
    const otpResult = await sendPhoneOtp(rawPhone)

    if (otpResult.success) {
      customer.pendingPhone = rawPhone
      customer.awaitingOtp = true
      otpDigits.value = Array(6).fill('')
      startCountdown()
    } else {
      // Phone OTP not available — skip auth, go straight to menu
      $q.notify({
        type: 'warning',
        message: 'Phone OTP not available. Continuing as guest.',
        position: 'top',
        timeout: 3000,
      })
      finishAuth()
    }
  } catch (err) {
    customer.authError = 'Something went wrong. Please try again.'
    console.error('[CustomerAuth] error:', err)
  } finally {
    customer.isLoading = false
  }
}

// ── Verify OTP ────────────────────────────────────────────────────────────────

async function verifyOtp() {
  customer.authError = null
  if (otpValue.value.length < 6) return

  customer.isLoading = true
  try {
    const result = await verifyPhoneOtp(customer.pendingPhone ?? '', otpValue.value)

    if (!result.success) {
      customer.authError = result.error || 'Invalid OTP. Please try again.'
      return
    }

    finishAuth()
  } catch (err) {
    customer.authError = 'Verification failed. Please try again.'
    console.error('[CustomerAuth] OTP verify error:', err)
  } finally {
    customer.isLoading = false
  }
}

// ── Resend OTP ────────────────────────────────────────────────────────────────

async function resendOtp() {
  if (!customer.pendingPhone) return
  customer.authError = null
  customer.isLoading = true
  const result = await sendPhoneOtp(customer.pendingPhone)
  customer.isLoading = false
  if (result.success) {
    startCountdown()
    otpDigits.value = Array(6).fill('')
    $q.notify({ type: 'positive', message: 'OTP sent!', position: 'top', timeout: 2000 })
  } else {
    customer.authError = result.error || 'Failed to resend OTP.'
  }
}

// ── Finish Auth ───────────────────────────────────────────────────────────────

async function finishAuth() {
  customer.awaitingOtp = false

  // Link customer to table session
  if (session.sessionId && customer.customerId) {
    await linkCustomerToSession(customer.customerId, session.sessionId)
  }

  // Show welcome toast
  $q.notify({
    type: 'positive',
    message: customer.isNew
      ? `🎉 Welcome, ${customer.displayName}! You earned a loyalty card!`
      : `👋 Welcome back, ${customer.displayName}!`,
    position: 'top',
    timeout: 3000,
  })

  // Navigate to menu
  const token = session.sessionToken
  if (token) {
    router.replace('/touch')
  } else {
    router.replace('/menu')
  }
}

// ── Skip Auth ─────────────────────────────────────────────────────────────────

function skipAuth() {
  const token = session.sessionToken
  if (token) {
    router.replace('/touch')
  } else {
    router.replace('/menu')
  }
}

// ── On Mount ──────────────────────────────────────────────────────────────────

onMounted(() => {
  // If already logged in, go to menu
  if (customer.isLoggedIn) {
    finishAuth()
    return
  }
  // Try restoring from local
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

// ── Background ────────────────────────────────────────────────────────────────
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
  opacity: 0.2;
  animation: orbFloat 14s ease-in-out infinite alternate;

  &--1 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #f97316 0%, transparent 70%);
    top: -180px;
    left: -180px;
  }
  &--2 {
    width: 380px;
    height: 380px;
    background: radial-gradient(circle, #ef4444 0%, transparent 70%);
    bottom: -100px;
    right: -120px;
    animation-delay: -5s;
    animation-duration: 18s;
  }
  &--3 {
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, #8b5cf6 0%, transparent 70%);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    opacity: 0.08;
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
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 48px 48px;
}

// ── Card ──────────────────────────────────────────────────────────────────────
.auth-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px;
  background: rgba(14, 14, 24, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  backdrop-filter: blur(36px);
  -webkit-backdrop-filter: blur(36px);
  box-shadow:
    0 0 0 1px rgba(249, 115, 22, 0.05),
    0 40px 100px rgba(0, 0, 0, 0.7),
    0 8px 40px rgba(249, 115, 22, 0.08);
  padding: 36px 32px;
}

// ── Brand ─────────────────────────────────────────────────────────────────────
.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
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
  font-size: 0.78rem;
  font-weight: 600;
  color: #e5e7eb;
  display: flex;
  align-items: center;
  margin-top: 3px;
}

// ── Step headings ─────────────────────────────────────────────────────────────
.step-heading {
  margin-bottom: 24px;
}

.step-title {
  font-size: 1.35rem;
  font-weight: 800;
  color: #fff;
  margin-bottom: 6px;
}

.step-sub {
  font-size: 0.85rem;
  color: #9ca3af;
  line-height: 1.5;
}

// ── Fields ────────────────────────────────────────────────────────────────────
.field-group {
  margin-bottom: 16px;
}

.field-label {
  display: block;
  font-size: 0.77rem;
  font-weight: 600;
  color: #9ca3af;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.optional-label {
  font-weight: 400;
  color: #6b7280;
}

// Phone row
.phone-input-row {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s;

  &:focus-within {
    border-color: rgba(249, 115, 22, 0.5);
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.08);
  }
}

.country-prefix {
  padding: 0 12px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #9ca3af;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  height: 44px;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.phone-field {
  flex: 1;
  :deep(.q-field__inner) {
    padding: 0;
  }
  :deep(.q-field__control) {
    background: transparent !important;
    padding: 0 12px;
    height: 44px;
    min-height: 44px;
    &::before,
    &::after {
      display: none;
    }
  }
  :deep(input) {
    color: #fff;
    font-size: 0.95rem;
    font-family: 'Inter', sans-serif;
  }
}

.erp-input {
  :deep(.q-field__control) {
    background: rgba(255, 255, 255, 0.05) !important;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    min-height: 44px;
  }
  :deep(.q-field__control:hover),
  :deep(.q-field--focused .q-field__control) {
    border-color: rgba(249, 115, 22, 0.5) !important;
  }
}

// ── Toggle & Skip ─────────────────────────────────────────────────────────────
.toggle-link {
  background: none;
  border: none;
  color: #fb923c;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 0;
  font-family: 'Inter', sans-serif;
  display: block;
  margin-bottom: 8px;

  &:hover {
    text-decoration: underline;
  }
}

.skip-link {
  background: none;
  border: none;
  color: #6b7280;
  font-size: 0.76rem;
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

// ── Error ─────────────────────────────────────────────────────────────────────
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

// ── CTA Button ────────────────────────────────────────────────────────────────
.cta-btn {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  color: white !important;
  border-radius: 14px;
  height: 50px;
  font-size: 0.95rem;
  font-weight: 700;
  box-shadow: 0 6px 24px rgba(249, 115, 22, 0.4);
  transition:
    transform 0.15s,
    box-shadow 0.15s;

  &:active {
    transform: scale(0.98);
  }
}

// ── OTP ───────────────────────────────────────────────────────────────────────
.otp-row {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin: 24px 0 8px;
}

.otp-box {
  width: 46px;
  height: 54px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font-size: 1.4rem;
  font-weight: 700;
  text-align: center;
  font-family: 'Inter', sans-serif;
  outline: none;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;

  &:focus {
    border-color: rgba(249, 115, 22, 0.6);
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.12);
    background: rgba(249, 115, 22, 0.06);
  }
}

.otp-meta {
  text-align: center;
  margin-bottom: 8px;
}

.countdown-text {
  font-size: 0.8rem;
  color: #6b7280;
}

.resend-link {
  background: none;
  border: none;
  color: #fb923c;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Inter', sans-serif;

  &:hover {
    text-decoration: underline;
  }
}

// ── Loyalty teaser ────────────────────────────────────────────────────────────
.loyalty-teaser {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 24px;
  padding: 10px 16px;
  background: rgba(251, 191, 36, 0.06);
  border: 1px solid rgba(251, 191, 36, 0.15);
  border-radius: 10px;
  font-size: 0.78rem;
  color: #fbbf24;
  font-weight: 500;
}

// ── Transitions ───────────────────────────────────────────────────────────────
.card-pop-enter-active {
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.card-pop-enter-from {
  opacity: 0;
  transform: scale(0.92) translateY(20px);
}

.step-enter-active,
.step-leave-active {
  transition: all 0.3s ease;
}
.step-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.step-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.35s ease;
  overflow: hidden;
  max-height: 300px;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
