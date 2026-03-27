<template>
  <div class="column full-height bg-dark text-white">
    <!-- Header -->
    <div class="row items-center q-pa-md border-bottom bg-header">
      <div class="text-h6 text-weight-bolder">Active Orders</div>
      <q-space />
      <q-btn
        flat
        round
        dense
        icon="close"
        size="sm"
        @click="$emit('close')"
        class="text-grey-5 hover-white"
      />
    </div>

    <!-- Empty State -->
    <div v-if="orders.length === 0 && !loading" class="col flex flex-center text-center q-pa-xl">
      <div>
        <q-icon name="history" size="64px" class="text-grey-8 q-mb-md" />
        <div class="text-h6 text-grey-5 font-bold">No active orders</div>
        <div class="text-caption text-grey-7 q-mt-sm">
          Place an order to see its progress here in real-time.
        </div>
      </div>
    </div>

    <!-- Orders List -->
    <q-scroll-area v-else class="col q-px-md q-py-sm">
      <div v-if="loading" class="flex flex-center q-pa-lg">
        <q-spinner-dots color="primary" size="40px" />
      </div>

      <q-list v-else separator>
        <q-card
          v-for="order in orders"
          :key="order.id"
          class="q-mb-md bg-grey-10 order-card overflow-hidden"
          flat
        >
          <q-card-section class="q-pa-md">
            <div class="row justify-between items-start q-mb-sm">
              <div>
                <div class="text-caption text-grey-5 font-mono uppercase">
                  Order #{{ order.order_number || order.id.substring(0, 8) }}
                </div>
                <div class="text-subtitle1 text-weight-bold text-white q-mt-xs">
                  {{ formatDate(order.created_at) }}
                </div>
              </div>
              <q-chip
                :color="getStatusColor(order.status)"
                text-color="white"
                class="text-weight-bold status-chip"
                size="sm"
              >
                {{ formatStatus(order.status) }}
              </q-chip>
            </div>

            <!-- Progress Stepper (Mini) -->
            <div class="q-mt-md q-mb-lg">
              <div class="progress-track">
                <div
                  class="progress-fill"
                  :style="{ width: getStatusProgress(order.status) + '%' }"
                  :class="getStatusColor(order.status)"
                ></div>
                <div class="row justify-between progress-steps">
                  <div
                    v-for="step in progressSteps"
                    :key="step.key"
                    class="progress-step"
                    :class="{ 'is-active': isStepActive(order.status, step.key) }"
                  >
                    <q-icon :name="step.icon" size="14px" />
                    <q-tooltip>{{ step.label }}</q-tooltip>
                  </div>
                </div>
              </div>
            </div>

            <q-separator dark class="q-my-md opacity-05" />

            <!-- Items Brief -->
            <div class="text-caption text-grey-4 q-mb-xs">Items Recap:</div>
            <div class="items-list q-gutter-y-xs">
              <div
                v-for="item in order.items || order.order_items"
                :key="item.id"
                class="row justify-between text-caption"
              >
                <span class="text-white"
                  >{{ item.quantity }}x {{ item.item_name || item.menu_items?.name }}</span
                >
                <span class="text-grey-5 font-mono"
                  >LKR
                  {{ Math.round(item.unit_price * item.quantity).toLocaleString('en-LK') }}</span
                >
              </div>
            </div>

            <div
              class="row justify-between q-mt-md text-weight-bold text-subtitle1 border-top-dashed q-pt-sm"
            >
              <span>Total Amount</span>
              <span class="text-primary font-mono"
                >LKR {{ Math.round(order.total_amount).toLocaleString('en-LK') }}</span
              >
            </div>
          </q-card-section>

          <!-- Waiter Info if Assigned -->
          <div v-if="order.profiles" class="bg-primary-dark q-pa-sm row items-center no-wrap">
            <q-avatar size="24px" color="blue-9" text-color="white" class="q-mr-sm">
              {{ order.profiles.full_name.charAt(0) }}
            </q-avatar>
            <span class="text-caption text-white text-weight-medium">
              {{ order.status === 'served' ? 'Order served by' : 'Awaiting' }}
              {{ order.profiles.full_name }}
              {{ order.status === 'served' ? '✅' : 'to serve' }}
            </span>
          </div>
        </q-card>
      </q-list>
    </q-scroll-area>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted, inject } from 'vue'
import { supabase } from 'src/boot/supabase'
import { date, useQuasar } from 'quasar'

const $q = useQuasar()

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
})

// No emit needed if using @click="$emit('close')" in template
const { tableUuid, sessionToken } = inject('touchMenuState')

const orders = ref([])
const loading = ref(true)
let realTimeSubscription = null
let notificationChannel = null

const progressSteps = [
  { key: 'pending_waiter', label: 'Ordered', icon: 'send' },
  { key: 'accepted', label: 'Confirmed', icon: 'check_circle' },
  { key: 'preparing', label: 'Cooking', icon: 'restaurant' },
  { key: 'ready', label: 'Ready', icon: 'notifications_active' },
  { key: 'served', label: 'Served', icon: 'done_all' },
]

function formatDate(d) {
  return date.formatDate(d, 'MMM DD, hh:mm A')
}

function getStatusColor(status) {
  switch (status) {
    case 'pending_waiter':
      return 'orange'
    case 'accepted':
      return 'blue'
    case 'preparing':
      return 'indigo'
    case 'ready':
      return 'green'
    case 'served':
      return 'positive'
    default:
      return 'grey'
  }
}

function formatStatus(status) {
  return status.replace('_', ' ').toUpperCase()
}

function getStatusProgress(status) {
  const map = {
    pending_waiter: 20,
    accepted: 40,
    preparing: 60,
    ready: 85,
    served: 100,
  }
  return map[status] || 0
}

function isStepActive(currentStatus, stepKey) {
  const steps = progressSteps.map((s) => s.key)
  const currentIdx = steps.indexOf(currentStatus)
  const stepIdx = steps.indexOf(stepKey)
  return stepIdx <= currentIdx
}

async function fetchOrders() {
  const token = sessionToken?.value
  const tUuid = tableUuid?.value

  // Also try reading from localStorage as fallback
  const fallbackTableId = !tUuid ? localStorage.getItem('tm_table_id') : null

  if (!token && !tUuid && !fallbackTableId) {
    loading.value = false
    return
  }

  loading.value = true
  try {
    let data, error
    if (tUuid) {
      ;({ data, error } = await supabase.rpc('get_kiosk_orders', {
        p_table_id: tUuid,
      }))
    } else if (fallbackTableId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        fallbackTableId,
      )
      let resolvedUuid = isUuid ? fallbackTableId : null
      if (!resolvedUuid) {
        const { data: tableData } = await supabase
          .from('restaurant_tables')
          .select('id')
          .eq('table_number', fallbackTableId)
          .single()
        resolvedUuid = tableData?.id
      }
      if (resolvedUuid) {
        ;({ data, error } = await supabase.rpc('get_kiosk_orders', {
          p_table_id: resolvedUuid,
        }))
      }
    } else {
      ;({ data, error } = await supabase.rpc('get_session_orders', {
        p_session_token: token,
      }))
    }

    if (error) throw error
    if (data?.success) {
      orders.value = (data.orders || []).filter(
        (o) => o.status !== 'completed' && o.status !== 'cancelled',
      )
    } else {
      orders.value = []
    }
  } catch (err) {
    console.error('[OrderProgress] Fetch error:', err)
  } finally {
    loading.value = false
  }
}

// Fetch when drawer opens
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      fetchOrders()
    }
  },
)

function subscribeToOrders() {
  if (!tableUuid?.value) return

  if (realTimeSubscription) {
    supabase.removeChannel(realTimeSubscription)
  }

  realTimeSubscription = supabase
    .channel('customer-orders-progress')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `table_id=eq.${tableUuid.value}`,
      },
      () => {
        fetchOrders()
      },
    )
    .subscribe()
}

// ── Customer Notification Listener ────────────────────────────────
// Listens for order_notifications inserts and shows an alert to the customer
function subscribeToNotifications() {
  if (notificationChannel) {
    supabase.removeChannel(notificationChannel)
  }

  notificationChannel = supabase
    .channel('customer-order-notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'order_notifications',
      },
      (payload) => {
        const notification = payload.new
        // Check if this notification is for one of our orders
        const isOurs = orders.value.some((o) => o.id === notification.order_id)
        if (isOurs && notification.notification_type === 'item_unavailable') {
          // Show a prominent dialog to the customer
          $q.dialog({
            title: '⚠️ ' + notification.title,
            message: notification.message,
            persistent: true,
            ok: {
              label: 'I Understand',
              color: 'primary',
              unelevated: true,
            },
          })

          // Also show a toast
          $q.notify({
            type: 'warning',
            icon: 'remove_shopping_cart',
            message: notification.title,
            caption: notification.message,
            position: 'top',
            timeout: 8000,
            actions: [{ icon: 'close', color: 'white', size: 'sm' }],
          })
        }
      },
    )
    .subscribe()
}

// Watch tableUuid and sessionToken changes
watch(
  [() => tableUuid?.value, () => sessionToken?.value],
  ([newUuid, newToken]) => {
    if (newUuid || newToken) {
      fetchOrders()
      if (newUuid) {
        subscribeToOrders()
        subscribeToNotifications()
      }
    } else {
      loading.value = false
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (realTimeSubscription) {
    supabase.removeChannel(realTimeSubscription)
  }
  if (notificationChannel) {
    supabase.removeChannel(notificationChannel)
  }
})
</script>

<style scoped lang="scss">
.bg-header {
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(10px);
}

.border-bottom {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.order-card {
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: transform 0.2s;

  &:active {
    transform: scale(0.98);
  }
}

.status-chip {
  font-size: 10px;
  letter-spacing: 0.5px;
}

.opacity-05 {
  opacity: 0.05;
}

.border-top-dashed {
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
}

.bg-primary-dark {
  background: rgba(37, 99, 235, 0.15);
}

// Progress Track
.progress-track {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  position: relative;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);

  &.orange {
    background: #f97316;
    box-shadow: 0 0 10px rgba(249, 115, 22, 0.4);
  }
  &.blue {
    background: #2563eb;
    box-shadow: 0 0 10px rgba(37, 99, 235, 0.4);
  }
  &.indigo {
    background: #6366f1;
    box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
  }
  &.green,
  &.positive {
    background: #22c55e;
    box-shadow: 0 0 10px rgba(34, 197, 94, 0.4);
  }
}

.progress-steps {
  position: absolute;
  top: -6px;
  left: 0;
  right: 0;
}

.progress-step {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #1e293b;
  border: 2px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: all 0.3s;

  &.is-active {
    background: #0f172a;
    border-color: currentColor;
    color: #fff;
    transform: scale(1.2);
  }
}

.font-mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
}
</style>
