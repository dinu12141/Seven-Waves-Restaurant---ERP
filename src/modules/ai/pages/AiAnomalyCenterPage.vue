<template>
  <q-page class="q-pa-md ai-anomaly-page">
    <PageHeader
      title="AI Anomaly Detection Center"
      subtitle="Fraud detection, suspicious patterns, and security anomaly monitoring"
      show-back
      back-route="/ai"
    >
      <template #actions>
        <PermissionGate permission="ai.security">
          <q-btn
            color="orange"
            icon="security"
            label="Run Anomaly Scan"
            unelevated
            :loading="aiStore.loading.anomalies"
            @click="runScan"
          />
        </PermissionGate>
      </template>
    </PageHeader>

    <!-- Safety notice -->
    <q-banner dense class="ai-disclaimer q-mb-md" rounded>
      <template #avatar><q-icon name="shield" color="orange" /></template>
      Anomalies are flagged for <strong>human review only</strong>. AI does not accuse — it identifies patterns that require investigation.
    </q-banner>

    <!-- Filters -->
    <div class="row q-col-gutter-sm q-mb-md items-center">
      <div class="col-auto">
        <q-select
          v-model="severityFilter"
          :options="severityOptions"
          dense
          outlined
          emit-value
          map-options
          label="Severity"
          style="min-width: 140px"
          @update:model-value="loadData"
        />
      </div>
      <div class="col-auto">
        <q-select
          v-model="statusFilter"
          :options="statusOptions"
          dense
          outlined
          emit-value
          map-options
          label="Status"
          style="min-width: 140px"
          @update:model-value="loadData"
        />
      </div>
      <q-space />
      <div class="col-auto text-caption text-grey-6">
        {{ aiStore.anomalies.length }} anomalies found
      </div>
    </div>

    <!-- Anomaly Table -->
    <AiAnomalyTable
      :anomalies="filteredAnomalies"
      :loading="aiStore.loading.anomalies"
      @refresh="loadData"
      @review="handleReview"
    />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useAiStore } from '../stores/ai.store'
import { useAuthStore } from 'src/stores/auth'
import PageHeader from 'components/common/PageHeader.vue'
import PermissionGate from 'components/common/PermissionGate.vue'
import AiAnomalyTable from '../components/AiAnomalyTable.vue'

const $q = useQuasar()
const aiStore = useAiStore()
const authStore = useAuthStore()

const branchId = computed(() => authStore.currentBranch?.id)
const userId = computed(() => authStore.user?.id)

const severityFilter = ref(null)
const statusFilter = ref(null)

const severityOptions = [
  { label: 'All Severities', value: null },
  { label: 'Critical', value: 'critical' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

const statusOptions = [
  { label: 'All Statuses', value: null },
  { label: 'Open', value: 'open' },
  { label: 'Investigating', value: 'investigating' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'False Positive', value: 'false_positive' },
  { label: 'Resolved', value: 'resolved' },
]

const filteredAnomalies = computed(() => {
  let data = aiStore.anomalies
  if (severityFilter.value) data = data.filter((a) => a.severity === severityFilter.value)
  if (statusFilter.value) data = data.filter((a) => a.status === statusFilter.value)
  return data
})

onMounted(loadData)

async function loadData() {
  await aiStore.loadAnomalies(branchId.value, {
    severity: severityFilter.value,
    status: statusFilter.value,
  })
}

async function runScan() {
  const result = await aiStore.runAnomalyDetection(branchId.value)
  if (result.success) {
    $q.notify({ type: 'positive', message: 'Anomaly scan completed.' })
  } else {
    $q.notify({ type: 'negative', message: result.error || 'Scan failed.' })
  }
}

async function handleReview(anomalyId, status) {
  await aiStore.handleAnomalyReview(anomalyId, status, userId.value)
  $q.notify({ type: 'info', message: `Anomaly marked as: ${status.replace('_', ' ')}` })
}
</script>

<style lang="scss" scoped>
.ai-anomaly-page { max-width: 1400px; margin: 0 auto; }
.ai-disclaimer {
  background: rgba(255, 165, 0, 0.06);
  border: 1px solid rgba(255, 165, 0, 0.15);
  color: #d1d5db;
  font-size: 13px;
}
</style>
