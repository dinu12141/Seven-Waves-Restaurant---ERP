<template>
  <q-page class="hb-page">
    <!-- ── Page Header ────────────────────────────────────────── -->
    <div class="hb-header">
      <div class="hb-header__left">
        <div class="hb-header__breadcrumb">
          <span class="hb-header__breadcrumb-item">WEBSITE</span>
          <span class="hb-header__breadcrumb-sep">/</span>
          <span class="hb-header__breadcrumb-item hb-header__breadcrumb-item--active"
            >Hall Bookings</span
          >
        </div>
        <h1 class="hb-header__title">Hall Bookings</h1>
        <p class="hb-header__subtitle">Manage hall & event space booking requests from the website</p>
      </div>
      <div class="hb-header__right">
        <q-btn
          unelevated
          no-caps
          dense
          icon="refresh"
          label="Refresh"
          class="hb-btn hb-btn--ghost"
          :loading="loading"
          @click="fetchBookings"
        />
      </div>
    </div>

    <!-- ── KPI Strip ──────────────────────────────────────────── -->
    <div class="hb-kpi-row">
      <div class="hb-kpi hb-kpi--blue">
        <div class="hb-kpi__icon"><q-icon name="meeting_room" size="18px" /></div>
        <div class="hb-kpi__body">
          <div class="hb-kpi__value">{{ totalCount }}</div>
          <div class="hb-kpi__label">Total Bookings</div>
        </div>
      </div>
      <div class="hb-kpi hb-kpi--orange">
        <div class="hb-kpi__icon hb-kpi__icon--warning">
          <q-icon name="pending_actions" size="18px" />
        </div>
        <div class="hb-kpi__body">
          <div class="hb-kpi__value">{{ pendingCount }}</div>
          <div class="hb-kpi__label">Pending</div>
        </div>
      </div>
      <div class="hb-kpi hb-kpi--green">
        <div class="hb-kpi__icon hb-kpi__icon--success">
          <q-icon name="check_circle" size="18px" />
        </div>
        <div class="hb-kpi__body">
          <div class="hb-kpi__value">{{ confirmedCount }}</div>
          <div class="hb-kpi__label">Confirmed</div>
        </div>
      </div>
      <div class="hb-kpi hb-kpi--red">
        <div class="hb-kpi__icon hb-kpi__icon--danger"><q-icon name="cancel" size="18px" /></div>
        <div class="hb-kpi__body">
          <div class="hb-kpi__value">{{ cancelledCount }}</div>
          <div class="hb-kpi__label">Cancelled</div>
        </div>
      </div>
    </div>

    <!-- ── Filter Bar ─────────────────────────────────────────── -->
    <div class="hb-filter-bar">
      <q-input
        v-model="search"
        dense
        outlined
        clearable
        placeholder="Search by name, phone, email..."
        class="hb-filter-input"
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
        class="hb-filter-select"
        placeholder="All statuses"
      />
      <q-select
        v-model="hallFilter"
        :options="hallOptions"
        dense
        outlined
        emit-value
        map-options
        class="hb-filter-select"
        placeholder="All halls"
      />
      <q-input
        v-model="dateFilter"
        dense
        outlined
        clearable
        type="date"
        class="hb-filter-date"
        label="Filter Date"
      />
      <q-space />
      <div class="hb-live-badge" v-if="isLive">
        <span class="hb-live-badge__dot"></span>
        LIVE
      </div>
    </div>

    <!-- ── Data Table ─────────────────────────────────────────── -->
    <div class="hb-table-card">
      <q-table
        :rows="filteredBookings"
        :columns="columns"
        row-key="id"
        flat
        dense
        :loading="loading"
        :rows-per-page-options="[15, 30, 50]"
        :pagination="{ rowsPerPage: 15 }"
        separator="none"
        class="hb-table"
      >
        <!-- Header -->
        <template #header="props">
          <q-tr :props="props" class="hb-table__header">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="hb-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <!-- Body Rows -->
        <template #body="props">
          <q-tr
            :props="props"
            class="hb-table__row"
            :class="{ 'hb-table__row--pending': props.row.status === 'pending' }"
          >
            <q-td key="name" :props="props">
              <div class="hb-cell-name">
                <q-avatar
                  size="28px"
                  class="hb-cell-avatar"
                  :class="props.row.status === 'pending' ? 'hb-cell-avatar--pending' : ''"
                >
                  {{ (props.row.name || 'U')[0].toUpperCase() }}
                </q-avatar>
                <div>
                  <div class="hb-cell-name__text">{{ props.row.name }}</div>
                  <div class="hb-cell-name__phone">{{ props.row.phone }}</div>
                </div>
              </div>
            </q-td>
            <q-td key="hall_type" :props="props">
              <span class="hb-hall-badge" :class="`hb-hall-badge--${props.row.hall_type}`">
                <q-icon :name="hallIcon(props.row.hall_type)" size="12px" class="q-mr-xs" />
                {{ formatHall(props.row.hall_type) }}
              </span>
            </q-td>
            <q-td key="event_date" :props="props" class="hb-cell-date">
              {{ formatDate(props.row.event_date) }}
            </q-td>
            <q-td key="event_time" :props="props">
              {{ formatTime(props.row.event_time) }}
            </q-td>
            <q-td key="guests" :props="props" class="hb-cell-guests">
              <q-icon name="groups" size="14px" class="q-mr-xs" />
              {{ props.row.guests }}
            </q-td>
            <q-td key="event_type" :props="props">
              <span class="hb-event-badge" :class="`hb-event-badge--${props.row.event_type}`">
                {{ formatEventType(props.row.event_type) }}
              </span>
            </q-td>
            <q-td key="status" :props="props">
              <span class="hb-status-badge" :class="`hb-status-badge--${props.row.status}`">
                {{ props.row.status.toUpperCase() }}
              </span>
            </q-td>
            <q-td key="created_at" :props="props" class="hb-cell-received">
              {{ formatDateTime(props.row.created_at) }}
            </q-td>
            <q-td key="actions" :props="props">
              <div class="hb-actions">
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="visibility"
                  class="hb-action-btn"
                  @click="viewBooking(props.row)"
                >
                  <q-tooltip>View Details</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="check_circle"
                  class="hb-action-btn hb-action-btn--success"
                  v-if="props.row.status === 'pending'"
                  @click="updateStatus(props.row, 'confirmed')"
                >
                  <q-tooltip>Confirm</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="cancel"
                  class="hb-action-btn hb-action-btn--danger"
                  v-if="props.row.status === 'pending' || props.row.status === 'confirmed'"
                  @click="updateStatus(props.row, 'cancelled')"
                >
                  <q-tooltip>Cancel</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="event_available"
                  class="hb-action-btn hb-action-btn--info"
                  v-if="props.row.status === 'confirmed'"
                  @click="updateStatus(props.row, 'completed')"
                >
                  <q-tooltip>Mark Completed</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="delete_outline"
                  class="hb-action-btn hb-action-btn--danger"
                  @click="deleteBooking(props.row)"
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
          <div class="hb-empty">
            <q-icon name="meeting_room" size="48px" />
            <div class="hb-empty__text">No hall bookings found</div>
            <div class="hb-empty__sub">Hall booking requests from the website will appear here</div>
          </div>
        </template>
      </q-table>
    </div>

    <!-- ── View Dialog ────────────────────────────────────────── -->
    <q-dialog v-model="viewDialog" transition-show="scale" transition-hide="scale">
      <div class="hb-dialog">
        <!-- Dialog Header -->
        <div class="hb-dialog__header">
          <div class="hb-dialog__header-left">
            <q-avatar size="36px" class="hb-dialog__avatar">
              {{ (selected?.name || 'U')[0].toUpperCase() }}
            </q-avatar>
            <div>
              <div class="hb-dialog__sender">{{ selected?.name }}</div>
              <div class="hb-dialog__phone">{{ selected?.phone }}</div>
            </div>
          </div>
          <q-btn icon="close" flat round dense class="hb-dialog__close" v-close-popup />
        </div>

        <!-- Dialog Body -->
        <div class="hb-dialog__body">
          <!-- Hall type banner -->
          <div class="hb-dialog__hall-banner" :class="`hb-dialog__hall-banner--${selected?.hall_type}`">
            <q-icon :name="hallIcon(selected?.hall_type)" size="20px" class="q-mr-sm" />
            {{ formatHall(selected?.hall_type) }}
          </div>

          <div class="hb-dialog__meta-grid">
            <div class="hb-dialog__meta-item">
              <span class="hb-dialog__meta-label">Event Date</span>
              <span class="hb-dialog__meta-value">{{
                selected ? formatDate(selected.event_date) : ''
              }}</span>
            </div>
            <div class="hb-dialog__meta-item">
              <span class="hb-dialog__meta-label">Time</span>
              <span class="hb-dialog__meta-value">{{
                selected ? formatTime(selected.event_time) : ''
              }}</span>
            </div>
            <div class="hb-dialog__meta-item">
              <span class="hb-dialog__meta-label">Duration</span>
              <span class="hb-dialog__meta-value">{{ selected?.duration_hours }} hour(s)</span>
            </div>
            <div class="hb-dialog__meta-item">
              <span class="hb-dialog__meta-label">Guests</span>
              <span class="hb-dialog__meta-value">{{ selected?.guests }} Guests</span>
            </div>
            <div class="hb-dialog__meta-item">
              <span class="hb-dialog__meta-label">Event Type</span>
              <span class="hb-dialog__meta-value">{{ formatEventType(selected?.event_type) }}</span>
            </div>
            <div class="hb-dialog__meta-item">
              <span class="hb-dialog__meta-label">Email</span>
              <span class="hb-dialog__meta-value">{{ selected?.email || 'N/A' }}</span>
            </div>
            <div class="hb-dialog__meta-item">
              <span class="hb-dialog__meta-label">Status</span>
              <span class="hb-status-badge" :class="`hb-status-badge--${selected?.status}`">
                {{ (selected?.status || '').toUpperCase() }}
              </span>
            </div>
            <div class="hb-dialog__meta-item">
              <span class="hb-dialog__meta-label">Received</span>
              <span class="hb-dialog__meta-value">{{
                selected ? formatDateTime(selected.created_at) : ''
              }}</span>
            </div>
          </div>

          <div class="hb-dialog__divider"></div>

          <div class="hb-dialog__message-label">Special Requests</div>
          <div class="hb-dialog__message">{{ selected?.special_requests || 'No special requests' }}</div>

          <!-- Admin Notes -->
          <div class="hb-dialog__notes-section">
            <div class="hb-dialog__message-label">Admin Notes</div>
            <q-input
              v-model="adminNotes"
              outlined
              dense
              type="textarea"
              rows="3"
              placeholder="Add internal notes about this booking..."
              class="hb-dialog__notes-input"
            />
            <q-btn
              unelevated
              no-caps
              dense
              label="Save Notes"
              icon="save"
              class="hb-btn hb-btn--primary q-mt-sm"
              :loading="savingNotes"
              @click="saveNotes"
            />
          </div>
        </div>

        <!-- Dialog Footer -->
        <div class="hb-dialog__footer">
          <q-btn flat no-caps label="Close" class="hb-btn hb-btn--ghost" v-close-popup />
          <q-btn
            v-if="selected?.status === 'pending'"
            unelevated
            no-caps
            icon="check_circle"
            label="Confirm Booking"
            class="hb-btn hb-btn--success"
            @click="updateStatus(selected, 'confirmed')"
          />
          <q-btn
            v-if="selected?.status === 'pending' || selected?.status === 'confirmed'"
            unelevated
            no-caps
            icon="cancel"
            label="Cancel Booking"
            class="hb-btn hb-btn--danger"
            @click="updateStatus(selected, 'cancelled')"
          />
          <q-btn
            v-if="selected?.status === 'confirmed'"
            unelevated
            no-caps
            icon="event_available"
            label="Mark Completed"
            class="hb-btn hb-btn--info"
            @click="updateStatus(selected, 'completed')"
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
const bookings = ref([])
const viewDialog = ref(false)
const selected = ref(null)
const adminNotes = ref('')
const savingNotes = ref(false)
const search = ref('')
const statusFilter = ref(null)
const hallFilter = ref(null)
const dateFilter = ref(null)
const isLive = ref(true)

const statusOptions = [
  { label: 'All Statuses', value: null },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

const hallOptions = [
  { label: 'All Halls', value: null },
  { label: 'Main Hall', value: 'main' },
  { label: 'VIP Lounge', value: 'vip' },
  { label: 'Corporate Lounge', value: 'corporate' },
]

const columns = [
  { name: 'name', label: 'Contact', field: 'name', align: 'left', sortable: true },
  { name: 'hall_type', label: 'Hall', field: 'hall_type', align: 'left', sortable: true },
  { name: 'event_date', label: 'Date', field: 'event_date', align: 'left', sortable: true },
  { name: 'event_time', label: 'Time', field: 'event_time', align: 'left', sortable: true },
  { name: 'guests', label: 'Guests', field: 'guests', align: 'center', sortable: true },
  { name: 'event_type', label: 'Event', field: 'event_type', align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'created_at', label: 'Received', field: 'created_at', align: 'left', sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

// ── KPIs ──────────────────────────────────────────────────────────
const totalCount = computed(() => bookings.value.length)
const pendingCount = computed(() => bookings.value.filter((r) => r.status === 'pending').length)
const confirmedCount = computed(() => bookings.value.filter((r) => r.status === 'confirmed').length)
const cancelledCount = computed(() => bookings.value.filter((r) => r.status === 'cancelled').length)

// ── Filtered bookings ─────────────────────────────────────────────
const filteredBookings = computed(() => {
  let result = bookings.value
  if (statusFilter.value) {
    result = result.filter((r) => r.status === statusFilter.value)
  }
  if (hallFilter.value) {
    result = result.filter((r) => r.hall_type === hallFilter.value)
  }
  if (dateFilter.value) {
    result = result.filter((r) => r.event_date === dateFilter.value)
  }
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q),
    )
  }
  return result
})

// ── Data ──────────────────────────────────────────────────────────
const fetchBookings = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('website_hall_bookings')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    bookings.value = data || []
  } catch (error) {
    console.error('Error fetching hall bookings:', error)
    $q.notify({ type: 'negative', message: 'Failed to fetch hall bookings' })
  } finally {
    loading.value = false
  }
}

const viewBooking = (row) => {
  selected.value = row
  adminNotes.value = row.admin_notes || ''
  viewDialog.value = true
}

const saveNotes = async () => {
  if (!selected.value) return
  try {
    savingNotes.value = true
    const { error } = await supabase
      .from('website_hall_bookings')
      .update({ admin_notes: adminNotes.value })
      .eq('id', selected.value.id)

    if (error) throw error

    const idx = bookings.value.findIndex((b) => b.id === selected.value.id)
    if (idx !== -1) bookings.value[idx].admin_notes = adminNotes.value
    selected.value.admin_notes = adminNotes.value

    $q.notify({ type: 'positive', message: 'Notes saved' })
  } catch (err) {
    console.error(err)
    $q.notify({ type: 'negative', message: 'Failed to save notes' })
  } finally {
    savingNotes.value = false
  }
}

const updateStatus = async (row, newStatus) => {
  try {
    $q.loading.show()
    const { error } = await supabase
      .from('website_hall_bookings')
      .update({ status: newStatus })
      .eq('id', row.id)

    if (error) throw error

    const index = bookings.value.findIndex((r) => r.id === row.id)
    if (index !== -1) bookings.value[index].status = newStatus
    if (selected.value && selected.value.id === row.id) {
      selected.value.status = newStatus
    }

    const labels = {
      confirmed: 'confirmed',
      cancelled: 'cancelled',
      completed: 'completed',
      pending: 'set to pending',
    }
    $q.notify({ type: 'positive', message: `Booking ${labels[newStatus] || newStatus}` })
  } catch (error) {
    console.error('Error updating booking status:', error)
    $q.notify({ type: 'negative', message: 'Failed to update booking status' })
  } finally {
    $q.loading.hide()
  }
}

const deleteBooking = async (row) => {
  $q.dialog({
    title: 'Confirm Deletion',
    message: `Are you sure you want to delete the hall booking from ${row.name}?`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      $q.loading.show()
      const { error } = await supabase.from('website_hall_bookings').delete().eq('id', row.id)

      if (error) throw error

      bookings.value = bookings.value.filter((r) => r.id !== row.id)
      $q.notify({ type: 'positive', message: 'Booking deleted successfully' })
      if (viewDialog.value && selected.value?.id === row.id) {
        viewDialog.value = false
      }
    } catch (error) {
      console.error('Error deleting booking:', error)
      $q.notify({ type: 'negative', message: 'Failed to delete booking' })
    } finally {
      $q.loading.hide()
    }
  })
}

// ── Formatters ────────────────────────────────────────────────────
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return date.formatDate(new Date(dateStr + 'T00:00:00'), 'MMM DD, YYYY')
}

const formatTime = (timeStr) => {
  if (!timeStr) return '-'
  const [h, m] = timeStr.split(':')
  const hr = parseInt(h)
  const ampm = hr >= 12 ? 'PM' : 'AM'
  const hr12 = hr % 12 || 12
  return `${hr12}:${m} ${ampm}`
}

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-'
  return date.formatDate(dateStr, 'MMM DD, YYYY hh:mm A')
}

const formatHall = (hall) => {
  const map = { main: 'Main Hall', vip: 'VIP Lounge', corporate: 'Corporate Lounge' }
  return map[hall] || hall || 'Main Hall'
}

const hallIcon = (hall) => {
  const icons = { main: 'celebration', vip: 'star', corporate: 'business_center' }
  return icons[hall] || 'meeting_room'
}

const formatEventType = (type) => {
  if (!type) return 'Other'
  const map = {
    wedding: 'Wedding 💍',
    birthday: 'Birthday 🎂',
    corporate: 'Corporate 💼',
    seminar: 'Seminar 📋',
    social: 'Social 🎉',
    other: 'Other',
  }
  return map[type] || type.charAt(0).toUpperCase() + type.slice(1)
}

onMounted(() => {
  fetchBookings()

  supabase
    .channel('website_hall_bookings_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'website_hall_bookings' },
      () => {
        fetchBookings()
      },
    )
    .subscribe()
})
</script>

<style scoped lang="scss">
/* ── Page ─────────────────────────────────────────────────────────── */
.hb-page {
  padding: var(--erp-spacing-lg);
  background: var(--erp-bg-main);
  min-height: 100vh;
}

/* ── Header ───────────────────────────────────────────────────────── */
.hb-header {
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
.hb-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: var(--erp-spacing-md);
}
.hb-kpi {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg);
  border-top: 2px solid transparent;

  &--blue { border-top-color: var(--erp-primary); }
  &--orange { border-top-color: #f59e0b; }
  &--green { border-top-color: var(--erp-success); }
  &--red { border-top-color: var(--erp-danger); }

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

    &--warning { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
    &--success { background: var(--erp-success-subtle); color: var(--erp-success); }
    &--danger { background: var(--erp-danger-subtle); color: var(--erp-danger); }
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
.hb-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg);
  margin-bottom: var(--erp-spacing-md);
}
.hb-filter-input { flex: 0 1 300px; font-size: var(--erp-font-size-table); }
.hb-filter-select { flex: 0 1 160px; font-size: var(--erp-font-size-table); }
.hb-filter-date  { flex: 0 1 160px; font-size: var(--erp-font-size-table); }

.hb-live-badge {
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
    animation: hb-live-pulse 1.5s infinite;
  }
}
@keyframes hb-live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ── Table ─────────────────────────────────────────────────────────── */
.hb-table-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg);
  overflow: hidden;
}
.hb-table {
  background: transparent !important;
  font-size: var(--erp-font-size-table) !important;
}
.hb-table__header { background: var(--erp-bg-stripe) !important; }
.hb-table__th {
  font-size: var(--erp-font-size-caption) !important;
  font-weight: var(--erp-font-weight-bold) !important;
  color: var(--erp-text-secondary) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.4px !important;
  border-bottom: 1px solid var(--erp-border) !important;
  padding: 10px 14px !important;
  white-space: nowrap;
}
.hb-table__row {
  border-bottom: 1px solid var(--erp-border) !important;
  transition: background 0.12s ease;

  &:hover { background: var(--erp-bg-card-hover) !important; }

  td, .q-td {
    font-size: var(--erp-font-size-table) !important;
    color: var(--erp-text-primary) !important;
    padding: 10px 14px !important;
    height: var(--erp-row-height) !important;
  }

  &--pending {
    background: rgba(245, 158, 11, 0.03) !important;
    td, .q-td { font-weight: var(--erp-font-weight-medium); }
  }
}

/* ── Cell styles ──────────────────────────────────────────────────── */
.hb-cell-name {
  display: flex;
  align-items: center;
  gap: 10px;

  &__text {
    font-weight: var(--erp-font-weight-semibold);
    color: var(--erp-text-primary);
    font-size: var(--erp-font-size-table);
  }
  &__phone {
    font-size: var(--erp-font-size-caption);
    color: var(--erp-text-muted);
    margin-top: 1px;
  }
}
.hb-cell-avatar {
  background: var(--erp-bg-active) !important;
  color: var(--erp-text-secondary) !important;
  font-size: 11px !important;
  font-weight: var(--erp-font-weight-bold) !important;

  &--pending {
    background: rgba(245, 158, 11, 0.15) !important;
    color: #f59e0b !important;
  }
}
.hb-cell-date {
  font-size: var(--erp-font-size-small) !important;
  color: var(--erp-text-secondary) !important;
  font-variant-numeric: tabular-nums;
}
.hb-cell-guests {
  display: flex !important;
  align-items: center !important;
  color: var(--erp-text-secondary) !important;
}
.hb-cell-received {
  font-size: var(--erp-font-size-small) !important;
  color: var(--erp-text-secondary) !important;
}

/* ── Hall Badge ───────────────────────────────────────────────────── */
.hb-hall-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--erp-radius-sm);
  font-size: var(--erp-font-size-tiny);
  font-weight: var(--erp-font-weight-bold);
  letter-spacing: 0.3px;
  white-space: nowrap;

  &--main {
    background: rgba(67, 133, 245, 0.1);
    color: var(--erp-primary);
    border: 1px solid rgba(67, 133, 245, 0.2);
  }
  &--vip {
    background: rgba(168, 85, 247, 0.1);
    color: #a855f7;
    border: 1px solid rgba(168, 85, 247, 0.2);
  }
  &--corporate {
    background: rgba(20, 184, 166, 0.1);
    color: #14b8a6;
    border: 1px solid rgba(20, 184, 166, 0.2);
  }
}

/* ── Event Type Badge ─────────────────────────────────────────────── */
.hb-event-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--erp-radius-sm);
  font-size: var(--erp-font-size-tiny);
  font-weight: var(--erp-font-weight-bold);
  background: var(--erp-bg-active);
  color: var(--erp-text-secondary);
  border: 1px solid var(--erp-border);
  white-space: nowrap;
}

/* ── Status Badge ─────────────────────────────────────────────────── */
.hb-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--erp-radius-sm);
  font-size: var(--erp-font-size-tiny);
  font-weight: var(--erp-font-weight-bold);
  letter-spacing: 0.4px;
  white-space: nowrap;

  &--pending {
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }
  &--confirmed {
    background: var(--erp-success-subtle);
    color: var(--erp-success);
    border: 1px solid rgba(22, 163, 74, 0.25);
  }
  &--completed {
    background: var(--erp-primary-subtle);
    color: var(--erp-primary);
    border: 1px solid rgba(67, 133, 245, 0.2);
  }
  &--cancelled {
    background: var(--erp-danger-subtle);
    color: var(--erp-danger);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }
}

/* ── Actions ──────────────────────────────────────────────────────── */
.hb-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
.hb-action-btn {
  color: var(--erp-text-secondary) !important;
  &:hover {
    color: var(--erp-primary) !important;
    background: var(--erp-primary-subtle) !important;
  }
  &--success:hover { color: var(--erp-success) !important; background: var(--erp-success-subtle) !important; }
  &--danger:hover  { color: var(--erp-danger) !important;  background: var(--erp-danger-subtle) !important; }
  &--info:hover    { color: var(--erp-primary) !important; background: var(--erp-primary-subtle) !important; }
}

/* ── Empty State ──────────────────────────────────────────────────── */
.hb-empty {
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
.hb-btn {
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
  &--primary  { background: var(--erp-primary) !important; color: #fff !important; }
  &--success  { background: var(--erp-success) !important; color: #fff !important; }
  &--danger   { background: var(--erp-danger)  !important; color: #fff !important; }
  &--info     { background: var(--erp-primary) !important; color: #fff !important; }
}

/* ── Dialog ───────────────────────────────────────────────────────── */
.hb-dialog {
  width: 600px;
  max-width: 92vw;
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--erp-border);
    background: var(--erp-bg-stripe);
  }
  &__header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  &__avatar {
    background: var(--erp-primary-subtle) !important;
    color: var(--erp-primary) !important;
    font-size: 14px !important;
    font-weight: var(--erp-font-weight-bold) !important;
  }
  &__sender {
    font-size: var(--erp-font-size-body);
    font-weight: var(--erp-font-weight-bold);
    color: var(--erp-text-primary);
  }
  &__phone  {
    font-size: var(--erp-font-size-caption);
    color: var(--erp-text-muted);
    margin-top: 2px;
  }
  &__close  { color: var(--erp-text-secondary) !important; }

  &__body {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }

  &__hall-banner {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    border-radius: var(--erp-radius-md);
    font-size: var(--erp-font-size-small);
    font-weight: var(--erp-font-weight-bold);
    margin-bottom: 16px;
    text-transform: uppercase;
    letter-spacing: 0.5px;

    &--main      { background: rgba(67,133,245,0.1); color: var(--erp-primary); }
    &--vip       { background: rgba(168,85,247,0.1); color: #a855f7; }
    &--corporate { background: rgba(20,184,166,0.1); color: #14b8a6; }
  }

  &__meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 20px;
  }
  &__meta-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  &__meta-label {
    font-size: var(--erp-font-size-caption);
    font-weight: var(--erp-font-weight-bold);
    color: var(--erp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  &__meta-value {
    font-size: var(--erp-font-size-table);
    color: var(--erp-text-primary);
    font-weight: var(--erp-font-weight-medium);
  }

  &__divider {
    height: 1px;
    background: var(--erp-border);
    margin: 16px 0;
  }
  &__message-label {
    font-size: var(--erp-font-size-caption);
    font-weight: var(--erp-font-weight-bold);
    color: var(--erp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  &__message {
    font-size: var(--erp-font-size-table);
    color: var(--erp-text-primary);
    line-height: 1.6;
    background: var(--erp-bg-stripe);
    border: 1px solid var(--erp-border);
    border-radius: var(--erp-radius-md);
    padding: 10px 12px;
    white-space: pre-line;
  }

  &__notes-section {
    margin-top: 16px;
  }
  &__notes-input {
    font-size: var(--erp-font-size-table);
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--erp-border);
    background: var(--erp-bg-stripe);
    flex-wrap: wrap;
  }
}
</style>
