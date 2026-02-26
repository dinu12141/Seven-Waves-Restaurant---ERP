<template>
  <span class="erp-chip" :class="chipClass">
    <span class="erp-chip__dot"></span>
    {{ displayText }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: {
    type: String,
    required: true,
  },
})

// Status → variant mapping
const STATUS_MAP = {
  // Orders
  completed: 'success',
  paid: 'success',
  delivered: 'success',
  ready: 'success',
  served: 'success',
  posted: 'success',
  active: 'success',
  approved: 'success',
  received: 'success',
  // Warnings / In-progress
  pending: 'warning',
  pending_waiter: 'warning',
  processing: 'warning',
  cooking: 'warning',
  preparing: 'warning',
  accepted: 'info',
  low: 'warning',
  draft: 'neutral',
  scheduled: 'info',
  in_progress: 'warning',
  partial: 'warning',
  ordered: 'info',
  sent: 'info',
  // Errors
  cancelled: 'error',
  void: 'error',
  failed: 'error',
  critical: 'error',
  overdue: 'error',
  rejected: 'error',
  // Neutral / info
  invoiced: 'neutral',
  archived: 'neutral',
  inactive: 'neutral',
}

// Status → human-readable display text
const DISPLAY_TEXT = {
  pending_waiter: 'Pending',
  in_progress: 'In Progress',
}

const variant = computed(() => {
  return STATUS_MAP[props.status?.toLowerCase()] || 'neutral'
})

const chipClass = computed(() => `erp-chip--${variant.value}`)

const displayText = computed(() => {
  const s = props.status?.toLowerCase()
  return (
    DISPLAY_TEXT[s] ||
    props.status?.charAt(0).toUpperCase() + props.status?.slice(1).replace(/_/g, ' ')
  )
})
</script>
