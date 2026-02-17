<template>
  <q-card class="order-card q-mb-md cursor-pointer" :class="statusClass">
    <q-card-section class="q-pb-none">
      <div class="row items-center justify-between no-wrap">
        <div class="row items-center">
          <q-badge :color="tableColor" class="q-mr-sm text-bold" style="font-size: 1.1em">
            {{ order.table !== '-' ? order.table : 'Takeaway' }}
          </q-badge>
          <div class="text-subtitle2 text-weight-bold">{{ order.id }}</div>
          <q-badge
            color="red"
            rounded
            class="q-ml-sm text-caption text-bold"
            v-if="order.status !== 'completed'"
          >
            LIVE
            <q-icon name="fiber_manual_record" size="8px" class="q-ml-xs blink" />
          </q-badge>
        </div>
        <div class="text-caption text-grey-5">
          {{ order.timeAgo || 'Just now' }}
        </div>
      </div>
    </q-card-section>

    <q-card-section class="q-py-sm">
      <div class="text-body2 text-grey-4 ellipsis-2-lines">
        {{ order.items }}
      </div>
      <div class="row items-center justify-between q-mt-sm">
        <q-chip dense size="sm" :color="typeColor" text-color="white" icon="restaurant">
          {{ order.type }}
        </q-chip>
        <div class="text-bold text-primary">{{ order.total }}</div>
      </div>
    </q-card-section>

    <q-separator color="grey-8" />

    <q-card-actions align="right">
      <q-btn flat dense size="sm" color="grey-5" icon="visibility" @click="$emit('view', order)">
        <q-tooltip>View Details</q-tooltip>
      </q-btn>
      <q-space />
      <q-btn
        v-if="nextActionLabel"
        push
        dense
        size="sm"
        :color="nextActionColor"
        :label="nextActionLabel"
        @click="$emit('next-stage', order)"
      />
    </q-card-actions>
  </q-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  order: {
    type: Object,
    required: true,
  },
})

defineEmits(['view', 'next-stage'])

const statusClass = computed(() => {
  switch (props.order.status) {
    case 'pending':
      return 'bg-grey-9'
    case 'cooking':
      return 'bg-blue-grey-10'
    case 'ready':
      return 'bg-green-10'
    case 'completed':
      return 'bg-grey-10'
    default:
      return 'bg-grey-9'
  }
})

const tableColor = computed(() => {
  return props.order.table !== '-' ? 'primary' : 'orange'
})

const typeColor = computed(() => {
  switch (props.order.type.toLowerCase()) {
    case 'dine-in':
      return 'teal'
    case 'takeaway':
      return 'orange'
    case 'delivery':
      return 'purple'
    default:
      return 'grey'
  }
})

const nextActionLabel = computed(() => {
  switch (props.order.status) {
    case 'pending':
      return 'Start'
    case 'cooking':
      return 'Ready'
    case 'ready':
      return 'Complete'
    default:
      return null
  }
})

const nextActionColor = computed(() => {
  switch (props.order.status) {
    case 'pending':
      return 'primary'
    case 'cooking':
      return 'secondary'
    case 'ready':
      return 'positive'
    default:
      return 'grey'
  }
})
</script>

<style scoped>
.order-card {
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.1);
}

.blink {
  animation: blinker 1.5s linear infinite;
}

@keyframes blinker {
  50% {
    opacity: 0;
  }
}
</style>
