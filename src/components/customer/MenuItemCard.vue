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
            <q-icon name="restaurant" size="28px" />
          </div>
        </template>
      </q-img>

      <!-- Best Seller Badge -->
      <div v-if="product.is_best_seller || product.is_popular" class="popular-badge">
        <q-icon name="local_fire_department" size="9px" class="q-mr-xs" />
        Popular
      </div>

      <!-- In Cart Overlay Indicator -->
      <div v-if="cartQty > 0" class="in-cart-indicator">
        <span>{{ cartQty }}</span>
      </div>
    </div>

    <!-- Body -->
    <div class="card-body">
      <div class="item-name">{{ product.name }}</div>
      <div v-if="product.description" class="item-desc">{{ product.description }}</div>

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
          <q-icon name="add" size="16px" />
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
  background: linear-gradient(160deg, #1e1e2c 0%, #161622 100%);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  position: relative;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    transform: translateY(-3px);
    border-color: rgba(249, 115, 22, 0.3);
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(249, 115, 22, 0.15);

    .card-image {
      transform: scale(1.07);
    }
  }

  &:active {
    transform: scale(0.97);
  }
}

.card-image-wrap {
  position: relative;
  overflow: hidden;
}

.card-image {
  transition: transform 0.45s cubic-bezier(0.25, 0.8, 0.25, 1);
  display: block;
}

.image-skeleton {
  background: linear-gradient(90deg, #1e1e2e 25%, #27273a 50%, #1e1e2e 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

.image-error {
  background: #1a1a2a;
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
  top: 7px;
  left: 7px;
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: white;
  padding: 3px 7px;
  border-radius: 20px;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.6px;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.5);
  text-transform: uppercase;
}

.in-cart-indicator {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.6);

  span {
    font-size: 0.65rem;
    font-weight: 900;
    color: white;
    line-height: 1;
  }
}

.card-body {
  padding: 10px 12px 12px;
}

.item-name {
  font-size: 0.85rem;
  font-weight: 800;
  color: #ffffff;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 4px;
  letter-spacing: -0.1px;

  @media (min-width: 600px) {
    font-size: 0.95rem;
  }
}

.item-desc {
  font-size: 0.7rem;
  color: #6b7280;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 10px;
}

.price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: auto;
}

.item-price {
  font-size: 0.9rem;
  font-weight: 800;
  color: #fb923c;
  white-space: nowrap;

  @media (min-width: 600px) {
    font-size: 1rem;
  }
}

.add-btn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 3px 10px rgba(249, 115, 22, 0.45);
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;

  &:active {
    transform: scale(0.88);
  }

  @media (hover: hover) {
    &:hover {
      transform: scale(1.12);
      box-shadow: 0 5px 16px rgba(249, 115, 22, 0.7);
    }
  }
}

.qty-control {
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(249, 115, 22, 0.1);
  border: 1.5px solid rgba(249, 115, 22, 0.35);
  border-radius: 20px;
  overflow: hidden;
  flex-shrink: 0;
}

.qty-btn {
  width: 30px;
  height: 30px;
  min-width: 30px;
  border: none;
  background: transparent;
  color: #fb923c;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: rgba(249, 115, 22, 0.35);
  }

  @media (hover: hover) {
    &:hover {
      background: rgba(249, 115, 22, 0.2);
    }
  }
}

.qty-value {
  min-width: 24px;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 800;
  color: #fb923c;
}
</style>
