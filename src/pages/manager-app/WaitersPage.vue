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
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.22), rgba(139, 92, 246, 0.12));
  color: #a78bfa;
  border: 1px solid rgba(139, 92, 246, 0.18);
  box-shadow: 0 0 14px rgba(139, 92, 246, 0.2);
}
.lt .page-header__icon-wrap--purple {
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.12);
  box-shadow: none;
  color: #6366f1;
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
  border-radius: 24px !important;
}
.search-input :deep(.q-field__control) {
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(34, 211, 238, 0.1);
  border-radius: 24px !important;
  color: #e5e7eb;
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus-within {
    border-color: rgba(34, 211, 238, 0.3) !important;
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.08);
  }
}
.lt .search-input :deep(.q-field__control) {
  background: #ffffff !important;
  border: 1px solid #e5e7eb;
  border-radius: 24px !important;
}
.search-icon { color: #22d3ee; }

// ─── Empty State ─────────────────────────────────────────────────────────────
.empty-state {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-state__icon {
  width: 72px !important;
  height: 72px !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.14), rgba(139, 92, 246, 0.07));
  border: 1px solid rgba(99, 102, 241, 0.14);
  border-radius: 50%;
  color: #818cf8;
  margin-bottom: 12px;
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.12);
}
.lt .empty-state__icon {
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.1);
  color: #6366f1;
  box-shadow: none;
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
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;

  &:hover {
    border-color: rgba(34, 211, 238, 0.18);
    box-shadow: 0 4px 14px rgba(34, 211, 238, 0.05);
  }
  &:active {
    transform: scale(0.985);
    border-color: rgba(34, 211, 238, 0.35);
  }
}
.lt .waiter-row {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

  &:hover {
    border-color: rgba(8, 145, 178, 0.22);
    box-shadow: 0 4px 10px rgba(8, 145, 178, 0.07);
  }
  &:active { border-color: rgba(8, 145, 178, 0.35); }
}
.waiter-avatar {
  background: linear-gradient(135deg, #22d3ee, #6366f1) !important;
  font-size: 15px !important;
  box-shadow:
    0 0 0 2px rgba(34, 211, 238, 0.3),
    0 0 0 4px rgba(34, 211, 238, 0.1),
    0 4px 16px rgba(34, 211, 238, 0.28) !important;
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
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.08)) !important;
  color: #fbbf24 !important;
  border: 1px solid rgba(251, 191, 36, 0.2) !important;
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.1) !important;
}
.lt .points-chip {
  background: rgba(217, 119, 6, 0.08) !important;
  color: #d97706 !important;
  border: 1px solid rgba(217, 119, 6, 0.15) !important;
  box-shadow: none !important;
}
</style>
