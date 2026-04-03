<template>
  <q-page class="waiter-pos">
    <!-- ══════════════════════════════════════════════════════
         TOP BAR
         ══════════════════════════════════════════════════════ -->
    <div class="wpos-top-bar">
      <div class="wpos-top-left">
        <q-btn flat dense round icon="arrow_back" size="sm" color="grey-7" @click="goBack" />
        <div class="wpos-brand-wrap">
          <div class="wpos-brand-title">New Order</div>
          <div class="wpos-brand-sub">
            <q-icon name="storefront" size="10px" class="q-mr-xs" />Waiter POS
          </div>
        </div>
      </div>
      <div class="wpos-top-right">
        <div class="wpos-total-box" :class="{ 'wpos-total-box--active': store.total > 0 }">
          <div class="wpos-total-label">Order Total</div>
          <div class="wpos-total-value">
            <span class="wpos-total-curr">LKR</span>
            {{ fmtCurrency(store.total) }}
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════
         MAIN BODY
         ══════════════════════════════════════════════════════ -->
    <div class="wpos-body">
      <!-- ═══ LEFT PANEL: Order Items ═══ -->
      <div class="wpos-left">
        <!-- Order Info -->
        <div class="wpos-order-info">
          <div class="wpos-info-field">
            <span class="wpos-info-label">Type</span>
            <div class="wpos-type-btns">
              <button
                class="wpos-type-btn"
                :class="{ active: store.orderType === 'dine-in' }"
                @click="store.orderType = 'dine-in'"
              >
                <q-icon name="table_restaurant" size="14px" /> Dine-In
              </button>
              <button
                class="wpos-type-btn"
                :class="{ active: store.orderType === 'takeaway' }"
                @click="store.orderType = 'takeaway'"
              >
                <q-icon name="takeout_dining" size="14px" /> Takeaway
              </button>
            </div>
          </div>
          <div class="wpos-info-field" v-if="store.orderType === 'dine-in'">
            <span class="wpos-info-label">Table</span>
            <button class="wpos-table-trigger" @click="tablePickerOpen = true">
              <q-icon name="table_restaurant" size="14px" />
              <span v-if="selectedTableNum">Table {{ selectedTableNum }}</span>
              <span v-else class="wpos-table-placeholder">Select Table</span>
              <q-icon name="expand_more" size="14px" class="q-ml-auto" />
            </button>
          </div>

          <!-- Table Picker Dialog -->
          <q-dialog v-model="tablePickerOpen" position="bottom">
            <q-card class="wpos-table-picker-card">
              <q-card-section class="row items-center q-pb-sm">
                <q-icon name="table_restaurant" color="orange" size="20px" class="q-mr-sm" />
                <span class="text-subtitle1 text-weight-bold">Select Table</span>
                <q-space />
                <q-btn flat round dense icon="close" color="grey-5" v-close-popup />
              </q-card-section>
              <q-separator />
              <q-card-section class="wpos-table-grid-section">
                <div class="wpos-table-grid">
                  <button
                    v-for="n in 80"
                    :key="n"
                    class="wpos-table-num-btn"
                    :class="{ active: selectedTableNum === n }"
                    @click="selectTableNum(n)"
                  >
                    {{ n }}
                  </button>
                </div>
              </q-card-section>
            </q-card>
          </q-dialog>

          <div class="wpos-info-field">
            <span class="wpos-info-label">Guest</span>
            <input v-model="store.customerName" class="wpos-cust-input" placeholder="Walk-in Customer" />
          </div>
        </div>

        <!-- Cart Items -->
        <div class="wpos-cart-wrap">
          <div class="wpos-cart-header">
            <span class="wpos-cart-col wpos-col-num">#</span>
            <span class="wpos-cart-col wpos-col-name">Item</span>
            <span class="wpos-cart-col wpos-col-qty">Qty</span>
            <span class="wpos-cart-col wpos-col-amt">Amount</span>
            <span class="wpos-cart-col wpos-col-act"></span>
          </div>
          <div class="wpos-cart-items" v-if="store.cartItems.length">
            <div
              v-for="(item, idx) in store.cartItems"
              :key="item.id"
              class="wpos-cart-item"
              :class="{ selected: selectedItemIdx === idx }"
              @click="selectedItemIdx = idx"
            >
              <span class="wpos-cart-col wpos-col-num">{{ idx + 1 }}</span>
              <span class="wpos-cart-col wpos-col-name">
                {{ item.name }}
                <span v-if="item.variant" class="wpos-variant">({{ item.variant }})</span>
                <span v-if="item.notes" class="wpos-notes">📝 {{ item.notes }}</span>
              </span>
              <span class="wpos-cart-col wpos-col-qty">
                <button class="qty-btn" @click.stop="changeQty(idx, -1)">−</button>
                <span class="qty-val">{{ item.qty }}</span>
                <button class="qty-btn" @click.stop="changeQty(idx, 1)">+</button>
              </span>
              <span class="wpos-cart-col wpos-col-amt">{{
                fmtCurrency(item.price * item.qty)
              }}</span>
              <span class="wpos-cart-col wpos-col-act">
                <q-btn flat dense round icon="close" size="xs" color="red-4" @click.stop="removeItem(idx)" />
              </span>
            </div>
          </div>
          <div v-else class="wpos-cart-empty">
            <div class="wpos-cart-empty__icon">
              <q-icon name="receipt_long" size="32px" color="grey-4" />
            </div>
            <div class="wpos-empty-title">No items yet</div>
            <div class="wpos-empty-sub">Search or browse the menu to add items</div>
          </div>
        </div>

        <!-- Cart Summary -->
        <div class="wpos-cart-summary" v-if="store.cartItems.length">
          <div class="wpos-summary-row">
            <span>Items</span>
            <span>{{ store.itemCount }}</span>
          </div>
          <div class="wpos-summary-row wpos-summary-total">
            <span>Total</span>
            <span>LKR {{ fmtCurrency(store.total) }}</span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="wpos-actions">
          <q-btn
            unelevated no-caps dense
            color="grey-3" text-color="grey-8"
            icon="delete_outline" label="Clear"
            class="wpos-action-btn"
            @click="handleClear"
            :disable="store.isEmpty"
          />
          <q-btn
            unelevated no-caps dense
            color="amber-2" text-color="amber-10"
            icon="note_add" label="Note"
            class="wpos-action-btn"
            @click="handleAddNote"
            :disable="selectedItemIdx < 0"
          />
          <q-btn
            unelevated no-caps dense
            class="wpos-action-btn wpos-send-btn"
            icon="send" label="SEND TO KITCHEN"
            :loading="store.isSending"
            :disable="store.isEmpty"
            @click="handleSendToKitchen"
          />
        </div>
      </div>

      <!-- ═══ RIGHT PANEL: Menu Browser ═══ -->
      <div class="wpos-right">
        <!-- Search Bar -->
        <div class="wpos-search-wrap">
          <q-input
            v-model="searchQuery"
            dense outlined
            placeholder="Search menu items..."
            class="wpos-search-input"
          >
            <template v-slot:prepend>
              <q-icon name="search" size="18px" color="grey-5" />
            </template>
            <template v-slot:append v-if="searchQuery">
              <q-icon name="close" size="14px" class="cursor-pointer" @click="searchQuery = ''" />
            </template>
          </q-input>
        </div>

        <!-- Category Tabs -->
        <div class="wpos-cat-tabs" v-if="!searchQuery">
          <button
            v-for="cat in categories"
            :key="cat.id"
            class="wpos-cat-tab"
            :class="{ active: selectedCategory === cat.name }"
            @click="selectedCategory = cat.name"
          >
            {{ cat.name }}
          </button>
        </div>

        <!-- Items Grid -->
        <div class="wpos-items-grid">
          <!-- Search Results -->
          <template v-if="searchQuery">
            <button
              v-for="item in searchResults"
              :key="'s-' + item.id"
              class="wpos-item-btn"
              @click="addToCart(item)"
            >
              <div class="wpos-item-thumb">
                <img v-if="item.image" :src="item.image" class="wpos-item-img" loading="lazy" />
                <q-icon v-else name="restaurant" size="20px" color="orange-4" />
              </div>
              <div class="wpos-item-info">
                <div class="wpos-item-name">{{ item.name }}</div>
                <div class="wpos-item-price">LKR {{ item.price.toFixed(0) }}</div>
              </div>
            </button>
            <div v-if="searchResults.length === 0" class="wpos-no-items">
              <q-icon name="search_off" size="32px" color="grey-4" />
              <div>No items found</div>
            </div>
          </template>

          <!-- Category Items -->
          <template v-else>
            <button
              v-for="item in filteredItems"
              :key="item.id"
              class="wpos-item-btn"
              @click="addToCart(item)"
            >
              <div class="wpos-item-thumb">
                <img v-if="item.image" :src="item.image" class="wpos-item-img" loading="lazy" />
                <q-icon v-else name="restaurant" size="20px" color="orange-4" />
              </div>
              <div class="wpos-item-info">
                <div class="wpos-item-name">{{ item.name }}</div>
                <div class="wpos-item-price">LKR {{ item.price.toFixed(0) }}</div>
              </div>
            </button>
            <div v-if="filteredItems.length === 0" class="wpos-no-items">
              <q-icon name="inventory_2" size="32px" color="grey-4" />
              <div>No items in this category</div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Notify, Loading } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useOrderStore } from 'src/stores/orderStore'
import { useAuthStore } from 'src/stores/auth'

const router = useRouter()
const store = useOrderStore()
const authStore = useAuthStore()

// ── State ────────────────────────────────────────────────
const searchQuery = ref('')
const selectedCategory = ref('All')
const selectedItemIdx = ref(-1)
const menuProducts = ref([])
const categories = ref([])
const selectedTableNum = ref(null)
const tablePickerOpen = ref(false)

// ── Computed ─────────────────────────────────────────────
const searchResults = computed(() => {
  if (!searchQuery.value) return []
  const q = searchQuery.value.toLowerCase()
  return menuProducts.value.filter(
    (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
  )
})

const filteredItems = computed(() => {
  if (selectedCategory.value === 'All') return menuProducts.value
  return menuProducts.value.filter((p) => p.category === selectedCategory.value)
})

// ── Fetch Menu ───────────────────────────────────────────
async function fetchMenuItems() {
  try {
    let products = []
    const branchId = authStore.currentBranch?.id

    // Try menu book first
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
        const { data: bookItems, error: bookError } = await supabase
          .from('menu_book_items')
          .select(
            `
            id, override_price, is_available, sort_order,
            menu_items(id, name, base_price, image_url, is_available, kitchen_id, sub_category_id, categories(id, name))
          `,
          )
          .eq('menu_book_id', bookData.id)
          .eq('is_available', true)
          .order('sort_order')

        if (!bookError && bookItems?.length) {
          products = bookItems
            .filter((bi) => bi.menu_items?.is_available)
            .map((bi) => ({
              id: bi.menu_items.id,
              name: bi.menu_items.name,
              price: parseFloat(bi.override_price || bi.menu_items.base_price || 0),
              kitchen_id: bi.menu_items.kitchen_id,
              image: bi.menu_items.image_url || '',
              category: bi.menu_items.categories?.name || 'Other',
            }))
        }
      }
    }

    // Fallback: load all items
    if (!products.length) {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, base_price, image_url, is_available, kitchen_id, categories(id, name)')
        .eq('is_available', true)
        .order('name')

      if (error) throw error

      products = (data || []).map((item) => ({
        id: item.id,
        name: item.name,
        price: parseFloat(item.base_price || 0),
        kitchen_id: item.kitchen_id,
        image: item.image_url || '',
        category: item.categories?.name || 'Other',
      }))
    }

    menuProducts.value = products

    // Build categories
    const seen = new Set()
    const cats = [{ id: 'all', name: 'All' }]
    for (const item of products) {
      if (!seen.has(item.category)) {
        seen.add(item.category)
        cats.push({ id: item.category, name: item.category })
      }
    }
    categories.value = cats
  } catch (err) {
    console.error('[WaiterPOS] Failed to load menu:', err)
    Notify.create({ message: 'Failed to load menu', caption: err.message, color: 'red' })
  }
}

onMounted(() => {
  store.clearCart() // Fresh order
  fetchMenuItems()
})

// ── Actions ──────────────────────────────────────────────
function goBack() {
  router.push('/waiter-app')
}

function addToCart(product) {
  store.addItem(product)
  Notify.create({
    message: `${product.name} added`,
    color: 'positive',
    icon: 'add_circle',
    position: 'top',
    timeout: 500,
  })
}

function changeQty(idx, delta) {
  const item = store.cartItems[idx]
  const newQty = item.qty + delta
  if (newQty <= 0) {
    store.removeItem(idx)
    selectedItemIdx.value = -1
  } else {
    store.updateQuantity(idx, newQty)
  }
}

function removeItem(idx) {
  store.removeItem(idx)
  selectedItemIdx.value = -1
}

function handleClear() {
  store.clearCart()
  selectedItemIdx.value = -1
}

function handleAddNote() {
  if (selectedItemIdx.value < 0) return
  const item = store.cartItems[selectedItemIdx.value]
  const note = prompt(`Note for "${item.name}":`, item.notes || '')
  if (note !== null) {
    store.setItemNotes(selectedItemIdx.value, note)
    Notify.create({ message: 'Note updated', color: 'positive', position: 'top', timeout: 600 })
  }
}

function selectTableNum(num) {
  selectedTableNum.value = num
  store.tableNumber = num
  tablePickerOpen.value = false
}

async function handleSendToKitchen() {
  if (store.isEmpty) return

  Loading.show({ message: 'Sending to kitchen…' })
  try {
    const result = await store.sendToKitchen()
    Loading.hide()

    if (result?.success) {
      Notify.create({
        message: `Order #${result.order.order_number ?? result.order.id.slice(0, 8).toUpperCase()} sent!`,
        caption: 'Order has been sent to kitchen successfully',
        color: 'teal',
        icon: 'check_circle',
        position: 'top',
        timeout: 3000,
      })
      // Clear and go back to home
      store.clearCart()
      selectedItemIdx.value = -1
      router.push('/waiter-app')
    }
  } catch (err) {
    Loading.hide()
    Notify.create({
      message: 'Failed to send order',
      caption: err.message,
      color: 'red',
      icon: 'error',
      position: 'top',
    })
  }
}

// ── Helpers ──────────────────────────────────────────────
function fmtCurrency(val) {
  return parseFloat(val || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
</script>

<style lang="scss" scoped>
// ─── Layout ─────────────────────────────────────────────────────────────────
.waiter-pos {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  padding: 0 !important;
  font-family: 'Inter', 'Roboto', sans-serif;
}

// ─── Top Bar ────────────────────────────────────────────────────────────────
.wpos-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  height: 56px;
  min-height: 56px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  position: sticky;
  top: 0;
  z-index: 10;
}

.wpos-top-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wpos-brand-wrap {
  display: flex;
  flex-direction: column;
}
.wpos-brand-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.3px;
  line-height: 1.15;
}
.wpos-brand-sub {
  font-size: 0.62rem;
  font-weight: 600;
  color: #94a3b8;
  display: flex;
  align-items: center;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.wpos-top-right {
  display: flex;
  align-items: center;
}

.wpos-total-box {
  text-align: right;
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  padding: 6px 14px;
  transition: all 0.25s ease;

  &--active {
    background: linear-gradient(135deg, #fff7ed, #fef3c7);
    border-color: #fdba74;
    box-shadow: 0 2px 8px rgba(234, 88, 12, 0.1);
  }
}

.wpos-total-label {
  font-size: 0.55rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.wpos-total-value {
  font-size: 1.15rem;
  font-weight: 800;
  color: #ea580c;
  line-height: 1.1;
}
.wpos-total-curr {
  font-size: 0.65rem;
  font-weight: 600;
  color: #94a3b8;
  margin-right: 2px;
}

// ─── Body ───────────────────────────────────────────────────────────────────
.wpos-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

// ─── Left Panel (Cart) ─────────────────────────────────────────────────────
.wpos-left {
  width: 340px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e2e8f0;
  background: #fff;
}

// Order Info
.wpos-order-info {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid #e2e8f0;
  background: #fafbfc;
}

.wpos-info-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wpos-info-label {
  font-size: 0.62rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  min-width: 50px;
}

.wpos-type-btns {
  display: flex;
  gap: 6px;
}

.wpos-type-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  &.active {
    background: #fff7ed;
    border-color: #fb923c;
    color: #ea580c;
    box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.08);
  }
}

// Table Picker
.wpos-table-trigger {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  color: #1e293b;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: #fdba74;
    background: #fff7ed;
  }
}

.wpos-table-placeholder {
  color: #94a3b8;
  font-weight: 400;
}

:deep(.wpos-table-picker-card) {
  background: #fff !important;
  border: 1px solid #e2e8f0;
  border-radius: 18px 18px 0 0 !important;
  max-height: 60vh;
  width: 100%;
  max-width: 520px;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
}

.wpos-table-grid-section {
  padding: 12px !important;
  overflow-y: auto;
  max-height: 50vh;
}

.wpos-table-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
}

.wpos-table-num-btn {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  color: #1e293b;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #fff7ed;
    border-color: #fdba74;
    color: #ea580c;
  }
  &:active { transform: scale(0.92); }
  &.active {
    background: #fff7ed;
    border-color: #ea580c;
    color: #ea580c;
    box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.12);
  }
}

.wpos-cust-input {
  flex: 1;
  height: 32px;
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 8px;
  color: #1e293b;
  padding: 0 10px;
  font-size: 0.78rem;
  font-weight: 500;
  outline: none;
  transition: border-color 0.15s;

  &:focus { border-color: #fb923c; }
  &::placeholder { color: #cbd5e1; }
}

// ─── Cart ───────────────────────────────────────────────────────────────────
.wpos-cart-wrap {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
}

.wpos-cart-header {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.6rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.wpos-cart-col {
  &.wpos-col-num { width: 24px; text-align: center; }
  &.wpos-col-name { flex: 1; min-width: 0; }
  &.wpos-col-qty { width: 80px; text-align: center; }
  &.wpos-col-amt { width: 70px; text-align: right; }
  &.wpos-col-act { width: 28px; text-align: center; }
}

.wpos-cart-items {
  padding: 0;
}

.wpos-cart-item {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.12s;
  font-size: 0.78rem;
  color: #1e293b;

  &:hover { background: #fafbfc; }
  &.selected {
    background: #fff7ed;
    border-left: 3px solid #ea580c;
    padding-left: 11px;
  }
}

.wpos-variant {
  font-size: 0.65rem;
  color: #94a3b8;
  margin-left: 4px;
}

.wpos-notes {
  display: block;
  font-size: 0.62rem;
  color: #d97706;
  font-style: italic;
  margin-top: 2px;
}

.qty-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  color: #1e293b;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;

  &:hover { background: #fff7ed; border-color: #fdba74; }
  &:active { transform: scale(0.9); }
}

.qty-val {
  font-weight: 700;
  font-size: 0.82rem;
  min-width: 24px;
  text-align: center;
  color: #0f172a;
}

.wpos-cart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 48px 20px;

  &__icon {
    width: 60px; height: 60px; border-radius: 16px;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 6px;
  }
}

.wpos-empty-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #94a3b8;
}
.wpos-empty-sub {
  font-size: 0.7rem;
  color: #cbd5e1;
}

// ─── Summary ────────────────────────────────────────────────────────────────
.wpos-cart-summary {
  padding: 10px 14px;
  border-top: 1px solid #e2e8f0;
  background: #fafbfc;
}

.wpos-summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #64748b;
  padding: 2px 0;

  &.wpos-summary-total {
    font-size: 0.95rem;
    font-weight: 800;
    color: #ea580c;
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px dashed #e2e8f0;
  }
}

// ─── Action Buttons ─────────────────────────────────────────────────────────
.wpos-actions {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}

.wpos-action-btn {
  flex: 1;
  height: 44px;
  border-radius: 10px !important;
  font-size: 0.72rem !important;
  font-weight: 700 !important;
}

.wpos-send-btn {
  flex: 2;
  background: linear-gradient(135deg, #059669, #10b981) !important;
  color: white !important;
  font-size: 0.75rem !important;
  letter-spacing: 0.3px;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
  transition: box-shadow 0.3s ease;

  &:hover { box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35); }
}

// ─── Right Panel (Menu Browser) ──────────────────────────────────────────────
.wpos-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}

// Search
.wpos-search-wrap {
  padding: 10px 14px;
  border-bottom: 1px solid #e2e8f0;
}

.wpos-search-input {
  :deep(.q-field__control) {
    border-radius: 10px !important;
    background: #f8fafc !important;
    border: 1.5px solid #e2e8f0 !important;
    height: 36px;
  }
  :deep(.q-field__native) {
    font-size: 0.82rem;
    color: #1e293b;
  }
}

// Category Tabs
.wpos-cat-tabs {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  overflow-x: auto;
  flex-shrink: 0;
  border-bottom: 1px solid #e2e8f0;
  background: #fafbfc;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { height: 0; }
}

.wpos-cat-tab {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;

  &.active {
    background: #fff7ed;
    border-color: #fb923c;
    color: #ea580c;
    box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.06);
  }
  &:hover:not(.active) { background: #f8fafc; }
}

// Items Grid
.wpos-items-grid {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
  align-content: start;
}

.wpos-item-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px 10px;
  border-radius: 12px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  color: #1e293b;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;

  &:hover {
    border-color: #fdba74;
    background: #fff7ed;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }
  &:active { transform: scale(0.97); }
}

.wpos-item-thumb {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.wpos-item-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
}

.wpos-item-info {
  min-width: 0;
  width: 100%;
}

.wpos-item-name {
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1e293b;
}

.wpos-item-price {
  font-size: 0.68rem;
  font-weight: 700;
  color: #059669;
  margin-top: 3px;
}

.wpos-no-items {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 56px 20px;
  color: #94a3b8;
  font-size: 0.78rem;
}

// ─── Mobile: stack panels vertically ─────────────────────────────────────────
@media (max-width: 720px) {
  .wpos-body {
    flex-direction: column-reverse;
  }

  .wpos-left {
    width: 100%;
    min-width: 100%;
    max-height: 42vh;
    border-right: none;
    border-top: 2px solid #e2e8f0;
  }

  .wpos-right {
    flex: 1;
    min-height: 0;
  }

  .wpos-items-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
    padding: 10px;
  }

  .wpos-item-thumb {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    margin-bottom: 6px;
  }

  .wpos-table-grid {
    grid-template-columns: repeat(6, 1fr);
  }
}
</style>

/* ══════════════════════════════════════════════════
   DARK MODE OVERRIDES (WaiterPOSPage)
   ══════════════════════════════════════════════════ */
<style lang="scss">
body.body--dark {
  .waiter-pos {
    background: #0f172a;
    color: #e2e8f0;

    // ── Top Bar ──
    .wpos-top-bar {
      background: #1e293b;
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }
    .wpos-brand-title { color: #f8fafc; }
    .wpos-total-box {
      background: #0f172a;
      border-color: rgba(255, 255, 255, 0.08);
    }
    .wpos-total-box--active {
      background: rgba(234, 88, 12, 0.1);
      border-color: #f97316;
    }

    // ── Left Panel ──
    .wpos-left {
      background: #1e293b;
      border-right-color: rgba(255, 255, 255, 0.08);
    }
    .wpos-order-info {
      background: rgba(255, 255, 255, 0.02);
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }
    .wpos-type-btn {
      background: #1e293b;
      border-color: rgba(255, 255, 255, 0.12);
      color: #94a3b8;
      &.active {
        background: rgba(234, 88, 12, 0.1);
        border-color: #ea580c;
        color: #fb923c;
      }
    }
    .wpos-table-trigger, .wpos-cust-input {
      background: #1e293b;
      border-color: rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
      &:hover, &:focus {
        border-color: #fb923c;
        background: rgba(234, 88, 12, 0.05);
      }
    }

    // ── Cart & Items ──
    .wpos-cart-header {
      background: #0f172a;
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }
    .wpos-cart-item {
      border-bottom-color: rgba(255, 255, 255, 0.03);
      color: #e2e8f0;
      &:hover { background: rgba(255, 255, 255, 0.03); }
      &.selected {
        background: rgba(234, 88, 12, 0.08);
      }
    }
    .wpos-cart-summary {
      background: #0f172a;
      border-top-color: rgba(255, 255, 255, 0.08);
    }
    .wpos-actions {
      border-top-color: rgba(255, 255, 255, 0.08);
      background: #1e293b;
    }
    .wpos-action-btn:not(.wpos-send-btn) {
      background: rgba(255, 255, 255, 0.05) !important;
      color: #e2e8f0 !important;
    }

    // ── Right Panel (Menu) ──
    .wpos-search-wrap {
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }
    .q-field--outlined .q-field__control:before {
      border-color: rgba(255, 255, 255, 0.12);
    }
    .wpos-cat-tabs {
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }
    .wpos-cat-tab {
      color: #94a3b8;
      &.active {
        color: #fb923c;
      }
      &.active::after {
        background: #fb923c;
      }
    }
    .wpos-item-btn {
      background: #1e293b;
      border-color: rgba(255, 255, 255, 0.05);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      &:hover {
        background: #334155;
        border-color: #fb923c;
      }
      .wpos-item-name { color: #f8fafc; }
    }
    .wpos-no-items { color: #64748b; }

    // ── Table Picker Dialog ──
    .wpos-table-picker-card,
    .wpos-table-picker-card .q-card__section,
    .wpos-table-grid-section {
      background: #1e293b !important;
      color: #e2e8f0;
    }
    .wpos-table-num-btn {
      background: #0f172a;
      border-color: rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
      &:hover {
        background: rgba(234, 88, 12, 0.1);
        border-color: #fb923c;
        color: #fb923c;
      }
      &.active {
        background: rgba(234, 88, 12, 0.15);
        border-color: #fb923c;
        color: #fb923c;
      }
    }
  }
}
</style>
