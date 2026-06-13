<template>
  <q-dialog v-model="visible" persistent>
    <q-card class="confirm-action-dialog" style="min-width: 380px">
      <q-card-section class="confirm-action-dialog__header" :class="`confirm-action-dialog__header--${variant}`">
        <q-icon :name="computedIcon" size="40px" :color="computedColor" />
      </q-card-section>
      <q-card-section class="text-center q-pt-md">
        <div class="text-h6 text-weight-bold q-mb-xs">{{ title }}</div>
        <div class="text-body2 text-grey-5" style="max-width: 320px; margin: 0 auto">{{ message }}</div>
      </q-card-section>
      <q-card-actions align="center" class="q-px-lg q-pb-lg q-pt-sm">
        <q-btn flat no-caps :label="cancelLabel" color="grey-7" class="q-mr-sm" style="min-width: 100px" @click="cancel" aria-label="Cancel" />
        <q-btn unelevated no-caps :label="confirmLabel" :color="computedBtnColor" :loading="loading" style="min-width: 100px" @click="confirm" :aria-label="confirmLabel" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: 'Are you sure?' },
  message: { type: String, default: 'This action cannot be undone.' },
  variant: { type: String, default: 'danger' },
  icon: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirm' },
  cancelLabel: { type: String, default: 'Cancel' },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])
const visible = ref(props.modelValue)
watch(() => props.modelValue, (val) => { visible.value = val })
watch(visible, (val) => emit('update:modelValue', val))

const computedIcon = computed(() => {
  if (props.icon) return props.icon
  return { danger: 'warning', warning: 'help_outline', info: 'info' }[props.variant] || 'help_outline'
})
const computedColor = computed(() => ({ danger: 'negative', warning: 'warning', info: 'info' }[props.variant] || 'grey-6'))
const computedBtnColor = computed(() => ({ danger: 'negative', warning: 'warning', info: 'primary' }[props.variant] || 'primary'))

function confirm() { emit('confirm') }
function cancel() { visible.value = false; emit('cancel') }
</script>

<style scoped lang="scss">
.confirm-action-dialog {
  border-radius: 16px; overflow: hidden;
  &__header { display: flex; justify-content: center; padding: 24px 16px 8px;
    &--danger { background: rgba(244, 67, 54, 0.06); }
    &--warning { background: rgba(255, 152, 0, 0.06); }
    &--info { background: rgba(33, 150, 243, 0.06); }
  }
}
</style>
