<template>
  <q-page class="mgr-alerts-page" padding>
    <div class="row items-center q-mb-md">
      <q-icon name="notifications_active" size="24px" color="cyan-4" class="q-mr-sm" />
      <div class="text-h6 text-white text-weight-bold">Alerts</div>
      <q-space />
      <q-btn flat round icon="refresh" color="grey-5" :loading="store.loading" @click="store.loadAlerts()" />
    </div>

    <!-- Filter -->
    <q-tabs v-model="filter" dense active-color="cyan" indicator-color="cyan" class="alert-tabs q-mb-md">
      <q-tab name="active" :label="`Active (${activeAlerts.length})`" no-caps />
      <q-tab name="resolved" :label="`Resolved (${resolvedAlerts.length})`" no-caps />
    </q-tabs>

    <!-- Alerts List -->
    <div v-if="filtered.length === 0" class="text-grey-6 text-caption text-center q-pa-lg">
      No {{ filter }} alerts.
    </div>
    <div v-else>
      <div v-for="alert in filtered" :key="alert.id" class="alert-card q-mb-sm" :class="`alert-card--${alert.severity}`">
        <div class="row items-center q-pa-sm">
          <q-icon :name="severityIcon(alert.severity)" :color="severityColor(alert.severity)" size="18px" class="q-mr-sm" />
          <div class="col">
            <div class="text-white text-weight-bold" style="font-size:0.85rem">{{ alert.title }}</div>
            <div class="text-caption text-grey-5">{{ alert.alert_type?.replace(/_/g, ' ') }} · {{ fmtDate(alert.created_at) }}</div>
          </div>
          <q-btn
            v-if="!alert.is_resolved"
            flat dense no-caps
            label="Resolve"
            color="green-5"
            size="sm"
            @click.stop="resolve(alert.id)"
          />
          <q-badge v-else color="green-9" class="text-caption">Resolved</q-badge>
        </div>
        <div v-if="alert.body" class="q-px-sm q-pb-sm text-caption text-grey-4">{{ alert.body }}</div>
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

const activeAlerts = computed(() => store.alerts.filter(a => !a.is_resolved))
const resolvedAlerts = computed(() => store.alerts.filter(a => a.is_resolved))
const filtered = computed(() => filter.value === 'active' ? activeAlerts.value : resolvedAlerts.value)

async function resolve(id) {
  try {
    await store.resolveAlert(id)
    $q.notify({ type: 'positive', message: '✅ Alert resolved', position: 'top' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  }
}

function severityIcon(s) { return { info: 'info', warning: 'warning', critical: 'error' }[s] || 'info' }
function severityColor(s) { return { info: 'blue-5', warning: 'amber-5', critical: 'red-5' }[s] || 'grey-5' }
function fmtDate(dt) { return dt ? new Date(dt).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }
</script>

<style lang="scss" scoped>
.mgr-alerts-page { background: #090c14; min-height: 100vh; }
.alert-tabs {
  background: rgba(255,255,255,0.04); border-radius: 10px;
  :deep(.q-tab) { font-size: 0.75rem; font-weight: 600; color: #6b7280; min-height: 36px; }
  :deep(.q-tab--active) { color: #22d3ee; }
}
.alert-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  &--warning { border-left: 3px solid #f59e0b; }
  &--critical { border-left: 3px solid #ef4444; }
  &--info { border-left: 3px solid #3b82f6; }
}
</style>
