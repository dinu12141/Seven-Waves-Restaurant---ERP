<template>
  <q-card
    class="menu-item-card cursor-pointer column full-height"
    flat
    @click="$emit('select', product)"
  >
    <!-- Product Image -->
    <q-img :src="product.image" :ratio="4 / 3" class="menu-item-image" spinner-color="primary">
      <!-- Price Badge -->
      <div class="absolute-bottom-right q-pa-xs">
        <q-badge class="price-badge text-weight-bold" color="primary" text-color="white">
          ${{ product.price.toFixed(2) }}
        </q-badge>
      </div>

      <!-- Variant Indicator -->
      <div v-if="hasVariants" class="absolute-top-right q-pa-xs">
        <q-badge class="variant-badge" color="orange-8" text-color="white">
          <q-icon name="tune" size="10px" class="q-mr-xs" />
          {{ product.variants.length }}
        </q-badge>
      </div>
    </q-img>

    <!-- Info Section -->
    <q-card-section class="q-pa-sm text-center col-grow flex flex-center column card-info">
      <div class="text-weight-bold item-name">{{ product.name }}</div>
      <div class="text-caption text-grey-5 item-category">{{ product.category }}</div>
    </q-card-section>
  </q-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  product: {
    type: Object,
    required: true,
  },
})

defineEmits(['select'])

const hasVariants = computed(() => props.product.variants && props.product.variants.length > 0)
</script>

<style scoped lang="scss">
.menu-item-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    border-color: rgba(25, 118, 210, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  &:active {
    transform: scale(0.96);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
}

.menu-item-image {
  border-radius: 12px 12px 0 0;
}

.price-badge {
  font-size: 0.85rem;
  padding: 4px 10px;
  border-radius: 8px;
}

.variant-badge {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 6px;
}

.card-info {
  min-height: 52px;
}

.item-name {
  font-size: 0.85rem;
  line-height: 1.2;
  color: #fff;
}

.item-category {
  font-size: 0.7rem;
  margin-top: 2px;
}
</style>
