<template>
  <div class="column full-height bg-dark">
    <!-- Header -->
    <div class="row items-center q-pa-md border-bottom bg-header">
      <div class="text-h6 text-weight-bolder text-white">Your Order</div>
      <q-space />
      <q-btn
        flat
        round
        dense
        icon="close"
        size="sm"
        @click="$emit('close')"
        class="text-grey-5 hover-white transition-02"
      />
    </div>

    <!-- Empty State -->
    <div v-if="cartItems.length === 0" class="col flex flex-center text-center q-pa-xl">
      <div>
        <q-icon name="restaurant" size="64px" class="text-grey-8 q-mb-md" />
        <div class="text-h6 text-grey-5 font-bold">Your cart is empty</div>
        <div class="text-caption text-grey-7 q-mt-sm">
          Add some delicious items from our menu to get started.
        </div>
      </div>
    </div>

    <!-- Cart Items -->
    <q-scroll-area v-else class="col q-px-md q-py-sm">
      <q-list separator class="cart-list">
        <q-item
          v-for="item in cartItems"
          :key="item.menu_item_id"
          class="q-py-md q-px-none cart-item"
          v-ripple
        >
          <q-item-section avatar top>
            <q-img
              :src="
                item.image_url ||
                'https://via.placeholder.com/80?text=' +
                  encodeURIComponent(item.name.substring(0, 3))
              "
              width="60px"
              height="60px"
              ratio="1"
              class="rounded-borders glossy shadow-3"
            />
          </q-item-section>

          <q-item-section>
            <q-item-label
              class="text-subtitle2 text-weight-bold text-white ellipsis-2-lines line-height-1"
              style="font-size: 14px"
              >{{ item.name }}</q-item-label
            >
            <q-item-label caption class="text-primary text-weight-bold q-mt-xs price-font">
              LKR
              {{ Math.round(item.unit_price).toLocaleString('en-LK') }}
            </q-item-label>

            <div class="row items-center q-mt-sm">
              <q-btn
                round
                dense
                unelevated
                color="grey-9"
                text-color="white"
                icon="remove"
                size="xs"
                @click="updateQuantity(item.menu_item_id, -1)"
              />
              <span class="text-weight-bold text-white q-px-md font-mono" style="font-size: 15px">{{
                item.quantity
              }}</span>
              <q-btn
                round
                dense
                unelevated
                color="primary"
                text-color="white"
                icon="add"
                size="xs"
                @click="updateQuantity(item.menu_item_id, 1)"
              />
            </div>

            <!-- Notes input -->
            <q-input
              v-model="item.notes"
              dense
              borderless
              placeholder="Add note (spicy, no onion...)"
              class="q-mt-sm text-caption note-input bg-grey-10 text-grey-3 rounded-borders q-px-sm"
              style="font-size: 11px"
            />
          </q-item-section>

          <q-item-section side top>
            <div class="text-weight-bold text-white price-font">
              LKR {{ Math.round(item.total_price).toLocaleString('en-LK') }}
            </div>
            <q-btn
              flat
              round
              dense
              icon="delete_outline"
              color="negative"
              size="sm"
              class="q-mt-auto"
              @click="confirmRemove(item)"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </q-scroll-area>

    <!-- Footer Summary & Checkout -->
    <div class="q-pa-md bg-footer shadow-up border-top">
      <div class="row justify-between q-mb-sm text-grey-4 text-subtitle2">
        <span>Subtotal ({{ cartItems.length }} items)</span>
        <span class="price-font">LKR {{ Math.round(subtotal).toLocaleString('en-LK') }}</span>
      </div>
      <div v-if="loyaltyDiscount > 0" class="row justify-between q-mb-sm text-warning font-bold">
        <span>Loyalty Rewards (Tier)</span>
        <span class="price-font"
          >- LKR {{ Math.round(loyaltyDiscount).toLocaleString('en-LK') }}</span
        >
      </div>
      <div class="row justify-between q-mb-md text-h5 text-white font-black">
        <span>Total</span>
        <span class="price-font">LKR {{ Math.round(total).toLocaleString('en-LK') }}</span>
      </div>

      <q-btn
        color="primary"
        class="full-width touch-confirm-btn font-extrabold text-h6"
        size="lg"
        unelevated
        :loading="submitting"
        :disable="cartItems.length === 0"
        @click="submitOrder"
      >
        <span class="q-py-xs">Place Order</span>
        <template v-slot:loading> <q-spinner-hourglass class="on-left" /> Processing... </template>
      </q-btn>
    </div>
  </div>
</template>

<script setup>
import { inject, computed, ref } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useQuasar } from 'quasar'
import { useTableSessionStore } from 'src/stores/tableSessionStore'

const $q = useQuasar()
const emit = defineEmits(['close'])
const sessionStore = useTableSessionStore()

const { sessionToken, cartItems, updateQuantity, removeFromCart, clearCart, openLogin } =
  inject('touchMenuState')

const submitting = ref(false)

const subtotal = computed(() => {
  return cartItems.value.reduce((sum, item) => sum + item.total_price, 0)
})

// Sample tier logic
const loyaltyDiscount = computed(() => {
  return 0 // Placeholder. Could do something like subtotal.value * 0.05 if Tier is Gold
})

const total = computed(() => subtotal.value - loyaltyDiscount.value)

function confirmRemove(item) {
  $q.dialog({
    title: 'Remove Item',
    message: `Remove ${item.name} from your order?`,
    dark: true,
    cancel: true,
    persistent: true,
    ok: { color: 'negative', flat: true },
  }).onOk(() => {
    removeFromCart(item.menu_item_id)
  })
}

async function submitOrder() {
  // Prefer the authoritative token from the store; fall back to injected legacy value
  const token = sessionStore.sessionToken || sessionToken.value

  if (!token) {
    $q.notify({
      message: 'Please log in or start a session to place an order.',
      icon: 'person',
      color: 'warning',
    })
    openLogin()
    return
  }

  if (cartItems.value.length === 0) return

  $q.dialog({
    title: 'Confirm Order',
    message: `Total is LKR ${total.value.toLocaleString('en-LK', { minimumFractionDigits: 2 })}. Place this order?`,
    dark: true,
    cancel: true,
    persistent: true,
    ok: { label: 'Yes, Place Order', color: 'primary' },
  }).onOk(async () => {
    submitting.value = true
    try {
      // Map cart items → RPC shape: { menu_item_id, qty, notes }
      const items = cartItems.value.map((item) => ({
        menu_item_id: item.menu_item_id,
        qty: item.quantity,
        notes: item.notes || null,
      }))

      console.log('[MenuCartDrawer] Submitting Order:', {
        token: token?.substring(0, 10) + '...',
        itemsCount: items.length,
      })

      const { data, error } = await supabase.rpc('create_order_from_session', {
        p_session_token: token,
        p_items: items,
        p_source: 'qr',
      })

      if (error) {
        console.error('[MenuCartDrawer] RPC Error Detail:', error)
        throw error
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to place order')
      }

      $q.notify({
        message: 'Order placed! A waiter will attend to your table shortly. 🛎️',
        color: 'positive',
        icon: 'soup_kitchen',
        timeout: 4000,
        position: 'center',
      })

      clearCart()
      emit('close')
    } catch (err) {
      console.error('[MenuCartDrawer] submitOrder caught exception:', err)
      $q.notify({
        message: err.message || 'Failed to place order. Please call a waiter.',
        color: 'negative',
        icon: 'error',
        timeout: 5000,
      })
    } finally {
      submitting.value = false
    }
  })
}
</script>

<style scoped>
.bg-header {
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(10px);
}

.bg-footer {
  background: rgba(15, 23, 42, 0.98);
  backdrop-filter: blur(15px);
}

.border-bottom {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.border-top {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.cart-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
}

.hover-white:hover {
  color: #fff !important;
  background: rgba(255, 255, 255, 0.1);
}

.note-input :deep(.q-field__control) {
  min-height: 28px !important;
  height: 28px !important;
  color: #94a3b8;
}

.shadow-up {
  box-shadow: 0 -4px 15px rgba(0, 0, 0, 0.5);
}

.touch-confirm-btn {
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.touch-confirm-btn:not(:disabled):active {
  transform: scale(0.97);
}

.font-bold {
  font-weight: 700;
}
.font-extrabold {
  font-weight: 800;
}
.font-black {
  font-weight: 900;
}
.font-mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
}
.price-font {
  font-family: 'Inter', monospace;
  letter-spacing: -0.5px;
}
.line-height-1 {
  line-height: 1.2;
}
</style>
