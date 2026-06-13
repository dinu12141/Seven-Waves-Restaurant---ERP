<template>
  <q-dialog v-model="visible" persistent no-backdrop-dismiss>
    <q-card class="audit-reason-dialog" style="min-width: 420px">
      <q-card-section class="audit-reason-dialog__header">
        <div class="row items-center no-wrap">
          <q-icon :name="icon" size="24px" :color="iconColor" class="q-mr-sm" />
          <div>
            <div class="text-subtitle1 text-weight-bold">{{ title }}</div>
            <div class="text-caption text-grey-5">{{ subtitle }}</div>
          </div>
        </div>
      </q-card-section>
      <q-separator />
      <q-card-section>
        <div class="text-caption text-grey-5 q-mb-sm">This action will be recorded in the audit log.</div>
        <q-input
          ref="reasonInput"
          v-model="reason"
          type="textarea"
          outlined
          dense
          autogrow
          :rules="[(v) => !!v.trim() || 'Reason is required']"
          label="Reason for this action *"
          placeholder="Explain why this action is necessary..."
          aria-label="Audit reason"
          class="q-mb-sm"
        />
        <q-select v-if="categories.length > 0" v-model="selectedCategory" :options="categories" outlined dense label="Category" emit-value map-options class="q-mb-sm" />
      </q-card-section>
      <q-card-actions align="right" class="q-px-md q-pb-md">
        <q-btn flat no-caps label="Cancel" color="grey-7" @click="cancel" aria-label="Cancel action" />
        <q-btn unelevated no-caps :label="confirmLabel" :color="confirmColor" :loading="loading" :disable="!reason.trim()" @click="confirm" aria-label="Confirm action with reason" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: 'Provide Reason' },
  subtitle: { type: String, default: 'This action requires an audit trail.' },
  icon: { type: String, default: 'gavel' },
  iconColor: { type: String, default: 'orange-8' },
  confirmLabel: { type: String, default: 'Confirm' },
  confirmColor: { type: String, default: 'negative' },
  categories: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])
const visible = ref(props.modelValue)
const reason = ref('')
const selectedCategory = ref('')
const reasonInput = ref(null)

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) { reason.value = ''; selectedCategory.value = ''; nextTick(() => reasonInput.value?.focus?.()) }
})
watch(visible, (val) => emit('update:modelValue', val))

function confirm() {
  if (!reason.value.trim()) return
  emit('confirm', { reason: reason.value.trim(), category: selectedCategory.value || undefined })
}
function cancel() { visible.value = false; emit('cancel') }
</script>

<style scoped lang="scss">
.audit-reason-dialog { border-radius: 12px; &__header { background: rgba(255, 152, 0, 0.06); } }
</style>
