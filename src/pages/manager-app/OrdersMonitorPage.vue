<template>
  <q-page class="mgr-orders-page" padding>
    <div class="row items-center q-mb-md">
      <q-icon name="receipt_long" size="24px" color="cyan-4" class="q-mr-sm" />
      <div class="text-h6 text-white text-weight-bold">Orders Monitor</div>
      <q-space />
      <q-btn
        flat
        round
        icon="refresh"
        color="grey-5"
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
import { ref } from 'vue'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import OrderList from './components/OrderList.vue'

const store = useManagerAppStore()
const tab = ref('pending')
</script>

<style lang="scss" scoped>
.mgr-orders-page {
  background: #090c14;
  min-height: 100vh;
}
.order-tabs {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  :deep(.q-tab) {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    min-height: 36px;
  }
  :deep(.q-tab--active) {
    color: #22d3ee;
  }
}
</style>
