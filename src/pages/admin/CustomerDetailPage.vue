<template>
  <q-page class="q-pa-md customer-detail-page">
    <PageHeader
      title="Customer Detail"
      :subtitle="customer?.full_name || 'Loading...'"
      show-back
      back-route="/admin/customers"
    />

    <!-- Loading / Error -->
    <div v-if="loading" class="column items-center q-pa-xl">
      <q-spinner-dots size="48px" color="primary" />
      <div class="text-grey-6 q-mt-md">Loading customer data...</div>
    </div>

    <div v-else-if="error" class="column items-center q-pa-xl">
      <q-icon name="error_outline" size="64px" color="negative" class="q-mb-md" />
      <div class="text-h6 text-negative">{{ error }}</div>
      <q-btn flat icon="refresh" label="Retry" @click="loadDetail" class="q-mt-md" />
    </div>

    <div v-else-if="customer" class="q-gutter-md">
      <!-- Top Row: Profile Card + Loyalty Card -->
      <div class="row q-col-gutter-md">
        <!-- Profile Info -->
        <div class="col-12 col-md-4">
          <q-card flat bordered class="profile-card">
            <q-card-section class="column items-center q-pa-lg">
              <div class="profile-avatar">
                {{ (customer.full_name || '?').charAt(0).toUpperCase() }}
              </div>
              <div class="text-h5 text-weight-bold q-mt-md text-center">
                {{ customer.full_name }}
              </div>
              <q-chip
                dense
                :color="customer.is_active ? 'positive' : 'negative'"
                text-color="white"
                size="sm"
                class="q-mt-xs"
              >
                {{ customer.is_active ? 'Active' : 'Inactive' }}
              </q-chip>
            </q-card-section>
            <q-separator />
            <q-card-section class="q-pa-md">
              <div class="info-row">
                <q-icon name="mail_outline" size="16px" color="primary" />
                <span class="info-label">Email</span>
                <span class="info-value">{{ customer.email || '—' }}</span>
              </div>
              <div class="info-row">
                <q-icon name="phone" size="16px" color="primary" />
                <span class="info-label">Phone</span>
                <span class="info-value">{{ customer.phone || '—' }}</span>
              </div>
              <div class="info-row">
                <q-icon name="badge" size="16px" color="primary" />
                <span class="info-label">National ID</span>
                <span class="info-value">{{ customer.national_id || '—' }}</span>
              </div>
              <div class="info-row">
                <q-icon name="calendar_today" size="16px" color="primary" />
                <span class="info-label">Registered</span>
                <span class="info-value">{{ formatDate(customer.created_at) }}</span>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Loyalty Card -->
        <div class="col-12 col-md-8">
          <div class="row q-col-gutter-md">
            <!-- Loyalty Summary -->
            <div class="col-12">
              <q-card flat bordered class="loyalty-detail-card">
                <q-card-section class="q-pa-md">
                  <div class="text-overline text-grey-6 q-mb-md">LOYALTY ACCOUNT</div>
                  <div class="row q-col-gutter-md">
                    <div class="col-6 col-sm-3">
                      <div class="stat-block">
                        <q-icon name="credit_card" color="amber" size="24px" class="q-mb-xs" />
                        <div class="stat-value font-mono">
                          {{ customer.card_number || customer.loyalty_card_no || '—' }}
                        </div>
                        <div class="stat-label">Card Number</div>
                      </div>
                    </div>
                    <div class="col-6 col-sm-3">
                      <div class="stat-block">
                        <q-icon name="stars" color="amber" size="24px" class="q-mb-xs" />
                        <div class="stat-value text-amber-6">
                          {{ customer.points_balance || customer.loyalty_points || 0 }}
                        </div>
                        <div class="stat-label">Loyalty Points</div>
                      </div>
                    </div>
                    <div class="col-6 col-sm-3">
                      <div class="stat-block">
                        <q-chip
                          :color="getTierColor(customer.tier || customer.loyalty_tier)"
                          text-color="white"
                          size="md"
                          class="q-mb-xs"
                          >{{ getTierLabel(customer.tier || customer.loyalty_tier) }}</q-chip
                        >
                        <div class="stat-label">Loyalty Tier</div>
                      </div>
                    </div>
                    <div class="col-6 col-sm-3">
                      <div class="stat-block">
                        <q-icon name="shopping_bag" color="positive" size="24px" class="q-mb-xs" />
                        <div class="stat-value text-positive">{{ customer.total_orders || 0 }}</div>
                        <div class="stat-label">Total Orders</div>
                      </div>
                    </div>
                  </div>
                  <q-separator class="q-my-md" />
                  <div class="row items-center">
                    <q-icon name="payments" color="positive" size="20px" class="q-mr-sm" />
                    <span class="text-body1 text-weight-bold text-positive">
                      LKR {{ Number(customer.total_spent || 0).toLocaleString('en-LK') }}
                    </span>
                    <span class="text-caption text-grey-6 q-ml-sm">Total Spent</span>
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs: Sessions, Orders, Activity -->
      <q-card flat bordered class="data-tabs-card">
        <q-tabs
          v-model="activeTab"
          dense
          active-color="primary"
          indicator-color="primary"
          align="left"
          class="data-tabs"
        >
          <q-tab name="orders" icon="receipt_long" label="Orders" />
          <q-tab name="sessions" icon="table_restaurant" label="Table Sessions" />
          <q-tab name="activity" icon="history" label="Activity Log" />
        </q-tabs>
        <q-separator />

        <q-tab-panels v-model="activeTab" animated>
          <!-- Orders Tab -->
          <q-tab-panel name="orders" class="q-pa-md">
            <div v-if="!orders.length" class="empty-state">
              <q-icon name="receipt_long" size="48px" class="text-grey-5 q-mb-sm" />
              <div class="text-grey-6">No orders yet</div>
            </div>
            <q-list v-else separator class="rounded-borders">
              <q-item v-for="order in orders" :key="order.id" class="order-item">
                <q-item-section avatar>
                  <q-avatar
                    :color="getOrderStatusColor(order.status)"
                    text-color="white"
                    size="36px"
                  >
                    <q-icon name="receipt" size="18px" />
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold">{{ order.order_number }}</q-item-label>
                  <q-item-label caption
                    >{{ order.order_type }} · {{ formatDate(order.created_at) }}</q-item-label
                  >
                </q-item-section>
                <q-item-section side>
                  <q-chip
                    dense
                    :color="getOrderStatusColor(order.status)"
                    text-color="white"
                    size="sm"
                  >
                    {{ order.status }}
                  </q-chip>
                  <div class="text-weight-bold text-primary q-mt-xs">
                    LKR {{ Number(order.total_amount || 0).toLocaleString('en-LK') }}
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </q-tab-panel>

          <!-- Sessions Tab -->
          <q-tab-panel name="sessions" class="q-pa-md">
            <div v-if="!sessions.length" class="empty-state">
              <q-icon name="table_restaurant" size="48px" class="text-grey-5 q-mb-sm" />
              <div class="text-grey-6">No table sessions linked</div>
            </div>
            <q-list v-else separator class="rounded-borders">
              <q-item v-for="sess in sessions" :key="sess.id" class="session-item">
                <q-item-section avatar>
                  <q-avatar
                    :color="sess.is_active ? 'positive' : 'grey'"
                    text-color="white"
                    size="36px"
                  >
                    <q-icon name="table_restaurant" size="18px" />
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold">
                    {{ sess.branch_name || 'Main Branch' }}
                    · Table {{ sess.table_number || '—' }}
                  </q-item-label>
                  <q-item-label caption>{{ formatDateTime(sess.linked_at) }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-chip
                    dense
                    :color="sess.is_active ? 'positive' : 'grey'"
                    text-color="white"
                    size="xs"
                  >
                    {{ sess.is_active ? 'Active' : 'Ended' }}
                  </q-chip>
                </q-item-section>
              </q-item>
            </q-list>
          </q-tab-panel>

          <!-- Activity Tab -->
          <q-tab-panel name="activity" class="q-pa-md">
            <div v-if="!activityLog.length" class="empty-state">
              <q-icon name="history" size="48px" class="text-grey-5 q-mb-sm" />
              <div class="text-grey-6">No activity logged</div>
            </div>
            <q-timeline color="primary" class="q-pa-sm" v-else>
              <q-timeline-entry
                v-for="log in activityLog"
                :key="log.id"
                :title="getActivityTitle(log.activity_type)"
                :subtitle="formatDateTime(log.created_at)"
                :icon="getActivityIcon(log.activity_type)"
                :color="getActivityColor(log.activity_type)"
              >
                <div v-if="log.metadata && Object.keys(log.metadata).length" class="activity-meta">
                  <span v-for="(val, key) in log.metadata" :key="key" class="meta-chip">
                    {{ key }}: {{ val || '—' }}
                  </span>
                </div>
              </q-timeline-entry>
            </q-timeline>
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useQuasar, date } from 'quasar'
import PageHeader from 'components/common/PageHeader.vue'
import { adminGetCustomerDetail } from 'src/services/customerAuthService'

const route = useRoute()
const $q = useQuasar()

const loading = ref(false)
const error = ref(null)
const customer = ref(null)
const sessions = ref([])
const orders = ref([])
const activityLog = ref([])
const activeTab = ref('orders')

const customerId = route.params.id

async function loadDetail() {
  loading.value = true
  error.value = null
  try {
    const result = await adminGetCustomerDetail(customerId)
    if (!result.success) {
      error.value = result.error || 'Customer not found'
      return
    }
    customer.value = result.customer
    sessions.value = result.sessions || []
    orders.value = result.orders || []
    activityLog.value = result.activity || []
  } catch (err) {
    console.error('[CustomerDetail] Error:', err)
    error.value = 'Failed to load customer details'
    $q.notify({ type: 'negative', message: 'Failed to load customer details' })
  } finally {
    loading.value = false
  }
}

function formatDate(val) {
  if (!val) return '—'
  return date.formatDate(val, 'DD MMM YYYY')
}

function formatDateTime(val) {
  if (!val) return '—'
  return date.formatDate(val, 'DD MMM YYYY · HH:mm')
}

function getTierColor(tier) {
  if (!tier) return 'grey'
  const t = tier.toLowerCase()
  if (t === 'platinum') return 'purple'
  if (t === 'gold') return 'amber'
  if (t === 'silver') return 'blue-grey'
  return 'orange'
}

function getTierLabel(tier) {
  if (!tier) return 'Standard'
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

function getOrderStatusColor(status) {
  const map = {
    completed: 'positive',
    pending: 'warning',
    cancelled: 'negative',
    pending_waiter: 'info',
    preparing: 'primary',
    ready: 'teal',
    served: 'positive',
  }
  return map[status] || 'grey'
}

function getActivityTitle(type) {
  const map = {
    register: '📋 Customer Registered',
    login: '🔐 Customer Logged In',
    session_link: '🪑 Linked to Table Session',
    profile_update: '✏️ Profile Updated',
    order_placed: '🛒 Order Placed',
    auth_link: '🔗 Auth Account Linked',
  }
  return map[type] || type
}

function getActivityIcon(type) {
  const map = {
    register: 'person_add',
    login: 'login',
    session_link: 'table_restaurant',
    profile_update: 'edit',
    order_placed: 'shopping_cart',
    auth_link: 'link',
  }
  return map[type] || 'history'
}

function getActivityColor(type) {
  const map = {
    register: 'positive',
    login: 'primary',
    session_link: 'info',
    profile_update: 'warning',
    order_placed: 'teal',
    auth_link: 'purple',
  }
  return map[type] || 'grey'
}

onMounted(loadDetail)
</script>

<style lang="scss" scoped>
.customer-detail-page {
  max-width: 1200px;
  margin: 0 auto;
}

// Profile Card
.profile-card {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.profile-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 800;
  color: white;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);

  &:last-child {
    border-bottom: none;
  }
}

.info-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  min-width: 80px;
}

.info-value {
  font-size: 14px;
  font-weight: 500;
  color: #d1d5db;
  flex: 1;
  word-break: break-all;
}

// Loyalty Card
.loyalty-detail-card {
  border-radius: 16px;
  background: rgba(249, 115, 22, 0.04) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.stat-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 8px;
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 800;
  line-height: 1.2;
  margin-bottom: 2px;
  color: #e5e7eb;
}

.stat-label {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.font-mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  font-size: 13px;
  letter-spacing: 1px;
  color: #9ca3af;
}

// Tabs
.data-tabs-card {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.data-tabs {
  :deep(.q-tab) {
    font-size: 13px;
    font-weight: 600;
    text-transform: none;
    min-height: 48px;
    color: #9ca3af;
    &.q-tab--active {
      color: var(--q-primary);
    }
  }
}

// Tab panels dark bg
:deep(.q-tab-panels) {
  background: transparent !important;
}
:deep(.q-tab-panel) {
  background: transparent !important;
}

// Order / Session items
.order-item,
.session-item {
  padding: 12px 8px;
  border-radius: 8px;
  transition: background 0.15s;
  &:hover {
    background: rgba(59, 130, 246, 0.06);
  }
}

// Activity
.activity-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.meta-chip {
  font-size: 11px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 2px 8px;
  color: #9ca3af;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px;
}

// Override Quasar separator to be dark-themed
:deep(.q-separator) {
  background: rgba(255, 255, 255, 0.06) !important;
}

// Override list separators
:deep(.q-list--separator > .q-item-type + .q-item-type) {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
</style>
