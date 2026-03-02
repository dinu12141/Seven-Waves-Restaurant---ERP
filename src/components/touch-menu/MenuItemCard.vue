<template>
  <q-card class="menu-item-card bg-card text-white overflow-hidden shadow-touch" flat bordered>
    <div class="card-img-wrapper" @click="$emit('request-add', item)">
      <q-img
        :src="
          item.image_url ||
          'https://via.placeholder.com/300x200?text=' + encodeURIComponent(item.name)
        "
        class="menu-img"
        spinner-color="primary"
        ratio="1"
        :class="{ grayscale: !item.is_available }"
      >
        <template v-slot:loading>
          <q-spinner-puff size="md" color="primary" class="absolute-center" />
        </template>

        <!-- Status overlay -->
        <div v-if="!item.is_available" class="absolute-full flex flex-center bg-black-06">
          <div
            class="text-h6 text-weight-bold text-white bg-negative q-px-md q-py-sm rounded-borders rotate-45 transform-center shadow-10 letter-spacing-1"
          >
            SOLD OUT
          </div>
        </div>

        <!-- Tags top left -->
        <div class="absolute-top-left q-pa-sm row q-gutter-x-xs bg-transparent">
          <q-badge
            v-if="item.is_best_seller"
            color="warning"
            class="text-dark text-weight-bolder shadow-3 q-px-sm"
            rounded
            >★ Bestseller</q-badge
          >
        </div>

        <!-- Tags bottom right -->
        <div class="absolute-bottom-right q-pa-sm row q-gutter-x-xs q-mb-md">
          <q-badge v-if="item.is_veg" color="positive" class="shadow-3 text-weight-bolder"
            >Veg</q-badge
          >
          <q-badge v-if="item.is_spicy" color="negative" class="shadow-3 text-weight-bolder"
            >Spicy</q-badge
          >
        </div>
      </q-img>
    </div>

    <q-card-section class="q-pt-sm q-pb-none flex-grow">
      <div class="text-subtitle1 text-weight-bold ellipsis-2-lines name-text" :title="item.name">
        {{ item.name }}
      </div>
    </q-card-section>

    <q-card-section class="row items-center justify-between q-pt-xs q-pb-md">
      <div class="text-subtitle1 text-primary text-weight-black font-mono price-text">
        LKR {{ Math.round(item.price).toLocaleString('en-LK') }}
      </div>

      <q-btn
        v-if="item.is_available"
        round
        dense
        color="primary"
        icon="add"
        size="sm"
        class="shadow-top-glow"
        unelevated
        @click="$emit('add-to-cart', item)"
      />
      <q-btn v-else round dense color="grey-8" icon="block" size="sm" disable unelevated />
    </q-card-section>
  </q-card>
</template>

<script setup>
defineProps({
  item: {
    type: Object,
    required: true,
  },
})

defineEmits(['add-to-cart', 'request-add'])
</script>

<style scoped lang="scss">
.menu-item-card {
  border-color: rgba(255, 255, 255, 0.05);
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.9) 100%);
  border-radius: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  transition:
    transform 0.2s cubic-bezier(0.2, 0, 0, 1),
    box-shadow 0.2s;
  cursor: pointer;

  &:active {
    transform: scale(0.97);
  }

  &:hover {
    box-shadow:
      0 10px 25px -5px rgba(37, 99, 235, 0.1),
      0 8px 10px -6px rgba(37, 99, 235, 0.1);
    border-color: rgba(37, 99, 235, 0.2);

    .menu-img {
      transform: scale(1.05);
    }
  }
}

.card-img-wrapper {
  overflow: hidden;
  border-radius: 16px 16px 0 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.menu-img {
  transition: transform 0.4s ease-out;
}

.bg-black-06 {
  background: rgba(0, 0, 0, 0.65);
}

.transform-center {
  transform: rotate(-15deg);
}

.name-text {
  font-size: 14px;
  line-height: 1.2;
  color: #f8fafc;
  letter-spacing: -0.2px;
  min-height: 34px;
}

.price-text {
  font-size: 15px;
  color: #3b82f6;
  letter-spacing: -0.3px;
}

.flex-grow {
  flex-grow: 1;
}

.shadow-touch {
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.2),
    0 2px 4px -2px rgba(0, 0, 0, 0.2);
}

.shadow-top-glow {
  box-shadow: 0 -2px 10px rgba(37, 99, 235, 0.4);
}

.font-mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
}
.letter-spacing-1 {
  letter-spacing: 1px;
}
.letter-spacing-05 {
  letter-spacing: 0.5px;
}
.grayscale {
  filter: grayscale(100%);
}
</style>
