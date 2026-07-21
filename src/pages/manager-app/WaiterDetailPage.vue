<template>
  <q-page class="mgr-waiter-detail" :class="{ lt: !$q.dark.isActive }" padding>
    <!-- Back -->
    <q-btn
      flat
      dense
      no-caps
      icon="arrow_back"
      label="Back"
      class="back-btn q-mb-md"
      @click="$router.back()"
    />

    <div v-if="pageLoading" class="column items-center q-pa-xl">
      <q-spinner-orbit size="36px" color="cyan" />
      <div class="empty-state__text q-mt-sm">Loading waiter...</div>
    </div>

    <div v-else-if="!waiter" class="empty-state q-pa-xl">
      <q-icon name="person_off" size="40px" class="empty-state__icon" />
      <div class="empty-state__text">Waiter not found</div>
    </div>

    <template v-else>
      <!-- Profile Header -->
      <div class="profile-header q-mb-lg">
        <q-avatar size="56px" class="profile-avatar text-weight-bold text-white">
          {{ initials(waiter.display_name || waiter.employee_name) }}
        </q-avatar>
        <div class="q-ml-md col">
          <div class="profile-name">
            {{ waiter.display_name || waiter.employee_name }}
          </div>
          <div class="profile-code">
            {{ waiter.waiter_code }} · {{ waiter.employee_code }}
          </div>
        </div>
        <q-btn round flat icon="mail" class="msg-btn" @click="msgOpen = true">
          <q-tooltip>Send Message</q-tooltip>
        </q-btn>
      </div>

      <!-- Stats -->
      <div class="row q-col-gutter-sm q-mb-lg">
        <div class="col-4">
          <div class="mini-kpi">
            <span class="mini-val mini-val--cyan">{{ waiter.active_orders }}</span>
            <span class="mini-lbl">Active</span>
          </div>
        </div>
        <div class="col-4">
          <div class="mini-kpi">
            <span class="mini-val mini-val--green">{{ waiter.served_count }}</span>
            <span class="mini-lbl">Served</span>
          </div>
        </div>
        <div class="col-4">
          <div class="mini-kpi">
            <span class="mini-val mini-val--amber">{{ waiter.current_points }}</span>
            <span class="mini-lbl">Points</span>
          </div>
        </div>
      </div>

      <!-- Points Ledger -->
      <div class="section-title q-mb-sm">RECENT POINTS</div>
      <div v-if="ledger.length === 0" class="empty-state q-pa-md">
        <div class="empty-state__text">No points history</div>
      </div>
      <div v-else class="ledger-card">
        <div v-for="entry in ledger" :key="entry.id" class="ledger-row row items-center">
          <div
            class="ledger-icon"
            :class="entry.points >= 0 ? 'ledger-icon--positive' : 'ledger-icon--negative'"
          >
            <q-icon
              :name="ptIcon(entry.point_type)"
              size="14px"
            />
          </div>
          <div class="col q-ml-sm">
            <span class="ledger-type">{{ ptLabel(entry.point_type) }}</span>
            <span v-if="entry.note" class="ledger-note q-ml-sm"
              >— {{ entry.note }}</span
            >
          </div>
          <span
            :class="entry.points >= 0 ? 'ledger-points--positive' : 'ledger-points--negative'"
            class="ledger-points"
          >
            {{ entry.points >= 0 ? '+' : '' }}{{ entry.points }}
          </span>
        </div>
      </div>
    </template>

    <!-- Message Dialog -->
    <q-dialog v-model="msgOpen" position="bottom">
      <q-card class="msg-dialog-card">
        <q-bar class="msg-bar">
          <q-icon name="mail" /> <span class="q-ml-sm text-weight-bold">Message {{ waiter?.display_name }}</span>
          <q-space /> <q-btn flat dense icon="close" v-close-popup />
        </q-bar>
        <q-card-section>
          <q-input v-model="msgSubject" dark filled dense label="Subject" class="q-mb-md" />
          <q-input
            v-model="msgBody"
            dark
            filled
            label="Message"
            type="textarea"
            rows="3"
            class="q-mb-md"
          />
          <q-btn-toggle
            v-model="msgPriority"
            toggle-color="cyan"
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
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup no-caps />
          <q-btn
            unelevated
            label="Send"
            color="cyan-8"
            icon="send"
            :loading="sending"
            :disable="!msgBody.trim()"
            @click="send"
            no-caps
            style="border-radius: 8px; font-weight: 700"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import { supabase } from 'src/boot/supabase'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/auth'

const route = useRoute()
const store = useManagerAppStore()
const authStore = useAuthStore()
const $q = useQuasar()

const waiterId = computed(() => route?.params?.id || null)
const fetchedWaiter = ref(null)
const pageLoading = ref(true)

// Try the in-memory store first, fallback to DB-fetched data
const waiter = computed(() => {
  if (!waiterId.value) return null
  const fromStore = store.onShiftWaiters.find((w) => w.id === waiterId.value)
  if (fromStore) return fromStore
  return fetchedWaiter.value
})
const ledger = ref([])

const msgOpen = ref(false)
const msgSubject = ref('')
const msgBody = ref('')
const msgPriority = ref('normal')
const sending = ref(false)

async function loadWaiterFromDB(id) {
  const { data: wp } = await supabase
    .from('waiter_profiles')
    .select(`
      id, waiter_code, display_name, current_points, total_orders_served,
      employee:employee_id ( id, full_name, employee_code, profile_id )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!wp) return null

  // Count active orders for this waiter
  const branchId = authStore.currentBranch?.id
  let activeOrders = 0
  if (wp.employee?.profile_id && branchId) {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_waiter_id', wp.employee.profile_id)
      .eq('branch_id', branchId)
      .in('status', ['accepted', 'preparing', 'ready'])
    activeOrders = count || 0
  }

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
    active_orders: activeOrders,
    unread_alerts: 0,
  }
}

onMounted(async () => {
  if (!waiterId.value) { pageLoading.value = false; return }

  // If waiter not in store, fetch from DB
  if (!store.onShiftWaiters.find((w) => w.id === waiterId.value)) {
    fetchedWaiter.value = await loadWaiterFromDB(waiterId.value)
  }
  pageLoading.value = false

  // Load points ledger
  const { data } = await supabase
    .from('waiter_points_ledger')
    .select('id, point_type, points, note, created_at')
    .eq('waiter_profile_id', waiterId.value)
    .order('created_at', { ascending: false })
    .limit(20)
  ledger.value = data || []
})

async function send() {
  if (!waiter.value?.employee_id || !msgBody.value.trim()) return
  sending.value = true
  try {
    await store.sendMessage(
      waiter.value.employee_id,
      msgSubject.value,
      msgBody.value,
      msgPriority.value,
    )
    $q.notify({
      type: 'positive',
      message: `✅ Message sent to ${waiter.value.display_name}`,
      position: 'top',
    })
    msgOpen.value = false
    msgSubject.value = ''
    msgBody.value = ''
    msgPriority.value = 'normal'
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  } finally {
    sending.value = false
  }
}

function initials(name) {
  return name
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('')
    : '?'
}
function ptIcon(type) {
  return (
    {
      served_order: 'restaurant',
      bonus: 'card_giftcard',
      adjustment: 'tune',
      penalty: 'warning',
      tip_received: 'payments',
      customer_rating: 'star',
    }[type] || 'stars'
  )
}
function ptLabel(type) {
  return (
    {
      served_order: 'Served',
      bonus: 'Bonus',
      adjustment: 'Adjust',
      penalty: 'Penalty',
      tip_received: 'Tip',
      customer_rating: 'Rating',
    }[type] || type
  )
}
</script>

<style lang="scss" scoped>
.mgr-waiter-detail {
  // min-height and padding handled by mobile-app-shell
  background: #090c14;
}
.mgr-waiter-detail.lt {
  background: #f1f5f9;
}

// ─── Back Button ─────────────────────────────────────────────────────────────
.back-btn {
  font-size: 0.92rem !important;
  font-weight: 600 !important;
  color: #9ca3af !important;
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 24px !important;
}
.lt .back-btn {
  color: #64748b !important;
  background: rgba(0, 0, 0, 0.03) !important;
  border: 1px solid #e5e7eb !important;
}

// ─── Section Title ───────────────────────────────────────────────────────────
.section-title {
  font-size: 0.80rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #4b5563;
}
.lt .section-title {
  color: #94a3b8;
}

// ─── Empty State ─────────────────────────────────────────────────────────────
.empty-state {
  text-align: center;
}
.empty-state__icon {
  color: #374151;
  margin-bottom: 8px;
}
.lt .empty-state__icon {
  color: #cbd5e1;
}
.empty-state__text {
  font-size: 0.88rem;
  color: #6b7280;
}

// ─── Profile Header ─────────────────────────────────────────────────────────
.profile-header {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #0c0f1d 0%, #0d1424 60%, #0f0d20 100%);
  border: 1px solid rgba(34, 211, 238, 0.1);
  border-radius: 20px;
  padding: 20px 16px;
  margin-bottom: 4px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04);

  &::before {
    content: '';
    position: absolute;
    top: -50px;
    right: -30px;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(34, 211, 238, 0.08) 0%, transparent 70%);
    pointer-events: none;
  }
}
.lt .profile-header {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);

  &::before { display: none; }
}
.profile-avatar {
  width: 80px !important;
  height: 80px !important;
  min-width: 80px !important;
  font-size: 24px !important;
  background: linear-gradient(135deg, #22d3ee, #6366f1, #0d9488) !important;
  box-shadow:
    0 0 0 2px rgba(34, 211, 238, 0.3),
    0 0 0 5px rgba(34, 211, 238, 0.1),
    0 0 0 8px rgba(34, 211, 238, 0.03),
    0 8px 24px rgba(34, 211, 238, 0.4) !important;
}
.profile-name {
  font-size: 1.4rem;
  font-weight: 800;
  color: #f3f4f6;
}
.lt .profile-name { color: #1e293b; }
.profile-code {
  font-size: 0.82rem;
  color: #6b7280;
}
.lt .profile-code { color: #94a3b8; }
.msg-btn {
  color: #22d3ee !important;
  background: rgba(34, 211, 238, 0.08) !important;
  border-radius: 10px !important;
  transition: background 0.2s, box-shadow 0.2s;

  &:hover {
    background: rgba(34, 211, 238, 0.14) !important;
    box-shadow: 0 0 10px rgba(34, 211, 238, 0.15);
  }
}

// ─── Mini KPI ────────────────────────────────────────────────────────────────
.mini-kpi {
  border-radius: 12px;
  padding: 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    border-radius: 2px 2px 0 0;
  }
  &:nth-child(1)::before { background: linear-gradient(90deg, #22d3ee, #0d9488); }
  &:nth-child(2)::before { background: linear-gradient(90deg, #10b981, #059669); }
  &:nth-child(3)::before { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
}
.lt .mini-kpi {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.mini-val {
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1;
}
.mini-val--cyan { color: #22d3ee; filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.4)); }
.mini-val--green { color: #34d399; filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.4)); }
.mini-val--amber { color: #fbbf24; filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.4)); }
.lt .mini-val--cyan { color: #0891b2; filter: none; }
.lt .mini-val--green { color: #059669; filter: none; }
.lt .mini-val--amber { color: #d97706; filter: none; }
.mini-lbl {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
}

// ─── Ledger ──────────────────────────────────────────────────────────────────
.ledger-card {
  border-radius: 12px;
  overflow: hidden;
}
.ledger-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.lt .ledger-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
}
.ledger-row {
  padding: 10px 12px;
}
.ledger-row {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.lt .ledger-row {
  border-bottom: 1px solid #f1f5f9;
}
.ledger-row:last-child {
  border-bottom: none;
}
.ledger-icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ledger-icon--positive {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}
.ledger-icon--negative {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
.ledger-type {
  font-size: 0.88rem;
  font-weight: 600;
  color: #f3f4f6;
}
.lt .ledger-type {
  color: #1e293b;
}
.ledger-note {
  font-size: 0.82rem;
  color: #6b7280;
}
.lt .ledger-note {
  color: #94a3b8;
}
.ledger-points {
  font-size: 0.88rem;
  font-weight: 800;
}
.ledger-points--positive {
  color: #10b981;
}
.ledger-points--negative {
  color: #ef4444;
}

// ─── Message Dialog ──────────────────────────────────────────────────────────
.msg-dialog-card {
  width: 100%;
  max-width: 480px;
  background: #0d1220 !important;
  color: #fff !important;
  border-radius: 16px 16px 0 0 !important;
  border-top: 1px solid rgba(34, 211, 238, 0.12) !important;
}
.msg-bar {
  background: linear-gradient(135deg, #060e1e, #0d1a30);
  border-bottom: 1px solid rgba(34, 211, 238, 0.1);
}
</style>
