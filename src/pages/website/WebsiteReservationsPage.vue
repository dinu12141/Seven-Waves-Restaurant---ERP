<template>
  <q-page class="wr-page">
    <!-- ── Page Header ────────────────────────────────────────── -->
    <div class="wr-header">
      <div class="wr-header__left">
        <div class="wr-header__breadcrumb">
          <span class="wr-header__breadcrumb-item">WEBSITE</span>
          <span class="wr-header__breadcrumb-sep">/</span>
          <span class="wr-header__breadcrumb-item wr-header__breadcrumb-item--active"
            >Reservations</span
          >
        </div>
        <h1 class="wr-header__title">Website Reservations</h1>
        <p class="wr-header__subtitle">Manage table reservation requests from the website</p>
      </div>
      <div class="wr-header__right">
        <q-btn
          unelevated
          no-caps
          dense
          icon="refresh"
          label="Refresh"
          class="wr-btn wr-btn--ghost"
          :loading="loading"
          @click="fetchReservations"
        />
      </div>
    </div>

    <!-- ── KPI Strip ──────────────────────────────────────────── -->
    <div class="wr-kpi-row">
      <div class="wr-kpi wr-kpi--blue">
        <div class="wr-kpi__icon"><q-icon name="event_seat" size="18px" /></div>
        <div class="wr-kpi__body">
          <div class="wr-kpi__value">{{ totalCount }}</div>
          <div class="wr-kpi__label">Total Reservations</div>
        </div>
      </div>
      <div class="wr-kpi wr-kpi--orange">
        <div class="wr-kpi__icon wr-kpi__icon--warning">
          <q-icon name="pending_actions" size="18px" />
        </div>
        <div class="wr-kpi__body">
          <div class="wr-kpi__value">{{ pendingCount }}</div>
          <div class="wr-kpi__label">Pending</div>
        </div>
      </div>
      <div class="wr-kpi wr-kpi--green">
        <div class="wr-kpi__icon wr-kpi__icon--success">
          <q-icon name="check_circle" size="18px" />
        </div>
        <div class="wr-kpi__body">
          <div class="wr-kpi__value">{{ confirmedCount }}</div>
          <div class="wr-kpi__label">Confirmed</div>
        </div>
      </div>
      <div class="wr-kpi wr-kpi--red">
        <div class="wr-kpi__icon wr-kpi__icon--danger"><q-icon name="cancel" size="18px" /></div>
        <div class="wr-kpi__body">
          <div class="wr-kpi__value">{{ cancelledCount }}</div>
          <div class="wr-kpi__label">Cancelled</div>
        </div>
      </div>
    </div>

    <!-- ── Filter Bar ─────────────────────────────────────────── -->
    <div class="wr-filter-bar">
      <q-input
        v-model="search"
        dense
        outlined
        clearable
        placeholder="Search by name, phone, occasion..."
        class="wr-filter-input"
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
        class="wr-filter-select"
        placeholder="All statuses"
      />
      <q-input
        v-model="dateFilter"
        dense
        outlined
        clearable
        type="date"
        class="wr-filter-date"
        label="Filter Date"
      />
      <q-space />
      <div class="wr-live-badge" v-if="isLive">
        <span class="wr-live-badge__dot"></span>
        LIVE
      </div>
    </div>

    <!-- ── Data Table ─────────────────────────────────────────── -->
    <div class="wr-table-card">
      <q-table
        :rows="filteredReservations"
        :columns="columns"
        row-key="id"
        flat
        dense
        :loading="loading"
        :rows-per-page-options="[15, 30, 50]"
        :pagination="{ rowsPerPage: 15 }"
        separator="none"
        class="wr-table"
      >
        <!-- Header -->
        <template #header="props">
          <q-tr :props="props" class="wr-table__header">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="wr-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <!-- Body Rows -->
        <template #body="props">
          <q-tr
            :props="props"
            class="wr-table__row"
            :class="{ 'wr-table__row--pending': props.row.status === 'pending' }"
          >
            <q-td key="name" :props="props">
              <div class="wr-cell-name">
                <q-avatar
                  size="28px"
                  class="wr-cell-avatar"
                  :class="props.row.status === 'pending' ? 'wr-cell-avatar--pending' : ''"
                >
                  {{ (props.row.name || 'U')[0].toUpperCase() }}
                </q-avatar>
                <div>
                  <div class="wr-cell-name__text">{{ props.row.name }}</div>
                  <div class="wr-cell-name__phone">{{ props.row.phone }}</div>
                </div>
              </div>
            </q-td>
            <q-td key="reservation_date" :props="props" class="wr-cell-date">
              {{ formatDate(props.row.reservation_date) }}
            </q-td>
            <q-td key="reservation_time" :props="props">
              {{ formatTime(props.row.reservation_time) }}
            </q-td>
            <q-td key="guests" :props="props" class="wr-cell-guests">
              <q-icon name="groups" size="14px" class="q-mr-xs" />
              {{ props.row.guests }}
            </q-td>
            <q-td key="occasion" :props="props">
              <span class="wr-occasion-badge" :class="`wr-occasion-badge--${props.row.occasion}`">
                {{ formatOccasion(props.row.occasion) }}
              </span>
            </q-td>
            <q-td key="status" :props="props">
              <span class="wr-status-badge" :class="`wr-status-badge--${props.row.status}`">
                {{ props.row.status.toUpperCase() }}
              </span>
            </q-td>
            <q-td key="created_at" :props="props" class="wr-cell-received">
              {{ formatDateTime(props.row.created_at) }}
            </q-td>
            <q-td key="actions" :props="props">
              <div class="wr-actions">
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="visibility"
                  class="wr-action-btn"
                  @click="viewReservation(props.row)"
                >
                  <q-tooltip>View Details</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="check_circle"
                  class="wr-action-btn wr-action-btn--success"
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
                  class="wr-action-btn wr-action-btn--danger"
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
                  class="wr-action-btn wr-action-btn--info"
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
                  class="wr-action-btn wr-action-btn--danger"
                  @click="deleteReservation(props.row)"
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
            <q-spinner-gears size="36px" :style="{ color: 'var(--erp-mod-website)' }" />
          </q-inner-loading>
        </template>

        <!-- Empty -->
        <template #no-data>
          <div class="wr-empty">
            <div class="wr-empty__icon">
              <q-icon name="event_seat" size="32px" />
            </div>
            <div class="wr-empty__text">No reservations found</div>
            <div class="wr-empty__sub">Reservation requests from the website will appear here</div>
          </div>
        </template>
      </q-table>
    </div>

    <!-- ── View Dialog ────────────────────────────────────────── -->
    <q-dialog v-model="viewDialog" transition-show="scale" transition-hide="scale">
      <div class="wr-dialog">
        <!-- Dialog Header -->
        <div class="wr-dialog__header">
          <div class="wr-dialog__header-left">
            <q-avatar size="36px" class="wr-dialog__avatar">
              {{ (selected?.name || 'U')[0].toUpperCase() }}
            </q-avatar>
            <div>
              <div class="wr-dialog__sender">{{ selected?.name }}</div>
              <div class="wr-dialog__phone">{{ selected?.phone }}</div>
            </div>
          </div>
          <q-btn icon="close" flat round dense class="wr-dialog__close" v-close-popup />
        </div>

        <!-- Dialog Body -->
        <div class="wr-dialog__body">
          <div class="wr-dialog__meta-grid">
            <div class="wr-dialog__meta-item">
              <span class="wr-dialog__meta-label">Date</span>
              <span class="wr-dialog__meta-value">{{
                selected ? formatDate(selected.reservation_date) : ''
              }}</span>
            </div>
            <div class="wr-dialog__meta-item">
              <span class="wr-dialog__meta-label">Time</span>
              <span class="wr-dialog__meta-value">{{
                selected ? formatTime(selected.reservation_time) : ''
              }}</span>
            </div>
            <div class="wr-dialog__meta-item">
              <span class="wr-dialog__meta-label">Guests</span>
              <span class="wr-dialog__meta-value">{{ selected?.guests }} Guests</span>
            </div>
            <div class="wr-dialog__meta-item">
              <span class="wr-dialog__meta-label">Occasion</span>
              <span class="wr-dialog__meta-value">{{
                selected ? formatOccasion(selected.occasion) : ''
              }}</span>
            </div>
            <div class="wr-dialog__meta-item">
              <span class="wr-dialog__meta-label">Email</span>
              <span class="wr-dialog__meta-value">{{ selected?.email || 'N/A' }}</span>
            </div>
            <div class="wr-dialog__meta-item">
              <span class="wr-dialog__meta-label">Status</span>
              <span class="wr-status-badge" :class="`wr-status-badge--${selected?.status}`">
                {{ (selected?.status || '').toUpperCase() }}
              </span>
            </div>
          </div>

          <div class="wr-dialog__divider"></div>

          <div class="wr-dialog__message-label">Special Requests / Message</div>
          <div class="wr-dialog__message">{{ selected?.message || 'No special requests' }}</div>

          <div class="wr-dialog__meta-item" style="margin-top: 16px">
            <span class="wr-dialog__meta-label">Received</span>
            <span class="wr-dialog__meta-value">{{
              selected ? formatDateTime(selected.created_at) : ''
            }}</span>
          </div>
        </div>

        <!-- Dialog Footer -->
        <div class="wr-dialog__footer">
          <q-btn flat no-caps label="Close" class="wr-btn wr-btn--ghost" v-close-popup />
          <q-btn
            v-if="selected?.status === 'pending'"
            unelevated
            no-caps
            icon="check_circle"
            label="Confirm Reservation"
            class="wr-btn wr-btn--success"
            @click="updateStatus(selected, 'confirmed')"
          />
          <q-btn
            v-if="selected?.status === 'pending' || selected?.status === 'confirmed'"
            unelevated
            no-caps
            icon="cancel"
            label="Cancel Reservation"
            class="wr-btn wr-btn--danger"
            @click="updateStatus(selected, 'cancelled')"
          />
          <q-btn
            v-if="selected?.status === 'confirmed'"
            unelevated
            no-caps
            icon="event_available"
            label="Mark Completed"
            class="wr-btn wr-btn--info"
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
const reservations = ref([])
const viewDialog = ref(false)
const selected = ref(null)
const search = ref('')
const statusFilter = ref(null)
const dateFilter = ref(null)
const isLive = ref(true)

const statusOptions = [
  { label: 'All Statuses', value: null },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

const columns = [
  { name: 'name', label: 'Guest', field: 'name', align: 'left', sortable: true },
  {
    name: 'reservation_date',
    label: 'Date',
    field: 'reservation_date',
    align: 'left',
    sortable: true,
  },
  {
    name: 'reservation_time',
    label: 'Time',
    field: 'reservation_time',
    align: 'left',
    sortable: true,
  },
  { name: 'guests', label: 'Guests', field: 'guests', align: 'center', sortable: true },
  { name: 'occasion', label: 'Occasion', field: 'occasion', align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'created_at', label: 'Received', field: 'created_at', align: 'left', sortable: true },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

// ── KPIs ──────────────────────────────────────────────────────────
const totalCount = computed(() => reservations.value.length)
const pendingCount = computed(() => reservations.value.filter((r) => r.status === 'pending').length)
const confirmedCount = computed(
  () => reservations.value.filter((r) => r.status === 'confirmed').length,
)
const cancelledCount = computed(
  () => reservations.value.filter((r) => r.status === 'cancelled').length,
)

// ── Filtered reservations ─────────────────────────────────────────
const filteredReservations = computed(() => {
  let result = reservations.value
  if (statusFilter.value) {
    result = result.filter((r) => r.status === statusFilter.value)
  }
  if (dateFilter.value) {
    result = result.filter((r) => r.reservation_date === dateFilter.value)
  }
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.occasion || '').toLowerCase().includes(q),
    )
  }
  return result
})

// ── Data ──────────────────────────────────────────────────────────
const fetchReservations = async () => {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('website_reservations')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    reservations.value = data || []
  } catch (error) {
    console.error('Error fetching reservations:', error)
    $q.notify({ type: 'negative', message: 'Failed to fetch reservations' })
  } finally {
    loading.value = false
  }
}

const viewReservation = (row) => {
  selected.value = row
  viewDialog.value = true
}

const updateStatus = async (row, newStatus) => {
  try {
    $q.loading.show()
    const { error } = await supabase
      .from('website_reservations')
      .update({ status: newStatus })
      .eq('id', row.id)

    if (error) throw error

    const index = reservations.value.findIndex((r) => r.id === row.id)
    if (index !== -1) reservations.value[index].status = newStatus
    if (selected.value && selected.value.id === row.id) {
      selected.value.status = newStatus
    }

    const labels = {
      confirmed: 'confirmed',
      cancelled: 'cancelled',
      completed: 'completed',
      pending: 'set to pending',
    }
    $q.notify({ type: 'positive', message: `Reservation ${labels[newStatus] || newStatus}` })
  } catch (error) {
    console.error('Error updating reservation status:', error)
    $q.notify({ type: 'negative', message: 'Failed to update reservation status' })
  } finally {
    $q.loading.hide()
  }
}

const deleteReservation = async (row) => {
  $q.dialog({
    title: 'Confirm Deletion',
    message: `Are you sure you want to delete the reservation from ${row.name}?`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      $q.loading.show()
      const { error } = await supabase.from('website_reservations').delete().eq('id', row.id)

      if (error) throw error

      reservations.value = reservations.value.filter((r) => r.id !== row.id)
      $q.notify({ type: 'positive', message: 'Reservation deleted successfully' })
      if (viewDialog.value && selected.value?.id === row.id) {
        viewDialog.value = false
      }
    } catch (error) {
      console.error('Error deleting reservation:', error)
      $q.notify({ type: 'negative', message: 'Failed to delete reservation' })
    } finally {
      $q.loading.hide()
    }
  })
}

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

const formatOccasion = (occasion) => {
  if (!occasion) return 'Regular'
  const map = {
    regular: 'Regular',
    birthday: 'Birthday 🎂',
    anniversary: 'Anniversary 💍',
    date_night: 'Date Night ❤️',
    business: 'Business 💼',
    family: 'Family 👨‍👩‍👧‍👦',
    celebration: 'Celebration 🎉',
    other: 'Other',
  }
  return map[occasion] || occasion.charAt(0).toUpperCase() + occasion.slice(1)
}

onMounted(() => {
  fetchReservations()
})
</script>

<style scoped lang="scss">
/* ── Page ─────────────────────────────────────────────────────────── */
.wr-page {
  padding: var(--erp-spacing-lg);
  background: var(--erp-bg-page);
  min-height: 100vh;
}

/* ── Header ───────────────────────────────────────────────────────── */
.wr-header {
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
    color: var(--erp-mod-website);
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
.wr-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: var(--erp-spacing-md);
}
.wr-kpi {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-card);
  border-left: 3px solid transparent;
  transition: box-shadow 0.2s, transform 0.2s;
  cursor: default;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }

  &--blue {
    border-left-color: var(--erp-mod-website);
  }
  &--orange {
    border-left-color: var(--erp-warning);
  }
  &--green {
    border-left-color: var(--erp-success);
  }
  &--red {
    border-left-color: var(--erp-danger);
  }

  &__icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: var(--erp-mod-website-subtle);
    color: var(--erp-mod-website);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &--warning {
      background: var(--erp-warning-subtle);
      color: var(--erp-warning);
    }
    &--success {
      background: var(--erp-success-subtle);
      color: var(--erp-success);
    }
    &--danger {
      background: var(--erp-danger-subtle);
      color: var(--erp-danger);
    }
  }
  &__value {
    font-size: 1.7rem;
    font-weight: var(--erp-font-weight-black);
    color: var(--erp-text-primary);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  &__label {
    font-size: 0.78rem;
    color: var(--erp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    margin-top: 3px;
  }
}

/* ── Filter Bar ───────────────────────────────────────────────────── */
.wr-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-card);
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.wr-filter-input {
  flex: 1;
  min-width: 200px;
  font-size: var(--erp-font-size-table);
}
.wr-filter-select {
  flex: 0 1 180px;
  font-size: var(--erp-font-size-table);
}
.wr-filter-date {
  flex: 0 1 180px;
  font-size: var(--erp-font-size-table);
}

.wr-live-badge {
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
    animation: wr-live-pulse 1.5s infinite;
  }
}
@keyframes wr-live-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

/* ── Table ─────────────────────────────────────────────────────────── */
.wr-table-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg);
  overflow: hidden;
}
.wr-table {
  background: transparent !important;
  font-size: var(--erp-font-size-table) !important;
}
.wr-table__header {
  background: var(--erp-bg-stripe) !important;
}
.wr-table__th {
  font-size: var(--erp-font-size-caption) !important;
  font-weight: var(--erp-font-weight-bold) !important;
  color: var(--erp-text-secondary) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.4px !important;
  border-bottom: 1px solid var(--erp-border) !important;
  padding: 10px 14px !important;
  white-space: nowrap;
}
.wr-table__row {
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

  &--pending {
    background: rgba(245, 158, 11, 0.03) !important;
    td,
    .q-td {
      font-weight: var(--erp-font-weight-medium);
    }
  }
}

/* ── Cell styles ──────────────────────────────────────────────────── */
.wr-cell-name {
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
.wr-cell-avatar {
  background: var(--erp-mod-website-subtle) !important;
  color: var(--erp-mod-website) !important;
  font-size: 11px !important;
  font-weight: var(--erp-font-weight-bold) !important;

  &--pending {
    background: var(--erp-warning-subtle) !important;
    color: var(--erp-warning) !important;
  }
}
.wr-cell-date {
  font-size: var(--erp-font-size-small) !important;
  font-weight: var(--erp-font-weight-semibold) !important;
  color: var(--erp-text-primary) !important;
}
.wr-cell-guests {
  font-weight: var(--erp-font-weight-medium) !important;
  color: var(--erp-text-secondary) !important;
}
.wr-cell-received {
  font-size: var(--erp-font-size-small) !important;
  color: var(--erp-text-secondary) !important;
  font-variant-numeric: tabular-nums;
}

/* ── Occasion Badge ──────────────────────────────────────────────── */
.wr-occasion-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--erp-radius-sm);
  font-size: var(--erp-font-size-tiny);
  font-weight: var(--erp-font-weight-bold);
  letter-spacing: 0.3px;
  white-space: nowrap;
  background: var(--erp-bg-active);
  color: var(--erp-text-secondary);
  border: 1px solid var(--erp-border);

  &--birthday {
    background: rgba(236, 72, 153, 0.1);
    color: #ec4899;
    border-color: rgba(236, 72, 153, 0.25);
  }
  &--anniversary {
    background: rgba(168, 85, 247, 0.1);
    color: #a855f7;
    border-color: rgba(168, 85, 247, 0.25);
  }
  &--date_night {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.25);
  }
  &--business {
    background: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
    border-color: rgba(59, 130, 246, 0.25);
  }
  &--family {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
    border-color: rgba(34, 197, 94, 0.25);
  }
  &--celebration {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.25);
  }
}

/* ── Status Badge ─────────────────────────────────────────────────── */
.wr-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: var(--erp-font-size-tiny);
  font-weight: var(--erp-font-weight-bold);
  letter-spacing: 0.5px;
  white-space: nowrap;
  text-transform: uppercase;

  &--pending {
    background: var(--erp-warning-subtle);
    color: var(--erp-warning);
    border: 1px solid rgba(245, 158, 11, 0.25);
  }
  &--confirmed {
    background: var(--erp-success-subtle);
    color: var(--erp-success);
    border: 1px solid rgba(22, 163, 74, 0.25);
  }
  &--completed {
    background: var(--erp-mod-website-subtle);
    color: var(--erp-mod-website);
    border: 1px solid rgba(6, 182, 212, 0.25);
  }
  &--cancelled {
    background: var(--erp-danger-subtle);
    color: var(--erp-danger);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }
}

/* ── Actions ──────────────────────────────────────────────────────── */
.wr-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
.wr-action-btn {
  color: var(--erp-text-secondary) !important;
  &:hover {
    color: var(--erp-mod-website) !important;
    background: var(--erp-mod-website-subtle) !important;
  }
  &--success:hover {
    color: var(--erp-success) !important;
    background: var(--erp-success-subtle) !important;
  }
  &--danger:hover {
    color: var(--erp-danger) !important;
    background: var(--erp-danger-subtle) !important;
  }
  &--info:hover {
    color: var(--erp-mod-website) !important;
    background: var(--erp-mod-website-subtle) !important;
  }
}

/* ── Empty State ──────────────────────────────────────────────────── */
.wr-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 24px;
  gap: 12px;

  &__icon {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: var(--erp-mod-website-subtle);
    color: var(--erp-mod-website);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  &__text {
    font-size: var(--erp-font-size-h3);
    font-weight: var(--erp-font-weight-semibold);
    color: var(--erp-text-secondary);
    margin: 0;
  }
  &__sub {
    font-size: var(--erp-font-size-table);
    color: var(--erp-text-muted);
    margin: 0;
    text-align: center;
  }
}

/* ── Buttons ──────────────────────────────────────────────────────── */
.wr-btn {
  height: 34px;
  min-height: 34px;
  font-size: var(--erp-font-size-small);
  font-weight: var(--erp-font-weight-medium);
  border-radius: var(--erp-radius-md);
  padding: 0 14px;

  &--ghost {
    background: var(--erp-bg-page) !important;
    border: 1px solid var(--erp-border) !important;
    color: var(--erp-text-secondary) !important;
    &:hover {
      border-color: var(--erp-mod-website) !important;
      color: var(--erp-mod-website) !important;
    }
  }
  &--primary {
    background: var(--erp-mod-website) !important;
    color: #fff !important;
    font-weight: 600 !important;
  }
  &--success {
    background: var(--erp-success) !important;
    color: #fff !important;
  }
  &--danger {
    background: var(--erp-danger) !important;
    color: #fff !important;
  }
  &--info {
    background: var(--erp-mod-website) !important;
    color: #fff !important;
  }
}

/* ── Dialog ───────────────────────────────────────────────────────── */
.wr-dialog {
  width: 620px;
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
    background: var(--erp-bg-page);
    border-left: 4px solid var(--erp-mod-website);
  }
  &__header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  &__avatar {
    background: var(--erp-mod-website) !important;
    color: #fff !important;
    font-size: 14px !important;
    font-weight: var(--erp-font-weight-bold) !important;
  }
  &__sender {
    font-size: var(--erp-font-size-base);
    font-weight: var(--erp-font-weight-semibold);
    color: var(--erp-text-primary);
  }
  &__phone {
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
  &__message-label {
    font-size: var(--erp-font-size-tiny);
    font-weight: var(--erp-font-weight-semibold);
    color: var(--erp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  &__message {
    background: var(--erp-bg-page);
    border: 1px solid var(--erp-border);
    border-radius: var(--erp-radius-md);
    padding: 16px;
    min-height: 80px;
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
  .wr-kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .wr-filter-bar {
    flex-wrap: wrap;
  }
  .wr-filter-input {
    flex: 1 1 100%;
  }
  .wr-filter-select {
    flex: 1 1 100%;
  }
  .wr-filter-date {
    flex: 1 1 100%;
  }
  .wr-dialog__meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
