<template>
  <q-select v-model="selected" :options="branches" option-value="id" option-label="name" emit-value map-options outlined dense label="Branch" class="branch-selector" :loading="loading" aria-label="Select branch">
    <template #prepend><q-icon name="store" size="18px" color="grey-6" /></template>
    <template #option="{ opt, itemProps }">
      <q-item v-bind="itemProps">
        <q-item-section avatar><q-icon name="store" color="primary" /></q-item-section>
        <q-item-section>
          <q-item-label>{{ opt.name }}</q-item-label>
          <q-item-label caption>{{ opt.address || 'No address' }}</q-item-label>
        </q-item-section>
        <q-item-section side v-if="opt.id === currentBranchId"><q-badge color="primary" label="Current" /></q-item-section>
      </q-item>
    </template>
  </q-select>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { supabase } from '../../boot/supabase'

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'change'])

const authStore = useAuthStore()
const branches = ref([])
const loading = ref(false)
const currentBranchId = computed(() => authStore.currentBranch?.id || '')
const selected = ref(props.modelValue || currentBranchId.value)

watch(selected, (val) => { emit('update:modelValue', val); emit('change', val) })

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await supabase.from('branches').select('id, name, address').order('name')
    branches.value = data || []
  } catch {
    if (authStore.currentBranch) branches.value = [authStore.currentBranch]
  } finally { loading.value = false }
})
</script>

<style scoped>
.branch-selector { min-width: 200px; }
</style>
