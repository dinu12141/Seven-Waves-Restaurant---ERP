<template>
  <div class="order-cart column full-height">
    <!-- ═══ Cart Header ═══ -->
    <div class="cart-header q-pa-md row items-center justify-between">
      <div>
        <div class="text-subtitle1 text-white text-weight-bold">Current Order</div>
        <div class="text-caption text-grey-5">#{{ store.orderNumber }}</div>
      </div>
      <div class="row items-center q-gutter-xs">
        <!-- Order Type Toggle -->
        <q-btn-toggle
          v-model="store.orderType"
          dense
          no-caps
          rounded
          toggle-color="primary"
          color="grey-9"
          text-color="grey-4"
          :options="[
            { label: 'Dine-in', value: 'dine-in', icon: 'restaurant' },
            { label: 'Takeaway', value: 'takeaway', icon: 'takeout_dining' },
          ]"
          class="order-type-toggle"
        />
      </div>
    </div>

    <q-separator color="grey-8" />

    <!-- Customer Details -->
    <div class="q-pa-sm" style="background: rgba(255, 255, 255, 0.02)">
      <q-input
        v-model="store.customerName"
        dense
        outlined
        dark
        placeholder="Customer Name (Optional)"
        class="customer-input"
      >
        <template v-slot:prepend>
          <q-icon name="person" size="18px" color="grey-5" />
        </template>
      </q-input>
    </div>

    <q-separator color="grey-8" />

    <!-- ═══ Cart Items ═══ -->
    <q-scroll-area class="col cart-scroll">
      <!-- Empty State -->
      <div
        v-if="store.isEmpty"
        class="column items-center justify-center full-height text-grey-6 q-pa-xl"
      >
        <q-icon name="shopping_cart" size="56px" class="q-mb-sm" style="opacity: 0.3" />
        <div class="text-subtitle2">Cart is empty</div>
        <div class="text-caption text-grey-7">Select items from the menu</div>
      </div>

      <!-- Item List -->
      <div v-else class="q-pa-sm">
        <transition-group name="cart-item" tag="div">
          <div
            v-for="(item, index) in store.cartItems"
            :key="item.id"
            class="cart-item-row q-mb-sm q-pa-sm"
          >
            <!-- Row 1: Image + Name + Qty + Total -->
            <div class="row items-center no-wrap q-mb-xs">
              <!-- Thumbnail -->
              <q-avatar rounded size="36px" class="q-mr-sm">
                <q-img :src="item.image" :ratio="1" />
              </q-avatar>

              <!-- Name & Variant -->
              <div class="col">
                <div class="text-white text-weight-medium item-label">
                  {{ item.name }}
                </div>
                <q-badge
                  v-if="item.variant"
                  dense
                  color="orange-9"
                  text-color="white"
                  class="q-mt-xs variant-chip"
                >
                  {{ item.variant }}
                </q-badge>
              </div>

              <!-- Quantity Control -->
              <QuantityControl
                :model-value="item.qty"
                @update:model-value="(val) => store.updateQuantity(index, val)"
              />

              <!-- Line Total -->
              <div class="text-white text-weight-bold q-ml-sm line-total">
                LKR {{ (item.price * item.qty).toFixed(2) }}
              </div>

              <!-- Remove -->
              <q-btn
                flat
                dense
                round
                icon="close"
                size="xs"
                color="grey-6"
                class="q-ml-xs"
                @click="store.removeItem(index)"
              >
                <q-tooltip>Remove</q-tooltip>
              </q-btn>
            </div>

            <!-- Row 2: Notes -->
            <q-input
              v-model="item.notes"
              dense
              dark
              borderless
              placeholder="Add note..."
              class="notes-input q-ml-xl"
              input-class="text-caption"
              @update:model-value="(val) => store.setItemNotes(index, val)"
            >
              <template v-slot:prepend>
                <q-icon name="edit_note" size="16px" color="grey-6" />
              </template>
            </q-input>
          </div>
        </transition-group>
      </div>
    </q-scroll-area>

    <q-separator color="grey-8" />

    <!-- ═══ Summary ═══ -->
    <div class="cart-summary q-pa-md">
      <!-- Subtotal -->
      <div class="row justify-between q-mb-xs">
        <span class="text-grey-5 text-caption">Subtotal</span>
        <span class="text-grey-4 text-caption">LKR {{ store.subtotal.toFixed(2) }}</span>
      </div>

      <!-- Discount -->
      <div v-if="store.discount > 0" class="row justify-between q-mb-xs">
        <span class="text-grey-5 text-caption"> Discount ({{ store.discount }}%) </span>
        <span class="text-green text-caption">-LKR {{ store.discountAmount.toFixed(2) }}</span>
      </div>

      <!-- Tax -->
      <div class="row justify-between q-mb-sm">
        <span class="text-grey-5 text-caption">Tax ({{ store.taxRate }}%)</span>
        <span class="text-grey-4 text-caption">LKR {{ store.taxAmount.toFixed(2) }}</span>
      </div>

      <q-separator color="grey-8" class="q-mb-sm" />

      <!-- Grand Total -->
      <div class="row justify-between q-mb-md">
        <span class="text-white text-h6 text-weight-bold">Total</span>
        <span class="text-white text-h6 text-weight-bold">LKR {{ store.total.toFixed(2) }}</span>
      </div>

      <!-- Action Buttons -->
      <div class="row q-gutter-sm">
        <q-btn
          v-if="restrictions.canSendToKitchen"
          unelevated
          no-caps
          class="col"
          color="teal-8"
          text-color="white"
          icon="soup_kitchen"
          label="Send to Kitchen"
          :disable="store.isEmpty"
          @click="$emit('sendToKitchen')"
        />
        <q-btn
          v-if="restrictions.canProcessPayment"
          unelevated
          no-caps
          class="col"
          color="primary"
          text-color="white"
          icon="payment"
          label="Payment"
          :disable="store.isEmpty"
          @click="$emit('processPayment')"
        />
        <!-- Waiter sees a disabled payment button to indicate they can't process -->
        <q-btn
          v-if="!restrictions.canProcessPayment && restrictions.canSendToKitchen"
          unelevated
          no-caps
          class="col"
          color="grey-8"
          text-color="grey-5"
          icon="payment"
          label="Payment"
          disable
        >
          <q-tooltip>You don't have permission to process payments</q-tooltip>
        </q-btn>
      </div>

      <!-- Cancel Button -->
      <q-btn
        flat
        no-caps
        color="red-4"
        class="full-width q-mt-xs"
        label="Clear Order"
        icon="delete_outline"
        :disable="store.isEmpty"
        @click="$emit('clearCart')"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useOrderStore } from 'src/stores/orderStore'
import { useAuthStore } from 'src/stores/auth'
import { getRoleRestrictions } from 'src/config/roles'
import QuantityControl from './QuantityControl.vue'

const store = useOrderStore()
const authStore = useAuthStore()

/** Role-based POS restrictions */
const restrictions = computed(() => getRoleRestrictions(authStore.roles))

defineEmits(['sendToKitchen', 'processPayment', 'clearCart'])
</script>

<style scoped lang="scss">
.order-cart {
  background: rgba(15, 15, 15, 0.6);
}

.cart-header {
  background: rgba(255, 255, 255, 0.03);
}

.order-type-toggle {
  :deep(.q-btn) {
    font-size: 0.7rem;
    padding: 2px 8px;
  }
}

.cart-scroll {
  min-height: 120px;
}

.cart-item-row {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: background 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
}

.item-label {
  font-size: 0.82rem;
  line-height: 1.2;
}

.variant-chip {
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 4px;
}

.line-total {
  font-size: 0.82rem;
  min-width: 48px;
  text-align: right;
}

.notes-input {
  :deep(.q-field__control) {
    height: 28px;
    min-height: 28px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    padding: 0 6px;
  }

  :deep(input) {
    font-size: 0.75rem;
    color: #999;
  }
}

.cart-summary {
  background: rgba(255, 255, 255, 0.03);
}

// Transition animations for cart items
.cart-item-enter-active {
  transition: all 0.3s ease;
}
.cart-item-leave-active {
  transition: all 0.2s ease;
}
.cart-item-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.cart-item-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}
</style>
