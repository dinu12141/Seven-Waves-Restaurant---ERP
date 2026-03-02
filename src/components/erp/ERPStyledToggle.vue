<template>
  <div class="erp-styled-toggle" :class="{ 'erp-styled-toggle--active': modelValue }">
    <label class="erp-styled-toggle__label">{{ label }}</label>
    <div class="erp-styled-toggle__track" @click="toggleValue">
      <div class="erp-styled-toggle__thumb"></div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: Boolean,
  label: String,
})

const emit = defineEmits(['update:modelValue'])

const toggleValue = () => {
  emit('update:modelValue', !props.modelValue)
}
</script>

<style scoped lang="scss">
.erp-styled-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  cursor: pointer;

  &__label {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: var(--erp-text-secondary);
    transition: color 0.2s;
  }

  &__track {
    width: 36px;
    height: 20px;
    background-color: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    position: relative;
    transition: background-color 0.2s;
  }

  &__thumb {
    width: 16px;
    height: 16px;
    background-color: var(--erp-text-secondary);
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  &--active {
    .erp-styled-toggle__track {
      background-color: rgba(67, 133, 245, 0.2); // primary tinted
    }
    .erp-styled-toggle__thumb {
      transform: translateX(16px);
      background-color: var(--erp-primary);
    }
    .erp-styled-toggle__label {
      color: var(--erp-text-primary);
    }
  }
}
</style>
