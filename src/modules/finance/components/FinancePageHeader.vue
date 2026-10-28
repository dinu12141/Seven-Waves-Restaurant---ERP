<template>
  <header class="fin-page-header">
    <div class="fin-page-header__lead">
      <div v-if="icon" class="fin-page-header__icon">
        <q-icon :name="icon" size="22px" />
      </div>
      <div class="fin-page-header__text">
        <div v-if="breadcrumbs" class="fin-page-header__crumbs">{{ breadcrumbs }}</div>
        <h1 class="fin-page-header__title">{{ title }}</h1>
        <div v-if="subtitle || $slots.subtitle" class="fin-page-header__subtitle">
          <slot name="subtitle">{{ subtitle }}</slot>
        </div>
      </div>
    </div>
    <div class="fin-page-header__actions">
      <slot name="actions" />
      <q-btn
        v-if="showRefresh"
        flat
        round
        dense
        icon="refresh"
        color="grey-7"
        :loading="loading"
        aria-label="Refresh"
        @click="$emit('refresh')"
      >
        <q-tooltip>Refresh</q-tooltip>
      </q-btn>
    </div>
  </header>
</template>

<script setup>
/**
 * Standard Finance page header: icon + breadcrumbs + title + subtitle on the
 * left, actions on the right. Wraps on phones (actions drop below the title).
 */
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  breadcrumbs: { type: String, default: '' },
  showRefresh: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})
defineEmits(['refresh'])
</script>

<style scoped lang="scss">
.fin-page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--erp-border);
}
.fin-page-header__lead {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1 1 260px;
}
.fin-page-header__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--q-primary);
  background: color-mix(in srgb, var(--q-primary) 12%, transparent);
}
.fin-page-header__text {
  min-width: 0;
}
.fin-page-header__crumbs {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--erp-text-muted);
  margin-bottom: 2px;
}
.fin-page-header__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: var(--erp-text-primary);
}
.fin-page-header__subtitle {
  font-size: 12px;
  color: var(--erp-text-secondary);
  margin-top: 2px;
}
.fin-page-header__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
@media (max-width: 599px) {
  .fin-page-header__title {
    font-size: 17px;
  }
  .fin-page-header__actions {
    width: 100%;
  }
}
</style>
