<template>
  <q-card class="kds-card" flat>
    <div class="card-strip" :class="stripClass"></div>

    <div class="q-pa-md card-content column justify-between full-height">
      <!-- Header -->
      <div>
        <div class="row items-center justify-between no-wrap q-mb-sm">
          <div class="row items-center q-gutter-x-sm">
            <span class="text-h5 text-weight-bolder font-mono"
              >#{{ ticket.kot_number || ticket.orderNumber }}</span
            >
            <q-badge
              v-if="ticket.orderType"
              :color="typeColor"
              text-color="white"
              class="type-badge shadow-1"
            >
              {{ ticket.orderType }}
            </q-badge>
            <!-- Print indicator -->
            <q-icon
              v-if="ticket.printed_at"
              name="print"
              size="16px"
              color="green-5"
              class="q-ml-xs"
            >
              <q-tooltip>Printed</q-tooltip>
            </q-icon>
          </div>

          <div class="timer-box" :class="{ 'timer-late': isLate, 'timer-critical': isCritical }">
            <q-icon name="schedule" size="18px" class="q-mr-xs" />
            <span class="text-weight-bold font-mono text-subtitle1">{{ ticket.timeElapsed }}</span>
          </div>
        </div>

        <!-- Meta Info -->
        <div class="row items-center text-grey-5 q-mb-md text-caption">
          <q-icon name="table_restaurant" size="16px" class="q-mr-xs" />
          <span class="text-weight-medium text-body2">
            {{ ticket.tableNumber !== '—' ? `Table ${ticket.tableNumber}` : 'Takeaway' }}
          </span>
          <div class="q-mx-sm text-grey-8">|</div>
          <span class="text-grey-5 text-body2">{{ itemCount }} items</span>
          <div class="q-mx-sm text-grey-8">|</div>
          <span class="text-grey-5 text-body2">Order #{{ ticket.orderNumber }}</span>
        </div>

        <q-separator dark class="q-mb-md separator-dashed" />

        <!-- Items List -->
        <div class="items-list q-gutter-y-md">
          <div v-for="(item, idx) in ticket.items" :key="idx" class="item-row">
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

        <!-- Order Notes -->
        <div v-if="ticket.orderNotes" class="order-notes q-mt-md">
          <q-icon name="notes" size="14px" class="q-mr-xs" />
          {{ ticket.orderNotes }}
        </div>
      </div>

      <!-- Footer: Actions -->
      <div class="q-mt-lg action-area">
        <!-- STATUS: CREATED → Accept + Print -->
        <template v-if="ticket.status === 'created'">
          <div class="row q-gutter-sm">
            <q-btn
              unelevated
              rounded
              class="col action-btn btn-accept"
              :loading="accepting"
              @click="$emit('accept', ticket.id)"
            >
              <q-icon name="restaurant" size="20px" class="q-mr-sm" />
              ACCEPT
            </q-btn>
            <q-btn
              unelevated
              rounded
              class="action-btn btn-print"
              :loading="isPrinting"
              @click="$emit('print', ticket.id)"
            >
              <q-icon name="print" size="20px" />
              <q-tooltip>Print KOT</q-tooltip>
            </q-btn>
          </div>
        </template>

        <!-- STATUS: PREPARING → Mark Ready + Print -->
        <template v-else-if="ticket.status === 'preparing'">
          <div class="row q-gutter-sm">
            <q-btn
              unelevated
              rounded
              class="col action-btn btn-ready"
              @click="$emit('mark-ready', ticket.id)"
            >
              <q-icon name="check_circle" size="20px" class="q-mr-sm" />
              MARK READY
            </q-btn>
            <q-btn
              unelevated
              rounded
              class="action-btn btn-print"
              :loading="isPrinting"
              @click="$emit('print', ticket.id)"
            >
              <q-icon name="print" size="20px" />
              <q-tooltip>{{ ticket.printed_at ? 'Reprint KOT' : 'Print KOT' }}</q-tooltip>
            </q-btn>
          </div>
        </template>

        <!-- STATUS: READY → Complete/Dismiss + Reprint -->
        <template v-else-if="ticket.status === 'ready'">
          <div class="row q-gutter-sm">
            <q-btn
              unelevated
              rounded
              class="col action-btn btn-complete"
              @click="$emit('dismiss', ticket.id)"
            >
              <q-icon name="done_all" size="20px" class="q-mr-sm" />
              COMPLETE
            </q-btn>
            <q-btn
              unelevated
              rounded
              class="action-btn btn-print"
              :loading="isPrinting"
              @click="$emit('print', ticket.id)"
            >
              <q-icon name="print" size="20px" />
              <q-tooltip>Reprint KOT</q-tooltip>
            </q-btn>
          </div>
        </template>
      </div>
    </div>
  </q-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  ticket: { type: Object, required: true },
  accepting: { type: Boolean, default: false },
  isPrinting: { type: Boolean, default: false },
})

defineEmits(['accept', 'mark-ready', 'dismiss', 'print'])

const itemCount = computed(() => props.ticket.items?.reduce((sum, i) => sum + i.qty, 0) || 0)

// Late: > 15 mins
const isLate = computed(() => {
  const elapsed = props.ticket.timeElapsed
  if (!elapsed) return false
  const mins = parseInt(elapsed.split(':')[0], 10)
  return mins >= 15 && mins < 30
})

// Critical: > 30 mins
const isCritical = computed(() => {
  const elapsed = props.ticket.timeElapsed
  if (!elapsed) return false
  const mins = parseInt(elapsed.split(':')[0], 10)
  return mins >= 30
})

const stripClass = computed(() => {
  switch (props.ticket.status) {
    case 'created':
      return 'bg-orange-5'
    case 'preparing':
      return 'bg-blue-5'
    case 'ready':
      return 'bg-green-5'
    default:
      return 'bg-grey-6'
  }
})

const typeColor = computed(() => {
  const t = (props.ticket.orderType || '').toLowerCase()
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
  position: relative;
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
  min-height: 200px;
}

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
  background: rgba(255, 152, 0, 0.15);
  color: #ffb74d;
  border-color: rgba(255, 152, 0, 0.3);
}
.timer-critical {
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

.order-notes {
  font-size: 0.8rem;
  color: #9ca3af;
  background: rgba(245, 158, 11, 0.06);
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px dashed rgba(245, 158, 11, 0.2);
}

/* Action Buttons */
.action-btn {
  font-weight: 800;
  letter-spacing: 1.5px;
  height: 54px;
  font-size: 0.95rem;
  transition: all 0.2s ease;
}

.btn-accept {
  background: linear-gradient(135deg, #f57c00, #ff9800) !important;
  color: white !important;
  box-shadow: 0 4px 15px rgba(245, 124, 0, 0.4);
}
.btn-accept:hover {
  box-shadow: 0 6px 20px rgba(245, 124, 0, 0.6);
}

.btn-ready {
  background: linear-gradient(135deg, #1976d2, #2196f3) !important;
  color: white !important;
  box-shadow: 0 4px 15px rgba(33, 150, 243, 0.4);
}
.btn-ready:hover {
  box-shadow: 0 6px 20px rgba(33, 150, 243, 0.6);
}

.btn-complete {
  background: linear-gradient(135deg, #388e3c, #4caf50) !important;
  color: white !important;
  box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4);
}
.btn-complete:hover {
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.6);
}

.btn-print {
  background: rgba(255, 255, 255, 0.08) !important;
  color: #e0e0e0 !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  min-width: 54px;
}
.btn-print:hover {
  background: rgba(255, 255, 255, 0.15) !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
}

/* Items scroll */
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
