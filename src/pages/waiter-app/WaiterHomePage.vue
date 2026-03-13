<template>
  <q-page class="waiter-home">
    <!-- Pull-to-refresh -->
    <q-pull-to-refresh @refresh="onRefresh" color="orange">

      <!-- ── Hero: Waiter Identity ─────────────────────────────────────── -->
      <div class="hero-section q-px-md q-pt-lg q-pb-md">
        <div class="row items-center q-gutter-md">
          <q-avatar size="56px" class="hero-avatar text-weight-bold text-white">
            {{ initials(store.profile?.display_name || 'W') }}
          </q-avatar>
          <div class="col">
            <div class="text-h6 text-white text-weight-bold">
              {{ store.profile?.display_name || 'Waiter' }}
            </div>
            <div class="row items-center q-gutter-xs q-mt-xs">
              <q-chip dense color="cyan-9" text-color="white" icon="badge" class="text-caption">
                {{ store.profile?.waiter_code || '—' }}
              </q-chip>
              <q-chip
                v-if="isAdminOrManager"
                dense color="purple-9" text-color="white" icon="admin_panel_settings" class="text-caption"
              >
                Admin View
              </q-chip>
              <q-chip
                v-else
                dense
                :color="store.isOnShift ? 'green-9' : 'red-9'"
                text-color="white"
                :icon="store.isOnShift ? 'verified' : 'cancel'"
                class="text-caption"
              >
                {{ store.isOnShift ? 'On Shift' : 'Off Shift' }}
              </q-chip>
            </div>
          </div>
        </div>

        <!-- Manager row -->
        <div v-if="store.managerInfo" class="manager-row q-mt-md">
          <q-icon name="supervisor_account" size="14px" color="purple-4" class="q-mr-xs" />
          <span class="text-caption text-grey-4">Manager: </span>
          <span class="text-caption text-white text-weight-bold q-ml-xs">
            {{ store.managerInfo.manager_employee?.full_name }}
          </span>
          <q-badge class="q-ml-sm" color="purple-9" :label="formatHType(store.managerInfo.hierarchy_type)" />
        </div>

        <!-- Shift detail row -->
        <div v-if="store.shiftInfo" class="shift-row q-mt-sm">
          <q-icon name="schedule" size="13px" color="grey-5" class="q-mr-xs" />
          <span class="text-caption text-grey-5">
            {{ store.shiftInfo.shift_name }}
            ({{ store.shiftInfo.shift_start?.slice(0, 5) }} – {{ store.shiftInfo.shift_end?.slice(0, 5) }})
          </span>
        </div>
      </div>

      <!-- ── KPI Cards ─────────────────────────────────────────────────── -->
      <div class="q-px-md">
        <div class="row q-col-gutter-sm q-mb-sm">
          <!-- Inbox -->
          <div class="col-6">
            <button class="kpi-card kpi-card--orange" @click="$router.push('/waiter-app/inbox')">
              <div class="kpi-icon-wrap">
                <q-icon name="move_to_inbox" size="26px" />
                <q-badge v-if="effectivePendingCount > 0" color="red" floating rounded>
                  {{ effectivePendingCount }}
                </q-badge>
              </div>
              <div class="kpi-value">{{ effectivePendingCount }}</div>
              <div class="kpi-label">New Orders</div>
            </button>
          </div>
          <!-- My Orders -->
          <div class="col-6">
            <button class="kpi-card kpi-card--blue" @click="$router.push('/waiter-app/orders')">
              <div class="kpi-icon-wrap">
                <q-icon name="assignment_ind" size="26px" />
              </div>
              <div class="kpi-value">{{ effectiveMyOrderCount }}</div>
              <div class="kpi-label">My Orders</div>
            </button>
          </div>
          <!-- Ready Alerts -->
          <div class="col-6">
            <button class="kpi-card" :class="store.readyCount > 0 ? 'kpi-card--red kpi-card--pulse' : 'kpi-card--grey'" @click="$router.push('/waiter-app/alerts')">
              <div class="kpi-icon-wrap">
                <q-icon name="notifications_active" size="26px" />
              </div>
              <div class="kpi-value">{{ store.readyCount }}</div>
              <div class="kpi-label">Ready Alerts</div>
            </button>
          </div>
          <!-- Points -->
          <div class="col-6">
            <button class="kpi-card kpi-card--amber" @click="$router.push('/waiter-app/profile')">
              <div class="kpi-icon-wrap">
                <q-icon name="stars" size="26px" />
              </div>
              <div class="kpi-value">{{ store.currentPoints }}</div>
              <div class="kpi-label">My Points</div>
            </button>
          </div>
        </div>
      </div>

      <!-- ── Quick Actions ─────────────────────────────────────────────── -->
      <div class="q-px-md q-mt-sm">
        <div class="section-title">Quick Actions</div>
        <div class="row q-col-gutter-sm">
          <div class="col-6">
            <q-btn
              unelevated class="action-btn full-width" color="orange-9"
              icon="move_to_inbox" label="View Inbox"
              to="/waiter-app/inbox" no-caps
            />
          </div>
          <div class="col-6">
            <q-btn
              unelevated class="action-btn full-width" color="blue-9"
              icon="assignment_ind" label="My Orders"
              to="/waiter-app/orders" no-caps
            />
          </div>
        </div>
      </div>

      <!-- ── Recent Orders Quick View ──────────────────────────────────── -->
      <div class="q-px-md q-mt-lg">
        <div class="section-title">Recent Orders</div>
        <div v-if="store.myOrders.length === 0" class="empty-hint">
          <q-icon name="receipt_long" size="32px" class="q-mb-sm text-grey-7" />
          <div>No active orders</div>
        </div>
        <div v-else>
          <div
            v-for="order in store.myOrders.slice(0, 4)"
            :key="order.id"
            class="order-row"
            @click="$router.push('/waiter-app/orders')"
          >
            <div class="row items-center">
              <div class="col">
                <div class="text-white text-weight-bold">#{{ order.order_number }}</div>
                <div class="text-caption text-grey-5">
                  Table {{ order.table_number || '—' }} · {{ fmtTime(order.created_at) }}
                </div>
              </div>
              <q-chip dense :color="statusColor(order.status)" text-color="white" class="text-caption">
                {{ statusLabel(order.status) }}
              </q-chip>
            </div>
          </div>
        </div>
      </div>

      <div style="height: 24px" />
    </q-pull-to-refresh>
  </q-page>
</template>

<script setup>
import { inject, computed } from 'vue'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import { useRouter } from 'vue-router'

const store = useWaiterAppStore()
const orderStore = useWaiterOrderStore()
const $router = useRouter()

// Injected from WaiterAppLayout — true for admin/manager regardless of shift
const isAdminOrManager = inject('isAdminOrManager', { value: false })

// Use whichever store has more data — waiterOrderStore uses shift-aware RPCs
const effectivePendingCount = computed(() => {
  return Math.max(store.pendingCount, orderStore.pendingCount)
})
const effectiveMyOrderCount = computed(() => {
  return Math.max(store.myOrderCount, orderStore.myOrderCount)
})

function initials(name) {
  if (!name) return '?'
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

function formatHType(type) {
  const m = { waiter_manager: 'W.Mgr', floor_manager: 'F.Mgr', shift_lead: 'Lead', general: 'GM' }
  return m[type] || type
}

function fmtTime(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
}

function statusColor(s) {
  return { accepted: 'blue-8', sent_to_kitchen: 'orange-8', ready: 'green-8', served: 'grey-7' }[s] || 'grey-7'
}
function statusLabel(s) {
  return { accepted: 'Accepted', sent_to_kitchen: 'In Kitchen', ready: '🔔 Ready', served: 'Served' }[s] || s
}

async function onRefresh(done) {
  await store.refresh()
  done()
}
</script>

<style lang="scss" scoped>
.waiter-home { background: #090c14; }

.hero-section {
  background: linear-gradient(135deg, rgba(249,115,22,0.08), rgba(59,130,246,0.05), transparent);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.hero-avatar {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  font-size: 20px !important;
}
.manager-row, .shift-row { display: flex; align-items: center; }

.kpi-card {
  width: 100%; border: none; border-radius: 12px; padding: 16px 12px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  cursor: pointer; transition: transform 0.12s, opacity 0.12s;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
  color: #9ca3af; -webkit-tap-highlight-color: transparent;
  &:active { transform: scale(0.96); opacity: 0.8; }
  &--orange { color: #f97316; background: rgba(249,115,22,0.08); border-color: rgba(249,115,22,0.2); }
  &--blue   { color: #60a5fa; background: rgba(96,165,250,0.08); border-color: rgba(96,165,250,0.2); }
  &--red    { color: #f87171; background: rgba(248,113,113,0.08); border-color: rgba(248,113,113,0.2); }
  &--amber  { color: #fbbf24; background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.2); }
  &--grey   { color: #6b7280; }
  &--pulse  { animation: kpi-pulse 1.5s ease-in-out infinite; }
}
@keyframes kpi-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(248,113,113,0.3); } 50% { box-shadow: 0 0 0 8px rgba(248,113,113,0); } }

.kpi-icon-wrap { position: relative; display: flex; align-items: center; justify-content: center; height: 32px; }
.kpi-value { font-size: 1.8rem; font-weight: 800; line-height: 1; }
.kpi-label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.85; }

.section-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #4b5563; margin-bottom: 10px; }
.action-btn { height: 46px; border-radius: 10px !important; font-weight: 600; font-size: 13px; }

.empty-hint { text-align: center; padding: 24px 0; color: #4b5563; font-size: 0.85rem; display: flex; flex-direction: column; align-items: center; }

.order-row {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
  border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; cursor: pointer;
  transition: background 0.12s;
  &:active { background: rgba(255,255,255,0.06); }
}
</style>
