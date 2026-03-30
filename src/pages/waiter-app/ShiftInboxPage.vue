<template>
  <q-page class="waiter-page-dark">
    <!-- Toolbar -->
    <div class="inner-header q-px-md q-py-sm row items-center">
      <div class="text-weight-bold text-white">Incoming Orders</div>
      <q-space />
      <q-badge v-if="store.pendingCount > 0" color="red" class="q-px-sm">
        {{ store.pendingCount }} pending
      </q-badge>
      <q-btn
        round
        flat
        dense
        icon="refresh"
        color="grey-5"
        class="q-ml-sm"
        :loading="store.loading"
        @click="store.loadPendingOrders()"
      />
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="column items-center q-pa-xl">
      <q-spinner-orbit size="40px" color="orange" />
    </div>

    <!-- Empty -->
    <div v-else-if="store.pendingOrders.length === 0" class="empty-state">
      <q-icon name="inbox" size="52px" class="text-grey-7 q-mb-md" />
      <div class="text-grey-5">No pending orders</div>
      <div class="text-caption text-grey-7 q-mt-xs">Orders will appear here in real time</div>
    </div>

    <!-- Order Cards -->
    <div v-else class="q-pa-md">
      <div v-for="order in store.pendingOrders" :key="order.id" class="order-card q-mb-md">
        <!-- Card Header -->
        <div class="order-card__header row items-center">
          <div class="col">
            <div class="text-white text-weight-bold text-subtitle2">#{{ order.order_number }}</div>
            <div class="text-caption text-grey-5">
              <q-icon name="table_restaurant" size="11px" class="q-mr-xs" />
              Table {{ order.tableNumber || order.table_number || '—' }}
              <span class="q-mx-xs text-grey-7">·</span>
              <q-icon name="schedule" size="11px" class="q-mr-xs" />
              {{ fmtTime(order.created_at) }}
            </div>
          </div>
          <q-chip dense color="amber-9" text-color="white" icon="pending" class="text-caption">
            Waiting
          </q-chip>
        </div>

        <!-- Items with Availability Toggles -->
        <div class="order-card__items">
          <!-- Hint -->
          <div class="avail-hint row items-center q-mb-sm">
            <q-icon name="touch_app" size="12px" color="grey-6" class="q-mr-xs" />
            <span class="text-grey-7" style="font-size: 0.65rem; letter-spacing: 0.5px"
              >TAP TO MARK AVAILABILITY (OPTIONAL)</span
            >
          </div>

          <div
            v-for="item in order.items || order.order_items || []"
            :key="item.id"
            class="item-row row items-center"
            :class="{
              'item-row--available': getAvail(order.id, item.id) === 'available',
              'item-row--unavailable': getAvail(order.id, item.id) === 'unavailable',
            }"
          >
            <q-badge color="grey-8" :label="item.quantity + 'x'" class="q-mr-sm item-qty" />
            <span
              class="text-body2 item-name"
              :class="{
                'text-white': getAvail(order.id, item.id) !== 'unavailable',
                'text-grey-6 item-name--strike': getAvail(order.id, item.id) === 'unavailable',
              }"
              >{{ item.name || item.menu_items?.name }}</span
            >
            <q-space />
            <span class="text-grey-4 text-caption q-mr-sm">
              Rs.
              {{ ((item.unit_price || item.menu_items?.price || 0) * item.quantity).toFixed(0) }}
            </span>

            <!-- Available toggle -->
            <q-btn
              flat
              dense
              round
              size="xs"
              :icon="
                getAvail(order.id, item.id) === 'available'
                  ? 'check_circle'
                  : 'check_circle_outline'
              "
              :class="
                getAvail(order.id, item.id) === 'available' ? 'avail-yes--on' : 'avail-btn--off'
              "
              @click.stop="toggleAvail(order.id, item.id, 'available')"
            >
              <q-tooltip class="bg-dark">Available</q-tooltip>
            </q-btn>

            <!-- Unavailable toggle -->
            <q-btn
              flat
              dense
              round
              size="xs"
              :icon="getAvail(order.id, item.id) === 'unavailable' ? 'cancel' : 'highlight_off'"
              :class="
                getAvail(order.id, item.id) === 'unavailable' ? 'avail-no--on' : 'avail-btn--off'
              "
              @click.stop="toggleAvail(order.id, item.id, 'unavailable')"
            >
              <q-tooltip class="bg-dark">Unavailable</q-tooltip>
            </q-btn>
          </div>

          <!-- Unavailable summary banner -->
          <div v-if="getUnavailableCount(order.id) > 0" class="unavail-banner q-mt-sm">
            <q-icon name="warning_amber" size="13px" class="q-mr-xs" />
            {{ getUnavailableCount(order.id) }} item(s) unavailable — will be excluded from KOT
          </div>
        </div>

        <!-- Accept Button -->
        <div class="order-card__footer">
          <q-btn
            unelevated
            class="accept-btn full-width"
            :color="getUnavailableCount(order.id) > 0 ? 'orange-9' : 'green-9'"
            icon="check_circle"
            :label="
              getUnavailableCount(order.id) > 0
                ? `Accept (${getUnavailableCount(order.id)} unavailable)`
                : 'Accept Order'
            "
            :loading="accepting[order.id]"
            @click="accept(order)"
            no-caps
          />
        </div>
      </div>
    </div>

    <div style="height: 16px" />
  </q-page>
</template>

<script setup>
import { reactive, computed, ref } from 'vue'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'

const appStore = useWaiterAppStore()
const orderStore = useWaiterOrderStore()
const $q = useQuasar()
const accepting = reactive({})

// Use waiterOrderStore (shift-aware RPC) as primary source, fallback to appStore
const store = computed(() => ({
  loading: appStore.loading || orderStore.loading,
  pendingCount: Math.max(appStore.pendingCount, orderStore.pendingCount),
  pendingOrders:
    orderStore.pendingOrders.length > 0 ? orderStore.pendingOrders : appStore.pendingOrders,
  loadPendingOrders: () =>
    Promise.all([orderStore.fetchPendingOrders(), appStore.loadPendingOrders()]),
}))

// ── Per-order item availability state ──────────────────────────
// Map: { [orderId]: { [itemId]: 'available' | 'unavailable' | null } }
const availability = ref({})

function getAvail(orderId, itemId) {
  return availability.value[orderId]?.[itemId] || null
}

function toggleAvail(orderId, itemId, status) {
  if (!availability.value[orderId]) {
    availability.value[orderId] = {}
  }
  // Toggle off if same button clicked again
  if (availability.value[orderId][itemId] === status) {
    availability.value[orderId][itemId] = null
  } else {
    availability.value[orderId][itemId] = status
  }
}

function getUnavailableCount(orderId) {
  const avail = availability.value[orderId]
  if (!avail) return 0
  return Object.values(avail).filter((v) => v === 'unavailable').length
}

function getUnavailableItemIds(orderId) {
  const avail = availability.value[orderId]
  if (!avail) return []
  return Object.entries(avail)
    .filter(([, v]) => v === 'unavailable')
    .map(([id]) => id)
}

function getUnavailableItemNames(order) {
  const ids = getUnavailableItemIds(order.id)
  const items = order.items || order.order_items || []
  return items.filter((i) => ids.includes(i.id)).map((i) => i.name || i.menu_items?.name)
}

// ─────────────────────────────────────────────────────────────
function fmtTime(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
}

async function accept(order) {
  const orderId = order.id
  if (accepting[orderId]) return
  accepting[orderId] = true

  try {
    const unavailIds = getUnavailableItemIds(orderId)
    const unavailNames = getUnavailableItemNames(order)

    // Pass unavailable IDs directly to the store — the RPC will mark availability
    // and generate KOTs atomically in a single DB transaction (no race conditions)
    const result = await orderStore.acceptOrder(orderId, unavailIds.length > 0 ? unavailIds : null)

    if (result.success) {
      // Notify customer about unavailable items via order_notifications table
      if (unavailIds.length > 0 && unavailNames.length > 0) {
        try {
          await supabase.from('order_notifications').insert({
            order_id: orderId,
            notification_type: 'item_unavailable',
            title: 'Items Unavailable',
            message: `Sorry, the following items are currently unavailable: ${unavailNames.join(', ')}. They have been removed from your order.`,
            is_read: false,
          })
        } catch (e) {
          console.warn('Could not send customer notification:', e)
        }

        $q.notify({
          type: 'warning',
          icon: 'info',
          message: `Order accepted — ${unavailNames.length} item(s) excluded from KOT`,
          caption: unavailNames.join(', '),
          position: 'top',
          timeout: 5000,
        })
      } else {
        $q.notify({ type: 'positive', message: '✅ Order accepted!', position: 'top' })
      }

      // Clean up local availability state for this order
      delete availability.value[orderId]
      appStore.loadPendingOrders()
      appStore.loadMyOrders()
    } else {
      $q.notify({ type: 'negative', message: result.error || 'Failed to accept', position: 'top' })
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'Error accepting order', position: 'top' })
  } finally {
    accepting[orderId] = false
  }
}
</script>

<style lang="scss" scoped>
@import './waiter-shared.scss';

.inner-header {
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  height: 48px;
}

.order-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  overflow: hidden;
  transition: border-color 0.2s;

  &__header {
    padding: 14px 14px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  &__items {
    padding: 10px 14px;
  }

  &__footer {
    padding: 10px 14px 14px;
  }
}

// Hint text
.avail-hint {
  opacity: 0.6;
}

// Item rows
.item-row {
  padding: 5px 6px;
  border-radius: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  transition: all 0.2s ease;

  &:last-child {
    border-bottom: none;
  }

  &--available {
    background: rgba(34, 197, 94, 0.07);
    border-color: rgba(34, 197, 94, 0.1);
  }

  &--unavailable {
    background: rgba(239, 68, 68, 0.07);
    border-color: rgba(239, 68, 68, 0.1);
    opacity: 0.75;
  }
}

.item-qty {
  font-size: 10px !important;
  font-weight: 700 !important;
}

.item-name {
  flex: 1;
  font-size: 0.875rem;
  transition: all 0.2s;

  &--strike {
    text-decoration: line-through;
  }
}

// Toggle buttons
.avail-btn--off {
  color: rgba(255, 255, 255, 0.2) !important;
  transition: all 0.15s;

  &:hover {
    color: rgba(255, 255, 255, 0.5) !important;
  }
}

.avail-yes--on {
  color: #22c55e !important;
  background: rgba(34, 197, 94, 0.15) !important;
  border-radius: 50%;
  animation: pop 0.25s ease;
}

.avail-no--on {
  color: #ef4444 !important;
  background: rgba(239, 68, 68, 0.15) !important;
  border-radius: 50%;
  animation: pop 0.25s ease;
}

@keyframes pop {
  0% {
    transform: scale(0.7);
  }
  60% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

// Unavailable banner
.unavail-banner {
  display: flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 600;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
  border: 1px dashed rgba(245, 158, 11, 0.35);
  border-radius: 8px;
  padding: 5px 10px;
}

// Accept button
.accept-btn {
  height: 46px;
  border-radius: 10px !important;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.2px;
  transition: all 0.2s;
}

// Empty state
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  text-align: center;
}
</style>
