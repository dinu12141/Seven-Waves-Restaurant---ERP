<template>
  <div :class="{ lt: !$q.dark.isActive }">
    <div v-if="orders.length === 0" class="empty-state q-pa-lg">
      <q-icon name="receipt_long" size="36px" class="empty-state__icon" />
      <div class="empty-state__text">{{ emptyMsg }}</div>
    </div>
    <div v-else>
      <div v-for="order in orders" :key="order.id" class="order-card q-mb-sm">
        <div class="row items-center q-pa-sm">
          <div class="order-status-dot" :style="{ background: dotColor }"></div>
          <span class="order-number q-ml-sm">#{{ order.order_number }}</span>
          <span class="order-table q-ml-sm">Table {{ order.table_number || '—' }}</span>
          <q-space />
          <span class="order-time">{{ fmtTime(order.created_at) }}</span>
        </div>
        <div v-if="order.order_items && order.order_items.length" class="q-px-sm q-pb-sm">
          <div
            v-for="item in order.order_items.slice(0, 3)"
            :key="item.id"
            class="order-item-row"
          >
            {{ item.quantity }}× {{ item.menu_items?.name || 'Item' }}
          </div>
          <div v-if="order.order_items.length > 3" class="order-item-more">
            +{{ order.order_items.length - 3 }} more
          </div>
        </div>
        <div class="order-card__footer row items-center q-pa-sm">
          <q-badge :color="statusColor" class="text-caption">{{
            order.status?.replace(/_/g, ' ')
          }}</q-badge>
          <q-space />
          <span class="order-elapsed">{{ elapsedMin(order.created_at) }} min ago</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()

const props = defineProps({
  orders: { type: Array, default: () => [] },
  emptyMsg: { type: String, default: 'No orders.' },
  statusColor: { type: String, default: 'grey' },
})

const dotColor = computed(() => {
  const colorMap = {
    orange: '#f97316',
    cyan: '#06b6d4',
    green: '#10b981',
    red: '#ef4444',
    grey: '#6b7280',
  }
  return colorMap[props.statusColor] || '#6b7280'
})

function fmtTime(dt) {
  return dt ? new Date(dt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : ''
}
function elapsedMin(dt) {
  if (!dt) return 0
  return Math.round((Date.now() - new Date(dt).getTime()) / 60000)
}
</script>

<style lang="scss" scoped>
// ─── Empty State ─────────────────────────────────────────────────────────────
.empty-state {
  text-align: center;
}
.empty-state__icon {
  color: #374151;
  margin-bottom: 8px;
}
.lt .empty-state__icon {
  color: #cbd5e1;
}
.empty-state__text {
  font-size: 0.88rem;
  color: #6b7280;
}

// ─── Order Cards ─────────────────────────────────────────────────────────────
.order-card {
  border-radius: 12px;
  transition: transform 0.15s;
}
.order-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.lt .order-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.order-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.order-number {
  font-weight: 700;
  font-size: 0.98rem;
  color: #f3f4f6;
}
.lt .order-number {
  color: #1e293b;
}

.order-table {
  font-size: 0.88rem;
  color: #6b7280;
}
.lt .order-table {
  color: #94a3b8;
}

.order-time {
  font-size: 0.80rem;
  color: #4b5563;
}
.lt .order-time {
  color: #94a3b8;
}

.order-item-row {
  font-size: 0.88rem;
  color: #9ca3af;
  padding: 1px 0;
}
.lt .order-item-row {
  color: #64748b;
}
.order-item-more {
  font-size: 0.82rem;
  color: #4b5563;
}
.lt .order-item-more {
  color: #94a3b8;
}

.order-card__footer {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
.lt .order-card__footer {
  border-top: 1px solid #f1f5f9;
}

.order-elapsed {
  font-size: 0.80rem;
  color: #4b5563;
}
.lt .order-elapsed {
  color: #94a3b8;
}
</style>
