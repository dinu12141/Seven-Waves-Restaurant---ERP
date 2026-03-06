<template>
  <div
    class="erp-form-field"
    :class="{ 'erp-form-field--error': error, 'erp-form-field--required': required }"
  >
    <div class="erp-form-field__label-wrap" v-if="label">
      <label class="erp-form-field__label">
        {{ label }}
        <span v-if="required" class="erp-form-field__required-indicator"></span>
      </label>
      <div v-if="$slots['label-append']" class="erp-form-field__label-append">
        <slot name="label-append" />
      </div>
    </div>

    <div class="erp-form-field__input">
      <slot />
      <div class="erp-form-field__error-text" v-if="error">{{ error }}</div>
      <div class="erp-form-field__helper-text" v-if="helper && !error">{{ helper }}</div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  label: String,
  required: Boolean,
  error: String, // String message
  helper: String,
})
</script>

<style scoped lang="scss">
.erp-form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;

  &__label-wrap {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__label {
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--erp-text-secondary);
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
  }

  &__required-indicator {
    display: inline-block;
    width: 6px;
    height: 6px;
    background-color: var(--erp-error);
    border-radius: 50%;
  }

  &__input {
    // Standardize children (usually QInput/QSelect)
    ::v-deep(.q-field) {
      .q-field__control {
        background-color: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--erp-input-border);
        border-radius: 6px;
        transition: all 0.2s ease;

        &:before,
        &:after {
          display: none; // removing default Quasar underlines
        }
      }

      &.q-field--focused {
        .q-field__control {
          border-color: var(--erp-primary);
          box-shadow: 0 0 0 1px var(--erp-primary);
          background-color: rgba(255, 255, 255, 0.05);
        }
      }

      &.q-field--error {
        .q-field__control {
          border-color: var(--erp-error);
          background-color: rgba(234, 67, 53, 0.05);
        }
      }

      .q-field__native,
      .q-field__input {
        font-family: 'Inter', sans-serif;
        font-size: 14px;
        color: var(--erp-text-primary);
        padding: 0 12px;

        &::placeholder {
          color: var(--erp-text-secondary) !important;
          opacity: 0.5;
        }
      }

      .q-field__prefix,
      .q-field__suffix {
        font-size: 13px;
        color: var(--erp-text-secondary);
        font-weight: 600;
        margin-right: 8px;
        opacity: 0.85;
      }

      .q-field__append,
      .q-field__prepend {
        height: 100%;
        padding: 0 12px;
      }

      .q-field__bottom {
        display: none; // we handle errors centrally
      }
    }

    ::v-deep(.q-select) {
      .q-field__control {
        padding: 0 0 0 12px;
      }
    }
  }

  &__error-text {
    margin-top: 4px;
    font-size: 11px;
    color: var(--erp-error);
    margin-bottom: 0px;
  }

  &__helper-text {
    margin-top: 4px;
    font-size: 11px;
    color: var(--erp-text-tertiary);
    margin-bottom: 0px;
  }

  &--error {
    .erp-form-field__label {
      color: var(--erp-error);
    }
  }
}
</style>
