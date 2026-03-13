<template>
  <q-page class="waiter-page-dark">
    <div class="inner-header q-px-md q-py-sm row items-center">
      <div class="text-weight-bold text-white">Notifications</div>
      <q-space />
      <q-badge v-if="store.unreadNotifCount > 0" color="red" class="q-mr-sm">
        {{ store.unreadNotifCount }} unread
      </q-badge>
      <q-btn v-if="store.unreadNotifCount > 0" flat dense no-caps color="orange-5" label="Read all"
        @click="store.markAllNotifsRead()" />
    </div>

    <div v-if="store.notifications.length === 0" class="empty-state">
      <q-icon name="notifications_none" size="52px" class="text-grey-7 q-mb-md" />
      <div class="text-grey-5">All caught up!</div>
    </div>

    <!-- Grouped notifications -->
    <div v-else class="q-pa-md">
      <!-- Urgent section -->
      <template v-if="urgentNotifs.length > 0">
        <div class="group-label q-mb-sm text-red-4">🚨 URGENT</div>
        <div v-for="notif in urgentNotifs" :key="notif.id"
          class="notif-card notif-card--urgent q-mb-sm"
          :class="{ 'notif-card--unread': !notif.is_read }"
          @click="store.markNotificationRead(notif.id)"
        >
          <div class="row items-start no-wrap q-pa-md">
            <div class="notif-icon-wrap notif-icon--red q-mr-md">
              <q-icon :name="notifIcon(notif.notification_type)" size="20px" color="red-4" />
            </div>
            <div class="col">
              <div class="text-white text-weight-bold">{{ notif.title }}</div>
              <div class="text-grey-4 text-caption q-mt-xs">{{ notif.body }}</div>
              <div class="text-grey-7 text-caption q-mt-xs">{{ fmtDate(notif.created_at) }}</div>
            </div>
            <q-badge v-if="!notif.is_read" color="red" rounded class="q-ml-sm" style="width:8px;height:8px;min-width:8px" />
          </div>
        </div>
      </template>

      <!-- Normal section -->
      <template v-if="normalNotifs.length > 0">
        <div class="group-label q-mb-sm q-mt-md">RECENT</div>
        <div v-for="notif in normalNotifs" :key="notif.id"
          class="notif-card q-mb-sm"
          :class="{ 'notif-card--unread': !notif.is_read }"
          @click="store.markNotificationRead(notif.id)"
        >
          <div class="row items-start no-wrap q-pa-md">
            <div class="notif-icon-wrap q-mr-md" :class="'notif-icon--' + notifTheme(notif.notification_type)">
              <q-icon :name="notifIcon(notif.notification_type)" size="20px" :color="notifColor(notif.notification_type)" />
            </div>
            <div class="col">
              <div class="text-white" :class="notif.is_read ? '' : 'text-weight-bold'">{{ notif.title }}</div>
              <div class="text-grey-5 text-caption q-mt-xs">{{ notif.body }}</div>
              <div class="text-grey-7 text-caption q-mt-xs">{{ fmtDate(notif.created_at) }}</div>
            </div>
            <q-badge v-if="!notif.is_read" color="orange" rounded class="q-ml-sm" style="width:8px;height:8px;min-width:8px" />
          </div>
        </div>
      </template>
    </div>

    <div style="height: 16px" />
  </q-page>
</template>

<script setup>
import { computed } from 'vue'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'

const store = useWaiterAppStore()

const urgentNotifs = computed(() => store.notifications.filter(n => n.priority === 'urgent'))
const normalNotifs = computed(() => store.notifications.filter(n => n.priority !== 'urgent'))

function notifIcon(type) {
  return { info: 'info', order_assigned: 'assignment', message_received: 'mail', points_earned: 'stars',
    schedule_change: 'event', urgent: 'priority_high', performance_review: 'assessment',
    shift_reminder: 'alarm', customer_rating: 'star' }[type] || 'notifications'
}
function notifTheme(type) {
  if (['urgent', 'performance_review'].includes(type)) return 'red'
  if (['message_received'].includes(type)) return 'blue'
  if (['points_earned', 'customer_rating'].includes(type)) return 'amber'
  if (['order_assigned'].includes(type)) return 'green'
  return 'grey'
}
function notifColor(type) {
  return { urgent: 'red-4', message_received: 'blue-4', points_earned: 'amber-4', order_assigned: 'green-4', customer_rating: 'amber-4' }[type] || 'grey-4'
}
function fmtDate(dt) {
  if (!dt) return ''
  const d = new Date(dt), now = new Date(), diffH = (now - d) / 3600000
  if (diffH < 1) return `${Math.max(1, Math.floor(diffH * 60))}m ago`
  if (diffH < 24) return `${Math.floor(diffH)}h ago`
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}
</script>

<style lang="scss" scoped>
@import './waiter-shared.scss';
.inner-header { background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05); height: 48px; }
.group-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #4b5563; }
.notif-card {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
  cursor: pointer; transition: background 0.12s;
  &:active { background: rgba(255,255,255,0.06); }
  &--unread { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
  &--urgent { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.06); animation: urgent-pulse 2s ease-in-out infinite; }
}
@keyframes urgent-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.15); } 50% { box-shadow: 0 0 8px 2px rgba(239,68,68,0.1); } }
.notif-icon-wrap {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06);
  &--red { background: rgba(248,113,113,0.1); } &--blue { background: rgba(96,165,250,0.1); }
  &--amber { background: rgba(251,191,36,0.1); } &--green { background: rgba(34,197,94,0.1); }
}
</style>
