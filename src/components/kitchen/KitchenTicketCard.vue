<template>
  <q-card class="kds-card" flat>
    <div class="card-strip" :class="stripColorClass"></div>

    <div class="q-pa-md card-content column justify-between full-height">
      <!-- Header -->
      <div>
        <div class="row items-center justify-between no-wrap q-mb-sm">
          <div class="row items-center">
            <span class="text-h5 text-weight-bolder font-mono q-mr-sm">#{{ displayOrderId }}</span>
            <q-badge
              v-if="order.type"
              :color="typeColor"
              text-color="white"
              class="type-badge shadow-1"
            >
              {{ order.type }}
            </q-badge>
          </div>

          <div class="timer-box" :class="{ 'timer-late': isLate }">
            <q-icon name="schedule" size="18px" class="q-mr-xs" />
            <span class="text-weight-bold font-mono text-subtitle1">{{ order.timeElapsed }}</span>
          </div>
        </div>

        <!-- Meta Info -->
        <div class="row items-center text-grey-5 q-mb-md text-caption">
          <q-icon name="table_restaurant" size="16px" class="q-mr-xs" />
          <span class="text-weight-medium text-body2">{{
            order.table !== '-' ? `Table ${order.table}` : 'Fast Food / Takeaway'
          }}</span>
          <div class="q-mx-sm text-grey-8">|</div>
          <span class="text-grey-5 text-body2">{{ itemCount }} Items</span>
        </div>

        <q-separator dark class="q-mb-md separator-dashed" />

        <!-- Items List -->
        <div class="items-list q-gutter-y-md">
          <div v-for="(item, idx) in order.items" :key="idx" class="item-row">
            <div class="row no-wrap items-start">
              <div class="item-qty shadow-2">{{ item.qty }}</div>
              <div class="col q-pl-md">
                <div class="text-body1 text-weight-medium item-name text-grey-2">
                  {{ item.name }}
                </div>
                <div v-if="item.notes" class="item-notes q-mt-xs">
                  <q-icon name="sticky_note_2" size="14px" class="q-mr-xs text-amber-5" />
                  <span class="text-amber-2 text-italic">{{ item.notes }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer: Actions -->
      <div class="q-mt-lg action-area">
        <q-btn
          v-if="order.status === 'Pending'"
          unelevated
          rounded
          class="full-width action-btn btn-new"
          @click="$emit('start-cooking', order)"
        >
          <div class="row items-center justify-center">
            <q-icon name="restaurant" size="20px" class="q-mr-sm" />
            <span>START COOKING</span>
          </div>
        </q-btn>

        <q-btn
          v-else-if="order.status === 'Cooking'"
          unelevated
          rounded
          class="full-width action-btn btn-cooking"
          @click="$emit('mark-ready', order)"
        >
          <div class="row items-center justify-center">
            <q-icon name="check_circle" size="20px" class="q-mr-sm" />
            <span>MARK READY</span>
          </div>
        </q-btn>

        <q-btn
          v-else-if="order.status === 'Ready'"
          unelevated
          rounded
          class="full-width action-btn btn-ready"
          @click="$emit('complete', order)"
        >
          <div class="row items-center justify-center">
            <q-icon name="done_all" size="20px" class="q-mr-sm" />
            <span>COMPLETE</span>
          </div>
        </q-btn>
      </div>
    </div>
  </q-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  order: { type: Object, required: true },
})

defineEmits(['start-cooking', 'mark-ready', 'complete'])

const itemCount = computed(() => {
  return props.order.items.reduce((acc, item) => acc + item.qty, 0)
})

const displayOrderId = computed(() => {
  return props.order.orderId ? props.order.orderId.replace(/[^\d]/g, '') : '??'
})

// Late logic: e.g., > 20 mins
const isLate = computed(() => {
  if (!props.order.timeElapsed) return false
  const parts = props.order.timeElapsed.split(':')
  if (parts.length !== 2) return false
  const mm = parseInt(parts[0], 10)
  // const ss = parseInt(parts[1], 10) // unused
  return mm >= 20
})

const stripColorClass = computed(() => {
  switch (props.order.status) {
    case 'Pending':
      return 'bg-orange-5'
    case 'Cooking':
      return 'bg-blue-5'
    case 'Ready':
      return 'bg-green-5'
    default:
      return 'bg-grey-6'
  }
})

const typeColor = computed(() => {
  const t = props.order.type?.toLowerCase() || ''
  if (t.includes('dine')) return 'purple-6'
  if (t.includes('take')) return 'teal-6'
  if (t.includes('deliver')) return 'deep-orange-6'
  return 'grey-7'
})
</script>

<style scoped>
.kds-card {
  background: #1e1e1e;
  border-radius: 12px;
  overflow: hidden;
  position: relative; /* For strip positioning */
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
}

.kds-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.1);
}

.card-strip {
  height: 6px;
  width: 100%;
}

.card-content {
  color: white;
  min-height: 200px; /* Ensure consistent minimum height */
}

/* Typography & Utils */
.text-weight-bolder {
  font-weight: 900;
}
.font-mono {
  font-family: 'Roboto Mono', monospace;
  letter-spacing: -0.5px;
}
.separator-dashed {
  border-bottom: 1px dashed rgba(255, 255, 255, 0.15);
  background: transparent;
}

/* Timer */
.timer-box {
  background: rgba(255, 255, 255, 0.08);
  padding: 6px 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  transition: all 0.3s;
  border: 1px solid transparent;
}

.timer-late {
  background: rgba(244, 67, 54, 0.15);
  color: #ff5252;
  border-color: rgba(244, 67, 54, 0.3);
  animation: pulse-border 2s infinite;
}

@keyframes pulse-border {
  0% {
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4);
  }
  70% {
    box-shadow: 0 0 0 4px rgba(244, 67, 54, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0);
  }
}

/* Badges */
.type-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

/* Items */
.item-qty {
  background: #2a2a2a;
  min-width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: #fff;
  font-size: 1.2rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.item-name {
  line-height: 1.3;
}

.item-notes {
  background: rgba(255, 193, 7, 0.15);
  padding: 6px 10px;
  border-radius: 6px;
  display: inline-block;
  font-size: 0.85rem;
  border-left: 3px solid #ffc107;
}

/* Action Area */
.action-btn {
  font-weight: 800;
  letter-spacing: 1.5px;
  height: 54px;
  font-size: 1rem;
  transition: all 0.2s ease;
}

.btn-new {
  background: linear-gradient(135deg, #f57c00 0%, #ff9800 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(245, 124, 0, 0.4);
}
.btn-new:hover {
  box-shadow: 0 6px 20px rgba(245, 124, 0, 0.6);
}

.btn-cooking {
  background: linear-gradient(135deg, #1976d2 0%, #2196f3 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(33, 150, 243, 0.4);
}
.btn-cooking:hover {
  box-shadow: 0 6px 20px rgba(33, 150, 243, 0.6);
}

.btn-ready {
  background: linear-gradient(135deg, #388e3c 0%, #4caf50 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4);
}
.btn-ready:hover {
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.6);
}

/* Scrollbar safety */
.items-list {
  max-height: 350px;
  overflow-y: auto;
  padding-right: 4px;
}
.items-list::-webkit-scrollbar {
  width: 4px;
}
.items-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}
</style>
