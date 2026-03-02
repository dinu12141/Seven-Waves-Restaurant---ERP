<template>
  <div class="q-pa-md">
    <!-- Stats Row -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-sm-6 col-md-3">
        <StatCard
          title="Total Stock Value"
          :value="formatCurrency(stats.totalStockValue)"
          icon="account_balance_wallet"
          color="green"
        />
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <StatCard
          title="Low Stock Items"
          :value="String(stats.lowStockCount)"
          icon="warning"
          color="warning"
        />
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <StatCard title="Today's GRN" :value="String(stats.todayGRN)" icon="archive" color="blue" />
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <StatCard
          title="Today's GIN"
          :value="String(stats.todayGIN)"
          icon="unarchive"
          color="blue"
        />
      </div>
    </div>

    <!-- Warehouse Stock Summary -->
    <div class="erp-card q-pa-md q-mb-md">
      <div>
        <div class="text-h6 text-white q-mb-md">
          <q-icon name="warehouse" class="q-mr-sm" style="color: var(--erp-primary)" />Warehouse
          Stock Summary
        </div>
        <q-inner-loading :showing="stockLoading" dark />
        <div v-if="!stockLoading" class="row q-col-gutter-md">
          <div
            v-for="wh in warehouseSummary"
            :key="wh.warehouse_id"
            class="col-12 col-sm-6 col-md-4"
          >
            <div class="erp-card" style="padding: var(--erp-spacing-md)">
              <div class="row items-center q-mb-sm">
                <q-icon
                  :name="getWhIcon(wh.warehouse_type)"
                  :color="getWhColor(wh.warehouse_type)"
                  size="20px"
                  class="q-mr-sm"
                />
                <div style="font-size: 14px; font-weight: 600; color: var(--erp-text-primary)">
                  {{ wh.warehouse_name }}
                </div>
                <q-space />
                <q-badge :color="getWhColor(wh.warehouse_type)" css-class="erp-badge" rounded>{{
                  wh.warehouse_type
                }}</q-badge>
              </div>
              <div class="row q-col-gutter-sm text-center q-mt-md">
                <div class="col-4">
                  <div class="text-h2 erp-num" style="color: var(--erp-primary)">
                    {{ wh.item_count }}
                  </div>
                  <div class="text-caption" style="color: var(--erp-text-secondary)">Items</div>
                </div>
                <div class="col-4">
                  <div class="text-h2 erp-num text-positive">
                    {{ formatCurrencyShort(wh.total_value) }}
                  </div>
                  <div class="text-caption" style="color: var(--erp-text-secondary)">Value</div>
                </div>
                <div class="col-4">
                  <div
                    class="text-h2 erp-num"
                    :class="wh.low_stock > 0 ? 'text-warning' : 'text-grey-5'"
                  >
                    {{ wh.low_stock }}
                  </div>
                  <div class="text-caption" style="color: var(--erp-text-secondary)">Low Stock</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Low Stock Alerts -->
    <div class="erp-card q-pa-md" v-if="lowStockAlerts.length > 0">
      <div>
        <div class="text-h6 q-mb-md" style="color: var(--erp-warning)">
          <q-icon name="notification_important" class="q-mr-sm" />Low Stock Alerts
        </div>
        <div class="row q-col-gutter-md">
          <div
            v-for="item in lowStockAlerts.slice(0, 6)"
            :key="(item.item_id || '') + (item.warehouse_id || '')"
            class="col-12 col-sm-6 col-md-4"
          >
            <StockAlertCard :item="item" :show-actions="false" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import StatCard from 'components/common/StatCard.vue'
import StockAlertCard from 'components/inventory/StockAlertCard.vue'
import { useAuthStore } from 'src/stores/auth'
import { useStockDashboard, fetchDashboardStats } from 'src/services/inventoryService'
const authStore = useAuthStore()

const { stockOnHand, lowStockAlerts, loading: stockLoading, fetchStockOnHand } = useStockDashboard()

const stats = reactive({
  totalStockValue: 0,
  lowStockCount: 0,
  todayGRN: 0,
  todayGIN: 0,
})

const warehouseSummary = ref([])

// Robust loading: wait for company_id to be ready
watch(
  () => authStore.currentBranch?.company_id,
  (newCid) => {
    if (newCid) refreshAll()
  },
  { immediate: true },
)

onMounted(() => {
  if (authStore.currentBranch?.company_id) refreshAll()
})

async function refreshAll() {
  // Fetch stock + stats in parallel
  await Promise.all([fetchStockOnHand(), loadStats()])
  buildWarehouseSummary()
}

async function loadStats() {
  try {
    const s = await fetchDashboardStats()
    Object.assign(stats, s)
  } catch (e) {
    console.error('Dashboard stats error:', e)
  }
}

function buildWarehouseSummary() {
  const grouped = {}
  for (const row of stockOnHand.value) {
    const whId = row.warehouse_id
    if (!grouped[whId]) {
      grouped[whId] = {
        warehouse_id: whId,
        warehouse_name: row.warehouse_name,
        warehouse_type: row.warehouse_type,
        item_count: 0,
        total_value: 0,
        low_stock: 0,
      }
    }
    grouped[whId].item_count++
    grouped[whId].total_value += row.total_value || 0
    if (row.stock_status === 'low_stock' || row.stock_status === 'out_of_stock') {
      grouped[whId].low_stock++
    }
  }
  warehouseSummary.value = Object.values(grouped)
}

function getWhIcon(type) {
  const map = {
    main_store: 'warehouse',
    kitchen: 'soup_kitchen',
    bar: 'local_bar',
    freezer: 'ac_unit',
    dry_store: 'inventory_2',
  }
  return map[type] || 'store'
}

function getWhColor(type) {
  const map = {
    main_store: 'teal',
    kitchen: 'orange',
    bar: 'purple',
    freezer: 'cyan',
    dry_store: 'brown',
  }
  return map[type] || 'grey'
}

function formatCurrency(val) {
  return 'LKR ' + Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
}

function formatCurrencyShort(val) {
  if (val >= 1000000) return 'LKR ' + (val / 1000000).toFixed(1) + 'M'
  if (val >= 1000) return 'LKR ' + (val / 1000).toFixed(1) + 'K'
  return 'LKR ' + Number(val || 0).toFixed(0)
}
</script>
