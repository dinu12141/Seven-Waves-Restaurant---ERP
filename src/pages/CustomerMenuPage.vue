<template>
  <q-page class="q-pa-md bg-dark">
    <!-- Search & Filters -->
    <div class="row q-mb-lg items-center">
      <q-input
        v-model="search"
        placeholder="Search for food..."
        dark
        dense
        outlined
        rounded
        class="col"
        bg-color="dark-elevated"
      >
        <template v-slot:prepend>
          <q-icon name="search" color="primary" />
        </template>
      </q-input>
    </div>

    <!-- Category Tabs -->
    <div class="q-mb-md overflow-hidden">
      <q-tabs
        v-model="selectedCategory"
        dense
        no-caps
        align="left"
        class="text-grey-5 category-tabs"
        active-color="primary"
        indicator-color="transparent"
      >
        <q-tab
          v-for="cat in categories"
          :key="cat.name"
          :name="cat.name"
          class="q-mr-sm category-tab"
        >
          <div class="column items-center">
            <q-icon :name="cat.icon" size="24px" />
            <span class="text-caption q-mt-xs">{{ cat.name }}</span>
          </div>
        </q-tab>
      </q-tabs>
    </div>

    <!-- Menu Grid -->
    <div class="row q-col-gutter-lg">
      <div v-for="item in filteredItems" :key="item.id" class="col-12 col-sm-6 col-md-4">
        <MenuItemCard :product="item" @select="handleItemSelect" />
      </div>
    </div>

    <div
      v-if="filteredItems.length === 0"
      class="column items-center justify-center q-pa-xl text-grey-7"
    >
      <q-icon name="no_meals" size="64px" class="q-mb-md" style="opacity: 0.2" />
      <div class="text-subtitle1">No matching items found</div>
      <q-btn flat color="primary" label="Clear Filters" @click="resetFilters" no-caps />
    </div>

    <div style="height: 100px"></div>

    <!-- Floating Order Button for Mobile -->
    <q-page-sticky position="bottom" :offset="[0, 18]" class="lt-sm">
      <q-btn
        v-if="!store.isEmpty"
        unelevated
        rounded
        color="primary"
        class="q-px-xl q-py-sm shadow-10"
        @click="store.toggleCart"
      >
        <div class="row items-center">
          <q-icon name="shopping_basket" class="q-mr-sm" />
          <span class="text-weight-bold">View Order ({{ store.itemCount }})</span>
        </div>
      </q-btn>
    </q-page-sticky>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCustomerOrderStore } from 'src/stores/customerOrderStore'
import MenuItemCard from 'src/components/customer/MenuItemCard.vue'

const store = useCustomerOrderStore()

const search = ref('')
const selectedCategory = ref('All')

const categories = [
  { name: 'All', icon: 'restaurant' },
  { name: 'Burgers', icon: 'lunch_dining' },
  { name: 'Pizza', icon: 'local_pizza' },
  { name: 'Pastas', icon: 'dinner_dining' },
  { name: 'Drinks', icon: 'local_bar' },
  { name: 'Desserts', icon: 'cake' },
]

const mockItems = [
  {
    id: 'm1',
    name: 'Classic Cheeseburger',
    description: 'Juicy beef patty with cheddar cheese, lettuce, and our secret sauce.',
    price: 1850,
    category: 'Burgers',
    is_popular: true,
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=600&h=450&fit=crop',
  },
  {
    id: 'm2',
    name: 'Pepperoni Perfection',
    description: 'Crispy thin crust topped with premium pepperoni and mozzarella.',
    price: 2400,
    category: 'Pizza',
    is_popular: true,
    image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?q=80&w=600&h=450&fit=crop',
  },
  {
    id: 'm3',
    name: 'Creamy Carbonara',
    description: 'Spaghetti in a rich parmesan and pancetta cream sauce.',
    price: 1650,
    category: 'Pastas',
    image: 'https://images.unsplash.com/photo-1612450844493-f1441864199c?q=80&w=600&h=450&fit=crop',
  },
  {
    id: 'm4',
    name: 'Double BBQ Wings',
    description: '8 pieces of smokey BBQ glazed chicken wings.',
    price: 1400,
    category: 'All',
    image: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?q=80&w=600&h=450&fit=crop',
  },
  {
    id: 'm5',
    name: 'Mango Iced Tea',
    description: 'Refreshing homemade iced tea with fresh mango pulp.',
    price: 650,
    category: 'Drinks',
    image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?q=80&w=600&h=450&fit=crop',
  },
  {
    id: 'm6',
    name: 'Tiramisu',
    description: 'Classic Italian coffee-flavored dessert.',
    price: 950,
    category: 'Desserts',
    image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?q=80&w=600&h=450&fit=crop',
  },
]

const filteredItems = computed(() => {
  return mockItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.value.toLowerCase())
    const matchesCategory =
      selectedCategory.value === 'All' || item.category === selectedCategory.value
    return matchesSearch && matchesCategory
  })
})

function handleItemSelect(product) {
  store.addItem(product)
}

function resetFilters() {
  search.value = ''
  selectedCategory.value = 'All'
}
</script>

<style lang="scss" scoped>
.category-tab {
  min-width: 80px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  padding: 10px;
  transition: all 0.3s ease;
  border: 1px solid transparent;

  &.q-tab--active {
    background: rgba(var(--q-primary), 0.1);
    border-color: rgba(var(--q-primary), 0.2);
  }
}

.category-tabs {
  :deep(.q-tabs__content) {
    padding: 4px;
  }
}

.dark-elevated {
  background: #1e1e1e;
}
</style>
