<template>
  <q-page class="mgr-orders-page" :class="{ lt: !$q.dark.isActive }" padding>
    <!-- Page Header -->
    <div class="page-header q-mb-md">
      <div class="page-header__left">
        <div class="page-header__icon-wrap page-header__icon-wrap--orange">
          <q-icon name="receipt_long" size="20px" />
        </div>
        <div>
          <div class="page-header__title">Orders Monitor</div>
          <div class="page-header__sub">Track all active restaurant orders</div>
        </div>
      </div>
      <q-btn
        flat
        round
        icon="refresh"
        size="sm"
        class="page-header__refresh"
        :loading="store.loading"
        @click="store.loadOrders()"
      />
    </div>

    <!-- Status Tabs -->
    <q-tabs
      v-model="tab"
      dense
      active-color="cyan"
      indicator-color="cyan"
      align="justify"
      class="order-tabs q-mb-md"
    >
      <q-tab name="pending" :label="`Pending (${store.pendingOrders.length})`" no-caps />
      <q-tab name="accepted" :label="`Active (${store.acceptedOrders.length})`" no-caps />
      <q-tab name="ready" :label="`Ready (${store.readyOrders.length})`" no-caps />
      <q-tab name="delayed" no-caps>
        <div class="row items-center no-wrap">
          Delayed ({{ store.delayedOrders.length }})
          <q-icon
            v-if="store.delayedOrders.length > 0"
            name="warning"
            color="red-5"
            size="14px"
            class="q-ml-xs"
          />
        </div>
      </q-tab>
    </q-tabs>

    <!-- Tab Panels -->
    <q-tab-panels v-model="tab" animated class="bg-transparent">
      <q-tab-panel name="pending" class="q-pa-none">
        <order-list
          :orders="store.pendingOrders"
          empty-msg="No pending orders."
          status-color="orange"
        />
      </q-tab-panel>
      <q-tab-panel name="accepted" class="q-pa-none">
        <order-list
          :orders="store.acceptedOrders"
          empty-msg="No active orders."
          status-color="cyan"
        />
      </q-tab-panel>
      <q-tab-panel name="ready" class="q-pa-none">
        <order-list :orders="store.readyOrders" empty-msg="No ready orders." status-color="green" />
      </q-tab-panel>
      <q-tab-panel name="delayed" class="q-pa-none">
        <order-list
          :orders="store.delayedOrders"
          empty-msg="No delayed orders."
          status-color="red"
        />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup>
import { useQuasar } from 'quasar'

const $q = useQuasar()
import { ref } from 'vue'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import OrderList from './components/OrderList.vue'

const store = useManagerAppStore()
const tab = ref('pending')
</script>

<style lang="scss" scoped>
.mgr-orders-page {
  min-height: 100vh;
  padding-bottom: 80px !important;
  background: #090c14;
}
.mgr-orders-page.lt {
  background: #f1f5f9;
}

// ─── Page Header ─────────────────────────────────────────────────────────────
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.page-header__icon-wrap {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-header__icon-wrap--orange {
  background: rgba(249, 115, 22, 0.12);
  color: #f97316;
}
.lt .page-header__icon-wrap--orange {
  background: rgba(249, 115, 22, 0.08);
}
.page-header__title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #f3f4f6;
}
.lt .page-header__title {
  color: #1e293b;
}
.page-header__sub {
  font-size: 0.7rem;
  color: #6b7280;
  margin-top: 1px;
}
.lt .page-header__sub {
  color: #94a3b8;
}
.page-header__refresh {
  color: #6b7280 !important;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
.order-tabs {
  border-radius: 12px;
  overflow: hidden;
}
.order-tabs {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.lt .order-tabs {
  background: #ffffff;
  border: 1px solid #e5e7eb;
}
.order-tabs :deep(.q-tab) {
  font-size: 0.72rem;
  font-weight: 600;
  min-height: 38px;
}
.order-tabs :deep(.q-tab) {
  color: #6b7280;
}
.lt .order-tabs :deep(.q-tab) {
  color: #94a3b8;
}
.order-tabs :deep(.q-tab--active) {
  color: #22d3ee;
}
.lt .order-tabs :deep(.q-tab--active) {
  color: #0891b2;
}
</style>
