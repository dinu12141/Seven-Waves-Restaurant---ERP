<template>
  <div class="erp-form-section" :class="{ 'erp-form-section--collapsed': isCollapsed }">
    <div
      class="erp-form-section__header"
      @click="toggleCollapse"
      :class="{ 'erp-form-section__header--clickable': collapsible }"
    >
      <div class="erp-form-section__title-wrap">
        <q-icon
          v-if="collapsible"
          :name="isCollapsed ? 'chevron_right' : 'expand_more'"
          size="20px"
          class="erp-form-section__icon"
        />
        <h3 class="erp-form-section__title">{{ title }}</h3>
      </div>
      <div class="erp-form-section__actions" v-if="$slots.actions" @click.stop>
        <slot name="actions" />
      </div>
    </div>

    <q-slide-transition>
      <div class="erp-form-section__content" v-show="!isCollapsed">
        <slot />
      </div>
    </q-slide-transition>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  collapsible: {
    type: Boolean,
    default: false,
  },
  defaultCollapsed: {
    type: Boolean,
    default: false,
  },
})

const isCollapsed = ref(props.collapsible ? props.defaultCollapsed : false)

watch(
  () => props.defaultCollapsed,
  (newVal) => {
    if (props.collapsible) {
      isCollapsed.value = newVal
    }
  },
)

const toggleCollapse = () => {
  if (props.collapsible) {
    isCollapsed.value = !isCollapsed.value
  }
}
</script>

<style scoped lang="scss">
.erp-form-section {
  background: transparent;
  margin-bottom: 24px;
  border: 1px solid var(--erp-input-border);
  border-radius: var(--erp-radius-md);
  overflow: hidden;

  &__header {
    background-color: rgba(255, 255, 255, 0.02);
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--erp-input-border);
    transition: background-color 0.2s;

    &--clickable {
      cursor: pointer;
      &:hover {
        background-color: rgba(255, 255, 255, 0.04);
      }
    }
  }

  &__title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__icon {
    color: var(--erp-text-tertiary);
    transition: transform 0.2s ease;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--erp-text-primary);
    margin: 0;
    line-height: 1.2;
  }

  &__content {
    padding: 24px 16px;
  }

  &--collapsed {
    .erp-form-section__header {
      border-bottom-color: transparent;
    }
    .erp-form-section__content {
      padding-top: 0;
      padding-bottom: 0;
    }
  }
}
</style>
