<template>
  <div class="sys-kpi-card" :class="gradientClass">
    <!-- Watermark icon -->
    <q-icon :name="icon" size="72px" class="sys-kpi-watermark" />

    <!-- Frosted icon wrap -->
    <div class="sys-kpi-icon-wrap">
      <q-icon :name="icon" size="22px" color="white" />
    </div>

    <!-- Body -->
    <div class="sys-kpi-body">
      <div class="sys-kpi-label">{{ title }}</div>
      <div class="sys-kpi-value">{{ value }}</div>
      <div v-if="trend || meta" class="sys-kpi-meta">
        <span v-if="trend" :class="trendClass" class="q-mr-xs">
          <q-icon v-if="trendIcon" :name="trendIcon" size="12px" class="q-mr-xs" />
          {{ trend }}
        </span>
        <span v-if="meta" class="ellipsis">{{ meta }}</span>
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
  color: { type: String, default: 'blue' },
  trend: String,
  trendIcon: String,
  trendColor: { type: String, default: 'neutral' },
  meta: String,
  isCurrency: Boolean,
})

const gradientClass = computed(() => `sys-kpi-card--${props.color}`)

const trendClass = computed(() => {
  if (props.trendColor === 'positive') return 'text-positive'
  if (props.trendColor === 'negative') return 'text-negative'
  return 'sys-kpi-meta--neutral'
})
</script>

<style scoped lang="scss">
.sys-kpi-card {
  border-radius: 12px;
  padding: 16px 18px 14px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  position: relative;
  overflow: hidden;
  border: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  height: 100%;
  min-height: 96px;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  }

  // Gradient variants — exact same as main dashboard
  &--blue {
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--green, &--primary {
    background: linear-gradient(135deg, #065f46 0%, #059669 100%);
    box-shadow: 0 4px 14px rgba(5, 150, 105, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--orange, &--amber {
    background: linear-gradient(135deg, #78350f 0%, #d97706 100%);
    box-shadow: 0 4px 14px rgba(217, 119, 6, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--red {
    background: linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%);
    box-shadow: 0 4px 14px rgba(220, 38, 38, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--purple, &--deep-purple {
    background: linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%);
    box-shadow: 0 4px 14px rgba(124, 58, 237, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--teal, &--cyan {
    background: linear-gradient(135deg, #134e4a 0%, #0d9488 100%);
    box-shadow: 0 4px 14px rgba(13, 148, 136, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--indigo {
    background: linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%);
    box-shadow: 0 4px 14px rgba(67, 56, 202, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
}


// Frosted icon wrap — 46×46px, exact match
.sys-kpi-icon-wrap {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

// Body
.sys-kpi-body {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}

// Label — 10px, same as main dashboard
.sys-kpi-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 6px;
}

// Value — auto-shrink for long numbers
.sys-kpi-value {
  font-size: 22px;
  font-weight: 900;
  color: #ffffff;
  line-height: 1;
  margin-bottom: 8px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

// Meta / trend row
.sys-kpi-meta {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.65);
  display: flex;
  align-items: center;
}
.sys-kpi-meta--neutral {
  color: rgba(255, 255, 255, 0.65);
}

// Watermark icon
.sys-kpi-watermark {
  position: absolute;
  right: -12px;
  bottom: -12px;
  opacity: 0.08;
  pointer-events: none;
  color: white !important;
}
</style>
