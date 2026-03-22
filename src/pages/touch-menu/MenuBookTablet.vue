<template>
  <q-page class="touch-menu-page column no-wrap window-height bg-dark text-white p-x-md">
    <!-- Hero / Smart Section Area -->
    <div
      class="q-px-md q-py-sm touch-hero border-bottom row items-center no-wrap justify-between overflow-hidden"
    >
      <div class="column justify-center text-left" style="max-width: 60%">
        <h1 class="touch-hero-title font-bold q-mb-xs text-white">Experience Fine Dining</h1>
        <p class="touch-hero-subtitle text-grey-5 text-caption q-mb-none font-medium ellipsis">
          Explore our executive chef's seasonal recommendations and best sellers crafted just for
          you.
        </p>
      </div>

      <!-- Live Search & Filter -->
      <div
        class="col-4 row no-wrap q-gutter-x-sm items-center justify-end"
        style="min-width: 350px"
      >
        <!-- Search Input -->
        <div class="col relative-position touch-search bg-grey-10 rounded-borders border-accent">
          <q-input
            v-model="searchQuery"
            borderless
            dense
            dark
            color="primary"
            placeholder="What are you craving?"
            class="q-px-md font-medium text-white search-input shadow-inner"
            debounce="300"
          >
            <template v-slot:prepend>
              <q-icon name="search" color="grey-5" />
            </template>
            <template v-slot:append v-if="searchQuery">
              <q-icon
                name="close"
                @click="searchQuery = ''"
                class="cursor-pointer text-grey-5 hover-white"
              />
            </template>
          </q-input>
        </div>

        <!-- Filter Dropdown Button -->
        <q-btn
          outline
          color="grey-5"
          :class="{
            'text-primary border-primary bg-primary-transparent': activeCategoryId !== 'all',
          }"
          icon="filter_alt"
          class="shadow-5 bg-dark border-accent hover-primary transition-03"
          style="width: 40px; height: 40px; border-radius: 8px"
        >
          <q-menu
            fit
            auto-close
            class="bg-dark border-accent text-white shadow-10"
            style="border-radius: 12px; min-width: 200px"
          >
            <q-list padding class="font-medium">
              <q-item
                clickable
                v-ripple
                @click="selectCategory('all')"
                :active="activeCategoryId === 'all' && !searchQuery"
                active-class="text-primary bg-black-03"
              >
                <q-item-section avatar>
                  <q-icon name="restaurant_menu" size="sm" color="grey-4" />
                </q-item-section>
                <q-item-section class="text-subtitle2">All Menu</q-item-section>
              </q-item>

              <q-separator dark class="q-my-xs transparency-05" />

              <q-item
                v-for="cat in categories"
                :key="'menu-' + cat.id"
                clickable
                v-ripple
                @click="selectCategory(cat.id)"
                :active="activeCategoryId === cat.id && !searchQuery"
                active-class="text-primary bg-black-03"
              >
                <q-item-section avatar>
                  <q-avatar size="30px" rounded class="border-accent">
                    <q-img :src="getCategoryImgUrl(cat)" />
                  </q-avatar>
                </q-item-section>
                <q-item-section class="text-subtitle2">{{ cat.name }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </div>
    </div>

    <!-- Category Filter Bar (Infinite CSS Marquee) -->
    <div
      class="category-filter-bar row items-center no-wrap q-py-xs border-bottom position-relative"
    >
      <!-- Marquee for Sliding Categories -->
      <div
        class="marquee-wrapper col"
        @mouseenter="isPaused = true"
        @touchstart="isPaused = true"
        @mouseleave="isPaused = false"
        @touchend="isPaused = false"
      >
        <div class="marquee-track" :class="{ paused: isPaused }">
          <div
            class="marquee-content row no-wrap q-gutter-x-sm items-center q-px-sm"
            v-for="loopIndex in 6"
            :key="'loop-' + loopIndex"
          >
            <!-- Category Cards -->
            <div
              v-for="cat in categories"
              :key="'cat-' + loopIndex + '-' + cat.id"
              class="category-slide-card column items-center justify-center cursor-pointer transition-03 position-relative"
              :class="{
                'category-slide-card--active': activeCategoryId === cat.id && !searchQuery,
              }"
              @click="selectCategory(cat.id)"
            >
              <div class="cat-img-wrapper q-mb-xs rounded-borders overflow-hidden border-accent">
                <q-img
                  :src="getCategoryImgUrl(cat)"
                  class="full-width full-height object-cover"
                  spinner-color="primary"
                  spinner-size="12px"
                />
              </div>
              <span
                class="text-caption font-bold text-center ellipsis"
                style="width: 100%; font-size: 10px"
                :class="
                  activeCategoryId === cat.id && !searchQuery ? 'text-primary' : 'text-grey-5'
                "
                >{{ cat.name }}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Area: Grid Only -->
    <div class="col relative-position">
      <q-scroll-area class="full-height q-pa-md hide-scrollbar">
        <div v-if="loading" class="row justify-center q-pa-xl">
          <q-spinner-puff size="xl" color="primary" />
        </div>

        <div v-else-if="filteredItems.length === 0" class="column items-center q-pa-xl">
          <q-icon name="search_off" size="64px" class="text-grey-7 q-mb-md" />
          <div class="text-h6 text-grey-5 font-bold">No items found</div>
          <div class="text-caption text-grey-6">Try adjusting your filters or search query.</div>
        </div>

        <div v-else class="row q-col-gutter-md">
          <!-- Dynamic Grid: Smaller cards, 4-6 columns on tablet -->
          <div v-for="item in filteredItems" :key="item.id" class="col-4 col-sm-3 col-md-2">
            <MenuItemCard
              :item="item"
              @add-to-cart="touchState.addToCart"
              @request-add="openItemDetails"
            />
          </div>
        </div>

        <div style="height: 100px"></div>
        <!-- Bottom padding for scrolling -->
      </q-scroll-area>

      <!-- Bottom sticky gradient for elegant scroll fade -->
      <div
        class="absolute-bottom bg-gradient-bottom pointer-events-none"
        style="height: 50px"
      ></div>
    </div>

    <!-- Item Details Modal (Optional feature for future extension, right now just adds to cart) -->
    <q-dialog v-model="detailsModalOpen" persistent backdrop-filter="blur(10px)">
      <q-card
        v-if="selectedItem"
        class="bg-dark text-white shadow-24 border-accent"
        style="width: 500px; max-width: 90vw; border-radius: 20px"
      >
        <q-img :src="selectedItem.image_url" height="300px">
          <div class="absolute-top-right bg-transparent q-pa-sm">
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
              <q-badge v-if="selectedItem.is_veg" color="positive" class="text-weight-bold p-x-md"
                >Veg</q-badge
              >
              <q-badge v-if="selectedItem.is_spicy" color="negative" class="text-weight-bold p-x-md"
                >Spicy</q-badge
              >
            </div>
          </div>
          <p class="text-grey-4 text-body1 line-height-1-5 q-mb-none font-medium">
            {{
              selectedItem.description ||
              'Deliciously crafted by our executive chefs for your perfect evening.'
            }}
          </p>
          <div
            class="row items-center q-mt-md text-grey-5 font-bold"
            v-if="selectedItem.preparation_time_mins"
          >
            <q-icon name="schedule" size="sm" class="q-mr-xs" />
            <span>Est. Prep Time: {{ selectedItem.preparation_time_mins }} mins</span>
          </div>
        </q-card-section>

        <q-card-actions class="q-pa-md border-top bg-black-03">
          <q-btn
            color="primary"
            class="full-width touch-confirm-btn font-extrabold text-h6"
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

const categories = ref([])
const items = ref([])
const loading = ref(true)

const activeCategoryId = ref('all')
const searchQuery = ref('')
const isPaused = ref(false)

const detailsModalOpen = ref(false)
const selectedItem = ref(null)

// Computed

const filteredItems = computed(() => {
  let result = items.value.filter((i) => i.is_available)

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.description && i.description.toLowerCase().includes(q)),
    )
  } else if (activeCategoryId.value && activeCategoryId.value !== 'all') {
    result = result.filter((i) => i.sub_category_id === activeCategoryId.value)
  }

  // Sort: Available first, then by name
  return result.sort((a, b) => {
    if (a.is_available === b.is_available) {
      return a.name.localeCompare(b.name)
    }
    return a.is_available ? -1 : 1
  })
})

async function fetchData() {
  loading.value = true
  try {
    // 1. Load categories
    const { data: catData, error: catErr } = await supabase
      .from('menu_sub_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    if (catErr) throw catErr

    const loadedCategories = catData || []

    // 2. Try to find an active menu book
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
      // Load items from the menu book
      const { data: bookItemsData, error: biErr } = await supabase
        .from('menu_book_items')
        .select('*, menu_items(id, name, description, base_price, image_url, sub_category_id, kitchen_id, is_available, is_veg, is_spicy, is_best_seller, preparation_time_mins, sort_order)')
        .eq('menu_book_id', activeBook.id)
        .eq('is_available', true)
        .order('sort_order')

      if (biErr) throw biErr

      if (bookItemsData && bookItemsData.length > 0) {
        // Menu book has items — use them
        loadedItems = bookItemsData
          .filter(bi => bi.menu_items && bi.menu_items.is_available !== false)
          .map(bi => {
            const mi = bi.menu_items
            return {
              ...mi,
              price: Number(bi.override_price || mi.base_price),
              image_url: mi.image_url || getPremiumFallbackImage(mi.name, mi.id),
            }
          })

        // Only show categories that have items in the book
        const usedSubCatIds = new Set(loadedItems.map(i => i.sub_category_id).filter(Boolean))
        categories.value = [
          {
            id: 'all',
            name: 'All Menu',
            image_url: 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/cat_all.png',
          },
          ...loadedCategories.filter(c => usedSubCatIds.has(c.id)),
        ]

        items.value = loadedItems
        return
      }
    }

    // Fallback: no menu book or book has no items → load all items
    categories.value = [
      {
        id: 'all',
        name: 'All Menu',
        image_url: 'https://clykwuzajtwvwuavmtzs.supabase.co/storage/v1/object/public/menu-images/cat_all.png',
      },
      ...loadedCategories,
    ]

    const { data: itemData, error: itemErr } = await supabase
      .from('menu_items')
      .select('*')
    if (itemErr) throw itemErr

    items.value = (itemData || []).map(i => ({
      ...i,
      price: i.base_price != null ? Number(i.base_price) : i.price || i.name.length * 150 + 400,
      image_url: i.image_url || getPremiumFallbackImage(i.name, i.id),
    }))
  } catch (err) {
    console.error('Fetch error:', err)
  } finally {
    loading.value = false
  }
}

// Helper to get diverse images for category cards and menu items
function getCategoryImgUrl(item) {
  if (item.image_url) return item.image_url
  return getPremiumFallbackImage(item.name, item.id)
}

function getPremiumFallbackImage(name) {
  const n = (name || '').toLowerCase()

  // --- LUXURY PREMIUM CATEGORY & ITEM MAPPING (UNSPLASH) ---

  // Drinks & Liquid Gold
  if (n.includes('bubblelicious') || n.includes('bubble'))
    return 'https://images.unsplash.com/photo-1558857563-b371f30bb673?auto=format&fit=crop&w=600&q=80'
  if (n.includes('milkshake'))
    return 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80'
  if (n.includes('juice') || n.includes('fresh'))
    return 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=600&q=80'
  if (n.includes('coffee') || n.includes('tea') || n.includes('hot bev') || n.includes('frappe'))
    return 'https://images.unsplash.com/photo-1541167760496-162955ed8a9f?auto=format&fit=crop&w=600&q=80'
  if (
    n.includes('mojito') ||
    n.includes('smoothie') ||
    n.includes('drink') ||
    n.includes('lassi') ||
    n.includes('potion')
  )
    return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80'

  // Fast Food & Western
  if (n.includes('burger'))
    return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80'
  if (n.includes('sandwich') || n.includes('submarine') || n.includes('bun'))
    return 'https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=600&q=80'
  if (n.includes('bread'))
    return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80'
  if (n.includes('puff') || n.includes('pastry') || n.includes('patis'))
    return 'https://images.unsplash.com/photo-1551443874-987b50448b5e?auto=format&fit=crop&w=600&q=80'
  if (n.includes('pizza'))
    return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80'

  // Luxury Mains & Grills
  if (
    n.includes('grilled') ||
    n.includes('steak') ||
    n.includes('meat') ||
    n.includes('tandoori') ||
    n.includes('shawarma')
  )
    return 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=600&q=80'
  if (n.includes('pasta') || n.includes('lasagna') || n.includes('spaghetti'))
    return 'https://images.unsplash.com/photo-1473093226795-af9932fe5856?auto=format&fit=crop&w=600&q=80'

  // Asian & Exotics
  if (n.includes('rice') || n.includes('biryani') || n.includes('nasi') || n.includes('thai'))
    return 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80'
  if (n.includes('kottu'))
    return 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80'
  if (
    n.includes('curry') ||
    n.includes('indian') ||
    n.includes('devil') ||
    n.includes('chili craze')
  )
    return 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80'
  if (
    n.includes('rotty') ||
    n.includes('naan') ||
    n.includes('roti') ||
    n.includes('dose') ||
    n.includes('hopper')
  )
    return 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80'
  if (n.includes('noodle') || n.includes('chow mein') || n.includes('chopsuey'))
    return 'https://images.unsplash.com/photo-1582878826629-29b7ad1cb438?auto=format&fit=crop&w=600&q=80'
  if (n.includes('roll') || n.includes('fried') || n.includes('sizzling'))
    return 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=600&q=80'
  if (n.includes('vade'))
    return 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80'

  // Others
  if (
    n.includes('dessert') ||
    n.includes('sweet') ||
    n.includes('cake') ||
    n.includes('waffle') ||
    n.includes('delight')
  )
    return 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=600&q=80'
  if (n.includes('salad') || n.includes('veg'))
    return 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80'
  if (n.includes('soup') || n.includes('stew') || n.includes('boil'))
    return 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=600&q=80'
  if (n.includes('breakfast') || n.includes('egg'))
    return 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=600&q=80'
  if (n.includes('bite') || n.includes('snack') || n.includes('add'))
    return 'https://images.unsplash.com/photo-1541529086121-b4a78a444646?auto=format&fit=crop&w=600&q=80'

  // Generic but unique professional fallback based on seed so it stays consistent
  return `https://images.unsplash.com/photo-1514362545818-883fd015ef0b?auto=format&fit=crop&w=600&q=80`
}

function openItemDetails(item) {
  if (!item.is_available) return
  selectedItem.value = item
  detailsModalOpen.value = true
}

function selectCategory(id) {
  activeCategoryId.value = id
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
  background-color: #0b0e14; /* ERP specific dark theme */
  height: calc(100vh - 70px) !important; /* Adjust for header height */
  max-width: 100vw;
}

.bg-card {
  background: rgba(30, 41, 59, 0.4);
}
.border-bottom {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.border-right {
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}
.border-top {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
.border-accent {
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.transparency-05 {
  opacity: 0.5;
}

.touch-hero {
  height: 60px;
  background: radial-gradient(circle at top right, rgba(37, 99, 235, 0.15), transparent 60%);
}

.touch-hero-title {
  font-size: 18px;
  line-height: 1.1;
  letter-spacing: -0.5px;
  background: linear-gradient(90deg, #f8fafc, #94a3b8);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.search-input:focus-within {
  background: rgba(30, 41, 59, 1);
  border-color: var(--q-primary);
  box-shadow: 0 0 15px rgba(37, 99, 235, 0.2);
}

.smart-card {
  border-radius: 12px;
  min-width: 250px;

  &:active {
    transform: scale(0.97);
  }
  &:hover {
    background: rgba(30, 41, 59, 0.8);
    border-color: rgba(37, 99, 235, 0.3);
  }
}

.category-filter-bar {
  background: rgba(15, 23, 42, 0.4);
}

.category-slide-card {
  width: 48px;
  opacity: 0.7;

  &:hover {
    opacity: 1;
    transform: translateY(-2px);
  }

  &--active {
    opacity: 1;

    .cat-img-wrapper {
      border-color: var(--q-primary);
      box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
    }
  }
}

.cat-img-wrapper {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

/* Infinite Marquee Slider */
.marquee-wrapper {
  overflow: hidden;
  position: relative;
  width: 100%;
}

.marquee-track {
  display: flex;
  width: max-content;
  animation: scrollLeft 120s linear infinite;

  &.paused {
    animation-play-state: paused;
  }
}

.marquee-content {
  display: flex;
}

@keyframes scrollLeft {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-16.66666%); /* Translates exactly 1 block of the 6 loops */
  }
}

.custom-slide-caption {
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.4) 100%);
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}

.bg-dark-glass {
  background: rgba(30, 41, 59, 0.8);
}

.object-cover {
  object-fit: cover;
}

.shadow-glow {
  box-shadow: 0 0 10px var(--q-primary);
}

.shadow-text {
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}
.drop-shadow-warning {
  filter: drop-shadow(0 0 5px rgba(245, 158, 11, 0.5));
}

.bg-gradient-bottom {
  background: linear-gradient(180deg, rgba(11, 14, 20, 0) 0%, rgba(11, 14, 20, 1) 100%);
}
.bg-black-06 {
  background: rgba(0, 0, 0, 0.6);
}
.bg-black-03 {
  background: rgba(0, 0, 0, 0.3);
}

/* Typography Standard ERP */
.font-medium {
  font-weight: 500;
}
.font-bold {
  font-weight: 700;
}
.font-extrabold {
  font-weight: 800;
}
.font-black {
  font-weight: 900;
}
.letter-spacing-1 {
  letter-spacing: 1px;
}
.letter-spacing-05 {
  letter-spacing: 0.5px;
}
.font-mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
}
.line-height-1 {
  line-height: 1.2;
}
.line-height-1-5 {
  line-height: 1.5;
}

/* Effects */
.transition-02 {
  transition: all 0.2s ease;
}
.transition-03 {
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
}

/* Hide scrollbars for cleaner UI but allow scroll */
.hide-scrollbar {
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}
.hide-scrollbar::-webkit-scrollbar {
  display: none; /* Chrome, Safari and Opera */
}

.touch-confirm-btn {
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.touch-confirm-btn:active {
  transform: scale(0.97);
}
</style>
