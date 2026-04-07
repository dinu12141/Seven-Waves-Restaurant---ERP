<template>
  <div class="sys-kpi-card" :class="[`sys-kpi-card--${color}`]">
    <!-- Watermark icon -->
    <q-icon :name="icon" size="72px" class="sys-kpi-watermark" />

    <!-- Icon wrap -->
    <div class="sys-kpi-icon-wrap" :class="[`bg-${color}-1`]">
      <q-icon :name="icon" size="22px" :class="[`text-${color}`]" class="sys-kpi-main-icon" />
    </div>

    <!-- Body -->
    <div class="sys-kpi-body">
      <div class="sys-kpi-label">{{ title }}</div>
      <div class="sys-kpi-value" :class="[`text-${color}`]">
        <template v-if="isCurrency && typeof value === 'string'">
          <span class="sys-kpi-currency-symbol">{{ value.includes('LKR') ? 'LKR' : 'Rs.' }}</span>
          <span class="sys-kpi-amount">{{ value.replace(/Rs\.|LKR/g, '').trim() }}</span>
        </template>
        <template v-else>
          {{ value }}
        </template>
      </div>
      <div v-if="trend || meta" class="sys-kpi-meta">
        <div class="sys-kpi-meta-row">
          <span v-if="trend" :class="trendClass" class="sys-kpi-trend">
            <q-icon v-if="trendIcon" :name="trendIcon" size="14px" class="q-mr-xs" />
            <span class="text-weight-bold">{{ trend }}</span>
          </span>
          <span v-if="meta" class="sys-kpi-meta-text">{{ meta }}</span>
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
  color: { type: String, default: 'blue' },
  trend: String,
  trendIcon: String,
  trendColor: { type: String, default: 'neutral' },
  meta: String,
  isCurrency: Boolean,
})

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
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.25s ease;
  height: 100%;
  min-height: 96px;

  &:hover {
    transform: translateY(-2px);
  }
}

/* --- LIGHT MODE (Default) --- */
.body--light .sys-kpi-card {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);

  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }

  .sys-kpi-icon-wrap {
    background: var(--q-primary-opacity, rgba(0, 0, 0, 0.05));
    // Dynamic background based on color prop
    &.bg-blue-1 { background: #e3f2fd; }
    &.bg-green-1 { background: #e8f5e9; }
    &.bg-orange-1 { background: #fff3e0; }
    &.bg-red-1 { background: #ffebee; }
    &.bg-purple-1 { background: #f3e5f5; }
    &.bg-teal-1 { background: #e0f2f1; }
    &.bg-cyan-1 { background: #e0f7fa; }
    &.bg-indigo-1 { background: #e8eaf6; }
  }

  .sys-kpi-label {
    color: #64748b; // Muted slate
  }

  .sys-kpi-meta {
    color: #94a3b8;
  }

  .sys-kpi-meta--neutral {
    color: #94a3b8;
  }

  .sys-kpi-watermark {
    color: #000;
    opacity: 0.03;
  }
}

/* --- DARK MODE --- */
.body--dark .sys-kpi-card {
  border: none;
  
  &:hover {
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  }

  // Override text color to white for better contrast on gradients
  .sys-kpi-value, .sys-kpi-main-icon {
    color: #ffffff !important;
  }

  .sys-kpi-icon-wrap {
    background: rgba(255, 255, 255, 0.2) !important;
  }

  .sys-kpi-label {
    color: rgba(255, 255, 255, 0.85);
  }

  .sys-kpi-meta, .sys-kpi-meta--neutral {
    color: rgba(255, 255, 255, 0.7);
  }

  .sys-kpi-watermark {
    color: #ffffff !important;
    opacity: 0.08;
  }

  // Gradients for Dark Mode
  &--blue { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); }
  &--green, &--primary { background: linear-gradient(135deg, #065f46 0%, #059669 100%); }
  &--orange, &--amber { background: linear-gradient(135deg, #78350f 0%, #d97706 100%); }
  &--red { background: linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%); }
  &--purple, &--deep-purple { background: linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%); }
  &--teal, &--cyan { background: linear-gradient(135deg, #134e4a 0%, #0d9488 100%); }
  &--indigo { background: linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%); }
}

// Layout styles
.sys-kpi-icon-wrap {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sys-kpi-body {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.sys-kpi-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 6px;
  line-height: 1.3;
  word-wrap: break-word;
}

.sys-kpi-value {
  display: flex;
  align-items: baseline;
  line-height: 1.1;
  margin-bottom: 12px;
  font-variant-numeric: tabular-nums;
  word-wrap: break-word;
  
  // Professional Price Display
  .sys-kpi-currency-symbol {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.75;
    margin-right: 6px;
    letter-spacing: -0.2px;
    text-transform: uppercase;
  }
  .sys-kpi-amount {
    font-size: 24px;
    font-weight: 900;
    letter-spacing: -0.5px;
  }
}

// Meta area improvements
.sys-kpi-meta {
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.sys-kpi-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1;
}
.sys-kpi-trend {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  background: rgba(255,255,255,0.1);
  padding: 4px 8px;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
}

.body--light .sys-kpi-trend {
  background: rgba(0,0,0,0.03);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.02);
}

/* --- TREND COLORS (Light Mode) --- */
.body--light {
  .text-positive { color: #0891b2 !important; } // Teal instead of green for tech feel
  .text-negative { color: #e11d48 !important; } // Rose instead of red
}

.sys-kpi-meta-text {
  white-space: nowrap;
  opacity: 0.85;
}

.sys-kpi-watermark {
  position: absolute;
  right: -12px;
  bottom: -12px;
  pointer-events: none;
}
</style>
