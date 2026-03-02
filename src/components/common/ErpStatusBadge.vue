<template>
  <div class="erp-badge" :class="badgeClass">
    <q-icon v-if="iconName" :name="iconName" size="12px" class="q-mr-xs" />
    <span class="erp-badge-text">{{ label }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: {
    type: String,
    required: true,
  },
  labelOverride: {
    type: String,
    default: '',
  },
})

// Normalizes status to lowercase
const normStatus = computed(() => props.status?.toLowerCase().trim())

const label = computed(() => {
  if (props.labelOverride) return props.labelOverride
  // Capitalize first letter
  const s = normStatus.value
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown'
})

const badgeClass = computed(() => {
  switch (normStatus.value) {
    case 'pending':
      return 'erp-badge--pending'
    case 'preparing':
    case 'cooking':
      return 'erp-badge--preparing'
    case 'ready':
      return 'erp-badge--ready'
    case 'paid':
    case 'completed':
      return 'erp-badge--paid'
    case 'cancelled':
    case 'canceled':
      return 'erp-badge--cancelled'
    case 'open':
    case 'new':
      return 'erp-badge--open'
    default:
      return 'erp-badge--default'
  }
})

const iconName = computed(() => {
  switch (normStatus.value) {
    case 'pending':
      return 'schedule'
    case 'preparing':
    case 'cooking':
      return 'restaurant'
    case 'ready':
      return 'done'
    case 'paid':
    case 'completed':
      return 'check_circle'
    case 'cancelled':
    case 'canceled':
      return 'cancel'
    case 'open':
    case 'new':
      return 'play_circle_outline'
    default:
      return 'info'
  }
})
</script>

<style scoped lang="scss">
.erp-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: var(--erp-radius-lg); // Matches max 8px rule
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1;
  white-space: nowrap;

  // Icons follow text color
  .q-icon {
    opacity: 0.8;
  }
}

// Variants
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
