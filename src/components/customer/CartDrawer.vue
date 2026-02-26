<template>
  <q-drawer
    v-model="store.cartDrawerOpen"
    side="right"
    :width="drawerWidth"
    overlay
    behavior="mobile"
    class="cart-drawer"
  >
    <div class="drawer-inner column full-height">
      <!-- Header -->
      <div class="drawer-header row items-center">
        <q-btn
          flat
          round
          dense
          icon="arrow_back_ios_new"
          size="sm"
          color="grey-5"
          @click="store.toggleCart"
        />
        <div class="q-ml-sm">
          <div class="text-subtitle1 text-weight-bold text-white">Your Order</div>
          <div class="text-caption text-grey-6">{{ store.tableName }}</div>
        </div>
        <q-space />
        <q-badge v-if="store.itemCount > 0" class="cart-badge">{{ store.itemCount }}</q-badge>
      </div>

      <!-- Empty State -->
      <div
        v-if="store.isEmpty"
        class="col column items-center justify-center text-center q-pa-xl q-gutter-y-md"
      >
        <div class="empty-icon">🛒</div>
        <div class="text-subtitle1 text-grey-4">Your cart is empty</div>
        <div class="text-caption text-grey-7">Browse our menu and add items you love</div>
        <q-btn
          unelevated
          outline
          color="primary"
          no-caps
          label="Back to Menu"
          class="q-mt-sm"
          @click="store.toggleCart"
          size="sm"
        />
      </div>

      <!-- Items List -->
      <q-scroll-area v-else class="col cart-scroll">
        <div class="q-pa-md q-gutter-y-sm">
          <div v-for="(item, index) in store.cartItems" :key="item.id" class="cart-item">
            <!-- Item image + info -->
            <div class="row no-wrap items-start">
              <q-img :src="item.image" class="item-thumb rounded-borders" :ratio="1" />
              <div class="col q-ml-sm">
                <div class="item-name">{{ item.name }}</div>
                <div v-if="item.variant" class="text-caption text-primary q-mb-xs">
                  {{ item.variant }}
                </div>
                <div class="item-unit-price">LKR {{ item.price.toLocaleString() }} each</div>

                <!-- Qty row -->
                <div class="row items-center q-mt-sm">
                  <div class="qty-ctrl">
                    <button class="qty-btn" @click="store.updateQuantity(index, item.qty - 1)">
                      <q-icon name="remove" size="14px" />
                    </button>
                    <span class="qty-num">{{ item.qty }}</span>
                    <button class="qty-btn" @click="store.updateQuantity(index, item.qty + 1)">
                      <q-icon name="add" size="14px" />
                    </button>
                  </div>
                  <q-space />
                  <div class="item-total-price">
                    LKR {{ (item.price * item.qty).toLocaleString() }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Notes field -->
            <q-input
              v-model="item.notes"
              placeholder="Add note (e.g. no onions)"
              dense
              outlined
              dark
              class="notes-input q-mt-sm"
              :input-style="{ fontSize: '0.78rem' }"
              @update:model-value="store.updateNotes(index, item.notes)"
            >
              <template v-slot:prepend>
                <q-icon name="edit_note" size="16px" color="grey-6" />
              </template>
            </q-input>

            <!-- Delete row -->
            <div class="row justify-end q-mt-xs">
              <q-btn
                flat
                dense
                no-caps
                size="xs"
                icon="delete_outline"
                color="red-4"
                label="Remove"
                @click="store.removeItem(index)"
              />
            </div>

            <q-separator dark class="q-mt-sm" style="opacity: 0.08" />
          </div>
        </div>
      </q-scroll-area>

      <!-- Footer / Place Order -->
      <div v-if="!store.isEmpty" class="cart-footer q-pa-md">
        <!-- Special Request -->
        <q-input
          v-model="store.specialRequest"
          placeholder="Special instructions for kitchen..."
          outlined
          dark
          dense
          class="q-mb-md special-req-input"
          autogrow
          :input-style="{ fontSize: '0.82rem' }"
        >
          <template v-slot:prepend>
            <q-icon name="notes" color="grey-6" />
          </template>
        </q-input>

        <!-- Order Summary -->
        <div class="summary-box q-mb-md q-pa-md rounded-borders">
          <div class="row justify-between text-caption text-grey-5 q-mb-xs">
            <span>Subtotal ({{ store.itemCount }} items)</span>
            <span>LKR {{ store.subtotal.toLocaleString() }}</span>
          </div>
          <div class="row justify-between text-caption text-grey-5 q-mb-xs">
            <span>Service charge (5%)</span>
            <span>LKR {{ Math.round(store.subtotal * 0.05).toLocaleString() }}</span>
          </div>
          <q-separator dark style="opacity: 0.12" class="q-my-sm" />
          <div class="row justify-between items-center">
            <span class="text-grey-4 text-weight-medium" style="font-size: 0.9rem">Total</span>
            <span class="total-amount"
              >LKR {{ Math.round(store.subtotal * 1.05).toLocaleString() }}</span
            >
          </div>
        </div>

        <!-- Place Order Button -->
        <q-btn
          class="place-order-btn full-width"
          unelevated
          no-caps
          :loading="store.isPlacingOrder"
          @click="handlePlaceOrder"
        >
          <q-icon name="check_circle_outline" class="q-mr-sm" />
          <span class="text-weight-bold" style="font-size: 1rem">Place Order</span>
          <template v-slot:loading>
            <q-spinner-rings color="white" size="1.5em" />
            <span class="q-ml-sm">Sending to kitchen...</span>
          </template>
        </q-btn>
      </div>
    </div>
  </q-drawer>
</template>

<script setup>
import { computed } from 'vue'
import { useCustomerOrderStore } from 'src/stores/customerOrderStore'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'

const store = useCustomerOrderStore()
const router = useRouter()
const $q = useQuasar()

const drawerWidth = computed(() => {
  return Math.min(window.innerWidth * 0.95, 380)
})

async function handlePlaceOrder() {
  const result = await store.placeOrder()

  if (result.success) {
    store.cartDrawerOpen = false
    router.push('/menu/track/' + result.order.id)

    $q.notify({
      message: '🎉 Order Placed!',
      caption: `Order ${result.order.id} sent to kitchen.`,
      color: 'positive',
      icon: 'check_circle',
      position: 'top',
      timeout: 4000,
    })
  }
}
</script>

<style lang="scss" scoped>
.cart-drawer {
  background: #12121c !important;
}

.drawer-inner {
  background: #12121c;
  height: 100%;
}

.drawer-header {
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}

.cart-badge {
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: white;
  font-weight: 700;
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 20px;
}

.empty-icon {
  font-size: 60px;
  line-height: 1;
  opacity: 0.5;
}

.cart-scroll {
  background: transparent;
}

.cart-item {
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.item-thumb {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  flex-shrink: 0;
  object-fit: cover;
}

.item-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: #e2e8f0;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-unit-price {
  font-size: 0.72rem;
  color: #6b7280;
  margin-top: 2px;
}

.qty-ctrl {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  overflow: hidden;
}

.qty-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(249, 115, 22, 0.2);
    color: #fb923c;
  }
}

.qty-num {
  min-width: 28px;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 700;
  color: white;
}

.item-total-price {
  font-size: 0.88rem;
  font-weight: 700;
  color: #fb923c;
}

.notes-input {
  :deep(.q-field__control) {
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    font-size: 0.78rem;
  }
}

.cart-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}

.special-req-input {
  :deep(.q-field__control) {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 10px;
  }
}

.summary-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.total-amount {
  font-size: 1.15rem;
  font-weight: 800;
  color: #fb923c;
}

.place-order-btn {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  color: white !important;
  border-radius: 14px;
  height: 52px;
  font-size: 1rem;
  box-shadow: 0 6px 24px rgba(249, 115, 22, 0.45);
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 10px 32px rgba(249, 115, 22, 0.6);
  }
}
</style>
