<template>
  <q-card class="menu-item-card overflow-hidden shadow-touch" flat bordered>
    <div class="card-img-wrapper" @click="$emit('request-add', item)">
      <q-img
        :src="item.image_url || ''"
        class="menu-img"
        spinner-color="primary"
        ratio="1"
        :class="{ grayscale: !item.is_available }"
        loading="lazy"
        no-spinner
      >
        <!-- Placeholder shown while loading or when no image -->
        <template v-slot:error>
          <div class="absolute-full flex flex-center bg-grey-9">
            <q-icon name="restaurant" size="48px" color="grey-6" />
          </div>
        </template>
        <template v-slot:loading>
          <div class="absolute-full flex flex-center bg-grey-10">
            <q-skeleton type="rect" class="full-width full-height" />
          </div>
        </template>

        <!-- Status overlay -->
        <div v-if="!item.is_available" class="absolute-full flex flex-center bg-black-06">
          <div
            class="text-caption text-weight-bold text-white bg-negative q-px-sm q-py-xs rounded-borders rotate-45 transform-center shadow-10"
          >
            SOLD OUT
          </div>
        </div>

        <!-- Tags top left -->
        <div class="absolute-top-left q-pa-xs row q-gutter-x-xs bg-transparent">
          <q-badge
            v-if="item.is_best_seller"
            color="warning"
            class="text-dark text-weight-bolder shadow-3 q-px-xs"
            rounded
            style="font-size: 8px"
            >★ Best</q-badge
          >
        </div>

        <!-- Tags bottom right -->
        <div class="absolute-bottom-right q-pa-xs row q-gutter-x-xs q-mb-sm">
          <q-badge
            v-if="item.is_veg"
            color="positive"
            class="shadow-3 text-weight-bolder"
            style="font-size: 8px"
            >Veg</q-badge
          >
          <q-badge
            v-if="item.is_spicy"
            color="negative"
            class="shadow-3 text-weight-bolder"
            style="font-size: 8px"
            >Hot</q-badge
          >
        </div>
      </q-img>
    </div>

    <q-card-section class="card-info-section q-pt-sm q-pb-xs flex-grow">
      <div
        class="text-weight-bold ellipsis-2-lines name-text"
        :class="$q.dark.isActive ? 'text-white' : 'text-black'"
        :title="item.name"
      >
        {{ item.name }}
      </div>
    </q-card-section>

    <q-card-section class="row items-center justify-between q-pt-none q-pb-sm q-px-sm">
      <div class="text-weight-black font-mono price-text">
        LKR {{ Math.round(item.price).toLocaleString('en-LK') }}
      </div>

      <q-btn
        v-if="item.is_available"
        round
        dense
        color="primary"
        icon="add"
        size="xs"
        class="shadow-top-glow"
        unelevated
        @click="$emit('add-to-cart', item)"
      />
      <q-btn v-else round dense color="grey-8" icon="block" size="xs" disable unelevated />
    </q-card-section>
  </q-card>
</template>

<script setup>
import { useQuasar } from 'quasar'

const $q = useQuasar()

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
  border-radius: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  transition:
    transform 0.2s cubic-bezier(0.2, 0, 0, 1),
    box-shadow 0.2s,
    background 0.25s;
  cursor: pointer;

  &:active {
    transform: scale(0.97);
  }
  &:hover {
    box-shadow:
      0 10px 25px -5px rgba(249, 115, 22, 0.15),
      0 8px 10px -6px rgba(249, 115, 22, 0.1);
    border-color: rgba(249, 115, 22, 0.3);
    .menu-img {
      transform: scale(1.05);
    }
  }
}

:global(.body--dark) .menu-item-card {
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.9) 100%);
  border-color: rgba(255, 255, 255, 0.05);
}
:global(.body--light) .menu-item-card {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
}

.card-img-wrapper {
  overflow: hidden;
  border-radius: 16px 16px 0 0;
}

:global(.body--dark) .card-img-wrapper {
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}
:global(.body--light) .card-img-wrapper {
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
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

.card-info-section {
  padding-left: 10px;
  padding-right: 10px;
}

.name-text {
  font-size: 13px;
  line-height: 1.35;
  letter-spacing: -0.1px;
  min-height: 18px;
  font-weight: 700;
}
:global(.body--dark) .name-text {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.price-text {
  font-size: 13px;
  color: #f97316;
  letter-spacing: -0.2px;
  font-weight: 900;
}

.flex-grow {
  flex-grow: 1;
}

.shadow-touch {
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.15),
    0 2px 4px -2px rgba(0, 0, 0, 0.1);
}
:global(.body--light) .shadow-touch {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.shadow-top-glow {
  box-shadow: 0 -2px 10px rgba(249, 115, 22, 0.5);
}

.font-mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
}
.grayscale {
  filter: grayscale(100%);
}
</style>
