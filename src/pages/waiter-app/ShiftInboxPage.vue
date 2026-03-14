<template>
  <q-page class="waiter-page-dark">
    <!-- Toolbar -->
    <div class="inner-header q-px-md q-py-sm row items-center">
      <div class="text-weight-bold text-white">Incoming Orders</div>
      <q-space />
      <q-badge v-if="store.pendingCount > 0" color="red" class="q-px-sm">
        {{ store.pendingCount }} pending
      </q-badge>
      <q-btn round flat dense icon="refresh" color="grey-5" class="q-ml-sm"
        :loading="store.loading" @click="store.loadPendingOrders()" />
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
      <div
        v-for="order in store.pendingOrders"
        :key="order.id"
        class="order-card q-mb-md"
      >
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

        <!-- Items -->
        <div class="order-card__items">
          <div
            v-for="item in (order.items || order.order_items || [])"
            :key="item.id"
            class="item-row row items-center"
          >
            <q-badge color="grey-8" :label="item.quantity + 'x'" class="q-mr-sm item-qty" />
            <span class="text-white text-body2">{{ item.name || item.menu_items?.name }}</span>
            <q-space />
            <span class="text-grey-4 text-caption">
              Rs. {{ (((item.unit_price || item.menu_items?.price || 0)) * item.quantity).toFixed(0) }}
            </span>
          </div>
        </div>

        <!-- Accept Button -->
        <div class="order-card__footer">
          <q-btn
            unelevated
            class="accept-btn full-width"
            color="green-9"
            icon="check_circle"
            label="Accept Order"
            :loading="accepting[order.id]"
            @click="accept(order.id)"
            no-caps
          />
        </div>
      </div>
    </div>

    <div style="height: 16px" />
  </q-page>
</template>

<script setup>
import { reactive, computed } from 'vue'
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
  pendingOrders: orderStore.pendingOrders.length > 0 ? orderStore.pendingOrders : appStore.pendingOrders,
  loadPendingOrders: () => Promise.all([orderStore.fetchPendingOrders(), appStore.loadPendingOrders()]),
}))

function fmtTime(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
}

async function accept(orderId) {
  if (accepting[orderId]) return  // guard against double-tap / rapid re-render
  accepting[orderId] = true
  try {
    const result = await orderStore.acceptOrder(orderId)
    if (result.success) {
      $q.notify({ type: 'positive', message: '✅ Order accepted!', position: 'top' })
      appStore.loadPendingOrders()
      appStore.loadMyOrders()
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  } finally {
    accepting[orderId] = false
  }
}
</script>

<style lang="scss" scoped>
@import './waiter-shared.scss';
.inner-header {
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  height: 48px;
}
.order-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px;
  overflow: hidden;
  &__header {
    padding: 14px 14px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  &__items {
    padding: 10px 14px;
  }
  &__footer {
    padding: 10px 14px 14px;
  }
}
.item-row {
  padding: 4px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  &:last-child { border-bottom: none; }
}
.item-qty { font-size: 10px !important; font-weight: 700 !important; }
.accept-btn { height: 46px; border-radius: 10px !important; font-weight: 700; font-size: 14px; letter-spacing: 0.2px; }
</style>
