<template>
  <q-card flat bordered class="ai-anomaly-table">
    <q-card-section class="row items-center q-pb-sm">
      <q-icon name="warning_amber" color="orange" size="sm" class="q-mr-sm" />
      <div class="text-subtitle1 text-weight-bold">Anomaly Detection</div>
      <q-space />
      <q-btn flat dense size="sm" icon="refresh" @click="$emit('refresh')" :loading="loading" />
    </q-card-section>

    <q-table
      :rows="anomalies"
      :columns="columns"
      row-key="id"
      flat
      :loading="loading"
      :pagination="{ rowsPerPage: 10 }"
      class="anomaly-data-table"
    >
      <template #body-cell-severity="props">
        <q-td :props="props">
          <q-chip dense :color="severityColor(props.row.severity)" text-color="white" size="xs">
            {{ props.row.severity }}
          </q-chip>
        </q-td>
      </template>

      <template #body-cell-score="props">
        <q-td :props="props">
          <AiConfidenceBadge :score="props.row.score" size="sm" />
        </q-td>
      </template>

      <template #body-cell-status="props">
        <q-td :props="props">
          <q-chip dense :color="statusColor(props.row.status)" text-color="white" size="xs">
            {{ props.row.status.replace('_', ' ') }}
          </q-chip>
        </q-td>
      </template>

      <template #body-cell-sla="props">
        <q-td :props="props">
          <template v-if="props.row.status === 'open' || props.row.status === 'investigating'">
            <q-badge
              :color="anomalyStatus(props.row.created_at).color"
              :label="anomalyStatus(props.row.created_at).label"
              class="sla-badge"
            />
            <q-badge
              v-if="hoursOpen(props.row.created_at) >= 24"
              color="negative"
              label="ESCALATED"
              class="q-ml-xs sla-badge"
            />
          </template>
          <span v-else class="text-grey-6 text-caption">—</span>
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn-dropdown v-if="props.row.status === 'open'" flat dense size="sm" color="primary" icon="more_vert">
            <q-list dense>
              <q-item clickable v-close-popup @click="$emit('review', props.row.id, 'investigating')">
                <q-item-section>Mark Investigating</q-item-section>
              </q-item>
              <q-item clickable v-close-popup @click="$emit('review', props.row.id, 'confirmed')">
                <q-item-section>Confirm Anomaly</q-item-section>
              </q-item>
              <q-item clickable v-close-popup @click="$emit('review', props.row.id, 'false_positive')">
                <q-item-section>False Positive</q-item-section>
              </q-item>
              <q-item clickable v-close-popup @click="$emit('review', props.row.id, 'resolved')">
                <q-item-section>Mark Resolved</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
        </q-td>
      </template>

      <template #no-data>
        <div class="column items-center q-pa-lg text-grey-6">
          <q-icon name="shield" size="48px" class="q-mb-sm" />
          <div>No anomalies detected. System looks healthy.</div>
        </div>
      </template>
    </q-table>
  </q-card>
</template>

<script setup>
import AiConfidenceBadge from './AiConfidenceBadge.vue'

defineProps({
  anomalies: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

defineEmits(['refresh', 'review'])

const columns = [
  { name: 'anomaly_type', label: 'Type', field: 'anomaly_type', align: 'left', sortable: true },
  { name: 'severity', label: 'Severity', field: 'severity', align: 'center', sortable: true },
  { name: 'score', label: 'Score', field: 'score', align: 'center', sortable: true },
  { name: 'explanation', label: 'Explanation', field: 'explanation', align: 'left', style: 'max-width: 300px; white-space: normal' },
  { name: 'suggested_review_action', label: 'Suggested Action', field: 'suggested_review_action', align: 'left' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'sla', label: 'SLA', field: 'created_at', align: 'center', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'center' },
]

function severityColor(severity) {
  const map = { critical: 'red', high: 'deep-orange', medium: 'orange', low: 'blue', info: 'grey' }
  return map[severity] || 'grey'
}

function statusColor(status) {
  const map = { open: 'orange', investigating: 'blue', confirmed: 'red', false_positive: 'grey', resolved: 'positive' }
  return map[status] || 'grey'
}

/**
 * Returns hours since the anomaly was created (floor).
 */
function hoursOpen(createdAt) {
  return Math.floor((Date.now() - new Date(createdAt)) / 3_600_000)
}

/**
 * Returns SLA status: color + label.
 * <2h = green, 2-8h = yellow, 8-24h = red, >=24h = escalated (still red)
 */
function anomalyStatus(createdAt) {
  const h = hoursOpen(createdAt)
  if (h < 2) return { color: 'positive', label: `${h}h open` }
  if (h < 8) return { color: 'warning', label: `${h}h open` }
  return { color: 'negative', label: `${h}h open` }
}
</script>

<style lang="scss" scoped>
.ai-anomaly-table {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
}
.anomaly-data-table {
  background: transparent !important;
  :deep(thead tr th) {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
    background: rgba(255, 255, 255, 0.03);
  }
  :deep(tbody tr td) {
    color: #d1d5db;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
}
.sla-badge {
  font-size: 10px;
  font-weight: 600;
  border-radius: 4px;
}
</style>
