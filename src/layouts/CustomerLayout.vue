<template>
  <q-layout view="lHh Lpr lFf" class="customer-layout">
    <!-- App Header -->
    <q-header class="layout-header">
      <q-toolbar class="header-toolbar">
        <!-- Brand + Table info -->
        <div class="brand-block row items-center no-wrap">
          <div class="brand-logo">
            <q-icon name="restaurant" size="20px" color="white" />
          </div>
          <div class="q-ml-sm">
            <div class="brand-name">SEVEN WAVES</div>
            <div class="table-name">{{ store.tableName || 'Customer Menu' }}</div>
          </div>
        </div>

        <q-space />

        <!-- Track order shortcut (if there's an active order) -->
        <q-btn
          v-if="store.currentOrder"
          flat
          no-caps
          class="track-btn q-mr-sm"
          size="sm"
          to="/menu/track"
        >
          <q-icon name="delivery_dining" size="18px" class="q-mr-xs" />
          <span class="text-caption">Track</span>
          <q-badge :color="statusColor" class="q-ml-xs" floating rounded />
        </q-btn>

        <!-- Cart icon -->
        <q-btn flat round dense class="cart-btn" @click="store.toggleCart">
          <q-icon name="shopping_basket" size="22px" />
          <q-badge
            v-if="store.itemCount > 0"
            color="orange"
            floating
            rounded
            class="cart-badge-count"
          >
            {{ store.itemCount }}
          </q-badge>
        </q-btn>
      </q-toolbar>

      <!-- Order status bar (shows when tracking active) -->
      <transition name="status-bar">
        <div
          v-if="store.currentOrder"
          class="status-bar"
          :class="`status-bar--${store.currentOrder.status}`"
        >
          <q-icon :name="statusIcon" size="14px" class="q-mr-xs" />
          <span class="status-bar-text">{{ statusBarLabel }}</span>
          <q-space />
          <router-link to="/menu/track" class="status-bar-link">View →</router-link>
        </div>
      </transition>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- Cart Drawer -->
    <CartDrawer />
  </q-layout>
</template>

<script setup>
import { computed } from 'vue'
import { useCustomerOrderStore } from 'src/stores/customerOrderStore'
import CartDrawer from 'src/components/customer/CartDrawer.vue'

const store = useCustomerOrderStore()

const statusMap = {
  pending_waiter: {
    label: 'Waiting for waiter to accept your order...',
    icon: 'hourglass_empty',
    color: 'amber',
  },
  accepted: {
    label: 'Order accepted! Kitchen is being notified.',
    icon: 'check_circle_outline',
    color: 'positive',
  },
  preparing: { label: 'Chefs are preparing your food 👨‍🍳', icon: 'restaurant', color: 'orange' },
  ready: {
    label: '🎉 Your order is ready! Waiter is coming.',
    icon: 'celebration',
    color: 'purple',
  },
  served: { label: 'Enjoy your meal! 🍽️', icon: 'favorite', color: 'positive' },
}

const statusBarLabel = computed(() => {
  if (!store.currentOrder) return ''
  return statusMap[store.currentOrder.status]?.label || ''
})

const statusIcon = computed(() => {
  if (!store.currentOrder) return 'info'
  return statusMap[store.currentOrder.status]?.icon || 'info'
})

const statusColor = computed(() => {
  if (!store.currentOrder) return 'grey'
  return statusMap[store.currentOrder.status]?.color || 'grey'
})
</script>

<style lang="scss" scoped>
.customer-layout {
  font-family: 'Inter', 'Roboto', sans-serif;
  background: #0d0d14;
}

.layout-header {
  background: rgba(13, 13, 20, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: none;
}

.header-toolbar {
  height: 64px;
  padding: 0 16px;
}

.brand-logo {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f97316, #ef4444);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
  flex-shrink: 0;
}

.brand-name {
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 3px;
  color: #fb923c;
  line-height: 1;
}

.table-name {
  font-size: 0.88rem;
  font-weight: 700;
  color: white;
  line-height: 1.4;
}

.track-btn {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px !important;
  color: white !important;
  padding: 0 12px;
}

.cart-btn {
  position: relative;
  color: white !important;
}

.cart-badge-count {
  font-size: 0.65rem;
  font-weight: 700;
  min-width: 18px;
  min-height: 18px;
}

// Status bar
.status-bar {
  display: flex;
  align-items: center;
  padding: 6px 16px;
  font-size: 0.78rem;
  font-weight: 500;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.5s ease;

  &--pending_waiter {
    background: rgba(245, 158, 11, 0.1);
    color: #fbbf24;
  }
  &--accepted {
    background: rgba(34, 197, 94, 0.1);
    color: #4ade80;
  }
  &--preparing {
    background: rgba(249, 115, 22, 0.1);
    color: #fb923c;
  }
  &--ready {
    background: rgba(139, 92, 246, 0.1);
    color: #a78bfa;
  }
  &--served {
    background: rgba(34, 197, 94, 0.1);
    color: #4ade80;
  }
}

.status-bar-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}

.status-bar-link {
  color: inherit;
  text-decoration: none;
  opacity: 0.7;
  font-weight: 700;
  flex-shrink: 0;
  margin-left: 8px;
  font-size: 0.72rem;
  &:hover {
    opacity: 1;
  }
}

.status-bar-enter-active,
.status-bar-leave-active {
  transition: all 0.4s ease;
}
.status-bar-enter-from,
.status-bar-leave-to {
  height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
