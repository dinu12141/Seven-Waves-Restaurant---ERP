<template>
  <q-card class="order-card q-mb-sm cursor-pointer" :class="statusClass" @click="$emit('view', order)">
    <q-card-section class="q-pb-none q-pt-sm">
      <div class="row items-center justify-between no-wrap">
        <div class="row items-center">
          <q-badge :color="tableColor" class="q-mr-sm text-bold" style="font-size: 0.85em">
            {{ order.table !== '-' && order.table !== '—' ? order.table : 'N/A' }}
          </q-badge>
          <div class="text-subtitle2 text-weight-bold">#{{ order.order_number || order.id?.slice(0, 8) }}</div>
          <q-badge
            v-if="order.order_source === 'website'"
            color="purple"
            class="q-ml-sm text-caption"
            dense
          >
            WEB
          </q-badge>
        </div>
        <div class="text-caption card-text-muted">
          {{ order.timeAgo || 'Just now' }}
        </div>
      </div>
    </q-card-section>

    <q-card-section class="q-py-xs">
      <!-- Items list -->
      <div class="items-preview">
        <div v-for="(item, idx) in displayItems" :key="idx" class="item-line">
          <span class="item-qty">{{ item.quantity }}x</span>
          <span class="item-name">{{ item.name }}</span>
        </div>
        <div v-if="extraItemCount > 0" class="item-line card-text-muted">
          +{{ extraItemCount }} more items
        </div>
      </div>

      <div class="row items-center justify-between q-mt-xs">
        <q-chip dense size="sm" :color="typeColor" text-color="white" icon="restaurant">
          {{ formatType(order.type || order.order_type) }}
        </q-chip>
        <div class="text-bold text-primary" style="font-size:0.95em">
          LKR {{ parseFloat(order.total || 0).toLocaleString() }}
        </div>
      </div>

      <div v-if="order.customer_name" class="cust-row q-mt-xs">
        <q-icon name="person" size="12px" class="card-icon-muted q-mr-xs" />
        <span class="text-caption card-text-muted">{{ order.customer_name }}</span>
      </div>

      <!-- Status badge -->
      <div class="q-mt-xs">
        <q-badge :color="statusBadgeColor" dense class="status-badge">
          <q-icon :name="statusIcon" size="10px" class="q-mr-xs" />
          {{ statusLabel }}
        </q-badge>
      </div>
    </q-card-section>

    <q-separator class="card-separator" />

    <!-- ACTION BUTTONS — scoped by column type -->
    <q-card-actions class="q-py-xs q-px-sm" style="min-height:36px">
      <!-- View Details — always available -->
      <q-btn flat dense size="sm" class="card-btn-view" icon="visibility" @click.stop="$emit('view', order)">
        <q-tooltip>View Details</q-tooltip>
      </q-btn>

      <!-- KOT — available in ALL columns (Active, Preparing, Ready, Completed) -->
      <q-btn flat dense size="sm" color="orange-5" icon="soup_kitchen" @click.stop="$emit('view-kot', order)">
        <q-tooltip>View KOT</q-tooltip>
      </q-btn>

      <!-- Invoice / Bill — ONLY in Completed column (served, invoiced, paid) -->
      <q-btn
        v-if="isCompletedStatus"
        flat dense size="sm" color="blue-5" icon="receipt"
        @click.stop="$emit('view-invoice', order)"
      >
        <q-tooltip>View Bill</q-tooltip>
      </q-btn>

      <q-space />

      <!-- Payment status for completed orders -->
      <q-badge v-if="isCompletedStatus" :color="order.payment_status === 'paid' ? 'green' : 'orange'" dense>
        {{ order.payment_status === 'paid' ? 'PAID' : 'UNPAID' }}
      </q-badge>
    </q-card-actions>
  </q-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  order: {
    type: Object,
    required: true,
  },
})

defineEmits(['view', 'view-kot', 'view-invoice', 'next-stage'])

// ── Status checks ──
const isCompletedStatus = computed(() =>
  ['served', 'invoiced', 'paid'].includes(props.order.status)
)

// ── Items display (show max 3) ──
const orderItems = computed(() => {
  if (props.order.order_items && Array.isArray(props.order.order_items)) {
    return props.order.order_items.map(i => ({
      quantity: i.quantity || 1,
      name: i.menu_items?.name || i.name || 'Item',
    }))
  }
  if (props.order.items && typeof props.order.items === 'string') {
    return props.order.items.split(', ').map(s => {
      const match = s.match(/(\d+)x (.+)/)
      return match ? { quantity: parseInt(match[1]), name: match[2] } : { quantity: 1, name: s }
    })
  }
  return []
})

const displayItems = computed(() => orderItems.value.slice(0, 3))
const extraItemCount = computed(() => Math.max(0, orderItems.value.length - 3))

function formatType(type) {
  const map = { dine_in: 'Dine In', 'dine-in': 'Dine In', takeaway: 'Takeaway', delivery: 'Delivery' }
  return map[type] || type || '—'
}

const statusClass = computed(() => {
  switch (props.order.status) {
    case 'pending': case 'pending_waiter': return 'order-status-pending'
    case 'accepted': case 'preparing': return 'order-status-preparing'
    case 'ready': return 'order-status-ready'
    case 'served': case 'invoiced': case 'paid': return 'order-status-completed'
    default: return 'order-status-pending'
  }
})

const statusLabel = computed(() => {
  const map = { pending: 'Pending', pending_waiter: 'Pending', accepted: 'Accepted',
    preparing: 'Preparing', ready: 'Ready', served: 'Served', invoiced: 'Invoiced', paid: 'Paid' }
  return map[props.order.status] || props.order.status
})

const statusIcon = computed(() => {
  const map = { pending: 'schedule', pending_waiter: 'schedule', accepted: 'check_circle',
    preparing: 'soup_kitchen', ready: 'room_service', served: 'done_all',
    invoiced: 'receipt_long', paid: 'payments' }
  return map[props.order.status] || 'circle'
})

const statusBadgeColor = computed(() => {
  const map = { pending: 'orange-9', pending_waiter: 'orange-9', accepted: 'blue',
    preparing: 'blue-8', ready: 'green', served: 'teal', invoiced: 'indigo', paid: 'green-8' }
  return map[props.order.status] || 'grey'
})

const tableColor = computed(() =>
  props.order.table !== '-' && props.order.table !== '—' ? 'primary' : 'orange'
)

const typeColor = computed(() => {
  const type = (props.order?.type || props.order?.order_type || '').toLowerCase()
  return { 'dine-in': 'teal', 'dine_in': 'teal', takeaway: 'orange', delivery: 'purple' }[type] || 'grey'
})
</script>

<style scoped>
.order-card {
  transition: transform 0.2s, box-shadow 0.2s;
  border-radius: 10px;
}

.body--dark .order-card {
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.body--dark .order-card.order-status-pending { background: #212121; }
.body--dark .order-card.order-status-preparing { background: #263238; }
.body--dark .order-card.order-status-ready { background: #1b5e20; }
.body--dark .order-card.order-status-completed { background: #1a1a1a; }
.body--dark .order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.1);
}

.body--light .order-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
}
.body--light .order-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #d1d5db;
}

.items-preview { margin: 4px 0; }
.item-line {
  font-size: 0.78rem;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}
.body--dark .item-line { color: rgba(255, 255, 255, 0.65); }
.body--light .item-line { color: #4b5563; }

.body--dark .card-text-muted { color: #9e9e9e !important; }
.body--light .card-text-muted { color: #6b7280 !important; }

.body--dark .card-icon-muted { color: #757575 !important; }
.body--light .card-icon-muted { color: #9ca3af !important; }

.body--dark .card-separator { background: rgba(255, 255, 255, 0.1) !important; }
.body--light .card-separator { background: #e5e7eb !important; }

.body--dark .card-btn-view { color: #9e9e9e !important; }
.body--light .card-btn-view { color: #6b7280 !important; }

.item-qty { font-weight: 700; color: #f59e0b; min-width: 22px; }
.item-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.cust-row { display: flex; align-items: center; }

.status-badge {
  font-size: 0.6rem;
  text-transform: uppercase;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}
</style>
