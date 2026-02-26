<template>
  <div class="loyalty-root">
    <!-- Background -->
    <div class="bg-layer">
      <div class="bg-orb bg-orb--1" />
      <div class="bg-orb bg-orb--2" />
    </div>

    <!-- Top bar -->
    <div class="top-bar">
      <q-btn flat round dense icon="arrow_back" color="white" @click="$router.go(-1)" />
      <div class="top-bar-title">Loyalty Card</div>
      <div class="top-bar-pts">
        <q-icon name="stars" size="13px" color="amber" class="q-mr-xs" />
        {{ customer.pointsBalance.toLocaleString() }} pts
      </div>
    </div>

    <!-- Not logged in -->
    <div v-if="!customer.isLoggedIn" class="no-auth-state">
      <q-icon name="card_membership" size="64px" color="grey-7" />
      <div class="text-h6 text-grey-4 q-mt-lg q-mb-sm">Join Loyalty Program</div>
      <div class="text-body2 text-grey-6 q-mb-xl text-center">
        Sign in to earn points and track your rewards
      </div>
      <q-btn
        unelevated
        no-caps
        class="join-btn"
        icon="login"
        label="Sign In / Register"
        @click="$router.push('/customer/auth')"
      />
    </div>

    <!-- Loyalty content -->
    <div v-else class="loyalty-content">
      <!-- Digital Card -->
      <div class="card-wrapper" :class="[customer.tier]">
        <div class="card-glow" />
        <div class="card-inner">
          <!-- Card header -->
          <div class="card-header-row">
            <div class="card-brand">
              <q-icon name="restaurant" size="18px" color="white" />
              <span class="card-brand-name">SEVEN WAVES</span>
            </div>
            <div class="tier-badge">
              <span class="tier-icon">{{ tierConfig?.icon }}</span>
              {{ tierConfig?.label }}
            </div>
          </div>

          <!-- Points -->
          <div class="card-points-section">
            <div class="points-label">POINTS BALANCE</div>
            <div class="points-value">{{ customer.pointsBalance.toLocaleString() }}</div>
          </div>

          <!-- Card number -->
          <div class="card-number-section">
            <div class="card-number">{{ formattedCard }}</div>
          </div>

          <!-- Holder name -->
          <div class="card-footer-row">
            <div>
              <div class="card-holder-label">CARD HOLDER</div>
              <div class="card-holder-name">{{ customer.displayName }}</div>
            </div>
            <!-- Chip decoration -->
            <div class="card-chip">
              <div class="chip-lines">
                <div v-for="i in 4" :key="i" class="chip-line" />
              </div>
            </div>
          </div>

          <!-- Shine overlay -->
          <div class="card-shine" />
        </div>
      </div>

      <!-- QR Code display -->
      <div class="qr-section">
        <div class="section-label">Scan at Cashier</div>
        <div class="qr-wrap">
          <div ref="qrContainer" class="qr-canvas-wrap" />
          <div class="qr-caption">{{ customer.cardNumber }}</div>
        </div>
      </div>

      <!-- Tier progress -->
      <div class="tier-section">
        <div class="section-label">Tier Progress</div>
        <div class="tier-progress-card">
          <div class="tier-row">
            <div class="tier-current">
              <span class="tier-icon-big">{{ tierConfig?.icon }}</span>
              <div>
                <div class="tier-name">{{ tierConfig?.label }}</div>
                <div class="tier-sub">Current tier</div>
              </div>
            </div>
            <div v-if="tierProgress.nextTier" class="tier-next">
              <div class="tier-pts-needed">
                {{ tierProgress.pointsNeeded.toLocaleString() }} pts to
              </div>
              <div class="tier-next-name">{{ tierProgress.nextTier }}</div>
            </div>
            <div v-else class="tier-next">
              <div class="tier-max-label">🏆 Max Tier!</div>
            </div>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar-track">
              <div class="progress-bar-fill" :style="{ width: tierProgress.progress + '%' }" />
            </div>
            <div class="progress-pct">{{ tierProgress.progress }}%</div>
          </div>
        </div>
      </div>

      <!-- Transaction history -->
      <div class="history-section">
        <div class="section-label">Recent Activity</div>

        <div v-if="loadingHistory" class="history-loading">
          <q-skeleton v-for="i in 3" :key="i" type="rect" class="history-skeleton" dark />
        </div>

        <div v-else-if="transactions.length === 0" class="history-empty">
          <q-icon name="receipt_long" size="36px" color="grey-7" />
          <div class="text-grey-6 q-mt-sm text-body2">No transactions yet</div>
        </div>

        <div v-else>
          <div v-for="tx in transactions" :key="tx.id" class="tx-row">
            <div class="tx-icon-wrap" :class="tx.type">
              <q-icon
                :name="
                  tx.type === 'earn'
                    ? 'add_circle'
                    : tx.type === 'redeem'
                      ? 'remove_circle'
                      : 'tune'
                "
                size="18px"
                :color="txColor(tx.type)"
              />
            </div>
            <div class="tx-info">
              <div class="tx-title">{{ txLabel(tx.type) }}</div>
              <div class="tx-date">{{ formatDate(tx.created_at) }}</div>
            </div>
            <div class="tx-points" :class="tx.type">
              {{ tx.type === 'earn' ? '+' : '-' }}{{ Math.abs(tx.points).toFixed(0) }} pts
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom spacer -->
      <div style="height: 40px" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useCustomerStore } from 'src/stores/customerStore'
import {
  getLoyaltyTransactions,
  getTierProgress,
  TIER_CONFIG,
  formatCardNumber,
} from 'src/services/loyaltyService'

const customer = useCustomerStore()

const transactions = ref([])
const loadingHistory = ref(false)
const qrContainer = ref(null)

// ── Computed ──────────────────────────────────────────────────────────────────

const tierConfig = computed(() => TIER_CONFIG[customer.tier])
const formattedCard = computed(() => formatCardNumber(customer.cardNumber ?? ''))

const tierProgress = computed(() => getTierProgress(customer.tier, customer.pointsBalance))

// ── QR Code ───────────────────────────────────────────────────────────────────

async function generateQr() {
  if (!customer.cardNumber || !qrContainer.value) return
  try {
    // Dynamically load qrcode library
    const QRCode = (await import('qrcode')).default
    const canvas = document.createElement('canvas')
    await QRCode.toCanvas(canvas, customer.cardNumber, {
      width: 160,
      margin: 2,
      color: { dark: '#ffffff', light: '#00000000' },
    })
    qrContainer.value.innerHTML = ''
    qrContainer.value.appendChild(canvas)
  } catch {
    // Fallback: show card number as text
    if (qrContainer.value) {
      qrContainer.value.textContent = customer.cardNumber ?? ''
    }
  }
}

// ── Load history ──────────────────────────────────────────────────────────────

async function loadHistory() {
  if (!customer.customerId) return
  loadingHistory.value = true
  transactions.value = await getLoyaltyTransactions(customer.customerId, 15)
  loadingHistory.value = false
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function txLabel(type) {
  return (
    {
      earn: 'Points Earned',
      redeem: 'Points Redeemed',
      adjust: 'Adjustment',
      expire: 'Points Expired',
    }[type] ?? type
  )
}

function txColor(type) {
  return { earn: 'green', redeem: 'red-4', adjust: 'blue-4', expire: 'grey-5' }[type] ?? 'grey'
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  customer.tryRestoreFromLocal()
  if (customer.isLoggedIn) {
    await loadHistory()
    await nextTick()
    await generateQr()
  }
})
</script>

<style lang="scss" scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

.loyalty-root {
  background: #0d0d14;
  min-height: 100dvh;
  font-family: 'Inter', sans-serif;
  position: relative;
}

.bg-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.08;
  &--1 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #fbbf24 0%, transparent 70%);
    top: -150px;
    right: -100px;
  }
  &--2 {
    width: 380px;
    height: 380px;
    background: radial-gradient(circle, #f97316 0%, transparent 70%);
    bottom: -80px;
    left: -80px;
  }
}

.top-bar {
  position: sticky;
  top: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 58px;
  background: rgba(13, 13, 20, 0.94);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  gap: 8px;
}
.top-bar-title {
  flex: 1;
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}
.top-bar-pts {
  display: flex;
  align-items: center;
  font-size: 0.82rem;
  font-weight: 700;
  color: #fbbf24;
}

// No auth state
.no-auth-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: 24px;
  text-align: center;
}
.join-btn {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  color: white !important;
  border-radius: 14px;
  height: 50px;
  font-weight: 700;
  padding: 0 32px;
  box-shadow: 0 6px 20px rgba(249, 115, 22, 0.4);
}

// Content
.loyalty-content {
  position: relative;
  z-index: 1;
  padding: 20px 16px;
  max-width: 480px;
  margin: 0 auto;
}

// ── Digital Card ──────────────────────────────────────────────────────────────
.card-wrapper {
  position: relative;
  border-radius: 22px;
  overflow: hidden;
  margin-bottom: 24px;
  aspect-ratio: 1.586;
  cursor: default;

  &.bronze {
    background: linear-gradient(135deg, #7c4d1a, #b87333, #7c4d1a);
  }
  &.silver {
    background: linear-gradient(135deg, #3a3a3a, #9e9e9e, #3a3a3a);
  }
  &.gold {
    background: linear-gradient(135deg, #7c5c00, #f59e0b, #7c5c00);
  }
  &.platinum {
    background: linear-gradient(135deg, #2a2a2a, #c8c8c8, #2a2a2a);
  }
}

.card-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 30% 30%, rgba(255, 255, 255, 0.18), transparent 60%);
  pointer-events: none;
}

.card-inner {
  position: relative;
  z-index: 1;
  padding: 20px 22px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: auto;
}

.card-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.card-brand-name {
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.9);
}

.tier-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 4px 10px;
  font-size: 0.72rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
}
.tier-icon {
  font-size: 0.85rem;
}

.card-points-section {
  margin-bottom: 12px;
}
.points-label {
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 2px;
}
.points-value {
  font-size: 2.2rem;
  font-weight: 800;
  color: #fff;
  line-height: 1;
}

.card-number-section {
  margin-bottom: 14px;
}
.card-number {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.85);
  font-variant-numeric: tabular-nums;
}

.card-footer-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}
.card-holder-label {
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: rgba(255, 255, 255, 0.5);
}
.card-holder-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  margin-top: 2px;
}

.card-chip {
  width: 38px;
  height: 28px;
  border-radius: 5px;
  background: linear-gradient(135deg, #d4af37, #ffd700);
  padding: 4px 5px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.chip-lines {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.chip-line {
  height: 2px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 1px;
}

.card-shine {
  position: absolute;
  inset: 0;
  border-radius: 22px;
  background: linear-gradient(
    105deg,
    transparent 30%,
    rgba(255, 255, 255, 0.07) 50%,
    transparent 70%
  );
  pointer-events: none;
}

// QR Section
.qr-section {
  margin-bottom: 28px;
}
.section-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 2px;
  color: #6b7280;
  text-transform: uppercase;
  margin-bottom: 14px;
}
.qr-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 18px;
  padding: 20px;
}
.qr-canvas-wrap {
  canvas {
    border-radius: 8px;
  }
}
.qr-caption {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 2px;
  color: #9ca3af;
}

// Tier progress
.tier-section {
  margin-bottom: 28px;
}
.tier-progress-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  padding: 18px;
}
.tier-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.tier-current {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tier-icon-big {
  font-size: 1.8rem;
}
.tier-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: #e5e7eb;
}
.tier-sub {
  font-size: 0.72rem;
  color: #6b7280;
}

.tier-next {
  text-align: right;
}
.tier-pts-needed {
  font-size: 0.72rem;
  color: #9ca3af;
}
.tier-next-name {
  font-size: 0.88rem;
  font-weight: 700;
  color: #fbbf24;
}
.tier-max-label {
  font-size: 0.9rem;
  font-weight: 700;
  color: #fbbf24;
}

.progress-bar-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.progress-bar-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #f97316, #fbbf24);
  border-radius: 6px;
  transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.progress-pct {
  font-size: 0.75rem;
  font-weight: 700;
  color: #fbbf24;
  min-width: 32px;
  text-align: right;
}

// Transaction history
.history-section {
  margin-bottom: 16px;
}

.history-skeleton {
  height: 58px;
  border-radius: 12px;
  margin-bottom: 8px;
}
.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px;
  text-align: center;
}

.tx-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
}

.tx-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.earn {
    background: rgba(16, 185, 129, 0.12);
  }
  &.redeem {
    background: rgba(239, 68, 68, 0.12);
  }
  &.adjust {
    background: rgba(59, 130, 246, 0.12);
  }
}

.tx-info {
  flex: 1;
}
.tx-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: #e5e7eb;
}
.tx-date {
  font-size: 0.72rem;
  color: #6b7280;
  margin-top: 2px;
}

.tx-points {
  font-size: 0.9rem;
  font-weight: 700;
  &.earn {
    color: #34d399;
  }
  &.redeem {
    color: #f87171;
  }
  &.adjust {
    color: #60a5fa;
  }
}
</style>
