<template>
  <div class="waiter-profile-tab q-pa-lg">
    <!-- Loading -->
    <div v-if="loading" class="column items-center q-pa-xl">
      <q-spinner-orbit size="48px" color="primary" />
      <div class="text-body2 text-grey-5 q-mt-md">Loading profile...</div>
    </div>

    <!-- Not set up yet -->
    <div v-else-if="!profile" class="column items-center q-pa-xl text-center">
      <q-icon name="person_off" size="56px" class="text-grey-7 q-mb-md" />
      <div class="text-h6 text-grey-5">Waiter Profile Not Set Up</div>
      <div class="text-caption text-grey-7 q-mt-xs">
        Contact your manager or admin to create your waiter profile.
      </div>
    </div>

    <template v-else>
      <!-- ── Profile Card ── -->
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-md-5">
          <div class="profile-card">
            <div class="profile-card__avatar-row">
              <q-avatar size="72px" class="profile-avatar text-weight-bold">
                {{ initials(profile.display_name || employeeName) }}
              </q-avatar>
              <div>
                <div class="text-h6 text-white text-weight-bold">
                  {{ profile.display_name || employeeName }}
                </div>
                <div class="row items-center q-gutter-x-sm q-mt-xs">
                  <q-chip dense color="cyan-9" text-color="white" icon="badge" class="text-weight-bold">
                    {{ profile.waiter_code }}
                  </q-chip>
                  <q-chip
                    dense
                    :color="profile.is_active ? 'green-9' : 'red-9'"
                    text-color="white"
                    :icon="profile.is_active ? 'check_circle' : 'cancel'"
                  >
                    {{ profile.is_active ? 'Active' : 'Inactive' }}
                  </q-chip>
                </div>
              </div>
            </div>

            <q-separator dark class="q-my-md" />

            <!-- Stats row -->
            <div class="row q-col-gutter-sm text-center">
              <div class="col-4">
                <div class="stat-value text-amber">{{ profile.current_points }}</div>
                <div class="stat-label">Points</div>
              </div>
              <div class="col-4">
                <div class="stat-value text-blue-4">{{ profile.total_orders_served }}</div>
                <div class="stat-label">Orders Served</div>
              </div>
              <div class="col-4">
                <div class="stat-value text-green-4">
                  {{ profile.rating_avg ? Number(profile.rating_avg).toFixed(1) : '—' }}
                  <q-icon v-if="profile.rating_avg" name="star" size="14px" class="text-amber" />
                </div>
                <div class="stat-label">Avg Rating</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Manager / Hierarchy Card ── -->
        <div class="col-12 col-md-7">
          <div class="profile-card">
            <div class="text-overline text-grey-5 q-mb-md letter-sp">MY MANAGER</div>
            <div v-if="manager" class="row items-center q-gutter-md">
              <q-avatar size="52px" class="mgr-avatar text-weight-bold">
                {{ initials(manager.manager_employee?.full_name) }}
              </q-avatar>
              <div>
                <div class="text-weight-bold text-white">{{ manager.manager_employee?.full_name }}</div>
                <div class="text-caption text-grey-5">{{ manager.manager_employee?.employee_code }}</div>
                <q-chip dense color="purple-9" text-color="white" icon="supervisor_account" class="q-mt-xs">
                  {{ formatHierarchyType(manager.hierarchy_type) }}
                </q-chip>
              </div>
            </div>
            <div v-else class="text-grey-6 text-caption">
              <q-icon name="info" class="q-mr-xs" />No manager assigned yet.
            </div>

            <q-separator dark class="q-my-md" />

            <!-- Unread notifications preview -->
            <div class="text-overline text-grey-5 q-mb-sm letter-sp">RECENT NOTIFICATIONS</div>
            <div v-if="notifications.length === 0" class="text-grey-6 text-caption">
              <q-icon name="notifications_none" class="q-mr-xs" />All caught up!
            </div>
            <div v-for="notif in notifications.slice(0, 3)" :key="notif.id" class="notif-row">
              <q-icon
                :name="notifIcon(notif.notification_type)"
                :color="notifColor(notif.notification_type)"
                size="18px"
                class="q-mr-sm"
              />
              <div class="col">
                <div class="text-white text-body2">{{ notif.title }}</div>
                <div class="text-grey-5 text-caption">{{ notif.body }}</div>
              </div>
              <q-badge v-if="!notif.is_read" color="red" rounded class="q-ml-sm" />
            </div>
          </div>
        </div>
      </div>

      <!-- ── Points Ledger ── -->
      <div class="profile-card q-mb-lg">
        <div class="row items-center q-mb-md">
          <div class="text-overline text-grey-5 letter-sp">POINTS HISTORY</div>
          <q-space />
          <q-badge color="amber-9" text-color="dark" class="text-weight-bold q-px-sm">
            Total: {{ profile.current_points }} pts
          </q-badge>
        </div>
        <div v-if="ledger.length === 0" class="text-grey-6 text-caption text-center q-pa-md">
          No points earned yet. Start serving orders!
        </div>
        <q-list v-else dark separator>
          <q-item v-for="entry in ledger" :key="entry.id" dense class="q-px-none">
            <q-item-section avatar>
              <q-icon
                :name="pointsIcon(entry.point_type)"
                :color="entry.points >= 0 ? 'positive' : 'negative'"
                size="20px"
              />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-white text-body2">
                {{ formatPointType(entry.point_type) }}
              </q-item-label>
              <q-item-label caption class="text-grey-5">{{ entry.note || '—' }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <span :class="entry.points >= 0 ? 'text-positive' : 'text-negative'" class="text-weight-bold">
                {{ entry.points >= 0 ? '+' : '' }}{{ entry.points }} pts
              </span>
              <div class="text-grey-7 text-caption">{{ formatDate(entry.created_at) }}</div>
            </q-item-section>
          </q-item>
        </q-list>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'

const loading = ref(true)
const profile = ref(null)
const manager = ref(null)
const ledger = ref([])
const notifications = ref([])
const employeeName = ref('')

onMounted(async () => {
  await loadProfile()
})

async function loadProfile() {
  loading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 1. Load waiter_profile (linked by user_id)
    const { data: wp, error: wpErr } = await supabase
      .from('waiter_profiles')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (wpErr || !wp) {
      // Try to get employee name anyway for the "not set up" state
      const { data: emp } = await supabase
        .from('employees')
        .select('full_name')
        .eq('profile_id', user.id)
        .single()
      employeeName.value = emp?.full_name || user.email
      profile.value = null
      return
    }

    profile.value = wp

    // 2. Get employee row for display name fallback
    const { data: emp } = await supabase
      .from('employees')
      .select('full_name, employee_code')
      .eq('id', wp.employee_id)
      .single()
    employeeName.value = emp?.full_name || ''

    // 3. Load manager hierarchy
    const { data: hier } = await supabase
      .from('employee_hierarchy_assignments')
      .select(`
        hierarchy_type,
        manager_employee:manager_employee_id ( full_name, employee_code )
      `)
      .eq('employee_id', wp.employee_id)
      .eq('is_active', true)
      .limit(1)
      .single()
    manager.value = hier || null

    // 4. Load recent points ledger (latest 20)
    const { data: pts } = await supabase
      .from('waiter_points_ledger')
      .select('*')
      .eq('waiter_profile_id', wp.id)
      .order('created_at', { ascending: false })
      .limit(20)
    ledger.value = pts || []

    // 5. Load unread notifications (latest 10)
    const { data: notifs } = await supabase
      .from('waiter_notifications')
      .select('*')
      .eq('waiter_profile_id', wp.id)
      .order('created_at', { ascending: false })
      .limit(10)
    notifications.value = notifs || []
  } catch (e) {
    console.error('[WaiterProfile] Load error:', e)
  } finally {
    loading.value = false
  }
}

function initials(name) {
  if (!name) return '?'
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
}

function formatHierarchyType(type) {
  const map = {
    waiter_manager: 'Waiter Manager',
    kitchen_manager: 'Kitchen Manager',
    bar_manager: 'Bar Manager',
    floor_manager: 'Floor Manager',
    shift_lead: 'Shift Lead',
    general: 'General Manager',
  }
  return map[type] || type
}

function formatPointType(type) {
  const map = {
    served_order: '✅ Order Served',
    bonus: '🎁 Bonus',
    adjustment: '⚙️ Adjustment',
    penalty: '⚠️ Penalty',
    tip_received: '💰 Tip Received',
    customer_rating: '⭐ Customer Rating',
  }
  return map[type] || type
}

function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function pointsIcon(type) {
  const map = { served_order: 'restaurant', bonus: 'card_giftcard', adjustment: 'tune', penalty: 'warning', tip_received: 'payments', customer_rating: 'star' }
  return map[type] || 'stars'
}

function notifIcon(type) {
  const map = { info: 'info', order_assigned: 'assignment', message_received: 'mail', points_earned: 'stars', schedule_change: 'event', urgent: 'priority_high', performance_review: 'assessment', shift_reminder: 'alarm' }
  return map[type] || 'notifications'
}

function notifColor(type) {
  const map = { urgent: 'red', message_received: 'blue', points_earned: 'amber', order_assigned: 'green' }
  return map[type] || 'grey-5'
}
</script>

<style lang="scss" scoped>
.waiter-profile-tab {
  max-width: 900px;
}

.profile-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 20px;
}

.profile-card__avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.profile-avatar {
  background: linear-gradient(135deg, #06b6d4, #3b82f6) !important;
  color: #fff !important;
  font-size: 22px !important;
}

.mgr-avatar {
  background: linear-gradient(135deg, #7c3aed, #a855f7) !important;
  color: #fff !important;
  font-size: 16px !important;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
}

.stat-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
  margin-top: 2px;
}

.letter-sp {
  letter-spacing: 2px;
  font-size: 0.65rem;
  font-weight: 700;
}

.notif-row {
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);

  &:last-child {
    border-bottom: none;
  }
}
</style>
