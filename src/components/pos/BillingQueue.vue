<template>
  <div class="billing-queue column full-height">
    <!-- Header -->
    <div class="queue-header q-pa-md row items-center justify-between">
      <div class="row items-center">
        <q-icon name="receipt_long" color="orange-8" size="20px" class="q-mr-sm" />
        <span class="text-subtitle1 text-white text-weight-bold">Billing Queue</span>
      </div>
      <q-btn flat round dense icon="refresh" color="grey-5" @click="store.fetchBillingOrders()" />
    </div>

    <q-separator color="grey-9" />

    <!-- List -->
    <q-scroll-area class="col q-px-md q-py-sm">
      <div v-if="store.loading" class="column items-center q-pa-xl">
        <q-spinner-dots color="primary" size="40px" />
      </div>

      <div
        v-else-if="store.billingOrders.length === 0"
        class="column items-center justify-center q-pa-xl text-grey-6"
      >
        <q-icon name="upcoming" size="48px" style="opacity: 0.2" class="q-mb-sm" />
        <div class="text-caption">No active orders found</div>
      </div>

      <div v-else class="q-gutter-y-sm">
        <div
          v-for="order in store.billingOrders"
          :key="order.id"
          class="queue-item q-pa-sm"
          @click="$emit('select', order)"
        >
          <div class="row justify-between items-center q-mb-xs">
            <span class="order-num">#{{ order.order_number }}</span>
            <q-badge :color="getStatusColor(order.status)" dense class="status-badge">
              {{ order.status }}
            </q-badge>
          </div>

          <div class="row items-center text-caption text-grey-5 q-mb-xs">
            <q-icon name="table_restaurant" size="12px" class="q-mr-xs" />
            <span>{{ order.tableNumber }}</span>
            <span class="q-mx-xs">·</span>
            <q-icon name="person" size="12px" class="q-mr-xs" />
            <span>{{ order.waiterName }}</span>
          </div>

          <div class="row justify-between items-center">
            <div class="item-count text-grey-7">{{ order.order_items.length }} items</div>
            <div class="total-val">LKR {{ parseFloat(order.total_amount).toLocaleString() }}</div>
          </div>
        </div>
      </div>
    </q-scroll-area>
  </div>
</template>

<script setup>
import { useCashierStore } from 'src/stores/cashierStore'

const store = useCashierStore()

defineEmits(['select'])

function getStatusColor(status) {
  const map = {
    accepted: 'orange-9',
    preparing: 'blue-8',
    ready: 'green-8',
    served: 'teal-8',
    invoiced: 'indigo-8',
  }
  return map[status] || 'grey-8'
}
</script>

<style scoped lang="scss">
.billing-queue {
  background: #11111a;
  color: white;
}

.queue-header {
  background: rgba(255, 255, 255, 0.02);
}

.queue-item {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(33, 150, 243, 0.3);
    transform: translateY(-2px);
  }
}

.order-num {
  font-weight: 800;
  letter-spacing: -0.5px;
  color: #fff;
}

.status-badge {
  font-size: 0.6rem;
  text-transform: uppercase;
  font-weight: 700;
  padding: 1px 6px;
}

.total-val {
  font-weight: 700;
  color: #fb923c;
}

.item-count {
  font-size: 0.7rem;
}
</style>
