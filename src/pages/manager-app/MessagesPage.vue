<template>
  <q-page class="mgr-messages-page" :class="{ lt: !$q.dark.isActive }" padding>
    <!-- Page Header -->
    <div class="page-header q-mb-md">
      <div class="page-header__left">
        <div class="page-header__icon-wrap page-header__icon-wrap--indigo">
          <q-icon name="mail" size="20px" />
        </div>
        <div>
          <div class="page-header__title">Messages</div>
          <div class="page-header__sub">Team communication hub</div>
        </div>
      </div>
      <div class="row items-center q-gutter-xs">
        <q-btn flat round icon="edit" size="sm" class="page-header__action" @click="composeOpen = true">
          <q-tooltip>New Message</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          icon="refresh"
          size="sm"
          class="page-header__refresh"
          :loading="store.loading"
          @click="store.loadMessages()"
        />
      </div>
    </div>

    <!-- Filter -->
    <q-tabs
      v-model="filter"
      dense
      active-color="cyan"
      indicator-color="cyan"
      class="msg-tabs q-mb-md"
    >
      <q-tab name="all" label="All" no-caps />
      <q-tab name="unread" label="Unread" no-caps />
      <q-tab name="sent" label="Sent" no-caps />
    </q-tabs>

    <!-- Messages List -->
    <div v-if="filtered.length === 0" class="empty-state q-pa-lg">
      <q-icon name="inbox" size="40px" class="empty-state__icon" />
      <div class="empty-state__text">No messages</div>
    </div>
    <div v-else>
      <div
        v-for="msg in filtered"
        :key="msg.id"
        class="msg-card q-mb-sm"
        :class="{ 'msg-card--unread': !msg.is_read && !isSent(msg) }"
        @click="markRead(msg)"
      >
        <div class="row items-center q-pa-sm">
          <q-icon
            :name="msg.priority === 'urgent' ? 'priority_high' : 'mail_outline'"
            :color="msg.priority === 'urgent' ? 'red-5' : 'grey-6'"
            size="16px"
            class="q-mr-sm"
          />
          <div class="col">
            <div class="msg-subject">
              {{ msg.subject || 'No Subject' }}
            </div>
            <div class="msg-meta">
              {{
                isSent(msg)
                  ? `To: ${msg.receiver?.full_name || '—'}`
                  : `From: ${msg.sender?.full_name || '—'}`
              }}
            </div>
          </div>
          <!-- View Status Badge (for sent messages) -->
          <div v-if="isSent(msg)" class="q-mr-sm">
            <q-chip
              dense
              size="sm"
              outline
              :color="msg.is_read ? 'green-7' : 'grey-7'"
              :text-color="msg.is_read ? 'green-4' : 'grey-5'"
              :icon="msg.is_read ? 'visibility' : 'visibility_off'"
            >
              {{ msg.is_read ? 'Viewed' : 'Not Viewed' }}
            </q-chip>
          </div>
          <span class="msg-time">{{ fmtDate(msg.created_at) }}</span>
        </div>
        <div class="q-px-sm q-pb-sm msg-body">
          {{ truncate(msg.message_body, 120) }}
        </div>
        <!-- Read At info for sent messages -->
        <div v-if="isSent(msg) && msg.is_read && msg.read_at" class="q-px-sm q-pb-sm">
          <span class="msg-read-at">
            <q-icon name="done_all" size="12px" class="q-mr-xs" />
            Viewed {{ fmtDateFull(msg.read_at) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Compose Dialog -->
    <q-dialog v-model="composeOpen" position="bottom">
      <q-card class="compose-card">
        <q-bar class="compose-bar">
          <q-icon name="edit" /> <span class="q-ml-sm text-weight-bold">New Message</span>
          <q-space /> <q-btn flat dense icon="close" v-close-popup />
        </q-bar>
        <q-card-section>
          <q-select
            v-model="composeRecipient"
            :options="recipientOptions"
            dark
            filled
            dense
            label="To (Waiter)"
            option-label="label"
            option-value="value"
            emit-value
            map-options
            class="q-mb-md"
          />
          <q-input v-model="composeSubject" dark filled dense label="Subject" class="q-mb-md" />
          <q-input
            v-model="composeBody"
            dark
            filled
            label="Message"
            type="textarea"
            rows="3"
            class="q-mb-md"
          />
          <q-btn-toggle
            v-model="composePriority"
            toggle-color="cyan"
            :options="[
              { label: 'Normal', value: 'normal' },
              { label: '🚨 Urgent', value: 'urgent' },
            ]"
            no-caps
            dense
            spread
            flat
            text-color="grey-5"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup no-caps />
          <q-btn
            unelevated
            label="Send"
            color="cyan-8"
            icon="send"
            :loading="sending"
            :disable="!composeBody.trim() || !composeRecipient"
            @click="send"
            no-caps
            style="border-radius: 8px; font-weight: 700"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import { useQuasar } from 'quasar'

const store = useManagerAppStore()
const $q = useQuasar()
const filter = ref('all')

const filtered = computed(() => {
  const msgs = store.messages
  if (filter.value === 'unread') return msgs.filter((m) => !m.is_read)
  if (filter.value === 'sent') return msgs.filter((m) => isSent(m))
  return msgs
})

function isSent(msg) {
  // Compare with our waiters' employee IDs — if sender is not in waiter list, likely us
  return store.onShiftWaiters.every((w) => w.employee_id !== msg.sender_employee_id)
}

const recipientOptions = computed(() =>
  store.onShiftWaiters.map((w) => ({
    label: w.display_name || w.employee_name,
    value: w.employee_id,
  })),
)

const composeOpen = ref(false)
const composeRecipient = ref(null)
const composeSubject = ref('')
const composeBody = ref('')
const composePriority = ref('normal')
const sending = ref(false)

async function send() {
  if (!composeRecipient.value || !composeBody.value.trim()) return
  sending.value = true
  try {
    await store.sendMessage(
      composeRecipient.value,
      composeSubject.value,
      composeBody.value,
      composePriority.value,
    )
    $q.notify({ type: 'positive', message: '✅ Message sent', position: 'top' })
    composeOpen.value = false
    composeRecipient.value = null
    composeSubject.value = ''
    composeBody.value = ''
    composePriority.value = 'normal'
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  } finally {
    sending.value = false
  }
}

function markRead(msg) {
  if (!msg.is_read) store.markMessageRead(msg.id)
}

function fmtDate(dt) {
  return dt
    ? new Date(dt).toLocaleDateString('en', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
}
function fmtDateFull(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function truncate(str, len) {
  return (str || '').length > len ? str.slice(0, len) + '…' : str || ''
}
</script>

<style lang="scss" scoped>
.mgr-messages-page {
  min-height: 100vh;
  padding-bottom: 80px !important;
  background: #090c14;
}
.mgr-messages-page.lt {
  background: #f1f5f9;
}

// ─── Page Header ─────────────────────────────────────────────────────────────
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.page-header__icon-wrap {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-header__icon-wrap--indigo {
  background: rgba(99, 102, 241, 0.12);
  color: #6366f1;
}
.lt .page-header__icon-wrap--indigo {
  background: rgba(99, 102, 241, 0.08);
}
.page-header__title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #f3f4f6;
}
.lt .page-header__title {
  color: #1e293b;
}
.page-header__sub {
  font-size: 0.7rem;
  color: #6b7280;
  margin-top: 1px;
}
.lt .page-header__sub {
  color: #94a3b8;
}
.page-header__refresh {
  color: #6b7280 !important;
}
.page-header__action {
  color: #06b6d4 !important;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
.msg-tabs {
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: background 0.25s ease;
}
.lt .msg-tabs {
  background: #ffffff;
  border: 1px solid #e5e7eb;
}
.msg-tabs :deep(.q-tab) {
  font-size: 0.72rem;
  font-weight: 600;
  min-height: 38px;
}
.msg-tabs :deep(.q-tab) { color: #6b7280; }
.lt .msg-tabs :deep(.q-tab) { color: #94a3b8; }
.msg-tabs :deep(.q-tab--active) { color: #22d3ee; }
.lt .msg-tabs :deep(.q-tab--active) { color: #0891b2; }

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
  font-size: 0.78rem;
  color: #6b7280;
}

// ─── Message Cards ───────────────────────────────────────────────────────────
.msg-card {
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.msg-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.lt .msg-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.msg-card--unread {
  border-left: 3px solid #22d3ee !important;
}
.lt .msg-card--unread {
  border-left-color: #0891b2 !important;
}
.msg-card:active {
  border-color: rgba(34, 211, 238, 0.3);
}

.msg-subject {
  font-weight: 700;
  font-size: 0.85rem;
  color: #f3f4f6;
}
.lt .msg-subject {
  color: #1e293b;
}
.msg-meta {
  font-size: 0.72rem;
  color: #6b7280;
}
.lt .msg-meta {
  color: #94a3b8;
}
.msg-time {
  font-size: 0.68rem;
  color: #4b5563;
}
.lt .msg-time {
  color: #94a3b8;
}
.msg-body {
  font-size: 0.78rem;
  white-space: pre-wrap;
  color: #9ca3af;
}
.lt .msg-body {
  color: #64748b;
}
.msg-read-at {
  font-size: 0.7rem;
  color: #10b981;
}

// ─── Compose Dialog ──────────────────────────────────────────────────────────
.compose-card {
  width: 100%;
  max-width: 480px;
  background: #111827 !important;
  color: #fff !important;
  border-radius: 16px 16px 0 0 !important;
}
.compose-bar {
  background: #1f2937;
}
</style>
