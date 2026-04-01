<template>
  <q-page class="mgr-alerts-page" :class="{ lt: !$q.dark.isActive }" padding>
    <!-- Page Header -->
    <div class="page-header q-mb-md">
      <div class="page-header__left">
        <div class="page-header__icon-wrap page-header__icon-wrap--red">
          <q-icon name="notifications_active" size="20px" />
        </div>
        <div>
          <div class="page-header__title">Alerts</div>
          <div class="page-header__sub">System alerts & notifications</div>
        </div>
      </div>
      <q-btn
        flat
        round
        icon="refresh"
        size="sm"
        class="page-header__refresh"
        :loading="store.loading"
        @click="store.loadAlerts()"
      />
    </div>

    <!-- Filter -->
    <q-tabs
      v-model="filter"
      dense
      active-color="cyan"
      indicator-color="cyan"
      class="alert-tabs q-mb-md"
    >
      <q-tab name="active" :label="`Active (${activeAlerts.length})`" no-caps />
      <q-tab name="resolved" :label="`Resolved (${resolvedAlerts.length})`" no-caps />
    </q-tabs>

    <!-- Alerts List -->
    <div v-if="filtered.length === 0" class="empty-state q-pa-lg">
      <q-icon name="notifications_off" size="40px" class="empty-state__icon" />
      <div class="empty-state__text">No {{ filter }} alerts</div>
    </div>
    <div v-else>
      <div
        v-for="alert in filtered"
        :key="alert.id"
        class="alert-card q-mb-sm"
        :class="`alert-card--${alert.severity}`"
      >
        <div class="row items-center q-pa-sm">
          <div class="alert-severity-icon" :class="`alert-severity-icon--${alert.severity}`">
            <q-icon
              :name="severityIcon(alert.severity)"
              size="16px"
            />
          </div>
          <div class="col q-ml-sm">
            <div class="alert-title">
              {{ alert.title }}
            </div>
            <div class="alert-meta">
              {{ alert.alert_type?.replace(/_/g, ' ') }} · {{ fmtDate(alert.created_at) }}
            </div>
          </div>
          <q-btn
            v-if="!alert.is_resolved"
            flat
            dense
            no-caps
            label="Resolve"
            color="green-5"
            size="sm"
            @click.stop="resolve(alert.id)"
          />
          <q-badge v-else color="green-9" class="text-caption">Resolved</q-badge>
        </div>
        <div v-if="alert.body" class="q-px-sm q-pb-sm alert-body">
          {{ alert.body }}
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import { useQuasar } from 'quasar'

const store = useManagerAppStore()
const $q = useQuasar()
const filter = ref('active')

const activeAlerts = computed(() => store.alerts.filter((a) => !a.is_resolved))
const resolvedAlerts = computed(() => store.alerts.filter((a) => a.is_resolved))
const filtered = computed(() =>
  filter.value === 'active' ? activeAlerts.value : resolvedAlerts.value,
)

async function resolve(id) {
  try {
    await store.resolveAlert(id)
    $q.notify({ type: 'positive', message: '✅ Alert resolved', position: 'top' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  }
}

function severityIcon(s) {
  return { info: 'info', warning: 'warning_amber', critical: 'error' }[s] || 'info'
}
function fmtDate(dt) {
  return dt
    ? new Date(dt).toLocaleDateString('en', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
}
</script>

<style lang="scss" scoped>
.mgr-alerts-page {
  min-height: 100vh;
  padding-bottom: 80px !important;
  background: #090c14;
}
.mgr-alerts-page.lt {
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
.page-header__icon-wrap--red {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}
.lt .page-header__icon-wrap--red {
  background: rgba(239, 68, 68, 0.08);
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
.page-header__refresh {
  color: #6b7280 !important;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
.alert-tabs {
  border-radius: 12px;
  overflow: hidden;
}
.alert-tabs {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.lt .alert-tabs {
  background: #ffffff;
  border: 1px solid #e5e7eb;
}
.alert-tabs :deep(.q-tab) {
  font-size: 0.72rem;
  font-weight: 600;
  min-height: 38px;
}
.alert-tabs :deep(.q-tab) { color: #6b7280; }
.lt .alert-tabs :deep(.q-tab) { color: #94a3b8; }
.alert-tabs :deep(.q-tab--active) { color: #22d3ee; }
.lt .alert-tabs :deep(.q-tab--active) { color: #0891b2; }

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
  font-size: 0.78rem;
  color: #6b7280;
}

// ─── Alert Cards ─────────────────────────────────────────────────────────────
.alert-card {
  border-radius: 12px;
  transition: transform 0.15s;
}
.alert-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.lt .alert-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.alert-card--warning {
  border-left: 3px solid #f59e0b !important;
}
.alert-card--critical {
  border-left: 3px solid #ef4444 !important;
}
.alert-card--info {
  border-left: 3px solid #3b82f6 !important;
}

.alert-severity-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.alert-severity-icon--info {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}
.alert-severity-icon--warning {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.alert-severity-icon--critical {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.alert-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #f3f4f6;
}
.lt .alert-title {
  color: #1e293b;
}
.alert-meta {
  font-size: 0.7rem;
  color: #6b7280;
  text-transform: capitalize;
}
.lt .alert-meta {
  color: #94a3b8;
}
.alert-body {
  font-size: 0.78rem;
  color: #9ca3af;
}
.lt .alert-body {
  color: #64748b;
}
</style>
