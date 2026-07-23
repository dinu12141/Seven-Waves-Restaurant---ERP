<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="inventory"
      title="Inventory Dashboard"
      breadcrumbs="Supply Chain / Overview"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg items-stretch">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <div class="row q-col-gutter-md">
      <!-- Low Stock Alerts -->
      <div class="col-12 col-md-4">
        <div class="alert-panel">
          <div class="alert-panel__header">
            <div class="alert-panel__title">
              <q-icon name="warning_amber" size="18px" class="q-mr-xs" color="orange" />
              Low Stock Alerts
              <q-badge
                v-if="lowStock.length"
                color="orange"
                :label="lowStock.length"
                class="q-ml-sm"
              />
            </div>
            <q-btn
              flat dense round icon="refresh" size="sm" color="grey-5"
              :loading="loading"
              @click="fetchData"
            >
              <q-tooltip>Refresh</q-tooltip>
            </q-btn>
          </div>

          <div class="alert-panel__body">
            <div v-if="loading" class="alert-empty">
              <q-spinner color="orange" size="24px" />
            </div>

            <div v-else-if="lowStock.length === 0" class="alert-empty">
              <q-icon name="check_circle" size="36px" color="positive" class="q-mb-sm" />
              <div>All stock levels are healthy!</div>
            </div>

            <transition-group v-else name="alert-slide" tag="div">
              <div
                v-for="alert in lowStock"
                :key="alert.item_code + '_' + alert.warehouse_name"
                class="alert-item"
                :class="alert.stock_status === 'out_of_stock' ? 'alert-item--critical' : 'alert-item--warning'"
                @click="openDetail(alert)"
              >
                <!-- Status badge -->
                <div class="alert-item__icon">
                  <q-icon
                    :name="alert.stock_status === 'out_of_stock' ? 'remove_shopping_cart' : 'warning'"
                    size="18px"
                    color="white"
                  />
                </div>

                <!-- Info -->
                <div class="alert-item__body">
                  <div class="alert-item__name">{{ alert.item_name }}</div>
                  <div class="alert-item__meta">
                    <span :class="alert.stock_status === 'out_of_stock' ? 'text-red-4' : 'text-orange-4'">
                      {{ Number(alert.qty_on_hand).toFixed(2) }} {{ alert.uom_code }}
                    </span>
                    &nbsp;·&nbsp; Min: {{ Number(alert.reorder_level).toFixed(0) }}
                    &nbsp;·&nbsp; {{ alert.warehouse_name }}
                  </div>
                </div>

                <!-- Severity chip -->
                <q-badge
                  :color="alert.stock_status === 'out_of_stock' ? 'red' : 'orange'"
                  :label="alert.stock_status === 'out_of_stock' ? 'OUT' : 'LOW'"
                  class="alert-item__badge"
                />

                <!-- Click hint -->
                <q-icon name="chevron_right" size="16px" color="grey-5" />
              </div>
            </transition-group>
          </div>
        </div>
      </div>

      <!-- Main Chart -->
      <div class="col-12 col-md-8">
        <DashboardChart
          title="Stock Movements"
          subtitle="Inbound vs Outbound over last 7 days"
          type="area"
          :series="stockSeries"
          :options="stockOptions"
          :loading="loading"
        />
      </div>
    </div>

    <!-- ════════  Detail Dialog  ════════ -->
    <q-dialog v-model="detailOpen" transition-show="scale" transition-hide="fade">
      <q-card class="detail-card" style="min-width: 420px; max-width: 500px">
        <!-- Header -->
        <div
          class="detail-header"
          :class="selectedAlert?.stock_status === 'out_of_stock' ? 'detail-header--red' : 'detail-header--orange'"
        >
          <div class="detail-header__left">
            <div class="detail-header__icon">
              <q-icon
                :name="selectedAlert?.stock_status === 'out_of_stock' ? 'remove_shopping_cart' : 'warning_amber'"
                size="24px"
                color="white"
              />
            </div>
            <div>
              <div class="detail-header__title">{{ selectedAlert?.item_name }}</div>
              <div class="detail-header__code">{{ selectedAlert?.item_code }}</div>
            </div>
          </div>
          <q-btn flat round icon="close" color="white" v-close-popup />
        </div>

        <!-- Body -->
        <q-card-section class="q-pa-lg">
          <div class="detail-grid">
            <div class="detail-metric">
              <div class="detail-metric__label">Current Stock</div>
              <div
                class="detail-metric__value"
                :class="selectedAlert?.stock_status === 'out_of_stock' ? 'text-red' : 'text-orange'"
              >
                {{ Number(selectedAlert?.qty_on_hand || 0).toFixed(2) }}
                <span class="detail-metric__unit">{{ selectedAlert?.uom_code }}</span>
              </div>
            </div>
            <div class="detail-metric">
              <div class="detail-metric__label">Minimum Level</div>
              <div class="detail-metric__value text-grey">
                {{ Number(selectedAlert?.reorder_level || 0).toFixed(0) }}
                <span class="detail-metric__unit">{{ selectedAlert?.uom_code }}</span>
              </div>
            </div>
            <div class="detail-metric">
              <div class="detail-metric__label">Warehouse</div>
              <div class="detail-metric__value text-blue" style="font-size:16px">
                {{ selectedAlert?.warehouse_name }}
              </div>
            </div>
            <div class="detail-metric">
              <div class="detail-metric__label">Status</div>
              <div class="detail-metric__value">
                <q-badge
                  :color="selectedAlert?.stock_status === 'out_of_stock' ? 'red' : 'orange'"
                  :label="selectedAlert?.stock_status === 'out_of_stock' ? '🚨 Out of Stock' : '⚠️ Low Stock'"
                  style="font-size:13px; padding: 6px 12px"
                />
              </div>
            </div>
            <div class="detail-metric detail-metric--full">
              <div class="detail-metric__label">Stock Value</div>
              <div class="detail-metric__value text-teal">
                LKR {{ Number(selectedAlert?.total_value || 0).toLocaleString() }}
              </div>
            </div>
            <div class="detail-metric detail-metric--full">
              <div class="detail-metric__label">Last Movement</div>
              <div class="detail-metric__value text-grey" style="font-size:14px">
                {{ formatDate(selectedAlert?.last_movement_at) }}
              </div>
            </div>
          </div>

          <!-- Shortage bar -->
          <div class="shortage-bar q-mt-lg">
            <div class="shortage-bar__label">
              <span>Stock Level</span>
              <span :class="selectedAlert?.stock_status === 'out_of_stock' ? 'text-red' : 'text-orange'">
                {{ shortagePercent }}% of minimum
              </span>
            </div>
            <q-linear-progress
              :value="shortagePercent / 100"
              :color="selectedAlert?.stock_status === 'out_of_stock' ? 'red' : 'orange'"
              track-color="grey-8"
              rounded
              size="10px"
              class="q-mt-xs"
            />
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-px-lg q-pb-lg q-pt-none">
          <q-btn
            unelevated no-caps
            icon="shopping_cart"
            label="Create Purchase Order"
            color="primary"
            @click="goProcurement"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar, date } from 'quasar'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import DashboardChart from 'components/dashboard/DashboardChart.vue'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const router = useRouter()
const loading = ref(false)
let timer = null

// ── KPI cards ────────────────────────────────────────────────────────────────
const kpis = ref([
  { title: 'Total Warehouses', value: '4',  icon: 'warehouse',            color: 'blue',        isCurrency: false },
  { title: 'Stock on Hand',    value: '–',  icon: 'inventory_2',          color: 'green',       isCurrency: true  },
  { title: 'Low Stock Items',  value: '–',  icon: 'warning',              color: 'orange',      isCurrency: false },
  { title: 'Today GRN',        value: '–',  icon: 'move_to_inbox',        color: 'teal',        isCurrency: false },
  { title: 'Today GIN',        value: '–',  icon: 'outbox',               color: 'deep-purple', isCurrency: false },
  { title: 'Stock Value',      value: '–',  icon: 'account_balance_wallet', color: 'indigo',    isCurrency: true  },
])

// ── Low stock ─────────────────────────────────────────────────────────────────
const lowStock = ref([])

// ── Detail dialog ─────────────────────────────────────────────────────────────
const detailOpen    = ref(false)
const selectedAlert = ref(null)

const shortagePercent = computed(() => {
  if (!selectedAlert.value) return 0
  const qty = Number(selectedAlert.value.qty_on_hand)
  const min = Number(selectedAlert.value.reorder_level)
  if (min <= 0) return 100
  return Math.min(100, Math.round((qty / min) * 100))
})

function openDetail(alert) {
  selectedAlert.value = alert
  detailOpen.value = true
}

function goProcurement() {
  detailOpen.value = false
  router.push('/procurement')
}

function formatDate(ts) {
  if (!ts) return '–'
  return date.formatDate(new Date(ts), 'DD MMM YYYY, HH:mm')
}

// ── Stock chart ───────────────────────────────────────────────────────────────
const stockSeries  = ref([{ name: 'Inbound', data: [] }, { name: 'Outbound', data: [] }])
const stockOptions = ref({})

// ── Notifications: send to all admins ─────────────────────────────────────────
async function notifyAdmins(items) {
  if (!items.length) return

  // Get admin user IDs
  const { data: admins } = await supabase
    .from('user_roles')
    .select('user_id, roles(name)')
    .eq('roles.name', 'admin')

  const adminIds = (admins || [])
    .filter(r => r.roles?.name === 'admin')
    .map(r => r.user_id)

  if (!adminIds.length) return

  const outOfStock = items.filter(i => i.stock_status === 'out_of_stock')
  const lowOnly    = items.filter(i => i.stock_status !== 'out_of_stock')

  // ── De-duplicate: check if same notification already exists today ──────────
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const titlesToCheck = []
  if (outOfStock.length) titlesToCheck.push(`🚨 ${outOfStock.length} Item(s) Out of Stock`)
  if (lowOnly.length)    titlesToCheck.push(`⚠️ ${lowOnly.length} Low Stock Alert(s)`)

  if (!titlesToCheck.length) return

  const { data: existing } = await supabase
    .from('notifications')
    .select('title')
    .in('title', titlesToCheck)
    .eq('ref_type', 'inventory')
    .gte('created_at', todayStart.toISOString())
    .limit(titlesToCheck.length)

  const alreadySent = new Set((existing || []).map(n => n.title))

  const rows = []
  const osTitle = `🚨 ${outOfStock.length} Item(s) Out of Stock`
  const lsTitle = `⚠️ ${lowOnly.length} Low Stock Alert(s)`

  for (const userId of adminIds) {
    if (outOfStock.length && !alreadySent.has(osTitle)) {
      rows.push({
        user_id: userId,
        type:    'alert',
        title:   osTitle,
        message: outOfStock.map(i => `${i.item_name} (${i.warehouse_name})`).join(', '),
        icon:    'remove_shopping_cart',
        color:   'red',
        action_url: '/inventory',
        ref_type:   'inventory',
      })
    }
    if (lowOnly.length && !alreadySent.has(lsTitle)) {
      rows.push({
        user_id: userId,
        type:    'warning',
        title:   lsTitle,
        message: lowOnly.map(i => `${i.item_name}: ${Number(i.qty_on_hand).toFixed(1)} ${i.uom_code} left`).join(' | '),
        icon:    'warning_amber',
        color:   'orange',
        action_url: '/inventory',
        ref_type:   'inventory',
      })
    }
  }

  if (rows.length) {
    await supabase.from('notifications').insert(rows)
  }
}

const _lastNotifiedCount = ref(-1)   // track so we don't spam on every poll

async function fetchData() {
  loading.value = true
  try {
    // Real low stock from view
    const { data: alerts } = await supabase
      .from('v_low_stock_alerts')
      .select('item_id, item_name, qty_on_hand, reorder_level, stock_status, uom_code, warehouse_name')
      .order('stock_status', { ascending: true })
      .order('qty_on_hand', { ascending: true })

    lowStock.value = alerts || []
    kpis.value[2].value = String(lowStock.value.length)

    // Notify admins only when count changes (avoids spam on every 30s poll)
    if (lowStock.value.length !== _lastNotifiedCount.value) {
      _lastNotifiedCount.value = lowStock.value.length
      if (lowStock.value.length > 0) {
        notifyAdmins(lowStock.value)  // fire-and-forget
      }
    }

    // GRN/GIN today
    const today = new Date().toISOString().split('T')[0]
    const { count: grnCount } = await supabase
      .from('inventory_documents')
      .select('id', { count: 'exact', head: true })
      .eq('doc_type', 'GRN')
      .gte('doc_date', today)

    const { count: ginCount } = await supabase
      .from('inventory_documents')
      .select('id', { count: 'exact', head: true })
      .eq('doc_type', 'GIN')
      .gte('doc_date', today)

    kpis.value[3].value = String(grnCount || 0)
    kpis.value[4].value = String(ginCount || 0)

    // Stock value
    const { data: soh } = await supabase
      .from('v_stock_on_hand')
      .select('total_value')

    const totalVal = (soh || []).reduce((sum, r) => sum + Number(r.total_value || 0), 0)
    kpis.value[1].value = totalVal.toLocaleString('en-LK', { minimumFractionDigits: 0 })
    kpis.value[5].value = totalVal.toLocaleString('en-LK', { minimumFractionDigits: 0 })

    // Chart: last 7 days movements from inventory_ledger
    const { data: mvts } = await supabase
      .from('v_inventory_ledger')
      .select('doc_type, direction, quantity, posted_at')
      .gte('posted_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('posted_at')

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000)
      return d.toLocaleDateString('en-US', { weekday: 'short' })
    })

    const inData  = Array(7).fill(0)
    const outData = Array(7).fill(0)

    ;(mvts || []).forEach(m => {
      const daysAgo = Math.floor((Date.now() - new Date(m.posted_at).getTime()) / 86400000)
      const idx = 6 - daysAgo
      if (idx >= 0 && idx < 7) {
        if (m.direction === 'IN') inData[idx] += Number(m.quantity || 0)
        else outData[idx] += Number(m.quantity || 0)
      }
    })

    stockSeries.value = [
      { name: 'Inbound',  data: inData },
      { name: 'Outbound', data: outData },
    ]
    stockOptions.value = {
      chart: { type: 'area', toolbar: { show: false }, background: 'transparent' },
      theme: { mode: $q.dark.isActive ? 'dark' : 'light' },
      xaxis: {
        categories: days,
        labels: { style: { colors: '#9ca3af' } },
      },
      yaxis: { labels: { style: { colors: '#9ca3af' } } },
      colors: ['#10b981', '#ef4444'],
      grid: { borderColor: '#374151', strokeDashArray: 4 },
      dataLabels: { enabled: false },
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] },
      },
      stroke: { curve: 'smooth', width: 2 },
    }
  } catch (e) {
    console.error('[InventoryDashboard]', e)
    $q.notify({ type: 'negative', message: 'Failed to load inventory data', caption: e.message })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
  // Polling removed — realtime events handle live updates
  // timer = setInterval(fetchData, 30000)
})
onUnmounted(() => clearInterval(timer))
</script>

<style scoped lang="scss">
// ── Alert Panel ────────────────────────────────────────────────────────────────
.alert-panel {
  background: var(--erp-bg-panel, var(--erp-bg-card));
  border: 1px solid var(--erp-border);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.alert-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--erp-border);
  background: var(--erp-bg-hover, rgba(255,255,255,0.03));
}

.alert-panel__title {
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
}

.alert-panel__body {
  flex: 1;
  padding: 10px;
  overflow-y: auto;
  max-height: 420px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}

// ── Alert item ─────────────────────────────────────────────────────────────────
.alert-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s ease;

  &--warning {
    background: rgba(251, 146, 60, 0.08);
    border-color: rgba(251, 146, 60, 0.2);
    &:hover {
      background: rgba(251, 146, 60, 0.15);
      border-color: rgba(251, 146, 60, 0.4);
      transform: translateX(2px);
    }
  }

  &--critical {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.2);
    &:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      transform: translateX(2px);
    }
  }

  &__icon {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: rgba(255,255,255,0.1);
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__meta {
    font-size: 11px;
    color: var(--erp-text-muted, #9ca3af);
    margin-top: 2px;
  }

  &__badge {
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 700;
  }
}

.alert-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #4b5563;
  font-size: 13px;
  text-align: center;
}

// Slide-in animation for alert items
.alert-slide-enter-active { transition: all 0.3s ease; }
.alert-slide-enter-from   { opacity: 0; transform: translateX(-10px); }

// ── Detail Dialog ──────────────────────────────────────────────────────────────
.detail-card {
  background: var(--erp-bg-card) !important;
  border: 1px solid var(--erp-border);
  border-radius: 16px !important;
  overflow: hidden;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid rgba(255,255,255,0.07);

  &--orange { background: linear-gradient(135deg, #78350f, #d97706); }
  &--red    { background: linear-gradient(135deg, #7f1d1d, #dc2626); }

  &__left { display: flex; align-items: center; gap: 14px; }

  &__icon {
    width: 46px; height: 46px;
    border-radius: 12px;
    background: rgba(255,255,255,0.2);
    display: flex; align-items: center; justify-content: center;
  }

  &__title {
    font-size: 18px; font-weight: 800; color: #fff;
  }

  &__code {
    font-size: 12px; color: rgba(255,255,255,0.7);
  }
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.detail-metric {
  background: var(--erp-bg-hover, rgba(0,0,0,0.03));
  border: 1px solid var(--erp-border);
  border-radius: 10px;
  padding: 14px;

  &--full { grid-column: 1 / -1; }

  &__label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #6b7280;
    margin-bottom: 6px;
  }

  &__value {
    font-size: 20px;
    font-weight: 800;
  }

  &__unit {
    font-size: 13px;
    font-weight: 500;
    color: #9ca3af;
  }
}

.shortage-bar {
  &__label {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 4px;
  }
}
</style>
