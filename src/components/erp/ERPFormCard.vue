<template>
  <q-card class="erp-form-card" flat>
    <div class="erp-form-card__header" v-if="title || subtitle">
      <div class="erp-form-card__titles">
        <h2 v-if="title" class="erp-form-card__title">{{ title }}</h2>
        <p v-if="subtitle" class="erp-form-card__subtitle">{{ subtitle }}</p>
      </div>
      <div class="erp-form-card__top-actions" v-if="$slots['top-actions']">
        <slot name="top-actions" />
      </div>
    </div>

    <div class="erp-form-card__body">
      <q-form
        ref="formRef"
        @submit.prevent="handleSubmit"
        @validation-error="handleValidationError"
      >
        <slot />

        <ERPFormActions
          v-if="!hideActions"
          :loading="loading"
          :submit-label="submitLabel"
          :cancel-label="cancelLabel"
          :hide-cancel="hideCancel"
          @cancel="$emit('cancel')"
        >
          <template #extra-actions>
            <slot name="extra-actions" />
          </template>
        </ERPFormActions>
      </q-form>
    </div>
  </q-card>
</template>

<script setup>
import { ref } from 'vue'
import { useQuasar } from 'quasar'
import ERPFormActions from './ERPFormActions.vue'

defineProps({
  title: String,
  subtitle: String,
  loading: Boolean,
  submitLabel: {
    type: String,
    default: 'Save',
  },
  cancelLabel: {
    type: String,
    default: 'Cancel',
  },
  hideActions: Boolean,
  hideCancel: Boolean,
})

const emit = defineEmits(['submit', 'cancel', 'validation-error'])
const formRef = ref(null)
const $q = useQuasar()

// Expose the form reference so parent can trigger validation manually
defineExpose({
  validate: () => formRef.value?.validate(),
  resetValidation: () => formRef.value?.resetValidation(),
  reset: () => formRef.value?.reset(),
})

const handleSubmit = () => {
  emit('submit')
}

const handleValidationError = () => {
  emit('validation-error')
  $q.notify({
    type: 'negative',
    message: 'Please fill out all required fields correctly.',
    position: 'top',
    timeout: 3000,
  })
}
</script>

<style scoped lang="scss">
.erp-form-card {
  background-color: var(--erp-bg-form-card);
  border: 1px solid var(--erp-input-border);
  border-radius: var(--erp-radius-lg);
  display: flex;
  flex-direction: column;

  &__header {
    padding: 24px 24px 16px;
    border-bottom: 1px solid var(--erp-input-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__titles {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: var(--erp-text-primary);
    margin: 0;
    line-height: 1.2;
  }

  &__subtitle {
    font-size: 13px;
    color: var(--erp-text-tertiary);
    margin: 0;
    line-height: 1.2;
  }

  &__body {
    padding: 24px;
  }
}
</style>
