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

const $q = useQuasar()
import { useManagerAppStore } from 'src/stores/managerAppStore'
import { useAuthStore } from 'stores/auth'
import { supabase } from 'src/boot/supabase'

const store = useManagerAppStore()
const authStore = useAuthStore()

function initials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

async function logout() {
  try {
    store.cleanup()
    await supabase.auth.signOut()
  } finally {
    window.location.href = '/auth/login'
  }
}
</script>

<style lang="scss" scoped>
.mgr-profile-page {
  min-height: 100vh;
  padding-bottom: 80px !important;
  background: #090c14;
}
.mgr-profile-page.lt {
  background: #f1f5f9;
}

// ─── Page Header ─────────────────────────────────────────────────────────────
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  background: rgba(139, 92, 246, 0.12);
  color: #8b5cf6;
}
.lt .page-header__icon-wrap--purple {
  background: rgba(139, 92, 246, 0.08);
}
.page-header__title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #f3f4f6;
}
.lt .page-header__title {
  color: #1e293b;
}
.page-header__sub {
  font-size: 0.7rem;
  color: #6b7280;
  margin-top: 1px;
}
.lt .page-header__sub {
  color: #94a3b8;
}

// ─── Section Title ───────────────────────────────────────────────────────────
.section-title {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #4b5563;
}
.lt .section-title {
  color: #94a3b8;
}

// ─── Profile Card ────────────────────────────────────────────────────────────
.profile-card {
  border-radius: 16px;
  overflow: hidden;
  position: relative;
}
.profile-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.lt .profile-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.profile-card__bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(139, 92, 246, 0.1));
  pointer-events: none;
}
.profile-card__content {
  position: relative;
}

.profile-avatar {
  background: linear-gradient(135deg, #06b6d4, #8b5cf6) !important;
  font-size: 18px !important;
  box-shadow: 0 4px 14px rgba(6, 182, 212, 0.25);
}
.profile-name {
  font-size: 1.1rem;
  font-weight: 800;
  color: #f3f4f6;
}
.lt .profile-name {
  color: #1e293b;
}
.profile-role {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #22d3ee;
  margin-top: 2px;
}
.lt .profile-role {
  color: #0891b2;
}
.profile-email {
  font-size: 0.72rem;
  color: #6b7280;
  margin-top: 2px;
}
.lt .profile-email {
  color: #94a3b8;
}

// ─── Info Cards ──────────────────────────────────────────────────────────────
.info-card {
  border-radius: 12px;
}
.info-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.lt .info-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
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
  background: rgba(99, 102, 241, 0.12);
  color: #6366f1;
}
.info-text {
  color: #d1d5db;
  font-size: 0.85rem;
  font-weight: 500;
}
.lt .info-text {
  color: #374151;
}

// ─── Role Chips ──────────────────────────────────────────────────────────────
.role-chip {
  font-size: 0.72rem !important;
  font-weight: 600 !important;
  text-transform: capitalize !important;
}
.role-chip {
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
  padding: 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.mini-kpi {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.lt .mini-kpi {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.mini-val {
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1;
}
.mini-val--cyan { color: #0ea5e9; }
.mini-val--green { color: #10b981; }
.mini-lbl {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
}

// ─── Sign Out ────────────────────────────────────────────────────────────────
.signout-btn {
  border-radius: 12px !important;
  height: 48px !important;
  font-weight: 700 !important;
  font-size: 0.85rem !important;
  transition: all 0.2s ease;
}
.signout-btn {
  background: rgba(239, 68, 68, 0.1) !important;
  border: 1px solid rgba(239, 68, 68, 0.2) !important;
  color: #f87171 !important;
}
.signout-btn:hover {
  background: rgba(239, 68, 68, 0.15) !important;
}
.lt .signout-btn {
  background: rgba(239, 68, 68, 0.06) !important;
  border: 1px solid rgba(239, 68, 68, 0.15) !important;
  color: #dc2626 !important;
}
.lt .signout-btn:hover {
  background: rgba(239, 68, 68, 0.1) !important;
}
</style>
