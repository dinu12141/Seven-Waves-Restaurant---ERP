<template>
  <q-page class="waiter-pos">
    <!-- ══════════════════════════════════════════════════════
         TOP BAR
         ══════════════════════════════════════════════════════ -->
    <div class="wpos-top-bar">
      <div class="wpos-top-left">
        <q-btn flat dense round icon="arrow_back" color="grey-4" @click="goBack" class="q-mr-xs" />
        <q-icon name="point_of_sale" size="20px" color="orange-5" />
        <span class="wpos-brand">Manual Order</span>
        <q-chip dense color="orange-9" text-color="white" class="wpos-chip">WAITER POS</q-chip>
      </div>
      <div class="wpos-top-right">
        <div class="wpos-total-box">
          <div class="wpos-total-label">Total</div>
          <div class="wpos-total-value">LKR {{ fmtCurrency(store.total) }}</div>
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
                <q-icon name="table_restaurant" size="14px" /> Table
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
          <div class="wpos-info-field wpos-table-field" v-if="store.orderType === 'dine-in'">
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
                    :class="{
                      active: selectedTableNum === n,
                    }"
                    @click="selectTableNum(n)"
                  >
                    {{ n }}
                  </button>
                </div>
              </q-card-section>
            </q-card>
          </q-dialog>
          <div class="wpos-info-field">
            <span class="wpos-info-label">Customer</span>
            <input v-model="store.customerName" class="wpos-cust-input" placeholder="Walk-in" />
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
                <span v-if="item.notes" class="wpos-notes">{{ item.notes }}</span>
              </span>
              <span class="wpos-cart-col wpos-col-qty">
                <button class="qty-btn" @click.stop="changeQty(idx, -1)">−</button>
                <span class="qty-val">{{ item.qty }}</span>
                <button class="qty-btn" @click.stop="changeQty(idx, 1)">+</button>
              </span>
              <span class="wpos-cart-col wpos-col-amt">{{ fmtCurrency(item.price * item.qty) }}</span>
              <span class="wpos-cart-col wpos-col-act">
                <q-btn flat dense round icon="close" size="xs" color="red-4" @click.stop="removeItem(idx)" />
              </span>
            </div>
          </div>
          <div v-else class="wpos-cart-empty">
            <q-icon name="receipt_long" size="40px" color="grey-8" />
            <div class="wpos-empty-text">Add items to start an order</div>
          </div>
        </div>

        <!-- Cart Summary -->
        <div class="wpos-cart-summary">
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
            unelevated
            color="grey-8"
            icon="delete_outline"
            label="Clear"
            no-caps
            class="wpos-action-btn"
            @click="handleClear"
            :disable="store.isEmpty"
          />
          <q-btn
            unelevated
            color="orange-9"
            icon="note_add"
            label="Note"
            no-caps
            class="wpos-action-btn"
            @click="handleAddNote"
            :disable="selectedItemIdx < 0"
          />
          <q-btn
            unelevated
            class="wpos-action-btn wpos-send-btn"
            icon="send"
            label="SEND TO KITCHEN"
            no-caps
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
            dense
            outlined
            placeholder="Search menu items..."
            class="wpos-search-input"
          >
            <template v-slot:prepend>
              <q-icon name="search" size="18px" color="orange-5" />
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
              <div class="wpos-item-icon">
                <q-icon name="restaurant" size="20px" color="orange-4" />
              </div>
              <div class="wpos-item-info">
                <div class="wpos-item-name">{{ item.name }}</div>
                <div class="wpos-item-price">LKR {{ item.price.toFixed(0) }}</div>
              </div>
            </button>
            <div v-if="searchResults.length === 0" class="wpos-no-items">
              <q-icon name="search_off" size="32px" color="grey-7" />
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
              <div class="wpos-item-icon">
                <img v-if="item.image" :src="item.image" class="wpos-item-img" loading="lazy" />
                <q-icon v-else name="restaurant" size="20px" color="orange-4" />
              </div>
              <div class="wpos-item-info">
                <div class="wpos-item-name">{{ item.name }}</div>
                <div class="wpos-item-price">LKR {{ item.price.toFixed(0) }}</div>
              </div>
            </button>
            <div v-if="filteredItems.length === 0" class="wpos-no-items">
              <q-icon name="inventory_2" size="32px" color="grey-7" />
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
    p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
  )
})

const filteredItems = computed(() => {
  if (selectedCategory.value === 'All') return menuProducts.value
  return menuProducts.value.filter(p => p.category === selectedCategory.value)
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
          .select(`
            id, override_price, is_available, sort_order,
            menu_items(id, name, base_price, image_url, is_available, kitchen_id, sub_category_id, categories(id, name))
          `)
          .eq('menu_book_id', bookData.id)
          .eq('is_available', true)
          .order('sort_order')

        if (!bookError && bookItems?.length) {
          products = bookItems
            .filter(bi => bi.menu_items?.is_available)
            .map(bi => ({
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

      products = (data || []).map(item => ({
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
  return parseFloat(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<style lang="scss" scoped>
// ── Layout ──────────────────────────────────────────────
.waiter-pos {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--erp-bg-page, #f1f5f9);
  padding: 0 !important;
}

// ── Top Bar ─────────────────────────────────────────────
.wpos-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #fff;
  border-bottom: 1px solid var(--erp-border, #e2e8f0);
  min-height: 52px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.wpos-top-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wpos-brand {
  font-size: 15px;
  font-weight: 700;
  color: var(--erp-text-primary, #1e293b);
  letter-spacing: -0.3px;
}

.wpos-chip {
  font-size: 9px !important;
  font-weight: 700 !important;
  height: 20px !important;
  letter-spacing: 1px;
}

.wpos-top-right {
  display: flex;
  align-items: center;
}

.wpos-total-box {
  text-align: right;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  padding: 6px 14px;
}

.wpos-total-label {
  font-size: 9px;
  font-weight: 600;
  color: var(--erp-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.wpos-total-value {
  font-size: 18px;
  font-weight: 800;
  color: #ea580c;
  line-height: 1.1;
}

// ── Body ────────────────────────────────────────────────
.wpos-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

// ── Left Panel (Cart) ───────────────────────────────────
.wpos-left {
  width: 340px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--erp-border, #e2e8f0);
  background: #fff;
}

// Order Info
.wpos-order-info {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid var(--erp-border, #e2e8f0);
}

.wpos-info-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wpos-info-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--erp-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  min-width: 60px;
}

.wpos-type-btns {
  display: flex;
  gap: 4px;
}

.wpos-type-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--erp-border, #e2e8f0);
  background: #fff;
  color: var(--erp-text-secondary, #64748b);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  &.active {
    background: #fff7ed;
    border-color: #fdba74;
    color: #ea580c;
  }
}

// Table Picker
.wpos-table-trigger {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--erp-border, #e2e8f0);
  background: #fff;
  color: var(--erp-text-primary, #1e293b);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: #fdba74;
    background: #fff7ed;
  }
}

.wpos-table-placeholder {
  color: var(--erp-text-muted, #94a3b8);
  font-weight: 400;
}

:deep(.wpos-table-picker-card) {
  background: #fff !important;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 16px 16px 0 0 !important;
  max-height: 60vh;
  width: 100%;
  max-width: 520px;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.12);
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
  border-radius: 8px;
  border: 1px solid var(--erp-border, #e2e8f0);
  background: #f8fafc;
  color: var(--erp-text-primary, #1e293b);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #fff7ed;
    border-color: #fdba74;
    color: #ea580c;
  }

  &:active {
    transform: scale(0.92);
  }

  &.active {
    background: #fff7ed;
    border-color: #ea580c;
    color: #ea580c;
    box-shadow: 0 0 0 2px rgba(234, 88, 12, 0.15);
  }
}

.wpos-cust-input {
  flex: 1;
  height: 28px;
  background: #f8fafc;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 6px;
  color: var(--erp-text-primary, #1e293b);
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;

  &:focus {
    border-color: #fdba74;
  }

  &::placeholder {
    color: var(--erp-text-muted, #94a3b8);
  }
}

// Cart
.wpos-cart-wrap {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.wpos-cart-header {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: #f8fafc;
  border-bottom: 1px solid var(--erp-border, #e2e8f0);
  font-size: 9px;
  font-weight: 700;
  color: var(--erp-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.12s;
  font-size: 12px;
  color: var(--erp-text-primary, #1e293b);

  &:hover {
    background: #f8fafc;
  }

  &.selected {
    background: #fff7ed;
    border-left: 3px solid #ea580c;
  }
}

.wpos-variant {
  font-size: 10px;
  color: var(--erp-text-muted, #94a3b8);
  margin-left: 4px;
}

.wpos-notes {
  display: block;
  font-size: 9px;
  color: #d97706;
  font-style: italic;
  margin-top: 1px;
}

.qty-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid var(--erp-border, #e2e8f0);
  background: #f8fafc;
  color: var(--erp-text-primary, #1e293b);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;

  &:hover {
    background: #fff7ed;
    border-color: #fdba74;
  }

  &:active {
    transform: scale(0.9);
  }
}

.qty-val {
  font-weight: 700;
  font-size: 13px;
  min-width: 22px;
  text-align: center;
  color: var(--erp-text-primary, #1e293b);
}

.wpos-cart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 20px;
}

.wpos-empty-text {
  font-size: 12px;
  color: var(--erp-text-muted, #94a3b8);
  font-weight: 500;
}

// Summary
.wpos-cart-summary {
  padding: 10px 12px;
  border-top: 1px solid var(--erp-border, #e2e8f0);
  background: #f8fafc;
}

.wpos-summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--erp-text-secondary, #64748b);
  padding: 2px 0;

  &.wpos-summary-total {
    font-size: 15px;
    font-weight: 800;
    color: #ea580c;
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px solid var(--erp-border, #e2e8f0);
  }
}

// Action Buttons
.wpos-actions {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--erp-border, #e2e8f0);
  background: #fff;
}

.wpos-action-btn {
  flex: 1;
  height: 42px;
  border-radius: 8px !important;
  font-size: 11px !important;
  font-weight: 700 !important;
}

.wpos-send-btn {
  flex: 2;
  background: linear-gradient(135deg, #059669, #10b981) !important;
  color: white !important;
  animation: send-glow 2s ease-in-out infinite;
}

@keyframes send-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.3); }
  50% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
}

// ── Right Panel (Menu Browser) ──────────────────────────
.wpos-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}

// Search
.wpos-search-wrap {
  padding: 10px 12px;
  border-bottom: 1px solid var(--erp-border, #e2e8f0);
}

.wpos-search-input {
  :deep(.q-field__control) {
    border-radius: 10px !important;
    background: #f8fafc !important;
    border: 1px solid var(--erp-border, #e2e8f0) !important;
  }
  :deep(.q-field__native) {
    font-size: 13px;
    color: var(--erp-text-primary, #1e293b);
  }
}

// Category Tabs
.wpos-cat-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  overflow-x: auto;
  flex-shrink: 0;
  border-bottom: 1px solid var(--erp-border, #e2e8f0);

  &::-webkit-scrollbar { height: 0; }
}

.wpos-cat-tab {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--erp-border, #e2e8f0);
  background: #fff;
  color: var(--erp-text-secondary, #64748b);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;

  &.active {
    background: #fff7ed;
    border-color: #fdba74;
    color: #ea580c;
  }

  &:hover:not(.active) {
    background: #f8fafc;
  }
}

// Items Grid
.wpos-items-grid {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  align-content: start;
}

.wpos-item-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border-radius: 10px;
  border: 1px solid var(--erp-border, #e2e8f0);
  background: #fff;
  color: var(--erp-text-primary, #1e293b);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);

  &:hover {
    border-color: #fdba74;
    background: #fff7ed;
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(0,0,0,0.06);
  }

  &:active {
    transform: scale(0.97);
  }
}

.wpos-item-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: #fff7ed;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
  overflow: hidden;
}

.wpos-item-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
}

.wpos-item-info {
  min-width: 0;
  width: 100%;
}

.wpos-item-name {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wpos-item-price {
  font-size: 10px;
  font-weight: 700;
  color: #059669;
  margin-top: 2px;
}

.wpos-no-items {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 20px;
  color: var(--erp-text-muted, #94a3b8);
  font-size: 12px;
}

// ── Mobile: stack panels vertically ─────────────────────
@media (max-width: 720px) {
  .wpos-body {
    flex-direction: column-reverse;
  }

  .wpos-left {
    width: 100%;
    min-width: 100%;
    max-height: 45vh;
    border-right: none;
    border-top: 1px solid var(--erp-border, #e2e8f0);
  }

  .wpos-right {
    flex: 1;
    min-height: 0;
  }

  .wpos-items-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  }
}
</style>
