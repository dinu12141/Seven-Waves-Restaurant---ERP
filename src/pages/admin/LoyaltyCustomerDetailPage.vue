<template>
  <q-page class="q-pa-md loyalty-detail-page">
    <!-- Header -->
    <PageHeader
      :title="customerName"
      subtitle="Loyalty Member Detail"
      show-back
      back-route="/admin/loyalty"
    >
      <template #actions>
        <q-btn
          unelevated
          no-caps
          color="orange"
          icon="tune"
          label="Adjust Coins"
          @click="adjustDialog = true"
        />
      </template>
    </PageHeader>

    <!-- Loading -->
    <div v-if="loading" class="column items-center q-pa-xl">
      <q-spinner-dots color="primary" size="48px" />
    </div>

    <div v-else-if="!detail" class="column items-center q-pa-xl text-grey-6">
      <q-icon name="error_outline" size="48px" />
      <div class="text-body1 q-mt-md">Customer not found</div>
    </div>

    <template v-else>
      <div class="detail-grid">
        <!-- Left: Profile + Loyalty Card -->
        <div class="left-col">
          <!-- Profile Card -->
          <q-card flat bordered class="profile-card q-mb-md">
            <q-card-section>
              <div class="column items-center q-mb-md">
                <div class="detail-avatar" :style="{ background: avatarGradient }">
                  {{ (detail.customer?.full_name || '?').charAt(0).toUpperCase() }}
                </div>
                <div class="text-h6 text-weight-bold q-mt-sm">{{ detail.customer?.full_name }}</div>
                <div class="text-caption text-grey-6">{{ detail.customer?.email }}</div>
                <div class="text-caption text-grey-6">{{ detail.customer?.phone || '—' }}</div>
                <q-chip
                  dense
                  :color="detail.customer?.is_active ? 'positive' : 'negative'"
                  text-color="white"
                  size="sm"
                  class="q-mt-xs"
                >
                  {{ detail.customer?.is_active ? 'Active' : 'Inactive' }}
                </q-chip>
              </div>

              <q-separator class="q-mb-md" />

              <div class="profile-stat-row">
                <div class="profile-stat">
                  <div class="profile-stat-value">{{ detail.order_count || 0 }}</div>
                  <div class="profile-stat-label">Total Orders</div>
                </div>
                <div class="profile-stat">
                  <div class="profile-stat-value">
                    LKR {{ Number(detail.loyalty?.total_spent || 0).toLocaleString('en-LK') }}
                  </div>
                  <div class="profile-stat-label">Total Spent</div>
                </div>
              </div>
            </q-card-section>
          </q-card>

          <!-- Loyalty Mini Card -->
          <div class="mini-loyalty-card" :class="cardCssClass">
            <div class="mini-card-glow" />
            <div class="mini-card-inner">
              <div class="row justify-between items-start">
                <div class="card-restaurant-name">SEVEN WAVES</div>
                <div class="mini-tier-badge">
                  {{ tierEmoji }} {{ detail.tier?.tier_name || 'Standard' }}
                </div>
              </div>
              <div class="mini-coins-display">
                <div class="mini-coins-label">COINS BALANCE</div>
                <div class="mini-coins-value">
                  {{ (detail.loyalty?.current_coins || 0).toLocaleString() }}
                </div>
              </div>
              <div class="mini-card-no">
                {{ detail.loyalty?.loyalty_card_no || detail.loyalty?.card_number || '—' }}
              </div>
              <div class="row justify-between items-end">
                <div>
                  <div class="mini-holder-label">CARD HOLDER</div>
                  <div class="mini-holder-name">{{ detail.customer?.full_name }}</div>
                </div>
                <div class="mini-chip">
                  <div v-for="i in 3" :key="i" class="mini-chip-line" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Stats + Transactions -->
        <div class="right-col">
          <!-- Coin Stats -->
          <div class="stats-row q-mb-md">
            <div class="stat-box">
              <q-icon name="toll" color="amber-8" size="20px" />
              <div class="stat-box-value">
                {{ (detail.loyalty?.current_coins || 0).toLocaleString() }}
              </div>
              <div class="stat-box-label">Current Coins</div>
            </div>
            <div class="stat-box">
              <q-icon name="add_circle" color="green-7" size="20px" />
              <div class="stat-box-value">
                {{ (detail.loyalty?.total_earned_coins || 0).toLocaleString() }}
              </div>
              <div class="stat-box-label">Total Earned</div>
            </div>
            <div class="stat-box">
              <q-icon name="remove_circle" color="red-5" size="20px" />
              <div class="stat-box-value">
                {{ (detail.loyalty?.total_redeemed_coins || 0).toLocaleString() }}
              </div>
              <div class="stat-box-label">Redeemed</div>
            </div>
          </div>

          <!-- Tier Progress -->
          <q-card flat bordered class="q-mb-md tier-progress-admin">
            <q-card-section>
              <div class="text-subtitle2 text-weight-bold q-mb-md">Tier Progress</div>
              <div class="row items-center q-mb-sm">
                <div
                  class="tier-chip"
                  :style="{
                    background: detail.tier?.badge_color + '22',
                    color: detail.tier?.badge_color,
                  }"
                >
                  {{ tierEmoji }} {{ detail.tier?.tier_name }}
                </div>
                <q-space />
                <div v-if="tierProgress.nextTier" class="text-caption text-grey-6">
                  {{ tierProgress.coinsNeeded }} coins to {{ tierProgress.nextTier }}
                </div>
                <div v-else class="text-caption text-amber-8 text-weight-medium">🏆 Max Tier</div>
              </div>
              <q-linear-progress
                :value="tierProgress.progress / 100"
                :color="tierProgressColor"
                rounded
                class="q-mt-sm"
                style="height: 8px"
              />
              <div class="text-caption text-grey-6 q-mt-xs text-right">
                {{ tierProgress.progress }}% to next tier
              </div>

              <!-- Tier milestones -->
              <div class="milestone-row q-mt-sm">
                <div
                  v-for="tier in ['STANDARD', 'SILVER', 'GOLD']"
                  :key="tier"
                  class="milestone-item"
                  :class="{ 'milestone-active': isTierReached(tier) }"
                >
                  {{ { STANDARD: '⭐ 0', SILVER: '🥈 100', GOLD: '🥇 250' }[tier] }}
                </div>
              </div>
            </q-card-section>
          </q-card>

          <!-- Transaction History -->
          <q-card flat bordered>
            <q-card-section>
              <div class="text-subtitle2 text-weight-bold q-mb-md">
                Loyalty Transactions
                <q-badge color="grey-5" class="q-ml-xs">{{
                  (detail.transactions || []).length
                }}</q-badge>
              </div>

              <div
                v-if="!detail.transactions || detail.transactions.length === 0"
                class="column items-center q-pa-lg text-grey-6"
              >
                <q-icon name="receipt_long" size="36px" />
                <div class="text-body2 q-mt-sm">No transactions yet</div>
              </div>

              <div v-else>
                <div v-for="tx in detail.transactions" :key="tx.id" class="tx-row">
                  <div class="tx-icon" :class="tx.transaction_type">
                    <q-icon
                      :name="txIcon(tx.transaction_type)"
                      size="16px"
                      :color="txColor(tx.transaction_type)"
                    />
                  </div>
                  <div class="tx-content">
                    <div class="tx-type">{{ txLabel(tx.transaction_type) }}</div>
                    <div class="tx-note">{{ tx.note || '—' }}</div>
                    <div class="tx-meta">
                      {{ formatDateTime(tx.created_at) }}
                      <span v-if="tx.order_id" class="q-ml-xs text-blue-7">
                        · Order #{{ tx.order_id.slice(-6) }}
                      </span>
                    </div>
                  </div>
                  <div class="tx-coins" :class="tx.transaction_type">
                    {{
                      tx.transaction_type === 'earn'
                        ? '+'
                        : tx.transaction_type === 'adjust' && tx.coins > 0
                          ? '+'
                          : '-'
                    }}{{ Math.abs(tx.coins || 0) }}
                    <span class="tx-coin-sub">coins</span>
                  </div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </template>

    <!-- Adjust Coins Dialog -->
    <q-dialog v-model="adjustDialog" persistent>
      <q-card style="min-width: 360px; border-radius: 16px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6 text-weight-bold">Adjust Coins</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section>
          <div class="adjust-balance-display q-mb-md">
            <q-icon name="toll" color="amber" size="18px" />
            <span class="text-h6 text-weight-bold q-ml-xs">{{
              detail?.loyalty?.current_coins || 0
            }}</span>
            <span class="text-caption text-grey-6 q-ml-sm">current coins</span>
          </div>

          <q-btn-toggle
            v-model="adjustType"
            no-caps
            :options="[
              { label: '+ Add Coins', value: 'add' },
              { label: '− Remove Coins', value: 'remove' },
            ]"
            toggle-color="primary"
            color="grey-3"
            text-color="grey-8"
            unelevated
            class="full-width q-mb-md"
          />

          <q-input
            v-model.number="adjustCoins"
            type="number"
            label="Coins *"
            outlined
            dense
            min="1"
            class="q-mb-md"
          />
          <q-input
            v-model="adjustNote"
            label="Reason / Note *"
            outlined
            dense
            type="textarea"
            rows="2"
          />

          <div class="text-caption text-grey-6 q-mt-sm">
            Preview:
            <strong>{{
              Math.max(
                0,
                (detail?.loyalty?.current_coins || 0) +
                  (adjustType === 'add' ? adjustCoins : -adjustCoins),
              )
            }}</strong>
            coins
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps label="Cancel" v-close-popup />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Apply"
            :loading="adjustLoading"
            :disable="!adjustNote?.trim() || !adjustCoins"
            @click="applyAdjustment"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useQuasar, date } from 'quasar'
import PageHeader from 'components/common/PageHeader.vue'
import {
  adminGetLoyaltyCustomerDetail,
  adminAdjustLoyaltyCoins,
  getTierProgress,
} from 'src/services/loyaltyService'

const route = useRoute()
const $q = useQuasar()

const detail = ref(null)
const loading = ref(false)

const adjustDialog = ref(false)
const adjustType = ref('add')
const adjustCoins = ref(0)
const adjustNote = ref('')
const adjustLoading = ref(false)

const customerId = computed(() => route.params.id)

const customerName = computed(() => detail.value?.customer?.full_name || 'Customer Detail')

const cardCssClass = computed(() => {
  const code = detail.value?.tier?.tier_code?.toUpperCase()
  if (code === 'GOLD') return 'gold'
  if (code === 'SILVER') return 'silver'
  return 'standard'
})

const tierEmoji = computed(() => {
  const code = detail.value?.tier?.tier_code?.toUpperCase()
  return { GOLD: '🥇', SILVER: '🥈', STANDARD: '⭐' }[code] || '⭐'
})

const avatarGradient = computed(() => {
  const colors = [
    'linear-gradient(135deg, #f97316, #ef4444)',
    'linear-gradient(135deg, #3b82f6, #6366f1)',
    'linear-gradient(135deg, #10b981, #06b6d4)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
  ]
  const idx = (detail.value?.customer?.full_name?.charCodeAt(0) || 0) % colors.length
  return colors[idx]
})

const tierProgress = computed(() => {
  const code = detail.value?.tier?.tier_code || 'STANDARD'
  const coins = detail.value?.loyalty?.current_coins || 0
  return getTierProgress(code, coins)
})

const tierProgressColor = computed(() => {
  const code = detail.value?.tier?.tier_code
  if (code === 'GOLD') return 'amber'
  if (code === 'SILVER') return 'blue-grey'
  return 'orange'
})

function isTierReached(tierCode) {
  const coins = detail.value?.loyalty?.current_coins || 0
  const thresholds = { STANDARD: 0, SILVER: 100, GOLD: 250 }
  return coins >= thresholds[tierCode]
}

async function loadDetail() {
  loading.value = true
  try {
    const result = await adminGetLoyaltyCustomerDetail(customerId.value)
    if (result.success) {
      detail.value = result
    } else {
      $q.notify({ type: 'negative', message: result.error || 'Failed to load' })
    }
  } catch {
    $q.notify({ type: 'negative', message: 'Failed to load customer' })
  } finally {
    loading.value = false
  }
}

async function applyAdjustment() {
  if (!adjustNote.value?.trim() || !adjustCoins.value) return
  adjustLoading.value = true
  try {
    const delta = adjustType.value === 'add' ? adjustCoins.value : -adjustCoins.value
    const result = await adminAdjustLoyaltyCoins(customerId.value, delta, adjustNote.value)

    if (!result.success) {
      $q.notify({ type: 'negative', message: result.error || 'Adjustment failed' })
      return
    }

    $q.notify({
      type: 'positive',
      message: `Coins adjusted. New balance: ${result.new_coins}`,
      icon: 'toll',
    })
    adjustDialog.value = false
    await loadDetail() // Reload to reflect changes
  } catch {
    $q.notify({ type: 'negative', message: 'Adjustment failed' })
  } finally {
    adjustLoading.value = false
  }
}

function txLabel(type) {
  return (
    {
      earn: 'Coins Earned',
      redeem: 'Coins Redeemed',
      adjust: 'Admin Adjustment',
      expire: 'Expired',
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
  return { earn: 'green-7', redeem: 'red-5', adjust: 'blue-5', expire: 'grey-5' }[type] ?? 'grey'
}
function formatDateTime(val) {
  if (!val) return '—'
  return date.formatDate(val, 'DD MMM YYYY · HH:mm')
}

onMounted(loadDetail)
</script>

<style lang="scss" scoped>
.loyalty-detail-page {
  max-width: 1200px;
  margin: 0 auto;
}

.detail-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

// Profile card
.profile-card {
  border-radius: 12px;
}
.body--dark .profile-card {
  background: rgba(255, 255, 255, 0.04) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}
.detail-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 800;
  color: white;
}
.profile-stat-row {
  display: flex;
  gap: 12px;
  text-align: center;
}
.profile-stat {
  flex: 1;
  padding: 10px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 8px;
}
.profile-stat-value {
  font-size: 0.85rem;
  font-weight: 700;
  color: #111827;
}

.body--dark {
  .profile-stat {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .profile-stat-value {
    color: #e5e7eb;
  }
}
.profile-stat-label {
  font-size: 0.68rem;
  color: #6b7280;
  margin-top: 3px;
}

// Mini loyalty card
.mini-loyalty-card {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  aspect-ratio: 1.586;

  &.standard {
    background: linear-gradient(135deg, #1f2937, #374151);
  }
  &.silver {
    background: linear-gradient(135deg, #334155, #64748b);
  }
  &.gold {
    background: linear-gradient(135deg, #78350f, #d97706);
  }
}
.mini-card-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 30% 30%, rgba(255, 255, 255, 0.2), transparent 60%);
}
.mini-card-inner {
  position: relative;
  z-index: 1;
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.card-restaurant-name {
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.8);
}
.mini-tier-badge {
  font-size: 0.65rem;
  font-weight: 700;
  color: white;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 3px 8px;
}
.mini-coins-label {
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: rgba(255, 255, 255, 0.5);
}
.mini-coins-value {
  font-size: 1.8rem;
  font-weight: 800;
  color: white;
  line-height: 1;
}
.mini-card-no {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.7);
}
.mini-holder-label {
  font-size: 0.45rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: rgba(255, 255, 255, 0.5);
}
.mini-holder-name {
  font-size: 0.75rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
}
.mini-chip {
  width: 30px;
  height: 22px;
  background: linear-gradient(135deg, #d4af37, #ffd700);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  padding: 3px 4px;
}
.mini-chip-line {
  height: 1.5px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 1px;
}

// Stats row
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.stat-box {
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  transition: background 0.2s;
  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
}
.stat-box-value {
  font-size: 1.2rem;
  font-weight: 800;
  color: #111827;
}

.body--dark {
  .stat-box {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    &:hover {
      background: rgba(255, 255, 255, 0.06);
    }
  }
  .stat-box-value {
    color: #e5e7eb;
  }
}
.stat-box-label {
  font-size: 0.65rem;
  color: #6b7280;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

// Tier progress
.tier-progress-admin {
  border-radius: 12px;
}
.body--dark .tier-progress-admin {
  background: rgba(255, 255, 255, 0.04) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}
.tier-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 700;
  border: 1px solid currentColor;
}
.milestone-row {
  display: flex;
  justify-content: space-between;
}
.milestone-item {
  font-size: 0.68rem;
  color: #4b5563;
  font-weight: 600;
  &.milestone-active {
    color: #f59e0b;
  }
}

// Transactions
.tx-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  &:last-child {
    border-bottom: none;
  }
}
.tx-icon {
  width: 32px;
  height: 32px;
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
.tx-content {
  flex: 1;
  min-width: 0;
}
.tx-type {
  font-size: 0.85rem;
  font-weight: 600;
  color: #111827;
}

.body--dark {
  .tx-row {
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .tx-type {
    color: #e5e7eb;
  }
}
.tx-note {
  font-size: 0.72rem;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tx-meta {
  font-size: 0.68rem;
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
    color: #10b981;
  }
  &.redeem {
    color: #ef4444;
  }
  &.adjust {
    color: #3b82f6;
  }
  &.expire {
    color: #6b7280;
  }
}
.tx-coin-sub {
  font-size: 0.65rem;
  opacity: 0.7;
  margin-left: 2px;
}

// Transaction History card
.body--dark {
  :deep(.q-card--bordered) {
    border-color: rgba(255, 255, 255, 0.08) !important;
  }
  :deep(.q-card.q-card--flat) {
    background: rgba(255, 255, 255, 0.04) !important;
  }
}

// Dialog
.adjust-balance-display {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: 10px;
}
</style>
