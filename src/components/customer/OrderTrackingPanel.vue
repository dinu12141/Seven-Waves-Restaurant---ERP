<template>
  <q-card flat bordered class="tracking-panel bg-dark-elevated rounded-borders q-pa-lg">
    <div class="column items-center q-mb-xl text-center">
      <div class="text-overline text-primary q-mb-xs">ORDER STATUS</div>
      <div class="text-h5 text-weight-bolder text-white">#{{ orderId }}</div>
      <div class="text-caption text-grey-5 q-mt-sm">
        We're on it! Your food is being prepared with care.
      </div>
    </div>

    <div class="timeline q-px-md">
      <div
        v-for="(step, index) in trackingSteps"
        :key="step.status"
        :class="[
          'timeline-item',
          { active: isStepActive(step.status), completed: isStepCompleted(index) },
        ]"
      >
        <div class="timeline-marker row items-center justify-center">
          <q-icon :name="getStepIcon(step, index)" size="18px" />
        </div>

        <div class="timeline-content q-ml-lg">
          <div class="text-subtitle1 text-weight-bold step-title">{{ step.label }}</div>
          <div class="text-caption step-caption">{{ step.caption }}</div>
        </div>

        <div v-if="index < trackingSteps.length - 1" class="timeline-connector"></div>
      </div>
    </div>

    <div class="q-mt-xl bg-dark q-pa-md rounded-borders border-dashed text-center">
      <div class="text-caption text-grey-5 q-mb-sm">Need help with your order?</div>
      <q-btn flat no-caps color="primary" label="Call Waiter" icon="notifications_active" />
    </div>
  </q-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  orderId: {
    type: String,
    required: true,
  },
  currentStatus: {
    type: String,
    required: true,
    default: 'pending_waiter',
  },
})

const trackingSteps = [
  {
    status: 'pending_waiter',
    label: 'Pending Waiter',
    caption: 'Waiting for a waiter to accept your order.',
    icon: 'hourglass_empty',
  },
  {
    status: 'accepted',
    label: 'Accepted',
    caption: 'Your order has been confirmed.',
    icon: 'check',
  },
  {
    status: 'preparing',
    label: 'Preparing',
    caption: 'Our chefs are working their magic.',
    icon: 'restaurant',
  },
  {
    status: 'ready',
    label: 'Ready',
    caption: 'Your food is ready to be served!',
    icon: 'celebration',
  },
]

const statusOrder = ['pending_waiter', 'accepted', 'preparing', 'ready', 'served']

const currentStatusIndex = computed(() => {
  return statusOrder.indexOf(props.currentStatus)
})

function isStepActive(status) {
  return props.currentStatus === status
}

function isStepCompleted(index) {
  return currentStatusIndex.value > index
}

function getStepIcon(step, index) {
  if (isStepCompleted(index)) return 'check_circle'
  return step.icon
}
</script>

<style lang="scss" scoped>
.tracking-panel {
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.timeline {
  position: relative;
}

.timeline-item {
  position: relative;
  display: flex;
  padding-bottom: 40px;
  opacity: 0.3;
  transition: all 0.5s ease;

  &.active {
    opacity: 1;
    .timeline-marker {
      background: q-color('primary');
      color: white;
      transform: scale(1.2);
      box-shadow: 0 0 15px rgba(var(--q-primary), 0.5);
    }
    .step-title {
      color: white;
    }
    .step-caption {
      color: q-color('primary');
      font-weight: 500;
    }
  }

  &.completed {
    opacity: 0.8;
    .timeline-marker {
      background: q-color('positive');
      color: white;
    }
    .timeline-connector {
      background: q-color('positive');
    }
    .step-title {
      color: white;
    }
  }

  &:last-child {
    padding-bottom: 0;
  }
}

.timeline-marker {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #333;
  color: #777;
  z-index: 2;
  transition: all 0.3s ease;
}

.timeline-connector {
  position: absolute;
  left: 15px;
  top: 32px;
  width: 2px;
  height: calc(100% - 32px);
  background: #333;
  z-index: 1;
}

.step-title {
  transition: color 0.3s ease;
}

.step-caption {
  font-size: 0.75rem;
  color: #777;
  transition: color 0.3s ease;
}

.border-dashed {
  border: 1px dashed rgba(255, 255, 255, 0.1);
}
</style>
