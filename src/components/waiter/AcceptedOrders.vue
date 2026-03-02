<template>
  <div class="accepted-root">
    <!-- Empty State -->
    <div
      v-if="!store.loading && store.myOrders.length === 0"
      class="empty-state column items-center q-pa-xl"
    >
      <div class="empty-icon">📋</div>
      <div class="text-h6 text-grey-3 q-mt-md">No Active Orders</div>
      <div class="text-body2 text-grey-6 q-mt-xs text-center" style="max-width: 280px">
        Accept orders from the inbox to see them here.
      </div>
    </div>

    <!-- My Orders List -->
    <div class="orders-list q-pa-md q-gutter-y-md">
      <q-card
        v-for="order in store.myOrders"
        :key="order.id"
        class="my-order-card"
        :class="`status-${order.status}`"
      >
        <!-- READY Banner -->
        <div v-if="order.status === 'ready'" class="ready-banner">
          <q-icon name="notifications_active" size="16px" class="q-mr-xs" />
          READY TO SERVE
        </div>

        <!-- Card Body -->
        <div class="q-pa-md q-pb-sm">
          <!-- Header -->
          <div class="row items-center no-wrap q-mb-md">
            <div class="table-badge-sm">
              <q-icon name="table_restaurant" size="14px" />
              {{ order.tableNumber }}
            </div>
            <q-space />
            <q-badge
              :color="statusBadgeColor(order.status)"
              class="status-chip q-mr-sm"
              text-color="white"
            >
              {{ statusLabel(order.status) }}
            </q-badge>
            <div class="order-num-sm">#{{ order.order_number }}</div>
          </div>

          <!-- Horizontal Timeline (Customer View Match) -->
          <div class="timeline-container q-mb-lg">
            <div v-for="(step, i) in trackingSteps" :key="step.status" class="timeline-step">
              <!-- Connector (skip for first step) -->
              <div
                v-if="i !== 0"
                class="step-connector"
                :class="{
                  'connector-done': getStepIndex(order.status) >= i,
                  'connector-active': getStepIndex(order.status) === i,
                }"
              ></div>

              <div class="step-node-wrap">
                <div
                  class="step-node"
                  :class="{
                    'node-done': getStepIndex(order.status) > i,
                    'node-active': getStepIndex(order.status) === i,
                    'node-pending': getStepIndex(order.status) < i,
                  }"
                >
                  <q-icon
                    v-if="getStepIndex(order.status) > i"
                    name="check"
                    size="12px"
                    color="white"
                  />
                  <span v-else class="step-emoji">{{ step.emoji }}</span>
                </div>
                <div
                  class="step-label"
                  :class="{ 'label-active': getStepIndex(order.status) >= i }"
                >
                  {{ step.label }}
                </div>
              </div>
            </div>
          </div>

          <!-- Items -->
          <div class="items-compact q-mb-sm">
            <div v-for="item in order.items" :key="item.id" class="item-row-sm">
              <span class="qty-sm">{{ item.quantity }}×</span>
              <span class="name-sm">{{ item.name }}</span>
              <q-badge
                v-if="item.status && item.status !== 'queued'"
                :color="getItemStatusColor(item.status)"
                class="q-ml-auto"
              >
                {{ item.status }}
              </q-badge>
            </div>
          </div>

          <!-- KOT Tickets -->
          <div v-if="order.kot_tickets && order.kot_tickets.length > 0" class="kot-row q-mb-md">
            <div class="row items-center justify-between q-mb-xs">
              <div
                class="text-overline text-grey-7"
                style="font-size: 0.6rem; letter-spacing: 1.5px"
              >
                KITCHEN STATUS
              </div>
              <q-btn
                unelevated
                dense
                size="sm"
                color="primary"
                text-color="white"
                icon="visibility"
                label="View KOT"
                class="q-px-sm"
                @click="viewKOT(order.kot_tickets[0], order)"
              />
            </div>
            <div class="row q-gutter-xs">
              <q-chip
                v-for="kot in order.kot_tickets"
                :key="kot.id"
                dense
                size="sm"
                :color="getKotColor(kot.status)"
                text-color="white"
                :icon="getKotIcon(kot.status)"
              >
                KOT #{{ kot.kot_number || 'N/A' }}
              </q-chip>
            </div>
          </div>

          <!-- Footer -->
          <div class="row flex-center justify-between border-top-glow q-pt-sm q-mb-sm">
            <div class="text-caption text-grey-6 row items-center">
              <q-icon name="schedule" size="14px" class="q-mr-xs" />
              {{ order.timeAgo }}
              <span class="q-mx-xs text-grey-8">|</span>
              <q-icon name="person" size="14px" class="q-mr-xs" />
              {{ order.waiterName }}
            </div>
            <div class="total-sm">LKR {{ Number(order.total_amount || 0).toLocaleString() }}</div>
          </div>

          <!-- Action: Mark Served (only shown when ready) -->
          <q-btn
            v-if="order.status === 'ready'"
            unelevated
            no-caps
            class="serve-btn full-width q-mt-sm"
            :loading="serving === order.id"
            @click="handleMarkServed(order.id)"
          >
            <q-icon name="restaurant" size="18px" class="q-mr-sm" />
            ✓ Mark as Served
          </q-btn>
        </div>
      </q-card>
    </div>

    <!-- KOT Viewer Dialog (Receipt Template) -->
    <q-dialog v-model="kotDialogOpen" transition-show="scale" transition-hide="scale">
      <q-card
        class="bg-white text-dark q-pa-md kot-receipt-card"
        style="width: 320px; border-radius: 8px"
      >
        <!-- KOT Header -->
        <div class="text-center q-mb-md" style="font-family: monospace">
          <div class="text-h6 text-weight-bolder">*** KOT ***</div>
          <div class="text-subtitle1 text-weight-bold">
            KOT #{{ selectedKOT?.kot_number || 'N/A' }}
          </div>
          <div class="text-caption text-grey-8">
            {{ new Date().toLocaleString() }}
          </div>
        </div>

        <q-separator
          color="grey-4"
          class="q-my-sm border-dashed"
          style="border-top: 2px dashed #ccc"
        />

        <div
          class="row justify-between q-mb-sm text-body2 text-weight-bold"
          style="font-family: monospace"
        >
          <div>TABLE: {{ selectedOrder?.tableNumber }}</div>
          <div>WAITER: {{ selectedOrder?.waiterName }}</div>
        </div>
        <div class="text-body2 text-weight-bold q-mb-sm" style="font-family: monospace">
          TYPE: {{ selectedOrder?.order_type?.replace('_', ' ')?.toUpperCase() || 'DINE IN' }}
        </div>

        <q-separator
          color="grey-4"
          class="q-my-sm border-dashed"
          style="border-top: 2px dashed #ccc"
        />

        <!-- Order Items -->
        <div class="q-mt-md" style="font-family: monospace; font-size: 14px">
          <div class="row justify-between text-weight-bolder q-mb-xs">
            <div class="col-2">QTY</div>
            <div class="col-10">ITEM</div>
          </div>

          <div v-for="item in activeKOTItems" :key="item.order_item_id" class="q-mb-xs">
            <div class="row">
              <div class="col-2 text-weight-bold">{{ item.quantity }}x</div>
              <div class="col-10 text-weight-medium">{{ item.name }}</div>
            </div>
            <div v-if="item.notes" class="row">
              <div class="col-2"></div>
              <div class="col-10 text-italic text-grey-8" style="font-size: 12px">
                * {{ item.notes }}
              </div>
            </div>
          </div>
        </div>

        <q-separator
          color="grey-4"
          class="q-my-md border-dashed"
          style="border-top: 2px dashed #ccc"
        />

        <div
          v-if="selectedOrder?.notes"
          class="q-mb-md"
          style="font-family: monospace; font-size: 13px"
        >
          <div class="text-weight-bold">ORDER NOTES:</div>
          <div>{{ selectedOrder.notes }}</div>
        </div>

        <div class="text-center text-weight-bolder q-mt-md" style="font-family: monospace">
          *** END KOT ***
        </div>

        <!-- Actions -->
        <div class="q-mt-lg row justify-center">
          <q-btn
            unelevated
            color="grey-3"
            text-color="dark"
            label="Close"
            v-close-popup
            class="full-width"
          />
        </div>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'

const store = useWaiterOrderStore()
const $q = useQuasar()
const serving = ref(null) // order ID currently being marked served

// KOT Dialog State
const kotDialogOpen = ref(false)
const selectedKOT = ref(null)
const selectedOrder = ref(null)

const activeKOTItems = computed(() => {
  if (!selectedKOT.value || !selectedOrder.value || !selectedKOT.value.kot_items) return []
  return selectedKOT.value.kot_items.map((kotItem) => {
    // Find the original order_item for the name and notes
    const origItem = selectedOrder.value.items.find((i) => i.id === kotItem.order_item_id)
    return {
      ...kotItem,
      name: origItem ? origItem.name : 'Unknown Item',
      notes: origItem ? origItem.notes : '',
    }
  })
})

function viewKOT(kot, order) {
  selectedKOT.value = kot
  selectedOrder.value = order
  kotDialogOpen.value = true
}

const trackingSteps = [
  { status: 'accepted', label: 'Accepted', emoji: '✅' },
  { status: 'preparing', label: 'Preparing', emoji: '👨‍🍳' },
  { status: 'ready', label: 'Ready', emoji: '🎉' },
  { status: 'served', label: 'Served', emoji: '🍽️' },
]

function getStepIndex(status) {
  const stepStatuses = trackingSteps.map((s) => s.status)
  return stepStatuses.indexOf(status)
}

function statusBadgeColor(status) {
  const map = {
    accepted: 'blue-8',
    preparing: 'orange-8',
    ready: 'green-7',
    served: 'grey-7',
  }
  return map[status] || 'grey-8'
}

function statusLabel(status) {
  const map = {
    accepted: 'Accepted',
    preparing: 'Preparing',
    ready: '🟢 READY',
    served: 'Served',
  }
  return map[status] || status
}

async function handleMarkServed(orderId) {
  serving.value = orderId
  try {
    const { success, error } = await store.markOrderServed(orderId)
    if (success) {
      $q.notify({
        type: 'positive',
        icon: 'done_all',
        message: 'Order served!',
        position: 'top-right',
        timeout: 2000,
        dense: true,
      })
    } else {
      $q.notify({
        type: 'negative',
        message: error || 'Failed to mark as served',
        position: 'top',
        timeout: 4000,
      })
    }
  } finally {
    serving.value = null
  }
}

function getItemStatusColor(status) {
  const map = {
    sent_to_kitchen: 'blue-7',
    preparing: 'orange-7',
    ready: 'green-7',
    served: 'grey-7',
    cancelled: 'red-7',
  }
  return map[status] || 'grey-7'
}

function getKotColor(status) {
  const map = {
    created: 'amber-8',
    preparing: 'blue-8',
    ready: 'green-8',
    cancelled: 'red-8',
  }
  return map[status] || 'grey-7'
}

function getKotIcon(status) {
  const map = {
    created: 'hourglass_empty',
    preparing: 'soup_kitchen',
    ready: 'check_circle',
    cancelled: 'cancel',
  }
  return map[status] || 'help'
}
</script>

<style lang="scss" scoped>
.accepted-root {
  min-height: 400px;
}

.empty-state {
  padding-top: 60px;
}

.empty-icon {
  font-size: 48px;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Ready banner */
.ready-banner {
  background: linear-gradient(135deg, #166534, #15803d);
  color: #bbf7d0;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 1.5px;
  padding: 6px 16px;
  display: flex;
  align-items: center;
  animation: bannerPulse 2s ease-in-out infinite;
}

@keyframes bannerPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.75;
  }
}

.my-order-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  }

  &.status-ready {
    border-color: rgba(34, 197, 94, 0.35);
    box-shadow: 0 0 20px rgba(34, 197, 94, 0.1);
  }

  &.status-preparing {
    border-color: rgba(249, 115, 22, 0.2);
  }
}

.status-chip {
  font-size: 0.65rem;
  letter-spacing: 0.5px;
  font-weight: 700;
  border-radius: 6px;
}

.timeline-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  padding: 0 10px;
}

.timeline-step {
  display: flex;
  align-items: center;
  flex: 1;
  position: relative;

  &:first-child {
    flex: 0;
  }
}

.step-connector {
  flex: 1;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 8px;
  margin-top: -16px;
  transition: background 0.4s ease;
}

.connector-done {
  background: #22c55e;
}

.connector-active {
  background: linear-gradient(to right, #22c55e, #f97316);
}

.step-node-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 48px;
}

.step-node {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 2;
}

.node-pending {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  .step-emoji {
    filter: grayscale(1) opacity(0.5);
  }
}

.node-active {
  background: linear-gradient(135deg, #f97316, #ef4444);
  box-shadow: 0 0 12px rgba(249, 115, 22, 0.5);
  transform: scale(1.15);
  border: none;
}

.node-done {
  background: #22c55e;
  border: none;
}

.step-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: #6b7280;
  text-align: center;
  transition: color 0.3s ease;
}

.label-active {
  color: #e2e8f0;
}

.table-badge-sm {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(249, 115, 22, 0.15);
  border: 1px solid rgba(249, 115, 22, 0.3);
  color: #fb923c;
  padding: 4px 12px;
  border-radius: 20px;
  font-weight: 800;
  font-size: 0.85rem;
}

.order-num-sm {
  font-size: 1.1rem;
  font-weight: 800;
  color: white;
}

.items-compact {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.item-row-sm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.85rem;

  &:not(:last-child) {
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }
}

.qty-sm {
  font-weight: 700;
  color: #fb923c;
  min-width: 24px;
}

.name-sm {
  color: #d1d5db;
  flex: 1;
}

.kot-row {
  padding: 6px 0;
}

.border-top-glow {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.total-sm {
  font-size: 1.05rem;
  font-weight: 800;
  color: white;
}

/* Serve button */
.serve-btn {
  background: linear-gradient(135deg, #16a34a, #22c55e) !important;
  color: white !important;
  border-radius: 12px !important;
  height: 46px;
  font-weight: 800;
  font-size: 0.9rem;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 18px rgba(34, 197, 94, 0.4);
  transition: all 0.2s ease;

  &:hover {
    box-shadow: 0 6px 24px rgba(34, 197, 94, 0.6);
    transform: translateY(-1px);
  }
}
</style>
