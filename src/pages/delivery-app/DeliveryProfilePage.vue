<template>
  <q-page class="delivery-profile-page">

    <!-- ── Profile Header ──────────────────────── -->
    <div class="profile-hero">
      <q-avatar size="72px" class="profile-avatar text-weight-bold text-white">
        {{ initials(authStore.userDisplayName) }}
      </q-avatar>
      <div class="profile-name">{{ authStore.userDisplayName || 'Delivery Rider' }}</div>
      <q-chip dense color="deep-purple-9" text-color="white" icon="delivery_dining" class="q-mt-xs">
        Delivery Rider
      </q-chip>
      <div class="profile-email text-caption text-grey-5 q-mt-xs">
        {{ authStore.user?.email || '' }}
      </div>
    </div>

    <!-- ── Today's Stats ───────────────────────── -->
    <div class="q-px-md q-mt-lg">
      <div class="section-heading">Today's Performance</div>
      <div class="stats-grid">
        <div class="stat-item">
          <q-icon name="check_circle" size="20px" color="green-4" />
          <div class="stat-value">{{ store.completedTodayCount }}</div>
          <div class="stat-label">Deliveries</div>
        </div>
        <div class="stat-item">
          <q-icon name="payments" size="20px" color="amber-4" />
          <div class="stat-value">{{ todayEarnings }}</div>
          <div class="stat-label">Earnings</div>
        </div>
        <div class="stat-item">
          <q-icon name="timer" size="20px" color="blue-4" />
          <div class="stat-value">{{ avgTime }}</div>
          <div class="stat-label">Avg Time</div>
        </div>
        <div class="stat-item">
          <q-icon name="local_shipping" size="20px" color="purple-4" />
          <div class="stat-value">{{ store.activeCount }}</div>
          <div class="stat-label">Active</div>
        </div>
      </div>
    </div>

    <!-- ── Connection Status ───────────────────── -->
    <div class="q-px-md q-mt-lg">
      <div class="section-heading">Status</div>
      <div class="status-card">
        <div class="status-card__row">
          <div class="status-card__label">
            <q-icon name="wifi" size="18px" class="q-mr-sm" :color="store.isConnected ? 'green-4' : 'red-4'" />
            Realtime Connection
          </div>
          <q-chip dense :color="store.isConnected ? 'green-9' : 'red-9'" text-color="white" size="sm">
            {{ store.isConnected ? 'Connected' : 'Disconnected' }}
          </q-chip>
        </div>
        <div class="status-card__row q-mt-sm">
          <div class="status-card__label">
            <q-icon name="store" size="18px" class="q-mr-sm" color="grey-5" />
            Branch
          </div>
          <span class="text-grey-4 text-caption">{{ authStore.currentBranch?.name || '—' }}</span>
        </div>
      </div>
    </div>

    <!-- ── Sign Out ────────────────────────────── -->
    <div class="q-px-md q-mt-lg">
      <q-btn
        unelevated no-caps
        color="red-9"
        icon="logout"
        label="Sign Out"
        class="signout-btn full-width"
        @click="logout"
      />
    </div>

    <div style="height: 32px" />
  </q-page>
</template>

<script setup>
import { computed } from 'vue'
import { useDeliveryStore } from 'src/stores/deliveryStore'
import { useAuthStore } from 'stores/auth'
import { supabase } from 'src/boot/supabase'

const store = useDeliveryStore()
const authStore = useAuthStore()

function initials(name) {
  if (!name) return '?'
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

const todayEarnings = computed(() => {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const total = store.history
    .filter(h => h.delivered_at && new Date(h.delivered_at) >= todayStart)
    .reduce((sum, h) => sum + Number(h.orderTotal || 0), 0)
  if (total === 0) return '0'
  return `${(total / 1000).toFixed(1)}K`
})

const avgTime = computed(() => {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const completed = store.history.filter(
    h => h.assigned_at && h.delivered_at && new Date(h.delivered_at) >= todayStart
  )
  if (!completed.length) return '—'
  const totalMins = completed.reduce((sum, h) => {
    return sum + Math.round((new Date(h.delivered_at).getTime() - new Date(h.assigned_at).getTime()) / 60000)
  }, 0)
  return `${Math.round(totalMins / completed.length)}m`
})

async function logout() {
  try {
    store.cleanup()
    await supabase.auth.signOut()
  } finally {
    window.location.href = '/#/auth/login'
  }
}
</script>

<style lang="scss" scoped>
.delivery-profile-page {
  min-height: 100vh;
  padding: 0 0 16px;
}

// ── Hero ──────────────────────────────────
.profile-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px 24px;
  background: linear-gradient(135deg, rgba(124, 77, 255, 0.1), rgba(206, 147, 216, 0.06), transparent);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.profile-avatar {
  background: linear-gradient(135deg, #7c4dff, #b388ff) !important;
  font-size: 26px !important;
  margin-bottom: 12px;
}
.profile-name {
  font-size: 20px;
  font-weight: 800;
  color: #e8eaf0;
}
.profile-email {
  font-size: 12px;
}

// ── Section Heading ──────────────────────
.section-heading {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #4b5563;
  margin-bottom: 12px;
}

// ── Stats Grid ───────────────────────────
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}
.stat-value {
  font-size: 18px;
  font-weight: 800;
  color: #e8eaf0;
}
.stat-label {
  font-size: 9px;
  color: #757575;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

// ── Status Card ──────────────────────────
.status-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px 16px;
  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__label {
    display: flex;
    align-items: center;
    font-size: 13px;
    color: #bdbdbd;
  }
}

// ── Sign Out ─────────────────────────────
.signout-btn {
  height: 48px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
}
</style>

<style lang="scss">
body.body--light {
  .delivery-profile-page {
    background: #f8fafc;
  }

  // Hero
  .profile-hero {
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.06), rgba(167, 139, 250, 0.04), transparent);
    border-bottom: 1px solid #e2e8f0;
  }
  .profile-name { color: #0f172a; }

  // Section heading
  .section-heading { color: #475569; }

  // Stats grid
  .stat-item {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }
  .stat-value { color: #0f172a; }
  .stat-label { color: #94a3b8; }

  // Status card
  .status-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

    &__label { color: #475569; }
  }
}

