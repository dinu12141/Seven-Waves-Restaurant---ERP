<template>
  <q-page class="waiter-page">
    <!-- Header Bar -->
    <div class="waiter-header">
      <div class="row items-center q-px-lg q-py-md">
        <div>
          <div class="text-overline text-primary letter-sp">WAITER STATION</div>
          <div class="text-h5 text-white text-weight-bolder">Order Management</div>
          <!-- Shift Info -->
          <div v-if="store.shiftInfo" class="text-caption text-grey-5 q-mt-xs">
            <q-icon name="store" size="13px" class="q-mr-xs" />
            {{ store.shiftInfo.branch_name }}
            <span class="text-grey-7 q-mx-xs">·</span>
            <q-icon name="schedule" size="13px" class="q-mr-xs" />
            {{ store.shiftInfo.shift_name }}
            ({{ store.shiftInfo.shift_start?.slice(0, 5) }} –
            {{ store.shiftInfo.shift_end?.slice(0, 5) }})
          </div>
        </div>
        <q-space />
        <div class="row items-center q-gutter-x-sm">
          <!-- Shift indicator -->
          <q-chip
            dense
            :color="store.isOnShift ? 'green-8' : 'red-8'"
            text-color="white"
            :icon="store.isOnShift ? 'verified' : 'warning'"
          >
            {{ store.isOnShift ? 'On Shift' : 'Off Shift' }}
          </q-chip>

          <!-- Refresh -->
          <q-btn
            flat
            round
            dense
            icon="refresh"
            color="grey-5"
            :loading="store.loading"
            @click="refresh"
          >
            <q-tooltip>Refresh Orders</q-tooltip>
          </q-btn>
        </div>
      </div>
    </div>

    <!-- Off-shift warning -->
    <q-banner
      v-if="!store.loading && !store.isOnShift"
      class="off-shift-banner q-mx-lg q-mt-md"
      rounded
    >
      <template v-slot:avatar>
        <q-icon name="event_busy" color="amber" size="28px" />
      </template>
      <div class="text-weight-bold text-amber">No Active Shift</div>
      <div class="text-grey-5 text-caption q-mt-xs">
        You are not assigned to a shift today. Contact your manager to get assigned. Orders will not
        appear until you are on shift for a branch.
      </div>
    </q-banner>

    <!-- Tabs -->
    <div class="tab-bar q-px-lg">
      <q-tabs
        v-model="activeTab"
        dense
        no-caps
        class="waiter-tabs"
        active-color="primary"
        indicator-color="primary"
        align="left"
      >
        <q-tab name="inbox" class="tab-item">
          <div class="row items-center no-wrap q-gutter-x-xs">
            <q-icon name="move_to_inbox" size="18px" />
            <span>Incoming</span>
            <q-badge v-if="store.pendingCount > 0" color="red" floating>
              {{ store.pendingCount }}
            </q-badge>
          </div>
        </q-tab>
        <q-tab name="mine" class="tab-item">
          <div class="row items-center no-wrap q-gutter-x-xs">
            <q-icon name="assignment_ind" size="18px" />
            <span>My Orders</span>
            <q-badge v-if="store.myOrderCount > 0" color="blue-7" floating>
              {{ store.myOrderCount }}
            </q-badge>
          </div>
        </q-tab>
      </q-tabs>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="column items-center q-pa-xl">
      <q-spinner-orbit size="48px" color="primary" />
      <div class="text-body2 text-grey-5 q-mt-md">Loading orders...</div>
    </div>

    <!-- Tab Pages -->
    <q-tab-panels v-else v-model="activeTab" animated class="bg-transparent tab-panels">
      <q-tab-panel name="inbox" class="q-pa-none">
        <WaiterOrdersInbox />
      </q-tab-panel>
      <q-tab-panel name="mine" class="q-pa-none">
        <AcceptedOrders />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import WaiterOrdersInbox from 'src/components/waiter/WaiterOrdersInbox.vue'
import AcceptedOrders from 'src/components/waiter/AcceptedOrders.vue'

const store = useWaiterOrderStore()
const activeTab = ref('inbox')

onMounted(() => {
  store.initialize()
})

onUnmounted(() => {
  store.cleanup()
})

async function refresh() {
  await Promise.all([store.fetchPendingOrders(), store.fetchMyOrders()])
}
</script>

<style lang="scss" scoped>
.waiter-page {
  background: #0d0d14;
  min-height: 100vh;
  font-family: 'Inter', 'Roboto', sans-serif;
}

.waiter-header {
  background: linear-gradient(
    135deg,
    rgba(249, 115, 22, 0.08),
    rgba(59, 130, 246, 0.05),
    transparent
  );
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.letter-sp {
  letter-spacing: 3px;
  font-size: 0.65rem;
  font-weight: 700;
}

.off-shift-banner {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.tab-bar {
  background: rgba(13, 13, 20, 0.9);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  position: sticky;
  top: 50px;
  z-index: 50;
}

.waiter-tabs {
  :deep(.q-tab) {
    min-height: 46px;
  }
}

.tab-item {
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: none;
}

.tab-panels {
  min-height: 60vh;
}
</style>
