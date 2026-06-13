<template>
  <span class="money-display" :class="{ 'money-display--negative': isNegative }" :aria-label="`${currency} ${formattedValue}`">
    <span class="money-display__currency">{{ currency }}</span>
    <span class="money-display__value">{{ formattedValue }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  amount: { type: Number, required: true },
  currency: { type: String, default: 'LKR' },
  decimals: { type: Number, default: 2 },
  showSign: { type: Boolean, default: false },
})

const isNegative = computed(() => props.amount < 0)
const formattedValue = computed(() => {
  const abs = Math.abs(props.amount)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: props.decimals, maximumFractionDigits: props.decimals })
  if (props.showSign && props.amount > 0) return `+${formatted}`
  if (isNegative.value) return `-${formatted}`
  return formatted
})
</script>

<style scoped>
.money-display { display: inline-flex; align-items: baseline; gap: 4px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.money-display__currency { font-size: 0.75em; opacity: 0.7; font-weight: 500; }
.money-display__value { font-weight: 700; }
.money-display--negative { color: var(--erp-danger, #ef4444); }
</style>
