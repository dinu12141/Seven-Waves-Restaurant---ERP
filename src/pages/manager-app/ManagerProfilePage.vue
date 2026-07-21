<template>
  <q-page class="mgr-profile-page" :class="{ lt: !$q.dark.isActive }" padding>
    <!-- Page Header -->
    <div class="page-header q-mb-lg">
      <div class="page-header__left">
        <div class="page-header__icon-wrap page-header__icon-wrap--purple">
          <q-icon name="person" size="20px" />
        </div>
        <div>
          <div class="page-header__title">Manager Profile</div>
          <div class="page-header__sub">Your account details</div>
        </div>
      </div>
    </div>

    <!-- Profile Card -->
    <div class="profile-card q-mb-lg">
      <div class="profile-card__bg" />
      <div class="row items-center q-pa-md profile-card__content">
        <q-avatar size="56px" class="profile-avatar text-weight-bold text-white">
          {{ initials(authStore.userDisplayName) }}
        </q-avatar>
        <div class="q-ml-md col">
          <div class="profile-name">{{ authStore.userDisplayName }}</div>
          <div class="profile-role">Manager</div>
          <div class="profile-email">{{ authStore.user?.email }}</div>
        </div>
      </div>
    </div>

    <!-- Branch Info -->
    <div class="section-title q-mb-sm">BRANCH</div>
    <div class="info-card q-mb-lg">
      <div class="info-row">
        <div class="info-icon-wrap info-icon--indigo">
          <q-icon name="store" size="16px" />
        </div>
        <span class="info-text">{{ authStore.currentBranch?.name || 'No branch assigned' }}</span>
      </div>
    </div>

    <!-- Roles -->
    <div class="section-title q-mb-sm">ROLES</div>
    <div class="info-card q-mb-lg">
      <div class="row q-gutter-sm q-pa-md">
        <q-chip
          v-for="role in authStore.roles"
          :key="role"
          dense
          class="role-chip"
        >
          {{ role }}
        </q-chip>
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="section-title q-mb-sm">TODAY'S SUMMARY</div>
    <div class="row q-col-gutter-sm q-mb-lg">
      <div class="col-6">
        <div class="mini-kpi">
          <span class="mini-val mini-val--cyan">{{ store.onShiftWaiters.length }}</span>
          <span class="mini-lbl">Waiters</span>
        </div>
      </div>
      <div class="col-6">
        <div class="mini-kpi">
          <span class="mini-val mini-val--green">{{ store.servedTodayCount }}</span>
          <span class="mini-lbl">Served Today</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <q-btn
      class="full-width signout-btn"
      unelevated
      no-caps
      icon="logout"
      label="Sign Out"
      @click="logout"
    />
  </q-page>
</template>

<script setup>
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import { useAuthStore } from 'stores/auth'

const $q = useQuasar()

const store = useManagerAppStore()
const authStore = useAuthStore()
const router = useRouter()

function initials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

function logout() {
  store.cleanup()
  authStore.signOut()
  router.push('/auth/login')
}
</script>

<style lang="scss" scoped>
.mgr-profile-page {
  background: #060a12;
  padding: 0 !important;
}
.mgr-profile-page.lt {
  background: #f1f5f9;
}

// ─── Page Header ─────────────────────────────────────────────────────────────
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 0;
}
.page-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.page-header__icon-wrap {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-header__icon-wrap--purple {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.12));
  color: #a78bfa;
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.15);
}
.lt .page-header__icon-wrap--purple {
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
  box-shadow: none;
}
.page-header__title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #f3f4f6;
}
.lt .page-header__title { color: #1e293b; }
.page-header__sub {
  font-size: 0.80rem;
  color: #6b7280;
  margin-top: 1px;
}
.lt .page-header__sub { color: #94a3b8; }

// ─── Section Title ───────────────────────────────────────────────────────────
.section-title {
  font-size: 0.80rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #4b5563;
  padding: 0 16px;
}
.lt .section-title { color: #94a3b8; }

// ─── Profile Card ────────────────────────────────────────────────────────────
.profile-card {
  border-radius: 0 0 28px 28px;
  overflow: hidden;
  position: relative;
  margin: 0;
  background: linear-gradient(135deg, #0c0f1d 0%, #1a1040 50%, #0c0f1d 100%);
  border: none;
  border-bottom: 1px solid rgba(34, 211, 238, 0.1);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}
.lt .profile-card {
  background: linear-gradient(135deg, #e0f2fe 0%, #ede9fe 50%, #e0f2fe 100%);
  border: none;
  border-bottom: 1px solid #ddd6fe;
  box-shadow: 0 4px 24px rgba(99, 102, 241, 0.1);
}

@keyframes mgrHeroGlow {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
.profile-card__bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.06), rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.06));
  pointer-events: none;
  animation: mgrHeroGlow 4s ease-in-out infinite;

  &::after {
    content: '';
    position: absolute;
    top: -40px;
    right: -40px;
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(34, 211, 238, 0.1) 0%, transparent 70%);
  }
}
.lt .profile-card__bg {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.06));
  animation: none;
}
.profile-card__content {
  position: relative;
  padding: 20px 20px 24px !important;
}

.profile-avatar {
  width: 80px !important;
  height: 80px !important;
  min-width: 80px !important;
  font-size: 26px !important;
  background: linear-gradient(135deg, #06b6d4, #6366f1, #8b5cf6) !important;
  box-shadow:
    0 0 0 3px rgba(6, 182, 212, 0.3),
    0 0 0 6px rgba(6, 182, 212, 0.1),
    0 8px 28px rgba(6, 182, 212, 0.35) !important;
}
.lt .profile-avatar {
  box-shadow:
    0 0 0 3px rgba(6, 182, 212, 0.2),
    0 4px 20px rgba(6, 182, 212, 0.25) !important;
}
.profile-name {
  font-size: 1.5rem;
  font-weight: 800;
  color: #f3f4f6;
  line-height: 1.2;
}
.lt .profile-name { color: #1e293b; }
.profile-role {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #22d3ee;
  background: rgba(6, 182, 212, 0.12) !important;
  -webkit-text-fill-color: #22d3ee !important;
  border: 1px solid rgba(34, 211, 238, 0.25);
  border-radius: 6px;
  padding: 3px 10px;
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.15);
  margin-top: 5px;
  background-clip: initial !important;
}
.lt .profile-role {
  background: rgba(8, 145, 178, 0.08) !important;
  -webkit-text-fill-color: #0891b2 !important;
  color: #0891b2;
  border-color: rgba(8, 145, 178, 0.2);
  box-shadow: none;
}
.profile-email {
  font-size: 0.82rem;
  color: #6b7280;
  margin-top: 4px;
}
.lt .profile-email { color: #475569; }

// ─── Info Cards ──────────────────────────────────────────────────────────────
.info-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  margin: 0 16px;
}
.lt .info-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  margin: 0 16px;
}
.info-row {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  gap: 10px;
}
.info-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.info-icon--indigo {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(139, 92, 246, 0.1));
  color: #818cf8;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.15);
}
.lt .info-icon--indigo {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  box-shadow: none;
}
.info-text {
  color: #d1d5db;
  font-size: 0.95rem;
  font-weight: 500;
}
.lt .info-text { color: #374151; }

// ─── Role Chips ──────────────────────────────────────────────────────────────
.role-chip {
  font-size: 0.82rem !important;
  font-weight: 600 !important;
  text-transform: capitalize !important;
  background: rgba(34, 211, 238, 0.1) !important;
  color: #22d3ee !important;
  border: 1px solid rgba(34, 211, 238, 0.2) !important;
}
.lt .role-chip {
  background: rgba(8, 145, 178, 0.08) !important;
  color: #0891b2 !important;
  border: 1px solid rgba(8, 145, 178, 0.2) !important;
}

// ─── Mini KPI ────────────────────────────────────────────────────────────────
.mini-kpi {
  border-radius: 12px;
  padding: 14px 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    border-radius: 2px 2px 0 0;
  }
  &:nth-child(1)::before { background: linear-gradient(90deg, #22d3ee, #0d9488); }
  &:nth-child(2)::before { background: linear-gradient(90deg, #10b981, #059669); }
}
.lt .mini-kpi {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.mini-val {
  font-size: 1.4rem;
  font-weight: 800;
  line-height: 1;
}
.mini-val--cyan { color: #22d3ee; filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.4)); }
.mini-val--green { color: #34d399; filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.4)); }
.lt .mini-val--cyan { color: #0891b2; filter: none; }
.lt .mini-val--green { color: #059669; filter: none; }
.mini-lbl {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
}

// ─── Sign Out ────────────────────────────────────────────────────────────────
.signout-btn {
  border-radius: 14px !important;
  height: 52px !important;
  font-weight: 700 !important;
  font-size: 0.95rem !important;
  transition: box-shadow 0.2s ease, transform 0.15s ease;
  background: linear-gradient(135deg, #ef4444, #dc2626) !important;
  border: none !important;
  color: #ffffff !important;
  box-shadow: 0 4px 20px rgba(239, 68, 68, 0.35) !important;
  margin: 0 16px;
  width: calc(100% - 32px) !important;

  &:hover {
    box-shadow: 0 6px 28px rgba(239, 68, 68, 0.45) !important;
  }
  &:active {
    transform: scale(0.98);
  }
}
.lt .signout-btn {
  background: linear-gradient(135deg, #ef4444, #dc2626) !important;
  border: none !important;
  color: #ffffff !important;
  box-shadow: 0 4px 16px rgba(239, 68, 68, 0.3) !important;

  &:hover {
    box-shadow: 0 6px 24px rgba(239, 68, 68, 0.4) !important;
  }
}
</style>
