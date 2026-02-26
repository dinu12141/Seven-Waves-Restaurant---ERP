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
        <!-- Status Strip -->
        <div class="status-strip" :class="`strip-${order.status}`">
          <q-icon :name="getStatusIcon(order.status)" size="14px" />
          <span>{{ getStatusLabel(order.status) }}</span>
        </div>

        <!-- Card Body -->
        <div class="q-pa-md">
          <!-- Header -->
          <div class="row items-center no-wrap q-mb-sm">
            <div class="table-badge-sm">
              <q-icon name="table_restaurant" size="14px" />
              {{ order.tableNumber }}
            </div>
            <q-space />
            <div class="order-num-sm">#{{ order.order_number }}</div>
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
          <div v-if="order.kot_tickets && order.kot_tickets.length > 0" class="kot-row q-mb-sm">
            <div
              class="text-overline text-grey-7 q-mb-xs"
              style="font-size: 0.6rem; letter-spacing: 1.5px"
            >
              KOT STATUS
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
                {{ kot.status }}
              </q-chip>
            </div>
          </div>

          <!-- Footer -->
          <div class="row items-center">
            <div class="text-caption text-grey-6">
              <q-icon name="schedule" size="12px" class="q-mr-xs" />
              {{ order.timeAgo }}
            </div>
            <q-space />
            <div class="total-sm">LKR {{ Number(order.total_amount || 0).toLocaleString() }}</div>
          </div>
        </div>
      </q-card>
    </div>
  </div>
</template>

<script setup>
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'

const store = useWaiterOrderStore()

function getStatusIcon(status) {
  const map = {
    accepted: 'thumb_up',
    preparing: 'restaurant',
    ready: 'check_circle',
  }
  return map[status] || 'pending'
}

function getStatusLabel(status) {
  const map = {
    accepted: 'Accepted — Sent to Kitchen',
    preparing: 'Being Prepared',
    ready: 'Ready to Serve!',
  }
  return map[status] || status
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

.my-order-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.12);
  }
}

.status-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.strip-accepted {
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
  border-bottom: 1px solid rgba(34, 197, 94, 0.15);
}

.strip-preparing {
  background: rgba(249, 115, 22, 0.12);
  color: #fb923c;
  border-bottom: 1px solid rgba(249, 115, 22, 0.15);
}

.strip-ready {
  background: rgba(139, 92, 246, 0.12);
  color: #a78bfa;
  border-bottom: 1px solid rgba(139, 92, 246, 0.15);
  animation: readyPulse 2s ease-in-out infinite;
}

@keyframes readyPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

.table-badge-sm {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(249, 115, 22, 0.1);
  color: #fb923c;
  padding: 3px 10px;
  border-radius: 16px;
  font-weight: 700;
  font-size: 0.8rem;
}

.order-num-sm {
  font-size: 1rem;
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
  gap: 6px;
  padding: 3px 0;
  font-size: 0.82rem;

  &:not(:last-child) {
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }
}

.qty-sm {
  font-weight: 700;
  color: #fb923c;
  min-width: 24px;
  font-size: 0.78rem;
}

.name-sm {
  color: #d1d5db;
  flex: 1;
}

.kot-row {
  padding: 6px 0;
}

.total-sm {
  font-size: 0.95rem;
  font-weight: 800;
  color: white;
}
</style>
