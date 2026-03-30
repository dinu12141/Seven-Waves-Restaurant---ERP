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
              <q-icon name="lock" size="56px" color="orange-4" class="q-mb-md" />
              <div class="text-h6 text-white text-weight-bold q-mb-sm">Session Expired</div>
              <div class="text-body2 text-grey-5 q-mb-lg">
                Please enter your access PIN to continue.
              </div>

              <div class="unlock-form q-mb-lg">
                <div class="text-caption text-grey-6 text-left q-mb-xs">Identifier / Phone</div>
                <q-input
                  v-model="reloginIdentifier"
                  dense
                  outlined
                  dark
                  placeholder="e.g. 077... or Code"
                  class="q-mb-sm"
                  :disable="isRelogging"
                />

                <div class="text-caption text-grey-6 text-left q-mb-xs">Security PIN</div>
                <q-input
                  v-model="reloginPin"
                  type="password"
                  dense
                  outlined
                  dark
                  placeholder="••••"
                  maxlength="6"
                  :disable="isRelogging"
                  @keyup.enter="handleRelogin"
                />
              </div>

              <q-btn
                unelevated
                no-caps
                class="go-login-btn full-width"
                :loading="isRelogging"
                @click="handleRelogin"
              >
                <q-icon name="lock_open" class="q-mr-sm" />
                Unlock Menu
              </q-btn>

              <q-btn flat no-caps color="grey-6" class="q-mt-md" size="sm" @click="goLogin">
                Switch to full login
              </q-btn>
            </div>
          </div>
        </transition>

        <!-- ── Top app bar ───────────────────────────────────────────── -->
        <div class="top-bar">
          <div class="top-bar-left">
            <div class="brand-icon">
              <q-icon name="restaurant" size="16px" color="white" />
            </div>
            <div class="top-bar-info">
              <div class="brand-name">SEVEN WAVES</div>
              <div class="top-bar-table">
                <q-icon name="table_restaurant" size="11px" class="q-mr-xs" />
                {{ tableMeta?.table_number ?? 'Table' }}
              </div>
            </div>
          </div>

          <q-space />

          <!-- Session TTL badge -->
          <div v-if="session.remainingSec !== null" class="ttl-badge">
            <q-icon name="timer" size="12px" class="q-mr-xs" />
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
            <q-icon name="stars" size="18px" color="amber" />
            <q-tooltip>My Loyalty Card ({{ customer.pointsBalance }} pts)</q-tooltip>
          </q-btn>
          <!-- Orders button: active + history -->
          <q-btn
            v-if="session.activeOrders.length > 0 || session.orderHistory.length > 0"
            flat
            round
            dense
            class="q-ml-xs"
            id="orders-menu-btn"
          >
            <q-icon name="receipt_long" size="20px" color="white" />
            <q-badge
              v-if="session.activeOrders.length > 0"
              color="red"
              floating
              rounded
              class="cart-badge"
            >
              {{ session.activeOrders.length }}
            </q-badge>
            <q-menu
              anchor="bottom right"
              self="top right"
              dark
              class="orders-menu-popup bg-grey-10"
              style="
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 16px;
                min-width: 280px;
                max-width: 320px;
              "
            >
              <!-- Tabs -->
              <div class="orders-menu-tabs">
                <button
                  class="orders-tab-btn"
                  :class="{ active: ordersTab === 'active' }"
                  @click.stop="ordersTab = 'active'"
                >
                  Active ({{ session.activeOrders.length }})
                </button>
                <button
                  class="orders-tab-btn"
                  :class="{ active: ordersTab === 'history' }"
                  @click.stop="ordersTab = 'history'"
                >
                  History ({{ session.orderHistory.length }})
                </button>
              </div>

              <!-- Active Orders -->
              <q-list v-if="ordersTab === 'active'" style="min-width: 240px">
                <div v-if="session.activeOrders.length === 0" class="orders-empty-state">
                  <q-icon name="check_circle" size="32px" color="green-5" />
                  <div class="text-grey-5 text-caption q-mt-sm">No active orders</div>
                </div>
                <q-item
                  v-for="(oid, idx) in session.activeOrders"
                  :key="oid"
                  clickable
                  v-close-popup
                  @click="
                    $router.push('/table/' + encodeURIComponent(sessionToken) + '/track/' + oid)
                  "
                  class="orders-menu-item"
                >
                  <q-item-section avatar style="min-width: 38px; padding-right: 10px">
                    <div class="order-avatar active-avatar">
                      <q-icon name="timer" color="orange-3" size="17px" />
                    </div>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label
                      class="text-white text-weight-semibold"
                      style="font-size: 0.88rem"
                    >
                      Order #{{ idx + 1 }}
                    </q-item-label>
                    <q-item-label caption class="text-orange-4" style="font-size: 0.72rem">
                      In Progress · Tap to track
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="chevron_right" size="18px" color="grey-6" />
                  </q-item-section>
                </q-item>
              </q-list>

              <!-- Order History -->
              <q-list v-else style="min-width: 240px">
                <div v-if="session.orderHistory.length === 0" class="orders-empty-state">
                  <q-icon name="history" size="32px" color="grey-7" />
                  <div class="text-grey-5 text-caption q-mt-sm">No past orders yet</div>
                </div>
                <q-item
                  v-for="hist in session.orderHistory"
                  :key="hist.id"
                  clickable
                  v-close-popup
                  @click="
                    $router.push('/table/' + encodeURIComponent(sessionToken) + '/track/' + hist.id)
                  "
                  class="orders-menu-item"
                >
                  <q-item-section avatar style="min-width: 38px; padding-right: 10px">
                    <div class="order-avatar history-avatar">
                      <q-icon name="check_circle" color="green-4" size="17px" />
                    </div>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label
                      class="text-white text-weight-semibold"
                      style="font-size: 0.88rem"
                    >
                      Order #{{ hist.order_number ?? '—' }}
                    </q-item-label>
                    <q-item-label caption class="text-green-5" style="font-size: 0.72rem">
                      Paid · LKR
                      {{ hist.total_amount ? Number(hist.total_amount).toLocaleString() : '—' }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="chevron_right" size="18px" color="grey-6" />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>

          <!-- Active Order Progress (Mini Tracker) -->
          <div
            v-if="session.activeOrders && session.activeOrders.length > 0"
            class="mini-tracker-wrap"
          >
            <div
              class="mini-tracker"
              @click="
                $router.push(
                  '/table/' +
                    encodeURIComponent(sessionToken) +
                    '/track/' +
                    session.activeOrders[session.activeOrders.length - 1],
                )
              "
            >
              <span class="pulse-dot"></span>
              <span class="mini-tracker-label mobile-hide">In Progress</span>
              <q-icon name="chevron_right" size="12px" color="orange-4" />
            </div>
          </div>

          <!-- Cart icon -->
          <q-btn flat round dense class="cart-btn q-ml-xs" @click="cartOpen = true">
            <q-icon name="shopping_basket" size="20px" color="white" />
            <q-badge v-if="cartItemCount > 0" color="orange" floating rounded class="cart-badge">
              {{ cartItemCount }}
            </q-badge>
          </q-btn>
        </div>

        <!-- Hero removed for better vertical space -->

        <!-- ── Sticky search + categories ───────────────────────────── -->
        <div class="sticky-bar">
          <div class="search-bar-wrap">
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

          <div class="category-scroll">
            <div class="category-track">
              <button
                v-for="cat in categories"
                :key="cat.name"
                class="cat-pill"
                :class="{ active: selectedCategory === cat.name }"
                @click="selectedCategory = cat.name"
              >
                <div class="cat-img-wrapper">
                  <img v-if="cat.image" :src="cat.image" class="cat-img" />
                  <div v-else class="cat-img-placeholder">
                    <q-icon name="restaurant" size="16px" color="grey-6" />
                  </div>
                </div>
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
        <div v-else class="menu-content q-pb-xl">
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
      :width="$q.screen.lt.sm ? $q.screen.width : 360"
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

      <!-- Active order context banner -->
      <div
        v-if="session.activeOrders && session.activeOrders.length > 0"
        class="add-to-bill-banner"
      >
        <q-icon name="receipt_long" size="16px" class="q-mr-xs" />
        <span class="text-caption text-weight-medium">
          You have {{ session.activeOrders.length }} active order{{
            session.activeOrders.length > 1 ? 's' : ''
          }}
          on this table
        </span>
      </div>

      <q-scroll-area class="cart-scroll">
        <template v-if="cartItems.length === 0">
          <div class="empty-cart column items-center q-pa-xl">
            <q-icon name="shopping_basket" size="48px" color="grey-7" />
            <div class="text-grey-6 q-mt-md text-body2">Your cart is empty</div>
            <div
              v-if="session.activeOrders && session.activeOrders.length > 0"
              class="text-caption text-grey-7 q-mt-sm text-center"
            >
              Add items from the menu to place a new order or add to your existing bill
            </div>
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

        <!-- If there's an active order: show Add to Bill + New Order -->
        <template v-if="session.activeOrders && session.activeOrders.length > 0">
          <!-- Add to most recent order -->
          <q-btn
            unelevated
            no-caps
            class="add-bill-btn full-width q-mb-sm"
            :loading="addingToBill"
            @click="addToBill"
          >
            <q-icon name="add_shopping_cart" class="q-mr-sm" />
            Add to Current Bill
            <template #loading>
              <q-spinner-dots color="white" size="1.5em" />
            </template>
          </q-btn>
          <!-- Or place as a brand new order -->
          <q-btn
            unelevated
            no-caps
            outline
            class="place-order-btn-outline full-width"
            :loading="placingOrder"
            @click="placeOrder"
          >
            <q-icon name="receipt_long" class="q-mr-sm" />
            New Separate Order
            <template #loading>
              <q-spinner-dots color="white" size="1.5em" />
            </template>
          </q-btn>
        </template>

        <!-- No active order: just place order -->
        <q-btn
          v-else
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
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

// ── Orders tab state (for the orders dropdown menu) ──────────────────────────
const ordersTab = ref('active')

// ── Realtime order subscription ───────────────────────────────────────────────
let ordersChannel = null

/** Subscribe to changes on the customer's active orders.
 *  When an order becomes 'paid' or 'cancelled', move it to history. */
function subscribeToActiveOrders() {
  if (ordersChannel) {
    supabase.removeChannel(ordersChannel)
    ordersChannel = null
  }
  if (!session.activeOrders || session.activeOrders.length === 0) return

  ordersChannel = supabase
    .channel('customer-active-orders-' + Date.now())
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      async (payload) => {
        const updatedOrder = payload.new
        if (!updatedOrder) return
        const orderId = updatedOrder.id

        // Only process orders we're tracking
        if (!session.activeOrders.includes(orderId)) return

        const status = updatedOrder.status
        if (status === 'paid' || status === 'cancelled') {
          session.moveOrderToHistory({
            id: orderId,
            order_number: updatedOrder.order_number,
            total_amount: updatedOrder.total_amount,
            paid_at: updatedOrder.updated_at,
          })

          if (status === 'paid') {
            $q.notify({
              type: 'positive',
              icon: 'check_circle',
              message: `Order #${updatedOrder.order_number} has been paid! Thank you! 🎉`,
              position: 'top',
              timeout: 5000,
            })
          }

          // Re-subscribe for remaining active orders
          subscribeToActiveOrders()
        }
      },
    )
    .subscribe()
}

// Re-subscribe whenever activeOrders changes
watch(
  () => [...(session.activeOrders || [])],
  (newOrders, oldOrders) => {
    if (newOrders.length !== oldOrders?.length) {
      subscribeToActiveOrders()
    }
  },
)

// ── Cart state ────────────────────────────────────────────────────────────────
const cartItems = ref([])
const cartOpen = ref(false)

// ── Relogin logic ─────────────────────────────────────────────────────────────
const reloginIdentifier = ref(session.savedDeviceCode || '')
const reloginPin = ref('')
const isRelogging = ref(false)

async function handleRelogin() {
  if (!reloginIdentifier.value || !reloginPin.value) return
  isRelogging.value = true
  try {
    const { loginWithDeviceCode } = await import('src/services/tableAuthService')
    const result = await loginWithDeviceCode(reloginIdentifier.value, reloginPin.value)

    if (result.success && result.session_token) {
      session.setSession(result)
      // If code changed, remember it
      if (reloginIdentifier.value !== session.savedDeviceCode) {
        session.rememberDeviceCode(reloginIdentifier.value)
      }
      $q.notify({ type: 'positive', message: 'Menu unlocked!', position: 'top' })
      reloginPin.value = ''
    } else {
      throw new Error(result.error || 'Invalid identifier or PIN')
    }
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err.message || 'Unlock failed',
      position: 'top',
    })
  } finally {
    isRelogging.value = false
  }
}
const placingOrder = ref(false)
const addingToBill = ref(false)

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
    const { data: subCatData } = await supabase
      .from('menu_sub_categories')
      .select('*, categories(name, icon)')
      .eq('is_active', true)
      .order('sort_order')

    if (subCatData) {
      categories.value = [
        {
          name: 'All',
          image:
            'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/cat_all.png',
          id: 'all',
        },
        ...subCatData.map((sc) => ({ name: sc.name, image: sc.image_url, id: sc.id })),
      ]
    }

    const { data: itemData } = await supabase
      .from('menu_items')
      .select('*')
      .eq('is_available', true)
      .order('sort_order')

    if (itemData) {
      menuItems.value = itemData.map((i) => {
        const subCat = subCatData?.find((sc) => sc.id === i.sub_category_id)
        return {
          id: i.id,
          name: i.name,
          description: i.description ?? '',
          price: Number(i.base_price),
          category: subCat ? subCat.name : 'Other',
          image:
            i.image_url ||
            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=600&h=450&fit=crop',
          kitchen_id: i.kitchen_id,
        }
      })
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
      if (typeof result.error === 'string' && result.error.includes('session')) {
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

    // Remember in local session for tracking
    if (placedOrderId) {
      session.addActiveOrder(placedOrderId)
    }

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

// ── Add items to existing bill ────────────────────────────────────────────────
async function addToBill() {
  const activeOrders = session.activeOrders
  if (!activeOrders || activeOrders.length === 0 || cartItems.value.length === 0) return
  // Use the most recent active order (last in array)
  const targetOrderId = activeOrders[activeOrders.length - 1]

  addingToBill.value = true
  try {
    const items = cartItems.value.map((i) => ({
      menu_item_id: i.id,
      qty: i.qty,
    }))

    const { data, error } = await supabase.rpc('add_items_to_order', {
      p_order_id: targetOrderId,
      p_session_token: session.sessionToken,
      p_items: items,
    })

    if (error) throw new Error(error.message)
    if (!data?.success) throw new Error(data?.error || 'Failed to add items')

    cartItems.value = []
    cartOpen.value = false

    $q.notify({
      type: 'info',
      icon: 'add_shopping_cart',
      message: `${data.items_added} item(s) added to bill`,
      position: 'bottom',
      timeout: 2000,
      classes: 'compact-notify',
    })
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: (err && err.message) || 'Failed to add items to bill.',
      position: 'top',
    })
  } finally {
    addingToBill.value = false
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
  // Start watching active orders for payment
  subscribeToActiveOrders()
})

onUnmounted(() => {
  // Heartbeat continues until session.clearSession() is called
  if (ordersChannel) {
    supabase.removeChannel(ordersChannel)
    ordersChannel = null
  }
})
</script>

<style lang="scss" scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

// ── Orders Menu Popup ─────────────────────────────────────────────────────────
.orders-menu-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  padding: 0 4px;
}
.orders-tab-btn {
  flex: 1;
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 10px 8px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  font-family: 'Inter', sans-serif;
  letter-spacing: 0.3px;

  &.active {
    color: #fb923c;
    border-bottom-color: #f97316;
  }
  &:hover:not(.active) {
    color: #e5e7eb;
  }
}

.orders-menu-item {
  border-radius: 10px;
  margin: 3px 6px;
  transition: background 0.15s;
  &:hover {
    background: rgba(255, 255, 255, 0.05) !important;
  }
}

.order-avatar {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;

  &.active-avatar {
    background: rgba(251, 146, 60, 0.12);
    border: 1px solid rgba(251, 146, 60, 0.2);
  }
  &.history-avatar {
    background: rgba(52, 211, 153, 0.1);
    border: 1px solid rgba(52, 211, 153, 0.18);
  }
}

.orders-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px;
}

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
  padding: 0 12px;
  height: 56px;
  background: rgba(13, 13, 20, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  gap: 4px;

  @media (min-width: 600px) {
    padding: 0 20px;
    height: 62px;
  }
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.brand-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: linear-gradient(135deg, #f97316, #ef4444);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
  flex-shrink: 0;

  @media (min-width: 600px) {
    width: 38px;
    height: 38px;
    border-radius: 10px;
  }
}

.brand-name {
  font-size: 0.5rem;
  font-weight: 800;
  letter-spacing: 3px;
  color: #fb923c;
  line-height: 1;

  @media (min-width: 400px) {
    font-size: 0.55rem;
    letter-spacing: 3.5px;
  }
}

.top-bar-table {
  font-size: 0.88rem;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  margin-top: 2px;
}

.mini-tracker-wrap {
  flex-shrink: 1;
  min-width: 0;
}

.mini-tracker {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(249, 115, 22, 0.1);
  border: 1px solid rgba(249, 115, 22, 0.2);
  padding: 4px 8px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    background: rgba(249, 115, 22, 0.15);
    border-color: rgba(249, 115, 22, 0.4);
  }
}

.mini-tracker-label {
  font-size: 0.65rem;
  font-weight: 700;
  color: #fb923c;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.mobile-hide {
  @media (max-width: 400px) {
    display: none;
  }
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background: #fb923c;
  border-radius: 50%;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    background: #fb923c;
    opacity: 0.4;
    animation: pulse 1.5s infinite;
  }
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.4;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}

:deep(.compact-notify) {
  min-height: 36px;
  border-radius: 8px;
  font-size: 0.75rem;
  background: rgba(30, 30, 45, 0.95);
  backdrop-filter: blur(8px);
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
  top: 56px;
  z-index: 100;
  background: rgba(13, 13, 20, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);

  @media (min-width: 600px) {
    top: 62px;
  }
}

.search-bar-wrap {
  padding: 10px 12px 6px;

  @media (min-width: 600px) {
    padding: 12px 16px 8px;
  }
}

.search-input {
  :deep(.q-field__control) {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 14px;
  }
  :deep(.q-field__native) {
    font-size: 0.9rem;
  }
}

.category-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  padding: 0 12px 10px;

  @media (min-width: 600px) {
    padding: 0 16px 12px;
  }

  &::-webkit-scrollbar {
    display: none;
  }
}

.category-track {
  display: flex;
  gap: 7px;
  width: max-content;

  @media (min-width: 600px) {
    gap: 10px;
  }
}

.cat-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 6px 6px 8px;
  width: 72px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.03);
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.22s ease;
  font-family: 'Inter', sans-serif;
  -webkit-tap-highlight-color: transparent;

  @media (min-width: 400px) {
    width: 78px;
  }
  @media (min-width: 600px) {
    width: 88px;
    gap: 8px;
    padding: 7px 7px 10px;
  }

  &:active {
    transform: scale(0.95);
  }

  @media (hover: hover) {
    &:hover {
      background: rgba(255, 255, 255, 0.07);
      color: white;
    }
  }

  &.active {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.18), rgba(239, 68, 68, 0.1));
    border-color: rgba(249, 115, 22, 0.5);
    color: #fb923c;
  }
}

.cat-img-wrapper {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a24;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

.cat-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cat-img-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.02);
}

.cat-label {
  font-size: 0.65rem;
  font-weight: 600;
  text-align: center;
  line-height: 1.15;
  max-width: 100%;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;

  @media (min-width: 400px) {
    font-size: 0.68rem;
  }
  @media (min-width: 600px) {
    font-size: 0.72rem;
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
  padding-top: 14px;
  padding-left: 12px;
  padding-right: 12px;

  @media (min-width: 420px) {
    padding-left: 14px;
    padding-right: 14px;
  }
  @media (min-width: 600px) {
    padding-top: 20px;
    padding-left: 20px;
    padding-right: 20px;
  }
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
  gap: 10px;

  @media (min-width: 420px) {
    gap: 12px;
  }
  @media (min-width: 600px) {
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  @media (min-width: 900px) {
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  @media (min-width: 1200px) {
    grid-template-columns: repeat(5, 1fr);
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
  padding: 0 18px;
  height: 50px;
  font-size: 0.875rem;
  box-shadow: 0 8px 28px rgba(249, 115, 22, 0.55);
  min-width: 240px;
  max-width: calc(100vw - 40px);

  @media (min-width: 500px) {
    min-width: 280px;
    height: 52px;
    font-size: 0.9rem;
  }
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
  padding: 14px 16px 12px;
}

.cart-scroll {
  height: calc(100dvh - 220px);

  @media (max-width: 599px) {
    height: calc(100dvh - 230px);
  }
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

// ── Add to Bill elements ──────────────────────────────────────────────────────
.add-to-bill-banner {
  display: flex;
  align-items: center;
  background: rgba(249, 115, 22, 0.08);
  border-bottom: 1px solid rgba(249, 115, 22, 0.15);
  color: #fb923c;
  padding: 8px 16px;
  font-size: 0.8rem;
}

.add-bill-btn {
  background: linear-gradient(135deg, #1d4ed8, #3b82f6) !important;
  color: white !important;
  border-radius: 12px;
  height: 48px;
  font-weight: 700;
  font-size: 0.95rem;
  box-shadow: 0 6px 22px rgba(59, 130, 246, 0.4);
}

.place-order-btn-outline {
  border: 2px solid rgba(249, 115, 22, 0.5) !important;
  color: #fb923c !important;
  border-radius: 12px;
  height: 48px;
  font-weight: 700;
  font-size: 0.9rem;
}

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
