<template>
  <q-drawer
    v-model="store.cartDrawerOpen"
    side="right"
    overlay
    behavior="mobile"
    dark
    class="bg-dark-elevated"
    width="320"
  >
    <div class="column full-height">
      <!-- Header -->
      <div class="row items-center q-pa-md border-bottom bg-dark">
        <q-btn flat round dense icon="close" @click="store.toggleCart" />
        <span class="text-subtitle1 text-weight-bold q-ml-sm">Your Order</span>
        <q-space />
        <q-badge color="primary" class="q-px-sm">{{ store.itemCount }} items</q-badge>
      </div>

      <!-- Items List -->
      <q-scroll-area class="col q-pa-md">
        <div v-if="store.isEmpty" class="column items-center justify-center q-pa-xl text-grey-6">
          <q-icon name="shopping_cart" size="64px" class="q-mb-md" style="opacity: 0.2" />
          <div class="text-subtitle2">Your cart is empty</div>
          <div class="text-caption">Add some delicious items!</div>
        </div>

        <div v-else class="column q-gutter-y-md">
          <div
            v-for="(item, index) in store.cartItems"
            :key="item.id"
            class="cart-item row items-start"
          >
            <q-img :src="item.image" class="item-img rounded-borders" />
            <div class="col q-ml-sm">
              <div class="text-weight-bold text-white line-height-1">{{ item.name }}</div>
              <div v-if="item.variant" class="text-caption text-primary">{{ item.variant }}</div>
              <div class="text-subtitle2 text-grey-4 q-mt-xs">
                LKR {{ item.price.toLocaleString() }}
              </div>

              <div class="row items-center q-mt-sm">
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="remove"
                  color="grey-5"
                  class="bg-grey-9"
                  @click="store.updateQuantity(index, item.qty - 1)"
                />
                <span class="q-mx-md text-weight-bold">{{ item.qty }}</span>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="add"
                  color="primary"
                  class="bg-primary-light"
                  @click="store.updateQuantity(index, item.qty + 1)"
                />
                <q-space />
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="delete_outline"
                  color="red-4"
                  @click="store.removeItem(index)"
                />
              </div>
            </div>
          </div>
        </div>
      </q-scroll-area>

      <!-- Footer -->
      <div v-if="!store.isEmpty" class="q-pa-md bg-dark border-top shadow-up-2">
        <div class="row justify-between items-center q-mb-md">
          <span class="text-grey-4">Subtotal</span>
          <span class="text-h6 text-white text-weight-bold"
            >LKR {{ store.subtotal.toLocaleString() }}</span
          >
        </div>

        <q-btn
          unelevated
          color="primary"
          class="full-width q-py-sm text-weight-bold"
          label="Place Order"
          no-caps
          @click="handlePlaceOrder"
        />
      </div>
    </div>
  </q-drawer>
</template>

<script setup>
import { useCustomerOrderStore } from 'src/stores/customerOrderStore'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'

const store = useCustomerOrderStore()
const router = useRouter()
const $q = useQuasar()

async function handlePlaceOrder() {
  $q.loading.show({
    message: 'Sending order to kitchen...',
    backgroundColor: 'dark',
    spinnerColor: 'primary',
  })

  // Simulated delay
  setTimeout(async () => {
    const res = await store.placeOrder()
    $q.loading.hide()

    if (res.success) {
      store.cartDrawerOpen = false
      router.push('/menu/track')

      $q.notify({
        message: 'Order Placed!',
        caption: 'Your food is being prepared.',
        color: 'positive',
        icon: 'check_circle',
        position: 'top',
      })
    }
  }, 1500)
}
</script>

<style lang="scss" scoped>
.bg-dark-elevated {
  background: #1e1e1e !important;
}

.border-bottom {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.border-top {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.item-img {
  width: 70px;
  height: 70px;
  object-fit: cover;
}

.bg-grey-9 {
  background: rgba(255, 255, 255, 0.05);
}

.bg-primary-light {
  background: rgba(var(--q-primary), 0.1);
}

.line-height-1 {
  line-height: 1.2;
}

.cart-item {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
