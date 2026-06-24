<template>
  <q-page class="q-pa-md loyalty-admin-page">
    <!-- Header -->
    <PageHeader
      title="Loyalty Program"
      subtitle="Manage customer loyalty coins, tiers, and rewards"
      show-back
      back-route="/admin"
    >
      <template #actions>
        <q-input
          v-model="searchQuery"
          id="loyalty-search-input"
          dense
          outlined
          placeholder="Search name, email, phone, card..."
          class="loyalty-search"
          debounce="400"
          @update:model-value="fetchCustomers"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
          <template #append>
            <q-icon v-if="searchQuery" name="close" class="cursor-pointer" @click="clearSearch" />
          </template>
        </q-input>
      </template>
    </PageHeader>

    <!-- Stats Cards -->
    <div class="stats-grid q-mb-lg">
      <div class="stat-card">
        <div class="stat-icon bg-blue-1">
          <q-icon name="group" color="blue-8" size="22px" />
        </div>
        <div>
          <q-skeleton v-if="statsLoading" type="text" width="60px" />
          <div v-else class="stat-value text-blue-8">{{ totalMembersDB.toLocaleString() }}</div>
          <div class="stat-label">Total Members</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon bg-amber-1">
          <q-icon name="toll" color="amber-8" size="22px" />
        </div>
        <div>
          <q-skeleton v-if="statsLoading" type="text" width="80px" />
          <div v-else class="stat-value text-amber-8">{{ totalCoinsIssuedDB.toLocaleString() }}</div>
          <div class="stat-label">Total Coins Issued</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon bg-green-1">
          <q-icon name="trending_up" color="green-8" size="22px" />
        </div>
        <div>
          <q-skeleton v-if="statsLoading" type="text" width="40px" />
          <div v-else class="stat-value text-green-8">{{ goldCountDB.toLocaleString() }}</div>
          <div class="stat-label">Gold Members</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon bg-grey-2">
          <q-icon name="workspace_premium" color="grey-7" size="22px" />
        </div>
        <div>
          <q-skeleton v-if="statsLoading" type="text" width="40px" />
          <div v-else class="stat-value text-grey-8">{{ silverCountDB.toLocaleString() }}</div>
          <div class="stat-label">Silver Members</div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="row q-col-gutter-sm q-mb-md items-center">
      <div class="col-12 col-sm-auto">
        <q-btn-toggle
          v-model="tierFilter"
          no-caps
          unelevated
          dense
          :options="tierOptions"
          color="primary"
          text-color="grey-7"
          toggle-color="primary"
          class="tier-filter-toggle"
          @update:model-value="fetchCustomers"
        />
      </div>
      <q-space />
      <div class="col-auto text-grey-6 text-caption">{{ totalCount }} members found</div>
    </div>

    <!-- Customers Table -->
    <q-card flat bordered class="loyalty-table-card">
      <q-table
        :rows="customers"
        :columns="columns"
        row-key="id"
        :loading="loading"
        flat
        :pagination="{ rowsPerPage: 20 }"
        hide-pagination
        class="loyalty-table"
        @row-click="(_, row) => viewCustomer(row)"
      >
        <!-- Customer column -->
        <template #body-cell-full_name="props">
          <q-td :props="props">
            <div class="row no-wrap items-center">
              <div
                class="customer-avatar"
                :style="{ background: getAvatarGradient(props.row.full_name) }"
              >
                {{ (props.row.full_name || '?').charAt(0).toUpperCase() }}
              </div>
              <div class="q-ml-sm">
                <div class="text-weight-bold text-body2">{{ props.row.full_name || '—' }}</div>
                <div class="text-caption text-grey-6">
                  {{ props.row.email || props.row.phone || '—' }}
                </div>
              </div>
            </div>
          </q-td>
        </template>

        <!-- Card number -->
        <template #body-cell-card_number="props">
          <q-td :props="props">
            <div v-if="props.row.card_number" class="font-mono text-caption">
              <q-icon name="credit_card" size="12px" color="grey-5" class="q-mr-xs" />
              {{ props.row.card_number }}
            </div>
            <span v-else class="text-grey-5">—</span>
          </q-td>
        </template>

        <!-- Tier column -->
        <template #body-cell-tier_code="props">
          <q-td :props="props">
            <q-chip
              dense
              :style="{
                background: props.row.badge_color + '22',
                color: props.row.badge_color,
                border: `1px solid ${props.row.badge_color}44`,
              }"
              size="sm"
            >
              {{ tierEmoji(props.row.tier_code) }} {{ props.row.tier_name || props.row.tier_code }}
            </q-chip>
          </q-td>
        </template>

        <!-- Coins column -->
        <template #body-cell-current_coins="props">
          <q-td :props="props">
            <div class="row items-center no-wrap" style="gap: 4px">
              <q-icon name="toll" color="amber" size="14px" />
              <span class="text-weight-bold">{{
                (props.row.current_coins || 0).toLocaleString()
              }}</span>
            </div>
            <div class="text-caption text-grey-6">
              Earned: {{ (props.row.total_earned_coins || 0).toLocaleString() }}
            </div>
          </q-td>
        </template>

        <!-- Total Spent -->
        <template #body-cell-total_spent="props">
          <q-td :props="props">
            <div class="text-body2 text-weight-bold">
              LKR {{ Number(props.row.total_spent || 0).toLocaleString('en-LK') }}
            </div>
            <div class="text-caption text-grey-6">
              {{
                props.row.last_rewarded_at
                  ? 'Last: ' + formatDate(props.row.last_rewarded_at)
                  : 'Never rewarded'
              }}
            </div>
          </q-td>
        </template>

        <!-- Actions -->
        <template #body-cell-actions="props">
          <q-td :props="props" class="action-cell" @click.stop>
            <q-btn
              flat
              round
              icon="visibility"
              color="primary"
              size="sm"
              @click="viewCustomer(props.row)"
            >
              <q-tooltip>View Details</q-tooltip>
            </q-btn>
            <q-btn flat round icon="tune" color="orange" size="sm" @click="openAdjust(props.row)">
              <q-tooltip>Adjust Coins</q-tooltip>
            </q-btn>
          </q-td>
        </template>

        <!-- Empty state -->
        <template #no-data>
          <div class="column items-center q-pa-xl text-grey-6">
            <q-icon name="card_membership" size="64px" class="q-mb-md" />
            <div class="text-h6 text-weight-bold">No loyalty members found</div>
            <div class="text-caption">
              {{
                searchQuery
                  ? 'Try adjusting your search.'
                  : 'No customers have loyalty accounts yet.'
              }}
            </div>
          </div>
        </template>
      </q-table>

      <!-- Pagination -->
      <div v-if="totalCount > pageSize" class="row justify-center q-pa-md">
        <q-pagination
          v-model="currentPage"
          :max="Math.ceil(totalCount / pageSize)"
          direction-links
          @update:model-value="fetchCustomers"
          color="primary"
        />
      </div>
    </q-card>

    <!-- ── Adjust Coins Dialog ────────────────────────────────────────── -->
    <q-dialog v-model="adjustDialog" persistent>
      <q-card style="min-width: 380px; border-radius: 16px">
        <q-card-section class="row items-center q-pb-none">
          <div>
            <div class="text-h6 text-weight-bold">Adjust Coins</div>
            <div class="text-caption text-grey-6">{{ adjustTarget?.full_name }}</div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section>
          <!-- Current balance -->
          <div class="adjust-balance-display q-mb-md">
            <q-icon name="toll" color="amber" size="18px" />
            <span class="text-h6 text-weight-bold q-ml-xs"
              >{{ adjustTarget?.current_coins || 0 }} coins</span
            >
            <span class="text-caption text-grey-6 q-ml-sm">current balance</span>
          </div>

          <div class="q-mb-md">
            <div class="text-caption text-weight-medium text-grey-7 q-mb-xs">Adjustment Type</div>
            <q-btn-toggle
              v-model="adjustType"
              no-caps
              :options="[
                { label: '+ Add Coins', value: 'add' },
                { label: '− Remove Coins', value: 'remove' },
              ]"
              toggle-color="primary"
              color="grey-3"
              text-color="grey-8"
              unelevated
              class="full-width adjust-type-toggle"
            />
          </div>

          <q-input
            v-model.number="adjustCoins"
            type="number"
            label="Number of Coins *"
            outlined
            dense
            min="1"
            class="q-mb-md"
            :rules="[(v) => v > 0 || 'Enter a positive number']"
          />

          <q-input
            v-model="adjustNote"
            label="Reason / Note *"
            outlined
            dense
            type="textarea"
            rows="2"
            class="q-mb-sm"
            :rules="[(v) => !!v?.trim() || 'Reason is required']"
          />

          <div class="text-caption text-grey-6">
            Preview: <strong>{{ adjustPreviewBalance }}</strong> coins after adjustment
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps label="Cancel" v-close-popup />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Apply Adjustment"
            :loading="adjustLoading"
            :disable="!adjustNote?.trim() || !adjustCoins"
            @click="applyAdjustment"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar, date } from 'quasar'
import PageHeader from 'components/common/PageHeader.vue'
import {
  adminGetLoyaltyCustomers,
  adminAdjustLoyaltyCoins,
  adminGetLoyaltyStats,
} from 'src/services/loyaltyService'

const router = useRouter()
const $q = useQuasar()

const customers = ref([])
const loading = ref(false)
const searchQuery = ref('')
const tierFilter = ref(null)
const totalCount = ref(0)
const currentPage = ref(1)
const pageSize = 20

// ── DB-aggregated stats ───────────────────────────────────────────────────────
const statsLoading = ref(false)
const totalMembersDB = ref(0)
const totalCoinsIssuedDB = ref(0)
const goldCountDB = ref(0)
const silverCountDB = ref(0)

// Adjust dialog
const adjustDialog = ref(false)
const adjustTarget = ref(null)
const adjustType = ref('add')
const adjustCoins = ref(0)
const adjustNote = ref('')
const adjustLoading = ref(false)

const adjustPreviewBalance = computed(() => {
  const current = adjustTarget.value?.current_coins || 0
  const delta = adjustType.value === 'add' ? adjustCoins.value : -adjustCoins.value
  return Math.max(0, current + delta)
})

// ── Fetch DB-aggregated stats ─────────────────────────────────────────────────
async function fetchStats() {
  statsLoading.value = true
  try {
    const result = await adminGetLoyaltyStats()
    if (result.success && result.stats) {
      totalMembersDB.value = result.stats.totalMembers
      totalCoinsIssuedDB.value = result.stats.totalCoinsIssued
      goldCountDB.value = result.stats.goldMembers
      silverCountDB.value = result.stats.silverMembers
    }
  } catch {
    // silently fail — stats are non-critical
  } finally {
    statsLoading.value = false
  }
}

// ── Table columns ─────────────────────────────────────────────────────────────
const columns = [
  {
    name: 'full_name',
    label: 'Member',
    align: 'left',
    field: 'full_name',
    sortable: true,
    style: 'min-width: 200px',
  },
  {
    name: 'card_number',
    label: 'Card No.',
    align: 'left',
    field: 'card_number',
    style: 'min-width: 130px',
  },
  {
    name: 'tier_code',
    label: 'Tier',
    align: 'center',
    field: 'tier_code',
    style: 'min-width: 100px',
  },
  {
    name: 'current_coins',
    label: 'Coins',
    align: 'left',
    field: 'current_coins',
    sortable: true,
    style: 'min-width: 120px',
  },
  {
    name: 'total_spent',
    label: 'Total Spent',
    align: 'left',
    field: 'total_spent',
    sortable: true,
    style: 'min-width: 140px',
  },
  { name: 'actions', label: '', align: 'center', field: 'actions', style: 'width: 80px' },
]

const tierOptions = [
  { label: 'All', value: null },
  { label: '⭐ Standard', value: 'STANDARD' },
  { label: '🥈 Silver', value: 'SILVER' },
  { label: '🥇 Gold', value: 'GOLD' },
]

// ── Fetch ────────────────────────────────────────────────────────────────────

function clearSearch() {
  searchQuery.value = ''
  fetchCustomers()
}

async function fetchCustomers() {
  loading.value = true
  try {
    const result = await adminGetLoyaltyCustomers({
      search: searchQuery.value || undefined,
      tier_code: tierFilter.value || undefined,
      limit: pageSize,
      offset: (currentPage.value - 1) * pageSize,
    })

    if (!result.success) {
      $q.notify({ type: 'negative', message: result.error || 'Failed to load' })
      return
    }

    customers.value = result.data || []
    totalCount.value = result.total || 0
  } catch {
    $q.notify({ type: 'negative', message: 'Failed to load loyalty data' })
  } finally {
    loading.value = false
  }
}

function viewCustomer(row) {
  router.push(`/admin/loyalty/${row.id}`)
}

function openAdjust(row) {
  adjustTarget.value = row
  adjustType.value = 'add'
  adjustCoins.value = 0
  adjustNote.value = ''
  adjustDialog.value = true
}

async function applyAdjustment() {
  if (!adjustNote.value?.trim() || !adjustCoins.value) return
  adjustLoading.value = true
  try {
    const delta = adjustType.value === 'add' ? adjustCoins.value : -adjustCoins.value
    const result = await adminAdjustLoyaltyCoins(adjustTarget.value.id, delta, adjustNote.value)

    if (!result.success) {
      $q.notify({ type: 'negative', message: result.error || 'Adjustment failed' })
      return
    }

    $q.notify({
      type: 'positive',
      message: `Coins adjusted. New balance: ${result.new_coins} coins`,
      icon: 'toll',
    })

    adjustDialog.value = false
    // Update in-list
    const idx = customers.value.findIndex((c) => c.id === adjustTarget.value.id)
    if (idx !== -1) customers.value[idx].current_coins = result.new_coins
  } catch {
    $q.notify({ type: 'negative', message: 'Adjustment failed' })
  } finally {
    adjustLoading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(val) {
  if (!val) return '—'
  return date.formatDate(val, 'DD MMM YYYY')
}

function tierEmoji(code) {
  return { STANDARD: '⭐', SILVER: '🥈', GOLD: '🥇' }[code] || '⭐'
}

function getAvatarGradient(name) {
  const colors = [
    'linear-gradient(135deg, #f97316, #ef4444)',
    'linear-gradient(135deg, #3b82f6, #6366f1)',
    'linear-gradient(135deg, #10b981, #06b6d4)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    'linear-gradient(135deg, #f59e0b, #f97316)',
  ]
  const idx = (name?.charCodeAt(0) || 0) % colors.length
  return colors[idx]
}

onMounted(() => {
  fetchCustomers()
  fetchStats()
})
</script>

<style lang="scss" scoped>
.loyalty-admin-page {
  max-width: 1400px;
  margin: 0 auto;
}

.loyalty-search {
  min-width: 280px;
  :deep(.q-field__control) {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #e5e7eb;
  }
  :deep(.q-field__native) {
    color: #e5e7eb;
  }
  :deep(.q-field__native::placeholder) {
    color: #6b7280;
  }
}

// Stats grid
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.stat-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition:
    background 0.2s,
    border-color 0.2s;
  &:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
  }
}
.stat-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  // Override Quasar bg-* light classes with dark-theme versions
  &.bg-blue-1 {
    background: rgba(59, 130, 246, 0.12) !important;
  }
  &.bg-amber-1 {
    background: rgba(245, 158, 11, 0.12) !important;
  }
  &.bg-green-1 {
    background: rgba(16, 185, 129, 0.12) !important;
  }
  &.bg-grey-2 {
    background: rgba(148, 163, 184, 0.12) !important;
  }
}
.stat-value {
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1;
}
.stat-label {
  font-size: 0.72rem;
  color: #6b7280;
  margin-top: 3px;
  font-weight: 500;
}

.tier-filter-toggle {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  overflow: hidden;
  :deep(.q-btn) {
    color: #9ca3af !important;
    &.q-btn--active {
      color: white !important;
    }
  }
}

.loyalty-table-card {
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.loyalty-table {
  background: transparent !important;
  :deep(.q-table__top) {
    display: none;
  }
  :deep(thead tr th) {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6b7280;
    background: rgba(255, 255, 255, 0.03);
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
  }
  :deep(tbody tr) {
    cursor: pointer;
    &:hover {
      background: rgba(59, 130, 246, 0.06) !important;
    }
  }
  :deep(tbody tr td) {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    color: #d1d5db;
  }
  :deep(.q-table__bottom) {
    color: #6b7280;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
}

.customer-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 800;
  color: white;
  flex-shrink: 0;
}

.font-mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.5px;
  color: #9ca3af;
}

.action-cell {
  width: 80px;
}

// Adjust dialog — keep dark card style
.adjust-balance-display {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: 10px;
}

.adjust-type-toggle {
  :deep(.q-btn) {
    flex: 1;
    border-radius: 8px !important;
  }
}
</style>
