<template>
  <q-page class="wm-page">
    <!-- ── Page Header ────────────────────────────────────────── -->
    <div class="wm-header">
      <div class="wm-header__left">
        <div class="wm-header__breadcrumb">
          <span class="wm-header__breadcrumb-item">WEBSITE</span>
          <span class="wm-header__breadcrumb-sep">/</span>
          <span class="wm-header__breadcrumb-item wm-header__breadcrumb-item--active"
            >Contact Messages</span
          >
        </div>
        <h1 class="wm-header__title">Website Messages</h1>
        <p class="wm-header__subtitle">Manage messages sent from the website contact page</p>
      </div>
      <div class="wm-header__right">
        <q-btn
          unelevated
          no-caps
          dense
          icon="refresh"
          label="Refresh"
          class="wm-btn wm-btn--ghost"
          :loading="loading"
          @click="fetchMessages"
        />
      </div>
    </div>

    <!-- ── KPI Strip ──────────────────────────────────────────── -->
    <div class="wm-kpi-row">
      <div class="wm-kpi wm-kpi--blue">
        <div class="wm-kpi__icon"><q-icon name="mail" size="18px" /></div>
        <div class="wm-kpi__body">
          <div class="wm-kpi__value">{{ totalCount }}</div>
          <div class="wm-kpi__label">Total Messages</div>
        </div>
      </div>
      <div class="wm-kpi wm-kpi--red">
        <div class="wm-kpi__icon wm-kpi__icon--danger">
          <q-icon name="mark_email_unread" size="18px" />
        </div>
        <div class="wm-kpi__body">
          <div class="wm-kpi__value">{{ unreadCount }}</div>
          <div class="wm-kpi__label">Unread</div>
        </div>
      </div>
      <div class="wm-kpi wm-kpi--green">
        <div class="wm-kpi__icon wm-kpi__icon--success">
          <q-icon name="mark_email_read" size="18px" />
        </div>
        <div class="wm-kpi__body">
          <div class="wm-kpi__value">{{ readCount }}</div>
          <div class="wm-kpi__label">Read</div>
        </div>
      </div>
    </div>

    <!-- ── Filter Bar ─────────────────────────────────────────── -->
    <div class="wm-filter-bar">
      <q-input
        v-model="search"
        dense
        outlined
        clearable
        placeholder="Search by name, email, subject..."
        class="wm-filter-input"
      >
        <template #prepend>
          <q-icon name="search" size="16px" />
        </template>
      </q-input>
      <q-select
        v-model="statusFilter"
        :options="statusOptions"
        dense
        outlined
        emit-value
        map-options
        class="wm-filter-select"
        placeholder="All statuses"
      />
      <q-space />
      <div class="wm-live-badge" v-if="isLive">
        <span class="wm-live-badge__dot"></span>
        LIVE
      </div>
    </div>

    <!-- ── Data Table ─────────────────────────────────────────── -->
    <div class="wm-table-card">
      <q-table
        :rows="filteredMessages"
        :columns="columns"
        row-key="id"
        flat
        dense
        :loading="loading"
        :rows-per-page-options="[15, 30, 50]"
        :pagination="{ rowsPerPage: 15 }"
        separator="none"
        class="wm-table"
      >
        <!-- Header -->
        <template #header="props">
          <q-tr :props="props" class="wm-table__header">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="wm-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <!-- Body Rows -->
        <template #body="props">
          <q-tr
            :props="props"
            class="wm-table__row"
            :class="{ 'wm-table__row--unread': props.row.status === 'unread' }"
          >
            <q-td key="name" :props="props">
              <div class="wm-cell-name">
                <q-avatar
                  size="28px"
                  class="wm-cell-avatar"
                  :class="props.row.status === 'unread' ? 'wm-cell-avatar--unread' : ''"
                >
                  {{ (props.row.name || 'U')[0].toUpperCase() }}
                </q-avatar>
                <div>
                  <div class="wm-cell-name__text">{{ props.row.name }}</div>
                  <div class="wm-cell-name__email">{{ props.row.email }}</div>
                </div>
              </div>
            </q-td>
            <q-td key="subject" :props="props">
              <div class="wm-cell-subject">{{ props.row.subject || 'No Subject' }}</div>
              <div class="wm-cell-preview">
                {{ (props.row.message || '').substring(0, 60)
                }}{{ (props.row.message || '').length > 60 ? '...' : '' }}
              </div>
            </q-td>
            <q-td key="status" :props="props">
              <span class="wm-status-badge" :class="`wm-status-badge--${props.row.status}`">
                {{ props.row.status.toUpperCase() }}
              </span>
            </q-td>
            <q-td key="created_at" :props="props" class="wm-cell-date">
              {{ formatDate(props.row.created_at) }}
            </q-td>
            <q-td key="actions" :props="props">
              <div class="wm-actions">
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="visibility"
                  class="wm-action-btn"
                  @click="viewMessage(props.row)"
                >
                  <q-tooltip>View Message</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="check_circle"
                  class="wm-action-btn wm-action-btn--success"
                  v-if="props.row.status === 'unread'"
                  @click="markAsRead(props.row)"
                >
                  <q-tooltip>Mark as Read</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="delete_outline"
                  class="wm-action-btn wm-action-btn--danger"
                  @click="deleteMessage(props.row)"
                >
                  <q-tooltip>Delete</q-tooltip>
                </q-btn>
              </div>
            </q-td>
          </q-tr>
        </template>

        <!-- Loading -->
        <template #loading>
          <q-inner-loading showing>
            <q-spinner-gears size="36px" color="primary" />
          </q-inner-loading>
        </template>

        <!-- Empty -->
        <template #no-data>
          <div class="wm-empty">
            <q-icon name="mail_outline" size="48px" />
            <div class="wm-empty__text">No messages found</div>
            <div class="wm-empty__sub">Messages from the website contact form will appear here</div>
          </div>
        </template>
      </q-table>
    </div>

    <!-- ── View Dialog ────────────────────────────────────────── -->
    <q-dialog v-model="viewDialog" transition-show="scale" transition-hide="scale">
      <div class="wm-dialog">
        <!-- Dialog Header -->
        <div class="wm-dialog__header">
          <div class="wm-dialog__header-left">
            <q-avatar size="36px" class="wm-dialog__avatar">
              {{ (selectedMessage?.name || 'U')[0].toUpperCase() }}
            </q-avatar>
            <div>
              <div class="wm-dialog__sender">{{ selectedMessage?.name }}</div>
              <div class="wm-dialog__email">{{ selectedMessage?.email }}</div>
            </div>
          </div>
          <q-btn icon="close" flat round dense class="wm-dialog__close" v-close-popup />
        </div>

        <!-- Dialog Body -->
        <div class="wm-dialog__body">
          <div class="wm-dialog__meta-grid">
            <div class="wm-dialog__meta-item">
              <span class="wm-dialog__meta-label">Phone</span>
              <span class="wm-dialog__meta-value">{{ selectedMessage?.phone || 'N/A' }}</span>
            </div>
            <div class="wm-dialog__meta-item">
              <span class="wm-dialog__meta-label">Received</span>
              <span class="wm-dialog__meta-value">{{
                selectedMessage ? formatDate(selectedMessage.created_at) : ''
              }}</span>
            </div>
            <div class="wm-dialog__meta-item">
              <span class="wm-dialog__meta-label">Status</span>
              <span class="wm-status-badge" :class="`wm-status-badge--${selectedMessage?.status}`">
                {{ (selectedMessage?.status || '').toUpperCase() }}
              </span>
            </div>
          </div>

          <div class="wm-dialog__divider"></div>

          <div class="wm-dialog__subject-label">Subject</div>
          <div class="wm-dialog__subject">{{ selectedMessage?.subject || 'No Subject' }}</div>

          <div class="wm-dialog__message-label">Message</div>
          <div class="wm-dialog__message">{{ selectedMessage?.message }}</div>
        </div>

        <!-- Dialog Footer -->
        <div class="wm-dialog__footer">
          <q-btn flat no-caps label="Close" class="wm-btn wm-btn--ghost" v-close-popup />
          <q-btn
            v-if="selectedMessage?.status === 'unread'"
            unelevated
            no-caps
            icon="check_circle"
            label="Mark as Read"
            class="wm-btn wm-btn--success"
            @click="markAsRead(selectedMessage)"
          />
          <q-btn
            v-else-if="selectedMessage?.status === 'read'"
            unelevated
            no-caps
            icon="mark_email_unread"
            label="Mark Unread"
            class="wm-btn wm-btn--warning"
            @click="markAsUnread(selectedMessage)"
          />
        </div>
      </div>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useQuasar } from 'quasar'
import { date } from 'quasar'

const $q = useQuasar()
const loading = ref(false)
const messages = ref([])
const viewDialog = ref(false)
const selectedMessage = ref(null)
const search = ref('')
const statusFilter = ref(null)
const isLive = ref(true)

const statusOptions = [
  { label: 'All Statuses', value: null },
  { label: 'Unread', value: 'unread' },
  { label: 'Read', value: 'read' },
  { label: 'Archived', value: 'archived' },
]

const columns = [
  { name: 'name', label: 'Sender', field: 'name', align: 'left', sortable: true },
  { name: 'subject', label: 'Subject', field: 'subject', align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'created_at', label: 'Received', field: 'created_at', align: 'left', sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

// ── KPIs ──────────────────────────────────────────────────────────
const totalCount = computed(() => messages.value.length)
const unreadCount = computed(() => messages.value.filter((m) => m.status === 'unread').length)
const readCount = computed(() => messages.value.filter((m) => m.status === 'read').length)

// ── Filtered messages ─────────────────────────────────────────────
const filteredMessages = computed(() => {
  let result = messages.value
  if (statusFilter.value) {
    result = result.filter((m) => m.status === statusFilter.value)
  }
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(
      (m) =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.subject || '').toLowerCase().includes(q),
    )
  }
  return result
})

// ── Data ──────────────────────────────────────────────────────────
const fetchMessages = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('website_messages')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    messages.value = data || []
  } catch (error) {
    console.error('Error fetching messages:', error)
    $q.notify({ type: 'negative', message: 'Failed to fetch messages' })
  } finally {
    loading.value = false
  }
}

const viewMessage = (msg) => {
  selectedMessage.value = msg
  viewDialog.value = true
}

const updateStatus = async (msg, newStatus) => {
  try {
    $q.loading.show()
    const { error } = await supabase
      .from('website_messages')
      .update({ status: newStatus })
      .eq('id', msg.id)

    if (error) throw error

    const index = messages.value.findIndex((m) => m.id === msg.id)
    if (index !== -1) messages.value[index].status = newStatus
    if (selectedMessage.value && selectedMessage.value.id === msg.id) {
      selectedMessage.value.status = newStatus
    }

    $q.notify({ type: 'positive', message: `Message marked as ${newStatus}` })
  } catch (error) {
    console.error('Error updating status:', error)
    $q.notify({ type: 'negative', message: 'Failed to update message status' })
  } finally {
    $q.loading.hide()
  }
}

const markAsRead = (msg) => updateStatus(msg, 'read')
const markAsUnread = (msg) => updateStatus(msg, 'unread')

const deleteMessage = async (msg) => {
  $q.dialog({
    title: 'Confirm Deletion',
    message: `Are you sure you want to delete the message from ${msg.name}?`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      $q.loading.show()
      const { error } = await supabase.from('website_messages').delete().eq('id', msg.id)

      if (error) throw error

      messages.value = messages.value.filter((m) => m.id !== msg.id)
      $q.notify({ type: 'positive', message: 'Message deleted successfully' })
      if (viewDialog.value && selectedMessage.value?.id === msg.id) {
        viewDialog.value = false
      }
    } catch (error) {
      console.error('Error deleting message:', error)
      $q.notify({ type: 'negative', message: 'Failed to delete message' })
    } finally {
      $q.loading.hide()
    }
  })
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return date.formatDate(dateStr, 'MMM DD, YYYY hh:mm A')
}

onMounted(() => {
  fetchMessages()

  supabase
    .channel('website_messages_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'website_messages' }, () => {
      fetchMessages()
    })
    .subscribe()
})
</script>

<style scoped lang="scss">
/* ── Page ─────────────────────────────────────────────────────────── */
.wm-page {
  padding: var(--erp-spacing-lg);
  background: var(--erp-bg-main);
  min-height: 100vh;
}

/* ── Header ───────────────────────────────────────────────────────── */
.wm-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: var(--erp-spacing-md);

  &__left {
    flex: 1;
  }

  &__breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  &__breadcrumb-item,
  &__breadcrumb-sep {
    font-size: var(--erp-font-size-caption);
    font-weight: var(--erp-font-weight-bold);
    color: var(--erp-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  &__breadcrumb-item--active {
    color: var(--erp-text-secondary);
    font-weight: var(--erp-font-weight-black);
  }

  &__title {
    font-size: var(--erp-font-size-h1);
    font-weight: var(--erp-font-weight-black);
    color: var(--erp-text-primary);
    margin: 0;
    line-height: 1.1;
    letter-spacing: -0.5px;
  }
  &__subtitle {
    font-size: var(--erp-font-size-table);
    color: var(--erp-text-muted);
    margin: 6px 0 0;
  }
  &__right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
}

/* ── KPI Row ──────────────────────────────────────────────────────── */
.wm-kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: var(--erp-spacing-md);
}
.wm-kpi {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg);
  border-top: 2px solid transparent;

  &--blue {
    border-top-color: var(--erp-primary);
  }
  &--red {
    border-top-color: var(--erp-danger);
  }
  &--green {
    border-top-color: var(--erp-success);
  }

  &__icon {
    width: 36px;
    height: 36px;
    border-radius: var(--erp-radius-md);
    background: var(--erp-primary-subtle);
    color: var(--erp-primary-light);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &--danger {
      background: var(--erp-danger-subtle);
      color: var(--erp-danger);
    }
    &--success {
      background: var(--erp-success-subtle);
      color: var(--erp-success);
    }
  }
  &__value {
    font-size: 20px;
    font-weight: var(--erp-font-weight-black);
    color: var(--erp-text-primary);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  &__label {
    font-size: var(--erp-font-size-caption);
    color: var(--erp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-top: 2px;
  }
}

/* ── Filter Bar ───────────────────────────────────────────────────── */
.wm-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg);
  margin-bottom: var(--erp-spacing-md);
}
.wm-filter-input {
  flex: 0 1 320px;
  font-size: var(--erp-font-size-table);
}
.wm-filter-select {
  flex: 0 1 180px;
  font-size: var(--erp-font-size-table);
}

.wm-live-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--erp-font-size-tiny);
  font-weight: var(--erp-font-weight-bold);
  color: var(--erp-success);
  letter-spacing: 0.5px;

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--erp-success);
    box-shadow: 0 0 6px var(--erp-success);
    animation: live-pulse 1.5s infinite;
  }
}
@keyframes live-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

/* ── Table ─────────────────────────────────────────────────────────── */
.wm-table-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg);
  overflow: hidden;
}
.wm-table {
  background: transparent !important;
  font-size: var(--erp-font-size-table) !important;
}
.wm-table__header {
  background: var(--erp-bg-stripe) !important;
}
.wm-table__th {
  font-size: var(--erp-font-size-caption) !important;
  font-weight: var(--erp-font-weight-bold) !important;
  color: var(--erp-text-secondary) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.4px !important;
  border-bottom: 1px solid var(--erp-border) !important;
  padding: 10px 14px !important;
  white-space: nowrap;
}
.wm-table__row {
  border-bottom: 1px solid var(--erp-border) !important;
  transition: background 0.12s ease;

  &:hover {
    background: var(--erp-bg-card-hover) !important;
  }

  td,
  .q-td {
    font-size: var(--erp-font-size-table) !important;
    color: var(--erp-text-primary) !important;
    padding: 10px 14px !important;
    height: var(--erp-row-height) !important;
  }

  &--unread {
    background: rgba(37, 99, 235, 0.03) !important;
    td,
    .q-td {
      font-weight: var(--erp-font-weight-medium);
    }
  }
}

/* ── Cell styles ──────────────────────────────────────────────────── */
.wm-cell-name {
  display: flex;
  align-items: center;
  gap: 10px;

  &__text {
    font-weight: var(--erp-font-weight-semibold);
    color: var(--erp-text-primary);
    font-size: var(--erp-font-size-table);
  }
  &__email {
    font-size: var(--erp-font-size-caption);
    color: var(--erp-text-muted);
    margin-top: 1px;
  }
}
.wm-cell-avatar {
  background: var(--erp-bg-active) !important;
  color: var(--erp-text-secondary) !important;
  font-size: 11px !important;
  font-weight: var(--erp-font-weight-bold) !important;

  &--unread {
    background: var(--erp-primary-subtle) !important;
    color: var(--erp-primary) !important;
  }
}
.wm-cell-subject {
  font-weight: var(--erp-font-weight-medium);
  color: var(--erp-text-primary);
  font-size: var(--erp-font-size-table);
}
.wm-cell-preview {
  font-size: var(--erp-font-size-caption);
  color: var(--erp-text-muted);
  margin-top: 2px;
}
.wm-cell-date {
  font-size: var(--erp-font-size-small) !important;
  color: var(--erp-text-secondary) !important;
  font-variant-numeric: tabular-nums;
}

/* ── Status Badge ─────────────────────────────────────────────────── */
.wm-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--erp-radius-sm);
  font-size: var(--erp-font-size-tiny);
  font-weight: var(--erp-font-weight-bold);
  letter-spacing: 0.4px;
  white-space: nowrap;

  &--unread {
    background: var(--erp-danger-subtle);
    color: var(--erp-danger);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }
  &--read {
    background: var(--erp-success-subtle);
    color: var(--erp-success);
    border: 1px solid rgba(22, 163, 74, 0.25);
  }
  &--archived {
    background: var(--erp-bg-active);
    color: var(--erp-text-muted);
    border: 1px solid var(--erp-border);
  }
}

/* ── Actions ──────────────────────────────────────────────────────── */
.wm-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
.wm-action-btn {
  color: var(--erp-text-secondary) !important;
  &:hover {
    color: var(--erp-primary) !important;
    background: var(--erp-primary-subtle) !important;
  }
  &--success:hover {
    color: var(--erp-success) !important;
    background: var(--erp-success-subtle) !important;
  }
  &--danger:hover {
    color: var(--erp-danger) !important;
    background: var(--erp-danger-subtle) !important;
  }
}

/* ── Empty State ──────────────────────────────────────────────────── */
.wm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  color: var(--erp-text-muted);

  &__text {
    font-size: var(--erp-font-size-h3);
    font-weight: var(--erp-font-weight-semibold);
    color: var(--erp-text-secondary);
    margin-top: 12px;
  }
  &__sub {
    font-size: var(--erp-font-size-table);
    color: var(--erp-text-muted);
    margin-top: 4px;
  }
}

/* ── Buttons ──────────────────────────────────────────────────────── */
.wm-btn {
  height: 34px;
  min-height: 34px;
  font-size: var(--erp-font-size-small);
  font-weight: var(--erp-font-weight-medium);
  border-radius: var(--erp-radius-md);
  padding: 0 14px;

  &--ghost {
    background: transparent !important;
    border: 1px solid var(--erp-border) !important;
    color: var(--erp-text-secondary) !important;
    &:hover {
      background: var(--erp-bg-hover) !important;
      color: var(--erp-text-primary) !important;
    }
  }
  &--success {
    background: var(--erp-success) !important;
    color: #fff !important;
  }
  &--warning {
    background: var(--erp-warning) !important;
    color: #fff !important;
  }
}

/* ── Dialog ───────────────────────────────────────────────────────── */
.wm-dialog {
  width: 580px;
  max-width: 90vw;
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-xl);
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--erp-border);
    background: var(--erp-bg-main);
  }
  &__header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  &__avatar {
    background: var(--erp-primary) !important;
    color: #fff !important;
    font-size: 14px !important;
    font-weight: var(--erp-font-weight-bold) !important;
  }
  &__sender {
    font-size: var(--erp-font-size-base);
    font-weight: var(--erp-font-weight-semibold);
    color: var(--erp-text-primary);
  }
  &__email {
    font-size: var(--erp-font-size-caption);
    color: var(--erp-text-muted);
  }
  &__close {
    color: var(--erp-text-secondary) !important;
  }

  &__body {
    padding: 20px;
  }
  &__meta-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  &__meta-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  &__meta-label {
    font-size: var(--erp-font-size-tiny);
    font-weight: var(--erp-font-weight-semibold);
    color: var(--erp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  &__meta-value {
    font-size: var(--erp-font-size-table);
    color: var(--erp-text-primary);
  }
  &__divider {
    height: 1px;
    background: var(--erp-border);
    margin: 16px 0;
  }
  &__subject-label,
  &__message-label {
    font-size: var(--erp-font-size-tiny);
    font-weight: var(--erp-font-weight-semibold);
    color: var(--erp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  &__subject {
    font-size: var(--erp-font-size-h3);
    font-weight: var(--erp-font-weight-semibold);
    color: var(--erp-text-primary);
    margin-bottom: 16px;
  }
  &__message {
    background: var(--erp-bg-main);
    border: 1px solid var(--erp-border);
    border-radius: var(--erp-radius-md);
    padding: 16px;
    min-height: 100px;
    font-size: var(--erp-font-size-base);
    line-height: 1.6;
    color: var(--erp-text-secondary);
    white-space: pre-wrap;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--erp-border);
  }
}

@media (max-width: 768px) {
  .wm-kpi-row {
    grid-template-columns: 1fr;
  }
  .wm-filter-bar {
    flex-wrap: wrap;
  }
  .wm-filter-input {
    flex: 1 1 100%;
  }
  .wm-filter-select {
    flex: 1 1 100%;
  }
  .wm-dialog__meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
