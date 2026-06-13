<template>
  <q-card flat bordered class="ai-recommendation-list">
    <q-card-section class="row items-center q-pb-sm">
      <q-icon name="lightbulb" color="amber" size="sm" class="q-mr-sm" />
      <div class="text-subtitle1 text-weight-bold">AI Recommendations</div>
      <q-space />
      <q-chip dense outline size="sm" color="primary">
        {{ pending.length }} pending
      </q-chip>
    </q-card-section>
    <q-separator color="white-opacity-10" />

    <q-list v-if="recommendations.length" separator class="recommendation-list">
      <q-item v-for="rec in recommendations" :key="rec.id" class="recommendation-item">
        <q-item-section avatar>
          <q-icon
            :name="impactIcon(rec.impact_level)"
            :color="impactColor(rec.impact_level)"
            size="sm"
          />
        </q-item-section>
        <q-item-section>
          <q-item-label class="text-weight-bold text-body2">{{ rec.title }}</q-item-label>
          <q-item-label caption class="text-grey-5">{{ rec.description }}</q-item-label>
          <q-item-label caption class="q-mt-xs">
            <q-chip dense size="xs" :color="impactColor(rec.impact_level)" text-color="white">
              {{ rec.impact_level }}
            </q-chip>
            <AiConfidenceBadge :score="rec.confidence_score" size="sm" class="q-ml-xs" />
          </q-item-label>
        </q-item-section>
        <q-item-section side v-if="rec.status === 'pending'">
          <div class="row q-gutter-xs">
            <q-btn flat round size="sm" color="positive" icon="check_circle" @click="$emit('approve', rec.id)">
              <q-tooltip>Approve</q-tooltip>
            </q-btn>
            <q-btn flat round size="sm" color="negative" icon="cancel" @click="$emit('reject', rec.id)">
              <q-tooltip>Reject</q-tooltip>
            </q-btn>
          </div>
        </q-item-section>
        <q-item-section side v-else>
          <q-chip dense size="xs" :color="rec.status === 'approved' ? 'positive' : 'grey'" text-color="white">
            {{ rec.status }}
          </q-chip>
        </q-item-section>
      </q-item>
    </q-list>

    <q-card-section v-else class="text-center text-grey-6 q-pa-lg">
      <q-icon name="auto_awesome" size="48px" class="q-mb-sm" />
      <div>No recommendations at this time.</div>
    </q-card-section>
  </q-card>
</template>

<script setup>
import { computed } from 'vue'
import AiConfidenceBadge from './AiConfidenceBadge.vue'

const props = defineProps({
  recommendations: { type: Array, default: () => [] },
})

defineEmits(['approve', 'reject'])

const pending = computed(() => props.recommendations.filter((r) => r.status === 'pending'))

function impactIcon(level) {
  const map = { critical: 'priority_high', high: 'warning', medium: 'info', low: 'arrow_upward', info: 'lightbulb' }
  return map[level] || 'lightbulb'
}

function impactColor(level) {
  const map = { critical: 'red', high: 'deep-orange', medium: 'orange', low: 'blue', info: 'grey' }
  return map[level] || 'grey'
}
</script>

<style lang="scss" scoped>
.ai-recommendation-list {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
}
.recommendation-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
</style>
