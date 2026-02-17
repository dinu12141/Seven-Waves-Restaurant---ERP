<template>
  <q-page class="q-pa-md">
    <PageHeader title="User Management" subtitle="Manage system users and their access" />

    <q-card flat bordered class="q-mt-md">
      <q-card-section>
        <div class="row q-col-gutter-md items-center">
          <div class="col-12 col-md-4">
            <q-input dense outlined v-model="search" placeholder="Search users..." class="bg-white">
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>
          <div class="col-12 col-md-8 text-right">
            <q-btn color="primary" icon="add" label="Add User" @click="openDialog" />
          </div>
        </div>
      </q-card-section>

      <q-table :rows="users" :columns="columns" row-key="id" :filter="search" flat>
        <template v-slot:body-cell-status="props">
          <q-td :props="props">
            <q-chip
              :color="props.row.status === 'active' ? 'positive' : 'negative'"
              text-color="white"
              dense
            >
              {{ props.row.status }}
            </q-chip>
          </q-td>
        </template>
        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="q-gutter-sm">
            <q-btn flat round color="primary" icon="edit" size="sm" @click="editUser(props.row)" />
            <q-btn
              flat
              round
              color="negative"
              icon="delete"
              size="sm"
              @click="deleteUser(props.row)"
            />
          </q-td>
        </template>
      </q-table>
    </q-card>

    <!-- Add/Edit User Dialog -->
    <q-dialog v-model="dialogVisible">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">{{ isEditing ? 'Edit User' : 'Add New User' }}</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-form @submit="saveUser" class="q-gutter-md">
            <q-input
              v-model="form.name"
              label="Full Name"
              outlined
              dense
              :rules="[(val) => !!val || 'Name is required']"
            />
            <q-input
              v-model="form.email"
              label="Email Address"
              type="email"
              outlined
              dense
              :rules="[(val) => !!val || 'Email is required']"
            />
            <q-select
              v-model="form.role"
              label="Role"
              :options="['admin', 'manager', 'waiter', 'kitchen', 'cashier']"
              outlined
              dense
              :rules="[(val) => !!val || 'Role is required']"
            />
            <q-select
              v-model="form.branch"
              label="Branch"
              :options="['Main Branch', 'Downtown', 'Airport']"
              outlined
              dense
            />
            <q-toggle
              v-model="form.status"
              label="Active User"
              :true-value="'active'"
              :false-value="'inactive'"
            />

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
  { name: 'name', label: 'Name', align: 'left', field: 'name', sortable: true },
  { name: 'email', label: 'Email', align: 'left', field: 'email', sortable: true },
  { name: 'role', label: 'Role', align: 'left', field: 'role', sortable: true },
  { name: 'branch', label: 'Branch', align: 'left', field: 'branch', sortable: true },
  { name: 'status', label: 'Status', align: 'center', field: 'status', sortable: true },
  { name: 'actions', label: 'Actions', align: 'center', field: 'actions' },
]

const users = ref([
  {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    role: 'admin',
    branch: 'Main Branch',
    status: 'active',
  },
  {
    id: 2,
    name: 'Alice Smith',
    email: 'alice@example.com',
    role: 'manager',
    branch: 'Downtown',
    status: 'active',
  },
  {
    id: 3,
    name: 'Bob Wilson',
    email: 'bob@example.com',
    role: 'waiter',
    branch: 'Main Branch',
    status: 'inactive',
  },
])

const form = reactive({
  id: null,
  name: '',
  email: '',
  role: '',
  branch: '',
  status: 'active',
})

const openDialog = () => {
  isEditing.value = false
  Object.assign(form, { id: null, name: '', email: '', role: '', branch: '', status: 'active' })
  dialogVisible.value = true
}

const editUser = (user) => {
  isEditing.value = true
  Object.assign(form, user)
  dialogVisible.value = true
}

const saveUser = () => {
  if (isEditing.value) {
    const index = users.value.findIndex((u) => u.id === form.id)
    if (index !== -1) users.value[index] = { ...form }
    $q.notify({ type: 'positive', message: 'User updated successfully' })
  } else {
    users.value.push({ ...form, id: Date.now() })
    $q.notify({ type: 'positive', message: 'User created successfully' })
  }
  dialogVisible.value = false
}

const deleteUser = (user) => {
  $q.dialog({
    title: 'Confirm',
    message: `Are you sure you want to delete ${user.name}?`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    users.value = users.value.filter((u) => u.id !== user.id)
    $q.notify({ type: 'info', message: 'User deleted' })
  })
}
</script>
