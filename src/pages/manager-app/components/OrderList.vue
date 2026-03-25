<template>
  <div>
    <div v-if="orders.length === 0" class="text-grey-6 text-caption text-center q-pa-lg">
      {{ emptyMsg }}
    </div>
    <div v-else>
      <div v-for="order in orders" :key="order.id" class="order-card q-mb-sm">
        <div class="row items-center q-pa-sm">
          <q-icon name="receipt_long" :color="statusColor" size="16px" class="q-mr-sm" />
          <span class="text-white text-weight-bold">#{{ order.order_number }}</span>
          <span class="text-grey-5 q-ml-sm">Table {{ order.table_number || '—' }}</span>
          <q-space />
          <span class="text-grey-6 text-caption">{{ fmtTime(order.created_at) }}</span>
        </div>
        <div v-if="order.order_items && order.order_items.length" class="q-px-sm q-pb-sm">
          <div
            v-for="item in order.order_items.slice(0, 3)"
            :key="item.id"
            class="text-caption text-grey-5"
          >
            {{ item.quantity }}× {{ item.menu_items?.name || 'Item' }}
          </div>
          <div v-if="order.order_items.length > 3" class="text-caption text-grey-7">
            +{{ order.order_items.length - 3 }} more
          </div>
        </div>
        <div class="order-card__footer row items-center q-pa-sm">
          <q-badge :color="statusColor" class="text-caption">{{
            order.status?.replace(/_/g, ' ')
          }}</q-badge>
          <q-space />
          <span class="text-caption text-grey-7">{{ elapsedMin(order.created_at) }} min ago</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  orders: { type: Array, default: () => [] },
  emptyMsg: { type: String, default: 'No orders.' },
  statusColor: { type: String, default: 'grey' },
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
.order-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
}
.order-card__footer {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
</style>
