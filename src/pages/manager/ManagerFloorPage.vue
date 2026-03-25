<template>
  <q-page class="manager-floor-page" padding>
    <!-- Header -->
    <div class="row items-center q-mb-lg">
      <q-icon name="supervisor_account" size="28px" color="orange" class="q-mr-sm" />
      <div>
        <div class="text-h6 text-white text-weight-bold">Floor Dashboard</div>
        <div class="text-caption text-grey-5">{{ currentBranch }} · {{ today }}</div>
      </div>
      <q-space />
      <q-btn flat round icon="refresh" color="grey-5" :loading="loading" @click="refreshAll" />
    </div>

    <!-- KPI Top Row -->
    <div class="row q-col-gutter-sm q-mb-lg">
      <div class="col-6 col-md-3">
        <div class="kpi-card kpi--blue">
          <div class="kpi-val">{{ onShiftWaiters.length }}</div>
          <div class="kpi-lbl">On-Shift Waiters</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card kpi--orange">
          <div class="kpi-val">{{ unacceptedOrders.length }}</div>
          <div class="kpi-lbl">Waiting Orders</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card kpi--green">
          <div class="kpi-val">{{ totalActiveOrders }}</div>
          <div class="kpi-lbl">Active Orders</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card kpi--purple">
          <div class="kpi-val">{{ totalServedToday }}</div>
          <div class="kpi-lbl">Served Today</div>
        </div>
      </div>
    </div>

    <!-- Unaccepted Orders Alert -->
    <div v-if="unacceptedOrders.length > 0" class="alert-banner q-mb-lg">
      <q-icon name="warning" size="18px" class="q-mr-sm" />
      <span class="text-weight-bold">{{ unacceptedOrders.length }} unaccepted order(s)</span>
      <q-space />
      <q-btn
        flat
        dense
        no-caps
        color="amber"
        label="View"
        @click="showUnaccepted = !showUnaccepted"
      />
    </div>
    <q-slide-transition>
      <div v-if="showUnaccepted" class="q-mb-lg">
        <div
          v-for="order in unacceptedOrders"
          :key="order.id"
          class="order-mini-card q-mb-sm row items-center"
        >
          <q-icon name="receipt_long" color="amber" size="16px" class="q-mr-sm" />
          <span class="text-white text-weight-bold">#{{ order.order_number }}</span>
          <span class="text-grey-5 q-ml-sm">Table {{ order.table_number || '—' }}</span>
          <q-space />
          <span class="text-grey-6 text-caption">{{ fmtTime(order.created_at) }}</span>
        </div>
      </div>
    </q-slide-transition>

    <!-- Waiter Performance List -->
    <div class="section-title q-mb-sm">ON-SHIFT WAITERS</div>
    <div v-if="loading" class="column items-center q-pa-lg">
      <q-spinner-orbit size="32px" color="orange" />
    </div>
    <div
      v-else-if="onShiftWaiters.length === 0"
      class="text-grey-6 text-center q-pa-lg text-caption"
    >
      No waiters on shift right now.
    </div>
    <div v-else>
      <div v-for="w in onShiftWaiters" :key="w.id" class="waiter-card q-mb-md">
        <div class="row items-center q-pa-md">
          <q-avatar size="42px" class="waiter-avatar q-mr-md text-weight-bold text-white">
            {{ initials(w.display_name || w.employee_name) }}
          </q-avatar>
          <div class="col">
            <div class="text-white text-weight-bold">{{ w.display_name || w.employee_name }}</div>
            <div class="text-caption text-grey-5">
              {{ w.waiter_code }} · {{ w.hierarchy_type_label || 'Waiter' }}
            </div>
          </div>
          <q-space />
          <!-- Actions -->
          <q-btn round flat icon="mail" color="blue-4" size="sm" @click="openMessageDrawer(w)">
            <q-tooltip>Send Message</q-tooltip>
          </q-btn>
        </div>

        <!-- Stats Row -->
        <div class="waiter-card__stats row q-px-md q-pb-md q-gutter-sm">
          <div class="stat-pill">
            <q-icon name="assignment_ind" size="12px" class="q-mr-xs" />
            {{ w.active_orders }} active
          </div>
          <div class="stat-pill">
            <q-icon name="check_circle" size="12px" class="q-mr-xs" />
            {{ w.served_count }} served
          </div>
          <div class="stat-pill">
            <q-icon name="stars" size="12px" class="q-mr-xs" color="amber-5" />
            {{ w.current_points }} pts
          </div>
          <div v-if="w.unread_alerts > 0" class="stat-pill stat-pill--alert">
            <q-icon name="notifications" size="12px" class="q-mr-xs" />
            {{ w.unread_alerts }} unread
          </div>
        </div>
      </div>
    </div>

    <!-- Hierarchy Panel -->
    <div class="section-title q-mt-lg q-mb-sm">HIERARCHY MAP</div>
    <div v-if="hierarchyMap.length === 0" class="text-grey-6 text-caption text-center q-pa-md">
      No hierarchy assignments found.
    </div>
    <div v-else>
      <div v-for="h in hierarchyMap" :key="h.id" class="hierarchy-row q-mb-sm row items-center">
        <q-icon name="person" size="14px" color="cyan-4" class="q-mr-sm" />
        <span class="text-white">{{ h.employee_name }}</span>
        <q-icon name="arrow_right" size="14px" color="grey-6" class="q-mx-xs" />
        <q-icon name="supervisor_account" size="14px" color="purple-4" class="q-mr-xs" />
        <span class="text-grey-4">{{ h.manager_name }}</span>
        <q-badge :color="htColor(h.hierarchy_type)" class="q-ml-sm text-caption">
          {{ htLabel(h.hierarchy_type) }}
        </q-badge>
      </div>
    </div>

    <!-- ─── Points Leaderboard (with period filter) ──────────────────────── -->
    <div class="q-mt-xl">
      <WaiterLeaderboard />
    </div>

    <!-- Message Drawer -->
    <q-dialog v-model="msgDrawerOpen" position="right" full-height>
      <q-card class="msg-drawer">
        <q-bar class="msg-drawer-bar">
          <q-icon name="mail" />
          <div class="q-ml-sm text-weight-bold">
            Message {{ selectedWaiter?.display_name || selectedWaiter?.employee_name }}
          </div>
          <q-space />
          <q-btn flat dense icon="close" v-close-popup />
        </q-bar>
        <q-card-section>
          <q-input v-model="msgSubject" dark filled dense label="Subject" class="q-mb-md" />
          <q-input
            v-model="msgBody"
            dark
            filled
            label="Message"
            type="textarea"
            rows="4"
            class="q-mb-md"
          />
          <div class="row items-center q-mb-md">
            <span class="text-grey-5 text-caption q-mr-md">Priority:</span>
            <q-btn-toggle
              v-model="msgPriority"
              toggle-color="orange"
              :options="[
                { label: 'Normal', value: 'normal' },
                { label: '🚨 Urgent', value: 'urgent' },
              ]"
              no-caps
              dense
              spread
              flat
              text-color="grey-5"
            />
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup no-caps />
          <q-btn
            unelevated
            label="Send Message"
            color="orange-9"
            icon="send"
            :loading="sending"
            @click="sendMessage"
            no-caps
            :disable="!msgBody.trim()"
            style="height: 42px; border-radius: 8px; font-weight: 700"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import { useQuasar } from 'quasar'
import WaiterLeaderboard from 'src/components/waiter/WaiterLeaderboard.vue'

const authStore = useAuthStore()
const $q = useQuasar()

const loading = ref(false)
const showUnaccepted = ref(false)

// Data
const waiterProfiles = ref([])
const unacceptedOrders = ref([])
const hierarchyMap = ref([])
const servedOrdersToday = ref([])

// Realtime
let profilesChannel = null

// Message drawer
const msgDrawerOpen = ref(false)
const selectedWaiter = ref(null)
const msgSubject = ref('')
const msgBody = ref('')
const msgPriority = ref('normal')
const sending = ref(false)

const currentBranch = computed(() => authStore.currentBranch?.name || '—')
const today = computed(() =>
  new Date().toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' }),
)

const onShiftWaiters = computed(() => waiterProfiles.value)
const totalActiveOrders = computed(() =>
  waiterProfiles.value.reduce((s, w) => s + w.active_orders, 0),
)
const totalServedToday = computed(() => servedOrdersToday.value.length)

function initials(name) {
  return name
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('')
    : '?'
}
function fmtTime(dt) {
  return dt ? new Date(dt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : ''
}
function htLabel(t) {
  return (
    { waiter_manager: 'W.Mgr', floor_manager: 'F.Mgr', shift_lead: 'Lead', general: 'GM' }[t] || t
  )
}
function htColor(t) {
  return (
    {
      waiter_manager: 'purple-8',
      floor_manager: 'blue-8',
      shift_lead: 'teal-8',
      general: 'orange-8',
    }[t] || 'grey-8'
  )
}

// ─── Data Loading ───────────────────────────────────────────────────────────
onMounted(() => {
  refreshAll()
  subscribeLeaderboard()
})
onUnmounted(() => {
  if (profilesChannel) supabase.removeChannel(profilesChannel)
})

async function refreshAll() {
  loading.value = true
  try {
    await Promise.all([
      loadWaiters(),
      loadUnacceptedOrders(),
      loadHierarchy(),
      loadServedToday(),
      loadLeaderboard(),
    ])
  } catch (e) {
    console.error('[ManagerFloor]', e)
  } finally {
    loading.value = false
  }
}

async function loadWaiters() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  // Get active waiter profiles in this branch
  const { data: profiles } = await supabase
    .from('waiter_profiles')
    .select(
      `
      id, waiter_code, display_name, current_points, total_orders_served, is_active,
      employee:employee_id ( id, full_name, employee_code, profile_id )
    `,
    )
    .eq('branch_id', branchId)
    .eq('is_active', true)

  if (!profiles) {
    waiterProfiles.value = []
    return
  }

  // Enrich with active orders, unread alerts
  const enriched = await Promise.all(
    profiles.map(async (wp) => {
      // Active orders
      const { count: activeOrders } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_waiter_id', wp.employee?.profile_id)
        .eq('branch_id', branchId)
        .in('status', ['accepted', 'preparing', 'ready'])

      // Unread notifications
      const { count: unreadAlerts } = await supabase
        .from('waiter_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('waiter_profile_id', wp.id)
        .eq('is_read', false)

      return {
        id: wp.id,
        employee_id: wp.employee?.id,
        waiter_code: wp.waiter_code,
        display_name: wp.display_name,
        employee_name: wp.employee?.full_name,
        employee_code: wp.employee?.employee_code,
        profile_id: wp.employee?.profile_id,
        current_points: wp.current_points || 0,
        served_count: wp.total_orders_served || 0,
        active_orders: activeOrders || 0,
        unread_alerts: unreadAlerts || 0,
      }
    }),
  )

  waiterProfiles.value = enriched
}

async function loadUnacceptedOrders() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  const { data } = await supabase
    .from('orders')
    .select('id, order_number, table_number, created_at, status')
    .eq('branch_id', branchId)
    .eq('status', 'pending_waiter')
    .order('created_at', { ascending: true })
  unacceptedOrders.value = data || []
}

async function loadHierarchy() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  const { data } = await supabase
    .from('employee_hierarchy_assignments')
    .select(
      `
      id, hierarchy_type,
      employee:employee_id ( full_name ),
      manager:manager_employee_id ( full_name )
    `,
    )
    .eq('branch_id', branchId)
    .eq('is_active', true)

  hierarchyMap.value = (data || []).map((h) => ({
    id: h.id,
    employee_name: h.employee?.full_name,
    manager_name: h.manager?.full_name,
    hierarchy_type: h.hierarchy_type,
  }))
}

async function loadServedToday() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('orders')
    .select('id')
    .eq('branch_id', branchId)
    .eq('status', 'served')
    .gte('updated_at', todayStart.toISOString())
  servedOrdersToday.value = data || []
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  const { data: profiles } = await supabase
    .from('waiter_profiles')
    .select(
      'id, waiter_code, display_name, current_points, total_orders_served, employee:employee_id(full_name)',
    )
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('current_points', { ascending: false })

  if (!profiles) {
    leaderboard.value = []
    return
  }

  // Enrich with recent ledger entries (last 10 per waiter)
  const enriched = await Promise.all(
    profiles.map(async (wp) => {
      const { data: ledger } = await supabase
        .from('waiter_points_ledger')
        .select('id, point_type, points, note, created_at')
        .eq('waiter_profile_id', wp.id)
        .order('created_at', { ascending: false })
        .limit(10)
      return { ...wp, employee_name: wp.employee?.full_name, ledger: ledger || [] }
    }),
  )

  leaderboard.value = enriched
}

function subscribeLeaderboard() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  profilesChannel = supabase
    .channel('manager-waiter-profiles')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'waiter_profiles',
        filter: `branch_id=eq.${branchId}`,
      },
      () => loadLeaderboard(),
    )
    .subscribe()
}

// ─── Messaging ──────────────────────────────────────────────────────────────
function openMessageDrawer(waiter) {
  selectedWaiter.value = waiter
  msgSubject.value = ''
  msgBody.value = ''
  msgPriority.value = 'normal'
  msgDrawerOpen.value = true
}

async function sendMessage() {
  if (!selectedWaiter.value || !msgBody.value.trim()) return
  sending.value = true
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    // Get sender employee id
    const { data: senderEmp } = await supabase
      .from('employees')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle()

    const { error: msgErr, data: msgData } = await supabase
      .from('manager_messages')
      .insert({
        sender_employee_id: senderEmp?.id || null,
        receiver_employee_id: selectedWaiter.value.employee_id,
        branch_id: authStore.currentBranch?.id,
        subject: msgSubject.value || 'Direct Message',
        message_body: msgBody.value,
        priority: msgPriority.value,
      })
      .select('id')
      .single()

    if (msgErr) throw msgErr

    // Dispatch to waiter notifications so it appears in their app
    if (selectedWaiter.value.id) {
      const { error: notifErr } = await supabase.from('waiter_notifications').insert({
        waiter_profile_id: selectedWaiter.value.id,
        notification_type: 'manager_message',
        title:
          msgPriority.value === 'urgent'
            ? '🚨 URGENT: Message from Manager'
            : 'Message from Manager',
        body: (msgSubject.value ? `📌 ${msgSubject.value}\n` : '') + msgBody.value,
        payload: {
          manager_message_id: msgData?.id,
          priority: msgPriority.value,
          subject: msgSubject.value || 'Direct Message',
        },
        action_url: null,
      })
      if (notifErr) console.error('Failed to notify waiter:', notifErr)
    }

    $q.notify({
      type: 'positive',
      message: `✅ Message sent to ${selectedWaiter.value.display_name || selectedWaiter.value.employee_name}`,
      position: 'top',
    })
    msgDrawerOpen.value = false
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  } finally {
    sending.value = false
  }
}
</script>

<style lang="scss" scoped>
.manager-floor-page {
  background: #090c14;
  min-height: 100vh;
}
.section-title {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #4b5563;
}
.kpi-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}
.kpi-val {
  font-size: 1.7rem;
  font-weight: 800;
  line-height: 1;
}
.kpi-lbl {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
  margin-top: 4px;
}
.kpi--blue .kpi-val {
  color: #60a5fa;
}
.kpi--blue {
  border-color: rgba(96, 165, 250, 0.2);
  background: rgba(96, 165, 250, 0.06);
}
.kpi--orange .kpi-val {
  color: #f97316;
}
.kpi--orange {
  border-color: rgba(249, 115, 22, 0.2);
  background: rgba(249, 115, 22, 0.06);
}
.kpi--green .kpi-val {
  color: #4ade80;
}
.kpi--green {
  border-color: rgba(34, 197, 94, 0.2);
  background: rgba(34, 197, 94, 0.06);
}
.kpi--purple .kpi-val {
  color: #a78bfa;
}
.kpi--purple {
  border-color: rgba(167, 139, 250, 0.2);
  background: rgba(167, 139, 250, 0.06);
}
.alert-banner {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  color: #fbbf24;
}
.order-mini-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px 14px;
}
.waiter-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
}
.waiter-avatar {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  font-size: 14px !important;
}
.waiter-card__stats {
  flex-wrap: wrap;
}
.stat-pill {
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 600;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  padding: 3px 8px;
  &--alert {
    color: #f87171;
    background: rgba(248, 113, 113, 0.08);
  }
}
.hierarchy-row {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.85rem;
}
.msg-drawer {
  width: 380px;
  max-width: 90vw;
  background: #111827 !important;
  color: #fff !important;
}
.msg-drawer-bar {
  background: #1f2937;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
.lb-row {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  overflow: hidden;
  :deep(.q-expansion-item__container) {
    background: transparent !important;
  }
}
.lb-header {
  padding: 12px 14px !important;
  background: transparent !important;
}
.lb-rank {
  min-width: 28px;
  text-align: center;
  font-size: 1.1rem;
  line-height: 1;
}
.lb-avatar {
  background: linear-gradient(135deg, #f97316, #a855f7) !important;
  font-size: 13px !important;
}
.ledger-mini-row {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  &:last-child {
    border-bottom: none;
  }
}
</style>
