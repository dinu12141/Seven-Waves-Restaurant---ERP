<template>
  <q-footer
    class="bg-white text-dark bordered row justify-between items-center q-px-md q-py-sm shadow-2"
  >
    <!-- Audit Info -->
    <div class="text-caption text-grey">
      <span v-if="createdBy">Created by: {{ createdBy }}</span>
      <span v-if="postedBy" class="q-ml-md">Posted by: {{ postedBy }}</span>
    </div>

    <!-- Actions -->
    <div class="row q-gutter-sm">
      <q-btn v-if="canCancel" label="Cancel" color="negative" flat @click="$emit('cancel')" />
      <q-btn
        v-if="canPrint"
        label="Print"
        color="secondary"
        outline
        icon="print"
        @click="$emit('print')"
      />
      <q-btn
        v-if="canSaveDraft"
        label="Save Draft"
        color="primary"
        outline
        @click="$emit('save')"
      />
      <q-btn
        v-if="canPost"
        label="Post"
        color="primary"
        unelevated
        icon="check"
        @click="$emit('post')"
      />
    </div>
  </q-footer>
</template>

<script setup>
import { computed } from 'vue'

defineEmits(['save', 'post', 'cancel', 'print'])

const props = defineProps({
  status: { type: String, required: false },
  createdBy: { type: String, required: false },
  postedBy: { type: String, required: false },
})

const canSaveDraft = computed(() => props.status === 'draft' || !props.status)
const canPost = computed(() => props.status === 'draft')
const canCancel = computed(() => ['posted', 'open', 'approved'].includes(props.status))
const canPrint = computed(() => !!props.status) // Always print if saved
</script>
