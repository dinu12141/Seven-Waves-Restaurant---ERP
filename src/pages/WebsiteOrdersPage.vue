<template>
  <q-page class="wo-page q-pa-md">
    <ERPToolbar
      title="Website Orders"
      subtitle="Manage customer orders from the website"
      icon="language"
    />

    <!-- Stats Row -->
    <div class="row q-col-gutter-md q-mt-sm q-mb-md">
      <div class="col-6 col-md-3" v-for="stat in statsCards" :key="stat.label">
        <div class="wo-stat-card">
          <div class="wo-stat-icon" :class="`wo-stat-icon--${stat.color.split('-')[0]}`">
            <q-icon :name="stat.icon" size="22px" />
          </div>
          <div>
            <div class="wo-stat-value">{{ stat.value }}</div>
            <div class="wo-stat-label">{{ stat.label }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="wo-filter-bar q-mb-md">
      <div class="row q-col-gutter-sm items-center">
        <div class="col-12 col-md-4">
          <q-input dense outlined v-model="search" placeholder="Search orders..." clearable>
            <template #prepend><q-icon name="search" /></template>
          </q-input>
        </div>
        <div class="col-12 col-md-3">
          <q-select
            dense
            outlined
            v-model="statusFilter"
            :options="statusOptions"
            emit-value
            map-options
            label="Filter by Status"
          />
        </div>
        <div class="col-auto">
          <q-btn flat round dense icon="refresh" class="wo-refresh-btn" :loading="loading" @click="loadOrders">
            <q-tooltip>Refresh</q-tooltip>
          </q-btn>
        </div>
        <q-space />
        <div class="col-auto">
          <q-chip class="wo-live-chip" icon="wifi" dense v-if="isLive">LIVE</q-chip>
        </div>
      </div>
    </div>

    <!-- Orders Table -->
    <div class="wo-data-grid">
      <q-table
        :rows="filteredOrders"
        :columns="columns"
        row-key="id"
        flat
        :loading="loading"
        :rows-per-page-options="[20, 50, 100]"
        :pagination="{ rowsPerPage: 20 }"
        no-data-label="No website orders found"
        class="wo-table"
      >
        <template #body-cell-order_number="props">
          <q-td :props="props">
            <span class="wo-order-num">#{{ props.row.order_number }}</span>
          </q-td>
        </template>

        <template #body-cell-status="props">
          <q-td :props="props">
            <q-chip dense :color="orderStatusColor(props.row.status)" text-color="white" size="sm">
              {{ orderStatusLabel(props.row.status) }}
            </q-chip>
          </q-td>
        </template>

        <template #body-cell-delivery_status="props">
          <q-td :props="props">
            <q-chip
              v-if="props.row.delivery"
              dense
              :color="deliveryStatusColor(props.row.delivery.status)"
              text-color="white"
              size="sm"
            >
              {{ deliveryStatusLabel(props.row.delivery.status) }}
            </q-chip>
            <span v-else class="wo-muted text-caption">—</span>
          </q-td>
        </template>

        <template #body-cell-payment_status="props">
          <q-td :props="props">
            <q-chip
              dense
              :color="paymentStatusColor(props.row.payment_status)"
              text-color="white"
              size="sm"
            >
              {{ paymentStatusLabel(props.row.payment_status) }}
            </q-chip>
            <div
              class="text-caption wo-muted q-mt-xs"
              v-if="props.row.payment_method && props.row.payment_method !== 'cash'"
            >
              {{ props.row.payment_method?.toUpperCase() }}
            </div>
          </q-td>
        </template>

        <template #body-cell-rider="props">
          <q-td :props="props">
            <span v-if="props.row.delivery?.rider">{{ props.row.delivery.rider.full_name }}</span>
            <span v-else class="wo-muted text-caption">Not assigned</span>
          </q-td>
        </template>

        <template #body-cell-total_amount="props">
          <q-td :props="props">
            <span class="wo-amount text-weight-bold"
              >Rs. {{ Number(props.row.total_amount || 0).toFixed(2) }}</span
            >
          </q-td>
        </template>

        <template #body-cell-created_at="props">
          <q-td :props="props">
            <div class="text-caption wo-detail-text">{{ formatDate(props.row.created_at) }}</div>
            <div class="text-caption wo-muted">{{ timeAgo(props.row.created_at) }}</div>
          </q-td>
        </template>

        <template #body-cell-actions="props">
          <q-td :props="props" class="q-gutter-xs">
            <q-btn
              flat
              round
              dense
              icon="visibility"
              class="wo-action-btn--view"
              size="sm"
              @click="viewOrder(props.row)"
            >
              <q-tooltip>View Details</q-tooltip>
            </q-btn>
            <q-btn
              v-if="
                can('pos.payment.refund') &&
                props.row.payment_status === 'paid' &&
                !['cancelled', 'refunded'].includes(props.row.status)
              "
              flat
              round
              dense
              icon="currency_exchange"
              class="wo-action-btn--refund"
              size="sm"
              @click="refundOrder(props.row)"
            >
              <q-tooltip>Process Refund</q-tooltip>
            </q-btn>
            <q-btn
              v-if="props.row.status !== 'cancelled' && props.row.status !== 'completed'"
              flat
              round
              dense
              icon="cancel"
              class="wo-action-btn--cancel"
              size="sm"
              @click="cancelOrder(props.row)"
            >
              <q-tooltip>Cancel Order</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Order Detail Dialog -->
    <q-dialog
      v-model="showDetail"
      maximized
      transition-show="slide-up"
      transition-hide="slide-down"
    >
      <q-card class="wo-dialog-card">
        <q-toolbar class="wo-dialog-toolbar">
          <q-icon name="receipt_long" size="24px" class="wo-dialog-toolbar__icon q-mr-sm" />
          <q-toolbar-title class="text-weight-bold wo-dialog-toolbar__title">
            Order #{{ selectedOrder?.order_number }}
            <q-chip
              dense
              :color="orderStatusColor(selectedOrder?.status)"
              text-color="white"
              size="sm"
              class="q-ml-sm"
            >
              {{ orderStatusLabel(selectedOrder?.status) }}
            </q-chip>
          </q-toolbar-title>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup class="wo-dialog-close" />
        </q-toolbar>

        <q-scroll-area style="height: calc(100vh - 56px)">
          <div
            class="row q-pa-lg q-col-gutter-lg"
            style="max-width: 1400px; margin: auto"
            v-if="selectedOrder"
          >
            <!-- Left: Order Info -->
            <div class="col-12 col-md-5">
              <div class="wo-section-card q-mb-md">
                <div class="wo-section-card__title wo-section-card__title--customer">
                  Customer Details
                </div>
                <div class="q-gutter-y-sm">
                  <div class="row items-center q-gutter-sm wo-detail-text">
                    <q-icon name="person" size="18px" class="wo-detail-icon" />
                    <span>{{ selectedOrder.customer_name || 'N/A' }}</span>
                  </div>
                  <div class="row items-center q-gutter-sm wo-detail-text">
                    <q-icon name="phone" size="18px" class="wo-detail-icon" />
                    <span>{{ selectedOrder.customer_phone || 'N/A' }}</span>
                  </div>
                  <div class="row items-start q-gutter-sm wo-detail-text">
                    <q-icon name="location_on" size="18px" class="wo-detail-icon q-mt-xs" />
                    <span>{{ selectedOrder.delivery_address || 'N/A' }}</span>
                  </div>
                  <div
                    class="row items-center q-gutter-sm wo-detail-text"
                    v-if="selectedOrder.notes"
                  >
                    <q-icon name="note" size="18px" class="wo-detail-icon" />
                    <span class="text-italic">{{ selectedOrder.notes }}</span>
                  </div>
                </div>
              </div>

              <!-- Delivery Assignment -->
              <div class="wo-section-card q-mb-md" v-if="selectedOrder.delivery">
                <div class="wo-section-card__title wo-section-card__title--delivery">
                  Delivery Status
                </div>
                <div class="q-gutter-y-sm">
                  <div class="row items-center q-gutter-sm">
                    <q-icon name="delivery_dining" size="18px" class="wo-detail-icon" />
                    <q-chip
                      dense
                      :color="deliveryStatusColor(selectedOrder.delivery.status)"
                      text-color="white"
                    >
                      {{ deliveryStatusLabel(selectedOrder.delivery.status) }}
                    </q-chip>
                  </div>
                  <div class="row items-center q-gutter-sm wo-detail-text">
                    <q-icon name="person" size="18px" class="wo-detail-icon" />
                    <span
                      >Rider:
                      <strong>{{
                        selectedOrder.delivery.rider?.full_name || 'Not assigned yet'
                      }}</strong></span
                    >
                  </div>
                  <div
                    class="row items-center q-gutter-sm wo-detail-text"
                    v-if="selectedOrder.delivery.accepted_at"
                  >
                    <q-icon name="check_circle" size="18px" class="wo-icon--success" />
                    <span>Accepted: {{ formatDate(selectedOrder.delivery.accepted_at) }}</span>
                  </div>
                  <div
                    class="row items-center q-gutter-sm wo-detail-text"
                    v-if="selectedOrder.delivery.picked_up_at"
                  >
                    <q-icon name="local_shipping" size="18px" class="wo-icon--info" />
                    <span>Picked up: {{ formatDate(selectedOrder.delivery.picked_up_at) }}</span>
                  </div>
                  <div
                    class="row items-center q-gutter-sm wo-detail-text"
                    v-if="selectedOrder.delivery.delivered_at"
                  >
                    <q-icon name="done_all" size="18px" class="wo-icon--success" />
                    <span>Delivered: {{ formatDate(selectedOrder.delivery.delivered_at) }}</span>
                  </div>
                </div>
              </div>

              <!-- Payment Info -->
              <div class="wo-section-card q-mb-md">
                <div class="wo-section-card__title wo-section-card__title--payment">
                  Payment Info
                </div>
                <div class="q-gutter-y-sm">
                  <div class="row items-center q-gutter-sm wo-detail-text">
                    <q-icon name="payment" size="18px" class="wo-detail-icon" />
                    <span
                      >Method:
                      <strong>{{
                        (selectedOrder.payment_method || 'Cash').toUpperCase()
                      }}</strong></span
                    >
                  </div>
                  <div class="row items-center q-gutter-sm">
                    <q-icon name="account_balance_wallet" size="18px" class="wo-detail-icon" />
                    <q-chip
                      dense
                      :color="paymentStatusColor(selectedOrder.payment_status)"
                      text-color="white"
                    >
                      {{ paymentStatusLabel(selectedOrder.payment_status) }}
                    </q-chip>
                  </div>
                  <div
                    class="row items-center q-gutter-sm wo-detail-text"
                    v-if="selectedOrder.paid_at"
                  >
                    <q-icon name="check_circle" size="18px" class="wo-icon--success" />
                    <span>Paid at: {{ formatDate(selectedOrder.paid_at) }}</span>
                  </div>
                  <div
                    class="row items-center q-gutter-sm wo-detail-text"
                    v-if="selectedOrder.gateway_ref"
                  >
                    <q-icon name="tag" size="18px" class="wo-detail-icon" />
                    <span
                      >Txn Ref: <code>{{ selectedOrder.gateway_ref }}</code></span
                    >
                  </div>
                  <div
                    class="row items-center q-gutter-sm wo-refund-text"
                    v-if="selectedOrder.refund_amount > 0"
                  >
                    <q-icon name="currency_exchange" size="18px" class="wo-icon--warning" />
                    <span
                      >Refunded: Rs.
                      {{ Number(selectedOrder.refund_amount || 0).toFixed(2) }}</span
                    >
                  </div>
                  <div
                    class="row items-center q-gutter-sm wo-detail-text"
                    v-if="selectedOrder.refund_reason"
                  >
                    <q-icon name="info" size="18px" class="wo-detail-icon" />
                    <span class="text-italic">{{ selectedOrder.refund_reason }}</span>
                  </div>
                </div>
              </div>

              <!-- Timeline -->
              <div class="wo-section-card">
                <div class="wo-section-card__title wo-section-card__title--timeline">Timeline</div>
                <div class="text-caption wo-timeline">
                  <div class="q-mb-sm">
                    📋 Order placed: {{ formatDate(selectedOrder.created_at) }}
                  </div>
                  <div class="q-mb-sm" v-if="selectedOrder.accepted_at">
                    ✅ Accepted: {{ formatDate(selectedOrder.accepted_at) }}
                  </div>
                  <div class="q-mb-sm" v-if="selectedOrder.paid_at">
                    💳 Paid: {{ formatDate(selectedOrder.paid_at) }}
                  </div>
                  <div class="q-mb-sm" v-if="selectedOrder.delivery?.accepted_at">
                    🚴 Rider accepted: {{ formatDate(selectedOrder.delivery.accepted_at) }}
                  </div>
                  <div class="q-mb-sm" v-if="selectedOrder.delivery?.picked_up_at">
                    📦 Picked up: {{ formatDate(selectedOrder.delivery.picked_up_at) }}
                  </div>
                  <div class="q-mb-sm" v-if="selectedOrder.delivery?.delivered_at">
                    🎉 Delivered: {{ formatDate(selectedOrder.delivery.delivered_at) }}
                  </div>
                  <div class="q-mb-sm wo-refund-text" v-if="selectedOrder.refunded_at">
                    💸 Refunded: {{ formatDate(selectedOrder.refunded_at) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Order Items -->
            <div class="col-12 col-md-7">
              <div class="wo-section-card">
                <div class="wo-section-card__title wo-section-card__title--items">Order Items</div>
                <q-markup-table
                  flat
                  bordered
                  dense
                  class="text-caption wo-items-table"
                  separator="cell"
                >
                  <thead>
                    <tr>
                      <th class="text-left wo-table-head">Item</th>
                      <th class="text-center wo-table-head">Qty</th>
                      <th class="text-right wo-table-head">Price</th>
                      <th class="text-right wo-table-head">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in selectedOrder.order_items" :key="item.id">
                      <td class="wo-detail-text">
                        {{ item.menu_items?.name || item.item_name || 'Unknown' }}
                      </td>
                      <td class="text-center wo-detail-primary">{{ item.quantity }}</td>
                      <td class="text-right wo-muted">
                        Rs. {{ Number(item.unit_price || 0).toFixed(2) }}
                      </td>
                      <td class="text-right wo-amount text-weight-bold">
                        Rs. {{ Number(item.total_price || 0).toFixed(2) }}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr class="text-weight-bold">
                      <td colspan="3" class="text-right wo-grand-total">Grand Total</td>
                      <td class="text-right wo-grand-total">
                        Rs. {{ Number(selectedOrder.total_amount || 0).toFixed(2) }}
                      </td>
                    </tr>
                  </tfoot>
                </q-markup-table>
              </div>
            </div>
          </div>
        </q-scroll-area>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import { usePermission } from 'src/core/rbac/usePermission'
import { processRefund } from 'src/services/paymentService'

const $q = useQuasar()
const authStore = useAuthStore()
const { can } = usePermission()

const loading = ref(false)
const orders = ref([])
const search = ref('')
const statusFilter = ref('all')
const showDetail = ref(false)
const selectedOrder = ref(null)
const isLive = ref(false)
let realtimeChannel = null

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending_waiter' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'In Kitchen', value: 'preparing' },
  { label: 'Ready', value: 'ready' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Paid', value: 'paid' },
  { label: 'Awaiting Payment', value: 'pending_payment' },
  { label: 'Refunded', value: 'refunded' },
]

const columns = [
  { name: 'order_number', label: 'Order #', align: 'left', field: 'order_number', sortable: true },
  {
    name: 'customer_name',
    label: 'Customer',
    align: 'left',
    field: 'customer_name',
    sortable: true,
  },
  {
    name: 'delivery_address',
    label: 'Delivery Address',
    align: 'left',
    field: 'delivery_address',
    style: 'max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
  },
  { name: 'status', label: 'Order Status', align: 'center', field: 'status' },
  { name: 'payment_status', label: 'Payment', align: 'center', field: 'payment_status' },
  { name: 'delivery_status', label: 'Delivery', align: 'center' },
  { name: 'rider', label: 'Rider', align: 'left' },
  { name: 'total_amount', label: 'Amount', align: 'right', field: 'total_amount', sortable: true },
  { name: 'created_at', label: 'Placed At', align: 'left', field: 'created_at', sortable: true },
  { name: 'actions', label: 'Actions', align: 'center' },
]

const filteredOrders = computed(() => {
  let result = orders.value
  if (statusFilter.value !== 'all') {
    result = result.filter((o) => o.status === statusFilter.value)
  }
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(
      (o) =>
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.delivery_address || '').toLowerCase().includes(q) ||
        String(o.order_number).includes(q) ||
        (o.customer_phone || '').includes(q),
    )
  }
  return result
})

const statsCards = computed(() => {
  const all = orders.value
  return [
    { label: 'Total Orders', value: all.length, icon: 'receipt_long', color: 'amber-6' },
    {
      label: 'Pending',
      value: all.filter((o) => o.status === 'pending_waiter').length,
      icon: 'pending',
      color: 'orange-6',
    },
    {
      label: 'In Progress',
      value: all.filter((o) => ['accepted', 'preparing', 'ready'].includes(o.status)).length,
      icon: 'local_fire_department',
      color: 'blue-6',
    },
    {
      label: 'Delivered',
      value: all.filter((o) => o.delivery?.status === 'delivered').length,
      icon: 'check_circle',
      color: 'green-6',
    },
  ]
})

async function loadOrders() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        id, order_number, order_type, order_source, status, payment_status,
        payment_method, gateway_ref, paid_at, refunded_at, refund_amount, refund_reason,
        customer_name, customer_phone, delivery_address, customer_id,
        subtotal, tax_amount, discount_amount, total_amount,
        notes, created_at, updated_at, accepted_at,
        order_items (
          id, quantity, unit_price, total_price, notes,
          menu_items ( name, image_url )
        ),
        delivery:delivery_assignments (
          id, status, rider_id, customer_name, delivery_address,
          accepted_at, picked_up_at, delivered_at, estimated_minutes,
          rider:profiles!delivery_assignments_rider_id_fkey ( full_name )
        )
      `,
      )
      .eq('branch_id', branchId)
      .eq('order_source', 'website')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Flatten delivery array (it's 1:many but we expect 1:1)
    orders.value = (data || []).map((o) => ({
      ...o,
      delivery: o.delivery?.[0] || null,
    }))
  } catch (err) {
    console.error('[WebsiteOrders] Load error:', err)
    $q.notify({ type: 'negative', message: 'Failed to load orders' })
  } finally {
    loading.value = false
  }
}

function viewOrder(order) {
  selectedOrder.value = order
  showDetail.value = true
}

function cancelOrder(order) {
  // Guard: block cancellation on terminal/completed statuses
  const nonCancellable = ['delivered', 'paid', 'completed', 'cancelled', 'served', 'invoiced']
  if (nonCancellable.includes(order.status)) {
    $q.notify({
      type: 'warning',
      message: `Cannot cancel this order`,
      caption: `Order #${order.order_number} is already "${order.status}".`,
    })
    return
  }

  // Guard: block if delivery is already picked up or delivered
  if (order.delivery && ['picked_up', 'delivered'].includes(order.delivery.status)) {
    $q.notify({
      type: 'warning',
      message: `Cannot cancel — delivery in progress`,
      caption: `Rider has already ${order.delivery.status === 'picked_up' ? 'picked up' : 'delivered'} this order.`,
    })
    return
  }

  $q.dialog({
    title: 'Cancel Order',
    message: `Cancel order #${order.order_number} for ${order.customer_name || 'customer'}?\n\nThis action cannot be undone.`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      // Use status guard to prevent race condition: only cancel if still in a cancellable state
      const { error, data: updated } = await supabase
        .from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .not('status', 'in', '("paid","delivered","completed","cancelled","invoiced","served")')
        .select('id')

      if (error) throw error

      if (!updated || updated.length === 0) {
        $q.notify({
          type: 'warning',
          message: 'Order status changed',
          caption: 'Another user may have updated this order. Refreshing…',
        })
        loadOrders()
        return
      }

      // Also cancel delivery assignment (guard with status check)
      await supabase
        .from('delivery_assignments')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('order_id', order.id)
        .not('status', 'in', '("delivered","cancelled")')

      $q.notify({ type: 'positive', message: `Order #${order.order_number} cancelled` })
      loadOrders()
    } catch (err) {
      $q.notify({ type: 'negative', message: `Cancel failed: ${err.message}` })
    }
  })
}

async function refundOrder(order) {
  // RBAC guard
  if (!can('pos.payment.refund')) {
    $q.notify({ type: 'negative', message: 'Access Denied', caption: 'You do not have permission to process refunds' })
    return
  }

  // Only paid or partially_refunded can be refunded
  if (!['paid', 'partially_refunded'].includes(order.payment_status)) {
    $q.notify({ type: 'warning', message: 'Only paid orders can be refunded' })
    return
  }

  const maxRefundable = Number(order.total_amount || 0) - Number(order.refund_amount || 0)
  if (maxRefundable <= 0) {
    $q.notify({ type: 'warning', message: 'Order has already been fully refunded' })
    return
  }

  $q.dialog({
    title: 'Process Refund',
    message: `Refund order #${order.order_number} for ${order.customer_name || 'customer'}?\n\nMax refundable: Rs. ${maxRefundable.toFixed(2)}`,
    prompt: {
      model: '',
      type: 'text',
      label: 'Reason for refund',
    },
    cancel: true,
    persistent: true,
    color: 'orange',
  }).onOk(async (reason) => {
    try {
      const result = await processRefund(order.id, {
        reason: reason || 'Manager-initiated refund',
      })

      if (!result?.success) {
        $q.notify({ type: 'negative', message: result?.error || 'Refund failed' })
        return
      }

      $q.notify({
        type: 'positive',
        message: `Refund processed: Rs. ${Number(result.refund_amount || 0).toFixed(2)}`,
        caption: `Payment status: ${result.payment_status}`,
      })
      loadOrders()
    } catch (err) {
      $q.notify({ type: 'negative', message: `Refund error: ${err.message}` })
    }
  })
}

function subscribeRealtime() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  realtimeChannel = supabase
    .channel(`website-orders-${branchId}-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
      () => {
        loadOrders()
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'delivery_assignments',
        filter: `branch_id=eq.${branchId}`,
      },
      () => {
        loadOrders()
      },
    )
    .subscribe((status) => {
      isLive.value = status === 'SUBSCRIBED'
    })
}

// Helpers
function orderStatusColor(status) {
  const map = {
    pending_waiter: 'orange-8',
    pending_payment: 'deep-orange-7',
    accepted: 'blue-8',
    preparing: 'cyan-8',
    ready: 'green-8',
    served: 'teal-8',
    invoiced: 'purple-8',
    paid: 'green-9',
    completed: 'green-9',
    cancelled: 'red-8',
    refunded: 'orange-8',
  }
  return map[status] || 'grey-7'
}
function orderStatusLabel(status) {
  const map = {
    pending_waiter: 'Pending',
    pending_payment: 'Awaiting Payment',
    accepted: 'Accepted',
    preparing: 'In Kitchen',
    ready: 'Ready',
    served: 'Served',
    invoiced: 'Invoiced',
    paid: 'Paid',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return map[status] || status
}
function paymentStatusColor(status) {
  const map = {
    unpaid: 'grey-7',
    pending_payment: 'deep-orange-7',
    partial: 'orange-8',
    paid: 'green-8',
    refunded: 'red-7',
    partially_refunded: 'orange-7',
  }
  return map[status] || 'grey-7'
}
function paymentStatusLabel(status) {
  const map = {
    unpaid: 'Unpaid',
    pending_payment: 'Awaiting',
    partial: 'Partial',
    paid: 'Paid',
    refunded: 'Refunded',
    partially_refunded: 'Part. Refunded',
  }
  return map[status] || status
}
function deliveryStatusColor(status) {
  const map = {
    pending_rider: 'orange-8',
    accepted: 'blue-8',
    picked_up: 'cyan-8',
    delivered: 'green-8',
    cancelled: 'red-8',
  }
  return map[status] || 'grey-7'
}
function deliveryStatusLabel(status) {
  const map = {
    pending_rider: 'Waiting Rider',
    accepted: 'Rider Accepted',
    picked_up: 'Picked Up',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }
  return map[status] || status
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' })
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`
  return `${Math.floor(hrs / 24)}d ago`
}

onMounted(() => {
  loadOrders()
  subscribeRealtime()
})

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
  }
})
</script>

<style scoped lang="scss">
// Page
.wo-page {
  background: var(--erp-bg-page);
  min-height: 100vh;
}

// Stat cards
.wo-stat-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-card);
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  transition: box-shadow 0.2s, transform 0.2s;
  &:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }
}
.wo-stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  &--amber {
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
  }
  &--orange {
    background: rgba(249, 115, 22, 0.12);
    color: #f97316;
  }
  &--blue {
    background: rgba(59, 130, 246, 0.12);
    color: #3b82f6;
  }
  &--green {
    background: var(--erp-success-subtle);
    color: var(--erp-success);
  }
}
.wo-stat-value {
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--erp-text-primary);
  line-height: 1;
}
.wo-stat-label {
  font-size: 0.78rem;
  color: var(--erp-text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 4px;
}

// Filter bar
.wo-filter-bar {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-card);
  padding: 14px 16px;
}
.wo-refresh-btn {
  color: var(--erp-mod-website) !important;
}
.wo-live-chip {
  background: var(--erp-success-subtle) !important;
  color: var(--erp-success) !important;
  font-weight: 700;
}

// Data grid / table
.wo-data-grid {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-card);
  overflow: hidden;
}
.wo-table {
  background: transparent !important;
  :deep(thead tr th) {
    background: var(--erp-bg-page);
    color: var(--erp-text-muted);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--erp-border) !important;
  }
  :deep(tbody tr td) {
    color: var(--erp-text-primary);
    border-bottom: 1px solid var(--erp-border) !important;
  }
  :deep(tbody tr:hover td) {
    background: var(--erp-bg-page) !important;
  }
  :deep(.q-table__bottom) {
    background: var(--erp-bg-card);
    color: var(--erp-text-muted);
    border-top: 1px solid var(--erp-border);
  }
  :deep(.q-linear-progress__track),
  :deep(.q-linear-progress__model) {
    color: var(--erp-mod-website);
  }
}
.wo-order-num {
  font-weight: 700;
  color: var(--erp-mod-website);
}
.wo-amount {
  color: var(--erp-success);
}
.wo-muted {
  color: var(--erp-text-muted);
}
.wo-detail-text {
  color: var(--erp-text-secondary);
}
.wo-detail-primary {
  color: var(--erp-text-primary);
}

// Action buttons
.wo-action-btn--view {
  color: #3b82f6 !important;
}
.wo-action-btn--refund {
  color: #f97316 !important;
}
.wo-action-btn--cancel {
  color: var(--erp-danger) !important;
}

// Dialog
.wo-dialog-card {
  background: var(--erp-bg-page) !important;
  color: var(--erp-text-primary) !important;
}
.wo-dialog-toolbar {
  background: var(--erp-bg-card) !important;
  border-bottom: 1px solid var(--erp-border) !important;
}
.wo-dialog-toolbar__icon {
  color: var(--erp-mod-website);
}
.wo-dialog-toolbar__title {
  color: var(--erp-text-primary);
}
.wo-dialog-close {
  color: var(--erp-text-muted) !important;
}

// Section cards in dialog
.wo-section-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-card);
  padding: 20px;
}
.wo-section-card__title {
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 16px;
  padding-left: 10px;
  &--customer {
    color: var(--erp-mod-website);
    border-left: 3px solid var(--erp-mod-website);
  }
  &--delivery {
    color: #3b82f6;
    border-left: 3px solid #3b82f6;
  }
  &--payment {
    color: var(--erp-success);
    border-left: 3px solid var(--erp-success);
  }
  &--timeline {
    color: #8b5cf6;
    border-left: 3px solid #8b5cf6;
  }
  &--items {
    color: var(--erp-success);
    border-left: 3px solid var(--erp-success);
  }
}
.wo-detail-icon {
  color: var(--erp-text-muted);
}
.wo-icon--success {
  color: var(--erp-success);
}
.wo-icon--info {
  color: #3b82f6;
}
.wo-icon--warning {
  color: var(--erp-warning);
}
.wo-refund-text {
  color: var(--erp-warning);
}
.wo-timeline {
  color: var(--erp-text-secondary);
}
.wo-grand-total {
  color: var(--erp-mod-website);
}

// Items markup table
.wo-items-table {
  background: var(--erp-bg-page) !important;
  border-radius: 8px;
  overflow: hidden;
  :deep(thead tr th) {
    background: var(--erp-bg-page);
    border-bottom: 1px solid var(--erp-border) !important;
  }
  :deep(tbody tr td) {
    border-bottom: 1px solid var(--erp-border) !important;
  }
  :deep(tfoot tr td) {
    border-top: 1px solid var(--erp-border) !important;
    background: var(--erp-bg-card);
  }
}
.wo-table-head {
  color: var(--erp-text-muted) !important;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.5px;
}
</style>
