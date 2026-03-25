<template>
  <div class="waiter-leaderboard">
    <!-- Header + Period Toggle -->
    <div class="row items-center q-mb-md">
      <q-icon name="emoji_events" size="18px" color="amber" class="q-mr-sm" />
      <div class="lb-title">RANKINGS</div>
      <q-space />
      <q-btn-toggle
        v-model="period"
        toggle-color="amber-9"
        no-caps
        dense
        flat
        text-color="grey-5"
        class="lb-period-toggle"
        :options="[
          { label: 'Today', value: 'daily' },
          { label: 'Week', value: 'weekly' },
          { label: 'Month', value: 'monthly' },
        ]"
      />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="column items-center q-pa-lg">
      <q-spinner-orbit size="28px" color="amber" />
      <div class="text-grey-6 text-caption q-mt-sm">Loading rankings...</div>
    </div>

    <!-- Empty -->
    <div
      v-else-if="rankedWaiters.length === 0"
      class="text-grey-6 text-caption text-center q-pa-lg"
    >
      No waiter data for this period.
    </div>

    <!-- Ranking List -->
    <div v-else>
      <div
        v-for="(w, idx) in rankedWaiters"
        :key="w.id"
        class="rank-card q-mb-sm"
        :class="{
          'rank-card--gold': idx === 0 && w.period_points > 0,
          'rank-card--silver': idx === 1 && w.period_points > 0,
          'rank-card--bronze': idx === 2 && w.period_points > 0,
          'rank-card--me': highlightProfileId && w.id === highlightProfileId,
        }"
      >
        <div class="row items-center q-pa-sm q-px-md">
          <!-- Rank -->
          <div class="rank-badge q-mr-md">
            <span v-if="idx === 0 && w.period_points > 0" class="rank-medal">🥇</span>
            <span v-else-if="idx === 1 && w.period_points > 0" class="rank-medal">🥈</span>
            <span v-else-if="idx === 2 && w.period_points > 0" class="rank-medal">🥉</span>
            <span v-else class="rank-num">#{{ idx + 1 }}</span>
          </div>

          <!-- Avatar -->
          <q-avatar size="38px" class="rank-avatar q-mr-sm text-weight-bold text-white">
            {{ initials(w.display_name || w.employee_name) }}
          </q-avatar>

          <!-- Name & Code -->
          <div class="col">
            <div class="rank-name">
              {{ w.display_name || w.employee_name }}
              <q-badge
                v-if="highlightProfileId && w.id === highlightProfileId"
                color="orange-9"
                label="YOU"
                class="q-ml-xs"
                style="font-size: 0.55rem; padding: 1px 5px"
              />
            </div>
            <div class="text-caption text-grey-6">{{ w.waiter_code }}</div>
          </div>

          <!-- Points -->
          <div class="rank-points-col text-right">
            <div class="rank-points-value">{{ w.period_points }}</div>
            <div class="rank-points-label">pts</div>
          </div>

          <!-- Change indicator -->
          <div
            v-if="w.all_time_points > w.period_points"
            class="rank-total q-ml-sm"
            title="All-time total"
          >
            <span class="text-grey-7 text-caption">/ {{ w.all_time_points }}</span>
          </div>
        </div>

        <!-- Mini progress bar relative to top -->
        <div v-if="rankedWaiters[0]?.period_points > 0" class="rank-progress-wrap q-px-md q-pb-sm">
          <div class="rank-progress-bar">
            <div
              class="rank-progress-fill"
              :style="{
                width: Math.max(2, (w.period_points / rankedWaiters[0].period_points) * 100) + '%',
              }"
              :class="{
                'bg-amber-7': idx === 0,
                'bg-grey-6': idx === 1,
                'bg-deep-orange-7': idx === 2,
                'bg-blue-grey-7': idx > 2,
              }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Period info -->
    <div class="text-caption text-grey-7 text-center q-mt-sm">
      <q-icon name="info_outline" size="11px" class="q-mr-xs" />
      {{ periodDescription }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

const { highlightProfileId } = defineProps({
  highlightProfileId: { type: String, default: null }, // current waiter's profile id
})

const authStore = useAuthStore()
const period = ref('daily')
const loading = ref(false)
const rankedWaiters = ref([])

function getPeriodStart() {
  const now = new Date()
  if (period.value === 'daily') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  } else if (period.value === 'weekly') {
    const dayOfWeek = now.getDay() // 0 = Sunday
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset).toISOString()
  } else {
    // monthly
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  }
}

const periodDescription = computed(() => {
  const now = new Date()
  if (period.value === 'daily') {
    return `Points earned today (${now.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })})`
  } else if (period.value === 'weekly') {
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset)
    return `Points earned this week (${monday.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en', { month: 'short', day: 'numeric' })})`
  } else {
    return `Points earned this month (${now.toLocaleDateString('en', { month: 'long', year: 'numeric' })})`
  }
})

async function loadRankings() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  loading.value = true
  try {
    const periodStart = getPeriodStart()

    // 1. Get all active waiter profiles
    const { data: profiles } = await supabase
      .from('waiter_profiles')
      .select(
        'id, waiter_code, display_name, current_points, total_orders_served, employee:employee_id(full_name)',
      )
      .eq('branch_id', branchId)
      .eq('is_active', true)

    if (!profiles || profiles.length === 0) {
      rankedWaiters.value = []
      return
    }

    // 2. Get period points from ledger — sum points per waiter within the date range
    const profileIds = profiles.map((p) => p.id)
    const { data: ledgerEntries } = await supabase
      .from('waiter_points_ledger')
      .select('waiter_profile_id, points')
      .in('waiter_profile_id', profileIds)
      .gte('created_at', periodStart)

    // 3. Aggregate points per waiter
    const periodPointsMap = {}
    ;(ledgerEntries || []).forEach((entry) => {
      if (!periodPointsMap[entry.waiter_profile_id]) periodPointsMap[entry.waiter_profile_id] = 0
      periodPointsMap[entry.waiter_profile_id] += entry.points || 0
    })

    // 4. Build ranked list
    const ranked = profiles.map((p) => ({
      id: p.id,
      waiter_code: p.waiter_code,
      display_name: p.display_name,
      employee_name: p.employee?.full_name,
      all_time_points: p.current_points || 0,
      period_points: periodPointsMap[p.id] || 0,
    }))

    // 5. Sort by period points descending, then by all-time points as tiebreaker
    ranked.sort((a, b) => {
      if (b.period_points !== a.period_points) return b.period_points - a.period_points
      return b.all_time_points - a.all_time_points
    })

    rankedWaiters.value = ranked
  } catch (e) {
    console.error('[Leaderboard] Error:', e)
  } finally {
    loading.value = false
  }
}

function initials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

watch(period, () => loadRankings())
onMounted(() => loadRankings())

defineExpose({ refresh: loadRankings })
</script>

<style lang="scss" scoped>
.waiter-leaderboard {
  padding: 4px 0;
}

.lb-title {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #d97706;
}

.lb-period-toggle {
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 8px;
  padding: 1px;
  :deep(.q-btn) {
    font-size: 0.68rem;
    font-weight: 600;
    border-radius: 6px !important;
    min-height: 28px;
    padding: 0 10px;
  }
}

.rank-card {
  background: #fff;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 12px;
  transition: all 0.15s ease;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

  &--gold {
    background: #fffbeb;
    border-color: #fde68a;
    box-shadow: 0 0 12px rgba(251, 191, 36, 0.12);
  }
  &--silver {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
  &--bronze {
    background: #fff7ed;
    border-color: #fed7aa;
  }
  &--me {
    border-color: #fb923c !important;
    background: #fff7ed !important;
  }
}

.rank-badge {
  min-width: 32px;
  text-align: center;
}
.rank-medal {
  font-size: 1.3rem;
  line-height: 1;
}
.rank-num {
  font-size: 0.8rem;
  font-weight: 700;
  color: #94a3b8;
}

.rank-avatar {
  background: linear-gradient(135deg, #f97316, #a855f7) !important;
  font-size: 13px !important;
  flex-shrink: 0;
}

.rank-name {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--erp-text-primary, #1e293b);
}

.rank-points-col {
  min-width: 48px;
}
.rank-points-value {
  font-size: 1.15rem;
  font-weight: 800;
  color: #d97706;
  line-height: 1;
}
.rank-points-label {
  font-size: 0.6rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
}

.rank-progress-wrap {
  margin-top: -2px;
}
.rank-progress-bar {
  height: 3px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 2px;
  overflow: hidden;
}
.rank-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
}
</style>
