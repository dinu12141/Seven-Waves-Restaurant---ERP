<template>
  <q-page class="waiter-page-dark">
    <!-- Toolbar -->
    <div class="inner-header q-px-md q-py-sm row items-center">
      <div class="text-weight-bold text-white">Alerts</div>
      <q-space />
      <q-badge v-if="totalAlertCount > 0" color="red" class="q-px-sm q-mr-sm alert-badge">
        {{ totalAlertCount }}
      </q-badge>
      <q-btn
        round
        flat
        dense
        icon="refresh"
        color="grey-5"
        class="q-ml-xs"
        @click="appStore.loadReadyAlerts()"
      />
    </div>

    <!-- Empty state -->
    <div v-if="totalAlertCount === 0" class="empty-state">
      <q-icon name="notifications_none" size="52px" class="text-grey-7 q-mb-md" />
      <div class="text-grey-5">No alerts right now</div>
      <div class="text-caption text-grey-7 q-mt-xs">
        New orders and kitchen-ready alerts appear here
      </div>
    </div>

    <div v-else class="q-pa-md">
      <!-- ── Section 1: New Incoming Orders ── -->
      <template v-if="orderStore.newOrderAlerts.length > 0">
        <div class="section-header q-mb-sm">
          <div class="section-header__dot section-header__dot--blue" />
          <span>NEW ORDERS</span>
          <q-badge color="blue-9" class="q-ml-sm">{{ orderStore.newOrderAlerts.length }}</q-badge>
          <q-space />
          <q-btn
            flat
            dense
            no-caps
            size="xs"
            color="grey-5"
            label="Clear all"
            @click="orderStore.clearNewOrderAlerts()"
          />
        </div>

        <div
          v-for="alert in orderStore.newOrderAlerts"
          :key="alert.id"
          class="alert-card alert-card--new q-mb-sm"
        >
          <div class="row items-center q-pa-md no-wrap">
            <div class="alert-icon-wrap alert-icon-wrap--blue q-mr-md">
              <q-icon name="room_service" size="24px" color="blue-3" />
            </div>
            <div class="col">
              <div class="text-white text-weight-bold">
                New Order
                <span v-if="alert.order_number" class="text-blue-3">
                  #{{ alert.order_number }}</span
                >
              </div>
              <div class="text-caption text-grey-5 q-mt-xs">
                <q-icon name="table_restaurant" size="11px" class="q-mr-xs" />
                {{ alert.table_name }}
                <span class="q-mx-xs text-grey-7">·</span>
                <q-icon name="schedule" size="11px" class="q-mr-xs" />
                {{ relativeTime(alert.created_at) }}
              </div>
            </div>
            <!-- Dismiss button -->
            <q-btn
              round
              flat
              dense
              size="sm"
              icon="close"
              color="grey-6"
              @click="orderStore.dismissNewOrderAlert(alert.id)"
            />
          </div>
          <!-- Go to Inbox CTA -->
          <div class="alert-card__actions q-px-md q-pb-md">
            <q-btn
              unelevated
              class="full-width"
              color="blue-9"
              icon="move_to_inbox"
              label="Go to Inbox to Accept"
              @click="goInbox"
              no-caps
              style="height: 42px; border-radius: 10px; font-weight: 700; font-size: 13px"
            />
          </div>
        </div>

        <div v-if="appStore.readyAlerts.length > 0" class="section-divider q-my-md" />
      </template>

      <!-- ── Section 2: Kitchen Ready Alerts ── -->
      <template v-if="appStore.readyAlerts.length > 0">
        <div class="section-header q-mb-sm">
          <div class="section-header__dot section-header__dot--green" />
          <span>KITCHEN READY</span>
          <q-badge color="green-9" class="q-ml-sm">{{ appStore.readyAlerts.length }}</q-badge>
        </div>

        <!-- Ready pulse banner -->
        <div class="pulse-banner q-mb-md">
          <q-icon name="restaurant" size="18px" class="q-mr-sm" />
          <span class="text-weight-bold"
            >{{ appStore.readyAlerts.length }} order(s) ready to serve!</span
          >
        </div>

        <div
          v-for="alert in appStore.readyAlerts"
          :key="alert.id"
          class="alert-card alert-card--ready q-mb-sm"
        >
          <div class="row items-center q-pa-md no-wrap">
            <div class="alert-icon-wrap alert-icon-wrap--green q-mr-md">
              <q-icon name="soup_kitchen" size="24px" color="green-4" />
            </div>
            <div class="col">
              <div class="text-white text-weight-bold">
                Order #{{ orderNumber(alert.order_id) }}
                <q-chip dense color="green-9" text-color="white" size="xs" class="q-ml-xs">
                  Ready!
                </q-chip>
              </div>
              <div class="text-caption text-grey-5 q-mt-xs">
                <q-icon name="soup_kitchen" size="11px" class="q-mr-xs" />
                {{ alert.kitchens?.name || 'Kitchen' }}
                <span class="q-mx-xs text-grey-7">·</span>
                KOT #{{ alert.batch_number }}
                <span class="q-mx-xs text-grey-7">·</span>
                {{ fmtTime(alert.created_at) }}
              </div>
            </div>
          </div>
          <!-- Mark Served -->
          <div class="alert-card__actions q-px-md q-pb-md">
            <q-btn
              unelevated
              class="full-width"
              color="green-9"
              icon="check_circle"
              label="Pick Up & Mark Served"
              :loading="serving[alert.order_id]"
              @click="markServedFromAlert(alert.order_id)"
              no-caps
              style="height: 44px; border-radius: 10px; font-weight: 700; font-size: 13px"
            />
          </div>
        </div>
      </template>
    </div>

    <div style="height: 24px" />
  </q-page>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'

const appStore = useWaiterAppStore()
const orderStore = useWaiterOrderStore()
const $q = useQuasar()
const router = useRouter()
const serving = reactive({})

const totalAlertCount = computed(
  () => orderStore.newOrderAlerts.length + appStore.readyAlerts.length,
)

function fmtTime(dt) {
  return dt ? new Date(dt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : ''
}

function relativeTime(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m ago` : `${hrs}h ago`
}

function orderNumber(orderId) {
  return appStore.myOrders.find((o) => o.id === orderId)?.order_number || '—'
}

function goInbox() {
  router.push('/waiter-app/inbox')
}

async function markServedFromAlert(orderId) {
  serving[orderId] = true
  try {
    const result = await appStore.markServed(orderId)
    $q.notify({
      type: 'positive',
      message: `✅ Served! +${result?.points_awarded || 0} pts`,
      position: 'top',
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  } finally {
    serving[orderId] = false
  }
}
</script>

<style lang="scss" scoped>
@import './waiter-shared.scss';

// ── Header ───────────────────────────────────────────────────────
.inner-header {
  background: linear-gradient(135deg, #92400e 0%, #b45309 60%, #d97706 100%);
  box-shadow: 0 4px 20px rgba(146, 64, 14, 0.4);
  height: 52px;
  border-bottom: none;
}

// ── Alert badge ──────────────────────────────────────────────────
.alert-badge {
  font-weight: 700 !important;
  animation: badge-pulse 1s ease-in-out infinite;
}
@keyframes badge-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.12); }
}

// ── Empty state ───────────────────────────────────────────────────
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 72px 28px;
  text-align: center;

  :deep(.q-icon) {
    background: linear-gradient(135deg, #d1fae5, #a7f3d0);
    border-radius: 50%;
    padding: 16px;
    color: #059669 !important;
    box-shadow: 0 8px 24px rgba(5, 150, 105, 0.2);
  }
}

// ── Section headers ──────────────────────────────────────────────
.section-header {
  display: flex;
  align-items: center;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #94a3b8;

  &__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 8px;
    &--blue {
      background: #3b82f6;
      box-shadow: 0 0 8px #3b82f6;
    }
    &--green {
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
      animation: dot-pulse 1.5s ease-in-out infinite;
    }
  }
}
@keyframes dot-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px #22c55e; }
  50% { opacity: 0.5; box-shadow: 0 0 3px #22c55e; }
}

.section-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 1px;
}

// ── Alert Cards ───────────────────────────────────────────────────
.alert-card {
  border-radius: 16px;
  overflow: hidden;
  transition: transform 0.15s;

  &:active { transform: scale(0.99); }

  &__actions {
    border-top: 1px solid transparent;
  }

  &--new {
    background: rgba(59, 130, 246, 0.07);
    border: 1px solid rgba(59, 130, 246, 0.25);
    animation: new-order-pulse 2.5s ease-in-out infinite;

    &__actions {
      border-top-color: rgba(59, 130, 246, 0.12);
    }
  }

  &--ready {
    background: linear-gradient(135deg, rgba(255, 251, 235, 0.92), rgba(254, 243, 199, 0.92));
    border: 1.5px solid #fcd34d;
    box-shadow: 0 4px 20px rgba(252, 211, 77, 0.2);
    animation: ready-border-pulse 2s ease-in-out infinite;

    &__actions {
      border-top-color: rgba(252, 211, 77, 0.4);
    }
  }
}

@keyframes new-order-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.2); }
  50% { box-shadow: 0 0 14px 3px rgba(59, 130, 246, 0.1); }
}

@keyframes ready-border-pulse {
  0%, 100% { box-shadow: 0 4px 20px rgba(252, 211, 77, 0.2), 0 0 0 0 rgba(245, 158, 11, 0.35); }
  50% { box-shadow: 0 4px 28px rgba(252, 211, 77, 0.35), 0 0 12px 3px rgba(245, 158, 11, 0.15); }
}

// ── Alert icon wraps ─────────────────────────────────────────────
.alert-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  &--blue {
    background: rgba(59, 130, 246, 0.15);
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
  }
  &--green {
    background: linear-gradient(135deg, #f59e0b20, #d9770620);
    border: 1.5px solid rgba(245, 158, 11, 0.4);
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
    animation: fire-glow 2s ease-in-out infinite;
  }
}

@keyframes fire-glow {
  0%, 100% { box-shadow: 0 0 10px rgba(245, 158, 11, 0.2); }
  50% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.5); }
}

// ── Kitchen ready text (inside --ready card) ─────────────────────
.alert-card--ready {
  .text-white { color: #78350f !important; font-weight: 800; }
  .text-grey-5 { color: #92400e !important; }
}

// ── Kitchen ready banner ─────────────────────────────────────────
.pulse-banner {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.08));
  border: 1.5px solid rgba(245, 158, 11, 0.4);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  color: #d97706;
  font-size: 0.95rem;
  animation: banner-glow 2s ease-in-out infinite;
}
@keyframes banner-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.2); }
  50% { box-shadow: 0 0 16px 4px rgba(245, 158, 11, 0.12); }
}

// ── Serve button override (green gradient) ────────────────────────
:deep(.alert-card--ready .q-btn.bg-green-9) {
  background: linear-gradient(135deg, #16a34a, #15803d) !important;
  box-shadow: 0 4px 16px rgba(22, 163, 74, 0.4) !important;
  border-radius: 12px !important;
  font-weight: 700 !important;
  height: 52px !important;
}
:deep(.alert-card--new .q-btn.bg-blue-9) {
  background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35) !important;
  border-radius: 12px !important;
}
</style>
