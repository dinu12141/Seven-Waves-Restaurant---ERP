<template>
  <BaseDialog v-model="isOpen" :title="`Manage ${title}`" size="sm">
    <div class="q-pa-md">
      <!-- Add new -->
      <div class="row q-col-gutter-sm items-center q-mb-md">
        <div class="col">
          <BaseInput
            :label="`New ${title}`"
            v-model="newItemName"
            @keyup.enter="handleAdd"
            placeholder="Type value and press Enter..."
          />
        </div>
        <div class="col-auto">
          <q-btn
            round
            color="primary"
            icon="add"
            @click="handleAdd"
            :disable="!newItemName.trim() || loading"
          />
        </div>
      </div>

      <!-- List -->
      <q-list separator bordered class="rounded-borders">
        <q-item v-if="!items || items.length === 0">
          <q-item-section class="text-grey text-center q-pa-md">
            No items added yet.
          </q-item-section>
        </q-item>

        <q-item v-for="item in items" :key="item.id" class="q-py-sm">
          <q-item-section>
            <q-item-label class="text-weight-medium">{{ item.name }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-btn
              flat
              round
              dense
              color="negative"
              icon="delete"
              @click="handleDelete(item)"
              :loading="deletingId === item.id"
            >
              <q-tooltip>Delete</q-tooltip>
            </q-btn>
          </q-item-section>
        </q-item>
      </q-list>
    </div>

    <template #actions>
      <q-btn flat label="Close" color="primary" @click="isOpen = false" />
    </template>
  </BaseDialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import BaseDialog from 'components/common/erp/BaseDialog.vue'
import BaseInput from 'components/common/erp/BaseInput.vue'
import { useQuasar } from 'quasar'

const props = defineProps({
  modelValue: Boolean,
  title: String,
  items: Array,
  loading: Boolean,
})

const emit = defineEmits(['update:modelValue', 'add', 'delete'])
const $q = useQuasar()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const newItemName = ref('')
const deletingId = ref(null)

function handleAdd() {
  const val = newItemName.value.trim()
  if (!val) return
  emit('add', val)
  newItemName.value = ''
}

function handleDelete(item) {
  $q.dialog({
    title: 'Confirm Deletion',
    message: `Are you sure you want to delete "${item.name}"? This action cannot be undone and might fail if the item is currently in use.`,
    cancel: true,
    persistent: true,
    dark: $q.dark.isActive,
  }).onOk(async () => {
    try {
      deletingId.value = item.id
      emit('delete', item)
    } finally {
      deletingId.value = null
    }
  })
}
</script>
