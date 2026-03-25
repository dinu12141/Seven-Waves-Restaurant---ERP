<template>
  <div class="erp-dashboard-card q-pa-md" :class="colorClass">
    <div class="erp-dashboard-card__glow"></div>
    <div class="row no-wrap items-center relative-position z-top full-height">
      <div class="erp-dashboard-card__icon-box q-mr-md" :class="`text-${color}`">
        <q-icon :name="icon" size="28px" />
      </div>
      <div class="column justify-center flex-grow" style="min-width: 0; min-height: 56px">
        <div class="erp-dashboard-card__title text-uppercase text-weight-bold tracking-wide">{{ title }}</div>
        <div class="erp-dashboard-card__value erp-num q-my-xs tracking-tight" :title="String(value)">{{ value }}</div>
        <div class="erp-dashboard-card__subtext ellipsis">
          <span class="q-mr-xs text-weight-bold" :class="trendClass" v-if="trend">
            <q-icon :name="trendIcon" size="14px" class="q-mr-xs" v-if="trendIcon" />
            {{ trend }}
          </span>
          <span>{{ meta }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: String,
  value: [String, Number],
  icon: String,
  color: { type: String, default: 'primary' },
  trend: String,
  trendIcon: String,
  trendColor: { type: String, default: 'neutral' }, // positive, negative, neutral
  meta: String,
})

const colorClass = computed(() => `erp-dashboard-card--${props.color}`)
const trendClass = computed(() => {
  if (props.trendColor === 'positive') return 'text-positive'
  if (props.trendColor === 'negative') return 'text-negative'
  return 'erp-dashboard-card__trend-neutral'
})
</script>

<style scoped lang="scss">
.erp-dashboard-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border-strong);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  height: 100%;
  min-height: 105px;
  min-width: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--erp-shadow-card);

  &:hover {
    transform: translateY(-4px);
    border-color: var(--erp-border-hover);
    box-shadow: var(--erp-shadow-lg);
    
    .erp-dashboard-card__glow {
      opacity: 0.15;
    }
  }

  &__glow {
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle at center, currentColor 0%, transparent 60%);
    opacity: 0;
    transition: opacity 0.5s ease;
    pointer-events: none;
    z-index: 0;
  }

  &--primary { color: var(--erp-primary); }
  &--green { color: #10b981; }
  &--blue { color: #3b82f6; }
  &--orange { color: #f59e0b; }
  &--red { color: #ef4444; }
  &--purple { color: #8b5cf6; }
  &--teal { color: #0d9488; }

  &__icon-box {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: var(--erp-bg-hover);
    border: 1px solid var(--erp-border);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__title {
    font-size: 11px;
    letter-spacing: 0.8px;
    line-height: 1.2;
    color: var(--erp-text-muted);
  }

  &__value {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--erp-text-primary);
  }

  &__subtext {
    font-size: 11.5px;
    font-weight: 500;
    margin-top: 4px;
    display: flex;
    align-items: center;
    color: var(--erp-text-muted);
  }

  &__trend-neutral {
    color: var(--erp-text-muted);
  }

  .tracking-wide { letter-spacing: 1px; }
  .tracking-tight { letter-spacing: -0.5px; }
  .z-top { z-index: 2; position: relative; }
}
</style>
