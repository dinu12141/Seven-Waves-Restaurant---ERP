<template>
  <q-card class="menu-item-card" v-ripple @click="handleCardClick">
    <!-- Image -->
    <div class="card-image-wrap">
      <q-img :src="product.image" :ratio="4 / 3" class="card-image" loading="lazy">
        <template v-slot:loading>
          <div class="image-skeleton full-height"></div>
        </template>
        <template v-slot:error>
          <div class="image-error full-height column items-center justify-center text-grey-7">
            <q-icon name="restaurant" size="32px" />
          </div>
        </template>
      </q-img>

      <!-- Popular Badge -->
      <div v-if="product.is_popular" class="popular-badge">
        <q-icon name="local_fire_department" size="10px" class="q-mr-xs" />
        Popular
      </div>
    </div>

    <!-- Body -->
    <div class="card-body">
      <div class="item-name">{{ product.name }}</div>
      <div class="item-desc">{{ product.description }}</div>

      <!-- Price + Add/Qty Row -->
      <div class="price-row">
        <div class="item-price">LKR {{ product.price.toLocaleString() }}</div>

        <!-- Quantity controls (when in cart) -->
        <div v-if="cartQty > 0" class="qty-control" @click.stop>
          <button class="qty-btn qty-minus" @click="$emit('remove', product)">
            <q-icon name="remove" size="14px" />
          </button>
          <span class="qty-value">{{ cartQty }}</span>
          <button class="qty-btn qty-plus" @click="$emit('add', product)">
            <q-icon name="add" size="14px" />
          </button>
        </div>

        <!-- Add button (when not in cart) -->
        <button v-else class="add-btn" @click.stop="$emit('add', product)">
          <q-icon name="add" size="18px" />
        </button>
      </div>
    </div>
  </q-card>
</template>

<script setup>
const props = defineProps({
  product: {
    type: Object,
    required: true,
  },
  cartQty: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['add', 'remove'])

function handleCardClick() {
  if (props.cartQty === 0) {
    emit('add', props.product)
  }
}
</script>

<style lang="scss" scoped>
.menu-item-card {
  background: #1a1a24;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  position: relative;

  &:hover {
    transform: translateY(-4px);
    border-color: rgba(249, 115, 22, 0.25);
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(249, 115, 22, 0.15);

    .card-image {
      transform: scale(1.06);
    }
  }

  &:active {
    transform: scale(0.98);
  }
}

.card-image-wrap {
  position: relative;
  overflow: hidden;
}

.card-image {
  transition: transform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
  display: block;
}

.image-skeleton {
  background: linear-gradient(90deg, #1e1e2e 25%, #252535 50%, #1e1e2e 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.image-error {
  background: #1e1e2e;
}

@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

.popular-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: white;
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.5);
  text-transform: uppercase;
}

.card-body {
  padding: 12px 14px 14px;
}

.item-name {
  font-size: 0.98rem;
  font-weight: 800;
  color: #ffffff;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 6px;
  letter-spacing: -0.2px;
}

.item-desc {
  font-size: 0.76rem;
  color: #9ca3af;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 12px;
}

.price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.item-price {
  font-size: 1rem;
  font-weight: 800;
  color: #fb923c;
}

.add-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 3px 10px rgba(249, 115, 22, 0.4);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 14px rgba(249, 115, 22, 0.7);
  }

  &:active {
    transform: scale(0.92);
  }
}

.qty-control {
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(249, 115, 22, 0.12);
  border: 1px solid rgba(249, 115, 22, 0.3);
  border-radius: 20px;
  overflow: hidden;
}

.qty-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: #fb923c;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(249, 115, 22, 0.2);
  }

  &:active {
    background: rgba(249, 115, 22, 0.35);
  }
}

.qty-value {
  min-width: 26px;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 800;
  color: #fb923c;
}
</style>
