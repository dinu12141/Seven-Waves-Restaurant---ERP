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
                    <q-img :src="cat.image_url || getCategoryImgUrl(cat.name)" />
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
                  :src="cat.image_url || getCategoryImgUrl(cat.name)"
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
          <div
            v-for="item in filteredItems"
            :key="item.id"
            class="col-6 col-sm-4 col-md-3 col-lg-2"
          >
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
  let result = items.value

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.description && i.description.toLowerCase().includes(q)),
    )
  } else if (activeCategoryId.value && activeCategoryId.value !== 'all') {
    result = result.filter((i) => i.category_id === activeCategoryId.value)
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
    const [catRes, itemRes] = await Promise.all([
      supabase.from('menu_categories').select('*').eq('active', true).order('display_order'),
      supabase.from('menu_items').select('*'),
    ])

    if (catRes.error) throw catRes.error
    if (itemRes.error) throw itemRes.error

    let loadedCategories = catRes.data || []
    let loadedItems = itemRes.data || []

    // Inject Mock Data if DB is empty to showcase the UI
    if (loadedCategories.length === 0) {
      loadedCategories = [
        {
          id: 'c1',
          name: 'Burgers',
          image_url:
            'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=200&q=80',
        },
        {
          id: 'c2',
          name: 'Pizzas',
          image_url:
            'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=200&q=80',
        },
        {
          id: 'c3',
          name: 'Steaks',
          image_url:
            'https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=200&q=80',
        },
        {
          id: 'c8',
          name: 'Salads',
          image_url:
            'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=200&q=80',
        },
        {
          id: 'c9',
          name: 'Pasta',
          image_url:
            'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=200&q=80',
        },
        {
          id: 'c10',
          name: 'Seafood',
          image_url:
            'https://images.unsplash.com/photo-1615141982883-c7da0e40f321?auto=format&fit=crop&w=200&q=80',
        },
        {
          id: 'c6',
          name: 'Rice / Nasi',
          image_url:
            'https://images.unsplash.com/photo-1550989460026-531e21b18361?auto=format&fit=crop&w=200&q=80',
        },
        {
          id: 'c4',
          name: 'Desserts',
          image_url:
            'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=200&q=80',
        },
        {
          id: 'c5',
          name: 'Beverages',
          image_url:
            'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=200&q=80',
        },
        {
          id: 'c7',
          name: 'Soups',
          image_url:
            'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=200&q=80',
        },
      ]
    }

    if (loadedItems.length === 0) {
      loadedItems = [
        {
          id: 'i1',
          category_id: 'c1',
          name: 'Signature Beef Burger',
          price: 1850,
          is_available: true,
          is_best_seller: true,
        },
        {
          id: 'i2',
          category_id: 'c1',
          name: 'Crispy Chicken Burger',
          price: 1450,
          is_available: true,
          is_best_seller: false,
        },
        {
          id: 'i3',
          category_id: 'c2',
          name: 'Margherita Pizza Large',
          price: 2500,
          is_available: true,
          is_best_seller: false,
          is_veg: true,
        },
        {
          id: 'i4',
          category_id: 'c2',
          name: 'Spicy Pepperoni Pizza',
          price: 3200,
          is_available: true,
          is_best_seller: true,
          is_spicy: true,
        },
        {
          id: 'i5',
          category_id: 'c3',
          name: 'Grilled Ribeye Steak',
          price: 8500,
          is_available: true,
          is_best_seller: true,
        },
        {
          id: 'i8',
          category_id: 'c6',
          name: 'Chicken Dum Biryani',
          price: 1750,
          is_available: true,
          is_best_seller: true,
          is_spicy: true,
        },
        {
          id: 'i9',
          category_id: 'c6',
          name: 'Vegetable Fried Rice',
          price: 1100,
          is_available: true,
          is_best_seller: false,
          is_veg: true,
        },
        {
          id: 'i6',
          category_id: 'c4',
          name: 'Molten Chocolate Cake',
          price: 950,
          is_available: true,
          is_best_seller: true,
        },
        {
          id: 'i7',
          category_id: 'c5',
          name: 'Iced Coffee',
          price: 650,
          is_available: true,
          is_best_seller: false,
        },
        {
          id: 'i10',
          category_id: 'c7',
          name: 'Cream of Mushroom Soup',
          price: 850,
          is_available: true,
          is_best_seller: false,
          is_veg: true,
        },
        {
          id: 'i11',
          category_id: 'c8',
          name: 'Classic Caesar Salad',
          price: 1200,
          is_available: true,
          is_best_seller: false,
          is_veg: true,
        },
        {
          id: 'i12',
          category_id: 'c9',
          name: 'Creamy Carbonara Pasta',
          price: 2100,
          is_available: true,
          is_best_seller: true,
        },
        {
          id: 'i13',
          category_id: 'c10',
          name: 'Grilled Garlic Prawns',
          price: 3500,
          is_available: true,
          is_best_seller: true,
        },
        {
          id: 'i14',
          category_id: 'c1',
          name: 'Double Cheese Smash Burger',
          price: 2200,
          is_available: true,
          is_best_seller: true,
        },
      ]
    }

    categories.value = loadedCategories

    // High-quality colorful food imagery from Unsplash and fallback prices for missing data
    items.value = loadedItems.map((i) => ({
      ...i,
      price: i.price || i.name.length * 150 + 400, // Ensure price is never NaN, generate consistent mock price if missing
      image_url:
        i.image_url ||
        `https://images.unsplash.com/photo-${getFoodImgId(i.name)}?auto=format&fit=crop&w=400&q=80`,
    }))
  } catch (err) {
    console.error('Fetch error:', err)
  } finally {
    loading.value = false
  }
}

// Helper to get diverse food images based on item name
function getFoodImgId(name) {
  const n = name.toLowerCase()
  if (n.includes('burger')) return '1568901346375-23c9450c58cd'
  if (n.includes('pizza')) return '1513104890138-7c749659a591'
  if (n.includes('pasta') || n.includes('spaghetti')) return '1551183053-bf91a1d81141'
  if (n.includes('salad')) return '1512621776951-a57141f2eefd'
  if (n.includes('steak') || n.includes('beef')) return '1600891964092-4316c288032e'
  if (n.includes('chicken')) return '1604908176997-125f25cc6f3d'
  if (n.includes('dessert') || n.includes('cake') || n.includes('sweet'))
    return '1551024601-bec78aea704b'
  if (n.includes('rice') || n.includes('biryani') || n.includes('nasi'))
    return '1550989460026-531e21b18361'
  if (n.includes('coffee') || n.includes('tea') || n.includes('drink') || n.includes('juice'))
    return '1544145945-f904253db0ad'
  if (n.includes('soup')) return '1547592166-23ac45744acd'
  // Default colorful food shot
  return '1504674900247-0877df9cc836'
}

// Helper to get diverse images for category cards
function getCategoryImgUrl(name) {
  const n = name.toLowerCase()
  if (n.includes('burger') || n.includes('fast food'))
    return 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=200&q=80'
  if (n.includes('pizza'))
    return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=200&q=80'
  if (n.includes('drink') || n.includes('beverage'))
    return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=200&q=80'
  if (n.includes('dessert') || n.includes('sweet'))
    return 'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=200&q=80'
  if (n.includes('rice') || n.includes('noodle'))
    return 'https://images.unsplash.com/photo-1626804475297-41609ea0e4eb?auto=format&fit=crop&w=200&q=80'
  if (n.includes('soup') || n.includes('starter') || n.includes('appetizer'))
    return 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=200&q=80'
  return 'https://images.unsplash.com/photo-1495195125609-84ea6af9e44d?auto=format&fit=crop&w=200&q=80'
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
  animation: scrollLeft 45s linear infinite;

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
