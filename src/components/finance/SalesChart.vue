<template>
  <q-card class="bg-card-dark text-white q-pa-md" flat bordered>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h6">Sales Overview</div>
      <div class="row q-gutter-sm">
        <q-btn flat round dense icon="refresh" color="grey-5" />
        <q-btn-dropdown flat dense label="This Week" color="primary">
          <q-list>
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
      <!-- Simple SVG Line Chart -->
      <svg viewBox="0 0 100 50" class="full-width full-height" preserveAspectRatio="none">
        <!-- Grid Lines -->
        <line x1="0" y1="10" x2="100" y2="10" stroke="#333" stroke-width="0.1" />
        <line x1="0" y1="20" x2="100" y2="20" stroke="#333" stroke-width="0.1" />
        <line x1="0" y1="30" x2="100" y2="30" stroke="#333" stroke-width="0.1" />
        <line x1="0" y1="40" x2="100" y2="40" stroke="#333" stroke-width="0.1" />

        <!-- Area Gradient -->
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color: var(--q-primary); stop-opacity: 0.3" />
            <stop offset="100%" style="stop-color: var(--q-primary); stop-opacity: 0" />
          </linearGradient>
        </defs>

        <!-- Data Area -->
        <path
          d="M0,50 L0,35 L14,30 L28,40 L42,15 L56,25 L70,10 L84,20 L100,5 L100,50 Z"
          fill="url(#grad)"
        />

        <!-- Data Line -->
        <polyline
          points="0,35 14,30 28,40 42,15 56,25 70,10 84,20 100,5"
          fill="none"
          stroke="var(--q-primary)"
          stroke-width="1"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Points -->
        <circle cx="0" cy="35" r="1" fill="var(--q-primary)" />
        <circle cx="14" cy="30" r="1" fill="var(--q-primary)" />
        <circle cx="28" cy="40" r="1" fill="var(--q-primary)" />
        <circle cx="42" cy="15" r="1" fill="var(--q-primary)" />
        <circle cx="56" cy="25" r="1" fill="var(--q-primary)" />
        <circle cx="70" cy="10" r="1" fill="var(--q-primary)" />
        <circle cx="84" cy="20" r="1" fill="var(--q-primary)" />
        <circle cx="100" cy="5" r="1" fill="var(--q-primary)" />
      </svg>

      <!-- X-Axis Labels (Absolute positioning as overlay) -->
      <div class="row justify-between text-grey-6 text-caption q-mt-sm">
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
        <span>Sun</span>
      </div>
    </div>
  </q-card>
</template>

<script setup>
import { ref } from 'vue'

const period = ref('week')
</script>

<style scoped>
.bg-card-dark {
  background: #1e1e1e;
}
</style>
