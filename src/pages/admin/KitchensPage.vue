<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="Kitchen Management"
      subtitle="Configure kitchen stations and displays"
      show-back
      back-route="/admin"
    />

    <q-card flat bordered class="q-mt-md">
      <q-card-section>
        <div class="row q-col-gutter-md items-center">
          <div class="col-12 col-md-4">
            <q-input
              dense
              outlined
              v-model="search"
              placeholder="Search kitchens..."
              class="bg-white"
            >
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>
          <div class="col-12 col-md-8 text-right">
            <q-btn color="primary" icon="add" label="Add Kitchen" @click="openDialog" />
          </div>
        </div>
      </q-card-section>

      <!-- Loading state -->
      <div v-if="loading" class="text-center q-pa-xl">
        <q-spinner-dots size="40px" color="primary" />
        <div class="text-grey-5 q-mt-sm">Loading kitchens...</div>
      </div>

      <!-- Empty state -->
      <div v-else-if="!loading && kitchens.length === 0" class="text-center q-pa-xl">
        <q-icon name="kitchen" size="64px" color="grey-7" />
        <div class="text-h6 text-grey-5 q-mt-md">No Kitchens Found</div>
        <div class="text-caption text-grey-6 q-mb-md">
          Add your first kitchen station to get started.
        </div>
        <q-btn color="primary" icon="add" label="Add Kitchen" @click="openDialog" />
      </div>

      <q-table
        v-else
        :rows="kitchens"
        :columns="columns"
        row-key="id"
        :filter="search"
        flat
      >
        <template v-slot:body-cell-branch_name="props">
          <q-td :props="props">
            {{ props.row.branches?.name || '—' }}
          </q-td>
        </template>

        <template v-slot:body-cell-is_active="props">
          <q-td :props="props" class="text-center">
            <q-toggle
              :model-value="props.row.is_active"
              color="green"
              dense
              @update:model-value="(val) => toggleActive(props.row, val)"
            />
          </q-td>
        </template>

        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="q-gutter-sm">
            <q-btn
              flat
              round
              color="primary"
              icon="edit"
              size="sm"
              aria-label="Edit kitchen"
              @click="editKitchen(props.row)"
            />
            <q-btn
              flat
              round
              color="negative"
              icon="delete"
              size="sm"
              aria-label="Delete kitchen"
              @click="confirmDelete(props.row)"
            />
          </q-td>
        </template>
      </q-table>

      <q-inner-loading :showing="loading">
        <q-spinner-dots size="40px" color="primary" />
      </q-inner-loading>
    </q-card>

    <!-- Add/Edit Kitchen Dialog -->
    <q-dialog v-model="dialogVisible">
      <q-card style="min-width: 420px">
        <q-card-section>
          <div class="text-h6">{{ isEditing ? 'Edit Kitchen' : 'Add New Kitchen' }}</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-form ref="formRef" @submit.prevent="saveKitchen" class="q-gutter-md">
            <q-input
              v-model="form.name"
              label="Kitchen Name *"
              outlined
              dense
              :rules="[(val) => !!val || 'Kitchen name is required']"
            />

            <q-select
              v-model="form.branch_id"
              label="Branch *"
              :options="branchOptions"
              option-value="id"
              option-label="name"
              emit-value
              map-options
              outlined
              dense
              :loading="loadingBranches"
              :rules="[(val) => !!val || 'Branch is required']"
            />

            <q-toggle v-model="form.is_active" label="Active" color="green" />

            <div class="row justify-end q-mt-lg">
              <q-btn label="Cancel" color="grey" flat v-close-popup />
              <q-btn
                :label="isEditing ? 'Update' : 'Save'"
                type="submit"
                color="primary"
                class="q-ml-sm"
                :loading="saving"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/auth'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const authStore = useAuthStore()

const search = ref('')
const dialogVisible = ref(false)
const isEditing = ref(false)
const loading = ref(false)
const saving = ref(false)
const loadingBranches = ref(false)
const formRef = ref(null)

const companyId = computed(
  () => authStore.currentBranch?.company_id || authStore.profile?.company_id || null,
)

const columns = [
  { name: 'name', label: 'Kitchen Name', align: 'left', field: 'name', sortable: true },
  { name: 'branch_name', label: 'Branch', align: 'left', field: (row) => row.branches?.name || '—', sortable: true },
  {
    name: 'is_active',
    label: 'Active',
    align: 'center',
    field: 'is_active',
  },
  { name: 'actions', label: 'Actions', align: 'center', field: 'actions' },
]

const kitchens = ref([])
const branchOptions = ref([])

const form = reactive({
  id: null,
  name: '',
  branch_id: null,
  is_active: true,
})

// ── Data fetching ───────────────────────────────────────────────

async function loadKitchens() {
  if (!companyId.value) return
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('kitchens')
      .select('*, branches(name)')
      .eq('company_id', companyId.value)
      .order('name')

    if (error) throw error
    kitchens.value = data || []
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to load kitchens: ' + (err.message || err) })
  } finally {
    loading.value = false
  }
}

async function loadBranches() {
  if (!companyId.value) return
  loadingBranches.value = true
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('company_id', companyId.value)
      .eq('is_active', true)
      .order('name')

    if (error) throw error
    branchOptions.value = data || []
  } catch (err) {
    $q.notify({ type: 'warning', message: 'Failed to load branches: ' + (err.message || err) })
  } finally {
    loadingBranches.value = false
  }
}

// ── Dialog helpers ──────────────────────────────────────────────

const openDialog = () => {
  isEditing.value = false
  Object.assign(form, { id: null, name: '', branch_id: null, is_active: true })
  dialogVisible.value = true
}

const editKitchen = (kitchen) => {
  isEditing.value = true
  Object.assign(form, {
    id: kitchen.id,
    name: kitchen.name,
    branch_id: kitchen.branch_id,
    is_active: kitchen.is_active,
  })
  dialogVisible.value = true
}

// ── CRUD ────────────────────────────────────────────────────────

async function saveKitchen() {
  const valid = await formRef.value?.validate()
  if (!valid) return

  saving.value = true
  try {
    const payload = {
      company_id: companyId.value,
      branch_id: form.branch_id,
      name: form.name,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    }

    if (isEditing.value && form.id) {
      const { error } = await supabase
        .from('kitchens')
        .update(payload)
        .eq('id', form.id)

      if (error) throw error
      $q.notify({ type: 'positive', message: 'Kitchen updated successfully' })
    } else {
      const { error } = await supabase.from('kitchens').insert(payload)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Kitchen created successfully' })
    }

    dialogVisible.value = false
    await loadKitchens()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to save kitchen: ' + (err.message || err) })
  } finally {
    saving.value = false
  }
}

async function toggleActive(kitchen, isActive) {
  try {
    const { error } = await supabase
      .from('kitchens')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', kitchen.id)

    if (error) throw error

    // Update local state optimistically
    const idx = kitchens.value.findIndex((k) => k.id === kitchen.id)
    if (idx !== -1) kitchens.value[idx].is_active = isActive
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to update kitchen: ' + (err.message || err) })
    // Revert optimistic update on failure
    await loadKitchens()
  }
}

function confirmDelete(kitchen) {
  $q.dialog({
    title: 'Confirm Delete',
    message: `Are you sure you want to delete "${kitchen.name}"? This cannot be undone.`,
    cancel: true,
    persistent: true,
    ok: { color: 'negative', label: 'Delete' },
  }).onOk(() => deleteKitchen(kitchen.id))
}

async function deleteKitchen(id) {
  try {
    const { error } = await supabase.from('kitchens').delete().eq('id', id)
    if (error) throw error
    kitchens.value = kitchens.value.filter((k) => k.id !== id)
    $q.notify({ type: 'info', message: 'Kitchen deleted' })
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to delete kitchen: ' + (err.message || err) })
  }
}

// ── Lifecycle ───────────────────────────────────────────────────

onMounted(async () => {
  await Promise.all([loadKitchens(), loadBranches()])
})
</script>
