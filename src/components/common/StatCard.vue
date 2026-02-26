<template>
  <div class="erp-stat-card" :class="`erp-stat-card--${variant}`">
    <!-- Accent bar top -->
    <div class="erp-stat-card__accent-bar" :style="{ background: accentColor }"></div>

    <div class="erp-stat-card__body">
      <!-- Icon -->
      <div class="erp-stat-card__icon-wrap" :style="{ background: iconBg }">
        <q-icon :name="icon" size="20px" :style="{ color: accentColor }" />
      </div>

      <!-- Data -->
      <div class="erp-stat-card__data">
        <div class="erp-stat-card__label">{{ title }}</div>
        <div class="erp-stat-card__value erp-num">{{ value }}</div>
        <div
          v-if="trend"
          class="erp-stat-card__trend"
          :class="`erp-stat-card__trend--${trendColor}`"
        >
          <q-icon :name="trendIcon" size="13px" />
          <span>{{ trend }}</span>
          <span class="erp-stat-card__trend-suffix">vs last month</span>
        </div>
        <div v-if="meta" class="erp-stat-card__meta">{{ meta }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  value: {
    type: [String, Number],
    required: true,
  },
  icon: {
    type: String,
    default: 'analytics',
  },
  color: {
    type: String,
    default: 'blue',
  },
  trend: {
    type: String,
    default: '',
  },
  trendIcon: {
    type: String,
    default: 'trending_flat',
  },
  trendColor: {
    type: String,
    default: 'neutral',
  },
  meta: {
    type: String,
    default: '',
  },
  variant: {
    type: String,
    default: 'default',
  },
})

const COLOR_MAP = {
  blue: { accent: '#4385f5', bg: 'rgba(67,133,245,0.1)' },
  green: { accent: '#34a853', bg: 'rgba(52,168,83,0.1)' },
  orange: { accent: '#f9ab00', bg: 'rgba(249,171,0,0.1)' },
  red: { accent: '#ea4335', bg: 'rgba(234,67,53,0.1)' },
  purple: { accent: '#9c71f4', bg: 'rgba(156,113,244,0.1)' },
  teal: { accent: '#00bcd4', bg: 'rgba(0,188,212,0.1)' },
  primary: { accent: '#4385f5', bg: 'rgba(67,133,245,0.1)' },
  warning: { accent: '#f9ab00', bg: 'rgba(249,171,0,0.1)' },
  info: { accent: '#4385f5', bg: 'rgba(67,133,245,0.1)' },
}

const colorConfig = computed(() => COLOR_MAP[props.color] || COLOR_MAP.blue)
const accentColor = computed(() => colorConfig.value.accent)
const iconBg = computed(() => colorConfig.value.bg)
</script>

<style scoped lang="scss">
.erp-stat-card {
  position: relative;
  background-color: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: 12px;
  overflow: hidden;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease;
  padding: 18px;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  }

  &__accent-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    opacity: 0.8;
  }

  &__body {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding-top: 4px;
  }

  &__icon-wrap {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  &__data {
    flex: 1;
    min-width: 0;
  }

  &__label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--erp-text-tertiary);
    margin-bottom: 6px;
  }

  &__value {
    font-size: 26px;
    font-weight: 600;
    color: var(--erp-text-primary);
    line-height: 1.1;
    margin-bottom: 4px;
  }

  &__trend {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 12px;
    font-weight: 500;

    &--positive,
    &--up,
    &--green {
      color: var(--erp-success);
    }
    &--negative,
    &--down,
    &--red {
      color: var(--erp-error);
    }
    &--neutral,
    &--grey,
    &--flat {
      color: var(--erp-text-tertiary);
    }
  }

  &__trend-suffix {
    color: var(--erp-text-tertiary);
    font-weight: 400;
    margin-left: 2px;
  }

  &__meta {
    font-size: 11px;
    color: var(--erp-text-tertiary);
    margin-top: 2px;
  }
}
</style>
