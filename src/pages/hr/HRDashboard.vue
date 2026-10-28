<template>
  <q-page class="q-pa-md">
    <ERPToolbar moduleName="hr" title="HR Dashboard" breadcrumbs="Human Resources / Overview" />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Main Content -->
    <div class="row q-col-gutter-md">
      <!-- HR Chart -->
      <div class="col-12 col-md-8">
        <DashboardChart
          title="Attendance & Shifts"
          subtitle="Staff present over the last 7 days"
          type="bar"
          :series="hrSeries"
          :options="hrOptions"
          :loading="loading"
        />
      </div>

      <!-- Pending Leave Alerts -->
      <div class="col-12 col-md-4">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Leave &amp; Alerts</div>
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
                <q-item-section side v-if="alert.action">
                  <q-btn flat dense color="primary" label="View" size="sm" />
                </q-item-section>
              </q-item>
              <div v-if="!loading && alerts.length === 0" class="text-grey-6 text-center q-pa-md">
                No pending leave requests.
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
import { localYmd } from 'src/services/hr/hrDates'
import { useAuthStore } from 'src/stores/auth'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import DashboardChart from 'components/dashboard/DashboardChart.vue'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
let timer = null

const kpis = ref([
  { title: 'Total Employees', value: '—', icon: 'groups', color: 'blue', isCurrency: false },
  { title: 'On-Shift Now', value: '—', icon: 'directions_run', color: 'green', isCurrency: false },
  { title: 'On Leave Today', value: '—', icon: 'event_busy', color: 'purple', isCurrency: false },
  { title: 'Pending Payroll', value: '—', icon: 'payments', color: 'orange', isCurrency: true },
  { title: 'Pending Leaves', value: '—', icon: 'pending_actions', color: 'teal', isCurrency: false },
  { title: 'Attendance Rate', value: '—', icon: 'schedule', color: 'indigo', isCurrency: false },
])

const alerts = ref([])

const hrSeries = ref([
  { name: 'Present', data: [] },
  { name: 'Absent', data: [] },
])

const hrOptions = computed(() => ({
  chart: { type: 'bar', toolbar: { show: false }, background: 'transparent', stacked: true },
  theme: { mode: $q.dark.isActive ? 'dark' : 'light' },
  xaxis: {
    categories: last7DayLabels(),
    labels: { style: { colors: '#9ca3af' } },
  },
  yaxis: { labels: { style: { colors: '#9ca3af' } } },
  colors: ['#3b82f6', '#ef4444'],
  grid: { borderColor: $q.dark.isActive ? '#374151' : '#e5e7eb', strokeDashArray: 4 },
  dataLabels: { enabled: false },
}))

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
    dates.push(localYmd(d))
  }
  return dates
}

const fetchData = async () => {
  loading.value = true
  try {
    const companyId = authStore.currentBranch?.company_id
    if (!companyId) return

    const today = localYmd()

    const [
      totalEmpRes,
      onLeaveRes,
      pendingLeaveRes,
      pendingPayrollRes,
      todayAttendanceRes,
      pendingLeaveAlerts,
      weekAttendanceRes,
    ] = await Promise.all([
      // KPI 1 — Total active employees
      supabase
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true),

      // KPI 2 — On leave today (approved leave spanning today)
      supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today),

      // KPI 3 — Pending leave approvals
      supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'pending'),

      // KPI 4 — Pending payroll (approved but not yet paid)
      supabase
        .from('payroll_runs')
        .select('total_net')
        .eq('company_id', companyId)
        .eq('status', 'approved'),

      // KPI 5 — Today's attendance (present count)
      supabase
        .from('attendance_records')
        .select('status')
        .eq('company_id', companyId)
        .eq('attendance_date', today),

      // Pending leave alerts panel (latest 5)
      supabase
        .from('leave_requests')
        .select('id, employee_id, employees(first_name, last_name), leave_type_id, leave_types(name), start_date, end_date, status')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),

      // Last 7 days attendance for chart
      supabase
        .from('attendance_records')
        .select('attendance_date, status')
        .eq('company_id', companyId)
        .gte('attendance_date', last7DateStrings()[0])
        .lte('attendance_date', today),
    ])

    // KPI 1 — Total employees
    kpis.value[0].value = String(totalEmpRes.count ?? '—')

    // KPI 3 (slot 2) — On leave today
    kpis.value[2].value = String(onLeaveRes.count ?? '—')

    // KPI 4 (slot 4) — Pending leave approvals
    kpis.value[4].value = String(pendingLeaveRes.count ?? '—')

    // KPI — Pending payroll sum
    const payrollTotal = (pendingPayrollRes.data || []).reduce(
      (sum, r) => sum + Number(r.total_net || 0),
      0,
    )
    kpis.value[3].value = String(payrollTotal)

    // KPI — Today attendance rate
    const todayRecords = todayAttendanceRes.data || []
    const presentCount = todayRecords.filter((r) =>
      ['present', 'late', 'half_day'].includes(r.status),
    ).length
    const totalToday = todayRecords.length
    const rate =
      totalToday > 0 ? Math.round((presentCount / totalToday) * 100) + '%' : '—'
    kpis.value[5].value = rate

    // KPI slot 1 — we leave "On-Shift Now" as presentCount for today
    kpis.value[1].value = String(presentCount)

    // Alerts panel
    alerts.value = (pendingLeaveAlerts.data || []).map((lr) => ({
      id: lr.id,
      title: `${lr.employees?.first_name || ''} ${lr.employees?.last_name || ''}`.trim() || 'Unknown',
      desc: `${lr.leave_types?.name || 'Leave'}: ${lr.start_date} → ${lr.end_date}`,
      icon: 'beach_access',
      color: 'blue-8',
      action: true,
    }))

    // Chart — last 7 days present / absent
    const dates = last7DateStrings()
    const weekData = weekAttendanceRes.data || []
    const presentByDay = {}
    const absentByDay = {}
    dates.forEach((d) => {
      presentByDay[d] = 0
      absentByDay[d] = 0
    })
    weekData.forEach((r) => {
      const d = r.attendance_date
      if (presentByDay[d] !== undefined) {
        if (['present', 'late', 'half_day'].includes(r.status)) presentByDay[d]++
        else if (['absent', 'on_leave', 'unpaid_leave'].includes(r.status)) absentByDay[d]++
      }
    })
    hrSeries.value = [
      { name: 'Present', data: dates.map((d) => presentByDay[d]) },
      { name: 'Absent', data: dates.map((d) => absentByDay[d]) },
    ]
  } catch (err) {
    console.error('[HRDashboard] fetchData error:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
  // Polling removed — realtime events handle live updates
  // timer = setInterval(fetchData, 30000)
})

onUnmounted(() => {
  clearInterval(timer)
})
</script>
