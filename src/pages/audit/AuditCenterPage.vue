<template>
  <q-page class="audit-page q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div>
        <div class="text-h5 text-weight-bold text-grey-2">Audit & Security Center</div>
        <div class="text-caption text-grey-6">System audit trail · Security events · Login history</div>
      </div>
      <q-space />
      <RealtimeStatusBadge show-label class="q-mr-md" />
      <PermissionGate permission="audit.export">
        <q-btn outline no-caps color="primary" icon="download" label="Export" :loading="exporting" @click="exportLogs" />
      </PermissionGate>
    </div>

    <!-- Tabs -->
    <q-tabs v-model="activeTab" dense no-caps active-color="primary" indicator-color="primary" class="text-grey-5 q-mb-md">
      <q-tab name="logs" icon="receipt_long" label="Audit Logs" />
      <q-tab name="security" icon="shield" label="Security Events" />
      <q-tab name="logins" icon="login" label="Login History" />
      <q-tab name="sessions" icon="devices" label="Device Sessions" />
    </q-tabs>

    <!-- Filters -->
    <div class="row q-gutter-sm q-mb-md items-center">
      <DateRangePicker v-model="dateRange" @change="applyFilters" />
      <q-select v-model="filterSeverity" :options="severityOptions" outlined dense clearable label="Severity" emit-value map-options style="min-width:130px" @update:model-value="applyFilters" />
      <q-select v-model="filterAction" :options="actionOptions" outlined dense clearable label="Action" emit-value map-options style="min-width:150px" @update:model-value="applyFilters" />
      <q-input v-model="searchText" outlined dense clearable placeholder="Search..." debounce="400" @update:model-value="applyFilters">
        <template #prepend><q-icon name="search" size="18px" /></template>
      </q-input>
    </div>

    <!-- Audit Logs Tab -->
    <div v-if="activeTab === 'logs'">
      <q-card flat bordered class="erp-card">
        <q-table
          :rows="auditStore.entries"
          :columns="logColumns"
          row-key="id"
          :loading="auditStore.loading"
          flat
          dense
          :pagination="{ rowsPerPage: 50 }"
          class="audit-table"
        >
          <template #body-cell-severity="p">
            <q-td :props="p">
              <q-badge :color="severityColor(p.value)" :label="p.value" />
            </q-td>
          </template>
          <template #body-cell-created_at="p">
            <q-td :props="p">{{ formatDate(p.value) }}</q-td>
          </template>
          <template #body-cell-user_name="p">
            <q-td :props="p">
              <div>{{ p.value || 'System' }}</div>
              <div class="text-caption text-grey-6">{{ p.row.user_email || '' }}</div>
            </q-td>
          </template>
          <template #body-cell-details="p">
            <q-td :props="p">
              <q-btn flat dense size="sm" icon="visibility" @click="showDetail(p.row)" aria-label="View details" />
            </q-td>
          </template>
          <template #no-data>
            <EmptyState icon="fact_check" title="No audit logs" message="No audit events match your filters." />
          </template>
        </q-table>
        <div v-if="auditStore.hasMore" class="text-center q-pa-sm">
          <q-btn flat no-caps label="Load More" @click="auditStore.nextPage()" :loading="auditStore.loading" />
        </div>
      </q-card>
    </div>

    <!-- Security Events Tab -->
    <div v-if="activeTab === 'security'">
      <div class="row q-gutter-md q-mb-md">
        <StatCard title="Critical Events" :value="auditStore.criticalCount" icon="error" trend-color="negative" />
        <StatCard title="Warnings" :value="auditStore.warningCount" icon="warning" trend-color="neutral" />
        <StatCard title="Total Events" :value="auditStore.entries.length" icon="shield" />
      </div>
      <q-card flat bordered class="erp-card">
        <q-list separator>
          <q-item v-for="evt in securityEvents" :key="evt.id" class="q-py-sm">
            <q-item-section avatar>
              <q-icon :name="securityIcon(evt.action)" :color="severityColor(evt.severity)" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ evt.action.replace(/_/g, ' ') }}</q-item-label>
              <q-item-label caption>{{ evt.user_name || 'System' }} · {{ formatDate(evt.created_at) }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-badge :color="severityColor(evt.severity)" :label="evt.severity" />
            </q-item-section>
          </q-item>
          <q-item v-if="securityEvents.length === 0">
            <q-item-section class="text-center text-grey-6 q-pa-lg">No security events found</q-item-section>
          </q-item>
        </q-list>
      </q-card>
    </div>

    <!-- Login History Tab -->
    <div v-if="activeTab === 'logins'">
      <q-card flat bordered class="erp-card">
        <q-table :rows="loginEvents" :columns="loginColumns" row-key="id" flat dense :loading="auditStore.loading" :pagination="{ rowsPerPage: 30 }">
          <template #body-cell-action="p">
            <q-td :props="p">
              <q-badge :color="p.value === 'login_success' ? 'positive' : 'negative'" :label="p.value === 'login_success' ? 'Success' : 'Failed'" />
            </q-td>
          </template>
          <template #no-data>
            <EmptyState icon="login" title="No login events" message="Login history will appear here." />
          </template>
        </q-table>
      </q-card>
    </div>

    <!-- Sessions Tab -->
    <div v-if="activeTab === 'sessions'">
      <q-card flat bordered class="erp-card q-pa-lg">
        <EmptyState icon="devices" title="Device Sessions" message="Active device session tracking coming soon." />
      </q-card>
    </div>

    <!-- Detail Dialog -->
    <q-dialog v-model="showDetailDialog">
      <q-card style="min-width:500px; max-width:700px">
        <q-card-section class="row items-center">
          <div class="text-h6">Audit Detail</div>
          <q-space />
          <q-btn flat round dense icon="close" @click="showDetailDialog = false" />
        </q-card-section>
        <q-separator />
        <q-card-section v-if="selectedEntry">
          <div class="row q-gutter-md q-mb-md">
            <div><strong>Action:</strong> {{ selectedEntry.action }}</div>
            <div><strong>Table:</strong> {{ selectedEntry.table_name }}</div>
            <div><strong>Severity:</strong> <q-badge :color="severityColor(selectedEntry.severity)" :label="selectedEntry.severity" /></div>
          </div>
          <div class="q-mb-sm"><strong>User:</strong> {{ selectedEntry.user_name || 'System' }} ({{ selectedEntry.user_email || 'N/A' }})</div>
          <div class="q-mb-sm"><strong>Time:</strong> {{ formatDate(selectedEntry.created_at) }}</div>
          <div v-if="selectedEntry.old_data" class="q-mb-sm">
            <strong>Previous Data:</strong>
            <pre class="audit-json">{{ JSON.stringify(selectedEntry.old_data, null, 2) }}</pre>
          </div>
          <div v-if="selectedEntry.new_data">
            <strong>New Data:</strong>
            <pre class="audit-json">{{ JSON.stringify(selectedEntry.new_data, null, 2) }}</pre>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuditStore } from '../../stores/auditStore'
import PermissionGate from '../../components/common/PermissionGate.vue'
import RealtimeStatusBadge from '../../components/common/RealtimeStatusBadge.vue'
import DateRangePicker from '../../components/common/DateRangePicker.vue'
import EmptyState from '../../components/common/EmptyState.vue'
import StatCard from '../../components/common/StatCard.vue'

const auditStore = useAuditStore()
const activeTab = ref('logs')
const exporting = ref(false)
const showDetailDialog = ref(false)
const selectedEntry = ref(null)
const searchText = ref('')
const filterSeverity = ref('')
const filterAction = ref('')
const dateRange = ref({ from: '', to: '' })

const severityOptions = [
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' },
]
const actionOptions = [
  { label: 'INSERT', value: 'INSERT' },
  { label: 'UPDATE', value: 'UPDATE' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'Login Success', value: 'login_success' },
  { label: 'Login Failed', value: 'login_failed' },
]

const logColumns = [
  { name: 'created_at', label: 'Time', field: 'created_at', align: 'left', sortable: true },
  { name: 'user_name', label: 'User', field: 'user_name', align: 'left' },
  { name: 'action', label: 'Action', field: 'action', align: 'left' },
  { name: 'table_name', label: 'Module', field: 'table_name', align: 'left' },
  { name: 'severity', label: 'Severity', field: 'severity', align: 'center' },
  { name: 'details', label: '', field: 'id', align: 'center' },
]
const loginColumns = [
  { name: 'created_at', label: 'Time', field: 'created_at', align: 'left', sortable: true, format: (v) => formatDate(v) },
  { name: 'user_name', label: 'User', field: 'user_name', align: 'left' },
  { name: 'action', label: 'Status', field: 'action', align: 'center' },
]

const securityEvents = computed(() => auditStore.entries.filter(e => ['critical', 'warning'].includes(e.severity)))
const loginEvents = computed(() => auditStore.entries.filter(e => e.action?.includes('login')))

function severityColor(s) {
  switch (s) { case 'critical': return 'negative'; case 'warning': return 'warning'; default: return 'grey-7' }
}
function securityIcon(action) {
  if (action.includes('login_failed')) return 'block'
  if (action.includes('DELETE')) return 'delete_forever'
  if (action.includes('role')) return 'admin_panel_settings'
  return 'security'
}
function formatDate(d) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function showDetail(entry) { selectedEntry.value = entry; showDetailDialog.value = true }
function applyFilters() {
  auditStore.setFilter({
    severity: filterSeverity.value || undefined,
    action: filterAction.value || undefined,
    dateFrom: dateRange.value.from || undefined,
    dateTo: dateRange.value.to || undefined,
    search: searchText.value || undefined,
  })
}
async function exportLogs() {
  exporting.value = true
  try {
    const csv = ['Time,User,Action,Module,Severity', ...auditStore.entries.map(e =>
      `"${e.created_at}","${e.user_name || ''}","${e.action}","${e.table_name}","${e.severity}"`
    )].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`; a.click()
    URL.revokeObjectURL(url)
  } finally { exporting.value = false }
}

onMounted(() => auditStore.fetchLogs())
</script>

<style scoped lang="scss">
.audit-page { max-width: 1400px; margin: 0 auto; }
.erp-card { background: var(--erp-bg-card, #1a1d23); border-color: var(--erp-border, rgba(255,255,255,0.06)); border-radius: 8px; }
.audit-table { background: transparent; }
.audit-json { background: rgba(0,0,0,0.3); border-radius: 6px; padding: 8px 12px; font-size: 11px; max-height: 200px; overflow: auto; color: #94a3b8; }
</style>
