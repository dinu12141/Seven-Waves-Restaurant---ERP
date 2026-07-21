<template>
  <q-page class="mgr-alerts-page">

    <!-- ── Gradient Header ───────────────────────────────────────── -->
    <div class="alerts-hero">
      <div class="alerts-hero__icon-wrap">
        <q-icon name="notifications_active" size="28px" />
      </div>
      <div class="alerts-hero__text">
        <div class="alerts-hero__title">Alerts</div>
        <div class="alerts-hero__sub">System alerts & notifications</div>
      </div>
      <q-btn
        flat round icon="refresh" size="sm"
        class="alerts-hero__refresh"
        :loading="store.loading"
        @click="store.loadAlerts()"
      />
    </div>

    <!-- ── Filter Tabs ────────────────────────────────────────────── -->
    <div class="q-px-md q-pt-md q-pb-sm">
      <div class="alerts-tabs-wrap">
        <button
          class="alerts-tab"
          :class="{ 'alerts-tab--active': filter === 'active' }"
          @click="filter = 'active'"
        >
          <span>Active</span>
          <span v-if="activeAlerts.length > 0" class="alerts-tab__badge alerts-tab__badge--red">{{ activeAlerts.length }}</span>
        </button>
        <button
          class="alerts-tab"
          :class="{ 'alerts-tab--active': filter === 'resolved' }"
          @click="filter = 'resolved'"
        >
          <span>Resolved</span>
          <span v-if="resolvedAlerts.length > 0" class="alerts-tab__badge alerts-tab__badge--green">{{ resolvedAlerts.length }}</span>
        </button>
      </div>
    </div>

    <!-- ── List ──────────────────────────────────────────────────── -->
    <div class="q-px-md q-pb-xl">

      <!-- Empty state -->
      <div v-if="filtered.length === 0" class="alerts-empty">
        <div class="alerts-empty__circle">
          <q-icon name="notifications_off" size="32px" />
        </div>
        <div class="alerts-empty__title">No {{ filter }} alerts</div>
        <div class="alerts-empty__sub">You're all caught up</div>
      </div>

      <!-- Alert cards -->
      <div
        v-else
        v-for="alert in filtered"
        :key="alert.id"
        class="alert-card q-mb-sm"
        :class="`alert-card--${alert.severity}`"
      >
        <div class="alert-card__row">
          <div class="alert-sev-icon" :class="`alert-sev-icon--${alert.severity}`">
            <q-icon :name="severityIcon(alert.severity)" size="18px" />
          </div>
          <div class="alert-card__info">
            <div class="alert-card__title">{{ alert.title }}</div>
            <div class="alert-card__meta">
              {{ alert.alert_type?.replace(/_/g, ' ') }} · {{ fmtDate(alert.created_at) }}
            </div>
          </div>
          <q-btn
            v-if="!alert.is_resolved"
            unelevated
            dense
            no-caps
            label="Resolve"
            class="alert-resolve-btn"
            size="sm"
            @click.stop="resolve(alert.id)"
          />
          <div v-else class="alert-resolved-badge">
            <q-icon name="check_circle" size="14px" />
            Resolved
          </div>
        </div>
        <div v-if="alert.body" class="alert-card__body">
          {{ alert.body }}
        </div>
      </div>

    </div>

  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import { useQuasar } from 'quasar'

const store = useManagerAppStore()
const $q = useQuasar()
const filter = ref('active')

const activeAlerts = computed(() => store.alerts.filter((a) => !a.is_resolved))
const resolvedAlerts = computed(() => store.alerts.filter((a) => a.is_resolved))
const filtered = computed(() =>
  filter.value === 'active' ? activeAlerts.value : resolvedAlerts.value,
)

onMounted(() => store.markAlertsViewed())
watch(activeAlerts, () => store.markAlertsViewed())

async function resolve(id) {
  try {
    await store.resolveAlert(id)
    $q.notify({ type: 'positive', message: 'Alert resolved', position: 'top' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  }
}

function severityIcon(s) {
  return { info: 'info', warning: 'warning_amber', critical: 'error' }[s] || 'info'
}

function fmtDate(dt) {
  return dt
    ? new Date(dt).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
}
</script>

<style lang="scss" scoped>
// ─── Page ───────────────────────────────────────────────────────────────────
.mgr-alerts-page {
  background: #090c14;
  min-height: 100vh;
}
.body--light .mgr-alerts-page {
  background: #f1f5f9;
}

// ─── Hero Header ────────────────────────────────────────────────────────────
.alerts-hero {
  background: linear-gradient(135deg, #450a0a 0%, #7f1d1d 40%, #991b1b 100%);
  box-shadow: 0 8px 24px rgba(239, 68, 68, 0.2);
  padding: 20px 16px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: -20px;
    right: -20px;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(248, 113, 113, 0.15) 0%, transparent 70%);
    pointer-events: none;
  }
}

.alerts-hero__icon-wrap {
  width: 50px;
  height: 50px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.15);
  color: #fca5a5;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.alerts-hero__text { flex: 1; }

.alerts-hero__title {
  font-size: 1.3rem;
  font-weight: 900;
  color: #ffffff;
  letter-spacing: -0.3px;
}

.alerts-hero__sub {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 2px;
}

.alerts-hero__refresh {
  color: rgba(255, 255, 255, 0.5) !important;
  flex-shrink: 0;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
.alerts-tabs-wrap {
  display: flex;
  gap: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 4px;
}
.body--light .alerts-tabs-wrap {
  background: #ffffff;
  border-color: #e2e8f0;
}

.alerts-tab {
  flex: 1;
  border: none;
  outline: none;
  border-radius: 10px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #6b7280;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
}
.alerts-tab--active {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
}
.body--light .alerts-tab { color: #94a3b8; }
.body--light .alerts-tab--active {
  background: #fef2f2;
  color: #dc2626;
}

.alerts-tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0 5px;
}
.alerts-tab__badge--red { background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; }
.alerts-tab__badge--green { background: linear-gradient(135deg, #10b981, #059669); color: #fff; }

// ─── Empty State ─────────────────────────────────────────────────────────────
.alerts-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 24px;
  gap: 10px;
  text-align: center;
}

.alerts-empty__circle {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1e1b4b, #312e81);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #818cf8;
  margin-bottom: 6px;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.2);
}

.alerts-empty__title {
  font-size: 1rem;
  font-weight: 700;
  color: #9ca3af;
}
.alerts-empty__sub {
  font-size: 0.85rem;
  color: #6b7280;
}

// ─── Alert Cards ─────────────────────────────────────────────────────────────
.alert-card {
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
  animation: slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  transition: transform 0.15s;

  &:active { transform: scale(0.99); }
}
.body--light .alert-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.alert-card--warning { border-left: 4px solid #f59e0b !important; }
.alert-card--critical { border-left: 4px solid #ef4444 !important; }
.alert-card--info     { border-left: 4px solid #3b82f6 !important; }

.alert-card__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
}

.alert-sev-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.alert-sev-icon--info     { background: rgba(59,130,246,0.12); color: #60a5fa; }
.alert-sev-icon--warning  { background: rgba(245,158,11,0.12); color: #fbbf24; }
.alert-sev-icon--critical { background: rgba(239,68,68,0.12);  color: #f87171; }

.alert-card__info { flex: 1; min-width: 0; }

.alert-card__title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #f3f4f6;
}
.body--light .alert-card__title { color: #1e293b; }

.alert-card__meta {
  font-size: 0.78rem;
  color: #6b7280;
  margin-top: 2px;
  text-transform: capitalize;
}
.body--light .alert-card__meta { color: #94a3b8; }

.alert-resolve-btn {
  background: linear-gradient(135deg, #10b981, #059669) !important;
  color: #fff !important;
  border-radius: 8px !important;
  padding: 0 12px !important;
  font-weight: 700 !important;
  font-size: 0.80rem !important;
  height: 30px !important;
  flex-shrink: 0;
}

.alert-resolved-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 8px;
  padding: 4px 8px;
  flex-shrink: 0;
}

.alert-card__body {
  font-size: 0.85rem;
  color: #9ca3af;
  padding: 0 14px 12px 58px;
  line-height: 1.4;
}
.body--light .alert-card__body { color: #64748b; }
</style>
