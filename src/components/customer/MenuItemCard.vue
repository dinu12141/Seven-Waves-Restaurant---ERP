<template>
  <q-card v-ripple class="menu-item-card cursor-pointer" @click="$emit('select', product)">
    <div class="relative-position overflow-hidden rounded-top">
      <q-img :src="product.image" :ratio="4 / 3" class="product-image transition-transform">
        <template v-slot:loading>
          <q-skeleton type="rect" class="full-height" />
        </template>
      </q-img>

      <div v-if="product.is_popular" class="popular-badge">
        <q-icon name="favorite" size="12px" class="q-mr-xs" />
        POPULAR
      </div>
    </div>

    <q-card-section class="q-pa-md">
      <div class="text-subtitle1 text-weight-bold text-white line-clamp-1">{{ product.name }}</div>
      <div class="text-caption text-grey-5 line-clamp-2 q-mt-xs" style="height: 3em">
        {{ product.description || 'Deliciously prepared with fresh ingredients.' }}
      </div>

      <div class="row items-center justify-between q-mt-md">
        <div class="text-subtitle1 text-primary text-weight-bold">
          LKR {{ product.price.toLocaleString() }}
        </div>

        <q-btn round unelevated size="sm" icon="add" color="primary" class="add-btn shadow-2" />
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup>
defineProps({
  product: {
    type: Object,
    required: true,
  },
})

defineEmits(['select'])
</script>

<style lang="scss" scoped>
.menu-item-card {
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);

  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
    border-color: rgba(var(--q-primary), 0.3);

    .product-image {
      transform: scale(1.08);
    }
  }
}

.product-image {
  transition: transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.popular-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  background: q-color('orange-8');
  color: white;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 1px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  z-index: 1;
}

.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.add-btn {
  width: 32px;
  height: 32px;
  transition: transform 0.2s ease;

  &:active {
    transform: scale(0.9);
  }
}

.rounded-top {
  border-radius: 0;
}
</style>
