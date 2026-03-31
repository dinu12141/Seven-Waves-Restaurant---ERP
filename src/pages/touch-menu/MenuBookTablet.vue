<template>
  <q-page class="touch-menu-page column no-wrap window-height">
    <!-- ── Hero ──────────────────────────────────────────────────────── -->
    <div class="touch-hero border-bottom">
      <!-- Title row (always visible) -->
      <div class="hero-title-row">
        <div class="hero-text">
          <h1 class="touch-hero-title">Experience Fine Dining</h1>
          <p class="touch-hero-subtitle">Explore our executive chef's seasonal recommendations.</p>
        </div>
      </div>

      <!-- Search + Filter row (single instance, repositioned via CSS on desktop) -->
      <div class="hero-controls-row">
        <div class="tm-search-wrap search-field shadow-2">
          <q-input
            v-model="searchQuery"
            borderless
            dense
            color="primary"
            placeholder="Search any item..."
            class="search-input"
            debounce="300"
          >
            <template v-slot:prepend>
              <q-icon name="search" color="grey-7" size="20px" class="q-pl-sm" />
            </template>
            <template v-slot:append v-if="searchQuery">
              <q-icon
                name="cancel"
                @click="searchQuery = ''"
                class="cursor-pointer text-grey-5 q-pr-sm"
                size="18px"
              />
            </template>
          </q-input>
        </div>

        <!-- Single Filter button with dropdown -->
        <q-btn outline class="tm-filter-btn" id="menu-filter-btn">
          <q-icon name="tune" size="16px" />
          <span class="filter-label q-ml-xs">
            {{
              activeMainCategory === 'all'
                ? 'All Menu'
                : mainCategories.find((c) => c.id === activeMainCategory)?.name || 'Menu'
            }}
          </span>
          <q-icon name="expand_more" size="16px" class="q-ml-xs" />
          <q-menu auto-close class="tm-menu" style="border-radius: 12px; min-width: 210px">
            <q-list padding>
              <q-item
                clickable
                v-ripple
                @click="selectMainCategory('all')"
                :active="activeMainCategory === 'all'"
                active-class="text-primary bg-black-03"
              >
                <q-item-section avatar>
                  <q-icon
                    name="restaurant_menu"
                    size="sm"
                    :color="$q.dark.isActive ? 'white' : 'black'"
                  />
                </q-item-section>
                <q-item-section
                  class="text-subtitle2"
                  :class="$q.dark.isActive ? 'text-white' : 'text-black'"
                  >All Menu</q-item-section
                >
              </q-item>
              <q-separator class="q-my-xs" style="opacity: 0.15" />
              <q-item
                v-for="cat in mainCategories"
                :key="'filter-' + cat.id"
                clickable
                v-ripple
                @click="selectMainCategory(cat.id)"
                :active="activeMainCategory === cat.id"
                active-class="text-primary bg-black-03"
              >
                <q-item-section avatar>
                  <q-avatar size="30px" rounded style="border-radius: 6px; overflow: hidden">
                    <q-img :src="getCategoryImgUrl(cat)" />
                  </q-avatar>
                </q-item-section>
                <q-item-section
                  class="text-subtitle2"
                  :class="$q.dark.isActive ? 'text-white' : 'text-black'"
                  >{{ cat.name }}</q-item-section
                >
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </div>
    </div>

    <!-- ── Category Pill Bar ──────────────────────────────────────────── -->
    <div class="category-pill-bar border-bottom">
      <div class="pill-track">
        <button
          v-for="cat in visibleSubCategories"
          :key="'pill-' + cat.id"
          class="pill-btn"
          :class="{ 'pill-btn--active': activeCategoryId === cat.id && !searchQuery }"
          @click="selectSubCategory(cat.id)"
        >
          <div class="pill-img-wrap">
            <img :src="getCategoryImgUrl(cat)" class="pill-img" loading="lazy" />
          </div>
          <span class="pill-label">{{ cat.name }}</span>
        </button>
      </div>
    </div>

    <!-- ── Menu Grid ──────────────────────────────────────────────────── -->
    <div class="col relative-position">
      <q-scroll-area class="full-height q-pa-sm hide-scrollbar">
        <div v-if="loading" class="row justify-center q-pa-xl">
          <q-spinner-puff size="xl" color="primary" />
        </div>

        <div v-else-if="filteredItems.length === 0" class="column items-center q-pa-xl">
          <q-icon
            name="search_off"
            size="64px"
            :color="$q.dark.isActive ? 'white' : 'black'"
            class="q-mb-md"
          />
          <div class="text-h6 font-bold" :class="$q.dark.isActive ? 'text-white' : 'text-black'">
            No items found
          </div>
          <div
            class="text-caption q-mt-xs"
            :class="$q.dark.isActive ? 'text-grey-4' : 'text-grey-6'"
          >
            Try adjusting your filters or search.
          </div>
        </div>

        <div v-else class="menu-grid">
          <MenuItemCard
            v-for="item in filteredItems"
            :key="item.id"
            :item="item"
            @add-to-cart="touchState.addToCart"
            @request-add="openItemDetails"
          />
        </div>

        <div style="height: 100px"></div>
      </q-scroll-area>

      <div
        class="absolute-bottom bg-gradient-bottom pointer-events-none"
        style="height: 50px"
      ></div>
    </div>

    <!-- ── Item Detail Modal ───────────────────────────────────────────── -->
    <q-dialog v-model="detailsModalOpen" persistent backdrop-filter="blur(10px)">
      <q-card
        v-if="selectedItem"
        class="tm-detail-card shadow-24"
        style="width: 500px; max-width: 94vw; border-radius: 20px"
      >
        <q-img :src="selectedItem.image_url" height="260px">
          <div class="absolute-top-right q-pa-sm">
            <q-btn
              flat
              round
              dense
              icon="close"
              size="md"
              class="bg-black-06 text-white"
              v-close-popup
            />
          </div>
          <div
            class="absolute-bottom text-h5 font-extrabold letter-spacing-1"
            style="background: linear-gradient(0deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0) 100%)"
          >
            {{ selectedItem.name }}
          </div>
        </q-img>

        <q-card-section class="q-pt-md">
          <div class="row justify-between items-center q-mb-sm">
            <div class="text-h4 font-mono font-black text-primary">
              LKR {{ Number(selectedItem.price).toLocaleString('en-LK') }}
            </div>
            <div class="row q-gutter-x-sm">
              <q-badge v-if="selectedItem.is_veg" color="positive" class="text-weight-bold"
                >Veg</q-badge
              >
              <q-badge v-if="selectedItem.is_spicy" color="negative" class="text-weight-bold"
                >Spicy</q-badge
              >
            </div>
          </div>
          <p
            class="text-body1 line-height-1-5 q-mb-none font-medium"
            :class="$q.dark.isActive ? 'text-white' : 'text-black'"
          >
            {{
              selectedItem.description ||
              'Deliciously crafted by our executive chefs for your perfect evening.'
            }}
          </p>
          <div
            class="row items-center q-mt-md font-bold"
            :class="$q.dark.isActive ? 'text-white' : 'text-black'"
            v-if="selectedItem.preparation_time_mins"
          >
            <q-icon name="schedule" size="sm" class="q-mr-xs" />
            <span>Est. Prep Time: {{ selectedItem.preparation_time_mins }} mins</span>
          </div>
        </q-card-section>

        <q-card-actions class="q-pa-md border-top tm-actions-bg">
          <q-btn
            color="primary"
            class="full-width font-extrabold text-h6"
            size="lg"
            label="Add to Order"
            icon="add_shopping_cart"
            unelevated
            @click="addToCartAndClose(selectedItem)"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { supabase } from 'src/boot/supabase'
import MenuItemCard from 'src/components/touch-menu/MenuItemCard.vue'

const touchState = inject('touchMenuState')

const mainCategories = ref([])
const categories = ref([])
const items = ref([])
const loading = ref(true)

const activeMainCategory = ref('all')
const activeCategoryId = ref('all')
const searchQuery = ref('')

const detailsModalOpen = ref(false)
const selectedItem = ref(null)

// ── Computed ──────────────────────────────────────────────────────────────────
const visibleSubCategories = computed(() => {
  let subs = categories.value.filter((c) => c.id !== 'all')
  if (activeMainCategory.value !== 'all') {
    subs = subs.filter((c) => c.category_id === activeMainCategory.value)
  }
  const mainName =
    activeMainCategory.value === 'all'
      ? 'All Menu'
      : mainCategories.value.find((c) => c.id === activeMainCategory.value)?.name || 'All'
  return [
    {
      id: 'all',
      name: mainName,
      image_url:
        'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/cat_all.png',
    },
    ...subs,
  ]
})

const filteredItems = computed(() => {
  let result = items.value.filter((i) => i.is_available)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.description && i.description.toLowerCase().includes(q)),
    )
  } else {
    if (activeMainCategory.value !== 'all') {
      const allowed = categories.value
        .filter((c) => c.category_id === activeMainCategory.value)
        .map((c) => c.id)
      result = result.filter((i) => allowed.includes(i.sub_category_id))
    }
    if (activeCategoryId.value !== 'all') {
      result = result.filter((i) => i.sub_category_id === activeCategoryId.value)
    }
  }
  return result.sort((a, b) => {
    if (a.is_available === b.is_available) return a.name.localeCompare(b.name)
    return a.is_available ? -1 : 1
  })
})

// ── Data Fetching ─────────────────────────────────────────────────────────────
async function fetchData() {
  loading.value = true
  try {
    const { data: mainCatData, error: mainCatErr } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order')
    if (mainCatErr) throw mainCatErr
    const loadedMainCategories = mainCatData || []

    const { data: catData, error: catErr } = await supabase
      .from('menu_sub_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    if (catErr) throw catErr
    const loadedCategories = catData || []

    const { data: books } = await supabase
      .from('menu_books')
      .select('id, name')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('sort_order')
      .limit(1)

    const activeBook = books?.[0]
    let loadedItems = []

    if (activeBook) {
      const { data: bookItemsData, error: biErr } = await supabase
        .from('menu_book_items')
        .select(
          '*, menu_items(id, name, description, base_price, image_url, sub_category_id, kitchen_id, is_available, is_veg, is_spicy, is_best_seller, preparation_time_mins, sort_order)',
        )
        .eq('menu_book_id', activeBook.id)
        .eq('is_available', true)
        .order('sort_order')
      if (biErr) throw biErr

      if (bookItemsData && bookItemsData.length > 0) {
        loadedItems = bookItemsData
          .filter((bi) => bi.menu_items && bi.menu_items.is_available !== false)
          .map((bi) => {
            const mi = bi.menu_items
            return {
              ...mi,
              price: Number(bi.override_price || mi.base_price),
              image_url: mi.image_url || getPremiumFallbackImage(mi.name),
            }
          })
        const usedSubCatIds = new Set(loadedItems.map((i) => i.sub_category_id).filter(Boolean))
        categories.value = loadedCategories.filter((c) => usedSubCatIds.has(c.id))
        const usedMainCatIds = new Set(categories.value.map((c) => c.category_id).filter(Boolean))
        mainCategories.value = loadedMainCategories.filter((c) => usedMainCatIds.has(c.id))
        items.value = loadedItems
        return
      }
    }

    categories.value = loadedCategories
    mainCategories.value = loadedMainCategories
    const { data: itemData, error: itemErr } = await supabase.from('menu_items').select('*')
    if (itemErr) throw itemErr
    items.value = (itemData || []).map((i) => ({
      ...i,
      price: i.base_price != null ? Number(i.base_price) : 400,
      image_url: i.image_url || getPremiumFallbackImage(i.name),
    }))
  } catch (err) {
    console.error('Fetch error:', err)
  } finally {
    loading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCategoryImgUrl(item) {
  if (item.image_url) return item.image_url
  return getPremiumFallbackImage(item.name)
}

function getPremiumFallbackImage(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('milkshake'))
    return 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80'
  if (n.includes('juice') || n.includes('fresh'))
    return 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=600&q=80'
  if (n.includes('coffee') || n.includes('tea') || n.includes('frappe'))
    return 'https://images.unsplash.com/photo-1541167760496-162955ed8a9f?auto=format&fit=crop&w=600&q=80'
  if (n.includes('mojito'))
    return 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/smoothies/lime_mint_1774785221920.png'
  if (n.includes('smoothie'))
    return 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/smoothies/avocado_1774783849132.png'
  if (n.includes('lassi'))
    return 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/smoothies/mango_lassi_1774786521116.png'
  if (n.includes('chilled') || n.includes('delight'))
    return 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/smoothies/falooda_bombay_1774787609691.png'
  if (n.includes('soft drink') || n.includes('cola') || n.includes('beverage'))
    return 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80'
  if (n.includes('burger'))
    return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80'
  if (n.includes('pizza'))
    return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80'
  if (n.includes('rice') || n.includes('biryani'))
    return 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80'
  if (n.includes('dessert') || n.includes('cake') || n.includes('waffle'))
    return 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=600&q=80'
  return 'https://images.unsplash.com/photo-1514362545818-883fd015ef0b?auto=format&fit=crop&w=600&q=80'
}

function openItemDetails(item) {
  if (!item.is_available) return
  selectedItem.value = item
  detailsModalOpen.value = true
}

function selectSubCategory(id) {
  activeCategoryId.value = id
  searchQuery.value = ''
}

function selectMainCategory(id) {
  activeMainCategory.value = id
  activeCategoryId.value = 'all'
  searchQuery.value = ''
}

function addToCartAndClose(item) {
  touchState.addToCart(item)
  detailsModalOpen.value = false
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.touch-menu-page {
  font-family: 'Inter', sans-serif;
  max-width: 100vw;
  overflow-x: hidden;
  transition:
    background-color 0.25s ease,
    color 0.25s ease;
}

:global(.body--dark) .touch-menu-page {
  background-color: #0b0e14;
  color: #f8fafc;
}
:global(.body--light) .touch-menu-page {
  background-color: #f8fafc;
  color: #0f172a;
}

// ── Hero ──────────────────────────────────────────────────────────────────────
.touch-hero {
  padding: 10px 12px 10px;

  @media (min-width: 600px) {
    padding: 14px 20px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
}

:global(.body--dark) .touch-hero {
  background: radial-gradient(circle at top right, rgba(249, 115, 22, 0.12), transparent 60%);
}
:global(.body--light) .touch-hero {
  background: radial-gradient(circle at top right, rgba(249, 115, 22, 0.06), transparent 60%);
}

// ── Hero title row ────────────────────────────────────────────────────────────
.hero-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;

  @media (min-width: 600px) {
    margin-bottom: 0;
    flex: 0 0 auto;
    min-width: 0;
  }
}

.hero-text {
  flex: 1;
  min-width: 0;
}

.touch-hero-title {
  font-size: 16px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.4px;
  margin: 0 0 1px;

  @media (min-width: 400px) {
    font-size: 18px;
  }
  @media (min-width: 600px) {
    font-size: 22px;
    margin-bottom: 3px;
  }
}

.touch-hero-subtitle {
  font-size: 11px;
  line-height: 1.4;
  margin: 0;

  @media (min-width: 600px) {
    font-size: 13px;
  }
}

:global(.body--dark) .touch-hero-title {
  color: #ffffff !important;
}
:global(.body--dark) .touch-hero-subtitle {
  color: #cbd5e1 !important;
}
:global(.body--light) .touch-hero-title {
  color: #0f172a !important;
}
:global(.body--light) .touch-hero-subtitle {
  color: #475569 !important;
}

// ── Controls row (search + filter) ───────────────────────────────────────────
// On mobile: full-width row below the title
// On desktop: flex row to the right of title
.hero-controls-row {
  display: flex;
  align-items: center;
  gap: 8px;

  @media (min-width: 600px) {
    flex-shrink: 0;
    gap: 10px;
  }
}

.search-field {
  flex: 1;
  min-width: 0;

  @media (min-width: 600px) {
    width: 260px;
    flex: none;
  }
}

// ── Search bar ─────────────────────────────────────────────────────────────────
.tm-search-wrap {
  height: 42px;
  display: flex;
  align-items: center;
  border-radius: 50px;
  transition: all 0.3s ease;
  overflow: hidden;
}
:global(.body--dark) .tm-search-wrap {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
:global(.body--dark) .tm-search-wrap:focus-within {
  background: rgba(255, 255, 255, 0.12);
  border-color: var(--q-primary);
  box-shadow: 0 0 0 1px var(--q-primary);
}
:global(.body--light) .tm-search-wrap {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}
:global(.body--light) .tm-search-wrap:focus-within {
  border-color: var(--q-primary);
  box-shadow:
    0 0 0 1px var(--q-primary),
    0 4px 12px rgba(0, 0, 0, 0.08);
}

.search-input {
  width: 100%;
  :deep(.q-field__control) {
    height: 40px;
    min-height: 40px;
  }
  :deep(.q-field__native) {
    font-size: 14px;
    font-weight: 500;
    padding: 0;
  }
  :deep(.q-field__native::placeholder) {
    font-weight: 400;
  }
  :deep(.q-field__prepend) {
    padding-right: 8px;
  }
}

// ── Filter button ──────────────────────────────────────────────────────────────
.tm-filter-btn {
  height: 38px !important;
  border-radius: 10px !important;
  padding: 0 10px !important;
  flex-shrink: 0;
  gap: 0;
  transition: all 0.2s;
  white-space: nowrap;
}
:global(.body--dark) .tm-filter-btn {
  background: rgba(15, 23, 42, 0.8);
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: #94a3b8;
}
:global(.body--light) .tm-filter-btn {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.12) !important;
  color: #475569;
}

.filter-label {
  font-size: 11px;
  font-weight: 700;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (min-width: 400px) {
    max-width: 80px;
  }
  @media (min-width: 600px) {
    font-size: 13px;
    max-width: 120px;
  }
}

// ── Filter menu ────────────────────────────────────────────────────────────────
.tm-menu {
  border: 1px solid rgba(0, 0, 0, 0.08);
}
:global(.body--dark) .tm-menu {
  background: #0f172a !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: #f8fafc !important;
}
:global(.body--light) .tm-menu {
  background: #ffffff !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  color: #0f172a !important;
}

// ── Category Pill Bar ──────────────────────────────────────────────────────────
.category-pill-bar {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar {
    display: none;
  }
  padding: 8px 12px;

  @media (min-width: 600px) {
    padding: 10px 20px;
  }
}

:global(.body--dark) .category-pill-bar {
  background: rgba(15, 23, 42, 0.3);
}
:global(.body--light) .category-pill-bar {
  background: rgba(241, 245, 249, 0.6);
}

.pill-track {
  display: flex;
  gap: 8px;
  width: max-content;
  @media (min-width: 600px) {
    gap: 10px;
  }
}

.pill-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 6px 6px 8px;
  width: 66px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: #9ca3af;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;

  @media (min-width: 400px) {
    width: 72px;
  }
  @media (min-width: 600px) {
    width: 82px;
    gap: 7px;
    padding: 8px 7px 10px;
  }

  &:active {
    transform: scale(0.93);
  }

  @media (hover: hover) {
    &:hover {
      background: rgba(255, 255, 255, 0.08);
      color: white;
    }
  }

  &--active {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.18), rgba(239, 68, 68, 0.08));
    border-color: rgba(249, 115, 22, 0.5);
    color: #fb923c;

    .pill-img-wrap {
      box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.6);
    }
  }
}

:global(.body--light) .pill-btn {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.8);
  color: #475569;

  @media (hover: hover) {
    &:hover {
      background: #ffffff;
      color: #0f172a;
    }
  }

  &.pill-btn--active {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.12), rgba(239, 68, 68, 0.06));
    border-color: rgba(249, 115, 22, 0.4);
    color: #ea580c;
  }
}

.pill-img-wrap {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a24;
  flex-shrink: 0;
  transition: box-shadow 0.2s;
}

.pill-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pill-label {
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  line-height: 1.25;
  max-width: 100%;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;

  @media (min-width: 400px) {
    font-size: 11px;
  }
  @media (min-width: 600px) {
    font-size: 12px;
  }
}

// ── Menu Grid ──────────────────────────────────────────────────────────────────
.menu-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;

  @media (min-width: 420px) {
    gap: 11px;
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

// ── Borders ────────────────────────────────────────────────────────────────────
.border-bottom {
  border-bottom: 1px solid rgba(128, 128, 128, 0.12);
}
.border-top {
  border-top: 1px solid rgba(128, 128, 128, 0.12);
}

// ── Item detail card ──────────────────────────────────────────────────────────
.tm-detail-card {
  transition: background 0.2s;
}
:global(.body--dark) .tm-detail-card {
  background: #0f172a !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}
:global(.body--light) .tm-detail-card {
  background: #ffffff !important;
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #0f172a;
}
.tm-actions-bg {
  background: rgba(0, 0, 0, 0.04);
}
:global(.body--dark) .tm-actions-bg {
  background: rgba(0, 0, 0, 0.2);
}
:global(.body--light) .tm-actions-bg {
  background: rgba(0, 0, 0, 0.02);
}

// ── Gradients ──────────────────────────────────────────────────────────────────
:global(.body--dark) .bg-gradient-bottom {
  background: linear-gradient(180deg, rgba(11, 14, 20, 0) 0%, rgba(11, 14, 20, 1) 100%);
}
:global(.body--light) .bg-gradient-bottom {
  background: linear-gradient(180deg, rgba(248, 250, 252, 0) 0%, rgba(248, 250, 252, 1) 100%);
}

.bg-black-06 {
  background: rgba(0, 0, 0, 0.6);
}
.bg-black-03 {
  background: rgba(0, 0, 0, 0.3);
}

/* Typography */
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
.letter-spacing-1 {
  letter-spacing: 1px;
}
.line-height-1-5 {
  line-height: 1.5;
}
</style>
