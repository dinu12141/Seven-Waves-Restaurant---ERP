<template>
  <div class="erp-card q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div>
        <div class="text-h6 text-weight-medium text-white">Sales Overview</div>
        <div class="text-caption" style="color: var(--erp-text-secondary)">Revenue over time</div>
      </div>
      <div class="row q-gutter-sm items-center">
        <q-btn flat round dense icon="refresh" style="color: var(--erp-text-secondary)" />
        <q-btn-dropdown
          flat
          dense
          label="This Week"
          style="color: var(--erp-primary); font-weight: 500; font-size: 13px"
        >
          <q-list class="bg-card-dark text-white">
            <q-item clickable v-close-popup @click="period = 'week'">
              <q-item-section>This Week</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="period = 'month'">
              <q-item-section>This Month</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
      </div>
    </div>

    <div class="chart-container relative-position" style="height: 300px">
      <!-- Simple SVG Line Chart (ERP Style - Clean, muted grid, bright primary line) -->
      <svg viewBox="0 -5 100 60" class="full-width full-height" preserveAspectRatio="none">
        <!-- Clean Grid Axes -->
        <g stroke="var(--erp-border)" stroke-width="0.1">
          <line x1="0" y1="10" x2="100" y2="10" />
          <line x1="0" y1="20" x2="100" y2="20" />
          <line x1="0" y1="30" x2="100" y2="30" />
          <line x1="0" y1="40" x2="100" y2="40" />
          <!-- Baseline -->
          <line x1="0" y1="50" x2="100" y2="50" stroke-width="0.5" />
        </g>

        <!-- Area Gradient using ERP Primary -->
        <defs>
          <linearGradient id="erpGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="var(--erp-primary)" stop-opacity="0.2" />
            <stop offset="100%" stop-color="var(--erp-primary)" stop-opacity="0" />
          </linearGradient>
        </defs>

        <!-- Data Area -->
        <path
          d="M0,50 L0,35 L14,30 L28,40 L42,15 L56,25 L70,10 L84,20 L100,5 L100,50 Z"
          fill="url(#erpGrad)"
        />

        <!-- Data Line -->
        <polyline
          points="0,35 14,30 28,40 42,15 56,25 70,10 84,20 100,5"
          fill="none"
          stroke="var(--erp-primary)"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Data Points -->
        <g fill="var(--erp-bg-card)" stroke="var(--erp-primary)" stroke-width="1">
          <circle cx="0" cy="35" r="1.5" />
          <circle cx="14" cy="30" r="1.5" />
          <circle cx="28" cy="40" r="1.5" />
          <circle cx="42" cy="15" r="1.5" />
          <circle cx="56" cy="25" r="1.5" />
          <circle cx="70" cy="10" r="1.5" />
          <circle cx="84" cy="20" r="1.5" />
          <circle cx="100" cy="5" r="1.5" />
        </g>
      </svg>

      <!-- X-Axis Labels -->
      <div
        class="row justify-between q-mt-sm"
        style="color: var(--erp-text-secondary); font-size: 11px; font-weight: 500"
      >
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
        <span>Sun</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const period = ref('week')
</script>

<style scoped>
.bg-card-dark {
  background: var(--erp-bg-card);
}
</style>
