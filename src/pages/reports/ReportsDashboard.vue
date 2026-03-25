<template>
  <div class="reports-hub">
    <!-- ── Header ──────────────────────────────────────────────────── -->
    <div class="reports-hub__header">
      <div>
        <div class="reports-hub__breadcrumb">
          <span>REPORTS</span>
          <span class="reports-hub__breadcrumb-sep">/</span>
          <span class="reports-hub__breadcrumb-active">Dashboard</span>
        </div>
        <h1 class="reports-hub__title">Reports Center</h1>
        <p class="reports-hub__subtitle">Enterprise reporting dashboard — access all reports, view today's summary, and export data</p>
      </div>
      <div class="reports-hub__header-actions">
        <div class="reports-hub__date-badge">
          <q-icon name="event" size="14px" />
          <span>{{ todayFormatted }}</span>
        </div>
      </div>
    </div>

    <!-- ── Live KPI Summary ────────────────────────────────────────── -->
    <div class="reports-hub__kpis">
      <div
        v-for="kpi in kpiCards"
        :key="kpi.label"
        class="reports-hub__kpi"
        :class="`reports-hub__kpi--${kpi.color}`"
      >
        <div class="reports-hub__kpi-icon">
          <q-icon :name="kpi.icon" size="20px" />
        </div>
        <div class="reports-hub__kpi-body">
          <div class="reports-hub__kpi-value">{{ kpi.value }}</div>
          <div class="reports-hub__kpi-label">{{ kpi.label }}</div>
        </div>
      </div>
    </div>

    <!-- ── Report Groups Grid ──────────────────────────────────────── -->
    <div class="reports-hub__section-title">
      <q-icon name="folder_open" size="18px" class="q-mr-sm" />
      Report Categories
    </div>

    <div class="reports-hub__groups">
      <div
        v-for="group in REPORT_GROUPS"
        :key="group.id"
        class="reports-hub__group-card"
        @click="navigateToGroup(group)"
      >
        <div class="reports-hub__group-header">
          <div class="reports-hub__group-icon" :style="{ background: group.color + '18', color: group.color }">
            <q-icon :name="group.icon" size="22px" />
          </div>
          <q-badge :label="group.reports.length" class="reports-hub__group-count" />
        </div>
        <div class="reports-hub__group-name">{{ group.label }}</div>
        <div class="reports-hub__group-reports">
          <span v-for="(r, i) in group.reports.slice(0, 3)" :key="r.id">
            {{ r.label }}<template v-if="i < 2 && i < group.reports.length - 1">, </template>
          </span>
          <span v-if="group.reports.length > 3" class="reports-hub__group-more">
            +{{ group.reports.length - 3 }} more
          </span>
        </div>
        <div class="reports-hub__group-arrow">
          <q-icon name="arrow_forward" size="16px" />
        </div>
      </div>
    </div>

    <!-- ── Quick Access ────────────────────────────────────────────── -->
    <div class="reports-hub__section-title q-mt-lg">
      <q-icon name="bolt" size="18px" class="q-mr-sm" />
      Quick Access — Most Used
    </div>

    <div class="reports-hub__quick-access">
      <div
        v-for="report in quickAccessReports"
        :key="report.id"
        class="reports-hub__quick-item"
        @click="$router.push(report.route)"
      >
        <q-icon :name="report.icon" size="18px" :style="{ color: report.groupColor }" />
        <div class="reports-hub__quick-text">
          <div class="reports-hub__quick-label">{{ report.label }}</div>
          <div class="reports-hub__quick-desc">{{ report.description }}</div>
        </div>
        <q-icon name="chevron_right" size="16px" class="reports-hub__quick-arrow" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { REPORT_GROUPS, ALL_REPORTS, fmtLKR, fmtNumber } from 'src/services/reportService'

const router = useRouter()
const authStore = useAuthStore()

const todayFormatted = new Date().toLocaleDateString('en-GB', {
  weekday: 'long',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

// Quick access — top 8 most commonly used reports
const quickAccessReports = ALL_REPORTS.filter((r) =>
  ['sales', 'electronic-journal', 'item-wise-sale', 'sales-statement',
   'payment-summary', 'inventory-ledger', 'stock-on-hand', 'daily-cash'].includes(r.id),
)

// ── Live KPIs ─────────────────────────────────────────────────
const kpiCards = ref([
  { label: "Today's Revenue", value: '—', icon: 'payments', color: 'blue' },
  { label: "Today's Orders", value: '—', icon: 'receipt_long', color: 'green' },
  { label: 'Avg Order Value', value: '—', icon: 'trending_up', color: 'purple' },
  { label: 'Active Reports', value: String(ALL_REPORTS.length), icon: 'analytics', color: 'amber' },
  { label: 'Report Groups', value: String(REPORT_GROUPS.length), icon: 'folder', color: 'teal' },
])

function navigateToGroup(group) {
  // Navigate to first report in the group
  if (group.reports.length > 0) {
    router.push(group.reports[0].route)
  }
}

onMounted(async () => {
  // Fetch today's summary KPIs from orders
  try {
    const today = new Date().toISOString().slice(0, 10)
    let query = supabase
      .from('orders')
      .select('total_amount, status')
      .gte('created_at', today + 'T00:00:00')
      .lte('created_at', today + 'T23:59:59')

    // Branch security
    if (!authStore.isAdmin) {
      const branchId = authStore.currentBranch?.id
      if (branchId) query = query.eq('branch_id', branchId)
    }

    const { data } = await query
    if (data && data.length > 0) {
      const paid = data.filter((b) => b.status !== 'cancelled' && b.status !== 'void')
      const totalRev = paid.reduce((s, b) => s + Number(b.total_amount || 0), 0)
      const totalOrders = paid.length
      kpiCards.value[0].value = fmtLKR(totalRev)
      kpiCards.value[1].value = fmtNumber(totalOrders)
      kpiCards.value[2].value = totalOrders > 0 ? fmtLKR(totalRev / totalOrders) : 'LKR 0'
    } else {
      kpiCards.value[0].value = 'LKR 0'
      kpiCards.value[1].value = '0'
      kpiCards.value[2].value = 'LKR 0'
    }
  } catch (err) {
    console.error('[ReportsDashboard] KPI fetch error:', err)
  }
})
</script>

<style scoped lang="scss">
.reports-hub {
  padding: 24px;
  background: var(--erp-bg-main, #0f172a);
  min-height: 100vh;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  &__breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 11px;
    font-weight: 700;
    color: var(--erp-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  &__breadcrumb-sep { color: var(--erp-text-muted, #475569); }
  &__breadcrumb-active { color: var(--erp-text-secondary, #94a3b8); }

  &__title {
    font-size: 26px;
    font-weight: 800;
    color: var(--erp-text-primary, #f8fafc);
    margin: 0;
    letter-spacing: -0.5px;
  }

  &__subtitle {
    font-size: 13px;
    color: var(--erp-text-muted, #64748b);
    margin: 6px 0 0;
  }

  &__header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__date-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--erp-bg-card, #1e293b);
    border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
    border-radius: 6px;
    font-size: 12px;
    color: var(--erp-text-secondary, #94a3b8);
    white-space: nowrap;
  }

  // ── KPI Cards ─────────────────
  &__kpis {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 28px;
  }

  &__kpi {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    background: var(--erp-bg-card, #1e293b);
    border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
    border-radius: 10px;
    border-left: 3px solid transparent;
    transition: transform 0.15s ease, box-shadow 0.15s ease;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    &--blue { border-left-color: #2563eb; }
    &--green { border-left-color: #16a34a; }
    &--purple { border-left-color: #7c3aed; }
    &--amber { border-left-color: #f59e0b; }
    &--teal { border-left-color: #0d9488; }
    &--red { border-left-color: #dc2626; }
  }

  &__kpi-icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--erp-text-secondary, #94a3b8);
    flex-shrink: 0;
  }

  &__kpi-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--erp-text-primary, #f8fafc);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  &__kpi-label {
    font-size: 11px;
    color: var(--erp-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-top: 3px;
  }

  // ── Section Title ─────────────
  &__section-title {
    display: flex;
    align-items: center;
    font-size: 14px;
    font-weight: 700;
    color: var(--erp-text-primary, #f8fafc);
    margin-bottom: 14px;
    letter-spacing: -0.2px;
  }

  // ── Group Cards ───────────────
  &__groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }

  &__group-card {
    position: relative;
    padding: 18px;
    background: var(--erp-bg-card, #1e293b);
    border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      border-color: rgba(37, 99, 235, 0.3);
      background: rgba(30, 41, 59, 0.9);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
  }

  &__group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  &__group-icon {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__group-count {
    background: rgba(255, 255, 255, 0.06) !important;
    color: var(--erp-text-muted, #64748b) !important;
    font-size: 11px;
    font-weight: 600;
  }

  &__group-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--erp-text-primary, #f8fafc);
    margin-bottom: 6px;
  }

  &__group-reports {
    font-size: 11px;
    color: var(--erp-text-muted, #64748b);
    line-height: 1.5;
  }

  &__group-more {
    color: var(--erp-primary, #2563eb);
    font-weight: 600;
  }

  &__group-arrow {
    position: absolute;
    bottom: 16px;
    right: 16px;
    color: var(--erp-text-muted, #64748b);
    opacity: 0;
    transition: opacity 0.15s ease;

    .reports-hub__group-card:hover & {
      opacity: 1;
    }
  }

  // ── Quick Access ──────────────
  &__quick-access {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 8px;
  }

  &__quick-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--erp-bg-card, #1e293b);
    border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.12s ease;

    &:hover {
      background: rgba(37, 99, 235, 0.06);
      border-color: rgba(37, 99, 235, 0.2);
    }
  }

  &__quick-text {
    flex: 1;
    min-width: 0;
  }

  &__quick-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--erp-text-primary, #f8fafc);
  }

  &__quick-desc {
    font-size: 11px;
    color: var(--erp-text-muted, #64748b);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__quick-arrow {
    color: var(--erp-text-muted, #64748b);
    flex-shrink: 0;
  }
}
</style>
