<template>
  <div class="erp-page-header">
    <div class="erp-page-header__left">
      <div class="erp-page-header__breadcrumb" v-if="breadcrumb">
        <span class="erp-page-header__breadcrumb-text">{{ breadcrumb }}</span>
        <q-icon name="chevron_right" size="14px" class="erp-page-header__breadcrumb-sep" />
      </div>
      <div class="row items-center">
        <q-btn
          v-if="showBack"
          flat
          round
          dense
          icon="arrow_back"
          color="primary"
          @click="onBackClick"
          class="q-mr-sm"
        >
          <q-tooltip>Back</q-tooltip>
        </q-btn>
        <h1 class="erp-h1 no-margin">{{ title }}</h1>
      </div>
      <p v-if="subtitle" class="erp-page-header__subtitle q-mt-xs">{{ subtitle }}</p>
    </div>
    <div class="erp-page-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  breadcrumb: {
    type: String,
    default: '',
  },
  showBack: {
    type: Boolean,
    default: false,
  },
  backRoute: {
    type: String,
    default: '',
  },
})

const onBackClick = () => {
  if (props.backRoute) {
    router.push(props.backRoute)
  } else if (window.history.state && window.history.state.back === null) {
    // If there is no previous page in the Vue router history stack, fallback to home
    router.push('/')
  } else {
    router.back()
  }
}
</script>

<style scoped lang="scss">
.erp-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--erp-border);

  &__left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__breadcrumb {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-bottom: 2px;
  }

  &__breadcrumb-text {
    font-size: 11px;
    font-weight: 500;
    color: var(--erp-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__breadcrumb-sep {
    color: var(--erp-text-tertiary);
    opacity: 0.5;
  }

  &__subtitle {
    font-size: 13px;
    color: var(--erp-text-secondary);
    margin: 0;
    line-height: 1.4;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    padding-top: 2px;
  }
}
</style>
