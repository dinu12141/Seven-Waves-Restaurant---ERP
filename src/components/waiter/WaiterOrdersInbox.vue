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

        <!-- Items Preview -->
        <div class="items-preview q-mx-md q-my-sm">
          <div v-for="item in order.items.slice(0, 4)" :key="item.id" class="item-row">
            <span class="item-qty">{{ item.quantity }}×</span>
            <span class="item-name">
              {{ item.name }}
              <span v-if="item.kitchenName" class="kitchen-remark-sm">
                • {{ item.kitchenName }}
                <template
                  v-if="item.categoryName && item.categoryName.toLowerCase() !== item.kitchenName.toLowerCase()"
                >
                  ({{ item.categoryName }})
                </template>
              </span>
            </span>
            <span v-if="item.notes" class="item-note">
              <q-icon name="sticky_note_2" size="12px" /> {{ item.notes }}
            </span>
          </div>
          <div v-if="order.items.length > 4" class="text-caption text-grey-6 q-mt-xs">
            +{{ order.items.length - 4 }} more items
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
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import { useQuasar } from 'quasar'
import { watch } from 'vue'

const store = useWaiterOrderStore()
const $q = useQuasar()

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
      // Optional: Play sound if user desires later
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
  const { success, error } = await store.acceptOrder(order.id)

  if (success) {
    // No notification needed for professional ERP - card moves automatically
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

.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 0.85rem;

  &:not(:last-child) {
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
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
