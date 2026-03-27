<template>
  <div class="inbox-root">
    <!-- Empty State -->
    <div
      v-if="!store.loading && store.pendingOrders.length === 0"
      class="empty-state column items-center q-pa-xl"
    >
      <div class="empty-icon">🔔</div>
      <div class="text-h6 text-grey-3 q-mt-md">No Pending Orders</div>
      <div class="text-body2 text-grey-6 q-mt-xs text-center" style="max-width: 300px">
        New QR orders will appear here in real-time. Stay tuned!
      </div>
      <q-spinner-dots v-if="store.isOnShift" color="primary" size="32px" class="q-mt-lg" />
    </div>

    <!-- Orders List -->
    <transition-group name="order-card" tag="div" class="orders-list q-pa-md q-gutter-y-md">
      <q-card v-for="order in store.pendingOrders" :key="order.id" class="order-card">
        <!-- Header Row -->
        <div class="card-header row items-center no-wrap q-pa-md q-pb-sm">
          <div class="table-badge">
            <q-icon name="table_restaurant" size="16px" />
            <span>{{ order.tableNumber }}</span>
          </div>

          <q-space />

          <div class="order-meta">
            <q-chip
              dense
              size="sm"
              class="source-chip"
              :icon="getSourceIcon(order.order_source)"
              :label="order.order_source?.toUpperCase()"
            />
            <span class="time-ago">{{ order.timeAgo }}</span>
          </div>
        </div>

        <!-- Order Number -->
        <div class="q-px-md">
          <div class="text-overline text-grey-6 letter-sp">ORDER</div>
          <div class="order-number">#{{ order.order_number }}</div>
        </div>

        <!-- Items Preview with Availability Toggles -->
        <div class="items-preview q-mx-md q-my-sm">
          <div class="items-header row items-center q-mb-xs">
            <span
              class="text-caption text-grey-5 text-weight-bold text-uppercase"
              style="letter-spacing: 1px"
              >ORDER ITEMS</span
            >
            <q-space />
            <span class="text-caption text-grey-6" style="font-size: 0.65rem"
              >Tap to check availability</span
            >
          </div>
          <div
            v-for="item in order.items"
            :key="item.id"
            class="item-row"
            :class="{
              'item-row--unavailable': getItemAvailability(order.id, item.id) === 'unavailable',
              'item-row--available': getItemAvailability(order.id, item.id) === 'available',
            }"
          >
            <span class="item-qty">{{ item.quantity }}×</span>
            <span
              class="item-name"
              :class="{
                'item-name--strike': getItemAvailability(order.id, item.id) === 'unavailable',
              }"
            >
              {{ item.name }}
              <span v-if="item.kitchenName" class="kitchen-remark-sm">
                • {{ item.kitchenName }}
                <template
                  v-if="
                    item.categoryName &&
                    item.categoryName.toLowerCase() !== item.kitchenName.toLowerCase()
                  "
                >
                  ({{ item.categoryName }})
                </template>
              </span>
            </span>
            <span v-if="item.notes" class="item-note">
              <q-icon name="sticky_note_2" size="12px" /> {{ item.notes }}
            </span>

            <!-- Availability Toggle Buttons -->
            <div class="avail-toggle-group">
              <q-btn
                flat
                dense
                round
                size="xs"
                :icon="
                  getItemAvailability(order.id, item.id) === 'available'
                    ? 'check_circle'
                    : 'check_circle_outline'
                "
                :class="
                  getItemAvailability(order.id, item.id) === 'available'
                    ? 'avail-btn--active-yes'
                    : 'avail-btn--inactive'
                "
                @click.stop="toggleAvailability(order.id, item.id, 'available')"
              >
                <q-tooltip>Available</q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                round
                size="xs"
                :icon="
                  getItemAvailability(order.id, item.id) === 'unavailable'
                    ? 'cancel'
                    : 'highlight_off'
                "
                :class="
                  getItemAvailability(order.id, item.id) === 'unavailable'
                    ? 'avail-btn--active-no'
                    : 'avail-btn--inactive'
                "
                @click.stop="toggleAvailability(order.id, item.id, 'unavailable')"
              >
                <q-tooltip>Unavailable</q-tooltip>
              </q-btn>
            </div>
          </div>

          <!-- Unavailable Summary -->
          <div v-if="getUnavailableCount(order.id) > 0" class="unavailable-summary q-mt-sm">
            <q-icon name="warning_amber" size="14px" class="q-mr-xs" />
            {{ getUnavailableCount(order.id) }} item(s) marked unavailable — will be excluded from
            KOT
          </div>
        </div>

        <!-- KOT Preview -->
        <div v-if="order.kot_tickets?.length" class="kot-preview q-mx-md q-mb-sm">
          <div class="row q-gutter-xs">
            <q-chip
              v-for="kot in order.kot_tickets"
              :key="kot.id"
              dense
              size="xs"
              :color="getKotBadge(kot)"
              text-color="white"
            >
              KOT #{{ kot.kot_number }}
            </q-chip>
          </div>
        </div>

        <!-- Notes -->
        <div v-if="order.notes" class="order-notes q-mx-md q-mb-sm">
          <q-icon name="notes" size="14px" class="q-mr-xs" />
          {{ order.notes }}
        </div>

        <!-- Footer -->
        <div class="card-footer row items-center q-pa-md q-pt-sm">
          <div class="order-total">
            <div class="text-caption text-grey-6">Total</div>
            <div class="total-amount">
              LKR {{ Number(order.total_amount || 0).toLocaleString() }}
            </div>
          </div>

          <q-space />

          <q-btn
            unelevated
            no-caps
            class="accept-btn"
            :loading="store.accepting === order.id"
            @click="handleAccept(order)"
          >
            <q-icon name="check_circle" size="18px" class="q-mr-xs" />
            Accept
          </q-btn>
        </div>
      </q-card>
    </transition-group>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import { useQuasar } from 'quasar'
import { watch } from 'vue'
import { supabase } from 'src/boot/supabase'

const store = useWaiterOrderStore()
const $q = useQuasar()

// ── Availability tracking per order ──────────────────────────────
// Map: { [orderId]: { [itemId]: 'available' | 'unavailable' | null } }
const itemAvailability = ref({})

function getItemAvailability(orderId, itemId) {
  return itemAvailability.value[orderId]?.[itemId] || null
}

function toggleAvailability(orderId, itemId, status) {
  if (!itemAvailability.value[orderId]) {
    itemAvailability.value[orderId] = {}
  }
  // Toggle: if already same status, clear it (back to unchecked)
  if (itemAvailability.value[orderId][itemId] === status) {
    itemAvailability.value[orderId][itemId] = null
  } else {
    itemAvailability.value[orderId][itemId] = status
  }
}

function getUnavailableCount(orderId) {
  const avail = itemAvailability.value[orderId]
  if (!avail) return 0
  return Object.values(avail).filter((v) => v === 'unavailable').length
}

function getUnavailableItemIds(orderId) {
  const avail = itemAvailability.value[orderId]
  if (!avail) return []
  return Object.entries(avail)
    .filter(([, v]) => v === 'unavailable')
    .map(([id]) => id)
}

function getUnavailableItemNames(order) {
  const unavailIds = getUnavailableItemIds(order.id)
  return order.items.filter((i) => unavailIds.includes(i.id)).map((i) => i.name)
}

// Watch for new orders to notify the waiter
watch(
  () => store.pendingOrders.length,
  (newLen, oldLen) => {
    if (newLen > oldLen) {
      $q.notify({
        message: `New Order: Table ${store.pendingOrders[newLen - 1]?.tableNumber}`,
        color: 'orange-9',
        icon: 'notification_important',
        position: 'top-right',
        timeout: 5000,
        dense: true,
        actions: [{ icon: 'close', color: 'white', size: 'sm' }],
      })
    }
  },
)

function getSourceIcon(source) {
  const map = {
    qr: 'qr_code_2',
    pos: 'point_of_sale',
    website: 'language',
    uber_eats: 'delivery_dining',
    pickme: 'two_wheeler',
  }
  return map[source] || 'receipt_long'
}

function getKotBadge(kot) {
  const map = {
    created: 'amber-8',
    preparing: 'blue-8',
    ready: 'green-8',
  }
  return map[kot.status] || 'grey-7'
}

async function handleAccept(order) {
  const unavailableIds = getUnavailableItemIds(order.id)
  const unavailableNames = getUnavailableItemNames(order)

  // Pass unavailable IDs directly to the store — the RPC will mark
  // availability_status and generate KOTs atomically (no race conditions)
  const { success, error } = await store.acceptOrder(
    order.id,
    unavailableIds.length > 0 ? unavailableIds : null,
  )

  if (success) {
    // Notify customer about unavailable items
    if (unavailableIds.length > 0 && unavailableNames.length > 0) {
      try {
        await supabase.from('order_notifications').insert({
          order_id: order.id,
          notification_type: 'item_unavailable',
          title: 'Items Unavailable',
          message: `Sorry, the following items are currently unavailable: ${unavailableNames.join(', ')}. They have been removed from your order.`,
          is_read: false,
        })
      } catch (notifyErr) {
        console.warn('Could not create customer notification:', notifyErr)
      }

      $q.notify({
        type: 'warning',
        icon: 'info',
        message: `Order accepted. ${unavailableNames.length} unavailable item(s) excluded from KOT.`,
        caption: unavailableNames.join(', '),
        position: 'top',
        timeout: 5000,
      })
    }

    // Clear availability tracking for this order
    delete itemAvailability.value[order.id]
  } else {
    $q.notify({
      type: 'negative',
      message: error || 'Failed to accept order',
      icon: 'error',
      position: 'top',
    })
  }
}
</script>

<style lang="scss" scoped>
.inbox-root {
  min-height: 400px;
}

.empty-state {
  padding-top: 80px;
}

.empty-icon {
  font-size: 56px;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: rgba(249, 115, 22, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.orders-list {
  display: flex;
  flex-direction: column;
}

.order-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s ease;

  &:hover {
    border-color: rgba(249, 115, 22, 0.3);
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
  }
}

.table-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(249, 115, 22, 0.12);
  border: 1px solid rgba(249, 115, 22, 0.25);
  color: #fb923c;
  padding: 4px 12px;
  border-radius: 20px;
  font-weight: 700;
  font-size: 0.85rem;
}

.order-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-chip {
  background: rgba(255, 255, 255, 0.06) !important;
  color: #9ca3af !important;
  font-size: 0.65rem;
  letter-spacing: 1px;
}

.time-ago {
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 500;
}

.letter-sp {
  letter-spacing: 2px;
  font-size: 0.6rem;
}

.order-number {
  font-size: 1.4rem;
  font-weight: 800;
  color: white;
  letter-spacing: -0.5px;
}

.items-preview {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.items-header {
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  margin-bottom: 4px;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 0.85rem;
  transition: all 0.2s ease;
  border-radius: 6px;

  &:not(:last-child) {
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }

  &--available {
    background: rgba(34, 197, 94, 0.06);
    padding-left: 6px;
    padding-right: 6px;
  }

  &--unavailable {
    background: rgba(239, 68, 68, 0.08);
    padding-left: 6px;
    padding-right: 6px;
    opacity: 0.7;
  }
}

.item-qty {
  font-weight: 700;
  color: #fb923c;
  min-width: 28px;
  font-size: 0.82rem;
}

.item-name {
  color: #d1d5db;
  flex: 1;
  transition: all 0.2s;

  &--strike {
    text-decoration: line-through;
    color: #6b7280;
  }
}

.item-note {
  font-size: 0.72rem;
  color: #6b7280;
  font-style: italic;
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// Availability toggle buttons
.avail-toggle-group {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.avail-btn--inactive {
  color: #4b5563 !important;
  opacity: 0.5;
  transition: all 0.2s;

  &:hover {
    opacity: 1;
  }
}

.avail-btn--active-yes {
  color: #22c55e !important;
  background: rgba(34, 197, 94, 0.15) !important;
  opacity: 1;
  animation: avail-pop 0.3s ease;
}

.avail-btn--active-no {
  color: #ef4444 !important;
  background: rgba(239, 68, 68, 0.15) !important;
  opacity: 1;
  animation: avail-pop 0.3s ease;
}

@keyframes avail-pop {
  0% {
    transform: scale(0.8);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

.unavailable-summary {
  display: flex;
  align-items: center;
  font-size: 0.72rem;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
  border: 1px dashed rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  padding: 6px 10px;
  font-weight: 600;
}

.order-notes {
  font-size: 0.8rem;
  color: #9ca3af;
  background: rgba(245, 158, 11, 0.06);
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px dashed rgba(245, 158, 11, 0.2);
}

.order-total {
  line-height: 1.2;
}

.total-amount {
  font-size: 1.1rem;
  font-weight: 800;
  color: white;
}

.accept-btn {
  background: linear-gradient(135deg, #22c55e, #16a34a) !important;
  color: white !important;
  border-radius: 12px;
  padding: 8px 24px;
  font-weight: 700;
  font-size: 0.9rem;
  min-height: 42px;
  box-shadow: 0 4px 16px rgba(34, 197, 94, 0.35);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 24px rgba(34, 197, 94, 0.5);
  }
}

// Transition
.order-card-enter-active {
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.order-card-leave-active {
  transition: all 0.3s ease-out;
}
.order-card-enter-from {
  opacity: 0;
  transform: translateX(-30px) scale(0.95);
}
.order-card-leave-to {
  opacity: 0;
  transform: translateX(30px) scale(0.95);
}

.kitchen-remark-sm {
  font-size: 0.68rem;
  font-weight: 700;
  color: #f97316;
  opacity: 0.8;
  margin-left: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
