<template>
  <div
    class="column full-height cart-drawer-root"
    :class="$q.dark.isActive ? 'cart-root--dark' : 'cart-root--light'"
  >
    <!-- Header -->
    <div
      class="row items-center q-pa-md cart-header border-bottom"
      :class="$q.dark.isActive ? 'cart-header--dark' : 'cart-header--light'"
    >
      <div
        class="text-h6 text-weight-bolder"
        :class="$q.dark.isActive ? 'text-white' : 'text-slate-900'"
      >
        Your Order
      </div>
      <q-space />
      <q-btn
        flat
        round
        dense
        icon="close"
        size="sm"
        @click="$emit('close')"
        :class="$q.dark.isActive ? 'text-grey-5 hover-white' : 'text-grey-7 hover-dark'"
      />
    </div>

    <!-- Empty State -->
    <div v-if="cartItems.length === 0" class="col flex flex-center text-center q-pa-xl">
      <div>
        <q-icon
          name="restaurant"
          size="64px"
          :class="$q.dark.isActive ? 'text-grey-8' : 'text-grey-4'"
          class="q-mb-md"
        />
        <div
          class="text-h6 font-bold"
          :class="$q.dark.isActive ? 'text-grey-5' : 'text-grey-8'"
        >
          Your cart is empty
        </div>
        <div
          class="text-caption q-mt-sm"
          :class="$q.dark.isActive ? 'text-grey-7' : 'text-grey-6'"
        >
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
              class="rounded-borders glossy shadow-2"
            />
          </q-item-section>

          <q-item-section>
            <q-item-label
              class="text-subtitle2 text-weight-bold ellipsis-2-lines line-height-1"
              :class="$q.dark.isActive ? 'text-white' : 'text-slate-900'"
              style="font-size: 14px"
              >{{ item.name }}</q-item-label
            >
            <div v-if="item.variant" class="text-caption text-orange q-mt-xs font-bold">
              Size: {{ item.variant }}
            </div>
            <q-item-label caption class="text-primary text-weight-bold q-mt-xs price-font">
              LKR
              {{ Math.round(item.unit_price).toLocaleString('en-LK') }}
            </q-item-label>

            <div class="row items-center q-mt-sm">
              <q-btn
                round
                dense
                unelevated
                :color="$q.dark.isActive ? 'grey-9' : 'grey-3'"
                :text-color="$q.dark.isActive ? 'white' : 'dark'"
                icon="remove"
                size="xs"
                @click="updateQuantity(item.menu_item_id, -1, item.variant)"
              />
              <span
                class="text-weight-bold q-px-md font-mono"
                :class="$q.dark.isActive ? 'text-white' : 'text-slate-900'"
                style="font-size: 15px"
                >{{ item.quantity }}</span
              >
              <q-btn
                round
                dense
                unelevated
                color="primary"
                text-color="white"
                icon="add"
                size="xs"
                @click="updateQuantity(item.menu_item_id, 1, item.variant)"
              />
            </div>

            <!-- Notes input -->
            <q-input
              v-model="item.notes"
              dense
              borderless
              placeholder="Add note (spicy, no onion...)"
              class="q-mt-sm text-caption note-input rounded-borders q-px-sm"
              :class="$q.dark.isActive ? 'bg-grey-10 text-grey-3' : 'bg-grey-2 text-grey-9'"
              style="font-size: 11px"
            />
          </q-item-section>

          <q-item-section side top>
            <div
              class="text-weight-bold price-font"
              :class="$q.dark.isActive ? 'text-white' : 'text-slate-900'"
            >
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
    <div
      class="q-pa-md cart-footer border-top shadow-up"
      :class="$q.dark.isActive ? 'cart-footer--dark' : 'cart-footer--light'"
    >
      <div
        class="row justify-between q-mb-sm text-subtitle2"
        :class="$q.dark.isActive ? 'text-grey-4' : 'text-grey-7'"
      >
        <span>Subtotal ({{ cartItems.length }} items)</span>
        <span class="price-font text-weight-bold">LKR {{ Math.round(subtotal).toLocaleString('en-LK') }}</span>
      </div>
      <div v-if="loyaltyDiscount > 0" class="row justify-between q-mb-sm text-warning font-bold">
        <span>Loyalty Rewards (Tier)</span>
        <span class="price-font"
          >- LKR {{ Math.round(loyaltyDiscount).toLocaleString('en-LK') }}</span
        >
      </div>
      <div
        class="row justify-between q-mb-md text-h5 font-black"
        :class="$q.dark.isActive ? 'text-white' : 'text-slate-900'"
      >
        <span>Total</span>
        <span class="price-font text-primary">LKR {{ Math.round(total).toLocaleString('en-LK') }}</span>
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

const { sessionToken, cartItems, updateQuantity, removeFromCart, clearCart, tableUuid } =
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
    message: `Remove ${item.name}${item.variant ? ' (' + item.variant + ')' : ''} from your order?`,
    dark: true,
    cancel: true,
    persistent: true,
    ok: { color: 'negative', flat: true },
  }).onOk(() => {
    removeFromCart(item.menu_item_id, item.variant)
  })
}

async function submitOrder() {
  if (cartItems.value.length === 0) return

  const items = cartItems.value.map((item) => ({
    menu_item_id: item.menu_item_id,
    variant_id: item.variant_id || null,
    qty: item.quantity,
    notes: item.notes || null,
  }))

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
      let data, error

      let finalTableUuid = tableUuid?.value

      // JIT fallback resolution if no UUID is present
      if (!finalTableUuid) {
        const fallbackTableId =
          localStorage.getItem('tm_table_id') || localStorage.getItem('tm_table')
        if (fallbackTableId) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            fallbackTableId,
          )
          if (isUuid) finalTableUuid = fallbackTableId
          else {
            const { data: tData } = await supabase
              .from('restaurant_tables')
              .select('id')
              .eq('table_number', fallbackTableId)
              .single()
            if (tData) finalTableUuid = tData.id
          }
        }
      }

      // Final fallback: fetch ANY active table to prevent order loss in disconnected/test environments
      if (!finalTableUuid) {
        const { data: anyTable } = await supabase
          .from('restaurant_tables')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .single()
        if (anyTable) finalTableUuid = anyTable.id
      }

      // ── PRIMARY PATH: Session-based (QR or Table Login) ──
      const token =
        sessionStore.sessionToken ||
        sessionToken?.value ||
        localStorage.getItem('tm_session_token') ||
        localStorage.getItem('qr_session_token')

      if (token) {
        console.log('[MenuCartDrawer] Session order path')
        ;({ data, error } = await supabase.rpc('create_order_from_session', {
          p_session_token: token,
          p_items: items,
          p_source: 'qr',
        }))
      } else if (finalTableUuid) {
        // ── FALLBACK PATH: Kiosk mode — use table UUID directly ──
        console.log('[MenuCartDrawer] Kiosk order path → table:', finalTableUuid)
        ;({ data, error } = await supabase.rpc('create_kiosk_order', {
          p_table_id: finalTableUuid,
          p_items: items,
          p_source: 'table_screen',
        }))
      } else {
        $q.notify({ message: 'No table session could be verified.', color: 'negative' })
        submitting.value = false
        return
      }

      if (error) {
        console.error('[MenuCartDrawer] RPC Error:', error)
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
.cart-root--dark {
  background: #0f172a;
  color: #f8fafc;
}
.cart-root--light {
  background: #ffffff;
  color: #0f172a;
}

.cart-header--dark {
  background: rgba(11, 14, 20, 0.98);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.cart-header--light {
  background: rgba(248, 250, 252, 0.98);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.cart-footer--dark {
  background: rgba(11, 14, 20, 0.98);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
}
.cart-footer--light {
  background: #ffffff;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.06);
}

.hover-white:hover {
  color: #fff !important;
  background: rgba(255, 255, 255, 0.1);
}
.hover-dark:hover {
  color: #0f172a !important;
  background: rgba(0, 0, 0, 0.06);
}

.note-input :deep(.q-field__control) {
  min-height: 28px !important;
  height: 28px !important;
}

.touch-confirm-btn {
  border-radius: 14px;
  background: linear-gradient(135deg, #f97316, #ea580c) !important;
  box-shadow: 0 4px 15px rgba(249, 115, 22, 0.4) !important;
  transition: transform 0.2s, box-shadow 0.2s;
  color: #ffffff !important;
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
