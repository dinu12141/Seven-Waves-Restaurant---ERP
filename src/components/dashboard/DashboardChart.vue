<template>
  <div class="erp-chart-wrap" style="position: relative">
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
.erp-chart-wrap {
  width: 100%;
}
</style>
