<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" transition-show="scale" transition-hide="scale">
    <q-card class="bg-dark text-white parked-orders-card" style="width: 750px; max-width: 95vw; max-height: 85vh; border-radius: 8px; border: 1px solid #444;">
      <!-- Header -->
      <q-card-section class="row items-center q-py-sm q-px-md bg-grey-9 text-white" style="border-bottom: 2px solid #ff9900;">
        <q-icon name="pause_circle_outline" size="24px" color="warning" class="q-mr-sm" />
        <div>
          <div class="text-subtitle1 text-weight-bolder">HELD / PARKED ORDERS</div>
          <div class="text-caption text-grey-4">{{ parkedList.length }} order(s) currently held</div>
        </div>
        <q-space />
        <q-btn flat round dense icon="close" color="white" v-close-popup />
      </q-card-section>

      <!-- Search & Filters -->
      <q-card-section class="q-py-xs q-px-md bg-grey-10">
        <q-input
          v-model="searchQuery"
          dense
          outlined
          dark
          placeholder="Filter by Order #, customer name, table..."
          class="search-input"
        >
          <template #prepend>
            <q-icon name="search" color="grey-4" />
          </template>
          <template #append>
            <q-icon v-if="searchQuery" name="clear" class="cursor-pointer" @click="searchQuery = ''" />
          </template>
        </q-input>
      </q-card-section>

      <!-- Parked List -->
      <q-card-section class="q-pa-md" style="overflow-y: auto; max-height: calc(85vh - 150px);">
        <div v-if="filteredList.length === 0" class="text-center q-pa-xl text-grey-5">
          <q-icon name="inbox" size="48px" class="q-mb-sm" />
          <div class="text-body1">No parked orders found</div>
          <div class="text-caption">Use "HOLD ORDER" button on POS cart to park orders for later recall.</div>
        </div>

        <div v-else class="parked-grid">
          <div
            v-for="order in filteredList"
            :key="order.id"
            class="parked-order-card"
          >
            <div class="card-header row items-center justify-between">
              <div class="row items-center q-gutter-x-sm">
                <span class="order-num-badge">#{{ order.orderNumber }}</span>
                <span class="order-type-badge">{{ order.orderType.toUpperCase() }}</span>
                <span v-if="order.tableNumber" class="table-badge">Table {{ order.tableNumber }}</span>
              </div>
              <div class="time-badge">
                <q-icon name="schedule" size="14px" class="q-mr-xs" />
                {{ formatTimeAgo(order.parkedAt) }}
              </div>
            </div>

            <!-- Customer & Tag Info -->
            <div class="card-body">
              <div v-if="order.customerName" class="row items-center q-mb-xs">
                <q-icon name="person" size="14px" color="grey-4" class="q-mr-xs" />
                <span class="text-weight-bold text-white">{{ order.customerName }}</span>
                <span v-if="order.customerPhone" class="text-grey-4 text-caption q-ml-xs">({{ order.customerPhone }})</span>
              </div>
              <div v-if="order.tag" class="tag-box q-mb-xs">
                <strong>Note:</strong> {{ order.tag }}
              </div>

              <!-- Items Summary -->
              <div class="items-summary text-grey-3">
                <div v-for="(item, idx) in order.items.slice(0, 3)" :key="idx" class="item-line">
                  <span>{{ item.qty }}x {{ item.name }}</span>
                  <span class="text-grey-4">LKR {{ (item.price * item.qty).toFixed(2) }}</span>
                </div>
                <div v-if="order.items.length > 3" class="text-caption text-orange q-mt-xs">
                  + {{ order.items.length - 3 }} more item(s)
                </div>
              </div>
            </div>

            <!-- Card Footer -->
            <div class="card-footer row items-center justify-between">
              <div class="total-amount">
                <span class="text-caption text-grey-4">Total: </span>
                <span class="text-h6 text-weight-bold text-green">LKR {{ order.total.toFixed(2) }}</span>
              </div>
              <div class="row q-gutter-x-sm">
                <q-btn
                  flat
                  dense
                  color="negative"
                  icon="delete"
                  label="Void"
                  size="sm"
                  @click="confirmDelete(order)"
                />
                <q-btn
                  unelevated
                  dense
                  color="warning"
                  text-color="black"
                  icon="restore"
                  label="RECALL"
                  class="q-px-sm text-weight-bolder"
                  @click="recall(order)"
                />
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { parkedOrderService } from 'src/services/pos/parkedOrderService'
import { useQuasar } from 'quasar'

defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'recall'])

const $q = useQuasar()
const searchQuery = ref('')

const parkedList = computed(() => parkedOrderService.getParkedOrders())

const filteredList = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return parkedList.value

  return parkedList.value.filter((o) => {
    return (
      String(o.orderNumber).toLowerCase().includes(q) ||
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      (o.customerPhone && o.customerPhone.includes(q)) ||
      (o.tableNumber && String(o.tableNumber).includes(q)) ||
      (o.tag && o.tag.toLowerCase().includes(q))
    )
  })
})

function formatTimeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} mins ago`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m ago`
}

function recall(order) {
  const recalled = parkedOrderService.recallOrder(order.id)
  if (recalled) {
    emit('recall', recalled)
    emit('update:modelValue', false)
  }
}

function confirmDelete(order) {
  $q.dialog({
    title: 'Void Parked Order',
    message: `Are you sure you want to discard Held Order #${order.orderNumber}?`,
    dark: true,
    cancel: true,
    persistent: true,
    ok: { label: 'Void Order', color: 'negative', unelevated: true }
  }).onOk(() => {
    parkedOrderService.deleteParkedOrder(order.id)
  })
}
</script>

<style scoped>
.parked-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.parked-order-card {
  background: #1e1e1e;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.card-header {
  background: #282828;
  padding: 8px 12px;
  border-bottom: 1px solid #333;
}

.order-num-badge {
  background: #ff9900;
  color: #000;
  font-weight: 900;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 3px;
}

.order-type-badge {
  background: #444;
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
}

.table-badge {
  background: #0288d1;
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
}

.time-badge {
  font-size: 11px;
  color: #bbb;
  display: flex;
  align-items: center;
}

.card-body {
  padding: 10px 12px;
  flex: 1;
}

.tag-box {
  background: #2d2d20;
  border-left: 3px solid #ff9900;
  padding: 4px 8px;
  font-size: 11px;
  color: #eee;
  border-radius: 2px;
}

.items-summary {
  font-size: 12px;
  background: #181818;
  padding: 6px 8px;
  border-radius: 4px;
  margin-top: 6px;
}

.item-line {
  display: flex;
  justify-content: space-between;
  padding: 1px 0;
}

.card-footer {
  background: #252525;
  padding: 8px 12px;
  border-top: 1px solid #333;
}
</style>
