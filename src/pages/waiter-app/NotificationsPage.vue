<template>
  <q-page class="notif-page">

    <!-- ─── Sticky Hero Header ──────────────────────────────────────────────── -->
    <div class="notif-hero">
      <div class="notif-hero__row">
        <div>
          <div class="notif-hero__title">Activity</div>
          <div class="notif-hero__sub">Live alerts &amp; notifications</div>
        </div>
        <div class="row items-center gap-8">
          <q-btn
            v-if="store.unreadNotifCount > 0"
            unelevated no-caps size="sm"
            color="orange-9"
            label="Mark all read"
            class="mark-read-btn"
            @click="store.markAllNotifsRead()"
          />
          <div v-if="totalCount > 0" class="total-badge">{{ totalCount }}</div>
        </div>
      </div>

      <!-- ── Pill Tabs ─────────────────────────────────────────────────────── -->
      <div class="notif-tabs">
        <button
          class="notif-tab"
          :class="{ 'notif-tab--active': activeTab === 'alerts' }"
          @click="activeTab = 'alerts'"
        >
          <q-icon name="bolt" size="14px" />
          Alerts
          <span v-if="alertCount > 0" class="tab-pill tab-pill--orange">{{ alertCount }}</span>
        </button>
        <button
          class="notif-tab"
          :class="{ 'notif-tab--active': activeTab === 'inbox' }"
          @click="activeTab = 'inbox'"
        >
          <q-icon name="inbox" size="14px" />
          Inbox
          <span v-if="store.unreadNotifCount > 0" class="tab-pill tab-pill--red">{{ store.unreadNotifCount }}</span>
        </button>
      </div>
    </div>

    <!-- ─── Scrollable Content Area ─────────────────────────────────────────── -->
    <div class="notif-content">

      <transition name="tab-fade" mode="out-in">

        <!-- ════════════════════════ ALERTS TAB ════════════════════════════ -->
        <div v-if="activeTab === 'alerts'" key="alerts" class="q-pa-md">

          <!-- Empty -->
          <div v-if="!hasAlerts" class="notif-empty">
            <div class="notif-empty__icon">
              <q-icon name="notifications_none" size="36px" color="grey-4" />
            </div>
            <div class="notif-empty__title">All quiet here</div>
            <div class="notif-empty__sub">New orders &amp; kitchen alerts appear in real time</div>
          </div>

          <!-- ── NEW ORDERS section ──────────────────────────────────────── -->
          <template v-if="orderStore.newOrderAlerts.length > 0">
            <div class="section-row q-mb-sm">
              <div class="section-dot section-dot--blue" />
              <span class="section-label">New Incoming</span>
              <q-badge color="blue-9" class="q-ml-xs">{{ orderStore.newOrderAlerts.length }}</q-badge>
              <q-space />
              <q-btn flat no-caps dense size="xs" color="grey-6" label="Clear" @click="orderStore.clearNewOrderAlerts()" />
            </div>

            <div
              v-for="alert in orderStore.newOrderAlerts"
              :key="alert.id"
              class="ncard ncard--blue q-mb-sm"
              @click="goInbox"
            >
              <div class="ncard__icon ncard__icon--blue">
                <q-icon name="room_service" size="20px" color="blue-6" />
              </div>
              <div class="ncard__body">
                <div class="ncard__title">
                  New Order
                  <span v-if="alert.order_number" class="ncard__num">#{{ alert.order_number }}</span>
                </div>
                <div class="ncard__meta">
                  <q-icon name="table_restaurant" size="11px" />{{ alert.table_name }}
                  <span class="ncard__dot">·</span>{{ relativeTime(alert.created_at) }}
                </div>
              </div>
              <q-btn
                unelevated no-caps dense size="sm"
                color="blue-8" label="Accept"
                class="ncard__btn"
                @click.stop="goInbox"
              />
            </div>

            <div v-if="appStore.readyAlerts.length > 0" class="section-sep" />
          </template>

          <!-- ── KITCHEN READY section ──────────────────────────────────── -->
          <template v-if="appStore.readyAlerts.length > 0">
            <div class="section-row q-mb-sm">
              <div class="section-dot section-dot--green" />
              <span class="section-label">Kitchen Ready</span>
              <q-badge color="green-9" class="q-ml-xs">{{ appStore.readyAlerts.length }}</q-badge>
            </div>

            <div class="ready-banner q-mb-sm">
              <q-icon name="restaurant" size="15px" class="q-mr-xs" />
              <span>{{ appStore.readyAlerts.length }} order(s) ready — serve now!</span>
            </div>

            <div
              v-for="alert in appStore.readyAlerts"
              :key="alert.id"
              class="ncard ncard--green q-mb-sm"
            >
              <div class="ncard__icon ncard__icon--green">
                <q-icon name="soup_kitchen" size="20px" color="green-7" />
              </div>
              <div class="ncard__body">
                <div class="ncard__title">
                  Order #{{ orderNumber(alert.order_id) }}
                  <q-chip dense color="green-8" text-color="white" size="xs" class="q-ml-xs" style="height:18px;font-size:0.6rem">Ready!</q-chip>
                </div>
                <div class="ncard__meta">
                  <q-icon name="soup_kitchen" size="11px" />{{ alert.kitchens?.name || 'Kitchen' }}
                  <span class="ncard__dot">·</span>KOT #{{ alert.batch_number }}
                </div>
              </div>
              <q-btn
                unelevated no-caps dense size="sm"
                color="green-8" icon="check_circle" label="Serve"
                class="ncard__btn"
                :loading="serving[alert.order_id]"
                @click.stop="markServedFromAlert(alert.order_id)"
              />
            </div>
          </template>

        </div>

        <!-- ════════════════════════ INBOX TAB ════════════════════════════ -->
        <div v-else key="inbox" class="q-pa-md">

          <!-- Empty -->
          <div v-if="store.notifications.length === 0" class="notif-empty">
            <div class="notif-empty__icon">
              <q-icon name="mark_email_read" size="36px" color="grey-4" />
            </div>
            <div class="notif-empty__title">You're all caught up!</div>
            <div class="notif-empty__sub">Manager messages &amp; system notices appear here</div>
          </div>

          <!-- Urgent -->
          <template v-if="urgentNotifs.length > 0">
            <div class="section-row q-mb-sm">
              <div class="section-dot section-dot--red" />
              <span class="section-label" style="color:#dc2626">Urgent</span>
              <q-badge color="red-8" class="q-ml-xs">{{ urgentNotifs.length }}</q-badge>
            </div>
            <div
              v-for="notif in urgentNotifs"
              :key="notif.id"
              class="ncard ncard--red q-mb-sm"
              :class="{ 'ncard--unread': !notif.is_read }"
              @click="handleNotifClick(notif)"
            >
              <div class="ncard__icon ncard__icon--red">
                <q-icon :name="notifIcon(notif.notification_type)" size="18px" color="red-6" />
              </div>
              <div class="ncard__body">
                <div class="ncard__title">{{ notif.title }}</div>
                <div class="ncard__preview">{{ notif.body }}</div>
                <div class="ncard__time">{{ fmtDate(notif.created_at) }}</div>
              </div>
              <div v-if="!notif.is_read" class="unread-dot" />
            </div>
            <div v-if="normalNotifs.length > 0" class="section-sep" />
          </template>

          <!-- Normal -->
          <template v-if="normalNotifs.length > 0">
            <div class="section-row q-mb-sm">
              <div class="section-dot section-dot--grey" />
              <span class="section-label">Recent</span>
            </div>
            <div
              v-for="notif in normalNotifs"
              :key="notif.id"
              class="ncard q-mb-sm"
              :class="[`ncard--${notifTheme(notif.notification_type)}`, { 'ncard--unread': !notif.is_read }]"
              @click="handleNotifClick(notif)"
            >
              <div class="ncard__icon" :class="`ncard__icon--${notifTheme(notif.notification_type)}`">
                <q-icon :name="notifIcon(notif.notification_type)" size="18px" :color="notifColor(notif.notification_type)" />
              </div>
              <div class="ncard__body">
                <div class="ncard__title" :class="notif.is_read ? 'text-weight-regular' : ''">{{ notif.title }}</div>
                <div class="ncard__preview">{{ notif.body }}</div>
                <div class="ncard__time">{{ fmtDate(notif.created_at) }}</div>
              </div>
              <div v-if="!notif.is_read" class="unread-dot" />
            </div>
          </template>

        </div>

      </transition>

      <div style="height:24px" />
    </div>

    <!-- ─── Manager Message Dialog ─────────────────────────────────────────── -->
    <q-dialog v-model="msgDialogOpen" position="standard">
      <q-card class="msg-card">
        <div class="msg-card__header">
          <div class="msg-card__hicon"><q-icon name="mail" size="20px" color="white" /></div>
          <div class="col">
            <div class="msg-card__from">Message from Manager</div>
            <div v-if="msgDetail.sender_name" class="msg-card__sender">{{ msgDetail.sender_name }}</div>
          </div>
          <q-btn flat round dense icon="close" color="white" @click="msgDialogOpen = false" size="sm" />
        </div>
        <div class="q-pa-lg">
          <q-badge :color="msgDetail.priority === 'urgent' ? 'red-8' : 'blue-grey-7'"
            :label="msgDetail.priority === 'urgent' ? '🚨 Urgent' : '📩 Normal'"
            class="q-mb-md"
            style="font-size:0.7rem;padding:4px 12px;border-radius:8px"
          />
          <div class="msg-card__subject q-mb-sm">{{ msgDetail.subject || 'No Subject' }}</div>
          <div class="msg-card__body">{{ msgDetail.message_body || '—' }}</div>
          <div class="msg-card__time"><q-icon name="access_time" size="12px" class="q-mr-xs" />{{ fmtDateFull(msgDetail.created_at) }}</div>
        </div>
        <q-card-actions class="q-px-lg q-pb-lg q-pt-none">
          <q-btn unelevated no-caps class="full-width" color="blue-9" icon="check_circle"
            label="Got it" style="height:44px;border-radius:12px;font-weight:700"
            @click="msgDialogOpen = false"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-inner-loading :showing="msgLoading" color="orange" />
  </q-page>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'

const store = useWaiterAppStore()
const appStore = store
const orderStore = useWaiterOrderStore()
const router = useRouter()
const $q = useQuasar()
const serving = reactive({})

const activeTab = ref('alerts')

// ── Computed ─────────────────────────────────────────────────────────────────
const hasAlerts = computed(
  () => orderStore.newOrderAlerts.length > 0 || appStore.readyAlerts.length > 0,
)
const alertCount = computed(
  () => orderStore.newOrderAlerts.length + appStore.readyAlerts.length,
)
const totalCount = computed(() => alertCount.value + store.unreadNotifCount)
const urgentNotifs = computed(() => store.notifications.filter((n) => n.payload?.priority === 'urgent'))
const normalNotifs = computed(() => store.notifications.filter((n) => n.payload?.priority !== 'urgent'))

// ── Actions ───────────────────────────────────────────────────────────────────
function goInbox() { router.push('/waiter-app/inbox') }
function orderNumber(orderId) { return appStore.myOrders.find((o) => o.id === orderId)?.order_number || '—' }

async function markServedFromAlert(orderId) {
  serving[orderId] = true
  try {
    const result = await appStore.markServed(orderId)
    $q.notify({ type: 'positive', message: `✅ Served! +${result?.points_awarded || 0} pts`, position: 'top' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  } finally {
    serving[orderId] = false
  }
}

// ── Notification click ────────────────────────────────────────────────────────
const msgDialogOpen = ref(false)
const msgLoading = ref(false)
const msgDetail = ref({ subject: '', message_body: '', priority: 'normal', sender_name: '', created_at: null })

async function handleNotifClick(notif) {
  store.markNotificationRead(notif.id)
  const type = notif.notification_type
  const meta = notif.payload || notif.metadata || {}

  if (type === 'order_status') {
    const s = meta.new_status
    const orderId = meta.order_id || notif.ref_id || ''
    if (['ready', 'cooking', 'preparing'].includes(s)) return router.push('/waiter-app/alerts')
    if (s === 'pending_waiter') return router.push('/waiter-app/inbox')
    return router.push({ path: '/waiter-app/orders', query: orderId ? { highlight: orderId } : {} })
  }
  if (type === 'payment_complete') {
    const orderId = meta.order_id || notif.ref_id || ''
    return router.push({ path: '/waiter-app/orders', query: orderId ? { highlight: orderId } : {} })
  }
  if (type === 'order_assigned') return router.push('/waiter-app/inbox')
  if (['shift_reminder', 'schedule_change'].includes(type)) return router.push('/waiter-app')

  const isMsg = ['manager_message', 'message_received'].includes(type)
  const msgId = meta.manager_message_id || meta.message_id

  if (isMsg && msgId) {
    msgLoading.value = true
    try {
      const { data, error } = await supabase
        .from('manager_messages')
        .select('id, subject, message_body, priority, created_at, is_read, sender:sender_employee_id ( full_name )')
        .eq('id', msgId).maybeSingle()
      if (error) throw error
      if (data) {
        msgDetail.value = {
          subject: data.subject, message_body: data.message_body,
          priority: data.priority || meta.priority || 'normal',
          sender_name: data.sender?.full_name || 'Manager', created_at: data.created_at,
        }
        if (!data.is_read) {
          await supabase.from('manager_messages').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', data.id)
        }
        msgDialogOpen.value = true
      } else {
        showFallbackMsg(notif)
      }
    } catch (e) {
      console.error('[Notif] msg load:', e)
      showFallbackMsg(notif)
    } finally {
      msgLoading.value = false
    }
  } else if (isMsg) {
    showFallbackMsg(notif)
  }
}

function showFallbackMsg(notif) {
  const meta = notif.payload || notif.metadata || {}
  msgDetail.value = {
    subject: meta.subject || notif.title, message_body: notif.body,
    priority: meta.priority || 'normal', sender_name: 'Manager', created_at: notif.created_at,
  }
  msgDialogOpen.value = true
}

// ── Icon helpers ──────────────────────────────────────────────────────────────
function notifIcon(t) {
  return ({ info:'info', order_status:'receipt_long', order_assigned:'assignment',
    message_received:'mail', manager_message:'mail', points_earned:'stars',
    schedule_change:'event', urgent:'priority_high', shift_reminder:'alarm', customer_rating:'star',
  }[t] || 'notifications')
}
function notifTheme(t) {
  if (['urgent','performance_review'].includes(t)) return 'red'
  if (['message_received','manager_message'].includes(t)) return 'blue'
  if (['points_earned','customer_rating'].includes(t)) return 'amber'
  if (['order_assigned','order_status'].includes(t)) return 'green'
  return 'grey'
}
function notifColor(t) {
  return ({urgent:'red-6',message_received:'blue-6',manager_message:'blue-6',
    points_earned:'amber-7',order_assigned:'green-7',order_status:'green-7',customer_rating:'amber-7'}[t]||'grey-6')
}
function fmtDate(dt) {
  if (!dt) return ''
  const d = new Date(dt), now = new Date(), diffH = (now - d) / 3600000
  if (diffH < 1) return `${Math.max(1, Math.floor(diffH * 60))}m ago`
  if (diffH < 24) return `${Math.floor(diffH)}h ago`
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}
function fmtDateFull(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString('en', { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
}
function relativeTime(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}
</script>

<style lang="scss" scoped>
// ─── Page ──────────────────────────────────────────────────────────────────
.notif-page {
  background: #f1f5f9;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: 'Inter', 'Roboto', sans-serif;
}

// ─── Hero / Sticky Header ──────────────────────────────────────────────────
.notif-hero {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%);
  padding: 14px 16px 0;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 4px 20px rgba(49, 46, 129, 0.4);

  &__row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  &__title {
    font-size: 1.25rem;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.3px;
    line-height: 1.2;
  }
  &__sub {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.55);
    margin-top: 2px;
    font-weight: 500;
  }
}

.mark-read-btn {
  border-radius: 20px !important;
  font-size: 0.7rem !important;
  padding: 3px 12px !important;
  font-weight: 600 !important;
  background: rgba(255,255,255,0.15) !important;
  color: #fff !important;
  border: 1px solid rgba(255,255,255,0.2) !important;
}

.total-badge {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  border-radius: 99px;
  min-width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
  animation: badge-pulse 1.8s ease-in-out infinite;
}
@keyframes badge-pulse {
  0%,100% { box-shadow: 0 2px 8px rgba(239,68,68,0.4); }
  50%      { box-shadow: 0 2px 16px rgba(239,68,68,0.7); }
}

// ─── Pill Tabs ─────────────────────────────────────────────────────────────
.notif-tabs {
  display: flex;
  gap: 4px;
  padding-bottom: 0;
}
.notif-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 16px;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
  margin-bottom: -1px;

  &:active { opacity: 0.7; }
  &--active {
    color: #fff;
    border-bottom-color: #f97316;
  }
}
.tab-pill {
  font-size: 0.62rem;
  font-weight: 800;
  border-radius: 99px;
  min-width: 17px;
  height: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  &--orange { background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; }
  &--red    { background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; }
}

// ─── Scrollable Content ────────────────────────────────────────────────────
.notif-content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

// ─── Tab transition ────────────────────────────────────────────────────────
.tab-fade-enter-active, .tab-fade-leave-active { transition: opacity 0.15s ease; }
.tab-fade-enter-from, .tab-fade-leave-to { opacity: 0; }

// ─── Section row ──────────────────────────────────────────────────────────
.section-row {
  display: flex;
  align-items: center;
  gap: 0;
}
.section-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: #64748b;
}
.section-dot {
  width: 6px; height: 6px; border-radius: 50%;
  margin-right: 7px; flex-shrink: 0;
  &--blue  { background: #3b82f6; box-shadow: 0 0 6px rgba(59,130,246,0.7); }
  &--green { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.7);
    animation: dot-pulse 1.5s ease-in-out infinite; }
  &--red   { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,0.6); }
  &--grey  { background: #cbd5e1; }
}
@keyframes dot-pulse {
  0%,100% { opacity: 1; } 50% { opacity: 0.35; }
}
.section-sep {
  height: 1px;
  background: #e2e8f0;
  margin: 14px 0;
}

// ─── Notification Cards ────────────────────────────────────────────────────
.ncard {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 12px 14px 12px 12px;
  cursor: pointer;
  transition: box-shadow 0.18s ease, transform 0.1s ease;
  position: relative;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);

  &:active { transform: scale(0.982); }
  &:hover  { box-shadow: 0 6px 20px rgba(0,0,0,0.1); }

  &--unread {
    background: linear-gradient(135deg, #fefce8, #fef9c3);
    border-color: #fde68a;
    border-left: 3px solid #f97316;
  }

  &--blue {
    border-color: #bfdbfe;
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    animation: card-pulse-blue 3s ease-in-out infinite;
  }
  &--green  { border-color: #bbf7d0; background: linear-gradient(135deg, #f0fdf4, #dcfce7); }
  &--red    { border-color: #fecaca; background: linear-gradient(135deg, #fef2f2, #fee2e2);
    animation: card-pulse-red 2.5s ease-in-out infinite; }
  &--amber  { border-color: #fde68a; background: linear-gradient(135deg, #fffbeb, #fef3c7); }
  &--grey   { opacity: 1; }

  &__icon {
    width: 44px; min-width: 44px; height: 44px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    &--blue  { background: linear-gradient(135deg, #60a5fa, #2563eb); }
    &--green { background: linear-gradient(135deg, #4ade80, #16a34a); }
    &--red   { background: linear-gradient(135deg, #f87171, #dc2626); }
    &--amber { background: linear-gradient(135deg, #fbbf24, #d97706); }
    &--grey  { background: #f1f5f9; }

    // Override q-icon color to white for gradient icon containers
    &--blue, &--green, &--red, &--amber {
      :deep(.q-icon) { color: #fff !important; }
    }
  }

  &__body { flex: 1; min-width: 0; }
  &__title {
    font-size: 0.84rem;
    font-weight: 700;
    color: #0f172a;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  &__num { color: #2563eb; font-weight: 800; }
  &__meta, &__time {
    font-size: 0.68rem;
    color: #64748b;
    margin-top: 3px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  &__preview {
    font-size: 0.72rem;
    color: #475569;
    margin-top: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  &__dot { color: #cbd5e1; margin: 0 2px; }
  &__btn {
    border-radius: 10px !important;
    font-size: 0.72rem !important;
    font-weight: 700 !important;
    white-space: nowrap;
    flex-shrink: 0;
  }
}

@keyframes card-pulse-blue {
  0%,100% { box-shadow: 0 2px 8px rgba(59,130,246,0.1); }
  50%      { box-shadow: 0 4px 16px rgba(59,130,246,0.18); }
}
@keyframes card-pulse-red {
  0%,100% { box-shadow: 0 2px 8px rgba(239,68,68,0.1); }
  50%      { box-shadow: 0 4px 16px rgba(239,68,68,0.18); }
}

// ─── Unread dot ────────────────────────────────────────────────────────────
.unread-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ea580c);
  flex-shrink: 0;
  margin-left: 4px;
  box-shadow: 0 0 6px rgba(249, 115, 22, 0.5);
}

// ─── Ready banner ──────────────────────────────────────────────────────────
.ready-banner {
  display: flex; align-items: center;
  padding: 10px 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f0fdf4, #dcfce7);
  border: 1px solid #86efac;
  color: #15803d;
  font-size: 0.8rem;
  font-weight: 700;
  animation: banner-glow 2.5s ease-in-out infinite;
}
@keyframes banner-glow {
  0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.18); }
  50%      { box-shadow: 0 0 16px 2px rgba(34,197,94,0.12); }
}

// ─── Empty state ───────────────────────────────────────────────────────────
.notif-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 52px 24px 36px;
  text-align: center;

  &__icon {
    width: 72px; height: 72px; border-radius: 22px;
    background: linear-gradient(135deg, #4c1d95, #312e81);
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 16px;
    box-shadow: 0 8px 24px rgba(76, 29, 149, 0.3);
  }
  &__title {
    font-size: 0.95rem;
    font-weight: 700;
    color: #475569;
    margin-bottom: 6px;
  }
  &__sub {
    font-size: 0.72rem;
    color: #94a3b8;
    line-height: 1.5;
    max-width: 210px;
  }
}

// ─── Message dialog card ────────────────────────────────────────────────────
.msg-card {
  width: 360px; max-width: 92vw;
  border-radius: 20px !important;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);

  &__header {
    display: flex; align-items: center; gap: 12px;
    padding: 18px 18px 14px;
    background: linear-gradient(135deg, #312e81 0%, #4c1d95 100%);
  }
  &__hicon {
    width: 40px; height: 40px; border-radius: 12px;
    background: rgba(255,255,255,0.15);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  &__from   { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.55); }
  &__sender { font-size: 1rem; font-weight: 700; color: #fff; margin-top: 2px; }
  &__subject {
    font-size: 1rem; font-weight: 700; color: #1e293b; line-height: 1.3;
  }
  &__body {
    font-size: 0.88rem; color: #475569; line-height: 1.65;
    white-space: pre-wrap; word-break: break-word;
    padding: 14px 16px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px; min-height: 60px; margin-top: 8px;
  }
  &__time {
    display: flex; align-items: center;
    margin-top: 12px;
    font-size: 0.68rem; color: #94a3b8;
  }
}
</style>

/* ══════════════════════════════════════════════════
   DARK MODE OVERRIDES (NotificationsPage)
   ══════════════════════════════════════════════════ */
<style lang="scss">
body.body--dark {
  .notif-page {
    background: #0f172a;
    color: #e2e8f0;

    .notif-hero {
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1e1650 100%);
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    .notif-hero__title { color: #f8fafc; }
    .notif-hero__sub   { color: rgba(255,255,255,0.4); }

    .notif-tab {
      color: rgba(255,255,255,0.4);
      &--active { color: #fff; border-bottom-color: #f97316; }
    }

    .notif-content { background: #0f172a; }

    .section-sep { background: rgba(255,255,255,0.06); }

    .ncard {
      background: #1e293b;
      border-color: rgba(255,255,255,0.08);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      &:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
      &--unread {
        background: linear-gradient(135deg, rgba(254,252,232,0.06), rgba(254,249,195,0.03));
        border-color: rgba(253,230,138,0.2);
      }
      &--blue  { background: linear-gradient(135deg, rgba(59,130,246,0.1), rgba(37,99,235,0.05)); border-color: rgba(59,130,246,0.2); }
      &--green { background: linear-gradient(135deg, rgba(34,197,94,0.1), rgba(22,163,74,0.05)); border-color: rgba(34,197,94,0.2); }
      &--red   { background: linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.05)); border-color: rgba(239,68,68,0.2); }
      &--amber { background: linear-gradient(135deg, rgba(251,191,36,0.1), rgba(217,119,6,0.05)); border-color: rgba(251,191,36,0.2); }
      &__title { color: #f8fafc; }
      &__meta, &__time, &__preview { color: #64748b; }
    }

    .ready-banner {
      background: linear-gradient(135deg, rgba(22,163,74,0.12), rgba(16,185,129,0.06));
      border-color: rgba(134,239,172,0.2);
      color: #4ade80;
    }

    .notif-empty__title { color: #64748b; }
    .notif-empty__sub   { color: #475569; }

    .msg-card {
      background: #1e293b;
      &__subject { color: #f8fafc; }
      &__body { background: #0f172a; border-color: rgba(255,255,255,0.08); color: #94a3b8; }
      &__time { color: #64748b; }
    }
  }
}
</style>
