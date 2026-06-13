<template>
  <q-card flat bordered class="ai-insight-card" :class="`severity-${insight.severity}`">
    <q-card-section class="row items-start no-wrap q-pb-none">
      <div class="col">
        <div class="row items-center q-gutter-x-sm q-mb-xs">
          <AiConfidenceBadge :score="insight.confidence_score" size="sm" />
          <q-chip dense :color="severityColor" text-color="white" size="xs" class="text-uppercase">
            {{ insight.severity }}
          </q-chip>
          <q-chip dense outline size="xs" color="grey-6">{{ insight.module }}</q-chip>
        </div>
        <div class="text-subtitle2 text-weight-bold q-mt-xs">{{ insight.title }}</div>
      </div>
      <q-btn flat round size="sm" icon="expand_more" @click="expanded = !expanded" />
    </q-card-section>

    <q-card-section class="q-pt-sm">
      <div class="text-body2 text-grey-4">{{ insight.summary }}</div>
    </q-card-section>

    <q-slide-transition>
      <div v-show="expanded">
        <q-separator class="q-mx-md" color="white-opacity-10" />
        <q-card-section v-if="insight.recommendation">
          <div class="text-caption text-grey-5 q-mb-xs">💡 Recommendation</div>
          <div class="text-body2">{{ insight.recommendation }}</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <div class="row q-gutter-xs text-caption text-grey-6">
            <span>Model: {{ insight.model_name }}</span>
            <span>•</span>
            <span>{{ formatDate(insight.created_at) }}</span>
            <span v-if="insight.source_data_range">• Data: {{ insight.source_data_range }}</span>
          </div>
        </q-card-section>
      </div>
    </q-slide-transition>

    <!-- Action buttons -->
    <q-card-actions v-if="insight.status === 'new' || insight.status === 'viewed'" align="right" class="q-pt-none">
      <q-btn flat size="sm" color="positive" icon="check" label="Acknowledge" @click="$emit('acknowledge', insight.id)" />
      <q-btn flat size="sm" color="primary" icon="play_arrow" label="Action" @click="$emit('action', insight.id)" />
      <q-btn flat size="sm" color="grey-6" icon="close" label="Dismiss" @click="$emit('dismiss', insight.id)" />
    </q-card-actions>

    <q-card-section v-else class="q-pt-none">
      <q-chip dense :color="statusColor" text-color="white" size="xs">
        {{ insight.status }}
      </q-chip>
    </q-card-section>
  </q-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { date } from 'quasar'
import AiConfidenceBadge from './AiConfidenceBadge.vue'

const props = defineProps({
  insight: { type: Object, required: true },
})

defineEmits(['acknowledge', 'action', 'dismiss'])

const expanded = ref(false)

const severityColor = computed(() => {
  const map = { info: 'blue-grey', low: 'blue', medium: 'orange', high: 'deep-orange', critical: 'red' }
  return map[props.insight.severity] || 'grey'
})

const statusColor = computed(() => {
  const map = { acknowledged: 'teal', actioned: 'positive', dismissed: 'grey' }
  return map[props.insight.status] || 'grey'
})

function formatDate(val) {
  if (!val) return ''
  return date.formatDate(val, 'DD MMM YYYY HH:mm')
}
</script>

<style lang="scss" scoped>
.ai-insight-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
  transition: border-color 0.2s;

  &.severity-critical { border-left: 3px solid #f44336; }
  &.severity-high { border-left: 3px solid #ff5722; }
  &.severity-medium { border-left: 3px solid #ff9800; }
  &.severity-low { border-left: 3px solid #2196f3; }
  &.severity-info { border-left: 3px solid #607d8b; }
}
</style>
