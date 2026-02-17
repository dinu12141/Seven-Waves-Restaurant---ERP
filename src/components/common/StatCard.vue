<template>
  <q-card class="bg-grey-9 text-white stat-card" flat bordered>
    <q-card-section>
      <div class="row items-center no-wrap">
        <div class="col">
          <div class="text-subtitle2 text-grey-5 text-uppercase" style="letter-spacing: 1px">
            {{ title }}
          </div>
          <div class="text-h4 text-weight-bold q-mt-sm">{{ value }}</div>
        </div>
        <div class="col-auto">
          <q-avatar size="48px" font-size="24px" :color="color" text-color="white" :icon="icon" />
        </div>
      </div>
    </q-card-section>

    <q-card-section class="q-pt-none">
      <div class="row items-center text-caption" :class="`text-${trendColor}`">
        <q-icon :name="trendIcon" size="16px" class="q-mr-xs" />
        <span class="text-weight-bold">{{ trend }}</span>
        <span class="text-grey-6 q-ml-xs">vs last month</span>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  value: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: 'analytics',
  },
  color: {
    type: String,
    default: 'primary',
  },
  trend: {
    type: String,
    default: '0%',
  },
  trendIcon: {
    type: String,
    default: 'trending_flat',
  },
  trendColor: {
    type: String,
    default: 'grey',
  },
})
</script>

<style scoped>
.stat-card {
  transition: transform 0.2s;
}
.stat-card:hover {
  transform: translateY(-2px);
}
</style>
