<template>
  <div class="date-range-picker row items-center q-gutter-sm no-wrap">
    <q-btn-toggle v-model="selectedPreset" no-caps dense unelevated toggle-color="primary" color="transparent" text-color="grey-5" :options="presets" class="date-range-picker__presets" />
    <q-input v-model="dateRange.from" type="date" dense outlined label="From" class="date-range-picker__input" @update:model-value="onCustomRange" />
    <q-input v-model="dateRange.to" type="date" dense outlined label="To" class="date-range-picker__input" @update:model-value="onCustomRange" />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

defineProps({
  modelValue: { type: Object, default: () => ({ from: '', to: '' }) },
})
const emit = defineEmits(['update:modelValue', 'change'])

const today = new Date().toISOString().split('T')[0]
const presets = [
  { label: 'Today', value: 'today' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: 'MTD', value: 'mtd' },
  { label: 'Custom', value: 'custom' },
]
const selectedPreset = ref('today')
const dateRange = ref({ from: today, to: today })

function computeRange(preset) {
  const now = new Date()
  const to = now.toISOString().split('T')[0]
  let from = to
  if (preset === '7d') { const d = new Date(now); d.setDate(d.getDate() - 6); from = d.toISOString().split('T')[0] }
  else if (preset === '30d') { const d = new Date(now); d.setDate(d.getDate() - 29); from = d.toISOString().split('T')[0] }
  else if (preset === 'mtd') { from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0] }
  return { from, to }
}

watch(selectedPreset, (val) => {
  if (val !== 'custom') { dateRange.value = computeRange(val); emit('update:modelValue', dateRange.value); emit('change', dateRange.value) }
}, { immediate: true })

function onCustomRange() {
  selectedPreset.value = 'custom'
  emit('update:modelValue', dateRange.value)
  emit('change', dateRange.value)
}
</script>

<style scoped>
.date-range-picker { flex-wrap: wrap; }
.date-range-picker__input { max-width: 150px; }
</style>
