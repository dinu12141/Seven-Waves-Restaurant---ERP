<template>
  <q-page class="erp-page">
    <!-- Page Header -->
    <PageHeader
      title="Dashboard"
      subtitle="Real-time overview of restaurant performance"
      breadcrumb="Home"
    >
      <template #actions>
        <q-btn
          flat
          dense
          round
          icon="refresh"
          class="erp-btn-ghost"
          :loading="loading"
          @click="refreshData"
        >
          <q-tooltip>Refresh data</q-tooltip>
        </q-btn>
        <q-btn
          unelevated
          color="primary"
          icon="download"
          label="Export Report"
          class="erp-btn-primary"
        />
      </template>
    </PageHeader>

    <!-- ── KPI Stats Row ─────────────────────────────────────────────────── -->
    <div class="erp-kpi-grid q-mb-lg">
      <StatCard v-for="(stat, i) in stats" :key="i" v-bind="stat" />
    </div>

    <!-- ── Main Content Row ──────────────────────────────────────────────── -->
    <div class="erp-dashboard-content">
      <!-- Recent Orders (left, 60%) -->
      <div class="erp-dashboard-content__main">
        <DataTable
          title="Recent Orders"
          subtitle="Last 10 transactions"
          :rows="orders"
          :columns="orderColumns"
          :loading="loading"
          :rows-per-page="10"
        >
          <template #top-right>
            <q-btn
              flat
              dense
              size="sm"
              color="primary"
              label="View All Orders"
              icon-right="arrow_forward"
              to="/orders"
              class="erp-btn-ghost"
            />
          </template>
          <template #body-cell-status="props">
            <q-td :props="props">
              <StatusChip :status="props.value" />
            </q-td>
          </template>
          <template #body-cell-total="props">
            <q-td :props="props" class="text-right erp-num" style="font-weight: 500">
              {{ props.value }}
            </q-td>
          </template>
          <template #body-cell-id="props">
            <q-td :props="props">
              <span class="erp-order-id">#{{ props.value }}</span>
            </q-td>
          </template>
        </DataTable>
      </div>

      <!-- Right panel (40%) -->
      <div class="erp-dashboard-content__side">
        <!-- Top Selling Items -->
        <div class="erp-side-card">
          <div class="erp-side-card__header">
            <div>
              <div class="erp-side-card__title">Top Selling Items</div>
              <div class="erp-side-card__sub">Today's best performers</div>
            </div>
            <q-btn flat dense size="sm" icon="more_horiz" round class="erp-btn-ghost" />
          </div>

          <div class="erp-top-items">
            <div v-for="(item, index) in topItems" :key="index" class="erp-top-item">
              <div class="erp-top-item__rank">{{ index + 1 }}</div>
              <q-avatar size="38px" rounded class="erp-top-item__img">
                <img :src="item.image" loading="lazy" />
              </q-avatar>
              <div class="erp-top-item__info">
                <div class="erp-top-item__name">{{ item.name }}</div>
                <div class="erp-top-item__cat">{{ item.category }}</div>
              </div>
              <div class="erp-top-item__stats">
                <div class="erp-top-item__price erp-num">{{ item.price }}</div>
                <div class="erp-top-item__sold">{{ item.sales }} sold</div>
              </div>
            </div>
            <div v-if="topItems.length === 0" class="erp-top-items__empty">No sales data yet</div>
          </div>
        </div>

        <!-- Quick Status Summary -->
        <div class="erp-side-card erp-side-card--compact">
          <div class="erp-side-card__header">
            <div class="erp-side-card__title">System Status</div>
          </div>
          <div class="erp-status-list">
            <div class="erp-status-row" v-for="item in systemStatus" :key="item.label">
              <div class="erp-status-row__dot" :class="`erp-status-row__dot--${item.type}`"></div>
              <div class="erp-status-row__label">{{ item.label }}</div>
              <div class="erp-status-row__value">{{ item.value }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import PageHeader from 'components/common/PageHeader.vue'
import StatCard from 'components/common/StatCard.vue'
import DataTable from 'components/common/DataTable.vue'
import StatusChip from 'components/common/StatusChip.vue'
import { mockProducts } from 'src/data/mock'

const loading = ref(false)

// ── KPI Stats ──────────────────────────────────────────────────────────────────
const stats = ref([
  {
    title: "Today's Revenue",
    value: '$0.00',
    icon: 'payments',
    color: 'green',
    trend: '',
    trendIcon: 'trending_up',
    trendColor: 'positive',
    meta: 'All non-cancelled orders',
  },
  {
    title: 'Active Orders',
    value: '0',
    icon: 'receipt_long',
    color: 'blue',
    trend: '',
    trendIcon: 'trending_flat',
    trendColor: 'neutral',
    meta: 'Currently open',
  },
  {
    title: 'Kitchen Queue',
    value: '0',
    icon: 'soup_kitchen',
    color: 'orange',
    trend: '',
    meta: 'Pending preparation',
  },
  {
    title: 'Low Stock Alerts',
    value: '0',
    icon: 'inventory_2',
    color: 'red',
    trend: '',
    meta: 'Items below reorder level',
  },
])

// ── Orders Table ──────────────────────────────────────────────────────────────
const orders = ref([])

const orderColumns = [
  {
    name: 'id',
    label: 'Order #',
    field: 'id',
    align: 'left',
    sortable: true,
    style: 'width: 100px',
  },
  {
    name: 'customer',
    label: 'Customer',
    field: 'customer',
    align: 'left',
    sortable: true,
  },
  {
    name: 'type',
    label: 'Type',
    field: 'type',
    align: 'left',
    style: 'width: 100px',
  },
  {
    name: 'total',
    label: 'Total',
    field: 'total',
    align: 'right',
    sortable: true,
    style: 'width: 100px',
  },
  {
    name: 'status',
    label: 'Status',
    field: 'status',
    align: 'center',
    style: 'width: 120px',
  },
]

// ── Top Items ─────────────────────────────────────────────────────────────────
const topItems = ref(
  mockProducts.slice(0, 5).map((p) => ({
    ...p,
    price: `$${p.price.toFixed(2)}`,
    sales: Math.floor(Math.random() * 50) + 10,
  })),
)

// ── System Status ─────────────────────────────────────────────────────────────
const systemStatus = ref([
  { label: 'POS Terminal', value: 'Online', type: 'success' },
  { label: 'Kitchen Display', value: 'Online', type: 'success' },
  { label: 'Printer', value: 'Online', type: 'success' },
  { label: 'Database Sync', value: 'Synced', type: 'success' },
])

// ── Data Fetching ─────────────────────────────────────────────────────────────
async function fetchDashboardData() {
  loading.value = true
  try {
    const todayStr = new Date().toISOString().split('T')[0]

    const results = await Promise.allSettled([
      supabase
        .from('orders')
        .select('total_amount')
        .gte('created_at', todayStr + 'T00:00:00')
        .neq('status', 'cancelled'),

      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .not('status', 'in', '("completed","cancelled","paid")'),

      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['accepted', 'preparing', 'cooking']),

      supabase.from('inventory_items').select('quantity, reorder_level'),

      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(10),
    ])

    if (results[0].status === 'fulfilled' && results[0].value.data) {
      const total = results[0].value.data.reduce((s, o) => s + (o.total_amount || 0), 0)
      stats.value[0].value = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    if (results[1].status === 'fulfilled') {
      stats.value[1].value = results[1].value.count ?? 0
    }

    if (results[2].status === 'fulfilled') {
      stats.value[2].value = results[2].value.count ?? 0
    }

    if (results[3].status === 'fulfilled' && results[3].value.data) {
      const lowCount = results[3].value.data.filter(
        (i) => (i.quantity ?? 0) <= (i.reorder_level ?? 0),
      ).length
      stats.value[3].value = lowCount
    }

    if (results[4].status === 'fulfilled' && results[4].value.data) {
      orders.value = results[4].value.data.map((o) => ({
        id: o.order_number || o.id.slice(0, 8).toUpperCase(),
        customer: o.customer_name || 'Walk-in',
        total: `$${(o.total_amount || 0).toFixed(2)}`,
        status: o.status,
        type: o.order_type === 'dine_in' ? 'Dine-in' : 'Take-away',
      }))
    }
  } catch (err) {
    console.error('Dashboard fetch error:', err)
  } finally {
    loading.value = false
  }
}

function refreshData() {
  fetchDashboardData()
}

onMounted(fetchDashboardData)
</script>

<style scoped lang="scss">
.erp-page {
  padding: 24px;
  background-color: var(--erp-bg-page);
}

// ── KPI Grid ──────────────────────────────────────────────────────────────────
.erp-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

// ── Dashboard Content Grid ────────────────────────────────────────────────────
.erp-dashboard-content {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 16px;
  align-items: flex-start;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }

  &__main {
    min-width: 0;
  }
  &__side {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

// ── Side Cards ────────────────────────────────────────────────────────────────
.erp-side-card {
  background-color: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: 12px;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--erp-border);
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--erp-text-primary);
    line-height: 1.2;
  }

  &__sub {
    font-size: 11px;
    color: var(--erp-text-tertiary);
    margin-top: 2px;
  }

  &--compact {
    .erp-side-card__header {
      padding: 12px 16px;
    }
  }
}

// ── Top Items ─────────────────────────────────────────────────────────────────
.erp-top-items {
  padding: 4px 0;

  &__empty {
    padding: 24px;
    text-align: center;
    font-size: 13px;
    color: var(--erp-text-tertiary);
  }
}

.erp-top-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  transition: background-color 0.15s;

  &:hover {
    background-color: rgba(255, 255, 255, 0.02);
  }
  &:not(:last-child) {
    border-bottom: 1px solid var(--erp-border);
  }

  &__rank {
    font-size: 11px;
    font-weight: 700;
    color: var(--erp-text-tertiary);
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  &__img {
    flex-shrink: 0;
    border-radius: 8px !important;
    border: 1px solid var(--erp-border);
    overflow: hidden;

    img {
      object-fit: cover;
      width: 100%;
      height: 100%;
    }
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 13px;
    font-weight: 500;
    color: var(--erp-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__cat {
    font-size: 11px;
    color: var(--erp-text-tertiary);
    margin-top: 1px;
  }

  &__stats {
    text-align: right;
    flex-shrink: 0;
  }

  &__price {
    font-size: 13px;
    font-weight: 600;
    color: var(--erp-text-primary);
  }

  &__sold {
    font-size: 11px;
    color: var(--erp-success);
    margin-top: 1px;
  }
}

// ── System Status ─────────────────────────────────────────────────────────────
.erp-status-list {
  padding: 4px 0;
}

.erp-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--erp-border);

  &:last-child {
    border-bottom: none;
  }

  &__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;

    &--success {
      background-color: var(--erp-success);
      box-shadow: 0 0 6px rgba(52, 168, 83, 0.5);
    }
    &--warning {
      background-color: var(--erp-warning);
      box-shadow: 0 0 6px rgba(249, 171, 0, 0.5);
    }
    &--error {
      background-color: var(--erp-error);
      box-shadow: 0 0 6px rgba(234, 67, 53, 0.5);
    }
  }

  &__label {
    flex: 1;
    font-size: 13px;
    color: var(--erp-text-secondary);
  }

  &__value {
    font-size: 12px;
    font-weight: 600;
    color: var(--erp-success);
  }
}

// ── Order ID ──────────────────────────────────────────────────────────────────
.erp-order-id {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--erp-primary);
  background-color: var(--erp-primary-subtle);
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid rgba(67, 133, 245, 0.15);
}
</style>
