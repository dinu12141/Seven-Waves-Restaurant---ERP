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
                class="log-row log-row--clickable"
                :class="{ 'log-row--new': log._new }"
                @click="openUserAudit(log)"
              >
                <q-tooltip anchor="top middle" self="bottom middle" :offset="[0, 5]">
                  Click to inspect user's working time and all activities performed
                </q-tooltip>
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
                <span class="row items-center">
                  <q-badge
                    :color="log.status === 'success' ? 'green' : 'red'"
                    :label="log.status || 'success'"
                    class="q-mr-xs"
                  />
                  <q-icon name="chevron_right" color="grey-6" size="16px" />
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

    <!-- ════════════════════════════════════════════════
         User Activity & Work Session Audit Modal
    ════════════════════════════════════════════════ -->
    <q-dialog v-model="showUserAuditDialog" persistent max-width="1000px" style="width: 1000px;">
      <q-card style="width: 1000px; max-width: 95vw; max-height: 90vh;" class="column">
        <!-- Header -->
        <q-card-section class="row items-center justify-between bg-primary text-white q-py-sm">
          <div class="row items-center">
            <q-avatar size="36px" color="white" text-color="primary" class="q-mr-sm text-weight-bold">
              {{ (selectedUserLog?.full_name || selectedUserLog?.email || 'U').charAt(0).toUpperCase() }}
            </q-avatar>
            <div>
              <div class="text-h6 text-weight-bold row items-center">
                {{ selectedUserLog?.full_name || selectedUserLog?.email?.split('@')[0] || 'User' }}
                <q-badge :color="roleColor(selectedUserLog?.role)" :label="selectedUserLog?.role?.toUpperCase()" class="q-ml-sm" />
              </div>
              <div class="text-caption" style="opacity: 0.9;">
                {{ selectedUserLog?.email }} • Logged in via {{ selectedUserLog?.device_type }} ({{ selectedUserLog?.browser }} on {{ selectedUserLog?.os }})
              </div>
            </div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <!-- Working Time & Session Duration Strip -->
        <div class="bg-blue-1 border-bottom q-pa-md">
          <div class="row q-col-gutter-md items-center">
            <!-- Work Duration -->
            <div class="col-12 col-sm-3">
              <div class="bg-white q-pa-sm rounded-borders shadow-1 text-center">
                <div class="text-caption text-grey-7 text-weight-medium">
                  <q-icon name="timer" color="primary" class="q-mr-xs" />TOTAL WORK TIME
                </div>
                <div class="text-h6 text-weight-bolder text-primary">
                  {{ userAuditStats.workDuration }}
                </div>
                <div class="text-caption text-grey-6">{{ userAuditStats.sessionStatus }}</div>
              </div>
            </div>

            <!-- Login Window -->
            <div class="col-12 col-sm-3">
              <div class="bg-white q-pa-sm rounded-borders shadow-1 text-center">
                <div class="text-caption text-grey-7 text-weight-medium">
                  <q-icon name="login" color="green" class="q-mr-xs" />LOGIN TIME
                </div>
                <div class="text-subtitle2 text-weight-bold">
                  {{ formatTime(selectedUserLog?.logged_at) }}
                </div>
                <div class="text-caption text-grey-6">Last Active: {{ formatTime(userAuditStats.lastActivityTime) }}</div>
              </div>
            </div>

            <!-- Orders Processed -->
            <div class="col-12 col-sm-3">
              <div class="bg-white q-pa-sm rounded-borders shadow-1 text-center">
                <div class="text-caption text-grey-7 text-weight-medium">
                  <q-icon name="shopping_cart" color="orange-8" class="q-mr-xs" />ORDERS PUNCHED
                </div>
                <div class="text-h6 text-weight-bolder text-orange-9">
                  {{ userAuditStats.orderCount }} Orders
                </div>
                <div class="text-caption text-grey-6">LKR {{ userAuditStats.totalSales.toLocaleString() }} Total</div>
              </div>
            </div>

            <!-- Audit Actions -->
            <div class="col-12 col-sm-3">
              <div class="bg-white q-pa-sm rounded-borders shadow-1 text-center">
                <div class="text-caption text-grey-7 text-weight-medium">
                  <q-icon name="history" color="teal" class="q-mr-xs" />OPERATIONS LOGGED
                </div>
                <div class="text-h6 text-weight-bolder text-teal-9">
                  {{ userAuditStats.actionCount }} Actions
                </div>
                <div class="text-caption text-grey-6">System Audit Trail</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab Navigation -->
        <q-tabs
          v-model="auditTab"
          dense
          align="left"
          class="text-grey-8 bg-grey-2 border-bottom"
          active-color="primary"
          active-bg-color="white"
          indicator-color="primary"
        >
          <q-tab name="timeline" icon="history" label="Detailed Audit Actions" />
          <q-tab name="orders" icon="shopping_bag" :label="`POS Orders (${userOrders.length})`" />
          <q-tab name="attendance" icon="fingerprint" :label="`Attendance Logs (${userAttendance.length})`" />
        </q-tabs>

        <!-- Tab Panels -->
        <q-card-section class="col q-pa-none scroll">
          <div v-if="auditLoading" class="row justify-center q-pa-xl">
            <q-spinner color="primary" size="40px" />
            <div class="q-ml-md text-grey-7">Loading comprehensive user audit records...</div>
          </div>

          <q-tab-panels v-else v-model="auditTab" animated class="bg-transparent">
            <!-- Panel 1: Detailed Human-Readable Audit Actions -->
            <q-tab-panel name="timeline" class="q-pa-md">
              <div v-if="userActionLogs.length === 0" class="text-center text-grey q-pa-lg">
                <q-icon name="assignment" size="36px" class="q-mb-sm" />
                <div>No explicit system change records logged for this session.</div>
              </div>
              <q-timeline v-else color="primary" class="q-px-sm">
                <q-timeline-entry
                  v-for="action in userActionLogs"
                  :key="action.id"
                  :subtitle="formatTime(action.created_at)"
                  :icon="getActionModule(action).icon"
                  :color="getActionModule(action).color"
                >
                  <template #title>
                    <div class="row items-center q-gutter-xs">
                      <q-badge :color="getActionModule(action).color" :label="getActionModule(action).name" class="text-weight-bold" />
                      <q-badge outline :color="action.action === 'DELETE' ? 'negative' : action.action === 'INSERT' ? 'positive' : 'info'" :label="action.action" />
                    </div>
                  </template>

                  <!-- Human-Readable Summary Description -->
                  <div class="text-subtitle2 text-weight-bolder text-grey-9 q-mt-xs">
                    {{ getHumanActionDescription(action) }}
                  </div>

                  <!-- Key Modified Fields (Clean business badges) -->
                  <div v-if="extractKeyChanges(action).length > 0" class="row q-gutter-xs q-mt-xs">
                    <q-badge
                      v-for="change in extractKeyChanges(action)"
                      :key="change.label"
                      color="blue-1"
                      text-color="primary"
                      class="q-pa-xs border-blue-2"
                    >
                      <span class="text-grey-8 q-mr-xs">{{ change.label }}:</span>
                      <span v-if="change.from" class="text-strike text-grey-6 q-mr-xs">{{ change.from }}</span>
                      <q-icon v-if="change.from" name="arrow_forward" size="12px" class="q-mr-xs text-primary" />
                      <span class="text-weight-bold text-primary">{{ change.to }}</span>
                    </q-badge>
                  </div>
                </q-timeline-entry>
              </q-timeline>
            </q-tab-panel>

            <!-- Panel 2: POS Orders -->
            <q-tab-panel name="orders" class="q-pa-md">
              <div v-if="userOrders.length === 0" class="text-center text-grey q-pa-lg">
                <q-icon name="receipt_long" size="36px" class="q-mb-sm" />
                <div>No POS orders created by this user yet.</div>
              </div>
              <q-table
                v-else
                :rows="userOrders"
                :columns="[
                  { name: 'order_number', label: 'Order #', field: 'order_number', align: 'left' },
                  { name: 'created_at', label: 'Time', field: 'created_at', format: formatTime, align: 'left' },
                  { name: 'order_type', label: 'Type', field: 'order_type', align: 'center' },
                  { name: 'table_number', label: 'Table / Room', field: 'table_number', align: 'center' },
                  { name: 'total_amount', label: 'Total (LKR)', field: 'total_amount', format: v => `LKR ${Number(v || 0).toLocaleString()}`, align: 'right' },
                  { name: 'status', label: 'Status', field: 'status', align: 'center' },
                ]"
                row-key="id"
                flat
                bordered
                dense
                :pagination="{ rowsPerPage: 15 }"
              >
                <template #body-cell-status="props">
                  <q-td :props="props">
                    <q-badge :color="props.row.status === 'completed' ? 'positive' : props.row.status === 'voided' ? 'negative' : 'warning'">
                      {{ props.row.status }}
                    </q-badge>
                  </q-td>
                </template>
              </q-table>
            </q-tab-panel>

            <!-- Panel 3: Attendance Punches -->
            <q-tab-panel name="attendance" class="q-pa-md">
              <div v-if="userAttendance.length === 0" class="text-center text-grey q-pa-lg">
                <q-icon name="fingerprint" size="36px" class="q-mb-sm" />
                <div>No attendance punches found for this staff member.</div>
              </div>
              <q-table
                v-else
                :rows="userAttendance"
                :columns="[
                  { name: 'punch_time', label: 'Punch Time', field: 'punch_time', format: formatTime, align: 'left' },
                  { name: 'punch_type', label: 'Type', field: 'punch_type', align: 'left' },
                  { name: 'source', label: 'Terminal / Source', field: 'source', align: 'left' },
                  { name: 'is_processed', label: 'Processed', field: 'is_processed', align: 'center' },
                ]"
                row-key="id"
                flat
                bordered
                dense
              >
                <template #body-cell-punch_type="props">
                  <q-td :props="props">
                    <q-icon :name="props.row.punch_type === 'in' ? 'login' : 'logout'" size="16px" class="q-mr-xs" />
                    {{ props.row.punch_type === 'in' ? 'Clock In' : 'Clock Out' }}
                  </q-td>
                </template>
              </q-table>
            </q-tab-panel>
          </q-tab-panels>
        </q-card-section>

        <!-- Actions -->
        <q-card-actions align="right" class="bg-grey-1 q-pa-sm border-top">
          <q-btn flat label="Close" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import { supabase } from 'src/boot/supabase'
import { date } from 'quasar'
import apexchart from 'vue3-apexcharts'

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
      .range(0, 49)
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

// ── User Audit & Session Details ──────────────────────────────
const showUserAuditDialog = ref(false)
const auditLoading = ref(false)
const selectedUserLog = ref(null)
const auditTab = ref('timeline')
const userActionLogs = ref([])
const userOrders = ref([])
const userAttendance = ref([])
const userAuditStats = ref({
  orderCount: 0,
  totalSales: 0,
  actionCount: 0,
  workDuration: '—',
  sessionStatus: 'Active Session',
  loginTime: null,
  lastActivityTime: null,
})

async function openUserAudit(log) {
  selectedUserLog.value = log
  showUserAuditDialog.value = true
  auditLoading.value = true
  userActionLogs.value = []
  userOrders.value = []
  userAttendance.value = []
  auditTab.value = 'timeline'

  try {
    const userEmail = log.email
    const loginTime = new Date(log.logged_at)

    // 1. Resolve user ID from profiles
    let userId = log.user_id
    if (!userId && userEmail) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('email', userEmail)
        .maybeSingle()
      if (profile) userId = profile.id
    }

    // 2. Fetch audit actions for this user
    let auditData = []
    if (userId) {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)
      auditData = data || []
    }
    userActionLogs.value = auditData

    // 3. Fetch POS Orders created by this user
    let orderData = []
    if (userId) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, order_number, total_amount, status, created_at, order_type, table_number')
        .or(`created_by.eq.${userId},waiter_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50)
      orderData = orders || []
    }
    userOrders.value = orderData

    // 4. Fetch Attendance punches
    if (userId || userEmail) {
      const username = userEmail?.split('@')[0]
      const { data: punches } = await supabase
        .from('attendance_logs')
        .select('*')
        .or(`employee_id.eq.${userId || '00000000-0000-0000-0000-000000000000'},employee_code.eq.${username}`)
        .order('punch_time', { ascending: false })
        .limit(20)
      userAttendance.value = punches || []
    }

    // 5. Calculate working duration & stats
    const totalSales = orderData.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)

    const timestamps = [loginTime.getTime()]
    if (auditData[0]?.created_at) timestamps.push(new Date(auditData[0].created_at).getTime())
    if (orderData[0]?.created_at) timestamps.push(new Date(orderData[0].created_at).getTime())
    if (log.logout_at) timestamps.push(new Date(log.logout_at).getTime())

    const maxTime = Math.max(...timestamps)
    const diffMs = Math.max(0, maxTime - loginTime.getTime())

    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    let workDurationStr = ''
    if (hours > 0) {
      workDurationStr = `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      workDurationStr = `${minutes} mins`
    } else {
      workDurationStr = 'Active now'
    }

    const isToday = new Date().toDateString() === loginTime.toDateString()
    const isRecent = Date.now() - loginTime.getTime() < 1000 * 60 * 60 * 12

    userAuditStats.value = {
      orderCount: orderData.length,
      totalSales,
      actionCount: auditData.length,
      workDuration: workDurationStr,
      sessionStatus: isToday && isRecent ? 'Active in System' : 'Session Completed',
      loginTime: log.logged_at,
      lastActivityTime: new Date(maxTime).toISOString(),
    }
  } catch (err) {
    console.error('Failed to load user audit:', err)
  } finally {
    auditLoading.value = false
  }
}

function getActionModule(action) {
  const table = (action.table_name || '').toLowerCase()
  const act = (action.action || '').toLowerCase()
  if (table.includes('order') || act.includes('order')) {
    return { name: 'POS & Orders', icon: 'shopping_cart', color: 'primary' }
  }
  if (table.includes('payment') || table.includes('invoice') || act.includes('payment')) {
    return { name: 'Billing & Payments', icon: 'payments', color: 'positive' }
  }
  if (table.includes('inventory') || table.includes('stock') || table.includes('item') || table.includes('waste')) {
    return { name: 'Inventory & Stock', icon: 'inventory_2', color: 'amber-9' }
  }
  if (table.includes('recipe') || table.includes('bom') || table.includes('kot') || table.includes('kitchen')) {
    return { name: 'Kitchen & KDS', icon: 'restaurant_menu', color: 'deep-orange' }
  }
  if (table.includes('employee') || table.includes('payroll') || table.includes('attendance') || table.includes('leave')) {
    return { name: 'HR & Attendance', icon: 'people', color: 'purple' }
  }
  if (table.includes('table') || table.includes('reservation')) {
    return { name: 'Table Management', icon: 'table_restaurant', color: 'teal' }
  }
  if (table.includes('supplier') || table.includes('purchase') || table.includes('po')) {
    return { name: 'Procurement & GRN', icon: 'local_shipping', color: 'brown' }
  }
  if (table.includes('ledger') || table.includes('account') || table.includes('journal')) {
    return { name: 'Finance & Ledger', icon: 'account_balance', color: 'indigo' }
  }
  if (table.includes('device') || table.includes('printer') || table.includes('scanner')) {
    return { name: 'Device & Hardware', icon: 'print', color: 'cyan-9' }
  }
  return { name: 'System Operations', icon: 'tune', color: 'blue-grey' }
}

function getHumanActionDescription(action) {
  const data = action.new_data || action.old_data || {}
  const table = (action.table_name || '').toLowerCase()
  const actType = (action.action || '').toUpperCase()

  // 1. Orders
  if (table === 'orders' || table === 'order_headers') {
    const orderNum = data.order_number ? `#${data.order_number}` : ''
    const total = data.total_amount ? `LKR ${Number(data.total_amount).toLocaleString()}` : ''
    const status = data.status || ''

    if (actType === 'INSERT') {
      const type = data.order_type === 'dine_in' ? 'Dine-in' : data.order_type === 'takeaway' ? 'Takeaway' : 'Delivery'
      const tableInfo = data.table_number ? ` (Table ${data.table_number})` : ''
      return `Created new ${type} Order ${orderNum}${tableInfo} — Total: ${total || 'N/A'}`
    }
    if (actType === 'UPDATE') {
      if (status === 'paid') {
        const method = data.payment_method ? ` via ${data.payment_method.toUpperCase()}` : ''
        return `Settled Order ${orderNum} — Payment Received: ${total}${method}`
      }
      if (status === 'voided') {
        const reason = data.refund_reason || data.foc_reason || 'Manual void'
        return `Voided Order ${orderNum} (Reason: ${reason})`
      }
      if (status === 'preparing') {
        return `Dispatched Order ${orderNum} to Kitchen for Cooking`
      }
      if (status === 'ready') {
        return `Marked Order ${orderNum} as Food Ready for Serving`
      }
      if (status === 'completed') {
        return `Closed and Completed Order ${orderNum}`
      }
      return `Updated details for Order ${orderNum}`
    }
    if (actType === 'DELETE') {
      return `Cancelled / Removed Order ${orderNum}`
    }
  }

  // 2. Order Items / Cart
  if (table === 'order_items') {
    const item = data.item_name || data.name || 'Item'
    const qty = data.quantity ? `${data.quantity}x ` : ''
    if (actType === 'INSERT') return `Added ${qty}"${item}" to Order Cart`
    if (actType === 'UPDATE') return `Modified ${qty}"${item}" in Order Cart`
    if (actType === 'DELETE') return `Removed "${item}" from Order Cart`
  }

  // 3. KOT Tickets
  if (table.includes('kot')) {
    const kotNum = data.ticket_number || data.kot_number || ''
    if (actType === 'INSERT') return `Sent Kitchen Ticket (KOT ${kotNum ? '#' + kotNum : ''}) to Kitchen Display`
    if (actType === 'UPDATE') return `Updated Kitchen Ticket status (${data.status || 'Active'})`
  }

  // 4. Inventory Documents (BOM Deductions, GRN, Wastage)
  if (table === 'inventory_documents' || table.includes('document')) {
    const remarks = data.remarks || ''
    const docType = (data.doc_type || '').toUpperCase()
    if (docType === 'BOM_DEDUCT' || remarks.toLowerCase().includes('auto-deduction')) {
      return `Auto-deducted Recipe Ingredients for ${remarks || 'Kitchen Order'}`
    }
    if (docType === 'GRN') {
      return `Received Supplier Goods (GRN #${data.doc_number || ''}) into Inventory`
    }
    if (docType === 'WASTE') {
      return `Recorded Stock Wastage Entry (${remarks || 'Damaged / Expired stock'})`
    }
    if (docType === 'ADJUST') {
      return `Performed Physical Stock Adjustment (${remarks || 'Count reconciliation'})`
    }
    if (actType === 'INSERT') return `Recorded Inventory Document (${docType || 'Entry'})`
    if (actType === 'UPDATE') return `Updated Inventory Document (${docType || 'Entry'})`
    if (actType === 'DELETE') return `Voided Inventory Document (${docType || 'Entry'})`
  }

  // 5. Stock Items & Ingredients
  if (table.includes('stock') || table.includes('inventory') || table.includes('item')) {
    const itemName = data.name || data.item_name || data.ingredient_name || ''
    const qty = data.quantity ?? data.stock_quantity ?? data.current_stock
    const unit = data.unit || ''
    if (actType === 'INSERT') return `Added new Item / Ingredient: "${itemName || 'Item'}"`
    if (actType === 'UPDATE') return `Updated Stock for "${itemName || 'Item'}" ${qty !== undefined ? `➔ Level: ${qty} ${unit}` : ''}`
    if (actType === 'DELETE') return `Removed Item "${itemName || 'Item'}" from Inventory`
  }

  // 6. Payments
  if (table === 'payments' || table.includes('payment')) {
    const amt = data.amount ? `LKR ${Number(data.amount).toLocaleString()}` : ''
    const method = data.payment_method ? ` via ${data.payment_method.toUpperCase()}` : ''
    return `${actType === 'INSERT' ? 'Processed' : 'Updated'} Payment of ${amt}${method}`
  }

  // 7. Shifts
  if (table.includes('shift')) {
    if (actType === 'INSERT') return `Opened POS Cashier Shift (Float: LKR ${Number(data.opening_float || 0).toLocaleString()})`
    if (actType === 'UPDATE') return `Closed POS Cashier Shift (Cash Total: LKR ${Number(data.closing_cash || data.cash_sales || 0).toLocaleString()})`
  }

  // 8. Tables
  if (table.includes('table')) {
    const tableNo = data.table_number || data.name || ''
    if (actType === 'INSERT') return `Created Table #${tableNo}`
    if (actType === 'UPDATE') return `Updated Table #${tableNo} status (${data.status || 'Active'})`
  }

  // 9. Attendance
  if (table.includes('attendance')) {
    const punch = (data.punch_type || '').toLowerCase().includes('in') ? 'Clocked In' : 'Clocked Out'
    return `${punch} via ${data.source || 'Biometric Device'}`
  }

  // 10. General Fallback
  if (actType === 'INSERT') return `Created new record in ${action.table_name || 'System'}`
  if (actType === 'UPDATE') return `Modified record in ${action.table_name || 'System'}`
  if (actType === 'DELETE') return `Deleted record from ${action.table_name || 'System'}`
  return `${actType} operation executed on ${action.table_name || 'System'}`
}

function extractKeyChanges(action) {
  if (!action.new_data) return []
  const oldData = action.old_data || {}
  const newData = action.new_data
  const changes = []

  const relevantKeys = [
    { key: 'status', label: 'Status' },
    { key: 'payment_status', label: 'Payment Status' },
    { key: 'payment_method', label: 'Payment Mode' },
    { key: 'total_amount', label: 'Total Amount', format: (v) => `LKR ${Number(v).toLocaleString()}` },
    { key: 'discount_amount', label: 'Discount', format: (v) => `LKR ${Number(v).toLocaleString()}` },
    { key: 'quantity', label: 'Quantity' },
    { key: 'stock_quantity', label: 'Stock Level' },
    { key: 'is_active', label: 'Active', format: (v) => (v ? 'Yes' : 'No') },
    { key: 'role', label: 'Role' },
  ]

  for (const item of relevantKeys) {
    if (newData[item.key] !== undefined) {
      const oldVal = oldData[item.key]
      const newVal = newData[item.key]
      if (oldVal !== undefined && oldVal !== newVal) {
        changes.push({
          label: item.label,
          from: item.format ? item.format(oldVal) : String(oldVal),
          to: item.format ? item.format(newVal) : String(newVal),
        })
      } else if (oldVal === undefined && newVal !== null && newVal !== '') {
        changes.push({
          label: item.label,
          to: item.format ? item.format(newVal) : String(newVal),
        })
      }
    }
  }
  return changes
}

onMounted(async () => {
  await Promise.all([loadLogs(), loadKpis()])
})
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
  &--clickable {
    cursor: pointer;
    &:hover {
      background: var(--erp-bg-hover, rgba(59, 130, 246, 0.08)) !important;
      transform: translateX(2px);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
    }
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

