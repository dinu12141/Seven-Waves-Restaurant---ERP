<template>
  <q-page class="pos-page row no-wrap">
    <!-- ════════════════════════════════════════════════════════
         LEFT PANEL — Menu Catalog
         ════════════════════════════════════════════════════════ -->
    <div class="col column left-panel">
      <!-- ── Header Row: Title + Search ── -->
      <div class="row items-center q-px-md q-pt-md q-pb-sm">
        <div class="row items-center q-mr-md">
          <q-icon name="point_of_sale" size="24px" color="primary" class="q-mr-sm" />
          <span class="text-h6 text-white text-weight-bold">POS</span>
        </div>

        <q-input
          dark
          dense
          rounded
          standout="bg-grey-9"
          v-model="searchQuery"
          placeholder="Search menu items..."
          class="col search-input"
          debounce="200"
          clearable
        >
          <template v-slot:prepend>
            <q-icon name="search" color="grey-5" />
          </template>
        </q-input>
      </div>

      <!-- ── Category Tabs ── -->
      <div class="q-px-md q-pb-sm">
        <q-tabs
          v-model="selectedCategory"
          dense
          no-caps
          align="left"
          active-color="primary"
          indicator-color="primary"
          class="category-tabs text-grey-5"
          outside-arrows
          mobile-arrows
        >
          <q-tab v-for="cat in categories" :key="cat.id" :name="cat.name" class="category-tab">
            <q-icon :name="cat.icon" size="18px" class="q-mr-xs" />
            <span>{{ cat.name }}</span>
            <q-badge
              v-if="cat.name !== 'All'"
              :label="getCategoryCount(cat.name)"
              color="grey-8"
              text-color="grey-4"
              class="q-ml-xs"
              rounded
            />
          </q-tab>
        </q-tabs>
      </div>

      <q-separator color="grey-9" />

      <!-- ── Product Grid ── -->
      <q-scroll-area class="col product-scroll q-px-md q-pt-md">
        <!-- Loading state -->
        <div v-if="menuLoading" class="column items-center justify-center q-pa-xl text-grey-6">
          <q-spinner-dots color="primary" size="40px" class="q-mb-sm" />
          <div class="text-caption">Loading menu...</div>
        </div>

        <!-- Error state -->
        <div v-else-if="menuError" class="column items-center justify-center q-pa-xl text-grey-6">
          <q-icon name="error_outline" size="48px" color="red-4" class="q-mb-sm" />
          <div class="text-subtitle2 text-red-4">Failed to load menu</div>
          <div class="text-caption q-mb-md">{{ menuError }}</div>
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Retry"
            icon="refresh"
            @click="fetchMenuItems"
          />
        </div>

        <!-- No results -->
        <div
          v-else-if="filteredProducts.length === 0"
          class="column items-center justify-center q-pa-xl text-grey-6"
        >
          <q-icon name="search_off" size="48px" class="q-mb-sm" style="opacity: 0.3" />
          <div class="text-subtitle2">No items found</div>
          <div class="text-caption">Try a different search or category</div>
        </div>

        <!-- Grid -->
        <div v-else class="row q-col-gutter-sm">
          <div
            v-for="product in filteredProducts"
            :key="product.id"
            class="col-6 col-sm-4 col-md-3 col-lg-2"
          >
            <MenuItemCard :product="product" @select="handleProductSelect" />
          </div>
        </div>

        <!-- Bottom spacer -->
        <div style="height: 24px" />
      </q-scroll-area>
    </div>

    <!-- ════════════════════════════════════════════════════════
         RIGHT PANEL — Order Cart
         ════════════════════════════════════════════════════════ -->
    <div class="cart-panel">
      <OrderCart
        @send-to-kitchen="handleSendToKitchen"
        @process-payment="handleProcessPayment"
        @clear-cart="handleClearCart"
      />
    </div>

    <!-- ════════════════════════════════════════════════════════
         VARIANT SELECTION DIALOG
         ════════════════════════════════════════════════════════ -->
    <q-dialog v-model="variantDialog" persistent>
      <q-card class="variant-dialog-card" dark>
        <q-card-section class="row items-center q-pb-none">
          <q-avatar rounded size="48px" class="q-mr-md">
            <q-img v-if="selectedProduct" :src="selectedProduct.image" />
          </q-avatar>
          <div>
            <div class="text-h6 text-white">{{ selectedProduct?.name }}</div>
            <div class="text-caption text-grey-5">Select a variant</div>
          </div>
          <q-space />
          <q-btn flat round icon="close" color="grey-5" v-close-popup />
        </q-card-section>

        <q-card-section>
          <div class="row q-gutter-sm">
            <q-btn
              v-for="variant in selectedProduct?.variants"
              :key="variant"
              unelevated
              no-caps
              :outline="selectedVariant !== variant"
              :color="selectedVariant === variant ? 'primary' : 'grey-8'"
              text-color="white"
              :label="variant"
              class="variant-option-btn"
              @click="selectedVariant = variant"
            />
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md q-pt-none">
          <q-btn flat no-caps label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            unelevated
            no-caps
            label="Add to Order"
            color="primary"
            icon="add_shopping_cart"
            :disable="!selectedVariant"
            @click="confirmVariantSelection"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <!-- ════════════════════════════════════════════════════════
         PAYMENT DIALOG
         ════════════════════════════════════════════════════════ -->
    <PaymentDialog
      v-model="paymentDialog"
      :total-amount="store.total"
      :item-count="store.itemCount"
      :order-type="store.orderType"
      :loading="isProcessingPayment"
      @confirm="handleConfirmPayment"
    />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar, Loading, Notify } from 'quasar'
import { useRouter } from 'vue-router'
import { supabase } from 'src/boot/supabase'
import { useOrderStore } from 'src/stores/orderStore'
import MenuItemCard from 'src/components/pos/MenuItemCard.vue'
import OrderCart from 'src/components/pos/OrderCart.vue'
import PaymentDialog from 'src/components/pos/PaymentDialog.vue'

const $q = useQuasar()
const router = useRouter()
const store = useOrderStore()

// ── Local State ──────────────────────────────────────────
const searchQuery = ref('')
const selectedCategory = ref('All')

// Menu data from Supabase
const menuProducts = ref([])
const categories = ref([{ id: 'all', name: 'All', icon: 'store' }])
const menuLoading = ref(false)
const menuError = ref(null)

// Variant dialog
const variantDialog = ref(false)
const selectedProduct = ref(null)
const selectedVariant = ref(null)

// Payment Dialog
const paymentDialog = ref(false)
const isProcessingPayment = ref(false)
async function fetchMenuItems() {
  menuLoading.value = true
  menuError.value = null

  try {
    const { data, error } = await supabase
      .from('menu_items')
      .select(
        `
        id,
        name,
        base_price,
        is_available,
        kitchen_id,
        categories(id, name)
      `,
      )
      .eq('is_available', true)
      .order('name')

    if (error) throw error

    // Map to the shape MenuItemCard expects
    menuProducts.value = (data || []).map((item) => ({
      id: item.id, // real UUID — used as menu_item_id in order_items
      name: item.name,
      price: parseFloat(item.base_price || 0),
      kitchen_id: item.kitchen_id,
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
      category: item.categories?.name || 'Other',
      variants: [], // variants loaded separately if needed
    }))

    // Build category list from unique categories in the data
    const seen = new Set()
    const cats = [{ id: 'all', name: 'All', icon: 'store' }]
    for (const item of menuProducts.value) {
      if (!seen.has(item.category)) {
        seen.add(item.category)
        cats.push({
          id: item.category,
          name: item.category,
          icon: _categoryIcon(item.category),
        })
      }
    }
    categories.value = cats
  } catch (err) {
    console.error('[POS] Failed to load menu items:', err)
    menuError.value = err.message || 'Unknown error'
  } finally {
    menuLoading.value = false
  }
}

function _categoryIcon(name) {
  const icons = {
    Burgers: 'lunch_dining',
    Pizza: 'local_pizza',
    Pasta: 'dinner_dining',
    Appetizers: 'tapas',
    Salads: 'restaurant',
    Desserts: 'cake',
    Drinks: 'local_bar',
    Sides: 'fastfood',
    Beverages: 'local_bar',
  }
  return icons[name] || 'restaurant_menu'
}

onMounted(() => {
  fetchMenuItems()
})

// ── Computed ─────────────────────────────────────────────
const filteredProducts = computed(() => {
  let products = menuProducts.value

  if (selectedCategory.value !== 'All') {
    products = products.filter((p) => p.category === selectedCategory.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    products = products.filter(
      (p) => p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query),
    )
  }

  return products
})

function getCategoryCount(categoryName) {
  return menuProducts.value.filter((p) => p.category === categoryName).length
}

// ── Product Selection ────────────────────────────────────
function handleProductSelect(product) {
  if (product.variants && product.variants.length > 0) {
    // Open variant dialog
    selectedProduct.value = product
    selectedVariant.value = product.variants[0]
    variantDialog.value = true
  } else {
    // Add directly
    store.addItem(product)
    showAddNotification(product.name)
  }
}

function confirmVariantSelection() {
  if (selectedProduct.value && selectedVariant.value) {
    store.addItem(selectedProduct.value, selectedVariant.value)
    showAddNotification(`${selectedProduct.value.name} (${selectedVariant.value})`)
    variantDialog.value = false
    selectedProduct.value = null
    selectedVariant.value = null
  }
}

function showAddNotification(itemName) {
  Notify.create({
    message: `${itemName} added`,
    color: 'positive',
    icon: 'check_circle',
    position: 'top',
    timeout: 800,
    classes: 'glossy',
  })
}

// ── Cart Actions ─────────────────────────────────────────
async function handleSendToKitchen() {
  if (store.isEmpty) return

  Loading.show({ message: 'Sending to kitchen...' })

  try {
    const result = await store.sendToKitchen()

    if (result && result.success) {
      Loading.hide()

      Notify.create({
        message: `Order #${result.order.order_number ?? result.order.id.slice(0, 8).toUpperCase()} sent to kitchen!`,
        caption: `${store.cartItems.length} item(s) • ${store.orderType}`,
        color: 'teal',
        icon: 'soup_kitchen',
        position: 'top-right',
        timeout: 3000,
      })

      // Clear cart and redirect to Orders page
      store.clearCart()
      router.push('/orders')
    }
  } catch (err) {
    Loading.hide()

    Notify.create({
      message: 'Failed to send order',
      caption: err.message || 'Please try again',
      color: 'negative',
      icon: 'error_outline',
      position: 'top-right',
      timeout: 5000,
      actions: [{ label: 'Dismiss', color: 'white', flat: true }],
    })

    console.error('[POS] sendToKitchen error:', err)
  }
}

function handleProcessPayment() {
  if (store.isEmpty) return
  paymentDialog.value = true
}

async function handleConfirmPayment(method) {
  isProcessingPayment.value = true

  try {
    const result = await store.processPayment(method)

    if (result && result.success) {
      paymentDialog.value = false

      Notify.create({
        message: `Payment Successful!`,
        caption: `Invoice #${result.invoiceNumber} • Paid via ${method}`,
        color: 'positive',
        icon: 'verified',
        position: 'top-right',
        timeout: 4000,
        actions: [{ label: 'Print Invoice', color: 'white', flat: true }],
      })

      // Optionally refresh or redirect? store.processPayment already clears the cart
      // Maybe stay on POS for next order
    }
  } catch (err) {
    console.error('Payment failed:', err)
    Notify.create({
      message: 'Payment Failed',
      caption: err.message || 'Please try again',
      color: 'negative',
      icon: 'error_outline',
      position: 'top-right',
    })
  } finally {
    isProcessingPayment.value = false
  }
}

function handleClearCart() {
  $q.dialog({
    title: 'Clear Order',
    message: 'Are you sure you want to clear the current order?',
    dark: true,
    cancel: { flat: true, color: 'grey-5', noCaps: true },
    ok: { color: 'red', unelevated: true, noCaps: true, label: 'Clear' },
  }).onOk(() => {
    store.clearCart()
    $q.notify({
      message: 'Order cleared',
      color: 'grey-8',
      icon: 'delete_outline',
      position: 'top',
      timeout: 1000,
    })
  })
}
</script>

<style scoped lang="scss">
.pos-page {
  padding: 0 !important;
  height: calc(100vh - 50px);
  overflow: hidden;
}

.left-panel {
  min-width: 0; // allow flex shrink
}

.cart-panel {
  width: 380px;
  min-width: 380px;
  max-width: 380px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.5);
}

.search-input {
  max-width: 400px;

  :deep(.q-field__control) {
    height: 36px;
    min-height: 36px;
  }
}

// Category tabs
.category-tabs {
  :deep(.q-tabs__content) {
    gap: 4px;
  }
}

.category-tab {
  border-radius: 8px;
  padding: 4px 12px;
  min-height: 36px;
  font-size: 0.8rem;
  text-transform: none;

  &.q-tab--active {
    background: rgba(25, 118, 210, 0.12);
  }
}

// Variant Dialog
.variant-dialog-card {
  min-width: 360px;
  max-width: 440px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
}

.variant-option-btn {
  border-radius: 8px;
  min-width: 80px;
}
</style>
