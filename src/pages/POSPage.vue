<template>
  <q-page class="pos-terminal">
    <!-- ══════════════════════════════════════════════════════
         TOP STATUS BAR
         ══════════════════════════════════════════════════════ -->
    <div class="pos-top-bar">
      <div class="top-bar-left">
        <span class="top-version">SevenWaves POS v1.0</span>
        <span class="top-sep">|</span>
        <span class="top-branch">{{ branchName }}</span>
      </div>
      <div class="top-bar-center">
        <span class="top-user-label">{{ userName }}</span>
      </div>
      <div class="top-bar-right">
        <div class="top-info-grid">
          <div class="info-row">
            <span class="info-label">Paid</span>
            <span class="info-value">{{ fmtCurrency(paidAmount) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Balance</span>
            <span class="info-value">{{ fmtCurrency(balanceAmount) }}</span>
          </div>
        </div>
        <div class="top-total-box">
          <div class="total-label-top">Total</div>
          <div class="total-value-top">{{ fmtCurrency(store.total) }}</div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════
         MAIN BODY — 3-column layout
         ══════════════════════════════════════════════════════ -->
    <div class="pos-body">
      <!-- ═══ LEFT: Order Items List ═══ -->
      <div class="pos-left-panel">
        <!-- Customer row -->
        <div class="customer-bar">
          <div class="cust-field">
            <span class="cust-label">Customer</span>
            <input v-model="store.customerName" class="cust-input" placeholder="Walk-in" />
          </div>
          <div class="cust-field">
            <span class="cust-label">Table</span>
            <span class="cust-value">{{ store.selectedTable || '—' }}</span>
          </div>
        </div>

        <!-- Order items table -->
        <div class="order-items-table-wrap">
          <table class="order-items-table">
            <thead>
              <tr>
                <th class="th-num">#</th>
                <th class="th-desc">Description</th>
                <th class="th-qty">Qty</th>
                <th class="th-amt">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, index) in store.cartItems"
                :key="item.id"
                :class="{ selected: selectedItemIndex === index }"
                @click="selectItem(index)"
              >
                <td class="td-num">{{ index + 1 }}</td>
                <td class="td-desc">
                  {{ item.name
                  }}<span v-if="item.variant" class="item-variant"> ({{ item.variant }})</span>
                </td>
                <td class="td-qty">{{ item.qty }}</td>
                <td class="td-amt">{{ fmtCurrency(item.price * item.qty) }}</td>
              </tr>
              <!-- Empty rows to fill space -->
              <tr v-for="n in emptyRows" :key="'empty-' + n" class="empty-row">
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ═══ CENTER: Category Buttons + Function Buttons ═══ -->
      <div class="pos-center-panel">
        <!-- Search & Function Menu Row -->
        <div class="center-top">
          <!-- Item Search Bar -->
          <div class="pos-search-bar">
            <q-input
              v-model="itemSearchQuery"
              dense
              outlined
              dark
              placeholder="Search Items..."
              class="search-input"
              @update:model-value="onSearchInput"
            >
              <template v-slot:prepend>
                <q-icon name="search" size="18px" color="primary" />
              </template>
              <template v-slot:append v-if="itemSearchQuery">
                <q-icon
                  name="close"
                  size="14px"
                  class="cursor-pointer"
                  @click="itemSearchQuery = ''"
                />
              </template>
            </q-input>
          </div>

          <!-- Scroll up -->
          <button class="scroll-arrow-btn" @click="scrollCategoriesUp">▲</button>

          <!-- Category Grid -->
          <div class="category-grid" ref="categoryGridRef">
            <!-- Search Results Mode -->
            <template v-if="itemSearchQuery">
              <button
                v-for="item in filteredSearchItems"
                :key="'search-' + item.id"
                class="cat-btn search-res-btn"
                @click="handleSearchResultClick(item)"
              >
                {{ item.name }}
              </button>
              <div
                v-if="filteredSearchItems.length === 0"
                class="text-grey-6 text-center q-pa-md col-span-2"
              >
                No items found
              </div>
            </template>

            <!-- Categories Mode -->
            <template v-else>
              <button
                v-for="cat in categories"
                :key="cat.id"
                class="cat-btn"
                :class="{ active: selectedCategory === cat.name }"
                @click="selectCategory(cat.name)"
              >
                {{ cat.name }}
              </button>
            </template>
          </div>

          <!-- Scroll down -->
          <button class="scroll-arrow-btn" @click="scrollCategoriesDown">▼</button>

          <!-- Function Menu Button -->
          <button class="func-menu-btn" @click="toggleFunctionMenu">FUNCTION MENU</button>
        </div>

        <!-- Function buttons row -->
        <div class="function-buttons">
          <button class="fn-btn fn-blue" @click="handleVoid">VOID</button>
          <button class="fn-btn fn-blue" @click="handleClearOrder">Clear Order</button>
          <button class="fn-btn fn-blue" @click="handleBack">Back</button>

          <button class="fn-btn fn-blue" @click="handlePrint">PRINT</button>
          <button class="fn-btn fn-blue" @click="handleOther">Other</button>
          <button class="fn-btn fn-blue" @click="handleEdit">Edit</button>

          <button class="fn-btn fn-blue fn-wide" @click="handleModifier">Modifier</button>
          <button class="fn-btn fn-blue fn-wide" @click="handleDivider">Divider</button>
        </div>

        <!-- Order type buttons -->
        <div class="order-type-buttons">
          <button
            class="ot-btn"
            :class="{ active: store.orderType === 'dine-in' }"
            @click="setOrderType('dine-in')"
          >
            Table Order
          </button>
          <button
            class="ot-btn"
            :class="{ active: store.orderType === 'takeaway' }"
            @click="setOrderType('takeaway')"
          >
            Take Away
          </button>
          <button
            class="ot-btn"
            :class="{ active: store.orderType === 'delivery' }"
            @click="setOrderType('delivery')"
          >
            Delivery
          </button>
        </div>

        <!-- Bottom action buttons -->
        <div class="bottom-actions">
          <button class="ba-btn ba-blue" @click="handleNewOrder">Order</button>
          <button class="ba-btn ba-blue" @click="handleOrderLookup">Order<br />Lookup</button>
          <button class="ba-btn ba-blue" @click="handleClear">Clear</button>
          <button class="ba-btn ba-save" @click="handleSave">SAVE</button>
          <button class="ba-btn ba-payment" @click="handlePayment">PAYMENT</button>
        </div>
      </div>

      <!-- ═══ RIGHT: Numeric Keypad ═══ -->
      <div class="pos-right-panel">
        <div class="numpad-grid">
          <button class="num-btn" @click="numInput('7')">7</button>
          <button class="num-btn" @click="numInput('8')">8</button>
          <button class="num-btn" @click="numInput('9')">9</button>
          <button class="num-btn" @click="numInput('4')">4</button>
          <button class="num-btn" @click="numInput('5')">5</button>
          <button class="num-btn" @click="numInput('6')">6</button>
          <button class="num-btn" @click="numInput('1')">1</button>
          <button class="num-btn" @click="numInput('2')">2</button>
          <button class="num-btn" @click="numInput('3')">3</button>
          <button class="num-btn" @click="numInput('0')">0</button>
          <button class="num-btn" @click="numInput('.')">●</button>
          <button class="num-btn num-x" @click="numClear">X</button>
        </div>
        <button class="enter-btn" @click="numEnter">ENTER</button>
        <button class="subtotal-btn" @click="handleSubtotal">Subtotal</button>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════
         BOTTOM BAR — Sub-category tabs + Logout
         ══════════════════════════════════════════════════════ -->
    <div class="pos-bottom-bar">
      <div class="subcat-tabs">
        <button
          v-for="(sub, idx) in subCategories"
          :key="sub.id || idx"
          class="subcat-btn"
          :class="{ active: selectedSubCategory === sub.name }"
          @click="selectSubCategory(sub)"
        >
          {{ sub.label }}
        </button>
      </div>
      <div class="bottom-right-actions">
        <button class="logout-btn" @click="handleLogout">Log Out</button>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════
         ITEM PICKER OVERLAY (when sub-category selected)
         ══════════════════════════════════════════════════════ -->
    <q-dialog v-model="itemPickerOpen" position="bottom" maximized>
      <q-card class="item-picker-card" dark>
        <q-card-section class="row items-center q-pb-sm">
          <q-icon name="restaurant_menu" color="primary" size="20px" class="q-mr-sm" />
          <span class="text-subtitle1 text-white text-weight-bold">{{
            selectedSubCategoryLabel
          }}</span>
          <q-space />
          <q-btn flat round dense icon="close" color="grey-5" v-close-popup />
        </q-card-section>
        <q-separator color="grey-8" />
        <q-card-section class="item-picker-grid-section">
          <div class="item-picker-grid">
            <button
              v-for="item in subCategoryItems"
              :key="item.id"
              class="item-pick-btn"
              @click="addItemToOrder(item)"
            >
              <img v-if="item.image" :src="item.image" loading="lazy" class="item-card-img" />
              <div v-else class="item-card-img-placeholder">
                <q-icon name="restaurant" size="24px" color="grey-7" />
              </div>
              <div class="item-card-text">
                <div class="ipb-name">{{ item.name }}</div>
                <div class="ipb-price">LKR {{ item.price.toFixed(0) }}</div>
              </div>
            </button>
          </div>
          <div v-if="subCategoryItems.length === 0" class="text-grey-6 text-center q-pa-xl">
            No items in this category
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- ══════════════════════════════════════════════════════
         BILLING QUEUE DRAWER
         ══════════════════════════════════════════════════════ -->
    <q-drawer
      v-model="queueDrawer"
      side="left"
      overlay
      behavior="mobile"
      :width="380"
      class="billing-queue-drawer"
    >
      <BillingQueue @select="openBilling" />
    </q-drawer>

    <!-- Bill Dialog removed — queue orders now use PaymentDialog -->

    <!-- Payment Dialog (handles both POS manual and queue orders) -->
    <PaymentDialog
      ref="paymentDialogRef"
      v-model="paymentDialog"
      :total-amount="store.total"
      :subtotal-amount="store.subtotal"
      :discount-percent="store.discount"
      :discount-value="store.discountAmount"
      :tax-value="store.taxAmount"
      :item-count="store.itemCount"
      :order-type="store.orderType"
      :cart-items="store.cartItems"
      :customer-name="store.customerName"
      :loading="isProcessingPayment"
      :queue-order="selectedQueueOrder"
      @confirm="handleConfirmPayment"
      @new-order="handleNewOrderAfterPayment"
      @paid="onOrderPaid"
    />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useQuasar, Loading, Notify } from 'quasar'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from 'src/boot/supabase'
import { useOrderStore } from 'src/stores/orderStore'
import { useCashierStore } from 'src/stores/cashierStore'
import { useAuthStore } from 'src/stores/auth'
import BillingQueue from 'src/components/pos/BillingQueue.vue'
// BillDialog removed — queue orders now use PaymentDialog
import PaymentDialog from 'src/components/pos/PaymentDialog.vue'

const $q = useQuasar()
const router = useRouter()
const route = useRoute()
const store = useOrderStore()
const cashierStore = useCashierStore()
const authStore = useAuthStore()

// ── State ───────────────────────────────────────────────
const selectedCategory = ref('All')
const selectedSubCategory = ref('')
const selectedSubCategoryLabel = ref('')
const selectedItemIndex = ref(-1)
const numBuffer = ref('')
const itemPickerOpen = ref(false)
const categoryGridRef = ref(null)

// Menu data
const menuProducts = ref([])
const categories = ref([])
const menuLoading = ref(false)

// Payment
const paymentDialog = ref(false)
const isProcessingPayment = ref(false)

// Billing Queue
const queueDrawer = ref(false)
const selectedQueueOrder = ref(null)
const paymentDialogRef = ref(null)

// ── Computed ────────────────────────────────────────────
const branchName = computed(() => authStore.currentBranch?.name || 'SEVEN WAVES')
const userName = computed(() => authStore.profile?.full_name || 'Cashier')

// Search
const itemSearchQuery = ref('')
const filteredSearchItems = computed(() => {
  if (!itemSearchQuery.value) return []
  const q = itemSearchQuery.value.toLowerCase()
  return menuProducts.value.filter(
    (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
  )
})

const paidAmount = computed(() => 0)
const balanceAmount = computed(() => store.total)

const emptyRows = computed(() => {
  const maxRows = 10
  const used = store.cartItems.length
  return Math.max(0, maxRows - used)
})

const subCategories = computed(() => {
  if (selectedCategory.value === 'All' || !selectedCategory.value) {
    // Show all unique categories as sub-tabs
    const seen = new Set()
    const tabs = []
    let idx = 1
    for (const item of menuProducts.value) {
      if (!seen.has(item.category)) {
        seen.add(item.category)
        tabs.push({
          id: item.category,
          name: item.category,
          label: `${String(idx).padStart(2, '0')}-${item.category.toUpperCase()}`,
        })
        idx++
      }
    }
    return tabs
  }
  // When a specific category is selected, show items as sub-tabs
  const items = menuProducts.value.filter((p) => p.category === selectedCategory.value)
  return items.map((item, i) => ({
    id: item.id,
    name: item.name,
    label: `${String(i + 1).padStart(2, '0')}-${item.name.substring(0, 10).toUpperCase()}`,
    isItem: true,
    item,
  }))
})

const subCategoryItems = computed(() => {
  if (!selectedSubCategory.value) return []
  return menuProducts.value.filter((p) => p.category === selectedSubCategory.value)
})

// ── Fetch Menu ──────────────────────────────────────────
async function fetchMenuItems() {
  menuLoading.value = true
  try {
    let products = []

    // Step 1: Try to load from default menu book for this branch
    const branchId = authStore.currentBranch?.id
    let usedMenuBook = false

    if (branchId) {
      const { data: bookData } = await supabase
        .from('menu_books')
        .select('id, name')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .eq('is_default', true)
        .limit(1)
        .maybeSingle()

      if (bookData) {
        // Load items through the menu book
        const { data: bookItems, error: bookError } = await supabase
          .from('menu_book_items')
          .select(`
            id, override_price, is_available, sort_order,
            menu_items(id, name, base_price, image_url, is_available, kitchen_id, sub_category_id, categories(id, name))
          `)
          .eq('menu_book_id', bookData.id)
          .eq('is_available', true)
          .order('sort_order')

        if (!bookError && bookItems && bookItems.length > 0) {
          products = bookItems
            .filter(bi => bi.menu_items && bi.menu_items.is_available)
            .map(bi => ({
              id: bi.menu_items.id,
              name: bi.menu_items.name,
              price: parseFloat(bi.override_price || bi.menu_items.base_price || 0),
              kitchen_id: bi.menu_items.kitchen_id,
              sub_category_id: bi.menu_items.sub_category_id,
              image: bi.menu_items.image_url || '',
              category: bi.menu_items.categories?.name || 'Other',
              variants: [],
            }))
          usedMenuBook = true
          console.log(`[POS] Loaded ${products.length} items from menu book: ${bookData.name}`)
        }
      }
    }

    // Step 2: Fallback — load all menu items directly (backward compatible)
    if (!usedMenuBook) {
      const { data, error } = await supabase
        .from('menu_items')
        .select(`id, name, base_price, image_url, is_available, kitchen_id, sub_category_id, categories(id, name)`)
        .eq('is_available', true)
        .order('name')

      if (error) throw error

      products = (data || []).map((item) => ({
        id: item.id,
        name: item.name,
        price: parseFloat(item.base_price || 0),
        kitchen_id: item.kitchen_id,
        sub_category_id: item.sub_category_id,
        image: item.image_url || '',
        category: item.categories?.name || 'Other',
        variants: [],
      }))
    }

    menuProducts.value = products

    // Build categories
    const seen = new Set()
    const cats = [{ id: 'all', name: 'All', icon: 'store' }]
    for (const item of menuProducts.value) {
      if (!seen.has(item.category)) {
        seen.add(item.category)
        cats.push({ id: item.category, name: item.category })
      }
    }
    categories.value = cats
  } catch (err) {
    console.error('[POS] Failed to load menu:', err)
    Notify.create({ message: 'Failed to load menu', caption: err.message, color: 'red' })
  } finally {
    menuLoading.value = false
  }
}

onMounted(async () => {
  fetchMenuItems()
  await cashierStore.initialize()

  // ── Auto-open billing from notification click ─────────────
  // When navigated via notification with ?order_id=xxx, auto-open the billing dialog
  const notifOrderId = route.query.order_id
  if (notifOrderId) {
    autoOpenBillingForOrder(notifOrderId)
  }
})

// Watch for same-page navigation (user already on POS, clicks another notification)
watch(
  () => route.query.order_id,
  (newOrderId) => {
    if (newOrderId) {
      autoOpenBillingForOrder(newOrderId)
    }
  },
)

/**
 * Auto-open billing dialog for an order from notification click.
 * Retries up to 5 times (1s apart) in case the cashierStore hasn't loaded the order yet.
 */
async function autoOpenBillingForOrder(orderId, attempt = 0) {
  const MAX_ATTEMPTS = 5

  // Find order in the billing queue
  let order = cashierStore.billingOrders.find(o => o.id === orderId)

  if (!order && attempt < MAX_ATTEMPTS) {
    // Order may not be loaded yet — wait and retry
    await new Promise(resolve => setTimeout(resolve, 1000))
    // Refresh the queue in case it wasn't loaded
    if (attempt === 1) await cashierStore.fetchBillingQueue(true)
    return autoOpenBillingForOrder(orderId, attempt + 1)
  }

  if (order) {
    // Clear the query param so reloads don't re-trigger
    router.replace({ query: {} }).catch(() => {})

    await nextTick()
    selectedQueueOrder.value = order
    paymentDialog.value = true

    Notify.create({
      message: `Billing opened for Order #${order.order_number}`,
      caption: order.order_type === 'delivery' ? '🛵 Delivery Order' : order.order_type === 'takeaway' ? '🥡 Takeaway' : '🍽️ Dine-in',
      color: 'deep-orange',
      icon: 'receipt_long',
      position: 'top',
      timeout: 3000,
    })

    // Auto-print bill after dialog fully renders (350ms for dialog animation + render)
    setTimeout(async () => {
      if (paymentDialogRef.value?.printBill) {
        await paymentDialogRef.value.printBill()
      }
    }, 350)
  } else {
    // Order not found after retries — notify
    router.replace({ query: {} }).catch(() => {})
    Notify.create({
      message: 'Order not found in billing queue',
      caption: 'It may have already been processed or is still being prepared.',
      color: 'orange-8',
      icon: 'info',
      position: 'top',
      timeout: 5000,
    })
  }
}

// ── Item Selection ──────────────────────────────────────
function onSearchInput() {
  // Logic if needed
}

function handleSearchResultClick(item) {
  addItemToOrder(item)
  itemSearchQuery.value = ''
}

function selectItem(index) {
  selectedItemIndex.value = index
}

function selectCategory(catName) {
  selectedCategory.value = catName
  selectedSubCategory.value = ''
}

function selectSubCategory(sub) {
  if (sub.isItem && sub.item) {
    // Direct item add
    addItemToOrder(sub.item)
  } else {
    // It's a category → show items as item picker
    selectedSubCategory.value = sub.name
    selectedSubCategoryLabel.value = sub.label || sub.name
    itemPickerOpen.value = true
  }
}

function addItemToOrder(product) {
  const qty = parseInt(numBuffer.value) || 1
  for (let i = 0; i < qty; i++) {
    store.addItem(product)
  }
  numBuffer.value = ''
  Notify.create({
    message: `${product.name} × ${qty} added`,
    color: 'positive',
    icon: 'check_circle',
    position: 'top',
    timeout: 600,
  })
}

// ── Numeric Keypad ──────────────────────────────────────
function numInput(char) {
  numBuffer.value += char
}

function numClear() {
  numBuffer.value = ''
}

function numEnter() {
  if (selectedItemIndex.value >= 0 && numBuffer.value) {
    const qty = parseInt(numBuffer.value) || 1
    store.updateQuantity(selectedItemIndex.value, qty)
    numBuffer.value = ''
  }
}

// ── Function Button Handlers ────────────────────────────
function handleVoid() {
  if (selectedItemIndex.value >= 0) {
    store.removeItem(selectedItemIndex.value)
    selectedItemIndex.value = -1
    Notify.create({
      message: 'Item voided',
      color: 'orange',
      icon: 'delete',
      position: 'top',
      timeout: 800,
    })
  } else {
    Notify.create({
      message: 'Select an item to void',
      color: 'grey-8',
      position: 'top',
      timeout: 800,
    })
  }
}

function handleClearOrder() {
  $q.dialog({
    title: 'Clear Order',
    message: 'Are you sure you want to clear the current order?',
    dark: true,
    cancel: { flat: true, color: 'grey-5', noCaps: true },
    ok: { color: 'red', unelevated: true, noCaps: true, label: 'Clear' },
  }).onOk(() => {
    store.clearCart()
    selectedItemIndex.value = -1
    Notify.create({
      message: 'Order cleared',
      color: 'grey-8',
      icon: 'delete_outline',
      position: 'top',
      timeout: 800,
    })
  })
}

function handleBack() {
  selectedItemIndex.value = -1
  numBuffer.value = ''
}

function handlePrint() {
  queueDrawer.value = true
}

function handleOther() {
  if (store.isEmpty) {
    Notify.create({ message: 'No items in order', color: 'orange', position: 'top', timeout: 800 })
    return
  }
  // Apply a custom discount to the order
  $q.dialog({
    title: 'Order Discount',
    message: 'Enter discount percentage (0-100):',
    prompt: {
      model: store.discount.toString(),
      type: 'number',
    },
    cancel: true,
    persistent: true,
  }).onOk((data) => {
    const val = parseFloat(data)
    if (!isNaN(val) && val >= 0 && val <= 100) {
      store.discount = val
      Notify.create({ message: `Discount set to ${val}%`, color: 'positive', position: 'top' })
    }
  })
}

function handleEdit() {
  if (selectedItemIndex.value < 0) {
    Notify.create({
      message: 'Select an item to edit',
      color: 'orange',
      position: 'top',
      timeout: 800,
    })
    return
  }
  const item = store.cartItems[selectedItemIndex.value]
  $q.dialog({
    title: 'Edit Item Price',
    message: `Enter new price for ${item.name}:`,
    prompt: {
      model: item.price.toString(),
      type: 'number',
    },
    cancel: true,
    persistent: true,
  }).onOk((data) => {
    const val = parseFloat(data)
    if (!isNaN(val) && val >= 0) {
      item.price = val
      Notify.create({ message: 'Price updated', color: 'positive', position: 'top' })
    }
  })
}

function handleModifier() {
  if (selectedItemIndex.value < 0) {
    Notify.create({
      message: 'Select an item to add notes/modifiers',
      color: 'orange',
      position: 'top',
      timeout: 800,
    })
    return
  }
  const item = store.cartItems[selectedItemIndex.value]
  $q.dialog({
    title: 'Item Note / Modifier',
    message: `Enter note for ${item.name}:`,
    prompt: {
      model: item.notes || '',
      type: 'text',
    },
    cancel: true,
    persistent: true,
  }).onOk((data) => {
    store.setItemNotes(selectedItemIndex.value, data)
    Notify.create({ message: 'Note updated', color: 'positive', position: 'top' })
  })
}

function handleDivider() {
  // Can be used to open the cash drawer if integrated, for now just a generic action
  Notify.create({
    message: 'Open Cash Drawer signal sent',
    color: 'teal',
    icon: 'point_of_sale',
    position: 'top',
  })
}

function toggleFunctionMenu() {
  Notify.create({ message: 'Function Menu ready', color: 'info', position: 'top', timeout: 800 })
}

function setOrderType(type) {
  store.orderType = type
  Notify.create({
    message: `Order type: ${type === 'dine-in' ? 'Table Order' : type === 'takeaway' ? 'Take Away' : 'Delivery'}`,
    color: 'primary',
    position: 'top',
    timeout: 600,
  })
}

function handleNewOrder() {
  store.clearCart()
  selectedItemIndex.value = -1
  numBuffer.value = ''
}

function handleOrderLookup() {
  queueDrawer.value = true
}

function handleClear() {
  numBuffer.value = ''
  selectedItemIndex.value = -1
}
async function handleSave() {
  if (store.isEmpty) {
    Notify.create({ message: 'No items in order', color: 'orange', position: 'top', timeout: 800 })
    return
  }

  Loading.show({ message: 'Sending to kitchen...' })
  try {
    const result = await store.sendToKitchen()
    if (result && result.success) {
      Loading.hide()
      Notify.create({
        message: `Order #${result.order.order_number ?? result.order.id.slice(0, 8).toUpperCase()} saved!`,
        color: 'teal',
        icon: 'check_circle',
        position: 'top',
        timeout: 3000,
      })
      // store.clearCart() // User wants items to stay on screen until payment
      selectedItemIndex.value = -1
    }
  } catch (err) {
    Loading.hide()
    Notify.create({
      message: 'Failed to save',
      caption: err.message,
      color: 'red',
      position: 'top',
    })
  }
}

function handlePayment() {
  if (store.isEmpty) {
    Notify.create({ message: 'No items in order', color: 'orange', position: 'top', timeout: 800 })
    return
  }
  selectedQueueOrder.value = null // ensure manual POS mode
  paymentDialog.value = true
}

function handleSubtotal() {
  // Open bill preview — same dialog but user can print before paying
  if (store.isEmpty) {
    Notify.create({ message: 'No items in order', color: 'orange', position: 'top', timeout: 800 })
    return
  }
  selectedQueueOrder.value = null // ensure manual POS mode
  paymentDialog.value = true
}

async function handleConfirmPayment(payload) {
  isProcessingPayment.value = true
  try {
    const method = typeof payload === 'string' ? payload : payload.method
    const methodName = method === 'cash' ? 'Cash' : method === 'card' ? 'Card' : 'Online'
    const result = await store.processPayment(methodName)
    if (result && result.success) {
      // Mark the dialog as paid (shows success state + real invoice receipt)
      if (paymentDialogRef.value) {
        paymentDialogRef.value.markAsPaid(result.orderId)
      }
      Notify.create({
        message: `Payment Successful!`,
        caption: `Order paid via ${methodName}`,
        color: 'positive',
        icon: 'verified',
        position: 'top',
        timeout: 2000,
      })
    }
  } catch (err) {
    Notify.create({
      message: 'Payment Failed',
      caption: err.message,
      color: 'red',
      position: 'top',
    })
  } finally {
    isProcessingPayment.value = false
  }
}

function handleNewOrderAfterPayment() {
  store.clearCart()
  selectedItemIndex.value = -1
  numBuffer.value = ''
  selectedQueueOrder.value = null
}

// ── Billing Queue ───────────────────────────────────────
function openBilling(order) {
  selectedQueueOrder.value = order
  paymentDialog.value = true

  // Auto-print bill when opening an unpaid order from the queue
  const isPaid = order.status === 'paid' || order.payment_status === 'paid'
  if (!isPaid) {
    setTimeout(async () => {
      if (paymentDialogRef.value?.printBill) {
        await paymentDialogRef.value.printBill()
      }
    }, 350)
  }
}

function onOrderPaid() {
  // Called when a queue order payment completes inside PaymentDialog
  selectedQueueOrder.value = null
  cashierStore.fetchBillingOrders()
}

function handleLogout() {
  $q.dialog({
    title: 'Log Out',
    message: 'Are you sure you want to log out?',
    dark: true,
    cancel: { flat: true, color: 'grey-5', noCaps: true },
    ok: { color: 'red', unelevated: true, noCaps: true, label: 'Log Out' },
  }).onOk(async () => {
    await authStore.logout()
    router.push('/login')
  })
}

function scrollCategoriesUp() {
  if (categoryGridRef.value) {
    categoryGridRef.value.scrollTop -= 80
  }
}

function scrollCategoriesDown() {
  if (categoryGridRef.value) {
    categoryGridRef.value.scrollTop += 80
  }
}

// ── Helpers ─────────────────────────────────────────────
function fmtCurrency(val) {
  return parseFloat(val || 0).toFixed(2)
}
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   POS Terminal — CT Cloud POS Style
   ══════════════════════════════════════════════════════════ */

.pos-terminal {
  padding: 0 !important;
  height: calc(100vh - 52px);
  max-height: calc(100vh - 52px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #0e1a2e;
  font-family: 'Segoe UI', 'Arial', sans-serif;
  user-select: none;
}

/* ── TOP STATUS BAR ── */
.pos-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  min-height: 48px;
  background: linear-gradient(180deg, #1a2e4a 0%, #0e1a2e 100%);
  border-top: 3px solid #2196f3;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0 8px;
  gap: 8px;
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.top-version {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
}

.top-sep {
  color: rgba(255, 255, 255, 0.2);
  font-size: 10px;
}

.top-branch {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  white-space: nowrap;
}

.top-bar-center {
  flex: 0 0 auto;
}

.top-user-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.06);
  padding: 3px 12px;
  border-radius: 4px;
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.top-info-grid {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  min-width: 48px;
  text-align: right;
}

.info-value {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  min-width: 60px;
  text-align: right;
}

.top-total-box {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 4px 14px;
  text-align: center;
  min-width: 100px;
}

.total-label-top {
  font-size: 10px;
  color: #f44336;
  font-weight: 700;
  text-transform: uppercase;
}

.total-value-top {
  font-size: 18px;
  font-weight: 800;
  color: #4caf50;
  font-variant-numeric: tabular-nums;
}

/* ── MAIN BODY ── */
.pos-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  gap: 2px;
}

/* ═══ LEFT PANEL — Order Items ═══ */
.pos-left-panel {
  width: 300px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  background: #0a1628;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.customer-bar {
  display: flex;
  gap: 4px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.cust-field {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
}

.cust-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
}

.cust-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  outline: none;
}

.cust-input::placeholder {
  color: rgba(255, 255, 255, 0.25);
}

.cust-value {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 600;
}

.order-items-table-wrap {
  flex: 1;
  overflow-y: auto;
}

.order-items-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.order-items-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.order-items-table th {
  background: #1a2a4a;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 600;
  font-size: 10px;
  padding: 4px 6px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.th-num {
  width: 24px;
  text-align: center;
}
.th-qty {
  width: 36px;
  text-align: center;
}
.th-amt {
  width: 70px;
  text-align: right;
}

.order-items-table td {
  padding: 4px 6px;
  color: rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.td-num {
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
}
.td-qty {
  text-align: center;
  font-weight: 600;
}
.td-amt {
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.order-items-table tr.selected {
  background: rgba(33, 150, 243, 0.2);
  outline: 1px solid rgba(33, 150, 243, 0.4);
}

.order-items-table tr:not(.empty-row):hover {
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
}

.empty-row td {
  height: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
}

.item-variant {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
}

/* ═══ CENTER PANEL — Categories + Functions ═══ */
.pos-center-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  min-width: 0;
}

.pos-search-bar {
  margin-bottom: 4px;
}

.search-input :deep(.q-field__control) {
  height: 34px !important;
  min-height: 34px !important;
  background: rgba(0, 0, 0, 0.2) !important;
  border-radius: 6px !important;
}

.search-input :deep(.q-field__native) {
  font-size: 11px !important;
}
.search-res-btn {
  background: linear-gradient(180deg, #2a62a4 0%, #1a4a8a 100%) !important;
}

.scroll-arrow-btn {
  width: 100%;
  height: 24px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}

.scroll-arrow-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  overflow-y: auto;
  flex: 1;
  scrollbar-width: none;
}

.category-grid::-webkit-scrollbar {
  display: none;
}

.cat-btn {
  padding: 8px 6px;
  background: linear-gradient(180deg, #7a9e2e 0%, #5a7e1e 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  cursor: pointer;
  text-align: center;
  transition: all 0.1s;
  min-height: 34px;
}

.cat-btn:hover {
  filter: brightness(1.15);
}

.cat-btn.active {
  background: linear-gradient(180deg, #96be3e 0%, #7a9e2e 100%);
  border-color: #b8d555;
  box-shadow: 0 0 8px rgba(150, 190, 62, 0.3);
}

.func-menu-btn {
  width: 100%;
  padding: 6px;
  background: linear-gradient(180deg, #3a5a8e 0%, #2a4a7e 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  cursor: pointer;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

/* ── Function Buttons ── */
.function-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  flex-shrink: 0;
}

.fn-btn {
  padding: 6px 4px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  text-align: center;
  transition: all 0.1s;
}

.fn-blue {
  background: linear-gradient(180deg, #2a62a4 0%, #1a4a8a 100%);
}

.fn-blue:hover {
  filter: brightness(1.2);
}

.fn-wide {
  grid-column: span 1;
}

/* ── Order Type Buttons ── */
.order-type-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  flex-shrink: 0;
}

.ot-btn {
  padding: 10px 4px;
  background: linear-gradient(180deg, #2a62a4 0%, #1a4a8a 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  text-align: center;
  transition: all 0.1s;
}

.ot-btn.active {
  background: linear-gradient(180deg, #4caf50 0%, #388e3c 100%);
  border-color: #66bb6a;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.3);
}

.ot-btn:hover {
  filter: brightness(1.2);
}

/* ── Bottom Action Buttons ── */
.bottom-actions {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 3px;
  flex-shrink: 0;
}

.ba-btn {
  padding: 8px 4px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  text-align: center;
  transition: all 0.1s;
  line-height: 1.2;
}

.ba-blue {
  background: linear-gradient(180deg, #2a62a4 0%, #1a4a8a 100%);
}

.ba-save {
  background: linear-gradient(180deg, #3a7ab4 0%, #2a62a4 100%);
}

.ba-payment {
  background: linear-gradient(180deg, #7e8ea4 0%, #5e6e84 100%);
  font-size: 10px;
}

.ba-btn:hover {
  filter: brightness(1.2);
}

/* ═══ RIGHT PANEL — Numeric Keypad ═══ */
.pos-right-panel {
  width: 160px;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.15);
}

.numpad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.num-btn {
  padding: 8px 4px;
  background: linear-gradient(180deg, #c8d84e 0%, #a8b83e 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #1a1a1a;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
  text-align: center;
  transition: all 0.1s;
}

.num-btn:hover {
  filter: brightness(1.1);
  transform: scale(1.02);
}

.num-btn:active {
  transform: scale(0.95);
}

.num-x {
  background: linear-gradient(180deg, #e8a84e 0%, #c8883e 100%);
  color: #fff;
}

.enter-btn {
  padding: 12px 4px;
  background: linear-gradient(180deg, #8e9ec8 0%, #6e7ea8 100%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.enter-btn:hover {
  filter: brightness(1.15);
}

.subtotal-btn {
  padding: 10px 4px;
  background: linear-gradient(180deg, #9ea8c8 0%, #7e88a8 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  margin-top: auto;
}

.subtotal-btn:hover {
  filter: brightness(1.15);
}

/* ── BOTTOM BAR ── */
.pos-bottom-bar {
  display: flex;
  align-items: stretch;
  height: 60px;
  min-height: 60px;
  background: #0a1220;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.subcat-tabs {
  flex: 1;
  display: flex;
  gap: 3px;
  padding: 4px;
  overflow-x: auto;
  align-items: stretch;
  scrollbar-width: none;
}

.subcat-tabs::-webkit-scrollbar {
  display: none;
}

.subcat-btn {
  padding: 4px 10px;
  background: linear-gradient(180deg, #1a2e4a 0%, #0e1a2e 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  min-width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
}

.subcat-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}

.subcat-btn.active {
  background: linear-gradient(180deg, #2a62a4 0%, #1a4a8a 100%);
  color: #fff;
  border-color: rgba(33, 150, 243, 0.3);
}

.bottom-right-actions {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 4px;
  gap: 4px;
}

.logout-btn {
  padding: 8px 16px;
  background: linear-gradient(180deg, #4caf50 0%, #388e3c 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.logout-btn:hover {
  filter: brightness(1.15);
}

/* ── Item Picker Dialog ── */
.item-picker-card {
  background: #0e1a2e;
  max-height: 60vh;
}

.item-picker-grid-section {
  max-height: 50vh;
  overflow-y: auto;
}

.item-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 6px;
}

.item-pick-btn {
  padding: 0;
  background: linear-gradient(180deg, #7a9e2e 0%, #5a7e1e 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  text-align: center;
  transition: all 0.1s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.item-pick-btn:hover {
  filter: brightness(1.15);
  transform: scale(1.02);
}

.item-pick-btn:active {
  transform: scale(0.95);
}

.item-card-img,
.item-card-img-placeholder {
  width: 100%;
  height: 70px;
  object-fit: cover;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.item-card-img-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
}

.item-card-text {
  padding: 6px;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.ipb-name {
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 2px;
  line-height: 1.1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ipb-price {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 700;
}
</style>
