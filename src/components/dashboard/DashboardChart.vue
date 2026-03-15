<template>
  <div class="erp-chart-card">
    <div class="erp-chart-card__header q-px-md q-pt-md">
      <div class="erp-chart-card__title">{{ title }}</div>
      <div v-if="subtitle" class="erp-chart-card__subtitle text-grey-5">{{ subtitle }}</div>
    </div>
    <div class="erp-chart-card__body q-pa-md" style="min-height: 250px; position: relative">
      <q-inner-loading :showing="loading" dark>
        <q-spinner-dots size="40px" color="primary" />
      </q-inner-loading>
      <apexchart
        v-if="!loading && computedOptions && isMounted"
        :type="type"
        :height="height"
        :options="computedOptions"
        :series="series"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import VueApexCharts from 'vue3-apexcharts'

const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
})
onBeforeUnmount(() => {
  isMounted.value = false
})

const props = defineProps({
  title: String,
  subtitle: String,
  loading: Boolean,
  type: { type: String, default: 'bar' },
  height: { type: [String, Number], default: 250 },
  series: { type: Array, required: true },
  options: { type: Object, default: () => ({}) },
})

const computedOptions = computed(() => {
  return {
    chart: {
      background: 'transparent',
      toolbar: { show: false },
      fontFamily: 'Inter, sans-serif',
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800,
        dynamicAnimation: { enabled: false },
      },
    },
    theme: { mode: 'dark' },
    grid: {
      borderColor: '#1f2937',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 10, bottom: 0, left: 10 },
    },
    dataLabels: { enabled: false },
    tooltip: { theme: 'dark' },
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'], // Pro palette
    xaxis: {
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: '#6b7280' } },
    },
    yaxis: {
      labels: { style: { colors: '#6b7280' } },
    },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      labels: { colors: '#9ca3af' },
    },
    stroke: { curve: 'smooth', width: 2 },
    ...props.options,
  }
})
</script>

<script>
export default {
  components: {
    apexchart: VueApexCharts,
  },
}
</script>

<style scoped lang="scss">
.erp-chart-card {
  background: linear-gradient(145deg, rgba(20, 25, 35, 0.7) 0%, rgba(15, 20, 28, 0.9) 100%);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    top: 48px;
    left: 16px;
    right: 16px;
    height: 1px;
    background: linear-gradient(90deg, rgba(255,255,255,0.1), transparent);
  }

  &__title {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #ffffff;
  }
  
  &__subtitle {
    font-size: 13px;
    color: #9ca3af;
    margin-top: 2px;
  }
}
</style>
