<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="Branch Management"
      subtitle="Manage restaurant outlets and locations"
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
              placeholder="Search branches..."
            >
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>
          <div class="col-12 col-md-8 text-right">
            <PermissionGate permission="admin.branches.create">
              <q-btn color="primary" icon="add" label="Add Branch" @click="openDialog" />
            </PermissionGate>
          </div>
        </div>
      </q-card-section>

      <q-table :rows="branches" :columns="columns" row-key="id" :filter="search" :loading="loading" flat bordered>
        <template v-slot:body-cell-is_main="props">
          <q-td :props="props">
            <q-badge v-if="props.row.is_main" color="primary" label="Main" />
            <span v-else class="text-grey-5">—</span>
          </q-td>
        </template>
        <template v-slot:body-cell-status="props">
          <q-td :props="props">
            <q-chip
              :color="props.row.is_active !== false ? 'positive' : 'negative'"
              text-color="white"
              dense
            >
              {{ props.row.is_active !== false ? 'ACTIVE' : 'INACTIVE' }}
            </q-chip>
          </q-td>
        </template>
        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="q-gutter-sm">
            <PermissionGate permission="admin.branches.edit">
              <q-btn
                flat
                round
                color="primary"
                icon="edit"
                size="sm"
                @click="editBranch(props.row)"
              />
            </PermissionGate>
            <PermissionGate permission="admin.branches.delete">
              <q-btn
                flat
                round
                color="negative"
                icon="delete"
                size="sm"
                @click="deleteBranch(props.row)"
              />
            </PermissionGate>
          </q-td>
        </template>
      </q-table>
    </q-card>

    <!-- Add/Edit Branch Dialog -->
    <q-dialog v-model="dialogVisible">
      <q-card style="min-width: 500px">
        <q-card-section>
          <div class="text-h6">{{ isEditing ? 'Edit Branch' : 'Add New Branch' }}</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-form @submit="saveBranch" class="q-gutter-md">
            <q-input
              v-model="form.name"
              label="Branch Name"
              outlined
              dense
              :rules="[(val) => !!val || 'Name is required']"
            />
            <q-input
              v-model="form.address"
              label="Address"
              type="textarea"
              outlined
              dense
              :rules="[(val) => !!val || 'Address is required']"
            />
            <q-input v-model="form.phone" label="Phone Number" outlined dense />

            <div class="row q-col-gutter-md">
              <div class="col-6">
                <q-toggle v-model="form.is_main" label="Main Branch" />
              </div>
              <div class="col-6">
                <q-toggle v-model="form.is_active" label="Active" color="positive" />
              </div>
            </div>

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
import { ref, reactive, onMounted } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import PermissionGate from 'components/common/PermissionGate.vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const search = ref('')
const dialogVisible = ref(false)
const isEditing = ref(false)
const loading = ref(false)
const saving = ref(false)

const columns = [
  { name: 'name', label: 'Branch Name', align: 'left', field: 'name', sortable: true },
  { name: 'address', label: 'Address', align: 'left', field: 'address' },
  { name: 'phone', label: 'Phone', align: 'left', field: 'phone' },
  { name: 'is_main', label: 'Main Branch', align: 'center', field: 'is_main', sortable: true },
  { name: 'status', label: 'Status', align: 'center', field: 'is_active', sortable: true },
  { name: 'actions', label: 'Actions', align: 'center', field: 'actions' },
]

const branches = ref([])

const form = reactive({
  id: null,
  name: '',
  address: '',
  phone: '',
  is_main: false,
  is_active: true,
})

const fetchBranches = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, address, phone, is_main, is_active, created_at')
      .order('is_main', { ascending: false })
      .order('name')
    if (error) throw error
    branches.value = data || []
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to load branches' })
  } finally {
    loading.value = false
  }
}

const openDialog = () => {
  isEditing.value = false
  Object.assign(form, { id: null, name: '', address: '', phone: '', is_main: false, is_active: true })
  dialogVisible.value = true
}

const editBranch = (branch) => {
  isEditing.value = true
  Object.assign(form, {
    id: branch.id,
    name: branch.name,
    address: branch.address || '',
    phone: branch.phone || '',
    is_main: branch.is_main || false,
    is_active: branch.is_active !== false,
  })
  dialogVisible.value = true
}

const saveBranch = async () => {
  saving.value = true
  try {
    if (isEditing.value) {
      const { error } = await supabase
        .from('branches')
        .update({
          name: form.name,
          address: form.address,
          phone: form.phone,
          is_main: form.is_main,
          is_active: form.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', form.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Branch updated successfully' })
    } else {
      const { error } = await supabase
        .from('branches')
        .insert({
          name: form.name,
          address: form.address,
          phone: form.phone,
          is_main: form.is_main,
          is_active: form.is_active,
        })
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Branch created successfully' })
    }
    dialogVisible.value = false
    await fetchBranches()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to save branch' })
  } finally {
    saving.value = false
  }
}

const deleteBranch = (branch) => {
  $q.dialog({
    title: 'Confirm Deletion',
    message: `Are you sure you want to delete "${branch.name}"? This cannot be undone.`,
    cancel: true,
    persistent: true,
    ok: { label: 'Delete', color: 'negative', unelevated: true },
  }).onOk(async () => {
    try {
      const { error } = await supabase.from('branches').delete().eq('id', branch.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Branch deleted' })
      await fetchBranches()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message || 'Failed to delete branch' })
    }
  })
}

onMounted(fetchBranches)
</script>
