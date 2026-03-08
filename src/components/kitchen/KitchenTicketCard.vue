<template>
  <q-card class="kds-card" flat>
    <div class="card-strip" :class="stripClass"></div>

    <div class="q-pa-sm card-content column justify-between full-height">
      <!-- Header -->
      <div>
        <div class="row items-center justify-between no-wrap q-mb-xs">
          <div class="row items-center q-gutter-x-sm">
            <span class="text-h6 text-weight-bolder font-mono"
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
              size="14px"
              color="green-5"
              class="q-ml-xs"
            >
              <q-tooltip>Printed</q-tooltip>
            </q-icon>
          </div>

          <div class="timer-box" :class="{ 'timer-late': isLate, 'timer-critical': isCritical }">
            <q-icon name="schedule" size="14px" class="q-mr-xs" />
            <span class="text-weight-bold font-mono text-caption">{{ ticket.timeElapsed }}</span>
          </div>
        </div>

        <!-- Meta Info -->
        <div class="row items-center text-grey-5 q-mb-sm text-caption" style="font-size: 0.75rem">
          <q-icon name="table_restaurant" size="14px" class="q-mr-xs" />
          <span class="text-weight-medium">
            {{ ticket.tableNumber !== '—' ? `T${ticket.tableNumber}` : 'Takeaway' }}
          </span>
          <div class="q-mx-xs text-grey-8">|</div>
          <span class="text-grey-5">{{ itemCount }} items</span>
          <div class="q-mx-xs text-grey-8">|</div>
          <span class="text-grey-5">Ord #{{ ticket.orderNumber }}</span>
        </div>

        <div v-if="ticket.kitchenName" class="row items-center q-mb-sm">
          <q-badge outline color="grey-7" class="kitchen-name-badge">
            <q-icon name="soup_kitchen" size="10px" class="q-mr-xs" />
            {{ ticket.kitchenName }}
          </q-badge>
        </div>

        <q-separator dark class="q-mb-sm separator-dashed" />

        <!-- Items List -->
        <div class="items-list q-gutter-y-sm">
          <div v-for="(item, idx) in ticket.items" :key="idx" class="item-row">
            <div class="row no-wrap items-start">
              <div class="item-qty shadow-2">{{ item.qty }}</div>
              <div class="col q-pl-sm">
                <div class="text-body2 text-weight-medium item-name text-grey-2">
                  {{ item.name }}
                </div>
                <div v-if="item.notes" class="item-notes q-mt-xs">
                  <q-icon name="sticky_note_2" size="12px" class="q-mr-xs text-amber-5" />
                  <span class="text-amber-2 text-italic" style="font-size: 0.75rem">{{
                    item.notes
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Order Notes -->
        <div v-if="ticket.orderNotes" class="order-notes q-mt-sm">
          <q-icon name="notes" size="12px" class="q-mr-xs" />
          {{ ticket.orderNotes }}
        </div>
      </div>

      <!-- Footer: Actions -->
      <div class="q-mt-md action-area">
        <!-- STATUS: CREATED → Accept + Print -->
        <template v-if="ticket.status === 'created'">
          <div class="row q-gutter-xs">
            <q-btn
              unelevated
              rounded
              class="col action-btn btn-accept"
              :loading="accepting"
              @click="$emit('accept', ticket.id)"
            >
              <q-icon name="restaurant" size="16px" class="q-mr-xs" />
              ACCEPT
            </q-btn>
            <q-btn unelevated rounded class="action-btn btn-view" @click="$emit('view', ticket.id)">
              <q-icon name="visibility" size="16px" />
            </q-btn>
            <q-btn
              unelevated
              rounded
              class="action-btn btn-print"
              :loading="isPrinting"
              @click="$emit('print', ticket.id)"
            >
              <q-icon name="print" size="16px" />
            </q-btn>
          </div>
        </template>

        <!-- STATUS: PREPARING → Mark Ready + Print -->
        <template v-else-if="ticket.status === 'preparing'">
          <div class="row q-gutter-xs">
            <q-btn
              unelevated
              rounded
              class="col action-btn btn-ready"
              @click="$emit('mark-ready', ticket.id)"
            >
              <q-icon name="check_circle" size="16px" class="q-mr-xs" />
              READY
            </q-btn>
            <q-btn unelevated rounded class="action-btn btn-view" @click="$emit('view', ticket.id)">
              <q-icon name="visibility" size="16px" />
            </q-btn>
            <q-btn
              unelevated
              rounded
              class="action-btn btn-print"
              :loading="isPrinting"
              @click="$emit('print', ticket.id)"
            >
              <q-icon name="print" size="16px" />
            </q-btn>
          </div>
        </template>

        <!-- STATUS: READY → Complete/Dismiss + Reprint -->
        <template v-else-if="ticket.status === 'ready'">
          <div class="row q-gutter-xs">
            <q-btn
              unelevated
              rounded
              class="col action-btn btn-complete"
              @click="$emit('dismiss', ticket.id)"
            >
              <q-icon name="done_all" size="16px" class="q-mr-xs" />
              DONE
            </q-btn>
            <q-btn unelevated rounded class="action-btn btn-view" @click="$emit('view', ticket.id)">
              <q-icon name="visibility" size="16px" />
            </q-btn>
            <q-btn
              unelevated
              rounded
              class="action-btn btn-print"
              :loading="isPrinting"
              @click="$emit('print', ticket.id)"
            >
              <q-icon name="print" size="16px" />
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

defineEmits(['accept', 'mark-ready', 'dismiss', 'print', 'view'])

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
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
}
.kds-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.1);
}

.card-strip {
  height: 4px;
  width: 100%;
}

.card-content {
  color: white;
  min-height: 180px;
}

.text-weight-bolder {
  font-weight: 800;
}
.font-mono {
  font-family: 'Roboto Mono', monospace;
  letter-spacing: -0.5px;
}
.separator-dashed {
  border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
  background: transparent;
}

/* Timer */
.timer-box {
  background: rgba(255, 255, 255, 0.06);
  padding: 4px 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: all 0.3s;
}
.timer-late {
  background: rgba(255, 152, 0, 0.15);
  color: #ffb74d;
}
.timer-critical {
  background: rgba(244, 67, 54, 0.15);
  color: #ff5252;
}

.type-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

/* Items */
.item-qty {
  background: #2a2a2a;
  min-width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: #fff;
  font-size: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.item-name {
  line-height: 1.2;
}
.item-notes {
  background: rgba(255, 193, 7, 0.1);
  padding: 4px 8px;
  border-radius: 4px;
  display: inline-block;
  font-size: 0.75rem;
  border-left: 2px solid #ffc107;
}

.order-notes {
  font-size: 0.75rem;
  color: #9ca3af;
  background: rgba(245, 158, 11, 0.05);
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px dashed rgba(245, 158, 11, 0.15);
}

/* Action Buttons */
.action-btn {
  font-weight: 700;
  letter-spacing: 1px;
  height: 40px;
  font-size: 0.8rem;
}

.btn-accept {
  background: linear-gradient(135deg, #f57c00, #ff9800) !important;
  color: white !important;
}
.btn-ready {
  background: linear-gradient(135deg, #1976d2, #2196f3) !important;
  color: white !important;
}
.btn-complete {
  background: linear-gradient(135deg, #388e3c, #4caf50) !important;
  color: white !important;
}

.btn-print,
.btn-view {
  background: rgba(255, 255, 255, 0.05) !important;
  color: #9ca3af !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  min-width: 40px;
}

/* Items scroll */
.items-list {
  max-height: 300px;
  overflow-y: auto;
}
.items-list::-webkit-scrollbar {
  width: 3px;
}
.items-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}
.kitchen-name-badge {
  font-size: 0.65rem;
  letter-spacing: 0.5px;
  background: rgba(255, 255, 255, 0.03);
  padding: 2px 8px;
  border-radius: 4px;
}
</style>
