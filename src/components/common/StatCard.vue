<template>
  <div class="erp-stat-card">
    <div class="erp-stat-card__body">
      <!-- Icon Left -->
      <div class="erp-stat-card__icon-wrap">
        <q-icon :name="icon" size="24px" class="erp-stat-card__icon" />
      </div>

      <!-- Metric Right -->
      <div class="erp-stat-card__data">
        <div class="erp-stat-card__label">{{ title }}</div>
        <div class="erp-stat-card__value erp-num">{{ value }}</div>

        <div
          v-if="trend"
          class="erp-stat-card__trend"
          :class="`erp-stat-card__trend--${trendColor}`"
        >
          <q-icon :name="trendIcon" size="14px" />
          <span>{{ trend }}</span>
          <span class="erp-stat-card__trend-suffix">vs last period</span>
        </div>
        <div v-if="meta && !trend" class="erp-stat-card__meta">{{ meta }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
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
})
</script>

<style scoped lang="scss">
.erp-stat-card {
  position: relative;
  background-color: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg); // Max 8px
  overflow: hidden;
  height: 100%; // Uniform height
  min-height: 104px;
  padding: var(--erp-spacing-md); // 16px
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    border-color: var(--erp-border-hover);
    background-color: var(--erp-bg-card-hover);
  }

  &__body {
    display: flex;
    align-items: center; /* Center horizontally */
    gap: var(--erp-spacing-md);
    height: 100%;
  }

  &__icon-wrap {
    width: 48px;
    height: 48px;
    border-radius: var(--erp-radius-md); // 6px
    background-color: var(--erp-primary-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__icon {
    color: var(--erp-primary);
  }

  &__data {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  &__label {
    font-size: var(--erp-font-size-small); // 12px
    font-weight: var(--erp-font-weight-medium);
    color: var(--erp-text-secondary);
    margin-bottom: var(--erp-spacing-xs); // 4px
  }

  &__value {
    font-size: var(--erp-font-size-h1); // 22px
    font-weight: var(--erp-font-weight-bold);
    color: var(--erp-text-primary);
    line-height: 1.1;
  }

  &__trend {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: var(--erp-font-weight-medium);
    margin-top: var(--erp-spacing-xs);

    &--positive {
      color: var(--erp-success);
    }
    &--negative {
      color: var(--erp-danger);
    }
    &--neutral {
      color: var(--erp-text-muted);
    }
  }

  &__trend-suffix {
    color: var(--erp-text-muted);
    font-weight: var(--erp-font-weight-regular);
  }

  &__meta {
    font-size: 11px;
    color: var(--erp-text-muted);
    margin-top: var(--erp-spacing-xs);
  }
}
</style>
