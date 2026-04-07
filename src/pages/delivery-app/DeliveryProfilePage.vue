<template>
  <q-page class="delivery-profile-page">
    <!-- ── Profile Hero ──────────────────────── -->
    <div class="profile-hero">
      <!-- Decorative orbs -->
      <div class="hero-orb hero-orb--1" />
      <div class="hero-orb hero-orb--2" />

      <div class="profile-hero-inner">
        <!-- Avatar ring -->
        <div class="profile-avatar-wrap">
          <div class="profile-avatar-ring">
            <div class="profile-avatar">{{ initials(riderName) }}</div>
          </div>
          <!-- Online indicator -->
          <div class="profile-live-badge" :class="{ 'profile-live-badge--offline': !store.isConnected }">
            <div class="profile-live-dot" />
          </div>
        </div>

        <!-- Info -->
        <div class="profile-name">{{ riderName }}</div>
        <span class="profile-role-badge">
          <q-icon name="delivery_dining" size="11px" class="q-mr-xs" />
          Delivery Rider
        </span>
        <div class="profile-email">{{ authStore.user?.email || '' }}</div>
      </div>
    </div>

    <!-- ── Today's Performance ─────────────── -->
    <div class="q-px-md q-mt-lg">
      <div class="section-heading">
        <q-icon name="bar_chart" size="14px" class="q-mr-xs" />
        Today's Performance
      </div>
      <div class="stats-grid">
        <div class="stat-item stat-item--green">
          <q-icon name="check_circle" size="22px" color="green-6" />
          <div class="stat-value">{{ store.completedTodayCount }}</div>
          <div class="stat-label">Deliveries</div>
        </div>
        <div class="stat-item stat-item--amber">
          <q-icon name="payments" size="22px" color="amber-7" />
          <div class="stat-value">{{ todayEarnings }}</div>
          <div class="stat-label">Earnings</div>
        </div>
        <div class="stat-item stat-item--blue">
          <q-icon name="timer" size="22px" color="blue-6" />
          <div class="stat-value">{{ avgTime }}</div>
          <div class="stat-label">Avg Time</div>
        </div>
        <div class="stat-item stat-item--purple">
          <q-icon name="local_shipping" size="22px" color="purple-5" />
          <div class="stat-value">{{ store.activeCount }}</div>
          <div class="stat-label">Active</div>
        </div>
      </div>
    </div>

    <!-- ── Status ─────────────────────────── -->
    <div class="q-px-md q-mt-lg">
      <div class="section-heading">
        <q-icon name="info_outline" size="14px" class="q-mr-xs" />
        Status
      </div>
      <div class="status-card">
        <div class="status-card__row">
          <div class="status-card__label">
            <q-icon
              name="wifi"
              size="18px"
              class="q-mr-sm"
              :color="store.isConnected ? 'green-6' : 'red-5'"
            />
            Realtime Connection
          </div>
          <span class="status-pill" :class="store.isConnected ? 'status-pill--live' : 'status-pill--offline'">
            <span class="status-dot" />
            {{ store.isConnected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
        <div class="status-card__divider" />
        <div class="status-card__row">
          <div class="status-card__label">
            <q-icon name="store" size="18px" class="q-mr-sm" color="purple-4" />
            Branch
          </div>
          <span class="status-branch">{{ authStore.currentBranch?.name || '—' }}</span>
        </div>
      </div>
    </div>

    <!-- ── Sign Out ────────────────────────── -->
    <div class="q-px-md q-mt-lg">
      <q-btn
        unelevated
        no-caps
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
import { useRouter } from 'vue-router'
import { useDeliveryStore } from 'src/stores/deliveryStore'
import { useAuthStore } from 'stores/auth'

const store = useDeliveryStore()
const authStore = useAuthStore()
const router = useRouter()

// ── Rider display name ────────────────────
// Priority: profile full_name → email prefix → 'Rider'
const riderName = computed(() => {
  if (authStore.profile?.full_name) return authStore.profile.full_name
  const email = authStore.user?.email || ''
  if (email) return email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return 'Rider'
})

function initials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

const todayEarnings = computed(() => {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const total = store.history
    .filter((h) => h.delivered_at && new Date(h.delivered_at) >= todayStart)
    .reduce((sum, h) => sum + Number(h.orderTotal || 0), 0)
  if (total === 0) return '0'
  return `${(total / 1000).toFixed(1)}K`
})

const avgTime = computed(() => {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const completed = store.history.filter(
    (h) => h.assigned_at && h.delivered_at && new Date(h.delivered_at) >= todayStart,
  )
  if (!completed.length) return '—'
  const totalMins = completed.reduce((sum, h) => {
    return (
      sum +
      Math.round((new Date(h.delivered_at).getTime() - new Date(h.assigned_at).getTime()) / 60000)
    )
  }, 0)
  return `${Math.round(totalMins / completed.length)}m`
})

function logout() {
  store.cleanup()
  authStore.signOut()
  router.push('/auth/login')
}
</script>

<style lang="scss" scoped>
.delivery-profile-page {
  min-height: 100vh;
  padding: 0 0 16px;
}

// ── Hero ──────────────────────────────────
.profile-hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 20px 28px;
  background: linear-gradient(135deg, #3d1a78 0%, #6d28d9 50%, #7c3aed 100%) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

// Decorative orbs
.hero-orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  &--1 {
    width: 160px;
    height: 160px;
    background: rgba(196, 181, 253, 0.22);
    top: -50px;
    right: -40px;
    filter: blur(22px);
  }
  &--2 {
    width: 100px;
    height: 100px;
    background: rgba(167, 139, 250, 0.18);
    bottom: -30px;
    left: 10px;
    filter: blur(16px);
  }
}

.profile-hero-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

// Glowing avatar ring
.profile-avatar-wrap {
  position: relative;
  margin-bottom: 14px;
}
.profile-avatar-ring {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  padding: 2.5px;
  background: linear-gradient(135deg, #c4b5fd, #7c3aed, #4c1d95);
  box-shadow: 0 0 28px rgba(167, 139, 250, 0.55);
}
.profile-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(135deg, #5b21b6, #7c3aed);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.5px;
}
.profile-live-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #10b981;
  border: 2.5px solid #3d1a78;
  display: flex;
  align-items: center;
  justify-content: center;
  &--offline { background: #ef4444; }
}
.profile-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fff;
  animation: live-ping 1.8s ease-in-out infinite;
}
@keyframes live-ping {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.7; }
}

.profile-name {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.3px;
  text-shadow: 0 1px 6px rgba(0,0,0,0.2);
  margin-bottom: 8px;
}

.profile-role-badge {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: #ede9fe;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  padding: 4px 12px;
  border-radius: 20px;
  margin-bottom: 8px;
}

.profile-email {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.2px;
}

// ── Section Heading ───────────────────────
.section-heading {
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #94a3b8;
  margin-bottom: 10px;
}

// ── Stats Grid ────────────────────────────
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 14px 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  transition: transform 0.15s;

  &--green { border-top: 2px solid #22c55e; }
  &--amber  { border-top: 2px solid #f59e0b; }
  &--blue   { border-top: 2px solid #3b82f6; }
  &--purple { border-top: 2px solid #a78bfa; }
}
.stat-value {
  font-size: 18px;
  font-weight: 800;
  color: #e8eaf0;
  line-height: 1;
}
.stat-label {
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

// ── Status Card ───────────────────────────
.status-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  padding: 14px 16px;

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 10px 0;
  }
  &__label {
    display: flex;
    align-items: center;
    font-size: 15px;
    font-weight: 500;
    color: #94a3b8;
  }
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  letter-spacing: 0.3px;
  &--live {
    color: #d1fae5;
    background: rgba(16, 185, 129, 0.18);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  &--offline {
    color: #fee2e2;
    background: rgba(239, 68, 68, 0.18);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: live-ping 1.8s ease-in-out infinite;
}
.status-branch {
  font-size: 15px;
  font-weight: 600;
  color: #c4b5fd;
}

// ── Sign Out ──────────────────────────────
.signout-btn {
  height: 50px;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(135deg, #1e1b4b, #312e81) !important;
  color: #fff !important;
  border: 1px solid rgba(99, 102, 241, 0.3);
  letter-spacing: 0.4px;
  transition: opacity 0.2s;
  &:hover { opacity: 0.88; }
}
</style>

<style lang="scss">
body.body--light {
  .delivery-profile-page {
    background: #f8fafc;
  }

  // Hero — keep vibrant gradient in light mode
  .profile-hero {
    background: linear-gradient(135deg, #2e1065 0%, #5b21b6 45%, #7c3aed 100%) !important;
    box-shadow: 0 6px 24px rgba(91, 33, 182, 0.2);
  }

  // All hero text stays white (on dark gradient)
  .profile-name,
  .profile-role-badge,
  .profile-email {
    color: #fff !important;
  }
  .profile-role-badge {
    background: rgba(255, 255, 255, 0.18) !important;
    border-color: rgba(255, 255, 255, 0.22) !important;
  }
  .profile-email {
    color: rgba(255, 255, 255, 0.55) !important;
  }

  // Section heading
  .section-heading {
    color: #64748b !important;
  }

  // Stats
  .stat-item {
    background: #ffffff !important;
    border: 1px solid #e2e8f0 !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;

    &--green { border-top: 2px solid #22c55e !important; }
    &--amber  { border-top: 2px solid #f59e0b !important; }
    &--blue   { border-top: 2px solid #3b82f6 !important; }
    &--purple { border-top: 2px solid #a78bfa !important; }
  }
  .stat-value {
    color: #0f172a !important;
  }
  .stat-label {
    color: #94a3b8 !important;
  }

  // Status card
  .status-card {
    background: #ffffff !important;
    border: 1px solid #e2e8f0 !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;

    &__divider {
      background: #f1f5f9 !important;
    }
    &__label {
      color: #475569 !important;
    }
  }
  .status-branch {
    color: #7c3aed !important;
    font-weight: 600;
  }
  .status-pill--live {
    background: rgba(16, 185, 129, 0.1) !important;
    border-color: rgba(16, 185, 129, 0.3) !important;
    color: #059669 !important;
  }
  .status-pill--offline {
    background: rgba(239, 68, 68, 0.08) !important;
    border-color: rgba(239, 68, 68, 0.25) !important;
    color: #dc2626 !important;
  }

  // Sign out — keep dark on light bg for contrast
  .signout-btn {
    background: linear-gradient(135deg, #1e1b4b, #312e81) !important;
    color: #fff !important;
    border-color: rgba(99, 102, 241, 0.3) !important;
    box-shadow: 0 4px 16px rgba(49, 46, 129, 0.2) !important;
  }
}
</style>
