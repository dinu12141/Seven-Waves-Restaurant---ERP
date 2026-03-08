<template>
  <q-layout view="hHh lpR fFf" class="touch-menu-layout">
    <q-header class="touch-menu-header" elevated>
      <q-toolbar class="q-px-md q-py-xs">
        <!-- Brand -->
        <div class="header-logo row items-center no-wrap">
          <q-icon name="restaurant_menu" size="28px" color="primary" class="q-mr-sm" />
          <div class="column justify-center">
            <span class="header-brand">Seven Waves</span>
            <span class="header-table text-primary text-weight-bold">
              Table: {{ tableId || 'Menu' }}
            </span>
          </div>
        </div>

        <q-space />

        <div class="header-actions row items-center no-wrap q-gutter-x-sm">
          <!-- Not logged in: Login button -->
          <q-btn
            v-if="!customerStore.isLoggedIn"
            outline
            color="primary"
            icon="person_add"
            label="Sign In"
            class="touch-btn touch-btn-login"
            size="sm"
            @click="goToAuth"
          />

          <!-- Logged in: Customer loyalty badge -->
          <div
            v-else
            class="loyalty-badge row items-center q-px-sm q-py-xs rounded-borders cursor-pointer"
            @click="showLoyaltyPopup = true"
          >
            <div class="loyalty-avatar">
              {{ customerStore.displayName.charAt(0).toUpperCase() }}
            </div>
            <div class="column q-ml-xs">
              <span class="loyalty-name">{{ customerStore.displayName }}</span>
              <span class="loyalty-pts">
                <q-icon name="stars" size="10px" color="amber" class="q-mr-xs" />
                {{ customerStore.pointsBalance }} pts · {{ customerStore.loyaltyTierDisplay }}
              </span>
            </div>
            <q-btn
              flat
              round
              dense
              icon="logout"
              size="xs"
              color="grey-5"
              class="q-ml-sm"
              @click.stop="handleLogout"
            />
          </div>

          <!-- Tracking / My Orders Button -->
          <q-btn
            flat
            dense
            round
            icon="receipt_long"
            class="touch-cart-btn position-relative"
            size="lg"
            @click="ordersOpen = true"
          >
            <q-badge
              v-if="activeOrdersCount > 0"
              color="primary"
              floating
              rounded
              class="cart-badge text-weight-bold"
            >
              {{ activeOrdersCount }}
            </q-badge>
          </q-btn>

          <!-- Cart Button -->
          <q-btn
            flat
            dense
            round
            icon="shopping_basket"
            class="touch-cart-btn position-relative"
            size="lg"
            @click="toggleCart"
          >
            <q-badge
              v-if="cartCount > 0"
              color="negative"
              floating
              rounded
              class="cart-badge text-weight-bold"
            >
              {{ cartCount }}
            </q-badge>
          </q-btn>
        </div>
      </q-toolbar>
    </q-header>

    <!-- Tracking Drawer -->
    <q-drawer
      v-model="ordersOpen"
      side="right"
      overlay
      bordered
      :width="380"
      class="bg-dark text-white touch-cart-drawer"
    >
      <OrderProgressDrawer :open="ordersOpen" @close="ordersOpen = false" />
    </q-drawer>

    <!-- Cart Drawer -->
    <q-drawer
      v-model="cartOpen"
      side="right"
      overlay
      bordered
      :width="380"
      class="bg-dark text-white touch-cart-drawer"
    >
      <MenuCartDrawer @close="cartOpen = false" />
    </q-drawer>

    <!-- Page Content -->
    <q-page-container class="bg-dark-page">
      <router-view />
    </q-page-container>

    <!-- Loyalty Info Popup -->
    <q-dialog v-model="showLoyaltyPopup" position="top">
      <q-card class="loyalty-popup bg-dark text-white" style="min-width: 320px; max-width: 90vw">
        <q-card-section class="q-pa-md">
          <div class="row items-center no-wrap q-mb-md">
            <div class="loyalty-popup__avatar">
              {{ customerStore.displayName.charAt(0).toUpperCase() }}
            </div>
            <div class="q-ml-md col">
              <div class="text-h6 text-weight-bold text-white">{{ customerStore.displayName }}</div>
              <div class="text-caption text-grey-5">
                {{ customerStore.email || customerStore.phone }}
              </div>
            </div>
            <q-btn flat round dense icon="close" color="grey-5" v-close-popup />
          </div>

          <!-- Loyalty Card -->
          <div class="loyalty-card-display">
            <div class="loyalty-card-display__inner">
              <div class="row items-center justify-between">
                <div>
                  <div class="text-caption text-grey-5">Loyalty Card</div>
                  <div class="text-body1 text-weight-bold text-white font-mono">
                    {{ customerStore.cardNumber || '—' }}
                  </div>
                </div>
                <q-chip
                  :color="customerStore.loyaltyTierColor"
                  text-color="white"
                  :label="customerStore.loyaltyTierDisplay"
                  size="sm"
                  class="text-weight-bold"
                />
              </div>
              <q-separator dark class="q-my-sm" />
              <div class="row items-center">
                <q-icon name="stars" color="amber" size="24px" class="q-mr-sm" />
                <div>
                  <div class="text-h5 text-weight-black text-amber-4">
                    {{ customerStore.pointsBalance }}
                  </div>
                  <div class="text-caption text-grey-5">Loyalty Points</div>
                </div>
              </div>
            </div>
          </div>

          <div class="q-mt-md text-center">
            <q-btn
              unelevated
              no-caps
              color="negative"
              outline
              icon="logout"
              label="Sign Out"
              size="sm"
              @click="onSignOutClick"
            />
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-layout>
</template>

<script setup>
import { ref, computed, provide, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import MenuCartDrawer from 'src/components/touch-menu/MenuCartDrawer.vue'
import OrderProgressDrawer from 'src/components/touch-menu/OrderProgressDrawer.vue'
import { useCustomerStore } from 'src/stores/customerStore'
import { useTableSessionStore } from 'src/stores/tableSessionStore'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const customerStore = useCustomerStore()
const sessionStore = useTableSessionStore()

const cartOpen = ref(false)
const ordersOpen = ref(false)
const showLoyaltyPopup = ref(false)
const activeOrdersCount = ref(0)
let ordersChannel = null

const tableId = ref(localStorage.getItem('tm_table_id') || route.query.table || null)
const tableUuid = ref(null)

// For backward compatibility: legacy local state
const legacyCustomerName = ref(localStorage.getItem('tm_customer_name') || null)
const legacyLoyaltyPoints = ref(Number(localStorage.getItem('tm_loyalty_points') || 0))
const sessionToken = ref(localStorage.getItem('tm_session_token') || null)
const cartItems = ref([])

// Provide touch menu state to children (MenuBookTablet, MenuCartDrawer, etc.)
provide('touchMenuState', {
  tableId,
  tableUuid,
  sessionToken,
  customerName: computed(() =>
    customerStore.isLoggedIn ? customerStore.displayName : legacyCustomerName.value,
  ),
  loyaltyPoints: computed(() =>
    customerStore.isLoggedIn ? customerStore.pointsBalance : legacyLoyaltyPoints.value,
  ),
  cartItems,
  addToCart: (item) => {
    const existing = cartItems.value.find((i) => i.menu_item_id === item.id)
    if (existing) {
      existing.quantity++
      existing.total_price = existing.quantity * existing.unit_price
    } else {
      cartItems.value.push({
        menu_item_id: item.id,
        name: item.name,
        unit_price: item.price,
        quantity: 1,
        total_price: item.price,
        image_url: item.image_url,
        notes: '',
      })
    }
    $q.notify({
      message: `${item.name} added to order`,
      color: 'positive',
      position: 'top',
      timeout: 1500,
      icon: 'check_circle',
    })
  },
  removeFromCart: (itemId) => {
    cartItems.value = cartItems.value.filter((i) => i.menu_item_id !== itemId)
  },
  updateQuantity: (itemId, delta) => {
    const item = cartItems.value.find((i) => i.menu_item_id === itemId)
    if (item) {
      item.quantity += delta
      if (item.quantity <= 0) {
        cartItems.value = cartItems.value.filter((i) => i.menu_item_id !== itemId)
      } else {
        item.total_price = item.quantity * item.unit_price
      }
    }
  },
  clearCart: () => {
    cartItems.value = []
  },
  openLogin: () => goToAuth(),
  customerId: computed(() => customerStore.customerId),
})

const cartCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity, 0))

function toggleCart() {
  cartOpen.value = !cartOpen.value
}

function goToAuth() {
  // Preserve session context through auth
  const query = sessionStore.sessionToken ? { session: sessionStore.sessionToken } : {}
  router.push({ path: '/customer/auth', query })
}

async function handleLogout() {
  await customerStore.clearCustomer()
  cartItems.value = []
  legacyCustomerName.value = null
  legacyLoyaltyPoints.value = 0
  localStorage.removeItem('tm_customer_name')
  localStorage.removeItem('tm_session_token')
  localStorage.removeItem('tm_loyalty_points')
  $q.notify({ type: 'info', message: 'Signed out successfully', position: 'top', timeout: 2000 })
}

function onSignOutClick() {
  handleLogout()
  showLoyaltyPopup.value = false
}

async function resolveTableUuid() {
  let lookupTable =
    tableId.value || localStorage.getItem('tm_table_id') || localStorage.getItem('tm_table')

  // 1. If we have a lookup term, try interpreting it as a UUID or querying the table number
  if (lookupTable) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      lookupTable,
    )
    if (isUuid) {
      tableUuid.value = lookupTable
      return tableUuid.value
    }
    // Lookup by table_number
    const { data } = await supabase
      .from('restaurant_tables')
      .select('id')
      .eq('table_number', lookupTable)
      .single()
    if (data) {
      tableUuid.value = data.id
      return tableUuid.value
    }
  }

  // 2. Fallback: if STILL no table is set (e.g. they hit /customer/menu directly without a table token),
  // pick the lowest active table as a deterministic fallback.
  const { data: anyTable } = await supabase
    .from('restaurant_tables')
    .select('id')
    .eq('is_active', true)
    .order('table_number', { ascending: true })
    .limit(1)
    .single()

  if (anyTable) {
    tableUuid.value = anyTable.id
    // Always persist to localStorage so it doesn't change on fresh reload
    localStorage.setItem('tm_table_id', anyTable.id)
  }

  return tableUuid.value
}

async function fetchActiveOrdersCount() {
  const token = sessionToken?.value || localStorage.getItem('tm_session_token')
  const tUuid = tableUuid?.value

  if (!token && !tUuid) {
    activeOrdersCount.value = 0
    return
  }

  try {
    let data, error
    if (tUuid) {
      ;({ data, error } = await supabase.rpc('get_kiosk_orders', {
        p_table_id: tUuid,
      }))
    } else {
      ;({ data, error } = await supabase.rpc('get_session_orders', {
        p_session_token: token,
      }))
    }

    if (!error && data?.success) {
      activeOrdersCount.value = (data.orders || []).filter(
        (o) => o.status !== 'completed' && o.status !== 'cancelled',
      ).length
    } else {
      activeOrdersCount.value = 0
    }
  } catch (err) {
    console.error('Failed to fetch active orders count:', err)
    activeOrdersCount.value = 0
  }
}

function subscribeToOrders() {
  if (!tableUuid.value) return
  ordersChannel = supabase
    .channel('active-orders-count')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `table_id=eq.${tableUuid.value}`,
      },
      () => {
        fetchActiveOrdersCount()
      },
    )
    .subscribe()
}

onMounted(async () => {
  if (route.query.table) {
    tableId.value = route.query.table
    localStorage.setItem('tm_table_id', route.query.table)
  }
  // Restore customer session
  await customerStore.tryRestoreFromLocal()

  await resolveTableUuid()
  fetchActiveOrdersCount()
  subscribeToOrders()
})

onUnmounted(() => {
  if (ordersChannel) supabase.removeChannel(ordersChannel)
})
</script>

<style scoped lang="scss">
.touch-menu-layout {
  background-color: #0b0e14;
  font-family: 'Inter', sans-serif;
}

.touch-menu-header {
  background: rgba(11, 14, 20, 0.95);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.header-brand {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: #f8fafc;
  line-height: 1.1;
}

.header-table {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.bg-dark-page {
  background-color: #0b0e14;
}

.touch-btn {
  border-radius: 8px;
  font-weight: 600;
  text-transform: none;
  font-size: 13px;
}

// Loyalty Badge
.loyalty-badge {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 6px 10px;
  gap: 6px;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.09);
  }
}

.loyalty-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  color: white;
  flex-shrink: 0;
}

.loyalty-name {
  font-size: 12px;
  font-weight: 700;
  color: #f1f5f9;
  line-height: 1.2;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loyalty-pts {
  font-size: 10px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  line-height: 1;
}

.touch-cart-btn {
  color: #cbd5e1;
  transition: all 0.2s ease;

  &:hover,
  &:active {
    color: var(--q-primary);
    background: rgba(37, 99, 235, 0.1);
  }
}

.cart-badge {
  padding: 4px 6px;
  font-size: 10px;
  transform: translate(20%, -20%);
}

// Loyalty Popup
.loyalty-popup {
  background: rgba(15, 20, 35, 0.98) !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  backdrop-filter: blur(20px);

  &__avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: linear-gradient(135deg, #f97316, #ef4444);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 800;
    color: white;
    flex-shrink: 0;
  }
}

.loyalty-card-display {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(239, 68, 68, 0.1));
  border: 1px solid rgba(249, 115, 22, 0.2);
  border-radius: 16px;
  padding: 16px;

  &__inner {
    font-family: 'Inter', sans-serif;
  }
}

.font-mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  letter-spacing: 1px;
}
</style>
