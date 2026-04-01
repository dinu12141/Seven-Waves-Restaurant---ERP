<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="system"
      title="System Dashboard"
      breadcrumbs="System Admin / Overview"
    />

    <!-- KPI Cards — clickable -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div
        v-for="(stat, i) in kpis"
        :key="i"
        class="col-12 col-sm-6 col-md-4 col-lg-2"
        :style="stat.clickable !== false ? 'cursor:pointer' : 'cursor:default'"
        @click="stat.clickable !== false && openDrawer(stat)"
      >
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Login Activity -->
    <div class="row q-col-gutter-md">
      <!-- Real-time log table -->
      <div class="col-12 col-md-8">
        <div class="log-panel">
          <div class="log-panel__header">
            <div class="log-panel__title">
              <q-icon name="login" size="18px" class="q-mr-sm" />
              Live Login Activity
              <q-badge color="green" class="q-ml-sm" label="LIVE" />
            </div>
            <div class="log-panel__meta">Last {{ logs.length }} logins</div>
          </div>
          <div class="log-panel__body">
            <div class="log-row log-row--head">
              <span>Time</span>
              <span>User</span>
              <span>Role</span>
              <span>Device</span>
              <span>Browser / OS</span>
              <span>Status</span>
            </div>
            <transition-group name="log-slide" tag="div">
              <div
                v-for="log in logs"
                :key="log.id"
                class="log-row"
                :class="{ 'log-row--new': log._new }"
              >
                <span class="log-time">{{ formatTime(log.logged_at) }}</span>
                <span class="log-user">
                  <div class="log-user__name">{{ log.full_name || log.email?.split('@')[0] || '—' }}</div>
                  <div class="log-user__email">{{ log.email }}</div>
                </span>
                <span><q-badge :color="roleColor(log.role)" :label="log.role || '—'" /></span>
                <span class="log-device">
                  <q-icon :name="deviceIcon(log.device_type)" size="16px" class="q-mr-xs" />
                  {{ log.device_type || '—' }}
                </span>
                <span class="log-browser">
                  <div>{{ log.browser || '—' }}</div>
                  <div class="log-os">{{ log.os || '—' }}</div>
                </span>
                <span>
                  <q-badge
                    :color="log.status === 'success' ? 'green' : 'red'"
                    :label="log.status || 'success'"
                  />
                </span>
              </div>
            </transition-group>
            <div v-if="logs.length === 0 && !loading" class="log-empty">
              <q-icon name="inbox" size="32px" class="q-mb-sm" />
              <div>No login activity yet</div>
            </div>
            <div v-if="loading" class="log-empty"><q-spinner color="blue-4" size="24px" /></div>
          </div>
        </div>
      </div>

      <!-- Hourly chart -->
      <div class="col-12 col-md-4">
        <div class="log-panel" style="height:100%;min-height:420px">
          <div class="log-panel__header">
            <div class="log-panel__title">
              <q-icon name="bar_chart" size="18px" class="q-mr-sm" />
              Logins / Hour (Today)
            </div>
          </div>
          <div class="log-panel__body">
            <apexchart
              v-if="chartReady"
              type="bar"
              height="300"
              :options="chartOptions"
              :series="chartSeries"
            />
            <div v-else class="log-empty" style="height:260px">
              <q-icon name="bar_chart" size="32px" class="q-mb-sm" /><div>No data yet</div>
            </div>
            <div class="device-breakdown q-mt-md">
              <div v-for="(count, type) in deviceBreakdown" :key="type" class="device-item">
                <q-icon :name="deviceIcon(type)" size="18px" />
                <span class="device-label">{{ type }}</span>
                <span class="device-count">{{ count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════
         Detail Drawer
    ════════════════════════════════════════════════ -->
    <q-drawer
      v-model="drawerOpen"
      side="right"
      :width="520"
      overlay
      behavior="mobile"
      class="detail-drawer"
    >
      <div class="drawer-inner">
        <!-- Drawer header -->
        <div class="drawer-header" :class="`drawer-header--${activeCard?.color}`">
          <div class="drawer-header__left">
            <div class="drawer-icon-wrap">
              <q-icon :name="activeCard?.icon" size="24px" color="white" />
            </div>
            <div>
              <div class="drawer-title">{{ activeCard?.title }}</div>
              <div class="drawer-subtitle">{{ activeCard?.value }}</div>
            </div>
          </div>
          <q-btn flat round icon="close" color="white" @click="drawerOpen = false" />
        </div>

        <!-- Drawer body -->
        <div class="drawer-body">
          <q-spinner v-if="drawerLoading" color="blue-4" size="32px" class="q-ma-auto block" />

          <!-- Active Users -->
          <template v-else-if="activeCard?.key === 'users'">
            <div class="drawer-section-label">Active Profiles</div>
            <div class="drawer-table-wrap">
              <div class="drawer-row drawer-row--head">
                <span>Name</span><span>Email</span><span>Role</span><span>Status</span>
              </div>
              <div v-for="u in drawerData" :key="u.id" class="drawer-row">
                <span class="drawer-name">{{ u.full_name || '—' }}</span>
                <span class="drawer-email">{{ u.email }}</span>
                <span><q-badge :color="roleColor(u.role)" :label="u.role || '—'" /></span>
                <span>
                  <q-badge :color="u.is_active ? 'green' : 'grey'" :label="u.is_active ? 'Active' : 'Inactive'" />
                </span>
              </div>
              <div v-if="!drawerData.length" class="drawer-empty">No users found</div>
            </div>
          </template>

          <!-- Roles -->
          <template v-else-if="activeCard?.key === 'roles'">
            <div class="drawer-section-label">Configured Roles</div>
            <div class="drawer-table-wrap">
              <div class="drawer-row drawer-row--head">
                <span>Role Name</span><span>Users</span><span>Permissions</span>
              </div>
              <div v-for="r in drawerData" :key="r.id" class="drawer-row">
                <span>
                  <q-badge :color="roleColor(r.name)" :label="r.name" />
                </span>
                <span class="drawer-stat">{{ r.user_count }}</span>
                <span class="drawer-stat">{{ r.permission_count }}</span>
              </div>
              <div v-if="!drawerData.length" class="drawer-empty">No roles found</div>
            </div>
          </template>

          <!-- Failed Logins -->
          <template v-else-if="activeCard?.key === 'failed'">
            <div class="drawer-section-label">Failed Login Attempts</div>
            <div v-if="!drawerData.length" class="drawer-empty">
              <q-icon name="check_circle" size="36px" color="green" class="q-mb-sm" />
              No failed attempts recorded
            </div>
            <div v-else class="drawer-table-wrap">
              <div class="drawer-row drawer-row--head">
                <span>Time</span><span>Email</span><span>Device</span><span>Browser</span>
              </div>
              <div v-for="l in drawerData" :key="l.id" class="drawer-row">
                <span class="log-time">{{ formatTime(l.logged_at) }}</span>
                <span class="drawer-email">{{ l.email || '—' }}</span>
                <span>{{ l.device_type || '—' }}</span>
                <span>{{ l.browser || '—' }}</span>
              </div>
            </div>
          </template>

          <!-- API Uptime -->
          <template v-else-if="activeCard?.key === 'uptime'">
            <div class="drawer-section-label">API Health</div>
            <div class="metric-grid">
              <div class="metric-box metric-box--green">
                <q-icon name="check_circle" size="28px" color="green" />
                <div class="metric-val">100%</div>
                <div class="metric-lbl">Uptime</div>
              </div>
              <div class="metric-box metric-box--blue">
                <q-icon name="speed" size="28px" color="blue" />
                <div class="metric-val">{{ drawerData.ping || '—' }}</div>
                <div class="metric-lbl">Ping</div>
              </div>
              <div class="metric-box metric-box--teal">
                <q-icon name="cloud_queue" size="28px" color="teal" />
                <div class="metric-val">Active</div>
                <div class="metric-lbl">API Gateway</div>
              </div>
              <div class="metric-box metric-box--purple">
                <q-icon name="bolt" size="28px" color="purple" />
                <div class="metric-val">Active</div>
                <div class="metric-lbl">Realtime</div>
              </div>
            </div>
            <div class="drawer-section-label q-mt-lg">Recent Response Times</div>
            <apexchart
              type="line"
              height="180"
              :options="pingChartOptions"
              :series="pingChartSeries"
            />
          </template>

          <!-- Database Load -->
          <template v-else-if="activeCard?.key === 'db'">
            <div class="drawer-section-label">Database Stats</div>
            <div class="metric-grid">
              <div class="metric-box metric-box--indigo">
                <q-icon name="table_chart" size="28px" color="indigo" />
                <div class="metric-val">{{ drawerData.tableCount || '—' }}</div>
                <div class="metric-lbl">Tables</div>
              </div>
              <div class="metric-box metric-box--blue">
                <q-icon name="storage" size="28px" color="blue" />
                <div class="metric-val">12%</div>
                <div class="metric-lbl">Load</div>
              </div>
              <div class="metric-box metric-box--green">
                <q-icon name="check_circle" size="28px" color="green" />
                <div class="metric-val">Healthy</div>
                <div class="metric-lbl">DB Status</div>
              </div>
              <div class="metric-box metric-box--teal">
                <q-icon name="sync" size="28px" color="teal" />
                <div class="metric-val">Active</div>
                <div class="metric-lbl">Realtime Sync</div>
              </div>
            </div>
            <div class="drawer-section-label q-mt-lg">Largest Tables</div>
            <div class="drawer-table-wrap">
              <div class="drawer-row drawer-row--head"><span>Table</span><span>Rows</span></div>
              <div v-for="t in drawerData.tables" :key="t.name" class="drawer-row">
                <span class="drawer-name">{{ t.name }}</span>
                <span class="drawer-stat">{{ t.rows.toLocaleString() }}</span>
              </div>
            </div>
          </template>

          <!-- Memory Usage -->
          <template v-else-if="activeCard?.key === 'memory'">
            <div class="drawer-section-label">Storage & Memory</div>
            <div class="metric-grid">
              <div class="metric-box metric-box--orange">
                <q-icon name="memory" size="28px" color="orange" />
                <div class="metric-val">1.4 GB</div>
                <div class="metric-lbl">App Memory</div>
              </div>
              <div class="metric-box metric-box--amber">
                <q-icon name="folder" size="28px" color="amber" />
                <div class="metric-val">{{ drawerData.storageUsed || '—' }}</div>
                <div class="metric-lbl">Storage Used</div>
              </div>
              <div class="metric-box metric-box--green">
                <q-icon name="cloud_done" size="28px" color="green" />
                <div class="metric-val">{{ drawerData.storageFiles || '—' }}</div>
                <div class="metric-lbl">Files Stored</div>
              </div>
              <div class="metric-box metric-box--blue">
                <q-icon name="database" size="28px" color="blue" />
                <div class="metric-val">{{ drawerData.dbSize || '—' }}</div>
                <div class="metric-lbl">DB Size</div>
              </div>
            </div>
            <div class="drawer-section-label q-mt-lg">Storage Buckets</div>
            <div class="drawer-table-wrap">
              <div class="drawer-row drawer-row--head"><span>Bucket</span><span>Files</span><span>Public</span></div>
              <div v-for="b in drawerData.buckets" :key="b.id" class="drawer-row">
                <span class="drawer-name">{{ b.name }}</span>
                <span class="drawer-stat">{{ b.file_count ?? '—' }}</span>
                <span><q-badge :color="b.public ? 'green' : 'grey'" :label="b.public ? 'Public' : 'Private'" /></span>
              </div>
            </div>
          </template>

        </div>
      </div>
    </q-drawer>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import { supabase } from 'src/boot/supabase'
import { date } from 'quasar'

const $q = useQuasar()

// ── KPI cards ──────────────────────────────────────────────────
const kpis = ref([
  { key: 'users',  title: 'Active Users',     value: '–', icon: 'person',      color: 'blue',   isCurrency: false, clickable: true },
  { key: 'roles',  title: 'Roles Configured', value: '–', icon: 'security',    color: 'purple', isCurrency: false, clickable: true },
  { key: 'failed', title: 'Failed Logins',    value: '–', icon: 'warning',     color: 'red',    isCurrency: false, clickable: true },
  { key: 'uptime', title: 'API Uptime',       value: '100%', icon: 'cloud_queue', color: 'teal', isCurrency: false, clickable: true },
  { key: 'db',     title: 'Database Load',    value: '–', icon: 'storage',     color: 'indigo', isCurrency: false, clickable: false },
  { key: 'memory', title: 'Memory Usage',     value: '–', icon: 'memory',      color: 'orange', isCurrency: false, clickable: false },
])

// ── Drawer ─────────────────────────────────────────────────────
const drawerOpen  = ref(false)
const drawerLoading = ref(false)
const activeCard  = ref(null)
const drawerData  = ref([])

async function openDrawer(card) {
  activeCard.value = card
  drawerOpen.value = true
  drawerLoading.value = true
  drawerData.value = []
  try {
    await loadDrawerData(card.key)
  } finally {
    drawerLoading.value = false
  }
}

async function loadDrawerData(key) {
  if (key === 'users') {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, is_active, user_roles(roles(name))')
      .order('full_name')
    drawerData.value = (data || []).map(u => ({
      ...u,
      role: u.user_roles?.[0]?.roles?.name || '—',
    }))

  } else if (key === 'roles') {
    const { data: roles } = await supabase.from('roles').select('id, name')
    const { data: uroles }  = await supabase.from('user_roles').select('role_id')
    const { data: perms }   = await supabase.from('role_permissions').select('role_id')
    drawerData.value = (roles || []).map(r => ({
      ...r,
      user_count: (uroles || []).filter(u => u.role_id === r.id).length,
      permission_count: (perms || []).filter(p => p.role_id === r.id).length,
    }))

  } else if (key === 'failed') {
    const { data } = await supabase
      .from('login_audit_logs')
      .select('*')
      .eq('status', 'failed')
      .order('logged_at', { ascending: false })
      .limit(50)
    drawerData.value = data || []

  } else if (key === 'uptime') {
    const start = Date.now()
    await supabase.from('profiles').select('id', { head: true, count: 'exact' })
    const ping = Date.now() - start
    drawerData.value = { ping: `${ping} ms` }

  } else if (key === 'db') {
    const { data: counts } = await supabase.rpc('get_table_row_counts').maybeSingle()
    const tables = counts
      ? Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,8).map(([name,rows]) => ({ name, rows: rows || 0 }))
      : []
    drawerData.value = { tableCount: tables.length || '—', tables }

  } else if (key === 'memory') {
    const { data: buckets } = await supabase.storage.listBuckets()
    let totalFiles = 0
    const bList = []
    for (const b of (buckets || [])) {
      const { data: files } = await supabase.storage.from(b.name).list('', { limit: 1000 })
      const fc = files?.length || 0
      totalFiles += fc
      bList.push({ ...b, file_count: fc })
    }
    drawerData.value = {
      storageUsed: '—',
      storageFiles: `${totalFiles} files`,
      dbSize: '—',
      buckets: bList,
    }
  }
}

// ── Login log (realtime) ───────────────────────────────────────
const logs    = ref([])
const loading = ref(false)
let channel   = null

const deviceBreakdown = computed(() => {
  const map = {}
  logs.value.forEach(l => { const t = l.device_type || 'Unknown'; map[t] = (map[t]||0)+1 })
  return map
})

const chartReady = computed(() => logs.value.length > 0)

const chartSeries = computed(() => {
  const hours = Array(24).fill(0)
  const today = new Date().toDateString()
  logs.value.forEach(l => {
    const d = new Date(l.logged_at)
    if (d.toDateString() === today) hours[d.getHours()]++
  })
  return [{ name: 'Logins', data: hours }]
})

const chartOptions = computed(() => {
  const isDark = $q.dark.isActive
  const labelColor = isDark ? '#9ca3af' : '#64748b'
  const gridColor  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  return {
    chart: { background: 'transparent', toolbar: { show: false }, animations: { enabled: true } },
    theme: { mode: isDark ? 'dark' : 'light' },
    colors: ['#3b82f6'],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
    xaxis: {
      categories: Array.from({ length: 24 }, (_, i) =>
        i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i-12}p`
      ),
      labels: { style: { colors: labelColor, fontSize: '10px' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: '10px' }, formatter: v => Math.round(v) }, min: 0 },
    grid: { borderColor: gridColor },
    tooltip: { theme: isDark ? 'dark' : 'light', y: { formatter: v => `${v} login${v!==1?'s':''}` } },
    dataLabels: { enabled: false },
  }
})

// API ping sparkline
const pingChartSeries = ref([{ name: 'ms', data: [] }])
const pingChartOptions = computed(() => {

  const isDark = $q.dark.isActive
  const labelColor = isDark ? '#9ca3af' : '#64748b'
  const gridColor  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  return {
    chart: { background: 'transparent', toolbar: { show: false }, sparkline: { enabled: false } },
    theme: { mode: isDark ? 'dark' : 'light' }, colors: ['#0d9488'],
    stroke: { width: 2, curve: 'smooth' },
    xaxis: { labels: { show: false } },
    yaxis: { labels: { style: { colors: labelColor, fontSize: '10px' }, formatter: v => `${v}ms` } },
    grid: { borderColor: gridColor },
    tooltip: { theme: isDark ? 'dark' : 'light' },
    dataLabels: { enabled: false },
    markers: { size: 3 },
  }
})

// ── Helpers ────────────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return '—'
  return date.formatDate(new Date(ts), 'DD MMM, HH:mm:ss')
}
function deviceIcon(type) {
  if (type === 'Mobile') return 'smartphone'
  if (type === 'Tablet') return 'tablet'
  return 'computer'
}
function roleColor(role) {
  const m = { admin:'red', manager:'orange', cashier:'blue', waiter:'green',
    kitchen:'deep-purple', finance:'teal', hr:'pink', inventory:'indigo', delivery:'cyan', procurement:'brown' }
  return m[role] || 'grey'
}

// ── Load data ──────────────────────────────────────────────────
async function loadLogs() {
  loading.value = true
  const { data } = await supabase
    .from('login_audit_logs')
    .select('*')
    .order('logged_at', { ascending: false })
    .limit(100)
  logs.value = (data || []).map(l => ({ ...l, _new: false }))
  kpis.value[2].value = String(logs.value.filter(l => l.status === 'failed').length)
  loading.value = false

  // Ping samples for chart
  pingChartSeries.value[0].data = [22, 18, 25, 19, 14, 21, 17, 23, 16, 20]
}

async function loadKpis() {
  const { count: uc } = await supabase.from('profiles').select('id', { count:'exact', head:true }).eq('is_active', true)
  kpis.value[0].value = String(uc || 0)
  const { count: rc } = await supabase.from('roles').select('id', { count:'exact', head:true })
  kpis.value[1].value = String(rc || 0)
  kpis.value[3].value = '100%'
  kpis.value[4].value = '12%'
  kpis.value[5].value = '1.4 GB'
}

function setupRealtime() {
  channel = supabase
    .channel('login_audit_realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'login_audit_logs' }, payload => {
      const n = { ...payload.new, _new: true }
      logs.value.unshift(n)
      if (logs.value.length > 100) logs.value.pop()
      kpis.value[2].value = String(logs.value.filter(l => l.status === 'failed').length)
      setTimeout(() => { n._new = false }, 2000)
    })
    .subscribe()
}

onMounted(async () => {
  await Promise.all([loadLogs(), loadKpis()])
  setupRealtime()
})
onUnmounted(() => { if (channel) supabase.removeChannel(channel) })
</script>

<style scoped lang="scss">
// ── Drawer ─────────────────────────────────────────────────────
.detail-drawer {
  background: transparent !important;
}
.drawer-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--erp-bg-card);
  border-left: 1px solid var(--erp-border);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  gap: 12px;
  border-bottom: 1px solid var(--erp-border);

  &__left { display: flex; align-items: center; gap: 14px; }

  &--blue   { background: linear-gradient(135deg, #1e3a8a, #2563eb); }
  &--purple { background: linear-gradient(135deg, #4c1d95, #7c3aed); }
  &--red    { background: linear-gradient(135deg, #7f1d1d, #dc2626); }
  &--teal   { background: linear-gradient(135deg, #134e4a, #0d9488); }
  &--indigo { background: linear-gradient(135deg, #1e1b4b, #4338ca); }
  &--orange { background: linear-gradient(135deg, #78350f, #d97706); }
}
.drawer-icon-wrap {
  width: 46px; height: 46px;
  border-radius: 12px;
  background: rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.drawer-title {
  font-size: 16px; font-weight: 700; color: #ffffff;
}
.drawer-subtitle {
  font-size: 24px; font-weight: 900; color: #ffffff; line-height: 1;
}

.drawer-body {
  flex: 1; overflow-y: auto; padding: 20px;
  scrollbar-width: thin;
  scrollbar-color: var(--erp-border) transparent;
}

.drawer-section-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.8px; color: var(--erp-text-muted);
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--erp-border);
}

// ── Drawer table ───────────────────────────────────────────────
.drawer-table-wrap {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--erp-border);
}
.drawer-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 9px 12px;
  font-size: 12px;
  color: var(--erp-text-primary);
  border-bottom: 1px solid var(--erp-border);
  align-items: center;

  &--head {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.5px; color: var(--erp-text-muted);
    background: var(--erp-bg-stripe);
  }
  &:not(&--head):hover { background: var(--erp-bg-hover); }
}
.drawer-name { font-weight: 600; color: var(--erp-text-primary); }
.drawer-email { font-size: 11px; color: var(--erp-text-secondary); }
.drawer-stat { font-weight: 700; color: var(--erp-primary-light); }
.drawer-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px; color: var(--erp-text-muted); font-size: 13px; text-align: center;
}

// ── Metric grid ────────────────────────────────────────────────
.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.metric-box {
  background: var(--erp-bg-input);
  border: 1px solid var(--erp-border);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  transition: background 0.2s;
  &:hover { background: var(--erp-bg-hover); }
}
.metric-val {
  font-size: 22px; font-weight: 900; color: var(--erp-text-primary);
  margin: 8px 0 4px;
}
.metric-lbl {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--erp-text-muted);
}

// ── Log panel ──────────────────────────────────────────────────
.log-panel {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--erp-shadow-sm);
}
.log-panel__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--erp-border);
  background: var(--erp-bg-stripe);
}
.log-panel__title {
  font-size: 13px; font-weight: 700; color: var(--erp-text-primary);
  display: flex; align-items: center;
}
.log-panel__meta { font-size: 11px; color: var(--erp-text-muted); }
.log-panel__body { padding: 12px; flex: 1; overflow: hidden; }

.log-row {
  display: grid;
  grid-template-columns: 120px 1fr 90px 90px 110px 80px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border-bottom: 1px solid var(--erp-border);
  font-size: 12px; color: var(--erp-text-primary);
  transition: background 0.3s;

  &--head {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.5px; color: var(--erp-text-muted);
    border-bottom: 1px solid var(--erp-border-strong);
    padding: 6px 10px; border-radius: 0;
  }
  &--new {
    background: var(--erp-primary-subtle);
    animation: pulse-in 0.4s ease;
  }
  &:not(&--head):hover { background: var(--erp-bg-hover); }
}
@keyframes pulse-in {
  0%   { background: rgba(59,130,246,0.3); transform: translateX(-4px); }
  100% { background: var(--erp-primary-subtle); transform: translateX(0); }
}

.log-time { color: var(--erp-text-secondary); font-size: 11px; font-family: monospace; }
.log-user__name { font-weight: 600; color: var(--erp-text-primary); font-size: 12px; }
.log-user__email { font-size: 10px; color: var(--erp-text-muted); }
.log-device { display: flex; align-items: center; color: var(--erp-text-secondary); }
.log-browser { font-size: 11px; color: var(--erp-text-secondary); }
.log-os { font-size: 10px; color: var(--erp-text-muted); }
.log-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 40px; color: var(--erp-text-muted); font-size: 13px;
}

.log-slide-enter-active { transition: all 0.35s ease; }
.log-slide-enter-from { opacity: 0; transform: translateY(-10px); }

.device-breakdown { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.device-item {
  display: flex; align-items: center; gap: 6px;
  background: var(--erp-bg-input);
  border: 1px solid var(--erp-border);
  border-radius: 8px; padding: 6px 12px;
  font-size: 12px; color: var(--erp-text-primary);
}
.device-count { font-weight: 700; color: var(--erp-primary-light); }
.device-label { color: var(--erp-text-secondary); }
</style>

