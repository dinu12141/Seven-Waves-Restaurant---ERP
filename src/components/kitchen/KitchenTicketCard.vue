<template>
  <q-card class="kds-card" :class="{ 'list-view-card': listView }" flat>
    <!-- Card Strip (Only for full view) -->
    <div v-if="!listView" class="card-strip" :class="stripClass"></div>

    <!-- FULL VIEW -->
    <div v-if="!listView" class="q-pa-sm card-content column justify-between full-height">
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
              class="type-badge shadow-2 text-bold"
              style="padding: 4px 8px; font-size: 0.75rem;"
            >
              <q-icon 
                :name="(ticket.orderType || '').toLowerCase().includes('dine') ? 'restaurant' : 
                       ((ticket.orderType || '').toLowerCase().includes('take') ? 'shopping_bag' : 'delivery_dining')" 
                size="12px" 
                class="q-mr-xs" 
              />
              {{ 
                ticket.deliverySource 
                  ? 'DELIVERY (' + ticket.deliverySource.toUpperCase() + ')' 
                  : ticket.orderType?.replace('_', ' ')?.toUpperCase() 
              }}
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

        <!-- Customer Name -->
        <div
          v-if="ticket.customerName"
          class="text-subtitle2 text-weight-bold text-orange-4 q-mb-xs"
        >
          <q-icon name="person" size="14px" class="q-mr-xs" />
          {{ ticket.customerName }}
        </div>

        <!-- Meta Info -->
        <div class="row items-center kds-meta-text q-mb-sm text-caption" style="font-size: 0.75rem">
          <q-icon name="table_restaurant" size="14px" class="q-mr-xs" />
          <span class="text-weight-medium">
            {{ ticket.tableNumber !== '—' ? `T${ticket.tableNumber}` : 'Takeaway' }}
          </span>
          <div class="q-mx-xs kds-meta-divider">|</div>
          <span>{{ itemCount }} items</span>
          <div class="q-mx-xs kds-meta-divider">|</div>
          <span>Ord #{{ ticket.orderNumber }}</span>
        </div>

        <div v-if="ticket.kitchenName" class="row items-center q-mb-sm">
          <q-badge outline color="grey-7" class="kitchen-name-badge">
            <q-icon name="soup_kitchen" size="10px" class="q-mr-xs" />
            {{ ticket.kitchenName }}
          </q-badge>
        </div>

        <q-separator class="q-mb-sm separator-dashed" />

        <!-- Items List -->
        <div class="items-list q-gutter-y-sm">
          <div v-for="(item, idx) in ticket.items" :key="idx" class="item-row">
            <div class="row no-wrap items-start">
              <div class="item-qty shadow-2">{{ item.qty }}</div>
              <div class="col q-pl-sm">
                <div class="text-body2 text-weight-medium item-name">
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
        <!-- STATUS: CREATED / PENDING / ACCEPTED → Accept + Print -->
        <template v-if="['created','pending','accepted'].includes(ticket.status)">
          <div class="row q-gutter-xs">
            <q-btn
              unelevated
              rounded
              class="col action-btn btn-accept"
              :loading="accepting"
              @click="$emit('accept', ticket.id)"
            >
              <q-icon name="restaurant" size="16px" class="q-mr-xs" />
              {{ ticket.status === 'accepted' ? 'START COOKING' : 'ACCEPT' }}
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

    <!-- LIST VIEW (Compact) -->
    <div v-else class="row items-center justify-between q-pa-sm full-width">
      <div class="row items-center q-gutter-x-sm" style="flex: 1; min-width: 0">
        <div class="list-dot" :class="stripClass"></div>
        <span class="text-subtitle1 text-weight-bold font-mono kds-list-order"
          >#{{ ticket.orderNumber }}</span
        >
        <span
          v-if="ticket.tableNumber && ticket.tableNumber !== '—'"
          class="text-caption text-cyan-4 text-weight-medium"
        >
          <q-icon name="table_restaurant" size="12px" class="q-mr-xs" />{{ ticket.tableNumber }}
        </span>
        <span v-if="ticket.waiterName" class="text-caption text-orange-4 text-weight-medium">
          <q-icon name="person" size="12px" class="q-mr-xs" />{{ ticket.waiterName }}
        </span>
      </div>
      <div class="row items-center q-gutter-x-xs" style="flex-shrink: 0">
        <div class="text-caption font-mono text-grey-5 q-mr-xs">{{ ticket.timeElapsed }}</div>
        <q-btn
          flat
          round
          dense
          color="grey-4"
          icon="visibility"
          size="sm"
          @click="$emit('view', ticket.id)"
          class="view-btn-compact"
        >
          <q-tooltip>View KOT</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          dense
          color="green-5"
          icon="done"
          size="sm"
          @click="$emit('dismiss', ticket.id)"
          class="view-btn-compact"
        >
          <q-tooltip>Dismiss</q-tooltip>
        </q-btn>
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
  listView: { type: Boolean, default: false },
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
    case 'pending':
      return 'bg-orange-5'
    case 'accepted':
      return 'bg-yellow-7'
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
  if (t.includes('dine')) return 'purple-7'
  if (t.includes('take')) return 'teal-7'
  if (t.includes('deliver')) return 'red-7' // Red for Delivery/Uber/Pickme to grab attention
  return 'grey-8'
})
</script>

<style scoped>
.kds-card {
  background: var(--erp-bg-card);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  box-shadow: var(--erp-shadow-card);
  border: 1px solid var(--erp-border);
  display: flex;
  flex-direction: column;
}
.list-view-card {
  min-height: unset !important;
  border-left: 4px solid transparent;
  background: var(--erp-bg-card-hover);
}
.list-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.view-btn-compact {
  background: var(--erp-bg-hover);
}
.kds-card:hover:not(.list-view-card) {
  transform: translateY(-1px);
  box-shadow: var(--erp-shadow-lg);
  border-color: var(--erp-border-hover);
}

.card-strip {
  height: 4px;
  width: 100%;
}

.card-content {
  color: var(--erp-text-primary);
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
  border-bottom: 1px dashed var(--erp-border);
  background: transparent;
}

/* Timer */
.timer-box {
  background: var(--erp-bg-hover);
  padding: 4px 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: all 0.3s;
  color: var(--erp-text-secondary);
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
  background: var(--erp-bg-hover);
  min-width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: var(--erp-text-primary);
  font-size: 1rem;
  border: 1px solid var(--erp-border);
}
.item-name {
  line-height: 1.2;
  color: var(--erp-text-primary);
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
  color: var(--erp-text-muted);
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
  background: var(--erp-bg-hover) !important;
  color: var(--erp-text-muted) !important;
  border: 1px solid var(--erp-border) !important;
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
  background: var(--erp-text-tertiary);
  border-radius: 2px;
}
.kitchen-name-badge {
  font-size: 0.65rem;
  letter-spacing: 0.5px;
  background: var(--erp-bg-hover);
  padding: 2px 8px;
  border-radius: 4px;
}

/* Theme-aware text */
.kds-meta-text {
  color: var(--erp-text-muted);
}
.kds-meta-divider {
  color: var(--erp-border);
}
.kds-list-order {
  color: var(--erp-text-primary);
}
</style>
