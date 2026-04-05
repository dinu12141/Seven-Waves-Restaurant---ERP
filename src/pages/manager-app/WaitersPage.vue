<template>
  <q-page class="mgr-waiters-page" :class="{ lt: !$q.dark.isActive }" padding>
    <!-- Page Header -->
    <div class="page-header q-mb-md">
      <div class="page-header__left">
        <div class="page-header__icon-wrap page-header__icon-wrap--purple">
          <q-icon name="groups" size="20px" />
        </div>
        <div>
          <div class="page-header__title">Waiters</div>
          <div class="page-header__sub">{{ store.onShiftWaiters.length }} on shift</div>
        </div>
      </div>
      <q-btn
        flat
        round
        icon="refresh"
        size="sm"
        class="page-header__refresh"
        :loading="store.loading"
        @click="store.loadOnShiftWaiters()"
      />
    </div>

    <!-- Search -->
    <q-input
      v-model="search"
      filled
      dense
      placeholder="Search waiters..."
      class="search-input q-mb-md"
    >
      <template #prepend><q-icon name="search" class="search-icon" /></template>
      <template #append v-if="search"
        ><q-icon name="clear" class="cursor-pointer" @click="search = ''"
      /></template>
    </q-input>

    <!-- Waiter List -->
    <div v-if="store.loading" class="column items-center q-pa-lg">
      <q-spinner-orbit size="32px" color="cyan" />
    </div>
    <div v-else-if="filtered.length === 0" class="empty-state q-pa-lg">
      <q-icon name="person_search" size="40px" class="empty-state__icon" />
      <div class="empty-state__text">No waiters found</div>
    </div>
    <div v-else>
      <div
        v-for="w in filtered"
        :key="w.id"
        class="waiter-row q-mb-sm row items-center"
        @click="$router.push(`/manager-app/waiters/${w.id}`)"
      >
        <q-avatar size="40px" class="waiter-avatar q-mr-md text-weight-bold text-white">
          {{ initials(w.display_name || w.employee_name) }}
        </q-avatar>
        <div class="col">
          <div class="waiter-name">
            {{ w.display_name || w.employee_name }}
          </div>
          <div class="waiter-meta">
            {{ w.waiter_code }} · {{ w.active_orders }} active · {{ w.served_count }} served
          </div>
        </div>
        <q-chip dense icon="stars" size="sm" class="points-chip">{{
          w.current_points
        }}</q-chip>
        <q-icon name="chevron_right" class="waiter-row__arrow q-ml-sm" />
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { useQuasar } from 'quasar'

const $q = useQuasar()
import { ref, computed } from 'vue'
import { useManagerAppStore } from 'src/stores/managerAppStore'

const store = useManagerAppStore()
const search = ref('')

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return store.onShiftWaiters
  return store.onShiftWaiters.filter(
    (w) =>
      (w.display_name || '').toLowerCase().includes(q) ||
      (w.employee_name || '').toLowerCase().includes(q) ||
      (w.waiter_code || '').toLowerCase().includes(q),
  )
})

function initials(name) {
  return name
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('')
    : '?'
}
</script>

<style lang="scss" scoped>
.mgr-waiters-page {
  // min-height and padding handled by mobile-app-shell
  background: #090c14;
}
.mgr-waiters-page.lt {
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
  font-size: 0.80rem;
  color: #6b7280;
  margin-top: 1px;
}
.lt .page-header__sub {
  color: #94a3b8;
}
.page-header__refresh {
  color: #6b7280 !important;
}

// ─── Search ──────────────────────────────────────────────────────────────────
.search-input {
  border-radius: 12px !important;
}
.search-input :deep(.q-field__control) {
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #e5e7eb;
}
.lt .search-input :deep(.q-field__control) {
  background: #ffffff !important;
  border: 1px solid #e5e7eb;
}
.search-icon {
  color: #6b7280;
}

// ─── Empty State ─────────────────────────────────────────────────────────────
.empty-state {
  text-align: center;
}
.empty-state__icon {
  color: #374151;
  margin-bottom: 8px;
}
.lt .empty-state__icon {
  color: #cbd5e1;
}
.empty-state__text {
  font-size: 0.88rem;
  color: #6b7280;
}

// ─── Waiter Rows ─────────────────────────────────────────────────────────────
.waiter-row {
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.waiter-row {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.lt .waiter-row {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.waiter-row:active {
  transform: scale(0.98);
}
.waiter-row:active {
  border-color: rgba(34, 211, 238, 0.3);
}
.lt .waiter-row:active {
  border-color: rgba(8, 145, 178, 0.3);
}
.waiter-avatar {
  background: linear-gradient(135deg, #06b6d4, #8b5cf6) !important;
  font-size: 15px !important;
}
.waiter-name {
  font-size: 0.90rem;
  font-weight: 700;
  color: #f3f4f6;
}
.lt .waiter-name {
  color: #1e293b;
}
.waiter-meta {
  font-size: 0.82rem;
  color: #6b7280;
}
.lt .waiter-meta {
  color: #94a3b8;
}
.waiter-row__arrow {
  color: #4b5563;
}
.lt .waiter-row__arrow {
  color: #cbd5e1;
}
.points-chip {
  font-weight: 700 !important;
}
.points-chip {
  background: rgba(251, 191, 36, 0.12) !important;
  color: #fbbf24 !important;
}
.lt .points-chip {
  background: rgba(217, 119, 6, 0.08) !important;
  color: #d97706 !important;
}
</style>
