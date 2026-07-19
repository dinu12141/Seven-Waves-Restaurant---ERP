<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="procurement"
      title="Procurement Dashboard"
      breadcrumbs="Procurement / Overview"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Main Content -->
    <div class="row q-col-gutter-md">
      <!-- Purchases Chart -->
      <div class="col-12 col-md-8">
        <DashboardChart
          title="Procurement Activity"
          subtitle="Orders vs Receipts — last 7 days"
          type="line"
          :series="procurementSeries"
          :options="procurementOptions"
          :loading="loading"
        />
      </div>

      <!-- Supplier Alerts -->
      <div class="col-12 col-md-4">
        <q-card flat bordered class="erp-dashboard-panel shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold truncate">Supplier Alerts</div>
          </q-card-section>
          <q-card-section class="col q-pt-sm" style="position: relative">
            <q-inner-loading :showing="loading" color="primary" />
            <q-list class="erp-activity-list" padding>
              <q-item v-for="alert in alerts" :key="alert.id" class="q-pa-sm erp-activity-item">
                <q-item-section avatar top>
                  <q-avatar
                    size="32px"
                    :color="alert.color"
                    text-color="white"
                    :icon="alert.icon"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-medium">{{
                    alert.title
                  }}</q-item-label>
                  <q-item-label caption class="text-grey-5">{{ alert.desc }}</q-item-label>
                </q-item-section>
              </q-item>
              <div v-if="!loading && alerts.length === 0" class="text-grey-6 text-center q-pa-md">
                No overdue supplier payments.
              </div>
            </q-list>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import DashboardChart from 'components/dashboard/DashboardChart.vue'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
let timer = null

const kpis = ref([
  { title: 'Pending POs', value: '—', icon: 'assignment_late', color: 'orange', isCurrency: false },
  { title: 'Active Suppliers', value: '—', icon: 'local_shipping', color: 'blue', isCurrency: false },
  { title: 'Today GRN', value: '—', icon: 'move_to_inbox', color: 'teal', isCurrency: false },
  { title: 'Pending AP', value: '—', icon: 'request_quote', color: 'red', isCurrency: true },
  { title: 'Paid Today', value: '—', icon: 'payments', color: 'green', isCurrency: true },
  { title: 'Overdue AP', value: '—', icon: 'assignment_return', color: 'purple', isCurrency: false },
])

const alerts = ref([])

// Last 7 day labels for chart
function last7DayLabels() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const labels = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    labels.push(days[d.getDay()])
  }
  return labels
}

function last7DateStrings() {
  const dates = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

const procurementSeries = ref([
  { name: 'Purchase Orders', data: [] },
  { name: 'Goods Receipts', data: [] },
])

const procurementOptions = computed(() => ({
  chart: { type: 'line', toolbar: { show: false }, background: 'transparent' },
  theme: { mode: $q.dark.isActive ? 'dark' : 'light' },
  stroke: { curve: 'smooth', width: 3 },
  xaxis: {
    categories: last7DayLabels(),
    labels: { style: { colors: '#9ca3af' } },
  },
  yaxis: { labels: { style: { colors: '#9ca3af' } } },
  colors: ['#f59e0b', '#10b981'],
  grid: { borderColor: $q.dark.isActive ? '#374151' : '#e5e7eb', strokeDashArray: 4 },
  dataLabels: { enabled: false },
}))

function formatCurrency(val) {
  return 'LKR ' + Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fetchData = async () => {
  loading.value = true
  try {
    const companyId = authStore.currentBranch?.company_id
    if (!companyId) return

    const today = new Date().toISOString().split('T')[0]
    const dates = last7DateStrings()
    const weekStart = dates[0]

    const [
      pendingPORes,
      activeSuppliersRes,
      todayGRNRes,
      pendingAPRes,
      paidTodayRes,
      overdueAPCountRes,
      overdueAlertsRes,
      weekPORes,
      weekGRNRes,
    ] = await Promise.all([
      // KPI 1 — Pending POs (status = 'open' or 'approved')
      supabase
        .from('purchase_orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['open', 'approved']),

      // KPI 2 — Active suppliers
      supabase
        .from('suppliers')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true),

      // KPI 3 — Today's GRN (posted today)
      supabase
        .from('goods_receipts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'posted')
        .eq('doc_date', today),

      // KPI 4 — Pending AP balance (posted or partially paid)
      supabase
        .from('ap_invoices')
        .select('balance_due')
        .eq('company_id', companyId)
        .in('status', ['posted', 'partial_paid']),

      // KPI 5 — Paid today (supplier payments posted today)
      supabase
        .from('supplier_payments')
        .select('total_amount')
        .eq('company_id', companyId)
        .eq('doc_date', today)
        .eq('status', 'posted'),

      // KPI 6 — Count of overdue AP
      supabase
        .from('ap_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['posted', 'partial_paid'])
        .lt('due_date', today),

      // Supplier alerts — top 5 overdue invoices
      supabase
        .from('ap_invoices')
        .select('id, supplier_id, suppliers(name), due_date, balance_due')
        .eq('company_id', companyId)
        .in('status', ['posted', 'partial_paid'])
        .lt('due_date', today)
        .order('due_date')
        .limit(5),

      // Chart — POs created last 7 days
      supabase
        .from('purchase_orders')
        .select('doc_date')
        .eq('company_id', companyId)
        .gte('doc_date', weekStart)
        .lte('doc_date', today),

      // Chart — GRNs posted last 7 days
      supabase
        .from('goods_receipts')
        .select('doc_date')
        .eq('company_id', companyId)
        .eq('status', 'posted')
        .gte('doc_date', weekStart)
        .lte('doc_date', today),
    ])

    // KPI updates
    kpis.value[0].value = String(pendingPORes.count ?? '—')
    kpis.value[1].value = String(activeSuppliersRes.count ?? '—')
    kpis.value[2].value = String(todayGRNRes.count ?? '—')

    const pendingAP = (pendingAPRes.data || []).reduce(
      (sum, r) => sum + Number(r.balance_due || 0),
      0,
    )
    kpis.value[3].value = String(pendingAP)

    const paidToday = (paidTodayRes.data || []).reduce(
      (sum, r) => sum + Number(r.total_amount || 0),
      0,
    )
    kpis.value[4].value = String(paidToday)

    kpis.value[5].value = String(overdueAPCountRes.count ?? '—')
    kpis.value[5].title = 'Overdue AP'

    // Supplier alerts panel
    alerts.value = (overdueAlertsRes.data || []).map((inv) => {
      const daysOverdue = Math.floor(
        (new Date().getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24),
      )
      return {
        id: inv.id,
        title: inv.suppliers?.name || 'Unknown Supplier',
        desc: `Due: ${inv.due_date} · ${daysOverdue}d overdue · ${formatCurrency(inv.balance_due)}`,
        icon: 'warning',
        color: daysOverdue > 30 ? 'red-8' : 'orange-8',
      }
    })

    // Chart data — count PO & GRN per day
    const poByDay = {}
    const grnByDay = {}
    dates.forEach((d) => {
      poByDay[d] = 0
      grnByDay[d] = 0
    })
    ;(weekPORes.data || []).forEach((r) => {
      if (poByDay[r.doc_date] !== undefined) poByDay[r.doc_date]++
    })
    ;(weekGRNRes.data || []).forEach((r) => {
      if (grnByDay[r.doc_date] !== undefined) grnByDay[r.doc_date]++
    })

    procurementSeries.value = [
      { name: 'Purchase Orders', data: dates.map((d) => poByDay[d]) },
      { name: 'Goods Receipts', data: dates.map((d) => grnByDay[d]) },
    ]
  } catch (err) {
    console.error('[ProcurementDashboard] fetchData error:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
  timer = setInterval(fetchData, 30000)
})

onUnmounted(() => {
  clearInterval(timer)
})
</script>
