<template>
  <div class="erp-form-actions" :class="{ 'erp-form-actions--sticky': sticky }">
    <div class="erp-form-actions__left">
      <slot name="extra-actions" />
    </div>
    <div class="erp-form-actions__right">
      <q-btn
        v-if="!hideCancel"
        flat
        class="erp-btn-ghost erp-form-actions__cancel"
        :label="cancelLabel"
        @click="$emit('cancel')"
        :disable="loading"
      />
      <q-btn
        type="submit"
        unelevated
        class="erp-btn-primary erp-form-actions__submit"
        :label="submitLabel"
        :loading="loading"
        :disable="disableSubmit"
      />
    </div>
  </div>
</template>

<script setup>
defineProps({
  loading: Boolean,
  disableSubmit: Boolean,
  submitLabel: {
    type: String,
    default: 'Save',
  },
  cancelLabel: {
    type: String,
    default: 'Cancel',
  },
  hideCancel: Boolean,
  sticky: {
    type: Boolean,
    default: true,
  },
})

defineEmits(['cancel'])
</script>

<style scoped lang="scss">
.erp-form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background-color: var(--erp-bg-form-card);
  border-top: 1px solid var(--erp-input-border);
  margin: 24px -24px -24px;
  border-radius: 0 0 var(--erp-radius-lg) var(--erp-radius-lg);

  &--sticky {
    position: sticky;
    bottom: 0;
    z-index: 10;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.2);
  }

  &__left {
    display: flex;
    gap: 12px;
  }

  &__right {
    display: flex;
    gap: 12px;
  }

  &__cancel {
    font-size: 13px;
    font-weight: 500;
  }

  &__submit {
    font-size: 13px;
    font-weight: 500;
  }
}
</style>
