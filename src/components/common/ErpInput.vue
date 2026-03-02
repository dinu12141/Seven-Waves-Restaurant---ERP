<template>
  <div
    class="erp-input-wrapper"
    :class="{ 'erp-input--disabled': disabled, 'erp-input--error': error }"
  >
    <label v-if="label" class="erp-input-label">
      {{ label }}
      <span v-if="required" class="erp-input-required">*</span>
    </label>

    <div class="erp-input-container">
      <q-input
        v-model="internalValue"
        dense
        borderless
        :type="type"
        :placeholder="placeholder"
        :disable="disabled"
        :loading="loading"
        :error="error"
        :error-message="errorMessage"
        class="erp-input-field"
        no-error-icon
        hide-bottom-space
        @update:model-value="$emit('update:modelValue', $event)"
      >
        <template v-for="(_, name) in $slots" #[name]="slotData">
          <slot :name="name" v-bind="slotData" />
        </template>
      </q-input>
    </div>

    <div v-if="error && errorMessage" class="erp-input-error-msg">
      <q-icon name="error_outline" size="12px" class="q-mr-xs" />
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  label: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: 'text',
  },
  placeholder: {
    type: String,
    default: '',
  },
  required: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: Boolean,
    default: false,
  },
  errorMessage: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])

const internalValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})
</script>

<style scoped lang="scss">
.erp-input-wrapper {
  margin-bottom: var(--erp-spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--erp-spacing-sm); /* 8px vertical spacing */
}

.erp-input-label {
  font-size: var(--erp-font-size-small); /* or 13px */
  font-weight: var(--erp-font-weight-medium);
  color: var(--erp-text-secondary);
  line-height: 1;
}

.erp-input-required {
  color: var(--erp-danger);
  margin-left: 2px;
}

.erp-input-container {
  background-color: var(--erp-bg-card); /* Could also be input specific bg */
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-md); /* 6px */
  height: var(--erp-input-height); /* 38px */
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;

  &:focus-within {
    border-color: var(--erp-primary);
    box-shadow: 0 0 0 2px var(--erp-primary-subtle);
  }
}

.erp-input-field {
  height: 100%;

  :deep(.q-field__control) {
    height: 100% !important;
    min-height: 100% !important;
    padding: 0 12px !important;
  }

  :deep(.q-field__native) {
    font-size: var(--erp-font-size-base) !important; /* 14px */
    color: var(--erp-text-primary) !important;
    padding: 0 !important;

    &::placeholder {
      color: var(--erp-text-placeholder);
    }
  }
}

.erp-input--disabled {
  opacity: 0.6;

  .erp-input-container {
    background-color: rgba(255, 255, 255, 0.02);
    cursor: not-allowed;
  }
}

.erp-input--error {
  .erp-input-container {
    border-color: var(--erp-danger);
    &:focus-within {
      box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.1);
    }
  }
}

.erp-input-error-msg {
  font-size: 11px;
  color: var(--erp-danger);
  display: flex;
  align-items: center;
  margin-top: -4px;
}
</style>
