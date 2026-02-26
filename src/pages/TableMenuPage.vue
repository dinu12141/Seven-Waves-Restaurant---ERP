<template>
  <q-layout class="table-menu-root">
    <q-page-container>
      <q-page>
        <!-- ── Animated background ───────────────────────────────────── -->
        <div class="bg-layer">
          <div class="bg-orb bg-orb--1" />
          <div class="bg-orb bg-orb--2" />
        </div>

        <!-- ── Session expired overlay ──────────────────────────────── -->
        <transition name="fade">
          <div v-if="session.sessionExpired" class="expired-overlay">
            <div class="expired-card">
              <q-icon name="timer_off" size="56px" color="orange-4" class="q-mb-md" />
              <div class="text-h6 text-white text-weight-bold q-mb-sm">Session Expired</div>
              <div class="text-body2 text-grey-5 q-mb-xl">
                Your table session has ended. Please login again.
              </div>
              <q-btn unelevated no-caps class="go-login-btn" @click="goLogin">
                <q-icon name="login" class="q-mr-sm" />
                Back to Login
              </q-btn>
            </div>
          </div>
        </transition>

        <!-- ── Top app bar ───────────────────────────────────────────── -->
        <div class="top-bar">
          <div class="top-bar-left">
            <div class="brand-icon">
              <q-icon name="restaurant" size="18px" color="white" />
            </div>
            <div class="top-bar-info">
              <div class="brand-name">SEVEN WAVES</div>
              <div class="top-bar-table">
                <q-icon name="table_restaurant" size="12px" class="q-mr-xs" />
                {{ tableMeta?.table_number ?? 'Your Table' }}
              </div>
            </div>
          </div>

          <q-space />

          <!-- Session TTL badge -->
          <div v-if="session.remainingSec !== null" class="ttl-badge">
            <q-icon name="timer" size="13px" class="q-mr-xs" />
            {{ ttlLabel }}
          </div>

          <!-- Loyalty card button (when customer logged in) -->
          <q-btn
            v-if="customer.isLoggedIn"
            flat
            round
            dense
            class="loyalty-btn q-ml-xs"
            @click="$router.push('/loyalty')"
          >
            <q-icon name="stars" size="20px" color="amber" />
            <q-tooltip>My Loyalty Card ({{ customer.pointsBalance }} pts)</q-tooltip>
          </q-btn>

          <!-- Cart icon -->
          <q-btn flat round dense class="cart-btn q-ml-sm" @click="cartOpen = true">
            <q-icon name="shopping_basket" size="22px" color="white" />
            <q-badge v-if="cartItemCount > 0" color="orange" floating rounded class="cart-badge">
              {{ cartItemCount }}
            </q-badge>
          </q-btn>
        </div>

        <!-- Hero removed for better vertical space -->

        <!-- ── Sticky search + categories ───────────────────────────── -->
        <div class="sticky-bar">
          <div class="q-px-md q-pt-sm q-pb-xs">
            <q-input
              v-model="search"
              placeholder="Search dishes, drinks..."
              dense
              outlined
              dark
              rounded
              clearable
              class="search-input"
            >
              <template #prepend>
                <q-icon name="search" color="orange-5" />
              </template>
            </q-input>
          </div>

          <div class="category-scroll q-px-md q-pb-sm">
            <div class="category-track">
              <button
                v-for="cat in categories"
                :key="cat.name"
                class="cat-pill"
                :class="{ active: selectedCategory === cat.name }"
                @click="selectedCategory = cat.name"
              >
                <span class="cat-icon">{{ cat.emoji }}</span>
                <span class="cat-label">{{ cat.name }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- ── Loading state ─────────────────────────────────────────── -->
        <div v-if="loading" class="loading-state">
          <q-spinner-dots color="orange" size="48px" />
          <div class="text-grey-5 q-mt-md text-body2">Loading menu…</div>
        </div>

        <!-- ── Menu grid ─────────────────────────────────────────────── -->
        <div v-else class="menu-content q-px-md q-pb-xl">
          <!-- Grouped by category (All + no search) -->
          <template v-if="selectedCategory === 'All' && !search">
            <div v-for="group in groupedItems" :key="group.name" class="category-group q-mb-xl">
              <div class="category-header q-mb-md">
                <span class="cat-emoji-big">{{ getCatEmoji(group.name) }}</span>
                <div class="q-ml-sm">
                  <div class="text-subtitle1 text-white text-weight-bold">{{ group.name }}</div>
                  <div class="text-caption text-grey-6">{{ group.items.length }} items</div>
                </div>
              </div>
              <div class="menu-grid">
                <MenuItemCard
                  v-for="item in group.items"
                  :key="item.id"
                  :product="item"
                  :cart-qty="getItemQty(item.id)"
                  @add="addToCart(item)"
                  @remove="removeFromCart(item)"
                />
              </div>
            </div>
          </template>

          <!-- Filtered mode -->
          <template v-else>
            <div class="text-caption text-grey-6 q-mb-md q-mt-sm">
              <span v-if="search">
                Results for "<b class="text-white">{{ search }}</b
                >"
              </span>
              <span v-else>{{ selectedCategory }}</span>
              · {{ filteredItems.length }} items
            </div>
            <div class="menu-grid">
              <MenuItemCard
                v-for="item in filteredItems"
                :key="item.id"
                :product="item"
                :cart-qty="getItemQty(item.id)"
                @add="addToCart(item)"
                @remove="removeFromCart(item)"
              />
            </div>
            <div v-if="filteredItems.length === 0" class="empty-state">
              <div style="font-size: 44px">🍽️</div>
              <div class="text-subtitle1 text-grey-5 q-mt-md">Nothing found</div>
              <q-btn
                flat
                color="orange"
                no-caps
                label="Clear filters"
                class="q-mt-sm"
                @click="resetFilters"
              />
            </div>
          </template>

          <div style="height: 100px" />
        </div>

        <!-- ── Cart FAB ───────────────────────────────────────────────── -->
        <transition name="cart-fab">
          <q-page-sticky v-if="cartItemCount > 0" position="bottom" :offset="[0, 20]">
            <q-btn unelevated no-caps class="cart-fab-btn" @click="cartOpen = true">
              <q-badge color="white" text-color="orange" class="q-mr-sm q-px-sm">
                {{ cartItemCount }}
              </q-badge>
              <span class="text-weight-bold">View Order</span>
              <q-space class="q-mx-sm" />
              <span class="text-weight-bold">LKR {{ cartSubtotal.toLocaleString() }}</span>
              <q-icon name="chevron_right" class="q-ml-xs" />
            </q-btn>
          </q-page-sticky>
        </transition>
      </q-page>
    </q-page-container>

    <!-- ── Cart drawer ────────────────────────────────────────────── -->
    <q-drawer
      v-model="cartOpen"
      side="right"
      :width="360"
      dark
      class="cart-drawer"
      overlay
      behavior="mobile"
    >
      <div class="cart-header">
        <div class="text-subtitle1 text-white text-weight-bold">Your Order</div>
        <q-btn flat round dense icon="close" color="grey-5" @click="cartOpen = false" />
      </div>

      <q-separator dark />

      <q-scroll-area class="cart-scroll">
        <template v-if="cartItems.length === 0">
          <div class="empty-cart column items-center q-pa-xl">
            <q-icon name="shopping_basket" size="48px" color="grey-7" />
            <div class="text-grey-6 q-mt-md text-body2">Your cart is empty</div>
          </div>
        </template>

        <div v-else class="q-pa-md">
          <div v-for="(item, idx) in cartItems" :key="idx" class="cart-item">
            <div class="cart-item-name text-white text-weight-medium">{{ item.name }}</div>
            <div class="cart-item-price text-grey-5 text-caption">
              LKR {{ item.unitPrice.toLocaleString() }} × {{ item.qty }}
            </div>
            <div class="cart-item-total text-orange text-weight-bold">
              LKR {{ (item.unitPrice * item.qty).toLocaleString() }}
            </div>
            <div class="cart-item-controls">
              <q-btn
                flat
                round
                dense
                icon="remove"
                size="sm"
                color="grey-5"
                @click="decrementCart(idx)"
              />
              <span class="text-white text-body2 q-mx-xs">{{ item.qty }}</span>
              <q-btn
                flat
                round
                dense
                icon="add"
                size="sm"
                color="orange"
                @click="incrementCart(idx)"
              />
            </div>
          </div>
        </div>
      </q-scroll-area>

      <div v-if="cartItems.length > 0" class="cart-footer">
        <div class="row justify-between items-center q-mb-md">
          <span class="text-grey-5 text-body2">Subtotal</span>
          <span class="text-white text-weight-bold text-subtitle1">
            LKR {{ cartSubtotal.toLocaleString() }}
          </span>
        </div>
        <q-btn
          unelevated
          no-caps
          class="place-order-btn full-width"
          :loading="placingOrder"
          @click="placeOrder"
        >
          <q-icon name="receipt_long" class="q-mr-sm" />
          Place Order
          <template #loading>
            <q-spinner-dots color="white" size="1.5em" />
          </template>
        </q-btn>
      </div>
    </q-drawer>
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useTableSessionStore } from 'src/stores/tableSessionStore'
import { useCustomerStore } from 'src/stores/customerStore'
import { createOrderFromSession } from 'src/services/tableAuthService'
import MenuItemCard from 'src/components/customer/MenuItemCard.vue'

// ── Composables ────────────────────────────────────────────────────────────────
const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const session = useTableSessionStore()
const customer = useCustomerStore()

// ── Route param ───────────────────────────────────────────────────────────────
const sessionToken = computed(() => decodeURIComponent(String(route.params.sessionToken || '')))

// ── Table meta ────────────────────────────────────────────────────────────────
const tableMeta = ref(null)

// ── Menu state ────────────────────────────────────────────────────────────────
const loading = ref(true)
const search = ref('')
const selectedCategory = ref('All')
const menuItems = ref([])
const categories = ref([{ name: 'All', emoji: '🍽️' }])

// ── Cart state ────────────────────────────────────────────────────────────────
const cartItems = ref([])
const cartOpen = ref(false)
const placingOrder = ref(false)

// ── Cart computed ─────────────────────────────────────────────────────────────
const cartItemCount = computed(() => cartItems.value.reduce((s, i) => s + i.qty, 0))
const cartSubtotal = computed(() => cartItems.value.reduce((s, i) => s + i.unitPrice * i.qty, 0))

// ── TTL label ─────────────────────────────────────────────────────────────────
const ttlLabel = computed(() => {
  const sec = session.remainingSec
  if (sec === null) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
})

// ── Guard ─────────────────────────────────────────────────────────────────────
function guardSession() {
  if (!session.isAuthenticated) {
    router.replace('/table-login')
    return false
  }
  if (session.sessionToken && sessionToken.value !== session.sessionToken) {
    router.replace('/table-login')
    return false
  }
  return true
}

// ── Load table meta ───────────────────────────────────────────────────────────
async function loadTableMeta() {
  if (!session.tableId) return
  const { data } = await supabase
    .from('restaurant_tables')
    .select('table_number, section')
    .eq('id', session.tableId)
    .single()
  if (data) tableMeta.value = data
}

// ── Load menu ─────────────────────────────────────────────────────────────────
async function loadMenu() {
  loading.value = true
  try {
    const { data: catData } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (catData) {
      categories.value = [
        { name: 'All', emoji: '🍽️' },
        ...catData.map((c) => ({ name: c.name, emoji: '🍴', id: c.id })),
      ]
    }

    const { data: itemData } = await supabase
      .from('menu_items')
      .select('*')
      .eq('is_available', true)
      .order('sort_order')

    if (itemData) {
      menuItems.value = itemData.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description ?? '',
        price: Number(i.base_price),
        category: catData
          ? (catData.find((c) => c.id === i.category_id) || {}).name || 'Other'
          : 'Other',
        image:
          i.image_url ||
          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=600&h=450&fit=crop',
        kitchen_id: i.kitchen_id,
      }))
    }
  } catch (e) {
    console.error('[TableMenu] loadMenu error:', e)
  } finally {
    loading.value = false
  }
}

// ── Filtered / grouped ────────────────────────────────────────────────────────
const filteredItems = computed(() =>
  menuItems.value.filter((item) => {
    const matchSearch =
      !search.value ||
      item.name.toLowerCase().includes(search.value.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.value.toLowerCase()))
    const matchCat = selectedCategory.value === 'All' || item.category === selectedCategory.value
    return matchSearch && matchCat
  }),
)

const groupedItems = computed(() => {
  const map = {}
  menuItems.value.forEach((item) => {
    if (!map[item.category]) map[item.category] = []
    map[item.category].push(item)
  })
  return categories.value
    .filter((c) => c.name !== 'All' && map[c.name])
    .map((c) => ({ name: c.name, items: map[c.name] }))
})

function getCatEmoji(name) {
  const cat = categories.value.find((c) => c.name === name)
  return cat ? cat.emoji : '🍽️'
}

function resetFilters() {
  search.value = ''
  selectedCategory.value = 'All'
}

// ── Cart helpers ──────────────────────────────────────────────────────────────
function getItemQty(id) {
  const found = cartItems.value.find((i) => i.id === id)
  return found ? found.qty : 0
}

function addToCart(item) {
  const existing = cartItems.value.find((i) => i.id === item.id)
  if (existing) {
    existing.qty++
  } else {
    cartItems.value.push({ id: item.id, name: item.name, unitPrice: item.price, qty: 1 })
  }
}

function removeFromCart(item) {
  const idx = cartItems.value.findIndex((i) => i.id === item.id)
  if (idx === -1) return
  if (cartItems.value[idx].qty > 1) {
    cartItems.value[idx].qty--
  } else {
    cartItems.value.splice(idx, 1)
  }
}

function decrementCart(idx) {
  if (cartItems.value[idx].qty > 1) {
    cartItems.value[idx].qty--
  } else {
    cartItems.value.splice(idx, 1)
  }
}

function incrementCart(idx) {
  cartItems.value[idx].qty++
}

// ── Place order ───────────────────────────────────────────────────────────────
// Uses create_order_from_session RPC — session is validated server-side,
// prices re-confirmed from DB, table/branch resolved from session (not client).
async function placeOrder() {
  if (!session.sessionToken || cartItems.value.length === 0) return
  placingOrder.value = true

  try {
    const source = session.savedDeviceCode ? 'table_screen' : 'qr'

    const items = cartItems.value.map((i) => ({
      menu_item_id: i.id,
      qty: i.qty,
    }))

    const result = await createOrderFromSession(session.sessionToken, items, source)

    if (!result.success) {
      if (result.error && result.error.includes('session')) {
        session.sessionExpired = true
      }
      throw new Error(result.error || 'Order failed')
    }

    // Attach customer_id to order if customer is logged in
    if (result.order_id && customer.customerId) {
      await supabase
        .from('orders')
        .update({ customer_id: customer.customerId })
        .eq('id', result.order_id)
    }

    const placedOrderId = result.order_id
    cartItems.value = []
    cartOpen.value = false

    $q.notify({
      type: 'positive',
      message: '🎉 Order placed! Your waiter will be with you soon.',
      position: 'top',
      timeout: 4000,
      actions: placedOrderId
        ? [
            {
              label: 'Track Order',
              color: 'white',
              handler: () =>
                router.push(
                  '/table/' + encodeURIComponent(session.sessionToken) + '/track/' + placedOrderId,
                ),
            },
          ]
        : undefined,
    })
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: (err && err.message) || 'Failed to place order. Please try again.',
      position: 'top',
    })
  } finally {
    placingOrder.value = false
  }
}

// ── Navigate to login ─────────────────────────────────────────────────────────
function goLogin() {
  session.clearSession()
  router.replace('/table-login')
}

onMounted(async () => {
  if (!guardSession()) return
  await Promise.all([loadTableMeta(), loadMenu()])
})

onUnmounted(() => {
  // Heartbeat continues until session.clearSession() is called
})
</script>

<style lang="scss" scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

// ── Root ──────────────────────────────────────────────────────────────────────
.table-menu-root {
  background: #0d0d14;
  min-height: 100dvh;
  font-family: 'Inter', 'Roboto', sans-serif;
  position: relative;
}

// ── Background ────────────────────────────────────────────────────────────────
.bg-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.1;
  &--1 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #f97316 0%, transparent 70%);
    top: -200px;
    left: -200px;
  }
  &--2 {
    width: 380px;
    height: 380px;
    background: radial-gradient(circle, #ef4444 0%, transparent 70%);
    bottom: -100px;
    right: -100px;
  }
}

// ── Top bar ───────────────────────────────────────────────────────────────────
.top-bar {
  position: sticky;
  top: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 62px;
  background: rgba(13, 13, 20, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f97316, #ef4444);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(249, 115, 22, 0.45);
  flex-shrink: 0;
}

.brand-name {
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 3.5px;
  color: #fb923c;
  line-height: 1;
}

.top-bar-table {
  font-size: 0.88rem;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  margin-top: 2px;
}

.ttl-badge {
  display: flex;
  align-items: center;
  font-size: 0.72rem;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 4px 10px;
}

.cart-btn {
  color: white !important;
}

.cart-badge {
  font-size: 0.62rem;
  font-weight: 700;
  min-width: 17px;
  min-height: 17px;
}

// ── Hero ──────────────────────────────────────────────────────────────────────
// Hero styles removed

// ── Sticky bar ────────────────────────────────────────────────────────────────
.sticky-bar {
  position: sticky;
  top: 62px;
  z-index: 100;
  background: rgba(13, 13, 20, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.search-input {
  :deep(.q-field__control) {
    background: rgba(255, 255, 255, 0.05);
  }
}

.category-scroll {
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

.category-track {
  display: flex;
  gap: 8px;
  width: max-content;
  padding-bottom: 2px;
}

.cat-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: #9ca3af;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.22s ease;
  white-space: nowrap;
  font-family: 'Inter', sans-serif;

  &:hover {
    background: rgba(255, 255, 255, 0.07);
    color: white;
  }
  &.active {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.25), rgba(239, 68, 68, 0.2));
    border-color: rgba(249, 115, 22, 0.4);
    color: #fb923c;
    font-weight: 600;
  }
}

// ── Loading ────────────────────────────────────────────────────────────────
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
}

// ── Menu content ──────────────────────────────────────────────────────────────
.menu-content {
  padding-top: 16px;
}

.category-header {
  display: flex;
  align-items: center;
}

.cat-emoji-big {
  font-size: 1.8rem;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  flex-shrink: 0;
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;

  @media (min-width: 600px) {
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  @media (min-width: 900px) {
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
}

.empty-state {
  text-align: center;
  padding: 64px 16px;
}

// ── Cart FAB ──────────────────────────────────────────────────────────────────
.cart-fab-btn {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  color: white !important;
  border-radius: 30px;
  padding: 0 20px;
  height: 52px;
  font-size: 0.9rem;
  box-shadow: 0 8px 30px rgba(249, 115, 22, 0.5);
  min-width: 280px;
  max-width: 90vw;
}

.cart-fab-enter-active,
.cart-fab-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cart-fab-enter-from,
.cart-fab-leave-to {
  transform: translateY(80px);
  opacity: 0;
}

// ── Cart drawer ───────────────────────────────────────────────────────────────
.cart-drawer {
  background: #111117 !important;
  border-left: 1px solid rgba(255, 255, 255, 0.07);
}

.cart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
}

.cart-scroll {
  height: calc(100dvh - 180px);
}

.cart-item {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 2px 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  &:last-child {
    border-bottom: none;
  }
}

.cart-item-name {
  grid-column: 1;
  grid-row: 1;
  font-size: 0.9rem;
}
.cart-item-price {
  grid-column: 1;
  grid-row: 2;
}
.cart-item-total {
  grid-column: 2;
  grid-row: 1;
  text-align: right;
  font-size: 0.9rem;
}
.cart-item-controls {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.cart-footer {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.place-order-btn {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  color: white !important;
  border-radius: 12px;
  height: 48px;
  font-weight: 700;
  font-size: 0.95rem;
  box-shadow: 0 6px 22px rgba(249, 115, 22, 0.4);
}

// ── Session expired overlay ───────────────────────────────────────────────────
.expired-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(7, 7, 15, 0.88);
  backdrop-filter: blur(20px);
}

.expired-card {
  text-align: center;
  padding: 48px 40px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  background: rgba(14, 14, 24, 0.9);
  max-width: 360px;
  width: 100%;
}

.go-login-btn {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  color: white !important;
  border-radius: 12px;
  height: 46px;
  font-weight: 700;
  padding: 0 28px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
