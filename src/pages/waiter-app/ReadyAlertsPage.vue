<template>
  <q-page class="waiter-page-dark">
    <div class="inner-header q-px-md q-py-sm row items-center">
      <div class="text-weight-bold text-white">Ready Alerts</div>
      <q-space />
      <q-badge v-if="store.readyCount > 0" color="green" class="q-px-sm ready-badge">
        {{ store.readyCount }} ready
      </q-badge>
      <q-btn round flat dense icon="refresh" color="grey-5" class="q-ml-sm" @click="store.loadReadyAlerts()" />
    </div>

    <div v-if="store.readyAlerts.length === 0" class="empty-state">
      <q-icon name="notifications_none" size="52px" class="text-grey-7 q-mb-md" />
      <div class="text-grey-5">No ready alerts</div>
      <div class="text-caption text-grey-7 q-mt-xs">Kitchen will notify you when orders are ready</div>
    </div>

    <div v-else class="q-pa-md">
      <div class="pulse-banner q-mb-md">
        <q-icon name="restaurant" size="18px" class="q-mr-sm" />
        <span class="text-weight-bold">{{ store.readyCount }} order(s) ready to serve!</span>
      </div>

      <div
        v-for="alert in store.readyAlerts"
        :key="alert.id"
        class="alert-card q-mb-md"
      >
        <div class="row items-center q-pa-md">
          <div class="ready-icon-wrap q-mr-md">
            <q-icon name="soup_kitchen" size="26px" color="green-4" />
          </div>
          <div class="col">
            <div class="text-white text-weight-bold">
              Order #{{ orderNumber(alert.order_id) }}
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

        <!-- Mark Served from alert -->
        <div class="alert-card__actions q-px-md q-pb-md">
          <q-btn
            unelevated class="full-width" color="green-9"
            icon="check_circle" label="Pick Up & Mark Served"
            :loading="serving[alert.order_id]"
            @click="markServedFromAlert(alert.order_id)"
            no-caps
            style="height:44px;border-radius:10px;font-weight:700;font-size:13px"
          />
        </div>
      </div>
    </div>

    <div style="height: 16px" />
  </q-page>
</template>

<script setup>
import { reactive } from 'vue'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useQuasar } from 'quasar'

const store = useWaiterAppStore()
const $q = useQuasar()
const serving = reactive({})

function fmtTime(dt) { return dt ? new Date(dt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '' }

function orderNumber(orderId) {
  return store.myOrders.find(o => o.id === orderId)?.order_number || '—'
}

async function markServedFromAlert(orderId) {
  serving[orderId] = true
  try {
    const result = await store.markServed(orderId)
    $q.notify({ type: 'positive', message: `✅ Served! +${result.points_awarded || 0} pts`, position: 'top' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  } finally {
    serving[orderId] = false
  }
}
</script>

<style lang="scss" scoped>
@import './waiter-shared.scss';
.inner-header { background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05); height: 48px; }
.ready-badge { animation: badge-pulse 1.2s ease-in-out infinite; font-weight: 700 !important; }
@keyframes badge-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
.pulse-banner {
  background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25);
  border-radius: 10px; padding: 12px 16px; display: flex; align-items: center;
  color: #4ade80; animation: banner-glow 2s ease-in-out infinite;
}
@keyframes banner-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.2); } 50% { box-shadow: 0 0 12px 3px rgba(34,197,94,0.1); } }
.alert-card { background: rgba(34,197,94,0.05); border: 1px solid rgba(34,197,94,0.2); border-radius: 14px; }
.ready-icon-wrap { width: 48px; height: 48px; background: rgba(34,197,94,0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center; }
</style>
