<template>
  <div class="erp-dashboard-card q-pa-md" :class="colorClass">
    <div class="row no-wrap items-center">
      <div class="erp-dashboard-card__icon-box q-mr-md">
        <q-icon :name="icon" size="24px" :color="color" />
      </div>
      <div class="column flex-grow" style="min-width: 0">
        <div class="erp-dashboard-card__title text-uppercase text-grey-5">{{ title }}</div>
        <div class="erp-dashboard-card__value erp-num" :title="String(value)">{{ value }}</div>
        <div class="erp-dashboard-card__subtext text-grey-6 text-caption ellipsis">
          <span v-if="trendIcon" :class="trendClass" class="q-mr-xs">
            <q-icon :name="trendIcon" /> {{ trend }}
          </span>
          {{ meta }}
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
  return 'text-grey-5'
})
</script>

<style scoped lang="scss">
.erp-dashboard-card {
  background: var(--erp-bg-form-card, #111827);
  border: 1px solid var(--erp-input-border, #1f2937);
  border-radius: var(--erp-radius-md, 8px);
  position: relative;
  overflow: hidden;
  min-width: 0; // prevent overflow flex

  // Subtle top border accent based on color
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: currentColor;
    opacity: 0.8;
  }

  &--primary::before {
    color: var(--erp-primary);
  }
  &--green::before {
    color: #10b981;
  } // emerald
  &--blue::before {
    color: #3b82f6;
  }
  &--orange::before {
    color: #f59e0b;
  }
  &--red::before {
    color: #ef4444;
  }
  &--purple::before {
    color: #8b5cf6;
  }

  &__icon-box {
    width: 48px;
    height: 48px;
    border-radius: var(--erp-radius-sm, 6px);
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__title {
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__value {
    font-size: 24px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--erp-text-primary);
    font-feature-settings:
      'tnum' on,
      'lnum' on; // Tabular nums
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__subtext {
    margin-top: 2px;
    font-size: 11px;
    font-weight: 500;
  }
}
</style>
