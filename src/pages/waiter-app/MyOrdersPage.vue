<template>
  <q-page class="waiter-page-dark">
    <!-- Toolbar -->
    <div class="inner-header q-px-md q-py-sm row items-center">
      <div class="text-weight-bold text-white">My Orders</div>
      <q-space />
      <q-badge v-if="myOrders.length > 0" color="blue-9" class="q-px-sm q-mr-sm">
        {{ myOrders.length }} active
      </q-badge>
      <q-btn round flat dense icon="refresh" color="grey-5" :loading="loading" @click="doRefresh" />
    </div>

    <!-- Loading -->
    <div v-if="loading && myOrders.length === 0" class="column items-center q-pa-xl">
      <q-spinner-orbit size="40px" color="blue" />
    </div>

    <!-- Empty -->
    <div v-else-if="myOrders.length === 0" class="empty-state">
      <q-icon name="assignment_ind" size="52px" class="text-grey-7 q-mb-md" />
      <div class="text-grey-5">No active orders</div>
      <div class="text-caption text-grey-7 q-mt-xs">Accept orders from the Inbox tab</div>
    </div>

    <!-- Orders grouped by status -->
    <div v-else class="q-pa-md">
      <template v-for="group in groupedOrders" :key="group.status">
        <div class="group-label q-mb-sm q-mt-md">{{ group.label }}</div>
        <div
          v-for="order in group.orders"
          :key="order.id"
          class="order-card q-mb-sm"
          :class="{
            'order-card--ready': order.status === 'ready',
            'order-card--preparing': order.status === 'preparing',
          }"
          @click="showDetail(order)"
        >
          <!-- Card Header -->
          <div class="order-card__header row items-center no-wrap">
            <!-- Table badge -->
            <div class="table-badge">
              <q-icon name="table_restaurant" size="13px" />
              <span>{{ order.tableNumber || order.table_number || '—' }}</span>
            </div>
            <div class="col q-ml-sm">
              <div class="text-white text-weight-bold">#{{ order.order_number }}</div>
              <div class="text-caption text-grey-5">
                {{ itemCount(order) }} item{{ itemCount(order) !== 1 ? 's' : '' }}
                <span class="q-mx-xs text-grey-7">·</span>
                Rs. {{ orderTotal(order).toFixed(0) }}
              </div>
            </div>
            <div class="col-auto column items-end q-gutter-xs">
              <q-chip
                dense
                :color="statusColor(order.status)"
                text-color="white"
                class="status-chip"
              >
                {{ statusLabel(order.status) }}
              </q-chip>
              <div class="text-caption time-label">
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
              <!-- Connector line (before step, not on first) -->
              <div
                v-if="idx > 0"
                class="progress-connector"
                :class="{ 'progress-connector--done': getStepState(order, step.key) !== 'pending' }"
              />
              <!-- Step dot+icon -->
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

          <!-- KOT chips row with view icon -->
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
              <!-- View KOT button -->
              <button class="kot-view-btn" @click.stop="openKot(kot)" title="View KOT">
                <q-icon name="receipt_long" size="11px" />
              </button>
            </div>
          </div>

          <!-- Ready action quick-bar -->
          <div v-if="order.status === 'ready'" class="order-card__ready-bar">
            <q-btn
              unelevated
              class="full-width serve-btn"
              color="green-9"
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

    <!-- ── Order Detail Bottom Sheet ──────────────────────────── -->
    <q-dialog v-model="showDetailSheet" position="bottom" @hide="detailOrder = null">
      <q-card class="detail-sheet" v-if="detailOrder">
        <!-- Sheet Handle + Close -->
        <div class="sheet-handle-wrap">
          <div class="sheet-handle" />
        </div>
        <q-bar class="detail-bar">
          <div class="detail-bar__title">
            <span class="text-weight-bold text-white">Order #{{ detailOrder.order_number }}</span>
            <q-chip
              dense
              :color="statusColor(detailOrder.status)"
              text-color="white"
              size="sm"
              class="q-ml-sm"
            >
              {{ statusLabel(detailOrder.status) }}
            </q-chip>
          </div>
          <q-space />
          <q-btn dense flat icon="close" v-close-popup color="grey-4" />
        </q-bar>

        <q-card-section class="q-pt-sm">
          <!-- Meta row -->
          <div class="detail-meta row q-gutter-sm q-mb-md">
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

          <!-- ═══ Detail Progress Tracker (bigger) ═══ -->
          <div class="detail-progress-tracker q-mb-lg">
            <div class="detail-progress-title q-mb-sm">
              <q-icon name="route" size="14px" color="blue-4" class="q-mr-xs" />
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
                  <!-- Vertical connector (before, not on first) -->
                  <div
                    v-if="idx > 0"
                    class="detail-step__vline"
                    :class="{
                      'detail-step__vline--done': getStepState(detailOrder, step.key) !== 'pending',
                      'detail-step__vline--active':
                        getStepState(detailOrder, step.key) === 'active',
                    }"
                  />
                  <!-- Dot -->
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
                  <div class="text-white text-weight-medium">KOT #{{ kot.kot_number || '—' }}</div>
                  <div class="text-caption text-grey-5">{{ kot.kitchens?.name || 'Kitchen' }}</div>
                </div>
                <div class="kot-row__status">
                  <q-chip dense :color="kotColor(kot.status)" text-color="white" size="xs">
                    {{ kotLabel(kot.status) }}
                  </q-chip>
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
                <div class="text-white">{{ item.name || item.menu_items?.name || '?' }}</div>
                <div v-if="item.notes" class="text-caption text-amber-5 q-mt-xs">
                  📝 {{ item.notes }}
                </div>
              </div>
              <div class="item-row__price">
                Rs.
                {{
                  ((item.unit_price || item.menu_items?.base_price || 0) * item.quantity).toFixed(0)
                }}
              </div>
              <div class="item-row__status">
                <q-chip dense :color="itemStatusColor(item.status)" text-color="white" size="xs">
                  {{ itemLabel(item.status) }}
                </q-chip>
              </div>
            </div>
          </div>

          <!-- Unavailable items section (collapsed, shown as info only) -->
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
              <span class="unavail-item-row__name">{{
                item.name || item.menu_items?.name || '?'
              }}</span>
              <span class="unavail-item-row__price"
                >Rs.
                {{
                  ((item.unit_price || item.menu_items?.base_price || 0) * item.quantity).toFixed(0)
                }}</span
              >
            </div>
          </div>

          <!-- Total (unavailable items excluded) -->
          <q-separator dark class="q-my-md" />
          <div class="row items-center q-mb-lg">
            <div class="text-grey-4">
              Order Total
              <span
                v-if="getUnavailableItems(detailOrder).length > 0"
                class="text-caption text-grey-6 q-ml-xs"
                >(excl. unavailable)</span
              >
            </div>
            <q-space />
            <div class="text-white text-weight-bold" style="font-size: 1.2rem">
              Rs. {{ orderTotal(detailOrder).toFixed(0) }}
            </div>
          </div>

          <!-- Mark Served button -->
          <q-btn
            v-if="detailOrder.status === 'ready'"
            unelevated
            class="full-width"
            color="green-9"
            icon="check_circle"
            label="Mark as Served"
            :loading="serving[detailOrder.id]"
            @click="markServed(detailOrder.id)"
            no-caps
            style="
              height: 50px;
              border-radius: 12px;
              font-weight: 700;
              font-size: 15px;
              letter-spacing: 0.3px;
            "
          />
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- ── KOT Receipt Dialog (same component as Kitchen Display) ──── -->
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
import { computed, ref, reactive, onMounted, onUnmounted } from 'vue'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import { supabase } from 'src/boot/supabase'
import { useQuasar } from 'quasar'
import KotReceipt from 'src/components/common/KotReceipt.vue'

const appStore = useWaiterAppStore()
const orderStore = useWaiterOrderStore()
const $q = useQuasar()

const showDetailSheet = ref(false)
const detailOrder = ref(null)
const serving = reactive({})

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
})
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
})

// ── Merged orders from both stores ───────────────────────────────
// waiterOrderStore is the authoritative shift-aware source
// waiterAppStore has richer nested data (order_items with joins)
// We merge: prefer waiterOrderStore's status/realtime, but keep appStore's order_items
const myOrders = computed(() => {
  const base = orderStore.myOrders.length > 0 ? orderStore.myOrders : appStore.myOrders
  // Enrich with appStore's detailed data if available
  return base.map((o) => {
    const appOrder = appStore.myOrders.find((a) => a.id === o.id)
    return {
      ...o,
      // Prefer appStore's order_items (has base_price+name) over orderStore's items
      order_items: appOrder?.order_items || o.order_items || [],
      // Prefer appStore's kot_tickets detail
      kot_tickets: appOrder?.kot_tickets || o.kot_tickets || [],
      // Normalize table number
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

// Map order status → progress step state
function getStepState(order, stepKey) {
  const statusOrder = ['accepted', 'sent_to_kitchen', 'preparing', 'ready', 'served']
  const orderStatus = order.status

  // Map step key to its corresponding status
  const stepToStatus = {
    accepted: 'accepted',
    kitchen: 'sent_to_kitchen',
    preparing: 'preparing',
    ready: 'ready',
    served: 'served',
  }

  const stepStatusIndex = statusOrder.indexOf(stepToStatus[stepKey])
  const currentIndex = statusOrder.indexOf(orderStatus)

  // Also check KOT statuses to determine more granular progress
  const kotTickets = order.kot_tickets || []
  const anyKotPreparing = kotTickets.some((k) => k.status === 'preparing')
  const anyKotReady = kotTickets.some((k) => k.status === 'ready')
  const allKotReady =
    kotTickets.length > 0 && kotTickets.every((k) => k.status === 'ready' || k.status === 'served')

  // Special "kitchen" step: active when status is accepted but KOTs exist
  if (stepKey === 'kitchen') {
    if (currentIndex > 1) return 'done'
    if (currentIndex === 0 && kotTickets.length > 0) return 'done'
    if (currentIndex === 1) return 'active'
    if (currentIndex === 0 && kotTickets.length === 0) return 'pending'
    return 'pending'
  }

  // Special "preparing" step: also consider KOT statuses
  if (stepKey === 'preparing') {
    if (currentIndex > 2) return 'done'
    if (currentIndex === 2 || anyKotPreparing) return 'active'
    if (currentIndex > 0 || kotTickets.length > 0) return 'pending'
    return 'pending'
  }

  // Special "ready" step: check allKotReady
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
  // Support both waiterAppStore format (order_items) and waiterOrderStore format (items)
  return order.order_items || order.items || []
}

// Only items that are NOT marked unavailable (available + unchecked)
function getAvailableItems(order) {
  return getOrderItems(order).filter((i) => i.availability_status !== 'unavailable')
}

// Items explicitly marked unavailable
function getUnavailableItems(order) {
  return getOrderItems(order).filter((i) => i.availability_status === 'unavailable')
}

function itemCount(order) {
  // Count only available items
  return getAvailableItems(order).reduce((s, i) => s + (i.quantity || 0), 0) || 0
}

function orderTotal(order) {
  // Always compute from available items only (do NOT use total_amount which includes unavailable)
  return getAvailableItems(order).reduce((sum, item) => {
    const price = item.unit_price || item.menu_items?.base_price || 0
    return sum + price * item.quantity
  }, 0)
}

function relativeTime(dateStr) {
  void now.value // subscribe to clock tick for reactivity
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

function statusColor(s) {
  return (
    {
      accepted: 'blue-8',
      sent_to_kitchen: 'deep-orange-8',
      preparing: 'orange-8',
      ready: 'green-7',
      served: 'grey-7',
    }[s] || 'grey-7'
  )
}
function statusLabel(s) {
  return (
    {
      accepted: 'Accepted',
      sent_to_kitchen: 'In Kitchen',
      preparing: 'Preparing',
      ready: '🔔 Ready',
      served: 'Served',
    }[s] || s
  )
}

function itemStatusColor(s) {
  return (
    {
      queued: 'grey-7',
      sent_to_kitchen: 'deep-orange-8',
      ready: 'green-8',
      served: 'teal-8',
      pending: 'grey-7',
    }[s] || 'grey-7'
  )
}
function itemLabel(s) {
  return (
    {
      queued: 'Queued',
      sent_to_kitchen: 'Kitchen',
      ready: 'Ready',
      served: 'Served',
      pending: 'Pending',
    }[s] ||
    s ||
    '—'
  )
}

function kotColor(s) {
  return (
    {
      created: 'blue-grey-7',
      printed: 'indigo-7',
      preparing: 'orange-8',
      ready: 'green-7',
      served: 'teal-8',
      cancelled: 'red-9',
    }[s] || 'grey-8'
  )
}
function kotLabel(s) {
  return (
    {
      created: 'Created',
      printed: 'Printed',
      preparing: 'Cooking',
      ready: '✔ Ready',
      served: 'Served',
      cancelled: 'Cancelled',
    }[s] || s
  )
}
function kotIcon(s) {
  return (
    {
      created: 'receipt',
      printed: 'print',
      preparing: 'soup_kitchen',
      ready: 'task_alt',
      served: 'done_all',
      cancelled: 'cancel',
    }[s] || 'receipt'
  )
}

function showDetail(order) {
  detailOrder.value = order
  showDetailSheet.value = true
}

// ── KOT viewer ────────────────────────────────────────
// Fetch full KOT data (same query as kitchen display) for KotReceipt component
async function openKot(kot) {
  activeKot.value = null
  activeKotOrder.value = null
  showKotSheet.value = true
  kotItemsLoading.value = true
  try {
    const { data, error } = await supabase
      .from('kot_tickets')
      .select(
        `
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
      `,
      )
      .eq('id', kot.id)
      .single()

    if (error) throw error

    // Build KotReceipt-compatible object (same as kitchen display enrichTicket)
    activeKot.value = {
      ...data,
      // Items array for KotReceipt component
      items: (data.kot_items || []).map((ki) => ({
        id: ki.id,
        name: ki.order_item?.menu_item?.name || 'Unknown Item',
        qty: ki.quantity,
        quantity: ki.quantity,
        notes: ki.notes || '',
        status: ki.status,
      })),
      // Private props for template binding
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
    // Refresh both stores
    await Promise.all([orderStore.fetchMyOrders(), appStore.loadMyOrders()])
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  } finally {
    serving[orderId] = false
  }
}
</script>

<style lang="scss" scoped>
@import './waiter-shared.scss';

.inner-header {
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  height: 48px;
}

.group-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #4b5563;
}

// ── Order Card ──────────────────────────────────────────────────────
.order-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    transform 0.1s;

  &:active {
    transform: scale(0.98);
    background: rgba(255, 255, 255, 0.07);
  }

  &--ready {
    border-color: rgba(34, 197, 94, 0.35);
    background: rgba(34, 197, 94, 0.06);
    animation: card-pulse 2s ease-in-out infinite;
  }

  &--preparing {
    border-color: rgba(251, 146, 60, 0.25);
    background: rgba(251, 146, 60, 0.04);
  }

  &__header {
    padding: 12px 14px 10px;
  }

  &__kot {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 14px 10px;
  }

  &__ready-bar {
    padding: 8px 12px 12px;
    border-top: 1px solid rgba(34, 197, 94, 0.15);
  }
}

@keyframes card-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.2);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
  }
}

.table-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #d1d5db;
  flex-shrink: 0;
}

.status-chip {
  font-size: 10px !important;
  font-weight: 600 !important;
  height: 20px !important;
}
.time-label {
  font-size: 0.65rem;
  color: #6b7280;
}

// ═══════════════════════════════════════════════════════════
// ── PROGRESS TRACKER (Card Inline) ────────────────────────
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
  background: rgba(255, 255, 255, 0.08);
  z-index: 0;
  transition: background 0.3s ease;

  &--done {
    background: linear-gradient(90deg, rgba(59, 130, 246, 0.6), rgba(59, 130, 246, 0.3));
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
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.3);
  }

  .progress-step--active & {
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: #fff;
    box-shadow: 0 0 12px rgba(249, 115, 22, 0.4);
    animation: active-dot-pulse 1.5s ease-in-out infinite;
  }

  .progress-step--pending & {
    background: rgba(255, 255, 255, 0.06);
    border: 1.5px solid rgba(255, 255, 255, 0.12);
  }

  &__empty {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
  }
}

@keyframes active-dot-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(249, 115, 22, 0);
  }
}

.progress-label {
  font-size: 0.55rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 4px;
  text-align: center;
  line-height: 1.1;

  .progress-step--done & {
    color: #60a5fa;
  }
  .progress-step--active & {
    color: #fb923c;
  }
  .progress-step--pending & {
    color: #374151;
  }
}

// ═══════════════════════════════════════════════════════════
// ── DETAIL PROGRESS TRACKER (Bottom Sheet — Vertical) ─────
// ═══════════════════════════════════════════════════════════
.detail-progress-tracker {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 14px 16px;
}

.detail-progress-title {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: #6b7280;
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
    background: rgba(255, 255, 255, 0.08);
    transition: background 0.3s ease;

    &--done {
      background: linear-gradient(180deg, #3b82f6, rgba(59, 130, 246, 0.4));
    }
    &--active {
      background: linear-gradient(180deg, #f97316, rgba(249, 115, 22, 0.2));
    }
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

  &--done .detail-step__dot {
    color: #60a5fa;
  }

  &__dot-active {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 14px rgba(249, 115, 22, 0.4);
    animation: detail-dot-pulse 1.5s ease-in-out infinite;
  }

  &__dot-empty {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.12);
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
  &--done .detail-step__label {
    color: #60a5fa;
  }
  &--active .detail-step__label {
    color: #fb923c;
  }
  &--pending .detail-step__label {
    color: #374151;
  }

  &__desc {
    font-size: 0.72rem;
    margin-top: 2px;
  }
  &--done .detail-step__desc {
    color: rgba(96, 165, 250, 0.5);
  }
  &--active .detail-step__desc {
    color: rgba(251, 146, 60, 0.6);
  }
  &--pending .detail-step__desc {
    color: #1f2937;
  }

  &__live-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #fb923c;
    background: rgba(249, 115, 22, 0.1);
    border: 1px solid rgba(249, 115, 22, 0.2);
    border-radius: 6px;
    padding: 2px 8px;
  }
}

@keyframes detail-dot-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(249, 115, 22, 0);
  }
}

.live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #fb923c;
  animation: live-blink 1s ease-in-out infinite;
}

@keyframes live-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

// KOT chips on card
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

  &--created,
  &--printed {
    background: rgba(148, 163, 184, 0.1);
    color: #94a3b8;
    border-color: rgba(148, 163, 184, 0.15);
  }
  &--preparing {
    background: rgba(251, 146, 60, 0.12);
    color: #fb923c;
    border-color: rgba(251, 146, 60, 0.2);
  }
  &--ready {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    border-color: rgba(34, 197, 94, 0.25);
  }
  &--served {
    background: rgba(45, 212, 191, 0.1);
    color: #2dd4bf;
    border-color: rgba(45, 212, 191, 0.2);
  }
  &--cancelled {
    background: rgba(239, 68, 68, 0.1);
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.15);
  }
}

.serve-btn {
  height: 40px;
  border-radius: 8px !important;
  font-weight: 700;
  font-size: 13px;
}

// ── Detail Sheet ────────────────────────────────────────────────────
.detail-sheet {
  background: #111827;
  color: #fff;
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
  background: rgba(255, 255, 255, 0.15);
}

.detail-bar {
  background: #1f2937;
  min-height: 44px;
  padding: 0 14px;

  &__title {
    display: flex;
    align-items: center;
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
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 0.75rem;
  color: #9ca3af;

  &--elapsed {
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.2);
    background: rgba(251, 191, 36, 0.06);
  }
}

.section-label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: #4b5563;
  margin-bottom: 8px;
}

// KOT list in detail
.kot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kot-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 10px 12px;

  &__icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
  }
  &__info {
    flex: 1;
  }
  &__status {
    flex-shrink: 0;
  }

  &--ready {
    border-color: rgba(34, 197, 94, 0.25);
    background: rgba(34, 197, 94, 0.06);
    .kot-row__icon {
      color: #4ade80;
    }
  }
  &--preparing {
    border-color: rgba(251, 146, 60, 0.2);
    background: rgba(251, 146, 60, 0.05);
    .kot-row__icon {
      color: #fb923c;
    }
  }
  &--created,
  &--printed {
    .kot-row__icon {
      color: #94a3b8;
    }
  }
}

// Item rows in detail
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);

  &:last-child {
    border-bottom: none;
  }

  &__qty {
    font-size: 0.85rem;
    color: #f97316;
    font-weight: 700;
    min-width: 26px;
    padding-top: 1px;
  }
  &__name {
    flex: 1;
    font-size: 0.9rem;
  }
  &__price {
    font-size: 0.85rem;
    color: #d1d5db;
    font-weight: 600;
    white-space: nowrap;
    padding-top: 1px;
  }
  &__status {
    flex-shrink: 0;
    padding-top: 1px;
  }
}

// ── KOT view button (inside chip) ────────────────────────────────
.kot-view-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  border: none;
  border-radius: 4px;
  padding: 2px 4px;
  margin-left: 4px;
  cursor: pointer;
  color: inherit;
  opacity: 0.85;
  transition:
    opacity 0.1s,
    background 0.1s;
  -webkit-tap-highlight-color: transparent;
  line-height: 1;

  &:active {
    opacity: 1;
    background: rgba(255, 255, 255, 0.22);
  }
}

// ── Unavailable Items Section ─────────────────────────────────────
.unavail-section {
  background: rgba(239, 68, 68, 0.05);
  border: 1px dashed rgba(239, 68, 68, 0.2);
  border-radius: 10px;
  padding: 8px 12px;

  &__header {
    display: flex;
    align-items: center;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #ef4444;
    opacity: 0.7;
    margin-bottom: 6px;
  }
}
.unavail-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  opacity: 0.45;
  text-decoration: line-through;

  &__qty {
    font-size: 0.78rem;
    color: #ef4444;
    font-weight: 700;
    min-width: 22px;
  }
  &__name {
    flex: 1;
    font-size: 0.8rem;
    color: #9ca3af;
  }
  &__price {
    font-size: 0.78rem;
    color: #6b7280;
    white-space: nowrap;
  }
}
</style>
