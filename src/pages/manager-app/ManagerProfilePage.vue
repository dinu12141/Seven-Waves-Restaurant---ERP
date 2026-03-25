<template>
  <q-page class="mgr-profile-page" padding>
    <div class="row items-center q-mb-lg">
      <q-icon name="person" size="24px" color="cyan-4" class="q-mr-sm" />
      <div class="text-h6 text-white text-weight-bold">Manager Profile</div>
    </div>

    <!-- Profile Card -->
    <div class="profile-card q-mb-lg">
      <div class="row items-center q-pa-md">
        <q-avatar size="56px" class="profile-avatar text-weight-bold text-white">
          {{ initials(authStore.userDisplayName) }}
        </q-avatar>
        <div class="q-ml-md col">
          <div class="text-h6 text-white text-weight-bold">{{ authStore.userDisplayName }}</div>
          <div class="text-caption text-cyan-3">Manager</div>
          <div class="text-caption text-grey-5">{{ authStore.user?.email }}</div>
        </div>
      </div>
    </div>

    <!-- Branch Info -->
    <div class="section-title q-mb-sm">BRANCH</div>
    <div class="info-card q-mb-lg">
      <div class="info-row">
        <q-icon name="store" size="16px" color="cyan-4" class="q-mr-sm" />
        <span class="text-grey-4">{{ authStore.currentBranch?.name || 'No branch assigned' }}</span>
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
          color="blue-grey-9"
          text-color="cyan-3"
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
          <span class="mini-val text-cyan">{{ store.onShiftWaiters.length }}</span
          ><span class="mini-lbl">Waiters</span>
        </div>
      </div>
      <div class="col-6">
        <div class="mini-kpi">
          <span class="mini-val text-green">{{ store.servedTodayCount }}</span
          ><span class="mini-lbl">Served Today</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <q-btn
      class="full-width"
      unelevated
      no-caps
      icon="logout"
      label="Sign Out"
      color="red-9"
      text-color="white"
      style="border-radius: 10px; height: 48px; font-weight: 600"
      @click="logout"
    />
  </q-page>
</template>

<script setup>
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
    window.location.href = '/#/auth/login'
  }
}
</script>

<style lang="scss" scoped>
.mgr-profile-page {
  background: #090c14;
  min-height: 100vh;
}
.section-title {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #4b5563;
}
.profile-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
}
.profile-avatar {
  background: linear-gradient(135deg, #06b6d4, #8b5cf6) !important;
  font-size: 18px !important;
}
.info-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
}
.info-row {
  display: flex;
  align-items: center;
  padding: 12px 14px;
}
.mini-kpi {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 10px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mini-val {
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1;
}
.mini-lbl {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
}
</style>
