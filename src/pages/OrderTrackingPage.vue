<template>
  <q-page class="q-pa-md bg-dark flex flex-center">
    <div class="full-width" style="max-width: 500px">
      <OrderTrackingPanel
        v-if="store.currentOrder"
        :order-id="store.currentOrder.id"
        :current-status="store.currentOrder.status"
      />

      <div v-else class="column items-center text-center q-pa-xl">
        <q-icon name="history" size="64px" class="q-mb-md text-grey-8" />
        <div class="text-h6 text-grey-6">No recent order found</div>
        <div class="text-caption text-grey-7 q-mb-lg">Place an order to start tracking.</div>
        <q-btn flat color="primary" label="Back to Menu" to="/menu" no-caps />
      </div>

      <div class="q-mt-xl text-center">
        <q-btn
          flat
          dense
          no-caps
          color="grey-7"
          label="Refresh Status"
          icon="refresh"
          @click="refreshStatus"
        />
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { useCustomerOrderStore } from 'src/stores/customerOrderStore'
import OrderTrackingPanel from 'src/components/customer/OrderTrackingPanel.vue'
import { onMounted } from 'vue'

const store = useCustomerOrderStore()

// Mock status progression for demonstration
function refreshStatus() {
  if (!store.currentOrder) return

  const statusOrder = ['pending_waiter', 'accepted', 'preparing', 'ready']
  const currentIndex = statusOrder.indexOf(store.currentOrder.status)

  if (currentIndex < statusOrder.length - 1) {
    store.currentOrder.status = statusOrder[currentIndex + 1]
  }
}

onMounted(() => {
  // If we just landed here and have an order, simulate progression after 5 seconds
  if (store.currentOrder && store.currentOrder.status === 'pending_waiter') {
    setTimeout(() => {
      if (store.currentOrder) store.currentOrder.status = 'accepted'
    }, 5000)
  }
})
</script>
