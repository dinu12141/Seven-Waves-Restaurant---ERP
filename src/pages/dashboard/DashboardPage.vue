<template>
  <q-page class="neon-dashboard q-pa-xl">
    <div class="row justify-between items-center q-mb-lg">
      <div class="row items-center q-gutter-x-md">
        <q-btn flat round class="bg-cyan-10 text-cyan neon-glow-text" icon="space_dashboard" size="sm" />
        <div class="text-white text-h5 font-mono text-weight-bold letter-spacing-1">SEVEN_WAVES <span class="text-grey-6 font-14">// ERP v2.0</span></div>
      </div>
      <div>
        <q-btn-toggle
          v-model="timeFilter"
          class="neon-toggle font-mono text-weight-bold"
          no-caps
          rounded
          unelevated
          toggle-color="cyan-5"
          color="white"
          text-color="dark"
          :options="[
            {label: 'DAILY', value: 'daily'},
            {label: 'WEEKLY', value: 'weekly'},
            {label: 'MONTHLY', value: 'monthly'}
          ]"
        />
      </div>
    </div>

    <div class="row q-col-gutter-lg q-mb-xl">
      <!-- KPIs -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="neon-panel panel-cyan full-height column justify-between" flat>
          <div class="text-cyan-4 text-caption font-mono letter-spacing-1 text-weight-bold">GROSS_REVENUE</div>
          <div class="q-mt-md">
            <div class="text-h4 text-white text-weight-bold row items-baseline q-gutter-x-sm font-mono" style="line-height:0.9;">
              <span class="text-subtitle1 text-grey-5">LKR</span><span>{{ kpi1 }}</span>
            </div>
            <div class="text-cyan-4 font-mono font-10 q-mt-md letter-spacing-1">
              <q-icon name="trending_up" /> {{ timeFilter === 'daily' ? "TODAY'S" : timeFilter.toUpperCase() }} SALES
            </div>
          </div>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="neon-panel panel-pink full-height column justify-between" flat>
          <div class="text-pink-4 text-caption font-mono letter-spacing-1 text-weight-bold">ACTIVE_ORDERS</div>
          <div class="q-mt-md">
            <div class="text-h3 text-white text-weight-bold row items-baseline q-gutter-x-sm font-mono" style="line-height:0.9;">
              <span>{{ kpi2 }}</span><span class="text-subtitle1 text-grey-5">TICKETS</span>
            </div>
            <div class="text-pink-4 font-mono font-10 q-mt-md letter-spacing-1">
              <q-icon name="warning" size="14px" /> PENDING ACTIONS
            </div>
          </div>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="neon-panel panel-cyan full-height column justify-between" flat>
          <div class="text-cyan-4 text-caption font-mono letter-spacing-1 text-weight-bold">TABLE_OCCUPANCY</div>
          <div class="q-mt-md">
            <div class="text-h3 text-white text-weight-bold row items-baseline q-gutter-x-sm font-mono q-mb-sm" style="line-height:0.9;">
              <span>{{ (kpi3 * 100).toFixed(1) }}</span><span class="text-subtitle1 text-grey-5">%</span>
            </div>
            <q-linear-progress :value="kpi3" color="cyan-4" track-color="transparent" class="q-mt-lg neon-progress" size="4px" />
          </div>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="neon-panel panel-cyan full-height column justify-between" flat>
          <div class="text-cyan-4 text-caption font-mono letter-spacing-1 text-weight-bold">ACTIVE_STAFF</div>
          <div class="q-mt-md">
            <div class="text-h3 text-white text-weight-bold font-mono" style="line-height:0.9;">{{ kpi4 }}</div>
            <div class="row q-mt-lg q-gutter-x-xs items-center">
              <div class="peer-dot bg-cyan-2"></div>
              <div class="peer-dot bg-cyan-4"></div>
              <div class="peer-dot bg-cyan-6"></div>
              <div class="text-grey-5 font-10 q-ml-sm letter-spacing-1">ON FLOOR</div>
            </div>
          </div>
        </q-card>
      </div>
    </div>

    <div class="row q-col-gutter-xl">
      <div class="col-12 col-xl-8 column q-gutter-y-xl">
        <!-- Chart -->
        <q-card class="neon-panel bg-transparent col-auto" flat style="padding: 32px">
          <div class="row justify-between items-start q-mb-lg">
            <div>
              <div class="text-white text-h6 font-mono text-weight-bold letter-spacing-1">REVENUE_TREND</div>
              <div class="text-grey-6 font-mono font-10 letter-spacing-1">SALES TELEMETRY // {{ timeFilter.toUpperCase() }}</div>
            </div>
            <div class="row q-gutter-x-sm">
              <div class="badge-cyan">LIVE</div>
            </div>
          </div>
          <DashboardChart
            type="area"
            height="340"
            :series="revenueSeries"
            :options="neonChartOptions"
            :loading="loading"
          />
        </q-card>

        <!-- Active Processes Table -->
        <q-card class="neon-panel bg-transparent col" flat style="padding: 32px">
          <div class="row justify-between items-center q-mb-lg">
            <div class="text-white text-subtitle1 font-mono text-weight-bold letter-spacing-1">LIVE_ORDER_FEED</div>
            <q-btn to="/orders" flat dense class="text-cyan-4 font-mono font-10 letter-spacing-1 cursor-pointer" label="VIEW_ALL" />
          </div>
          <div class="neon-table">
            <div class="row text-grey-6 font-mono font-10 letter-spacing-1 q-mb-sm q-pb-md" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <div class="col-2">ORDER_ID</div>
              <div class="col-5">TYPE_/_TABLE</div>
              <div class="col-2 text-right q-pr-lg">AMOUNT</div>
              <div class="col-3 text-right">STATUS</div>
            </div>
            <div class="column q-gutter-y-sm">
              <div class="row items-center font-mono font-11 text-white q-py-sm" v-for="proc in activeProcesses" :key="proc.id">
                <div class="col-2 text-grey-4">#{{ proc.pid }}</div>
                <div class="col-5 row items-center q-gutter-x-sm">
                  <div class="status-dot" :class="'bg-' + proc.coreColor"></div>
                  <span class="text-grey-3">{{ proc.core }}</span>
                </div>
                <div class="col-2 text-grey-4 text-right q-pr-lg">{{ proc.load }}</div>
                <div class="col-3 text-right text-weight-bold letter-spacing-1" :class="'text-' + proc.statusColor">{{ proc.status }}</div>
              </div>
              <div v-if="activeProcesses.length === 0" class="text-grey-6 text-center font-mono q-py-lg">NO ACTIVE ORDERS</div>
            </div>
          </div>
        </q-card>
      </div>

      <div class="col-12 col-xl-4 column q-gutter-y-xl">
        <!-- NEURAL_APPS -->
        <q-card class="neon-panel bg-transparent col-auto" flat style="padding: 32px">
          <div class="text-white text-subtitle1 font-mono text-weight-bold letter-spacing-1 q-mb-xl">QUICK_MODULES</div>
          <div class="row q-col-gutter-md">
            <div class="col-6">
              <q-btn to="/pos" stretch flat class="neon-app-btn full-width column flex-center">
                <q-icon name="point_of_sale" size="28px" class="text-cyan-4 q-mb-md" />
                <span class="font-mono font-10 letter-spacing-1 text-grey-4">P.O.S</span>
              </q-btn>
            </div>
            <div class="col-6">
              <q-btn to="/kitchen" stretch flat class="neon-app-btn full-width column flex-center">
                <q-icon name="restaurant" size="28px" class="text-pink-5 q-mb-md" />
                <span class="font-mono font-10 letter-spacing-1 text-grey-4">KITCHEN</span>
              </q-btn>
            </div>
            <div class="col-6">
              <q-btn to="/inventory" stretch flat class="neon-app-btn full-width column flex-center">
                <q-icon name="inventory_2" size="28px" class="text-cyan-4 q-mb-md" />
                <span class="font-mono font-10 letter-spacing-1 text-grey-4">INVENTORY</span>
              </q-btn>
            </div>
            <div class="col-6">
              <q-btn to="/hr" stretch flat class="neon-app-btn full-width column flex-center">
                <q-icon name="people" size="28px" class="text-cyan-4 q-mb-md" />
                <span class="font-mono font-10 letter-spacing-1 text-grey-4">STAFF</span>
              </q-btn>
            </div>
          </div>
        </q-card>

        <!-- SYSTEM_MAP -> TABLE_MAP -->
        <q-card class="neon-panel bg-transparent col" flat style="padding: 32px; min-height: 480px">
          <div class="row justify-between items-center q-mb-md">
             <div class="text-white text-subtitle1 text-weight-bold letter-spacing-1">LIVE TABLE CHART</div>
             <div class="badge-cyan">{{ occupiedTablesCount }} / {{ totalTablesCount }} ACTIVE</div>
          </div>
          <div class="neon-map-container bg-grey-10 full-height relative-position overflow-hidden" style="border-radius: 8px;">
            
            <q-scroll-area class="full-height">
              <div class="row q-gutter-sm justify-center align-center q-pa-sm relative-position" style="z-index: 10;">
                 <div v-for="t in floorTables" :key="t.id">
                    <div 
                       class="floor-plan-box shadow-2" 
                       :class="t.occupied ? 'bg-orange text-white box-locked' : 'bg-positive text-white box-available'"
                    >
                       <div class="text-center">
                          <div class="text-weight-bolder" style="font-size: 13px; line-height: 1">
                             {{ (t.table_number || '').replace('Table', '').trim() }}
                          </div>
                          <div class="row items-center justify-center q-mt-xs" style="font-size: 8px; opacity: 0.9">
                             <q-icon name="people" size="8px" class="q-mr-xs" /> {{ t.capacity }}
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
            </q-scroll-area>
            
          </div>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import DashboardChart from 'components/dashboard/DashboardChart.vue'

const authStore = useAuthStore()
const loading = ref(false)
const timeFilter = ref('daily')

const kpi1 = ref('0.0')
const kpi2 = ref('0')
const kpi3 = ref(0.0) // Table Occupancy percentage
const kpi4 = ref('0')
const activeProcesses = ref([])
const floorTables = ref([])
const occupiedTablesCount = ref(0)
const totalTablesCount = ref(0)

const revenueSeries = ref([{ name: 'Revenue', data: [0,0,0,0,0,0,0] }])

const neonChartOptions = ref({
  chart: { 
    type: 'area', 
    toolbar: { show: false },
    background: 'transparent'
  },
  colors: ['#22d3ee'], // Cyan-4
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 3 },
  fill: {
    type: 'gradient',
    gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.0, stops: [0, 90, 100] },
  },
  xaxis: {
    categories: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Today'],
    labels: { style: { colors: '#4b5563', fontSize: '10px' } },
    axisBorder: { show: false },
    axisTicks: { show: false }
  },
  yaxis: { labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
  grid: { 
    borderColor: 'transparent',
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: false } }
  },
  tooltip: { theme: 'dark' }
})

let ordersChannel = null
let tablesChannel = null
let dashRefreshTimer = null

async function fetchDashboardData() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const now = new Date()
    let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (timeFilter.value === 'weekly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    } else if (timeFilter.value === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
    }
    const startStr = startDate.toISOString()

    const pActive = supabase.from('orders').select('id, status, total_amount, created_at, table_id, order_type').eq('branch_id', branchId).in('status', ['pending_waiter', 'accepted', 'preparing', 'ready', 'served', 'invoiced'])
    const pCompleted = supabase.from('orders').select('status, total_amount').eq('branch_id', branchId).in('status', ['paid', 'completed']).gte('created_at', startStr)
    const pTrend = supabase.from('orders').select('created_at, total_amount').eq('branch_id', branchId).in('status', ['paid', 'completed', 'served', 'invoiced']).gte('created_at', startStr)

    const pTables = supabase.from('restaurant_tables').select('id, table_number, capacity').eq('branch_id', branchId).order('table_number', { ascending: true })
    const todayStr = new Date().toISOString().split('T')[0]
    const pStaff = supabase.from('shift_assignments').select('id').eq('branch_id', branchId).eq('assignment_date', todayStr).in('status', ['active', 'present'])

    const [activeRes, completedRes, trendRes, tablesRes, staffRes] = await Promise.all([pActive, pCompleted, pTrend, pTables, pStaff])

    const activeOrders = activeRes.data || []
    let revenue = 0
    let loadCount = 0
    const occupiedTableIds = new Set()

    ;(completedRes.data || []).forEach(o => { revenue += o.total_amount || 0; })
    activeOrders.forEach(o => {
      loadCount++
      if (['served', 'invoiced'].includes(o.status) && new Date(o.created_at) >= new Date(startStr)) {
        revenue += o.total_amount || 0
      }
      if (o.table_id) occupiedTableIds.add(o.table_id)
    })

    kpi1.value = revenue.toLocaleString()
    kpi2.value = loadCount.toString()
    kpi4.value = staffRes.data?.length?.toString() || '0'
    
    // Map Tables
    totalTablesCount.value = tablesRes.data?.length || 0
    occupiedTablesCount.value = occupiedTableIds.size
    kpi3.value = totalTablesCount.value > 0 ? (occupiedTablesCount.value / totalTablesCount.value) : 0
    
    floorTables.value = (tablesRes.data || []).map(t => ({
       ...t,
       occupied: occupiedTableIds.has(t.id)
    }))
    
    // Map active orders to processes table
    const mapped = []
    activeOrders.slice(0, 10).forEach((o) => {
      let coreColor = 'cyan-5'
      let core = o.order_type === 'dine_in' ? 'DINE_IN' : 'TAKEAWAY'
      let statusColor = 'green-4'
      let statusStr = o.status.replace('_', ' ').toUpperCase()

      if (['preparing', 'accepted'].includes(o.status)) {
        coreColor = 'pink-5'
        statusColor = 'pink-5'
      } else if (o.status === 'pending_waiter') {
        coreColor = 'blue-4'
        statusColor = 'grey-5'
      }

      mapped.push({
        id: o.id,
        pid: o.id.toString(),
        core: core,
        coreColor: coreColor,
        load: `LKR ${o.total_amount?.toLocaleString() || 0}`,
        status: statusStr,
        statusColor: statusColor
      })
    })

    activeProcesses.value = mapped

    // Chart trend
    const trendOrders = trendRes.data || []
    const dataPoints = []
    const dates = []

    if (timeFilter.value === 'daily') {
      for (let i = 0; i <= 23; i+=2) { 
         dates.push(`${i}:00`)
         dataPoints.push(0)
      }
      trendOrders.forEach(o => {
         const d = new Date(o.created_at)
         const hour = d.getHours()
         const bucket = Math.floor(hour / 2)
         dataPoints[bucket] += (o.total_amount || 0)
      })
    } else if (timeFilter.value === 'weekly') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = d.toISOString().split('T')[0]
        dates.push(d.toLocaleDateString('en', { weekday: 'short' }).toUpperCase())
        dataPoints.push(trendOrders.filter(o => new Date(o.created_at).toISOString().split('T')[0] === key).reduce((sum, o) => sum + (o.total_amount || 0), 0))
      }
    } else if (timeFilter.value === 'monthly') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = d.toISOString().split('T')[0]
        dates.push(d.getDate().toString())
        dataPoints.push(trendOrders.filter(o => new Date(o.created_at).toISOString().split('T')[0] === key).reduce((sum, o) => sum + (o.total_amount || 0), 0))
      }
    }
    
    revenueSeries.value = [{ name: 'Revenue', data: dataPoints }]
    neonChartOptions.value = { ...neonChartOptions.value, xaxis: { ...neonChartOptions.value.xaxis, categories: dates } }

  } catch (err) {
    console.error('Neon Dashboard Error:', err)
  } finally {
    loading.value = false
  }
}

// Fast table occupancy refresh — only updates table map without refetching everything
async function refreshTableOccupancy() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  try {
    // Get all active orders with table_id
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('table_id')
      .eq('branch_id', branchId)
      .in('status', ['pending_waiter', 'accepted', 'preparing', 'ready', 'served', 'invoiced'])
      .not('table_id', 'is', null)

    const occupiedTableIds = new Set((activeOrders || []).map(o => o.table_id))
    occupiedTablesCount.value = occupiedTableIds.size
    kpi3.value = totalTablesCount.value > 0 ? (occupiedTablesCount.value / totalTablesCount.value) : 0

    floorTables.value = floorTables.value.map(t => ({
      ...t,
      occupied: occupiedTableIds.has(t.id)
    }))
  } catch (e) {
    console.error('[Dashboard] refreshTableOccupancy error:', e)
  }
}

function subscribeRealtime() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  if (ordersChannel) { supabase.removeChannel(ordersChannel); ordersChannel = null }
  if (tablesChannel) { supabase.removeChannel(tablesChannel); tablesChannel = null }

  // Orders channel — triggers full dashboard refresh + fast table update
  const orderChName = `neon-orders-${branchId}-${Date.now()}`
  ordersChannel = supabase.channel(orderChName)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'orders',
      filter: `branch_id=eq.${branchId}`
    }, () => {
      // Immediately refresh table occupancy for visual feedback
      refreshTableOccupancy()
      // Debounced full refresh for KPIs, chart, etc.
      if (dashRefreshTimer) clearTimeout(dashRefreshTimer)
      dashRefreshTimer = setTimeout(() => fetchDashboardData(), 300)
    })
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'kot_tickets'
    }, () => {
      // KOT status changes affect order status → refresh
      if (dashRefreshTimer) clearTimeout(dashRefreshTimer)
      dashRefreshTimer = setTimeout(() => fetchDashboardData(), 500)
    })
    .subscribe()

  // Tables channel — direct table status changes
  const tableChName = `neon-tables-${branchId}-${Date.now()}`
  tablesChannel = supabase.channel(tableChName)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'restaurant_tables',
      filter: `branch_id=eq.${branchId}`
    }, () => {
      refreshTableOccupancy()
    })
    .subscribe()
}

let booted = false
async function bootDashboard() {
  if (booted) return
  const branchId = authStore.currentBranch?.id
  if (!branchId || !authStore.user) return
  booted = true
  await fetchDashboardData()
  subscribeRealtime()
}

watch(timeFilter, () => {
  if (booted) fetchDashboardData()
})

watch(() => authStore.currentBranch?.id, (newId) => { if (newId) bootDashboard() }, { immediate: true })

onMounted(async () => {
  if (authStore.currentBranch?.id && authStore.user) {
    bootDashboard()
  } else {
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 500))
      if (authStore.currentBranch?.id) { bootDashboard(); break; }
    }
  }
})

onUnmounted(() => {
  if (ordersChannel) supabase.removeChannel(ordersChannel)
  if (tablesChannel) supabase.removeChannel(tablesChannel)
  if (dashRefreshTimer) clearTimeout(dashRefreshTimer)
  booted = false
})
</script>

<style scoped lang="scss">
.neon-dashboard {
  background-color: #0b1118 !important; /* Deep dark blue/black */
  font-family: inherit;
  min-height: 100vh;
}

.neon-toggle {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.3);
  
  :deep(.q-btn) {
    font-size: 11px;
    padding: 4px 16px;
  }
}

.font-mono {
  font-family: inherit !important;
}

.font-8 { font-size: 8px; }
.font-10 { font-size: 10px; }
.font-11 { font-size: 11px; }
.font-14 { font-size: 14px; }

.letter-spacing-1 { letter-spacing: 1px; }

/* Panels */
.neon-panel {
  background: rgba(18, 25, 35, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  
  &::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    border-radius: 12px;
    pointer-events: none;
    box-shadow: inset 0 0 40px rgba(0,0,0,0.5);
  }
}

.panel-cyan {
  padding: 24px;
  border: 1px solid rgba(34, 211, 238, 0.2);
  &:hover {
    border-color: rgba(34, 211, 238, 0.5);
    box-shadow: 0 0 15px rgba(34, 211, 238, 0.1);
  }
}

.panel-pink {
  padding: 24px;
  border: 1px solid rgba(236, 72, 153, 0.2); /* Pink */
  &:hover {
    border-color: rgba(236, 72, 153, 0.5);
    box-shadow: 0 0 15px rgba(236, 72, 153, 0.1);
  }
}

.neon-glow-text {
  text-shadow: 0 0 10px currentColor;
}

.badge-cyan {
  background: rgba(34, 211, 238, 0.2);
  color: #22d3ee;
  border: 1px solid rgba(34, 211, 238, 0.5);
  font-size: 10px;
  padding: 4px 10px;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 1px;
}

.badge-grey {
  background: rgba(255, 255, 255, 0.1);
  color: #9ca3af;
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 10px;
  padding: 4px 10px;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 1px;
}

/* Specific elements */
.neon-progress {
  border-radius: 2px;
  background: rgba(255,255,255,0.05) !important;
}

.peer-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  margin-left: -8px;
  border: 2px solid #0b1118;
  position: relative;
  &:first-child { margin-left: 0; }
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 5px currentColor;
}

/* Apps Grid */
.neon-app-btn {
  background: rgba(0,0,0,0.2) !important;
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 12px;
  height: 100px;
  transition: all 0.2s;
  &:hover {
    background: rgba(34, 211, 238, 0.05) !important;
    border-color: rgba(34, 211, 238, 0.3);
  }
}

/* Map placeholder */
.neon-map-container {
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.05);
  background-image: radial-gradient(circle at 50% 50%, rgba(34, 211, 238, 0.1) 0%, transparent 80%);
  
  .map-grid {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-size: 20px 20px;
    background-image: 
      linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  }
  
  .map-pulse {
    position: absolute;
    top: 60%;
    left: 45%;
    width: 12px;
    height: 12px;
    background: #22d3ee;
    border-radius: 50%;
    box-shadow: 0 0 10px #22d3ee, 0 0 20px #22d3ee;
    &::after {
      content: '';
      position: absolute;
      top: -10px; left: -10px; right: -10px; bottom: -10px;
      border-radius: 50%;
      border: 1px solid #22d3ee;
      animation: pulse 2s infinite ease-out;
    }
  }
}

.floor-plan-box {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  user-select: none;
}
.floor-plan-box:hover {
  transform: scale(1.08);
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.2),
    0 4px 6px -2px rgba(0, 0, 0, 0.1);
}
.box-available {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}
.box-locked {
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  animation: pulse-lock 2s infinite;
}
@keyframes pulse-lock {
  0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4); }
  70% { box-shadow: 0 0 0 8px rgba(249, 115, 22, 0); }
  100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
}

@keyframes pulse {
  0% { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(2); opacity: 0; }
}
</style>
