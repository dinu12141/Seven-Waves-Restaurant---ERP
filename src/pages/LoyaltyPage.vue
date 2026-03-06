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
      <div class="top-bar-coins">
        <q-icon name="toll" size="14px" color="amber" class="q-mr-xs" />
        {{ store.coins.toLocaleString() }}
        <span class="coin-label">coins</span>
      </div>
    </div>

    <!-- Not logged in -->
    <div v-if="!store.isLoggedIn" class="no-auth-state">
      <div class="no-auth-icon">
        <q-icon name="card_membership" size="52px" color="amber-4" />
      </div>
      <div class="text-h6 text-white text-weight-bold q-mt-lg q-mb-sm">Join Loyalty Program</div>
      <div class="text-body2 text-grey-5 q-mb-xl text-center" style="max-width: 280px">
        Sign in to earn coins and unlock exclusive tier rewards
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
      <!-- ── Digital Card ─────────────────────────────────────────────── -->
      <div class="card-wrapper" :class="cardCssClass">
        <div class="card-glow" />
        <div class="card-inner">
          <!-- Card header -->
          <div class="card-header-row">
            <div class="card-brand">
              <q-icon name="restaurant" size="16px" color="white" />
              <span class="card-brand-name">SEVEN WAVES</span>
            </div>
            <div class="tier-badge">
              <span class="tier-icon">{{ currentTierConfig?.icon }}</span>
              {{ store.tierName || currentTierConfig?.label }}
            </div>
          </div>

          <!-- Coins display -->
          <div class="card-coins-section">
            <div class="coins-label">COINS BALANCE</div>
            <div class="coins-value">{{ store.coins.toLocaleString() }}</div>
            <div class="coins-sub">
              {{
                coinsToNextTier > 0
                  ? `${coinsToNextTier} coins to ${tierProgress.nextTier}`
                  : '🏆 Maximum Tier Reached'
              }}
            </div>
          </div>

          <!-- Card number -->
          <div class="card-number-section">
            <div class="card-number">{{ formattedCard }}</div>
          </div>

          <!-- Holder name -->
          <div class="card-footer-row">
            <div>
              <div class="card-holder-label">CARD HOLDER</div>
              <div class="card-holder-name">{{ store.displayName }}</div>
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

      <!-- ── Live Realtime Badge ────────────────────────────────────────── -->
      <div class="realtime-badge">
        <span class="pulse-dot" />
        <span>Real-time updates active</span>
      </div>

      <!-- ── QR Code display ───────────────────────────────────────────── -->
      <div class="qr-section">
        <div class="section-label">Scan at Cashier</div>
        <div class="qr-wrap">
          <div ref="qrContainer" class="qr-canvas-wrap" />
          <div class="qr-caption">{{ store.cardNumber }}</div>
        </div>
      </div>

      <!-- ── Tier Progress ─────────────────────────────────────────────── -->
      <div class="tier-section">
        <div class="section-label">Tier Progress</div>
        <div class="tier-progress-card">
          <!-- Current & next tier -->
          <div class="tier-row">
            <div class="tier-current">
              <div class="tier-icon-wrap" :style="{ background: store.badgeColor + '22' }">
                <span class="tier-icon-big">{{ currentTierConfig?.icon }}</span>
              </div>
              <div>
                <div class="tier-name">{{ store.tierName || currentTierConfig?.label }}</div>
                <div class="tier-sub">Current tier · {{ store.coins }} coins</div>
              </div>
            </div>
            <div v-if="tierProgress.nextTier" class="tier-next">
              <div class="tier-pts-needed">{{ tierProgress.coinsNeeded }} coins to</div>
              <div class="tier-next-name">{{ tierProgress.nextTier }}</div>
            </div>
            <div v-else class="tier-next">
              <div class="tier-max-label">🏆 Max Tier!</div>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="progress-bar-wrap">
            <div class="progress-bar-track">
              <div
                class="progress-bar-fill"
                :style="{ width: tierProgress.progress + '%', background: store.badgeColor }"
              />
            </div>
            <div class="progress-pct" :style="{ color: store.badgeColor }">
              {{ tierProgress.progress }}%
            </div>
          </div>

          <!-- Tier milestones -->
          <div class="tier-milestones">
            <div
              v-for="tier in allTiers"
              :key="tier.tier_code"
              class="milestone"
              :class="{ active: store.coins >= tier.min_coins }"
            >
              <div
                class="milestone-dot"
                :style="{
                  background:
                    store.coins >= tier.min_coins ? tier.badge_color : 'rgba(255,255,255,0.15)',
                }"
              />
              <div class="milestone-label">{{ tier.tier_name }}</div>
              <div class="milestone-coins">{{ tier.min_coins }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Stats Row ────────────────────────────────────────────────── -->
      <div class="stats-row">
        <div class="stat-card">
          <q-icon name="toll" color="amber" size="20px" />
          <div class="stat-value">{{ store.totalEarnedCoins.toLocaleString() }}</div>
          <div class="stat-label">Total Earned</div>
        </div>
        <div class="stat-card">
          <q-icon name="payments" color="green-4" size="20px" />
          <div class="stat-value">{{ formatCurrency(store.totalSpent) }}</div>
          <div class="stat-label">Total Spent</div>
        </div>
        <div class="stat-card">
          <q-icon name="schedule" color="blue-4" size="20px" />
          <div class="stat-value">{{ lastRewardLabel }}</div>
          <div class="stat-label">Last Reward</div>
        </div>
      </div>

      <!-- ── Transaction History ──────────────────────────────────────── -->
      <div class="history-section">
        <div class="section-label">Recent Activity</div>

        <div v-if="loadingHistory" class="history-loading">
          <q-skeleton v-for="i in 3" :key="i" type="rect" class="history-skeleton" dark />
        </div>

        <div v-else-if="transactions.length === 0" class="history-empty">
          <q-icon name="receipt_long" size="36px" color="grey-7" />
          <div class="text-grey-6 q-mt-sm text-body2">No transactions yet</div>
          <div class="text-caption text-grey-7 q-mt-xs">Transactions appear after paying bills</div>
        </div>

        <div v-else>
          <div v-for="tx in transactions" :key="tx.id" class="tx-row">
            <div class="tx-icon-wrap" :class="tx.transaction_type || tx.type">
              <q-icon
                :name="txIcon(tx.transaction_type || tx.type)"
                size="18px"
                :color="txColor(tx.transaction_type || tx.type)"
              />
            </div>
            <div class="tx-info">
              <div class="tx-title">{{ txLabel(tx.transaction_type || tx.type) }}</div>
              <div class="tx-sub">
                <span v-if="tx.amount_reference">
                  LKR {{ Number(tx.amount_reference).toLocaleString() }}
                </span>
                <span v-if="tx.note" class="tx-note">{{ tx.note }}</span>
              </div>
              <div class="tx-date">{{ formatDate(tx.created_at) }}</div>
            </div>
            <div class="tx-coins" :class="tx.transaction_type || tx.type">
              {{ (tx.transaction_type || tx.type) === 'earn' ? '+' : '-'
              }}{{ Math.abs(tx.coins || tx.points || 0) }}
              <span class="tx-coin-label">coins</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Benefits Section -->
      <div v-if="currentBenefits.length > 0" class="benefits-section">
        <div class="section-label">Your {{ store.tierName }} Benefits</div>
        <div class="benefits-card">
          <div v-for="(perk, i) in currentBenefits" :key="i" class="benefit-item">
            <q-icon name="check_circle" color="green-4" size="16px" />
            <span>{{ perk }}</span>
          </div>
        </div>
      </div>

      <!-- Bottom spacer -->
      <div style="height: 40px" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useCustomerStore } from 'src/stores/customerStore'
import {
  getLoyaltyTransactions,
  getTierProgress,
  formatCardNumber,
  getTierConfig,
  getLoyaltyTiers,
} from 'src/services/loyaltyService'
import { supabase } from 'src/boot/supabase'

const store = useCustomerStore()

const transactions = ref([])
const loadingHistory = ref(false)
const qrContainer = ref(null)
const allTiers = ref([])

// ── Computed ──────────────────────────────────────────────────────────────────

const currentTierConfig = computed(() => getTierConfig(store.tierCode || store.tier || 'STANDARD'))

const cardCssClass = computed(() => {
  const code = store.tierCode?.toUpperCase()
  if (code === 'GOLD') return 'gold'
  if (code === 'SILVER') return 'silver'
  const t = store.tier
  if (t === 'gold' || t === 'platinum') return 'gold'
  if (t === 'silver') return 'silver'
  return 'standard'
})

const formattedCard = computed(() => formatCardNumber(store.cardNumber ?? ''))

const tierProgress = computed(() =>
  getTierProgress(store.tierCode || store.tier || 'STANDARD', store.coins),
)

const coinsToNextTier = computed(() => tierProgress.value.coinsNeeded)

const currentBenefits = computed(() => {
  const found = allTiers.value.find((t) => t.tier_code === store.tierCode?.toUpperCase())
  return found?.benefits_json?.perks || []
})

const lastRewardLabel = computed(() => {
  if (!store.lastRewardedAt) return 'Never'
  return new Date(store.lastRewardedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
})

// ── QR Code ───────────────────────────────────────────────────────────────────

async function generateQr() {
  if (!store.cardNumber || !qrContainer.value) return
  try {
    const QRCode = (await import('qrcode')).default
    const canvas = document.createElement('canvas')
    await QRCode.toCanvas(canvas, store.cardNumber, {
      width: 160,
      margin: 2,
      color: { dark: '#ffffff', light: '#00000000' },
    })
    qrContainer.value.innerHTML = ''
    qrContainer.value.appendChild(canvas)
  } catch {
    if (qrContainer.value) {
      qrContainer.value.textContent = store.cardNumber ?? ''
    }
  }
}

// ── Load history ──────────────────────────────────────────────────────────────

async function loadHistory() {
  if (!store.customerId) return
  loadingHistory.value = true
  transactions.value = await getLoyaltyTransactions(store.customerId, 20)
  loadingHistory.value = false
}

// ── Realtime: subscribe to new transactions ───────────────────────────────────
let _txChannel = null

function subscribeToTransactions() {
  if (!store.customerId || _txChannel) return
  _txChannel = supabase
    .channel(`loyalty_tx_${store.customerId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'loyalty_transactions',
        filter: `customer_id=eq.${store.customerId}`,
      },
      () => {
        // Reload transactions when a new one arrives
        loadHistory()
      },
    )
    .subscribe()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function txLabel(type) {
  return (
    {
      earn: 'Coins Earned',
      redeem: 'Coins Redeemed',
      adjust: 'Admin Adjustment',
      expire: 'Coins Expired',
    }[type] ?? type
  )
}

function txIcon(type) {
  return (
    { earn: 'add_circle', redeem: 'remove_circle', adjust: 'tune', expire: 'cancel' }[type] ??
    'info'
  )
}

function txColor(type) {
  return { earn: 'green-4', redeem: 'red-4', adjust: 'blue-4', expire: 'grey-5' }[type] ?? 'grey'
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(amount) {
  if (!amount) return 'LKR 0'
  return 'LKR ' + Number(amount).toLocaleString('en-LK')
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  await store.tryRestoreFromLocal()

  // Load tier metadata
  allTiers.value = await getLoyaltyTiers()

  if (store.isLoggedIn) {
    await loadHistory()
    subscribeToTransactions()
    await nextTick()
    await generateQr()
  }
})

onUnmounted(() => {
  if (_txChannel) {
    supabase.removeChannel(_txChannel)
    _txChannel = null
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
.top-bar-coins {
  display: flex;
  align-items: center;
  font-size: 0.85rem;
  font-weight: 700;
  color: #fbbf24;
  gap: 3px;
}
.coin-label {
  font-size: 0.7rem;
  font-weight: 500;
  opacity: 0.7;
}

// ── No auth state ─────────────────────────────────────────────────────────────
.no-auth-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: 24px;
  text-align: center;
}
.no-auth-icon {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
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

// ── Content wrapper ───────────────────────────────────────────────────────────
.loyalty-content {
  position: relative;
  z-index: 1;
  padding: 20px 16px;
  max-width: 480px;
  margin: 0 auto;
}

// ── Realtime badge ────────────────────────────────────────────────────────────
.realtime-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.68rem;
  color: #4ade80;
  margin-bottom: 20px;
  font-weight: 600;
}
.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.5);
  animation: pulse-ring 1.5s infinite;
  flex-shrink: 0;
}
@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.5);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(74, 222, 128, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
  }
}

// ── Digital Card ──────────────────────────────────────────────────────────────
.card-wrapper {
  position: relative;
  border-radius: 22px;
  overflow: hidden;
  margin-bottom: 8px;
  aspect-ratio: 1.586;
  cursor: default;

  &.standard {
    background: linear-gradient(135deg, #1f2937, #374151, #1f2937);
  }
  &.silver {
    background: linear-gradient(135deg, #334155, #64748b, #334155);
  }
  &.gold {
    background: linear-gradient(135deg, #78350f, #d97706, #78350f);
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

.card-coins-section {
  margin-bottom: 10px;
}
.coins-label {
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 2px;
}
.coins-value {
  font-size: 2.4rem;
  font-weight: 800;
  color: #fff;
  line-height: 1;
}
.coins-sub {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
  font-weight: 500;
}

.card-number-section {
  margin-bottom: 12px;
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

// ── QR Section ────────────────────────────────────────────────────────────────
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
.qr-canvas-wrap canvas {
  border-radius: 8px;
}
.qr-caption {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 2px;
  color: #9ca3af;
}

// ── Tier Progress ─────────────────────────────────────────────────────────────
.tier-section {
  margin-bottom: 20px;
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
  gap: 12px;
}
.tier-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tier-icon-big {
  font-size: 1.6rem;
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
  margin-bottom: 16px;
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
  border-radius: 6px;
  transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.progress-pct {
  font-size: 0.75rem;
  font-weight: 700;
  min-width: 32px;
  text-align: right;
}

// Tier milestones
.tier-milestones {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
}
.milestone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: 0.5;
  transition: opacity 0.3s;
  &.active {
    opacity: 1;
  }
}
.milestone-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transition: background 0.3s;
}
.milestone-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: #9ca3af;
}
.milestone-coins {
  font-size: 0.6rem;
  color: #6b7280;
}

// ── Stats Row ─────────────────────────────────────────────────────────────────
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 28px;
}
.stat-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}
.stat-value {
  font-size: 0.85rem;
  font-weight: 700;
  color: #e5e7eb;
  line-height: 1;
}
.stat-label {
  font-size: 0.62rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

// ── Transaction history ───────────────────────────────────────────────────────
.history-section {
  margin-bottom: 24px;
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
  &.expire {
    background: rgba(107, 114, 128, 0.12);
  }
}

.tx-info {
  flex: 1;
  min-width: 0;
}
.tx-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: #e5e7eb;
}
.tx-sub {
  font-size: 0.72rem;
  color: #6b7280;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tx-note {
  margin-left: 6px;
  font-style: italic;
}
.tx-date {
  font-size: 0.7rem;
  color: #4b5563;
  margin-top: 2px;
}

.tx-coins {
  font-size: 0.9rem;
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
  flex-shrink: 0;

  &.earn {
    color: #34d399;
  }
  &.redeem {
    color: #f87171;
  }
  &.adjust {
    color: #60a5fa;
  }
  &.expire {
    color: #9ca3af;
  }
}
.tx-coin-label {
  font-size: 0.65rem;
  font-weight: 500;
  opacity: 0.7;
  margin-left: 2px;
}

// ── Benefits ──────────────────────────────────────────────────────────────────
.benefits-section {
  margin-bottom: 24px;
}
.benefits-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.benefit-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
  color: #d1d5db;
  font-weight: 500;
}
</style>
