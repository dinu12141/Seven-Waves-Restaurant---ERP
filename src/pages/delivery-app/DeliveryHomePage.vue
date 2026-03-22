<template>
  <q-page class="delivery-home-page">

    <!-- ── Header ──────────────────────────────────── -->
    <div class="page-header">
      <div class="header-top">
        <h2 class="page-title">Delivery Queue</h2>
        <q-btn
          flat round dense
          icon="refresh"
          color="grey-4"
          :loading="store.loading"
          @click="store.loadAssignments()"
        />
      </div>

      <!-- Stats row -->
      <div class="stats-row">
        <div class="stat-card stat-card--pending">
          <div class="stat-value">{{ store.pendingCount }}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card stat-card--active">
          <div class="stat-value">{{ store.activeCount }}</div>
          <div class="stat-label">Active</div>
        </div>
        <div class="stat-card stat-card--done">
          <div class="stat-value">{{ store.completedTodayCount }}</div>
          <div class="stat-label">Today</div>
        </div>
      </div>
    </div>

    <!-- ── Loading ─────────────────────────────────── -->
    <div v-if="store.loading && !store.assignments.length" class="loading-wrap">
      <q-spinner-orbit size="48px" color="purple-4" />
      <div class="loading-text">Loading queue…</div>
    </div>

    <!-- ── Empty state ─────────────────────────────── -->
    <div v-else-if="!store.pendingAssignments.length && !store.acceptedAssignments.length" class="empty-state">
      <q-icon name="delivery_dining" size="64px" color="grey-7" />
      <div class="empty-title">No deliveries right now</div>
      <div class="empty-sub">New website orders will appear here automatically.</div>
    </div>

    <!-- ── Pending Assignments ─────────────────────── -->
    <template v-else>
      <!-- My Active Deliveries -->
      <div v-if="store.acceptedAssignments.length" class="section">
        <div class="section-title">
          <q-icon name="local_shipping" size="18px" color="blue-4" class="q-mr-xs" />
          My Active ({{ store.acceptedAssignments.length }})
        </div>
        <div
          v-for="a in store.acceptedAssignments"
          :key="a.id"
          class="assignment-card assignment-card--active"
          @click="goToActive(a.id)"
        >
          <div class="card-top">
            <div class="order-badge order-badge--active">#{{ a.orderNumber }}</div>
            <q-chip dense :color="statusColor(a.status)" text-color="white" class="status-chip">
              {{ statusLabel(a.status) }}
            </q-chip>
          </div>
          <div class="card-details">
            <div class="detail-row" v-if="a.customer_name">
              <q-icon name="person" size="14px" color="grey-5" />
              <span>{{ a.customer_name }}</span>
            </div>
            <div class="detail-row" v-if="a.delivery_address">
              <q-icon name="location_on" size="14px" color="grey-5" />
              <span class="address-text">{{ a.delivery_address }}</span>
            </div>
          </div>
          <div class="card-footer">
            <span class="time-ago">{{ a.timeAgo }}</span>
            <q-icon name="chevron_right" size="18px" color="grey-6" />
          </div>
        </div>
      </div>

      <!-- Available Deliveries -->
      <div v-if="store.pendingAssignments.length" class="section">
        <div class="section-title">
          <q-icon name="pending_actions" size="18px" color="orange-5" class="q-mr-xs" />
          Available ({{ store.pendingAssignments.length }})
        </div>
        <div
          v-for="a in store.pendingAssignments"
          :key="a.id"
          class="assignment-card assignment-card--pending"
        >
          <div class="card-top">
            <div class="order-badge">#{{ a.orderNumber }}</div>
            <span class="source-badge">🌐 WEBSITE</span>
          </div>
          <div class="card-details">
            <div class="detail-row" v-if="a.customer_name">
              <q-icon name="person" size="14px" color="grey-5" />
              <span>{{ a.customer_name }}</span>
            </div>
            <div class="detail-row" v-if="a.delivery_address">
              <q-icon name="location_on" size="14px" color="grey-5" />
              <span class="address-text">{{ a.delivery_address }}</span>
            </div>
            <div class="detail-row" v-if="a.customer_phone">
              <q-icon name="phone" size="14px" color="grey-5" />
              <span>{{ a.customer_phone }}</span>
            </div>
            <div class="detail-row">
              <q-icon name="payments" size="14px" color="grey-5" />
              <span class="total-amount">Rs. {{ Number(a.orderTotal || 0).toFixed(2) }}</span>
            </div>
          </div>
          <div class="card-actions">
            <q-btn
              unelevated
              no-caps
              color="deep-purple"
              label="Accept Delivery"
              icon="delivery_dining"
              class="accept-btn"
              :loading="store.processing"
              @click="handleAccept(a.id)"
            />
          </div>
          <div class="card-footer">
            <span class="time-ago">{{ a.timeAgo }}</span>
            <span class="est-time" v-if="a.estimated_minutes">
              ~{{ a.estimated_minutes }} min
            </span>
          </div>
        </div>
      </div>
    </template>

  </q-page>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useDeliveryStore } from 'src/stores/deliveryStore'

const store = useDeliveryStore()
const router = useRouter()

async function handleAccept(assignmentId) {
  try {
    await store.acceptAssignment(assignmentId)
    // Navigate to active page after accepting
    router.push('/delivery-app/active')
  } catch {
    // Error handled in store
  }
}

function goToActive(assignmentId) {
  store.loadActiveDelivery(assignmentId)
  router.push('/delivery-app/active')
}

function statusColor(status) {
  const map = {
    pending_rider: 'orange-8',
    accepted: 'blue-8',
    picked_up: 'cyan-8',
    delivered: 'green-8',
    cancelled: 'red-8',
  }
  return map[status] || 'grey-7'
}

function statusLabel(status) {
  const map = {
    pending_rider: 'Waiting',
    accepted: 'Accepted',
    picked_up: 'Picked Up',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }
  return map[status] || status
}
</script>

<style lang="scss" scoped>
.delivery-home-page {
  padding: 16px;
  min-height: 100vh;
}

// ─── Header ──────────────────────────────
.page-header {
  margin-bottom: 20px;
}
.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-title {
  font-size: 20px;
  font-weight: 800;
  color: #e8eaf0;
  margin: 0;
}

// ─── Stats ───────────────────────────────
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 14px;
}
.stat-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 12px 10px;
  text-align: center;
  &--pending { border-left: 3px solid #ff9800; }
  &--active  { border-left: 3px solid #42a5f5; }
  &--done    { border-left: 3px solid #66bb6a; }
}
.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: #e8eaf0;
}
.stat-label {
  font-size: 10px;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-top: 2px;
}

// ─── Loading / Empty ─────────────────────
.loading-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 0;
}
.loading-text { font-size: 13px; color: #9e9e9e; }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 20px;
  text-align: center;
}
.empty-title { font-size: 16px; font-weight: 700; color: #bdbdbd; }
.empty-sub { font-size: 12px; color: #757575; max-width: 260px; }

// ─── Section ─────────────────────────────
.section {
  margin-bottom: 24px;
}
.section-title {
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  color: #bdbdbd;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 10px;
  padding-left: 2px;
}

// ─── Assignment Card ─────────────────────
.assignment-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 10px;
  transition: border-color 0.2s ease;

  &--pending:hover { border-color: rgba(156, 39, 176, 0.3); }
  &--active {
    border-left: 3px solid #42a5f5;
    cursor: pointer;
    &:hover { border-color: rgba(66, 165, 245, 0.4); }
  }
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.order-badge {
  font-size: 16px;
  font-weight: 800;
  color: #e8eaf0;
  &--active { color: #64b5f6; }
}
.source-badge {
  font-size: 10px;
  font-weight: 700;
  color: #ce93d8;
  background: rgba(206, 147, 216, 0.12);
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.4px;
}
.status-chip {
  font-size: 10px !important;
  height: 20px !important;
}

.card-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: #bdbdbd;
}
.address-text {
  line-height: 1.4;
  color: #e0e0e0;
}
.total-amount {
  font-weight: 700;
  color: #a5d6a7;
}

.card-actions {
  margin-top: 14px;
}
.accept-btn {
  width: 100%;
  height: 42px;
  font-size: 13px;
  font-weight: 700;
  border-radius: 10px;
  letter-spacing: 0.3px;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  font-size: 10px;
  color: #757575;
}
.est-time {
  color: #9e9e9e;
}
</style>
