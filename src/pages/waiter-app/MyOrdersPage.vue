<template>
  <q-page class="waiter-page-dark">
    <!-- Toolbar -->
    <div class="inner-header q-px-md q-py-sm row items-center">
      <div class="text-weight-bold text-white">My Orders</div>
      <q-space />
      <q-btn round flat dense icon="refresh" color="grey-5" :loading="store.loading" @click="store.loadMyOrders()" />
    </div>

    <div v-if="store.loading" class="column items-center q-pa-xl">
      <q-spinner-orbit size="40px" color="blue" />
    </div>

    <div v-else-if="store.myOrders.length === 0" class="empty-state">
      <q-icon name="assignment_ind" size="52px" class="text-grey-7 q-mb-md" />
      <div class="text-grey-5">No active orders</div>
      <div class="text-caption text-grey-7 q-mt-xs">Accept orders from the Inbox tab</div>
    </div>

    <div v-else class="q-pa-md">
      <template v-for="group in groupedOrders" :key="group.status">
        <div class="group-label q-mb-sm">{{ group.label }}</div>
        <div
          v-for="order in group.orders"
          :key="order.id"
          class="order-card q-mb-md"
        >
          <div class="row items-center q-pa-md" @click="showDetail(order)">
            <div class="col">
              <div class="text-white text-weight-bold">#{{ order.order_number }}</div>
              <div class="text-caption text-grey-5 q-mt-xs">
                <q-icon name="table_restaurant" size="11px" class="q-mr-xs" />
                Table {{ order.table_number || '—' }}
                <span class="q-mx-xs text-grey-7">·</span>
                {{ order.order_items?.length || 0 }} items
                <span class="q-mx-xs text-grey-7">·</span>
                {{ fmtTime(order.created_at) }}
              </div>
            </div>
            <q-chip dense :color="statusColor(order.status)" text-color="white" class="text-caption">
              {{ statusLabel(order.status) }}
            </q-chip>
          </div>

          <!-- Actions Bar -->
          <div v-if="order.status !== 'served'" class="order-card__actions row q-pa-sm q-gutter-sm">
            <q-btn
              v-if="order.status === 'ready'"
              unelevated class="col action-btn" color="green-9"
              icon="check_circle" label="Mark Served"
              :loading="serving[order.id]"
              @click="markServed(order.id)" no-caps
            />
            <q-btn
              flat class="col action-btn" color="grey-5"
              icon="visibility" label="Details"
              @click="showDetail(order)" no-caps
            />
          </div>
        </div>
      </template>
    </div>

    <!-- Order Detail Sheet -->
    <q-dialog v-model="showDetailSheet" position="bottom">
      <q-card class="detail-sheet">
        <q-bar class="detail-bar">
          <div class="text-weight-bold text-white">Order #{{ detailOrder?.order_number }}</div>
          <q-space />
          <q-btn dense flat icon="close" v-close-popup color="grey-4" />
        </q-bar>
        <q-card-section v-if="detailOrder">
          <div class="row items-center q-mb-md">
            <q-chip dense color="grey-8" text-color="white" icon="table_restaurant">
              Table {{ detailOrder.table_number || '—' }}
            </q-chip>
            <q-chip dense :color="statusColor(detailOrder.status)" text-color="white" class="q-ml-sm">
              {{ statusLabel(detailOrder.status) }}
            </q-chip>
            <q-space />
            <span class="text-grey-5 text-caption">{{ fmtTime(detailOrder.accepted_at || detailOrder.created_at) }}</span>
          </div>

          <div class="text-overline text-grey-5 q-mb-sm" style="font-size:0.65rem;letter-spacing:1.5px">ORDER ITEMS</div>
          <div v-for="item in detailOrder.order_items" :key="item.id" class="detail-item">
            <span class="text-grey-4 q-mr-sm">{{ item.quantity }}x</span>
            <span class="text-white">{{ item.menu_items?.name }}</span>
            <q-space />
            <q-chip dense :color="itemStatusColor(item.status)" text-color="white" size="xs">
              {{ item.status }}
            </q-chip>
          </div>

          <!-- Total -->
          <q-separator dark class="q-my-md" />
          <div class="row items-center">
            <div class="text-grey-5">Total</div>
            <q-space />
            <div class="text-white text-weight-bold text-subtitle1">
              Rs. {{ orderTotal(detailOrder).toFixed(0) }}
            </div>
          </div>

          <!-- Mark Served from detail sheet -->
          <q-btn
            v-if="detailOrder.status === 'ready'"
            unelevated class="full-width q-mt-lg" color="green-9"
            icon="check_circle" label="Mark as Served"
            :loading="serving[detailOrder.id]"
            @click="markServed(detailOrder.id)" no-caps
            style="height:48px;border-radius:10px;font-weight:700;font-size:14px"
          />
        </q-card-section>
      </q-card>
    </q-dialog>

    <div style="height: 16px" />
  </q-page>
</template>

<script setup>
import { computed, ref, reactive } from 'vue'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useQuasar } from 'quasar'

const store = useWaiterAppStore()
const $q = useQuasar()
const showDetailSheet = ref(false)
const detailOrder = ref(null)
const serving = reactive({})

const STATUS_GROUPS = [
  { status: 'ready',           label: '🔔 Ready to Serve' },
  { status: 'accepted',        label: '✅ Accepted' },
  { status: 'preparing',       label: '🍳 Preparing' },
  { status: 'sent_to_kitchen', label: '📤 In Kitchen' },
  { status: 'served',          label: '✔ Served' },
]

const groupedOrders = computed(() =>
  STATUS_GROUPS
    .map(g => ({ ...g, orders: store.myOrders.filter(o => o.status === g.status) }))
    .filter(g => g.orders.length > 0)
)

function fmtTime(dt) { return dt ? new Date(dt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '' }
function statusColor(s) { return { accepted: 'blue-8', sent_to_kitchen: 'orange-8', preparing: 'orange-8', ready: 'green-7', served: 'grey-7' }[s] || 'grey-7' }
function statusLabel(s) { return { accepted: 'Accepted', sent_to_kitchen: 'In Kitchen', preparing: 'Preparing', ready: '🔔 Ready', served: 'Served' }[s] || s }
function itemStatusColor(s) { return { queued: 'grey-7', sent_to_kitchen: 'orange-8', ready: 'green-8', served: 'teal-8', pending: 'grey-7' }[s] || 'grey-7' }

function orderTotal(order) {
  return (order.order_items || []).reduce((sum, item) => sum + (item.menu_items?.price || 0) * item.quantity, 0)
}

function showDetail(order) { detailOrder.value = order; showDetailSheet.value = true }

async function markServed(orderId) {
  serving[orderId] = true
  try {
    const result = await store.markServed(orderId)
    $q.notify({ type: 'positive', message: `✅ Served! +${result.points_awarded || 0} pts`, position: 'top' })
    showDetailSheet.value = false
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  } finally {
    serving[orderId] = false
  }
}
</script>

<style lang="scss" scoped>
@import './waiter-shared.scss';
.inner-header { background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05); height: 48px; }
.group-label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #4b5563; margin-top: 8px; }
.order-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px;
  cursor: pointer; transition: background 0.12s;
  &:active { background: rgba(255,255,255,0.07); }
  &__actions { border-top: 1px solid rgba(255,255,255,0.05); }
}
.action-btn { height: 40px; border-radius: 8px !important; font-weight: 600; font-size: 13px; }
.detail-sheet { background: #111827; color: #fff; border-radius: 16px 16px 0 0; width: 100%; max-height: 80vh; }
.detail-bar { background: #1f2937; border-radius: 16px 16px 0 0; }
.detail-item { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); &:last-child { border-bottom: none; } }
</style>
