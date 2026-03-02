<template>
  <div class="erp-badge" :class="badgeClass">
    <q-icon v-if="iconName" :name="iconName" size="12px" class="q-mr-xs" />
    <span class="erp-badge-text">{{ displayText }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: {
    type: String,
    required: true,
  },
})

// Normalize status
const normStatus = computed(() => props.status?.toLowerCase().trim().replace(/_/g, ' '))

const displayText = computed(() => {
  if (!normStatus.value) return 'Unknown'
  const mapping = {
    pending_waiter: 'Pending',
    in_progress: 'In Progress',
  }
  const s = props.status?.toLowerCase()
  return mapping[s] || normStatus.value.charAt(0).toUpperCase() + normStatus.value.slice(1)
})

// Map statuses to ERP Enterprise Badge Variants
const badgeClass = computed(() => {
  const s = normStatus.value
  // Pending: Yellow soft bg
  if (['pending', 'processing', 'low', 'scheduled', 'partial'].includes(s))
    return 'erp-badge--pending'
  // Preparing: Blue
  if (['preparing', 'cooking', 'in progress', 'accepted', 'ordered', 'sent'].includes(s))
    return 'erp-badge--preparing'
  // Ready: Green
  if (['ready', 'served', 'active', 'approved', 'received'].includes(s)) return 'erp-badge--ready'
  // Paid: Green solid
  if (['paid', 'completed', 'delivered'].includes(s)) return 'erp-badge--paid'
  // Cancelled: Red
  if (['cancelled', 'canceled', 'void', 'failed', 'critical', 'overdue', 'rejected'].includes(s))
    return 'erp-badge--cancelled'
  // Open: Blue outline
  if (['open', 'new'].includes(s)) return 'erp-badge--open'

  return 'erp-badge--default'
})

const iconName = computed(() => {
  const s = normStatus.value
  if (['pending', 'processing', 'scheduled'].includes(s)) return 'schedule'
  if (['preparing', 'cooking', 'in progress'].includes(s)) return 'restaurant'
  if (['ready', 'active', 'approved'].includes(s)) return 'done'
  if (['paid', 'completed', 'delivered'].includes(s)) return 'check_circle'
  if (['cancelled', 'canceled', 'void', 'failed', 'rejected'].includes(s)) return 'cancel'
  if (['open', 'new'].includes(s)) return 'play_circle_outline'
  return 'info'
})
</script>

<style scoped lang="scss">
.erp-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: var(--erp-radius-lg); // Max 8px rule
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1;
  white-space: nowrap;

  .q-icon {
    opacity: 0.8;
  }
}

// Enterprise Standard Variants
.erp-badge--pending {
  background-color: rgba(245, 158, 11, 0.15); // Yellow soft
  color: var(--erp-warning);
}

.erp-badge--preparing {
  background-color: var(--erp-primary-subtle); // Blue soft
  color: var(--erp-primary);
}

.erp-badge--ready {
  background-color: rgba(22, 163, 74, 0.15); // Green soft
  color: var(--erp-success);
}

.erp-badge--paid {
  background-color: var(--erp-success); // Green solid
  color: #ffffff;
}

.erp-badge--cancelled {
  background-color: rgba(220, 38, 38, 0.15); // Red soft
  color: var(--erp-danger);
}

.erp-badge--open {
  background-color: transparent;
  border: 1px solid var(--erp-primary); // Blue outline
  color: var(--erp-primary);
}

.erp-badge--default {
  background-color: rgba(148, 163, 184, 0.15); // Default gray
  color: var(--erp-text-secondary);
}
</style>
