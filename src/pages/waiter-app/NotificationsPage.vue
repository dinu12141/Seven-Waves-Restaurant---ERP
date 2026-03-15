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
          @click="handleNotifClick(notif)"
        >
          <div class="row items-start no-wrap q-pa-md">
            <div class="notif-icon-wrap notif-icon--red q-mr-md">
              <q-icon :name="notifIcon(notif.notification_type)" size="20px" color="red-4" />
            </div>
            <div class="col">
              <div class="text-white text-weight-bold">{{ notif.title }}</div>
              <div class="text-grey-4 text-caption q-mt-xs notif-body-preview">{{ notif.body }}</div>
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
          @click="handleNotifClick(notif)"
        >
          <div class="row items-start no-wrap q-pa-md">
            <div class="notif-icon-wrap q-mr-md" :class="'notif-icon--' + notifTheme(notif.notification_type)">
              <q-icon :name="notifIcon(notif.notification_type)" size="20px" :color="notifColor(notif.notification_type)" />
            </div>
            <div class="col">
              <div class="text-white" :class="notif.is_read ? '' : 'text-weight-bold'">{{ notif.title }}</div>
              <div class="text-grey-5 text-caption q-mt-xs notif-body-preview">{{ notif.body }}</div>
              <div class="text-grey-7 text-caption q-mt-xs">{{ fmtDate(notif.created_at) }}</div>
            </div>
            <q-badge v-if="!notif.is_read" color="orange" rounded class="q-ml-sm" style="width:8px;height:8px;min-width:8px" />
          </div>
        </div>
      </template>
    </div>

    <div style="height: 16px" />

    <!-- ─── Manager Message Detail Dialog ─────────────────────────────────── -->
    <q-dialog v-model="msgDialogOpen" position="standard">
      <q-card class="msg-detail-card">
        <!-- Header Bar -->
        <div class="msg-detail-header">
          <div class="msg-detail-header-icon">
            <q-icon name="mail" size="22px" color="white" />
          </div>
          <div class="col">
            <div class="msg-detail-label">Message from Manager</div>
            <div class="msg-detail-sender" v-if="msgDetail.sender_name">{{ msgDetail.sender_name }}</div>
          </div>
          <q-btn flat round dense icon="close" color="grey-4" @click="msgDialogOpen = false" />
        </div>

        <!-- Priority Badge -->
        <div class="q-px-lg q-pt-md">
          <q-badge
            :color="msgDetail.priority === 'urgent' ? 'red' : 'blue-grey-7'"
            :label="msgDetail.priority === 'urgent' ? '🚨 URGENT' : '📩 Normal'"
            class="msg-priority-badge"
          />
        </div>

        <!-- Subject -->
        <div class="q-px-lg q-pt-md">
          <div class="msg-detail-subject">{{ msgDetail.subject || 'No Subject' }}</div>
        </div>

        <!-- Message Body -->
        <div class="q-px-lg q-pt-sm q-pb-md">
          <div class="msg-detail-body">{{ msgDetail.message_body || '—' }}</div>
        </div>

        <!-- Timestamp -->
        <div class="msg-detail-footer">
          <q-icon name="access_time" size="13px" class="q-mr-xs" />
          {{ fmtDateFull(msgDetail.created_at) }}
        </div>

        <!-- Action Buttons -->
        <q-card-actions class="q-px-lg q-pb-lg q-pt-sm">
          <q-btn
            unelevated no-caps
            label="Got it"
            icon="check_circle"
            color="blue-9"
            class="full-width msg-got-it-btn"
            @click="msgDialogOpen = false"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Loading overlay for message fetch -->
    <q-inner-loading :showing="msgLoading" color="orange" />
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'

const store = useWaiterAppStore()

const urgentNotifs = computed(() => store.notifications.filter(n => n.payload?.priority === 'urgent'))
const normalNotifs = computed(() => store.notifications.filter(n => n.payload?.priority !== 'urgent'))

// Message detail dialog state
const msgDialogOpen = ref(false)
const msgLoading = ref(false)
const msgDetail = ref({
  subject: '',
  message_body: '',
  priority: 'normal',
  sender_name: '',
  created_at: null,
})

async function handleNotifClick(notif) {
  // Mark as read
  store.markNotificationRead(notif.id)

  // Check if this is a manager message notification (supports both type names)
  const isManagerMsg = ['manager_message', 'message_received'].includes(notif.notification_type)
  // Support both payload key formats
  const messageId = notif.payload?.manager_message_id || notif.payload?.message_id

  if (isManagerMsg && messageId) {
    msgLoading.value = true
    try {
      const { data, error } = await supabase
        .from('manager_messages')
        .select(`
          id, subject, message_body, priority, created_at, is_read,
          sender:sender_employee_id ( full_name )
        `)
        .eq('id', messageId)
        .maybeSingle()

      if (error) throw error

      if (data) {
        msgDetail.value = {
          subject: data.subject,
          message_body: data.message_body,
          priority: data.priority || notif.payload?.priority || 'normal',
          sender_name: data.sender?.full_name || 'Manager',
          created_at: data.created_at,
        }

        // Mark the manager_message as read too
        if (!data.is_read) {
          await supabase
            .from('manager_messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', data.id)
        }

        msgDialogOpen.value = true
      } else {
        // Message not found — show from notification data
        showFallbackMessage(notif)
      }
    } catch (e) {
      console.error('[Notifications] Failed to load message:', e)
      showFallbackMessage(notif)
    } finally {
      msgLoading.value = false
    }
  } else if (isManagerMsg) {
    // Manager message notification without a linked message_id — show inline
    showFallbackMessage(notif)
  }
}

function showFallbackMessage(notif) {
  msgDetail.value = {
    subject: notif.payload?.subject || notif.title,
    message_body: notif.body,
    priority: notif.payload?.priority || 'normal',
    sender_name: 'Manager',
    created_at: notif.created_at,
  }
  msgDialogOpen.value = true
}

function notifIcon(type) {
  return { info: 'info', order_assigned: 'assignment', message_received: 'mail', manager_message: 'mail',
    points_earned: 'stars', schedule_change: 'event', urgent: 'priority_high',
    performance_review: 'assessment', shift_reminder: 'alarm', customer_rating: 'star' }[type] || 'notifications'
}
function notifTheme(type) {
  if (['urgent', 'performance_review'].includes(type)) return 'red'
  if (['message_received', 'manager_message'].includes(type)) return 'blue'
  if (['points_earned', 'customer_rating'].includes(type)) return 'amber'
  if (['order_assigned'].includes(type)) return 'green'
  return 'grey'
}
function notifColor(type) {
  return { urgent: 'red-4', message_received: 'blue-4', manager_message: 'blue-4',
    points_earned: 'amber-4', order_assigned: 'green-4', customer_rating: 'amber-4' }[type] || 'grey-4'
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
  return new Date(dt).toLocaleString('en', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
</script>

<style lang="scss" scoped>
@import './waiter-shared.scss';
.inner-header { background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05); height: 48px; }
.group-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #4b5563; }
.notif-card {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
  cursor: pointer; transition: all 0.15s ease;
  &:active { background: rgba(255,255,255,0.08); transform: scale(0.98); }
  &--unread { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
  &--urgent { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.06); animation: urgent-pulse 2s ease-in-out infinite; }
}
.notif-body-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
@keyframes urgent-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.15); } 50% { box-shadow: 0 0 8px 2px rgba(239,68,68,0.1); } }
.notif-icon-wrap {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06);
  &--red { background: rgba(248,113,113,0.1); } &--blue { background: rgba(96,165,250,0.1); }
  &--amber { background: rgba(251,191,36,0.1); } &--green { background: rgba(34,197,94,0.1); }
}

/* ─── Message Detail Card ───────────────────────────── */
.msg-detail-card {
  width: 360px;
  max-width: 92vw;
  border-radius: 20px !important;
  background: #111827 !important;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  overflow: hidden;
}
.msg-detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 14px;
  background: linear-gradient(135deg, #1e3a5f 0%, #1a237e 100%);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.msg-detail-header-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(255,255,255,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.msg-detail-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.5);
}
.msg-detail-sender {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
  margin-top: 2px;
}
.msg-priority-badge {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 4px 12px;
  border-radius: 6px;
}
.msg-detail-subject {
  font-size: 1.1rem;
  font-weight: 700;
  color: #e5e7eb;
  line-height: 1.3;
}
.msg-detail-body {
  font-size: 0.92rem;
  color: #9ca3af;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 14px 16px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 12px;
  min-height: 60px;
}
.msg-detail-footer {
  display: flex;
  align-items: center;
  padding: 0 24px 4px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #4b5563;
}
.msg-got-it-btn {
  height: 46px;
  border-radius: 12px !important;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.3px;
}
</style>
