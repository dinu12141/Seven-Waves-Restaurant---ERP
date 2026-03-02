<template>
  <q-layout view="hHh lpR fFf" class="touch-menu-layout">
    <q-header class="touch-menu-header" elevated>
      <q-toolbar class="q-px-md q-py-sm">
        <div class="header-logo row items-center no-wrap">
          <q-icon name="restaurant_menu" size="32px" color="primary" class="q-mr-sm" />
          <div class="column justify-center">
            <span class="header-brand">Seven Waves</span>
            <span class="header-table text-primary text-weight-bold"
              >Table: {{ tableId || 'Select Table' }}</span
            >
          </div>
        </div>

        <q-space />

        <div class="header-actions row items-center no-wrap q-gutter-x-sm">
          <q-btn
            v-if="!customerName"
            outline
            color="primary"
            icon="person_add"
            label="Log In"
            class="touch-btn touch-btn-login"
            @click="openLoginModal"
          />
          <div
            v-else
            class="loyalty-badge row items-center q-px-sm q-py-xs bg-dark rounded-borders border-accent"
          >
            <q-icon name="stars" color="warning" size="20px" class="q-mr-xs" />
            <div class="column">
              <span
                class="text-caption text-weight-bold text-white line-height-1"
                style="font-size: 10px"
                >{{ customerName }}</span
              >
              <span class="text-caption text-warning line-height-1" style="font-size: 10px"
                >{{ loyaltyPoints }} Pts</span
              >
            </div>
            <q-btn
              flat
              round
              dense
              icon="logout"
              size="sm"
              color="grey-5"
              class="q-ml-sm"
              @click="logout"
            />
          </div>

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

    <q-page-container class="bg-dark-page">
      <router-view />
    </q-page-container>

    <CustomerLoginModal v-model="loginModalOpen" @logged-in="handleLogin" />
  </q-layout>
</template>

<script setup>
import { ref, computed, provide, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import MenuCartDrawer from 'src/components/touch-menu/MenuCartDrawer.vue'
import CustomerLoginModal from 'src/components/touch-menu/CustomerLoginModal.vue'

const $q = useQuasar()
const route = useRoute()

const cartOpen = ref(false)
const loginModalOpen = ref(false)

// State
const tableId = ref(route.query.table || localStorage.getItem('tm_table_id') || 'T01')
const sessionToken = ref(localStorage.getItem('tm_session_token') || null)
const customerName = ref(localStorage.getItem('tm_customer_name') || null)
const loyaltyPoints = ref(Number(localStorage.getItem('tm_loyalty_points') || 0))
const cartItems = ref([])

// Provide state to children
provide('touchMenuState', {
  tableId,
  sessionToken,
  customerName,
  loyaltyPoints,
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
      message: `${item.name} added to cart`,
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
  openLogin: () => {
    loginModalOpen.value = true
  },
})

const cartCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity, 0))

function toggleCart() {
  cartOpen.value = !cartOpen.value
}

function openLoginModal() {
  loginModalOpen.value = true
}

function handleLogin(data) {
  customerName.value = data.customer_name
  sessionToken.value = data.session_token
  loyaltyPoints.value = data.points || 0

  localStorage.setItem('tm_customer_name', data.customer_name)
  localStorage.setItem('tm_session_token', data.session_token)
  localStorage.setItem('tm_loyalty_points', data.points || 0)
}

function logout() {
  customerName.value = null
  sessionToken.value = null
  loyaltyPoints.value = 0
  cartItems.value = []

  localStorage.removeItem('tm_customer_name')
  localStorage.removeItem('tm_session_token')
  localStorage.removeItem('tm_loyalty_points')
}

onMounted(() => {
  if (route.query.table) {
    localStorage.setItem('tm_table_id', route.query.table)
  }
})
</script>

<style scoped lang="scss">
.touch-menu-layout {
  background-color: #0b0e14; /* Deep dark for premium feel */
  font-family: 'Inter', sans-serif;
}

.touch-menu-header {
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.header-brand {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: #f8fafc;
  line-height: 1.1;
}

.header-table {
  font-size: 13px;
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
  font-size: 15px;
}

.touch-cart-btn {
  color: #cbd5e1;
  transition: all 0.2s ease;
  padding: 8px;

  &:hover,
  &:active {
    color: var(--q-primary);
    background: rgba(37, 99, 235, 0.1);
  }
}

.cart-badge {
  padding: 4px 6px;
  font-size: 11px;
  transform: translate(20%, -20%);
}

.border-accent {
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.line-height-1 {
  line-height: 1.2;
}
</style>
