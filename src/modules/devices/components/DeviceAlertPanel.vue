<template>
  <q-card flat bordered class="alert-panel" :class="{ 'has-critical': criticalCount > 0 }">
    <q-card-section class="row items-center q-pb-none">
      <q-icon :name="criticalCount > 0 ? 'error' : 'notifications'" :color="criticalCount > 0 ? 'negative' : 'primary'" size="24px" />
      <span class="text-subtitle1 text-weight-bold q-ml-sm">Device Alerts</span>
      <q-badge v-if="unresolvedCount > 0" color="negative" class="q-ml-sm">{{ unresolvedCount }}</q-badge>
      <q-space />
      <q-btn-toggle v-model="showResolved" flat no-caps dense :options="[
        { label: 'Active', value: false },
        { label: 'All', value: true },
      ]" />
    </q-card-section>

    <q-card-section v-if="filteredAlerts.length === 0" class="text-center text-grey q-py-lg">
      <q-icon name="check_circle" size="48px" color="positive" />
      <div class="text-subtitle2 q-mt-sm">No active alerts</div>
    </q-card-section>

    <q-list v-else separator class="q-px-sm" style="max-height: 400px; overflow-y: auto">
      <q-item v-for="alert in filteredAlerts" :key="alert.id" :class="alertClass(alert)">
        <q-item-section avatar>
          <q-icon :name="severityIcon(alert.severity)" :color="severityColor(alert.severity)" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="text-weight-medium">{{ alert.message }}</q-item-label>
          <q-item-label caption>
            {{ alert.alert_type.replace(/_/g, ' ') }} •
            {{ alert.devices?.device_name || 'Unknown device' }} •
            {{ formatDate(alert.created_at) }}
          </q-item-label>
        </q-item-section>
        <q-item-section side v-if="!alert.resolved">
          <q-btn flat dense size="sm" icon="check" color="positive" label="Resolve"
                 @click="$emit('resolve', alert)" />
        </q-item-section>
        <q-item-section side v-else>
          <q-badge color="positive" label="Resolved" />
        </q-item-section>
      </q-item>
    </q-list>
  </q-card>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  alerts: { type: Array, default: () => [] },
})

defineEmits(['resolve'])

const showResolved = ref(false)

const filteredAlerts = computed(() =>
  showResolved.value ? props.alerts : props.alerts.filter(a => !a.resolved)
)

const unresolvedCount = computed(() => props.alerts.filter(a => !a.resolved).length)
const criticalCount = computed(() => props.alerts.filter(a => a.severity === 'critical' && !a.resolved).length)

function severityIcon(s) {
  return { info: 'info', warning: 'warning', critical: 'error' }[s] || 'info'
}
function severityColor(s) {
  return { info: 'blue', warning: 'orange', critical: 'negative' }[s] || 'grey'
}
function alertClass(alert) {
  if (alert.resolved) return 'bg-grey-1'
  if (alert.severity === 'critical') return 'bg-red-1'
  if (alert.severity === 'warning') return 'bg-orange-1'
  return ''
}
function formatDate(d) {
  return d ? new Date(d).toLocaleString() : ''
}
</script>

<style scoped>
.alert-panel { border-radius: 12px; }
.has-critical { border-color: var(--q-negative) !important; }
</style>
