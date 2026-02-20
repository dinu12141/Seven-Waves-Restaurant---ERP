<template>
  <q-layout view="lHh Lpr lFf" class="bg-dark custom-layout">
    <q-header elevated class="bg-dark text-white border-bottom">
      <q-toolbar class="q-px-md" style="height: 70px">
        <div class="column">
          <span class="text-overline text-primary line-height-1">SEVEN WAVES</span>
          <span class="text-h6 text-weight-bold line-height-1">{{ store.tableName }}</span>
        </div>

        <q-space />

        <q-btn flat round dense icon="shopping_basket" @click="store.toggleCart" class="q-mr-sm">
          <q-badge v-if="store.itemCount > 0" color="primary" floating rounded>
            {{ store.itemCount }}
          </q-badge>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- Cart Drawer -->
    <CartDrawer />
  </q-layout>
</template>

<script setup>
import { useCustomerOrderStore } from 'src/stores/customerOrderStore'
import CartDrawer from 'src/components/customer/CartDrawer.vue'

const store = useCustomerOrderStore()
</script>

<style lang="scss" scoped>
.custom-layout {
  font-family: 'Inter', 'Roboto', sans-serif;
}

.border-bottom {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.line-height-1 {
  line-height: 1.2;
}

.text-overline {
  font-size: 0.65rem;
  letter-spacing: 2px;
  font-weight: 700;
}
</style>
