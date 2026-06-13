<template>
  <q-badge :color="badgeColor" :label="label" :class="['ai-confidence-badge', `size-${size}`]">
    <q-tooltip>Confidence: {{ (score * 100).toFixed(0) }}%</q-tooltip>
  </q-badge>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  score: { type: Number, required: true, validator: (v) => v >= 0 && v <= 1 },
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
})

const label = computed(() => `${(props.score * 100).toFixed(0)}%`)

const badgeColor = computed(() => {
  if (props.score >= 0.85) return 'positive'
  if (props.score >= 0.65) return 'amber-8'
  if (props.score >= 0.4) return 'orange'
  return 'negative'
})
</script>

<style scoped>
.ai-confidence-badge {
  font-weight: 700;
  letter-spacing: 0.5px;
}
.ai-confidence-badge.size-sm { font-size: 10px; padding: 2px 6px; }
.ai-confidence-badge.size-md { font-size: 12px; padding: 3px 8px; }
.ai-confidence-badge.size-lg { font-size: 14px; padding: 4px 10px; }
</style>
