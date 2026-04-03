<template>
  <q-page class="waiter-page-dark">
    <!-- ── Sticky Header ─────────────────────────────── -->
    <div class="inbox-header">
      <div class="inbox-header__left">
        <q-icon name="move_to_inbox" size="20px" color="orange-8" />
        <span class="inbox-header__title">Incoming Orders</span>
      </div>
      <div class="inbox-header__right">
        <q-chip
          v-if="store.pendingCount > 0"
          dense
          color="red-6"
          text-color="white"
          class="inbox-count-chip"
        >
          {{ store.pendingCount }} pending
        </q-chip>
        <q-btn
          round flat dense
          icon="refresh"
          color="grey-6"
          size="sm"
          :loading="store.loading"
          @click="store.loadPendingOrders()"
        />
      </div>
    </div>

    <!-- ── Loading ──────────────────────────────────── -->
    <div v-if="store.loading" class="inbox-loading">
      <q-spinner-orbit size="40px" color="orange" />
    </div>

    <!-- ── Empty State ─────────────────────────────── -->
    <div v-else-if="store.pendingOrders.length === 0" class="inbox-empty">
      <div class="inbox-empty__icon">
        <q-icon name="inbox" size="36px" color="grey-4" />
      </div>
      <div class="inbox-empty__title">No pending orders</div>
      <div class="inbox-empty__sub">Orders will appear here in real time</div>
    </div>

    <!-- ── Order Cards ─────────────────────────────── -->
    <div v-else class="inbox-list">
      <div v-for="order in store.pendingOrders" :key="order.id" class="inbox-card">
        <!-- Card Header -->
        <div class="inbox-card__header">
          <div class="inbox-card__meta">
            <div class="inbox-card__order-num">#{{ order.order_number }}</div>
            <div class="inbox-card__details">
              <q-icon name="table_restaurant" size="11px" />
              Table {{ order.tableNumber || order.table_number || '—' }}
              <span class="inbox-card__dot">·</span>
              <q-icon name="schedule" size="11px" />
              {{ fmtTime(order.created_at) }}
            </div>
          </div>
          <q-chip dense color="amber-1" text-color="amber-10" icon="pending" class="inbox-status-chip">
            Waiting
          </q-chip>
        </div>

        <!-- Items with Availability Toggles -->
        <div class="inbox-card__items">
          <!-- Hint -->
          <div class="inbox-avail-hint">
            <q-icon name="touch_app" size="12px" color="grey-5" class="q-mr-xs" />
            TAP TO MARK AVAILABILITY (OPTIONAL)
          </div>

          <div
            v-for="item in order.items || order.order_items || []"
            :key="item.id"
            class="inbox-item"
            :class="{
              'inbox-item--available': getAvail(order.id, item.id) === 'available',
              'inbox-item--unavailable': getAvail(order.id, item.id) === 'unavailable',
            }"
          >
            <q-badge
              :color="getAvail(order.id, item.id) === 'unavailable' ? 'red-3' : 'grey-3'"
              :text-color="getAvail(order.id, item.id) === 'unavailable' ? 'red-9' : 'grey-8'"
              :label="item.quantity + 'x'"
              class="inbox-item__qty"
            />
            <span
              class="inbox-item__name"
              :class="{ 'inbox-item__name--strike': getAvail(order.id, item.id) === 'unavailable' }"
            >{{ item.name || item.menu_items?.name }}</span>
            <q-space />
            <span class="inbox-item__price">
              Rs. {{ ((item.unit_price || item.menu_items?.price || 0) * item.quantity).toFixed(0) }}
            </span>

            <!-- Available toggle -->
            <q-btn
              flat dense round size="xs"
              :icon="getAvail(order.id, item.id) === 'available' ? 'check_circle' : 'check_circle_outline'"
              :class="getAvail(order.id, item.id) === 'available' ? 'avail-yes--on' : 'avail-btn--off'"
              @click.stop="toggleAvail(order.id, item.id, 'available')"
            >
              <q-tooltip>Available</q-tooltip>
            </q-btn>

            <!-- Unavailable toggle -->
            <q-btn
              flat dense round size="xs"
              :icon="getAvail(order.id, item.id) === 'unavailable' ? 'cancel' : 'highlight_off'"
              :class="getAvail(order.id, item.id) === 'unavailable' ? 'avail-no--on' : 'avail-btn--off'"
              @click.stop="toggleAvail(order.id, item.id, 'unavailable')"
            >
              <q-tooltip>Unavailable</q-tooltip>
            </q-btn>
          </div>

          <!-- Unavailable summary banner -->
          <div v-if="getUnavailableCount(order.id) > 0" class="inbox-unavail-banner">
            <q-icon name="warning_amber" size="13px" class="q-mr-xs" />
            {{ getUnavailableCount(order.id) }} item(s) unavailable — will be excluded from KOT
          </div>
        </div>

        <!-- Accept Button -->
        <div class="inbox-card__footer">
          <q-btn
            unelevated no-caps
            class="inbox-accept-btn full-width"
            :color="getUnavailableCount(order.id) > 0 ? 'orange-9' : 'green-9'"
            icon="check_circle"
            :label="
              getUnavailableCount(order.id) > 0
                ? `Accept (${getUnavailableCount(order.id)} unavailable)`
                : 'Accept Order'
            "
            :loading="accepting[order.id]"
            @click="accept(order)"
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
      // RPC now handles: customer notification + order total recalculation
      if (unavailIds.length > 0 && unavailNames.length > 0) {
        $q.notify({
          type: 'warning',
          icon: 'info',
          message: `Order accepted — ${unavailNames.length} item(s) excluded from bill`,
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

// ─── Sticky Header ──────────────────────────────────────────────
.inbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  z-index: 5;
}
.inbox-header__left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.inbox-header__title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.3px;
}
.inbox-header__right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.inbox-count-chip {
  font-size: 0.68rem !important;
  font-weight: 700 !important;
  height: 22px !important;
}

// ─── Loading ────────────────────────────────────────────────────
.inbox-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
}

// ─── Empty State ────────────────────────────────────────────────
.inbox-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 72px 28px;
  text-align: center;
}
.inbox-empty__icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.inbox-empty__title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #94a3b8;
}
.inbox-empty__sub {
  font-size: 0.75rem;
  color: #cbd5e1;
  margin-top: 4px;
}

// ─── Order List ─────────────────────────────────────────────────
.inbox-list {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

// ─── Order Card ─────────────────────────────────────────────────
.inbox-card {
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  transition: border-color 0.2s, box-shadow 0.2s;

  &:hover {
    border-color: #cbd5e1;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  &__header {
    padding: 14px 16px 10px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 1px solid #f1f5f9;
  }

  &__items {
    padding: 10px 16px;
  }

  &__footer {
    padding: 10px 16px 14px;
  }
}

.inbox-card__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.inbox-card__order-num {
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.3px;
}
.inbox-card__details {
  font-size: 0.72rem;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 3px;
  font-weight: 500;
}
.inbox-card__dot {
  color: #cbd5e1;
  margin: 0 2px;
}
.inbox-status-chip {
  font-size: 0.65rem !important;
  font-weight: 700 !important;
  height: 22px !important;
}

// ─── Availability Hint ──────────────────────────────────────────
.inbox-avail-hint {
  display: flex;
  align-items: center;
  font-size: 0.6rem;
  font-weight: 600;
  color: #cbd5e1;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #f1f5f9;
}

// ─── Item Rows ──────────────────────────────────────────────────
.inbox-item {
  display: flex;
  align-items: center;
  padding: 7px 8px;
  border-radius: 8px;
  border-bottom: 1px solid #f8fafc;
  transition: all 0.2s ease;
  gap: 8px;

  &:last-child {
    border-bottom: none;
  }

  &--available {
    background: #f0fdf4;
    border-color: #dcfce7;
  }

  &--unavailable {
    background: #fef2f2;
    border-color: #fee2e2;
    opacity: 0.8;
  }
}

.inbox-item__qty {
  font-size: 0.62rem !important;
  font-weight: 700 !important;
  min-width: 26px;
  height: 20px !important;
}

.inbox-item__name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 600;
  color: #1e293b;
  transition: all 0.2s;

  &--strike {
    text-decoration: line-through;
    color: #94a3b8;
  }
}

.inbox-item__price {
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
  margin-right: 4px;
}

// ─── Toggle Buttons ─────────────────────────────────────────────
.avail-btn--off {
  color: #cbd5e1 !important;
  transition: all 0.15s;

  &:hover {
    color: #94a3b8 !important;
  }
}

.avail-yes--on {
  color: #16a34a !important;
  background: rgba(34, 197, 94, 0.12) !important;
  border-radius: 50%;
  animation: pop 0.25s ease;
}

.avail-no--on {
  color: #dc2626 !important;
  background: rgba(239, 68, 68, 0.1) !important;
  border-radius: 50%;
  animation: pop 0.25s ease;
}

@keyframes pop {
  0% { transform: scale(0.7); }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

// ─── Unavailable Banner ─────────────────────────────────────────
.inbox-unavail-banner {
  display: flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 600;
  color: #d97706;
  background: #fffbeb;
  border: 1px dashed #fcd34d;
  border-radius: 8px;
  padding: 6px 10px;
  margin-top: 8px;
}

// ─── Accept Button ──────────────────────────────────────────────
.inbox-accept-btn {
  height: 46px;
  border-radius: 12px !important;
  font-weight: 700;
  font-size: 0.88rem;
  letter-spacing: 0.2px;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
}
</style>

/* ══════════════════════════════════════════════════
   DARK MODE OVERRIDES (ShiftInboxPage)
   ══════════════════════════════════════════════════ */
<style lang="scss">
body.body--dark {
  .waiter-page-dark {
    background: #0f172a;
    color: #e2e8f0;

    .inbox-header {
      background: #1e293b;
      border-bottom-color: rgba(255, 255, 255, 0.08);
      &__title { color: #f8fafc; }
    }

    .inbox-card {
      background: #1e293b;
      border-color: rgba(255, 255, 255, 0.08);

      &__header {
        border-bottom-color: rgba(255, 255, 255, 0.08);
      }
      &__order-num { color: #f8fafc; }
      &__details { color: #94a3b8; }
      
      .inbox-status-chip {
        background: rgba(245, 158, 11, 0.1) !important;
      }
    }

    .inbox-item {
      border-bottom-color: rgba(255, 255, 255, 0.04);
      &__name { color: #e2e8f0; }
      &__name--strike { color: #64748b; }
      &__price { color: #94a3b8; }

      &--available {
        background: rgba(16, 185, 129, 0.05);
        border-color: rgba(16, 185, 129, 0.15);
      }
      &--unavailable {
        background: rgba(239, 68, 68, 0.05);
        border-color: rgba(239, 68, 68, 0.15);
      }
    }

    .inbox-unavail-banner {
      background: rgba(217, 119, 6, 0.05);
      border-color: rgba(217, 119, 6, 0.2);
    }
  }
}
</style>
