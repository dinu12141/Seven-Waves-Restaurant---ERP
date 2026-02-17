<template>
  <q-page class="q-pa-md">
    <PageHeader title="Role Management" subtitle="Define roles and permissions" />

    <q-card flat bordered class="q-mt-md">
      <q-card-section>
        <div class="row q-col-gutter-md items-center">
          <div class="col-12 col-md-4">
            <q-input dense outlined v-model="search" placeholder="Search roles..." class="bg-white">
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>
          <div class="col-12 col-md-8 text-right">
            <q-btn color="primary" icon="add" label="Add Role" @click="openDialog" />
          </div>
        </div>
      </q-card-section>

      <q-table :rows="roles" :columns="columns" row-key="id" :filter="search" flat>
        <template v-slot:body-cell-permissions="props">
          <q-td :props="props">
            <div class="row q-gutter-xs">
              <q-chip
                v-for="perm in props.row.permissions"
                :key="perm"
                dense
                size="sm"
                color="grey-3"
              >
                {{ perm }}
              </q-chip>
            </div>
          </q-td>
        </template>
        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="q-gutter-sm">
            <q-btn flat round color="primary" icon="edit" size="sm" @click="editRole(props.row)" />
            <q-btn
              flat
              round
              color="negative"
              icon="delete"
              size="sm"
              @click="deleteRole(props.row)"
            />
          </q-td>
        </template>
      </q-table>
    </q-card>

    <!-- Add/Edit Role Dialog -->
    <q-dialog v-model="dialogVisible">
      <q-card style="min-width: 500px">
        <q-card-section>
          <div class="text-h6">{{ isEditing ? 'Edit Role' : 'Add New Role' }}</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-form @submit="saveRole" class="q-gutter-md">
            <q-input
              v-model="form.name"
              label="Role Name"
              outlined
              dense
              :rules="[(val) => !!val || 'Name is required']"
            />

            <div class="text-subtitle2 q-mb-xs">Permissions</div>
            <div class="row q-col-gutter-sm">
              <div v-for="perm in allPermissions" :key="perm" class="col-6">
                <q-checkbox v-model="form.permissions" :label="perm" :val="perm" dense />
              </div>
            </div>

            <div class="row justify-end q-mt-lg">
              <q-btn label="Cancel" color="grey" flat v-close-popup />
              <q-btn
                :label="isEditing ? 'Update' : 'Save'"
                type="submit"
                color="primary"
                class="q-ml-sm"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const search = ref('')
const dialogVisible = ref(false)
const isEditing = ref(false)

const columns = [
  { name: 'name', label: 'Role Name', align: 'left', field: 'name', sortable: true },
  { name: 'permissions', label: 'Permissions', align: 'left', field: 'permissions' },
  { name: 'actions', label: 'Actions', align: 'center', field: 'actions' },
]

const allPermissions = [
  'view_dashboard',
  'manage_users',
  'manage_roles',
  'manage_inventory',
  'view_orders',
  'manage_orders',
  'view_finance',
  'manage_finance',
  'view_reports',
  'manage_settings',
]

const roles = ref([
  {
    id: 1,
    name: 'Admin',
    permissions: ['view_dashboard', 'manage_users', 'manage_roles', 'manage_settings'],
  },
  {
    id: 2,
    name: 'Manager',
    permissions: ['view_dashboard', 'manage_inventory', 'view_orders', 'view_finance'],
  },
  { id: 3, name: 'Waiter', permissions: ['view_orders', 'manage_orders'] },
])

const form = reactive({
  id: null,
  name: '',
  permissions: [],
})

const openDialog = () => {
  isEditing.value = false
  Object.assign(form, { id: null, name: '', permissions: [] })
  dialogVisible.value = true
}

const editRole = (role) => {
  isEditing.value = true
  // Clone to avoid direct mutation
  Object.assign(form, JSON.parse(JSON.stringify(role)))
  dialogVisible.value = true
}

const saveRole = () => {
  if (isEditing.value) {
    const index = roles.value.findIndex((r) => r.id === form.id)
    if (index !== -1) roles.value[index] = { ...form }
    $q.notify({ type: 'positive', message: 'Role updated successfully' })
  } else {
    roles.value.push({ ...form, id: Date.now() })
    $q.notify({ type: 'positive', message: 'Role created successfully' })
  }
  dialogVisible.value = false
}

const deleteRole = (role) => {
  $q.dialog({
    title: 'Confirm',
    message: `Are you sure you want to delete role ${role.name}?`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    roles.value = roles.value.filter((r) => r.id !== role.id)
    $q.notify({ type: 'info', message: 'Role deleted' })
  })
}
</script>
