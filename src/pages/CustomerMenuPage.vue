<template>
  <q-page class="customer-menu-page">
    <!-- Hero Banner -->
    <div class="menu-hero">
      <div class="hero-content">
        <div class="text-overline text-primary letter-spacing q-mb-xs">TODAY'S MENU</div>
        <div class="text-h5 text-white text-weight-bolder">What are you craving?</div>
        <div class="text-caption text-grey-5 q-mt-xs">
          {{ filteredItems.length }} delicious items available
        </div>
      </div>
    </div>

    <!-- Sticky Search + Category Bar -->
    <div class="sticky-bar">
      <!-- Search -->
      <div class="search-wrap q-px-md q-pt-md q-pb-sm">
        <q-input
          v-model="search"
          placeholder="Search dishes, drinks, desserts..."
          dense
          outlined
          rounded
          dark
          class="search-input"
          clearable
        >
          <template v-slot:prepend>
            <q-icon name="search" color="primary" />
          </template>
        </q-input>
      </div>

      <!-- Category Scroll -->
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

    <!-- Menu Content -->
    <div class="menu-content q-px-md q-pb-xl">
      <!-- Group by category mode (when "All" is selected) -->
      <template v-if="selectedCategory === 'All' && !search">
        <div v-for="catGroup in groupedItems" :key="catGroup.name" class="category-group q-mb-xl">
          <div class="category-header q-mb-md row items-center">
            <span class="cat-emoji-big">{{ getCatEmoji(catGroup.name) }}</span>
            <div class="q-ml-sm">
              <div class="text-subtitle1 text-white text-weight-bold">{{ catGroup.name }}</div>
              <div class="text-caption text-grey-6">{{ catGroup.items.length }} items</div>
            </div>
          </div>

          <div class="menu-grid">
            <MenuItemCard
              v-for="item in catGroup.items"
              :key="item.id"
              :product="item"
              :cart-qty="store.getItemQty(item.id)"
              @add="store.addItem(item)"
              @remove="decrementItem(item)"
            />
          </div>
        </div>
      </template>

      <!-- Filtered / search mode -->
      <template v-else>
        <div class="text-caption text-grey-6 q-mb-md q-mt-sm">
          <span v-if="search"
            >Results for "<b class="text-white">{{ search }}</b
            >"</span
          >
          <span v-else>{{ selectedCategory }}</span>
          · {{ filteredItems.length }} items
        </div>

        <div class="menu-grid">
          <MenuItemCard
            v-for="item in filteredItems"
            :key="item.id"
            :product="item"
            :cart-qty="store.getItemQty(item.id)"
            @add="store.addItem(item)"
            @remove="decrementItem(item)"
          />
        </div>

        <!-- Empty state -->
        <div
          v-if="filteredItems.length === 0"
          class="column items-center q-pa-xl text-center q-mt-xl"
        >
          <div style="font-size: 48px">🍽️</div>
          <div class="text-subtitle1 text-grey-5 q-mt-md q-mb-sm">Nothing found</div>
          <div class="text-caption text-grey-7">Try searching for something else</div>
          <q-btn
            flat
            color="primary"
            label="Clear Filters"
            no-caps
            class="q-mt-md"
            @click="resetFilters"
          />
        </div>
      </template>
    </div>

    <!-- Bottom spacer for FAB -->
    <div style="height: 90px"></div>

    <!-- Floating Cart FAB -->
    <transition name="cart-fab">
      <q-page-sticky v-if="!store.isEmpty" position="bottom" :offset="[0, 20]">
        <q-btn unelevated class="cart-fab-btn" @click="store.toggleCart">
          <div class="row items-center no-wrap">
            <q-badge color="white" text-color="orange" class="q-mr-sm q-px-sm">
              {{ store.itemCount }}
            </q-badge>
            <span class="text-weight-bold">View Order</span>
            <q-space class="q-mx-sm" />
            <span class="text-weight-bold">LKR {{ store.subtotal.toLocaleString() }}</span>
            <q-icon name="chevron_right" class="q-ml-xs" />
          </div>
        </q-btn>
      </q-page-sticky>
    </transition>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCustomerOrderStore } from 'src/stores/customerOrderStore'
import MenuItemCard from 'src/components/customer/MenuItemCard.vue'
import { supabase } from 'src/boot/supabase'

const store = useCustomerOrderStore()

const search = ref('')
const selectedCategory = ref('All')

const menuItems = ref([])
const categories = ref([{ name: 'All', emoji: '🍽️' }])
const loading = ref(true)

function getCatEmoji(name) {
  return categories.value.find((c) => c.name === name)?.emoji || '🍽️'
}

async function fetchMenu() {
  if (!store.companyId) return

  loading.value = true
  try {
    // 1. Fetch Sub-Categories instead of Main Categories
    const { data: subCatData } = await supabase
      .from('menu_sub_categories')
      .select('*, categories(name, icon)')
      .eq('company_id', store.companyId)
      .eq('is_active', true)
      .order('sort_order')

    if (subCatData) {
      categories.value = [
        { name: 'All', emoji: '🍽️', id: 'all' },
        ...subCatData.map((sc) => ({
          name: sc.name,
          emoji: '🍴',
          id: sc.id,
          parent_name: sc.categories?.name,
        })),
      ]
    }

    // 2. Fetch Menu Items
    const { data: itemData } = await supabase
      .from('menu_items')
      .select('*')
      .eq('company_id', store.companyId)
      .eq('is_available', true)
      .order('sort_order')

    if (itemData) {
      menuItems.value = itemData.map((i) => {
        const subCat = subCatData?.find((sc) => sc.id === i.sub_category_id)
        return {
          id: i.id,
          name: i.name,
          description: i.description,
          price: Number(i.base_price),
          category: subCat ? subCat.name : 'Other',
          sub_category_id: i.sub_category_id,
          image:
            i.image_url ||
            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=600&h=450&fit=crop',
          kitchen_id: i.kitchen_id,
          is_popular: i.sort_order < 3,
        }
      })
    }
  } catch (e) {
    console.error('Fetch menu failed:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchMenu()
})

const filteredItems = computed(() => {
  return menuItems.value.filter((item) => {
    const matchesSearch =
      !search.value ||
      item.name.toLowerCase().includes(search.value.toLowerCase()) ||
      item.description?.toLowerCase().includes(search.value.toLowerCase())
    const matchesCategory =
      selectedCategory.value === 'All' || item.category === selectedCategory.value
    return matchesSearch && matchesCategory
  })
})

const groupedItems = computed(() => {
  const groups = {}
  menuItems.value.forEach((item) => {
    if (!groups[item.category]) groups[item.category] = []
    groups[item.category].push(item)
  })

  // Sort groups based on categories order
  return categories.value
    .filter((c) => c.name !== 'All' && groups[c.name])
    .map((c) => ({
      name: c.name,
      items: groups[c.name],
    }))
})

function resetFilters() {
  search.value = ''
  selectedCategory.value = 'All'
}

function decrementItem(product) {
  const idx = store.cartItems.findIndex((i) => i.productId === product.id)
  if (idx !== -1) store.updateQuantity(idx, store.cartItems[idx].qty - 1)
}
</script>

<style lang="scss" scoped>
.customer-menu-page {
  background: #0d0d14;
  min-height: 100vh;
  font-family: 'Inter', 'Roboto', sans-serif;
}

.menu-hero {
  background: linear-gradient(
    135deg,
    rgba(249, 115, 22, 0.12),
    rgba(239, 68, 68, 0.08),
    transparent
  );
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding: 20px 16px 16px;
}

.letter-spacing {
  letter-spacing: 3px;
  font-size: 0.65rem;
  font-weight: 700;
}

.sticky-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(13, 13, 20, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
  transition: all 0.25s ease;
  white-space: nowrap;
  font-family: 'Inter', 'Roboto', sans-serif;

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

.cat-icon {
  font-size: 1rem;
}
.cat-label {
  font-size: 0.82rem;
}

.menu-content {
  padding-top: 16px;
}

.category-header {
  position: relative;
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

  &:hover {
    box-shadow: 0 12px 40px rgba(249, 115, 22, 0.6);
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
</style>
