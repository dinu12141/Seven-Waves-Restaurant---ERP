<template>
  <q-page class="waiter-orders-light">
    <!-- ── Header ─────────────────────────────────────── -->
    <div class="orders-header">
      <div class="orders-header__left">
        <q-icon name="assignment" size="20px" color="orange-8" />
        <div class="orders-header__text">
          <div class="orders-header__title">My Orders</div>
          <div class="orders-header__sub">{{ myOrders.length }} active</div>
        </div>
      </div>
      <q-btn
        flat round dense
        icon="refresh"
        color="grey-6"
        size="sm"
        :loading="loading"
        @click="doRefresh"
      />
    </div>

    <!-- Loading -->
    <div v-if="loading && myOrders.length === 0" class="orders-loading">
      <q-spinner-orbit size="40px" color="orange" />
    </div>

    <!-- Empty -->
    <div v-else-if="myOrders.length === 0" class="orders-empty">
      <div class="orders-empty__icon">
        <q-icon name="assignment_ind" size="36px" color="grey-4" />
      </div>
      <div class="orders-empty__title">No active orders</div>
      <div class="orders-empty__sub">Accept orders from the Inbox tab</div>
    </div>

    <!-- Orders grouped by status -->
    <div v-else class="orders-list">
      <template v-for="group in groupedOrders" :key="group.status">
        <div class="group-label">{{ group.label }}</div>
        <div
          v-for="order in group.orders"
          :key="order.id"
          :ref="el => { if (el) orderCardRefs[order.id] = el }"
          class="order-card"
          :class="{
            'order-card--ready': order.status === 'ready',
            'order-card--preparing': order.status === 'preparing',
            'order-card--highlighted': highlightedOrderId === order.id,
          }"
          @click="showDetail(order)"
        >
          <!-- Card Header -->
          <div class="order-card__header">
            <div class="table-badge">
              <q-icon name="table_restaurant" size="13px" />
              <span>{{ order.tableNumber || order.table_number || '—' }}</span>
            </div>
            <div class="order-card__info">
              <div class="order-card__number">#{{ order.order_number }}</div>
              <div class="order-card__meta">
                {{ itemCount(order) }} item{{ itemCount(order) !== 1 ? 's' : '' }}
                <span class="dot-sep">·</span>
                Rs. {{ orderTotal(order).toFixed(0) }}
              </div>
            </div>
            <div class="order-card__right">
              <div
                class="status-pill"
                :class="'status-pill--' + order.status"
              >
                {{ statusLabel(order.status) }}
              </div>
              <div class="time-label">
                {{ relativeTime(order.accepted_at || order.created_at) }}
              </div>
            </div>
          </div>

          <!-- ═══ Progress Tracker ═══ -->
          <div class="progress-tracker">
            <div
              v-for="(step, idx) in PROGRESS_STEPS"
              :key="step.key"
              class="progress-step"
              :class="{
                'progress-step--done': getStepState(order, step.key) === 'done',
                'progress-step--active': getStepState(order, step.key) === 'active',
                'progress-step--pending': getStepState(order, step.key) === 'pending',
              }"
            >
              <div
                v-if="idx > 0"
                class="progress-connector"
                :class="{ 'progress-connector--done': getStepState(order, step.key) !== 'pending' }"
              />
              <div class="progress-dot">
                <q-icon v-if="getStepState(order, step.key) === 'done'" name="check" size="10px" />
                <q-icon
                  v-else-if="getStepState(order, step.key) === 'active'"
                  :name="step.icon"
                  size="11px"
                />
                <div v-else class="progress-dot__empty" />
              </div>
              <div class="progress-label">{{ step.label }}</div>
            </div>
          </div>

          <!-- KOT chips row -->
          <div v-if="order.kot_tickets?.length" class="order-card__kot">
            <div
              v-for="kot in order.kot_tickets"
              :key="kot.id"
              class="kot-chip"
              :class="`kot-chip--${kot.status}`"
            >
              <q-icon :name="kotIcon(kot.status)" size="10px" />
              KOT #{{ kot.kot_number || '?' }}
              <span class="kot-kitchen">{{ kot.kitchens?.name || '' }}</span>
              <button class="kot-view-btn" @click.stop="openKot(kot)" title="View KOT">
                <q-icon name="receipt_long" size="11px" />
              </button>
            </div>
          </div>

          <!-- Ready action bar -->
          <div v-if="order.status === 'ready'" class="order-card__ready-bar">
            <q-btn
              unelevated
              class="full-width serve-btn"
              color="green-8"
              icon="check_circle"
              label="Mark as Served"
              :loading="serving[order.id]"
              @click.stop="markServed(order.id)"
              no-caps
            />
          </div>
        </div>
      </template>
    </div>

    <!-- ── Order Detail Bottom Sheet ──────────────────────── -->
    <q-dialog v-model="showDetailSheet" position="bottom" @hide="detailOrder = null">
      <q-card class="detail-sheet" v-if="detailOrder">
        <div class="sheet-handle-wrap">
          <div class="sheet-handle" />
        </div>
        <q-bar class="detail-bar">
          <div class="detail-bar__title">
            <span class="text-weight-bold">Order #{{ detailOrder.order_number }}</span>
            <div
              class="status-pill q-ml-sm"
              :class="'status-pill--' + detailOrder.status"
              style="font-size: 0.6rem"
            >
              {{ statusLabel(detailOrder.status) }}
            </div>
          </div>
          <q-space />
          <q-btn dense flat icon="close" v-close-popup color="grey-5" />
        </q-bar>

        <q-card-section class="q-pt-sm">
          <!-- Meta row -->
          <div class="detail-meta">
            <div class="meta-chip">
              <q-icon name="table_restaurant" size="13px" class="q-mr-xs" />
              Table {{ detailOrder.tableNumber || detailOrder.table_number || '—' }}
            </div>
            <div class="meta-chip">
              <q-icon name="schedule" size="13px" class="q-mr-xs" />
              {{ fmtDateTime(detailOrder.accepted_at || detailOrder.created_at) }}
            </div>
            <div class="meta-chip meta-chip--elapsed">
              <q-icon name="hourglass_top" size="13px" class="q-mr-xs" />
              {{ relativeTime(detailOrder.accepted_at || detailOrder.created_at) }}
            </div>
          </div>

          <!-- ═══ Detail Progress Tracker (vertical) ═══ -->
          <div class="detail-progress-tracker q-mt-md q-mb-lg">
            <div class="detail-progress-title q-mb-sm">
              <q-icon name="route" size="14px" color="orange-7" class="q-mr-xs" />
              <span>Order Progress</span>
            </div>
            <div class="detail-progress-steps">
              <div
                v-for="(step, idx) in PROGRESS_STEPS"
                :key="step.key"
                class="detail-step"
                :class="{
                  'detail-step--done': getStepState(detailOrder, step.key) === 'done',
                  'detail-step--active': getStepState(detailOrder, step.key) === 'active',
                  'detail-step--pending': getStepState(detailOrder, step.key) === 'pending',
                }"
              >
                <div class="detail-step__indicator">
                  <div
                    v-if="idx > 0"
                    class="detail-step__vline"
                    :class="{
                      'detail-step__vline--done': getStepState(detailOrder, step.key) !== 'pending',
                      'detail-step__vline--active': getStepState(detailOrder, step.key) === 'active',
                    }"
                  />
                  <div class="detail-step__dot">
                    <q-icon
                      v-if="getStepState(detailOrder, step.key) === 'done'"
                      name="check_circle"
                      size="18px"
                    />
                    <div
                      v-else-if="getStepState(detailOrder, step.key) === 'active'"
                      class="detail-step__dot-active"
                    >
                      <q-icon :name="step.icon" size="14px" />
                    </div>
                    <div v-else class="detail-step__dot-empty" />
                  </div>
                </div>
                <div class="detail-step__content">
                  <div class="detail-step__label">{{ step.label }}</div>
                  <div class="detail-step__desc">{{ step.desc }}</div>
                  <div
                    v-if="getStepState(detailOrder, step.key) === 'active'"
                    class="detail-step__live-tag"
                  >
                    <span class="live-dot" />
                    Live
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- KOT Status Section -->
          <div v-if="detailOrder.kot_tickets?.length" class="q-mb-md">
            <div class="section-label">Kitchen Status</div>
            <div class="kot-list">
              <div
                v-for="kot in detailOrder.kot_tickets"
                :key="kot.id"
                class="kot-row"
                :class="`kot-row--${kot.status}`"
              >
                <div class="kot-row__icon">
                  <q-icon :name="kotIcon(kot.status)" size="16px" />
                </div>
                <div class="kot-row__info">
                  <div class="kot-row__name">KOT #{{ kot.kot_number || '—' }}</div>
                  <div class="kot-row__kitchen">{{ kot.kitchens?.name || 'Kitchen' }}</div>
                </div>
                <div class="kot-row__status">
                  <div class="kot-status-pill" :class="`kot-status-pill--${kot.status}`">
                    {{ kotLabel(kot.status) }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Order Items (available only) -->
          <div class="section-label q-mb-sm">Order Items</div>
          <div class="items-list">
            <div v-for="item in getAvailableItems(detailOrder)" :key="item.id" class="item-row">
              <div class="item-row__qty">{{ item.quantity }}×</div>
              <div class="item-row__name">
                <div>{{ item.name || item.menu_items?.name || '?' }}</div>
                <div v-if="item.notes" class="item-row__notes">📝 {{ item.notes }}</div>
              </div>
              <div class="item-row__price">
                Rs.
                {{ ((item.unit_price || item.menu_items?.base_price || 0) * item.quantity).toFixed(0) }}
              </div>
              <div class="item-row__status">
                <div class="item-status-pill" :class="`item-status-pill--${item.status}`">
                  {{ itemLabel(item.status) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Unavailable items section -->
          <div
            v-if="getUnavailableItems(detailOrder).length > 0"
            class="unavail-section q-mt-sm q-mb-sm"
          >
            <div class="unavail-section__header">
              <q-icon name="block" size="12px" class="q-mr-xs" />
              {{ getUnavailableItems(detailOrder).length }} item(s) unavailable — not charged
            </div>
            <div
              v-for="item in getUnavailableItems(detailOrder)"
              :key="item.id"
              class="unavail-item-row"
            >
              <span class="unavail-item-row__qty">{{ item.quantity }}×</span>
              <span class="unavail-item-row__name">{{ item.name || item.menu_items?.name || '?' }}</span>
              <span class="unavail-item-row__price">
                Rs. {{ ((item.unit_price || item.menu_items?.base_price || 0) * item.quantity).toFixed(0) }}
              </span>
            </div>
          </div>

          <!-- Total -->
          <div class="detail-divider" />
          <div class="detail-total">
            <div class="detail-total__label">
              Order Total
              <span v-if="getUnavailableItems(detailOrder).length > 0" class="detail-total__excl">
                (excl. unavailable)
              </span>
            </div>
            <div class="detail-total__amount">
              Rs. {{ orderTotal(detailOrder).toFixed(0) }}
            </div>
          </div>

          <!-- Mark Served button -->
          <q-btn
            v-if="detailOrder.status === 'ready'"
            unelevated
            class="full-width q-mt-md"
            color="green-8"
            icon="check_circle"
            label="Mark as Served"
            :loading="serving[detailOrder.id]"
            @click="markServed(detailOrder.id)"
            no-caps
            style="height: 50px; border-radius: 12px; font-weight: 700; font-size: 15px"
          />
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- ── KOT Receipt Dialog ──── -->
    <q-dialog
      v-model="showKotSheet"
      transition-show="scale"
      transition-hide="scale"
      @hide="activeKot = null"
    >
      <div v-if="kotItemsLoading" class="column items-center q-pa-xl">
        <q-spinner-orbit size="40px" color="orange" />
        <div class="text-grey-5 q-mt-sm">Loading KOT…</div>
      </div>
      <KotReceipt
        v-else-if="activeKot"
        :kot="activeKot"
        :table-number="activeKot._tableNumber || '—'"
        :waiter-name="activeKot._waiterName || ''"
        :customer-name="activeKot._customerName || ''"
        :order-type="activeKot._orderType || 'Dine-In'"
        :order-notes="activeKot._orderNotes || ''"
        :kitchen-name="activeKot._kitchenName || ''"
        @printed="showKotSheet = false"
      />
    </q-dialog>

    <div style="height: 24px" />
  </q-page>
</template>

<script setup>
import { computed, ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import { supabase } from 'src/boot/supabase'
import { useQuasar } from 'quasar'
import KotReceipt from 'src/components/common/KotReceipt.vue'

const route = useRoute()
const router = useRouter()
const appStore = useWaiterAppStore()
const orderStore = useWaiterOrderStore()
const $q = useQuasar()

const showDetailSheet = ref(false)
const detailOrder = ref(null)
const serving = reactive({})

// ── Highlight / deep-link state ──────────────────────────────────
const orderCardRefs = reactive({})
const highlightedOrderId = ref(null)

// ── KOT viewer state ────────────────────────────────────────
const showKotSheet = ref(false)
const activeKot = ref(null)
const activeKotOrder = ref(null)
const kotItemsLoading = ref(false)

// ── Reactive clock for live time ──────────────────────────────────
const now = ref(Date.now())
let clockTimer = null
onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 30000)

  // Check for highlight query parameter (from reminder notification deep-link)
  handleHighlightQuery()
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
})

// Watch for route changes (if already on this page and a new reminder fires)
watch(
  () => route.query.highlight,
  (newId) => {
    if (newId) handleHighlightQuery()
  },
)

/**
 * Scroll to and highlight a specific order card, then auto-open its detail sheet.
 */
async function handleHighlightQuery() {
  const targetId = route.query.highlight
  if (!targetId) return

  // Set highlight immediately
  highlightedOrderId.value = targetId

  // Wait for DOM to render the order cards
  await nextTick()
  await new Promise((r) => setTimeout(r, 300))

  // Scroll into view
  const el = orderCardRefs[targetId]
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Auto-open the detail sheet for this order
    const order = myOrders.value.find((o) => o.id === targetId)
    if (order) {
      setTimeout(() => showDetail(order), 500)
    }
  }

  // Clear highlight after 6 seconds
  setTimeout(() => {
    highlightedOrderId.value = null
  }, 6000)

  // Clean up query param without triggering navigation
  router.replace({ query: {} }).catch(() => {})
}

// ── Merged orders from both stores ───────────────────────────────
const myOrders = computed(() => {
  const base = orderStore.myOrders.length > 0 ? orderStore.myOrders : appStore.myOrders
  return base.map((o) => {
    const appOrder = appStore.myOrders.find((a) => a.id === o.id)
    return {
      ...o,
      order_items: appOrder?.order_items || o.order_items || [],
      kot_tickets: appOrder?.kot_tickets || o.kot_tickets || [],
      table_number: o.table_number || o.tableNumber || appOrder?.table_number || '—',
    }
  })
})

const loading = computed(() => appStore.loading || orderStore.loading)

const STATUS_GROUPS = [
  { status: 'ready', label: '🔔 Ready to Serve' },
  { status: 'preparing', label: '🍳 Preparing' },
  { status: 'sent_to_kitchen', label: '📤 In Kitchen' },
  { status: 'accepted', label: '✅ Accepted' },
  { status: 'served', label: '✔ Served' },
]

const groupedOrders = computed(() =>
  STATUS_GROUPS.map((g) => ({
    ...g,
    orders: myOrders.value.filter((o) => o.status === g.status),
  })).filter((g) => g.orders.length > 0),
)

// ── Progress Steps Definition ──────────────────────────────────────
const PROGRESS_STEPS = [
  { key: 'accepted', label: 'Accepted', icon: 'check', desc: 'Order accepted by waiter' },
  { key: 'kitchen', label: 'Kitchen', icon: 'soup_kitchen', desc: 'Sent to kitchen stations' },
  {
    key: 'preparing',
    label: 'Cooking',
    icon: 'local_fire_department',
    desc: 'Chef is preparing your order',
  },
  { key: 'ready', label: 'Ready', icon: 'notifications_active', desc: 'Food is ready for pickup' },
  { key: 'served', label: 'Served', icon: 'done_all', desc: 'Delivered to customer' },
]

function getStepState(order, stepKey) {
  const statusOrder = ['accepted', 'sent_to_kitchen', 'preparing', 'ready', 'served']
  const orderStatus = order.status
  const stepToStatus = {
    accepted: 'accepted',
    kitchen: 'sent_to_kitchen',
    preparing: 'preparing',
    ready: 'ready',
    served: 'served',
  }
  const stepStatusIndex = statusOrder.indexOf(stepToStatus[stepKey])
  const currentIndex = statusOrder.indexOf(orderStatus)
  const kotTickets = order.kot_tickets || []
  const anyKotPreparing = kotTickets.some((k) => k.status === 'preparing')
  const anyKotReady = kotTickets.some((k) => k.status === 'ready')
  const allKotReady =
    kotTickets.length > 0 && kotTickets.every((k) => k.status === 'ready' || k.status === 'served')

  if (stepKey === 'kitchen') {
    if (currentIndex > 1) return 'done'
    if (currentIndex === 0 && kotTickets.length > 0) return 'done'
    if (currentIndex === 1) return 'active'
    if (currentIndex === 0 && kotTickets.length === 0) return 'pending'
    return 'pending'
  }
  if (stepKey === 'preparing') {
    if (currentIndex > 2) return 'done'
    if (currentIndex === 2 || anyKotPreparing) return 'active'
    if (currentIndex > 0 || kotTickets.length > 0) return 'pending'
    return 'pending'
  }
  if (stepKey === 'ready') {
    if (currentIndex > 3) return 'done'
    if (currentIndex === 3 || allKotReady) return 'active'
    if (anyKotReady && !allKotReady) return 'pending'
    return 'pending'
  }
  if (stepStatusIndex < currentIndex) return 'done'
  if (stepStatusIndex === currentIndex) return 'active'
  return 'pending'
}

// ── Helpers ───────────────────────────────────────────────────────
function getOrderItems(order) {
  return order.order_items || order.items || []
}
function getAvailableItems(order) {
  return getOrderItems(order).filter((i) => i.availability_status !== 'unavailable')
}
function getUnavailableItems(order) {
  return getOrderItems(order).filter((i) => i.availability_status === 'unavailable')
}
function itemCount(order) {
  return getAvailableItems(order).reduce((s, i) => s + (i.quantity || 0), 0) || 0
}
function orderTotal(order) {
  return getAvailableItems(order).reduce((sum, item) => {
    const price = item.unit_price || item.menu_items?.base_price || 0
    return sum + price * item.quantity
  }, 0)
}
function relativeTime(dateStr) {
  void now.value
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m ago` : `${hrs}h ago`
}
function fmtDateTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
}
function statusLabel(s) {
  return (
    { accepted: 'Accepted', sent_to_kitchen: 'In Kitchen', preparing: 'Preparing', ready: '🔔 Ready', served: 'Served' }[s] || s
  )
}
function itemLabel(s) {
  return (
    { queued: 'Queued', sent_to_kitchen: 'Kitchen', ready: 'Ready', served: 'Served', pending: 'Pending' }[s] || s || '—'
  )
}
function kotLabel(s) {
  return (
    { created: 'Created', printed: 'Printed', preparing: 'Cooking', ready: '✔ Ready', served: 'Served', cancelled: 'Cancelled' }[s] || s
  )
}
function kotIcon(s) {
  return (
    { created: 'receipt', printed: 'print', preparing: 'soup_kitchen', ready: 'task_alt', served: 'done_all', cancelled: 'cancel' }[s] || 'receipt'
  )
}
function showDetail(order) {
  detailOrder.value = order
  showDetailSheet.value = true
}

// ── KOT viewer ────────────────────────────────────────
async function openKot(kot) {
  activeKot.value = null
  activeKotOrder.value = null
  showKotSheet.value = true
  kotItemsLoading.value = true
  try {
    const { data, error } = await supabase
      .from('kot_tickets')
      .select(`
        id, kot_number, status, printed_at, created_at,
        order:orders (
          order_number, order_type, notes, customer_name,
          table:restaurant_tables ( table_number ),
          waiter:profiles!orders_assigned_waiter_id_fkey ( full_name )
        ),
        kot_items (
          id, quantity, notes, status,
          order_item:order_items (
            menu_item:menu_items ( name )
          )
        ),
        kitchen:kitchens ( name )
      `)
      .eq('id', kot.id)
      .single()

    if (error) throw error

    activeKot.value = {
      ...data,
      items: (data.kot_items || []).map((ki) => ({
        id: ki.id,
        name: ki.order_item?.menu_item?.name || 'Unknown Item',
        qty: ki.quantity,
        quantity: ki.quantity,
        notes: ki.notes || '',
        status: ki.status,
      })),
      _tableNumber: data.order?.table?.table_number || '—',
      _waiterName: data.order?.waiter?.full_name || '',
      _customerName: data.order?.customer_name || '',
      _orderType: data.order?.order_type || 'Dine-In',
      _orderNotes: data.order?.notes || '',
      _kitchenName: data.kitchen?.name || '',
    }
    activeKotOrder.value = data.order
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Could not load KOT: ' + e.message, position: 'top' })
    showKotSheet.value = false
  } finally {
    kotItemsLoading.value = false
  }
}

async function doRefresh() {
  await Promise.all([appStore.loadMyOrders(), orderStore.fetchMyOrders()])
}

async function markServed(orderId) {
  serving[orderId] = true
  try {
    const result = await appStore.markServed(orderId)
    $q.notify({
      type: 'positive',
      message: `✅ Served! +${result?.points_awarded || 0} pts`,
      position: 'top',
    })
    showDetailSheet.value = false
    await Promise.all([orderStore.fetchMyOrders(), appStore.loadMyOrders()])
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  } finally {
    serving[orderId] = false
  }
}
</script>

<style lang="scss" scoped>
.waiter-orders-light {
  min-height: 100vh;
  background: #f8fafc;
  font-family: 'Inter', 'Roboto', sans-serif;
}

// ─── Header ──────────────────────────────────────────────────
.orders-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  z-index: 5;
}
.orders-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.orders-header__text {
  display: flex;
  flex-direction: column;
}
.orders-header__title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.3px;
  line-height: 1.15;
}
.orders-header__sub {
  font-size: 0.68rem;
  font-weight: 500;
  color: #94a3b8;
  margin-top: 1px;
}

// ─── Loading / Empty ─────────────────────────────────────────
.orders-loading {
  display: flex;
  justify-content: center;
  padding: 72px 0;
}
.orders-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 64px 24px;
  text-align: center;
}
.orders-empty__icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.orders-empty__title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #94a3b8;
}
.orders-empty__sub {
  font-size: 0.75rem;
  color: #cbd5e1;
}

// ─── Orders List ─────────────────────────────────────────────
.orders-list {
  padding: 14px 16px;
}

.group-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #64748b;
  margin: 16px 0 8px;
  &:first-child { margin-top: 0; }
}

// ─── Order Card ──────────────────────────────────────────────
.order-card {
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  margin-bottom: 10px;
  transition: all 0.12s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  -webkit-tap-highlight-color: transparent;

  &:active {
    transform: scale(0.98);
  }

  &--ready {
    border-color: #86efac;
    background: #f0fdf4;
    animation: card-pulse-ready 2s ease-in-out infinite;
  }
  &--preparing {
    border-color: #fed7aa;
    background: #fff7ed;
  }

  &--highlighted {
    border-color: #fb923c;
    background: #fff7ed;
    box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.25), 0 4px 16px rgba(251, 146, 60, 0.15);
    animation: card-highlight-pulse 1s ease-in-out 4;
  }

  &__header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px 10px;
  }
  &__info {
    flex: 1;
    min-width: 0;
  }
  &__number {
    font-size: 0.95rem;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.3px;
  }
  &__meta {
    font-size: 0.72rem;
    color: #64748b;
    font-weight: 500;
    margin-top: 1px;
  }
  &__right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    flex-shrink: 0;
  }
  &__kot {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 14px 10px;
  }
  &__ready-bar {
    padding: 8px 12px 12px;
    border-top: 1px solid #dcfce7;
  }
}

@keyframes card-pulse-ready {
  0%, 100% { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04); }
  50% { box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.08); }
}

@keyframes card-highlight-pulse {
  0%, 100% {
    box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.25), 0 4px 16px rgba(251, 146, 60, 0.15);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(251, 146, 60, 0.35), 0 8px 24px rgba(251, 146, 60, 0.25);
  }
}

.dot-sep {
  color: #cbd5e1;
  margin: 0 2px;
}

// ─── Status Pill ─────────────────────────────────────────────
.status-pill {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 3px 10px;
  border-radius: 20px;

  &--accepted {
    color: #2563eb;
    background: #dbeafe;
  }
  &--sent_to_kitchen {
    color: #c2410c;
    background: #ffedd5;
  }
  &--preparing {
    color: #d97706;
    background: #fef3c7;
  }
  &--ready {
    color: #15803d;
    background: #dcfce7;
  }
  &--served {
    color: #64748b;
    background: #f1f5f9;
  }
}

.table-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
  flex-shrink: 0;
}
.time-label {
  font-size: 0.62rem;
  font-weight: 500;
  color: #94a3b8;
}

// ═══════════════════════════════════════════════════════════
// ── PROGRESS TRACKER (Card Inline)
// ═══════════════════════════════════════════════════════════
.progress-tracker {
  display: flex;
  align-items: flex-start;
  padding: 6px 14px 12px;
  gap: 0;
}
.progress-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
  min-width: 0;
}
.progress-connector {
  position: absolute;
  top: 9px;
  right: 50%;
  width: 100%;
  height: 2px;
  background: #e2e8f0;
  z-index: 0;
  transition: background 0.3s ease;

  &--done {
    background: linear-gradient(90deg, #3b82f6, #93c5fd);
  }
}
.progress-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  position: relative;
  transition: all 0.3s ease;
  flex-shrink: 0;

  .progress-step--done & {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: #fff;
    box-shadow: 0 2px 6px rgba(59, 130, 246, 0.25);
  }
  .progress-step--active & {
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: #fff;
    box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
    animation: active-dot-pulse 1.5s ease-in-out infinite;
  }
  .progress-step--pending & {
    background: #f1f5f9;
    border: 1.5px solid #e2e8f0;
  }
  &__empty {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #cbd5e1;
  }
}

@keyframes active-dot-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.3); }
  50% { box-shadow: 0 0 0 5px rgba(249, 115, 22, 0); }
}

.progress-label {
  font-size: 0.55rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 4px;
  text-align: center;
  line-height: 1.1;

  .progress-step--done & { color: #2563eb; }
  .progress-step--active & { color: #ea580c; }
  .progress-step--pending & { color: #94a3b8; }
}

// ── KOT chips on card ──────────────────────────────────────
.kot-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.65rem;
  font-weight: 600;
  border-radius: 6px;
  padding: 3px 7px;
  border: 1px solid transparent;
  text-transform: uppercase;
  letter-spacing: 0.4px;

  .kot-kitchen {
    opacity: 0.7;
    font-weight: 400;
    font-style: italic;
    margin-left: 2px;
  }

  &--created, &--printed {
    background: #f1f5f9;
    color: #64748b;
    border-color: #e2e8f0;
  }
  &--preparing {
    background: #fff7ed;
    color: #ea580c;
    border-color: #fed7aa;
  }
  &--ready {
    background: #f0fdf4;
    color: #15803d;
    border-color: #bbf7d0;
  }
  &--served {
    background: #f0fdfa;
    color: #0d9488;
    border-color: #99f6e4;
  }
  &--cancelled {
    background: #fef2f2;
    color: #dc2626;
    border-color: #fecaca;
  }
}
.kot-view-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.06);
  border: none;
  border-radius: 4px;
  padding: 2px 4px;
  margin-left: 4px;
  cursor: pointer;
  color: inherit;
  opacity: 0.85;
  transition: opacity 0.1s, background 0.1s;
  -webkit-tap-highlight-color: transparent;
  line-height: 1;
  &:active {
    opacity: 1;
    background: rgba(0, 0, 0, 0.12);
  }
}

.serve-btn {
  height: 40px;
  border-radius: 8px !important;
  font-weight: 700;
  font-size: 13px;
}

// ═══════════════════════════════════════════════════════════
// ── DETAIL SHEET (Bottom Sheet)
// ═══════════════════════════════════════════════════════════
.detail-sheet {
  background: #fff;
  color: #0f172a;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-height: 88vh;
  overflow-y: auto;
}
.sheet-handle-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 0 4px;
}
.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: #e2e8f0;
}
.detail-bar {
  background: #f8fafc;
  min-height: 44px;
  padding: 0 14px;
  border-bottom: 1px solid #e2e8f0;

  &__title {
    display: flex;
    align-items: center;
    color: #0f172a;
  }
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.meta-chip {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 0.75rem;
  color: #475569;

  &--elapsed {
    color: #d97706;
    border-color: #fde68a;
    background: #fffbeb;
  }
}

// ═══════════════════════════════════════════════════════════
// ── DETAIL PROGRESS TRACKER (Vertical)
// ═══════════════════════════════════════════════════════════
.detail-progress-tracker {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
}
.detail-progress-title {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: #64748b;
  display: flex;
  align-items: center;
}
.detail-progress-steps {
  display: flex;
  flex-direction: column;
}
.detail-step {
  display: flex;
  gap: 14px;
  min-height: 48px;

  &__indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 24px;
    flex-shrink: 0;
    position: relative;
  }
  &__vline {
    width: 2px;
    height: 14px;
    background: #e2e8f0;
    transition: background 0.3s ease;
    &--done  { background: linear-gradient(180deg, #3b82f6, #93c5fd); }
    &--active { background: linear-gradient(180deg, #f97316, #fdba74); }
  }
  &__dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.3s ease;
  }
  &--done .detail-step__dot { color: #2563eb; }
  &__dot-active {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 10px rgba(249, 115, 22, 0.3);
    animation: detail-dot-pulse 1.5s ease-in-out infinite;
  }
  &__dot-empty {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid #e2e8f0;
    background: transparent;
  }
  &__content {
    flex: 1;
    padding-bottom: 10px;
    min-width: 0;
  }
  &__label {
    font-size: 0.85rem;
    font-weight: 600;
    transition: color 0.3s ease;
  }
  &--done .detail-step__label { color: #2563eb; }
  &--active .detail-step__label { color: #ea580c; }
  &--pending .detail-step__label { color: #94a3b8; }

  &__desc {
    font-size: 0.72rem;
    margin-top: 2px;
  }
  &--done .detail-step__desc { color: #93c5fd; }
  &--active .detail-step__desc { color: #fdba74; }
  &--pending .detail-step__desc { color: #cbd5e1; }

  &__live-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #ea580c;
    background: #fff7ed;
    border: 1px solid #fed7aa;
    border-radius: 6px;
    padding: 2px 8px;
  }
}

@keyframes detail-dot-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.3); }
  50% { box-shadow: 0 0 0 6px rgba(249, 115, 22, 0); }
}

.live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ea580c;
  animation: live-blink 1s ease-in-out infinite;
}

@keyframes live-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.section-label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: #64748b;
  margin-bottom: 8px;
}

// ── KOT list in detail ────────────────────────────────────
.kot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kot-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;

  &__icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: #f1f5f9;
  }
  &__info { flex: 1; }
  &__name {
    font-size: 0.85rem;
    font-weight: 600;
    color: #0f172a;
  }
  &__kitchen {
    font-size: 0.68rem;
    color: #94a3b8;
  }
  &__status { flex-shrink: 0; }

  &--ready {
    border-color: #bbf7d0;
    background: #f0fdf4;
    .kot-row__icon { color: #15803d; }
  }
  &--preparing {
    border-color: #fed7aa;
    background: #fff7ed;
    .kot-row__icon { color: #ea580c; }
  }
  &--created, &--printed {
    .kot-row__icon { color: #64748b; }
  }
}

.kot-status-pill {
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 3px 8px;
  border-radius: 6px;

  &--created, &--printed {
    color: #64748b;
    background: #f1f5f9;
  }
  &--preparing {
    color: #d97706;
    background: #fef3c7;
  }
  &--ready {
    color: #15803d;
    background: #dcfce7;
  }
  &--served {
    color: #0d9488;
    background: #ccfbf1;
  }
  &--cancelled {
    color: #dc2626;
    background: #fef2f2;
  }
}

// ── Item rows in detail ─────────────────────────────────────
.items-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.item-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;

  &:last-child { border-bottom: none; }

  &__qty {
    font-size: 0.85rem;
    color: #ea580c;
    font-weight: 700;
    min-width: 26px;
    padding-top: 1px;
  }
  &__name {
    flex: 1;
    font-size: 0.9rem;
    color: #0f172a;
  }
  &__notes {
    font-size: 0.72rem;
    color: #d97706;
    margin-top: 3px;
  }
  &__price {
    font-size: 0.85rem;
    color: #475569;
    font-weight: 600;
    white-space: nowrap;
    padding-top: 1px;
  }
  &__status {
    flex-shrink: 0;
    padding-top: 1px;
  }
}

.item-status-pill {
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 2px 7px;
  border-radius: 5px;

  &--queued, &--pending {
    color: #64748b;
    background: #f1f5f9;
  }
  &--sent_to_kitchen {
    color: #c2410c;
    background: #ffedd5;
  }
  &--ready {
    color: #15803d;
    background: #dcfce7;
  }
  &--served {
    color: #0d9488;
    background: #ccfbf1;
  }
}

// ── Detail Total ─────────────────────────────────────────
.detail-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 12px 0;
}
.detail-total {
  display: flex;
  align-items: center;
  margin-bottom: 16px;

  &__label {
    color: #64748b;
    font-size: 0.85rem;
    font-weight: 500;
  }
  &__excl {
    font-size: 0.68rem;
    color: #94a3b8;
    margin-left: 4px;
  }
  &__amount {
    margin-left: auto;
    font-size: 1.2rem;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.3px;
  }
}

// ── Unavailable Items Section ───────────────────────────────
.unavail-section {
  background: #fef2f2;
  border: 1px dashed #fecaca;
  border-radius: 10px;
  padding: 8px 12px;

  &__header {
    display: flex;
    align-items: center;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #dc2626;
    opacity: 0.7;
    margin-bottom: 6px;
  }
}
.unavail-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  opacity: 0.5;
  text-decoration: line-through;

  &__qty {
    font-size: 0.78rem;
    color: #dc2626;
    font-weight: 700;
    min-width: 22px;
  }
  &__name {
    flex: 1;
    font-size: 0.8rem;
    color: #64748b;
  }
  &__price {
    font-size: 0.78rem;
    color: #94a3b8;
    white-space: nowrap;
  }
}
</style>

/* ══════════════════════════════════════════════════
   DARK MODE OVERRIDES (MyOrdersPage)
   ══════════════════════════════════════════════════ */
<style lang="scss">
body.body--dark {
  .waiter-orders-light {
    background: #0f172a;
    color: #e2e8f0;

    .orders-header {
      background: #1e293b;
      border-bottom-color: rgba(255, 255, 255, 0.08);
      &__title { color: #f8fafc; }
    }

    .group-label {
      background: #1e293b;
      color: #94a3b8;
    }

    .order-card {
      background: #1e293b;
      border-color: rgba(255, 255, 255, 0.08);

      &__number { color: #f8fafc; }
      &__meta { color: #94a3b8; }
      
      .table-badge {
        background: #0f172a;
        color: #94a3b8;
        border-color: rgba(255, 255, 255, 0.1);
      }
      
      .time-label { color: #64748b; }
      
      &--ready {
        border-color: rgba(16, 185, 129, 0.4);
        background: rgba(16, 185, 129, 0.05);
      }
      &--preparing {
        border-color: rgba(59, 130, 246, 0.4);
        background: rgba(59, 130, 246, 0.05);
      }
      &--highlighted {
        border-color: #fb923c;
        box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.2);
      }

      .progress-tracker {
        background: #0f172a;
      }
      .progress-connector { background: #334155; }
      .progress-dot { background: #334155; border-color: #1e293b; }
      .progress-step--active .progress-dot {
        background: #f59e0b;
        color: #fff;
      }
      .progress-step--done .progress-dot {
        background: #10b981;
      }
      .progress-step--done .progress-connector {
        background: #10b981;
      }
    }
  }

  // Bottom Sheet
  .bottom-sheet {
    background: #1e293b !important;
    .sheet-header {
      border-bottom-color: rgba(255, 255, 255, 0.08);
      &__id { color: #f8fafc; }
      .sheet-table-badge {
        background: #0f172a;
        color: #f8fafc;
        border-color: rgba(255, 255, 255, 0.1);
      }
    }
    
    .sheet-ticket {
      background: #0f172a;
      border-color: rgba(255, 255, 255, 0.08);
    }
    
    .item-row {
      border-bottom-color: rgba(255, 255, 255, 0.04);
      &__name { color: #e2e8f0; }
      &__price { color: #f8fafc; }
    }
    
    .ticket-total {
      border-top-color: rgba(255, 255, 255, 0.08);
      &__amount { color: #f8fafc; }
    }
    
    .unavail-section {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.2);
    }
  }
}
</style>
