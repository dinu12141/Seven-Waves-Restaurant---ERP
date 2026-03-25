<template>
  <q-btn flat round dense icon="notifications" class="q-mr-sm notif-btn" id="notification-bell">
    <!-- Animated unread badge -->
    <q-badge v-if="unreadCount > 0" color="red" floating rounded class="notif-badge">
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </q-badge>

    <!-- Pulse ring when new notification arrives -->
    <div v-if="hasNewNotification" class="pulse-ring" />

    <q-menu
      anchor="bottom right"
      self="top right"
      class="notif-menu"
      transition-show="jump-down"
      transition-hide="jump-up"
      :offset="[0, 8]"
      @before-show="onMenuOpen"
    >
      <!-- Header -->
      <div class="notif-header">
        <div class="row items-center q-gutter-x-sm">
          <div class="notif-header-icon">
            <q-icon name="notifications_active" size="18px" />
          </div>
          <span class="text-subtitle1 text-weight-bold notif-header-title">Notifications</span>
          <q-badge v-if="unreadCount > 0" color="red" rounded class="unread-header-badge">
            {{ unreadCount }}
          </q-badge>
        </div>
        <div class="row q-gutter-x-xs">
          <q-btn
            v-if="unreadCount > 0"
            flat
            dense
            round
            icon="done_all"
            size="sm"
            class="header-action-btn"
            @click="markAllRead"
          >
            <q-tooltip class="text-caption">Mark all read</q-tooltip>
          </q-btn>
          <q-btn
            v-if="notifications.length > 0"
            flat
            dense
            round
            icon="delete_sweep"
            size="sm"
            class="header-action-btn danger"
            @click="confirmClearAll"
          >
            <q-tooltip class="text-caption">Clear all</q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- Tab Filters -->
      <div class="notif-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="tab-pill"
          :class="{ active: activeTab === tab.value }"
          @click="activeTab = tab.value"
        >
          <q-icon v-if="tab.icon" :name="tab.icon" size="14px" class="q-mr-xs" />
          {{ tab.label }}
          <q-badge
            v-if="tab.value === 'unread' && unreadCount > 0"
            color="red"
            rounded
            class="tab-badge"
          >
            {{ unreadCount }}
          </q-badge>
        </button>
      </div>

      <!-- Notification List -->
      <q-scroll-area style="height: 400px; width: 400px" class="notif-scroll">
        <transition-group name="notif-list" tag="div" class="notif-list-container">
          <template v-if="filteredNotifications.length > 0">
            <!-- Group by date -->
            <template v-for="group in groupedNotifications" :key="group.label">
              <div class="date-separator">
                <span class="date-label">{{ group.label }}</span>
              </div>

              <div
                v-for="notif in group.items"
                :key="notif.id"
                class="notif-card"
                :class="{ unread: !notif.is_read }"
                @click="handleClick(notif)"
              >
                <!-- Left accent bar -->
                <div class="accent-bar" :style="{ background: getGradient(notif.type) }" />

                <!-- Icon -->
                <div class="notif-icon-wrap" :style="{ background: getIconBg(notif.type) }">
                  <q-icon :name="getIcon(notif.type)" size="18px" color="white" />
                </div>

                <!-- Content -->
                <div class="notif-content">
                  <div class="notif-title-row">
                    <span class="notif-title">{{ notif.title }}</span>
                    <span class="notif-time">{{ timeAgo(notif.created_at) }}</span>
                  </div>
                  <div class="notif-message">{{ notif.message }}</div>
                  <div v-if="notif.action_url" class="notif-action">
                    <q-icon name="open_in_new" size="11px" class="q-mr-xs" />
                    View details
                  </div>
                </div>

                <!-- Actions -->
                <div class="notif-actions">
                  <div v-if="!notif.is_read" class="unread-dot" />
                  <q-btn
                    flat
                    dense
                    round
                    icon="close"
                    size="xs"
                    class="dismiss-btn"
                    @click.stop="deleteNotification(notif.id)"
                  >
                    <q-tooltip class="text-caption">Dismiss</q-tooltip>
                  </q-btn>
                </div>
              </div>
            </template>
          </template>

          <!-- Empty state -->
          <div v-if="filteredNotifications.length === 0" key="empty" class="empty-state">
            <div class="empty-icon-wrap">
              <q-icon name="notifications_off" size="40px" color="grey-7" />
            </div>
            <div class="text-grey-5 text-subtitle2 q-mt-md">
              {{ activeTab === 'all' ? 'No notifications yet' : `No ${activeTab} notifications` }}
            </div>
            <div class="text-grey-7 text-caption q-mt-xs">You're all caught up! 🎉</div>
          </div>
        </transition-group>
      </q-scroll-area>

      <!-- Footer -->
      <div class="notif-footer">
        <q-btn flat no-caps dense class="footer-btn" @click="goToNotifications">
          <span>View All Notifications</span>
          <q-icon name="arrow_forward" size="16px" class="q-ml-xs" />
        </q-btn>
      </div>
    </q-menu>
  </q-btn>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useNotificationStore } from 'src/stores/notifications'
import { useAuthStore } from 'src/stores/auth'

const $q = useQuasar()
const router = useRouter()
const store = useNotificationStore()
const authStore = useAuthStore()

const activeTab = ref('all')
const hasNewNotification = ref(false)
let pulseTimeout = null

const tabs = [
  { label: 'All', value: 'all', icon: 'inbox' },
  { label: 'Unread', value: 'unread', icon: 'mark_email_unread' },
  { label: 'Orders', value: 'orders', icon: 'receipt_long' },
  { label: 'Kitchen', value: 'kitchen', icon: 'soup_kitchen' },
]

// ── Computed ─────────────────────────────────────────────────────────────────
const notifications = computed(() => store.notifications)
const unreadCount = computed(() => store.unreadCount)

const filteredNotifications = computed(() => {
  let list = notifications.value
  if (activeTab.value === 'unread') {
    list = list.filter((n) => !n.is_read)
  } else if (activeTab.value === 'orders') {
    list = list.filter((n) => ['order_new', 'order_accepted', 'payment_complete'].includes(n.type))
  } else if (activeTab.value === 'kitchen') {
    list = list.filter((n) => ['kitchen_ready', 'order_accepted'].includes(n.type))
  }
  return list
})

// Group notifications by date
const groupedNotifications = computed(() => {
  const groups = []
  const now = new Date()
  const today = now.toDateString()
  const yesterday = new Date(now - 86400000).toDateString()

  let currentLabel = null
  let currentGroup = null

  for (const notif of filteredNotifications.value) {
    const dateStr = new Date(notif.created_at).toDateString()
    let label
    if (dateStr === today) label = 'Today'
    else if (dateStr === yesterday) label = 'Yesterday'
    else
      label = new Date(notif.created_at).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })

    if (label !== currentLabel) {
      currentLabel = label
      currentGroup = { label, items: [] }
      groups.push(currentGroup)
    }
    currentGroup.items.push(notif)
  }
  return groups
})

// ── Watch for new notifications → animate pulse ─────────────────────────────
watch(
  () => store.notifications.length,
  (newLen, oldLen) => {
    if (newLen > oldLen) {
      hasNewNotification.value = true
      clearTimeout(pulseTimeout)
      pulseTimeout = setTimeout(() => {
        hasNewNotification.value = false
      }, 3000)
    }
  },
)

// ── Actions ──────────────────────────────────────────────────────────────────
function onMenuOpen() {
  hasNewNotification.value = false
}

function handleClick(notif) {
  store.markRead(notif.id)
  if (notif.action_url) {
    // When clicking a delivery/order notification bound for POS,
    // pass the order_id as a query param so POS auto-opens billing
    if (notif.ref_type === 'order' && notif.ref_id && notif.action_url === '/pos') {
      router.push({ path: '/pos', query: { order_id: notif.ref_id } }).catch(() => {})
    } else {
      router.push(notif.action_url).catch(() => {})
    }
  }
}

function markAllRead() {
  store.markAllRead()
}

function confirmClearAll() {
  $q.dialog({
    title: 'Clear All Notifications',
    message: 'Are you sure you want to delete all notifications? This cannot be undone.',
    cancel: true,
    persistent: false,
    color: 'negative',
    dark: true,
  }).onOk(() => {
    store.clearAll()
  })
}

function deleteNotification(id) {
  store.deleteNotification(id)
}

function goToNotifications() {
  // Future: navigate to dedicated notifications page
  // router.push('/notifications')
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getIcon(type) {
  const icons = {
    order_new: 'restaurant_menu',
    order_accepted: 'thumb_up_alt',
    delivery_accepted: 'delivery_dining',
    kitchen_ready: 'check_circle',
    payment_complete: 'payments',
    warning: 'warning_amber',
    alert: 'error_outline',
    system: 'settings_suggest',
    info: 'info_outline',
  }
  return icons[type] || 'info_outline'
}

function getGradient(type) {
  const gradients = {
    order_new: 'linear-gradient(135deg, #2196F3, #42A5F5)',
    order_accepted: 'linear-gradient(135deg, #FF9800, #FFB74D)',
    delivery_accepted: 'linear-gradient(135deg, #FF5722, #FF7043)',
    kitchen_ready: 'linear-gradient(135deg, #4CAF50, #66BB6A)',
    payment_complete: 'linear-gradient(135deg, #009688, #4DB6AC)',
    warning: 'linear-gradient(135deg, #FFC107, #FFD54F)',
    alert: 'linear-gradient(135deg, #F44336, #EF5350)',
    system: 'linear-gradient(135deg, #607D8B, #90A4AE)',
    info: 'linear-gradient(135deg, #78909C, #B0BEC5)',
  }
  return gradients[type] || gradients.info
}

function getIconBg(type) {
  const bgs = {
    order_new: 'rgba(33, 150, 243, 0.2)',
    order_accepted: 'rgba(255, 152, 0, 0.2)',
    delivery_accepted: 'rgba(255, 87, 34, 0.2)',
    kitchen_ready: 'rgba(76, 175, 80, 0.2)',
    payment_complete: 'rgba(0, 150, 136, 0.2)',
    warning: 'rgba(255, 193, 7, 0.2)',
    alert: 'rgba(244, 67, 54, 0.2)',
    system: 'rgba(96, 125, 139, 0.2)',
    info: 'rgba(120, 144, 156, 0.2)',
  }
  return bgs[type] || bgs.info
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 30) return 'Just now'
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  if (authStore.user?.id) {
    store.initialize(authStore.user.id)
  }
})

onUnmounted(() => {
  clearTimeout(pulseTimeout)
})
</script>

<style scoped>
/* ── Button & Badge ── */
.notif-btn {
  position: relative;
}

.notif-badge {
  font-size: 10px;
  min-height: 17px;
  min-width: 17px;
  padding: 2px 5px;
  font-weight: 700;
  letter-spacing: -0.2px;
  animation: badge-pulse 2s infinite;
  z-index: 2;
}

.pulse-ring {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid #f44336;
  animation: pulse-expand 1.5s ease-out infinite;
  pointer-events: none;
  z-index: 1;
}

@keyframes badge-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(244, 67, 54, 0);
  }
}

@keyframes pulse-expand {
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}

/* ── Menu Container ── */
.notif-menu {
  background: var(--erp-bg-elevated) !important;
  border: 1px solid var(--erp-border) !important;
  border-radius: 16px !important;
  overflow: hidden;
  box-shadow: var(--erp-shadow-lg) !important;
  backdrop-filter: blur(20px);
}

/* ── Header ── */
.notif-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  background: var(--erp-bg-card-hover);
  border-bottom: 1px solid var(--erp-border);
}

.notif-header-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(33, 150, 243, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #42a5f5;
}

.notif-header-title {
  color: var(--erp-text-primary);
}

.unread-header-badge {
  font-size: 10px;
  font-weight: 700;
  animation: badge-pulse 2s infinite;
}

.header-action-btn {
  color: var(--erp-text-muted) !important;
  transition: all 0.2s ease;
}
.header-action-btn:hover {
  color: #42a5f5 !important;
  background: rgba(33, 150, 243, 0.1) !important;
}
.header-action-btn.danger:hover {
  color: #ef5350 !important;
  background: rgba(244, 67, 54, 0.1) !important;
}

/* ── Tab Pills ── */
.notif-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 14px;
  background: var(--erp-bg-card-hover);
  border-bottom: 1px solid var(--erp-border);
  overflow-x: auto;
}

.tab-pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.2px;
  color: var(--erp-text-muted);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.tab-pill:hover {
  color: var(--erp-text-secondary);
  background: var(--erp-bg-hover);
}
.tab-pill.active {
  color: #42a5f5;
  background: rgba(33, 150, 243, 0.1);
  border-color: rgba(33, 150, 243, 0.2);
}

.tab-badge {
  font-size: 9px;
  min-height: 14px;
  min-width: 14px;
  padding: 0 4px;
  margin-left: 4px;
}

/* ── Scroll Area ── */
.notif-scroll {
  background: transparent;
}

.notif-list-container {
  padding: 4px 0;
}

/* ── Date Separator ── */
.date-separator {
  padding: 10px 18px 4px;
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--erp-bg-elevated);
}

.date-label {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--erp-text-muted);
}

/* ── Notification Card ── */
.notif-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px 10px 10px;
  margin: 2px 8px;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
}

.notif-card:hover {
  background: var(--erp-bg-hover);
}

.notif-card.unread {
  background: rgba(33, 150, 243, 0.04);
}
.notif-card.unread:hover {
  background: rgba(33, 150, 243, 0.08);
}

/* Left accent bar */
.accent-bar {
  width: 3px;
  min-height: 40px;
  border-radius: 3px;
  flex-shrink: 0;
  align-self: stretch;
  opacity: 0.7;
}

.notif-card.unread .accent-bar {
  opacity: 1;
}

/* Icon */
.notif-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Content */
.notif-content {
  flex: 1;
  min-width: 0;
}

.notif-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.notif-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--erp-text-primary);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-card.unread .notif-title {
  color: var(--erp-text-primary);
  font-weight: 700;
}

.notif-time {
  font-size: 0.62rem;
  color: var(--erp-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.notif-message {
  font-size: 0.7rem;
  color: var(--erp-text-secondary);
  line-height: 1.4;
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notif-action {
  display: inline-flex;
  align-items: center;
  font-size: 0.62rem;
  color: #42a5f5;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.notif-card:hover .notif-action {
  opacity: 1;
}

/* Actions */
.notif-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding-top: 2px;
}

.unread-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2196f3;
  box-shadow: 0 0 6px rgba(33, 150, 243, 0.5);
}

.dismiss-btn {
  opacity: 0;
  color: var(--erp-text-muted) !important;
  transition: all 0.15s ease;
}
.notif-card:hover .dismiss-btn {
  opacity: 1;
}
.dismiss-btn:hover {
  color: #ef5350 !important;
}

/* ── Empty State ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  padding: 40px 20px;
}

.empty-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: var(--erp-bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Footer ── */
.notif-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--erp-border);
  background: var(--erp-bg-card-hover);
}

.footer-btn {
  width: 100%;
  color: var(--erp-text-muted) !important;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.3px;
  border-radius: 8px;
  transition: all 0.2s ease;
}
.footer-btn:hover {
  color: #42a5f5 !important;
  background: rgba(33, 150, 243, 0.08) !important;
}

/* ── Transitions ── */
.notif-list-enter-active {
  transition: all 0.3s ease;
}
.notif-list-leave-active {
  transition: all 0.2s ease;
}
.notif-list-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.notif-list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
