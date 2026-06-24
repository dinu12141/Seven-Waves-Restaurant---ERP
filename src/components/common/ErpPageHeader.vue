<template>
  <div class="erp-page-header">
    <!-- Top row: back button + icon + titles + actions -->
    <div class="erp-page-header__top">
      <q-btn
        v-if="showBack"
        flat
        round
        dense
        icon="arrow_back"
        color="primary"
        aria-label="Go back"
        class="erp-page-header__back"
        @click="goBack"
      >
        <q-tooltip>Back</q-tooltip>
      </q-btn>

      <q-icon
        v-if="icon"
        :name="icon"
        size="28px"
        color="primary"
        class="erp-page-header__icon"
      />

      <div class="erp-page-header__titles">
        <h1 class="erp-page-header__title">{{ title }}</h1>
        <p v-if="subtitle" class="erp-page-header__subtitle">{{ subtitle }}</p>
      </div>

      <div class="erp-page-header__actions">
        <slot name="actions" />
      </div>
    </div>

    <!-- Breadcrumbs -->
    <q-breadcrumbs
      v-if="breadcrumbs && breadcrumbs.length"
      class="erp-page-header__breadcrumbs"
      active-color="primary"
      gutter="xs"
    >
      <q-breadcrumbs-el
        v-for="(crumb, idx) in breadcrumbs"
        :key="idx"
        :label="crumb.label"
        :to="crumb.to || undefined"
        :class="{ 'erp-page-header__crumb--current': idx === breadcrumbs.length - 1 }"
      />
    </q-breadcrumbs>

    <q-separator class="q-mt-sm erp-page-header__separator" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  icon: {
    type: String,
    default: '',
  },
  breadcrumbs: {
    // Array of { label: String, to?: String }
    type: Array,
    default: () => [],
  },
  showBack: {
    type: Boolean,
    default: false,
  },
  backTo: {
    type: String,
    default: '',
  },
})

const router = useRouter()

function goBack() {
  if (props.backTo) {
    router.push(props.backTo)
  } else if (window.history.state?.back != null) {
    router.back()
  } else {
    router.push('/')
  }
}
</script>

<style scoped lang="scss">
.erp-page-header {
  padding-bottom: var(--erp-spacing-lg);
  margin-bottom: var(--erp-spacing-lg);
}

/* ── Top row ─────────────────────────────────────────────── */
.erp-page-header__top {
  display: flex;
  align-items: center;
  gap: var(--erp-spacing-md);
  flex-wrap: nowrap;
}

/* ── Back button ─────────────────────────────────────────── */
.erp-page-header__back {
  flex-shrink: 0;
}

/* ── Module icon ─────────────────────────────────────────── */
.erp-page-header__icon {
  flex-shrink: 0;
}

/* ── Title stack ─────────────────────────────────────────── */
.erp-page-header__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.erp-page-header__title {
  font-size: 20px;
  font-weight: var(--erp-font-weight-semibold);
  color: var(--erp-text-primary);
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.erp-page-header__subtitle {
  font-size: 13px;
  color: var(--erp-text-secondary);
  margin: 0;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Actions slot ────────────────────────────────────────── */
.erp-page-header__actions {
  display: flex;
  align-items: center;
  gap: var(--erp-spacing-md);
  flex-shrink: 0;
  margin-left: auto;
}

/* ── Breadcrumbs ─────────────────────────────────────────── */
.erp-page-header__breadcrumbs {
  margin-top: var(--erp-spacing-md);
  font-size: var(--erp-font-size-small);
  color: var(--erp-text-tertiary);
}

.erp-page-header__crumb--current {
  color: var(--erp-text-secondary) !important;
  font-weight: var(--erp-font-weight-medium);
  pointer-events: none;
}

/* ── Separator ───────────────────────────────────────────── */
.erp-page-header__separator {
  background: var(--erp-border) !important;
}
</style>
