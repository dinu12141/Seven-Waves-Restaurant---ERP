<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="User Management"
      subtitle="Create and manage system user accounts"
      show-back
      back-route="/admin"
    />

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
            <q-btn
              color="secondary"
              outline
              icon="admin_panel_settings"
              label="User Access (Roles)"
              to="/admin/roles"
              class="q-mr-sm"
            />
            <q-btn color="primary" icon="add" label="Add User" @click="openDialog" />
          </div>
        </div>
      </q-card-section>

      <q-table
        :rows="users"
        :columns="columns"
        row-key="id"
        :filter="search"
        :loading="loading"
        flat
      >
        <template v-slot:body-cell-status="props">
          <q-td :props="props">
            <q-chip :color="props.row.is_active ? 'positive' : 'negative'" text-color="white" dense>
              {{ props.row.is_active ? 'Active' : 'Inactive' }}
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
    <q-dialog v-model="dialogVisible" persistent>
      <q-card style="min-width: 450px">
        <q-card-section>
          <div class="text-h6">{{ isEditing ? 'Edit User Profile' : 'Add New System User' }}</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-form @submit="saveUser" class="q-gutter-md">
            <!-- Employee Selection -->
            <q-select
              v-model="selectedEmployee"
              label="Select Employee (from HR)"
              outlined
              dense
              use-input
              input-debounce="0"
              :options="employeeOptions"
              @filter="filterEmployees"
              @update:model-value="onEmployeeSelected"
              option-label="full_name"
              option-value="id"
              :rules="[(val) => !!val || 'Employee selection is required']"
              bg-color="white"
              color="primary"
              label-color="primary"
              input-class="text-black"
              popup-content-class="text-black"
              v-if="!isEditing"
            >
              <template v-slot:no-option>
                <q-item>
                  <q-item-section class="text-grey-9">
                    No employees found without profiles
                  </q-item-section>
                </q-item>
              </template>
              <template v-slot:option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section>
                    <q-item-label class="text-black text-weight-bold">{{
                      scope.opt.full_name
                    }}</q-item-label>
                    <q-item-label caption class="text-grey-8">
                      {{ scope.opt.employee_code }} |
                      {{ scope.opt.designations?.title || 'No Title' }}
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </template>
            </q-select>

            <q-input
              v-model="form.full_name"
              label="Full Name"
              outlined
              dense
              readonly
              disable
              bg-color="grey-1"
              label-color="grey-7"
              input-class="text-black"
            />
            <q-input
              v-model="form.email"
              label="Email Address (Login ID)"
              type="email"
              outlined
              dense
              autocomplete="new-password"
              :rules="[(val) => !!val || 'Email is required']"
              :readonly="isEditing"
              :disable="isEditing"
              bg-color="white"
              color="primary"
              label-color="primary"
              input-class="text-black"
            />

            <q-input
              v-if="!isEditing"
              v-model="form.password"
              label="Initial Password"
              :type="showPassword ? 'text' : 'password'"
              outlined
              dense
              autocomplete="off"
              :rules="[(val) => !!val || 'Initial password is required']"
              bg-color="white"
              color="primary"
              label-color="primary"
              input-class="text-black"
            >
              <template v-slot:append>
                <q-icon
                  :name="showPassword ? 'visibility_off' : 'visibility'"
                  class="cursor-pointer"
                  @click="showPassword = !showPassword"
                />
              </template>
            </q-input>

            <q-input
              v-model="form.phone"
              label="Phone Number"
              outlined
              dense
              autocomplete="off"
              bg-color="white"
              color="primary"
              label-color="primary"
              input-class="text-black"
            />

            <!-- Role Selection (New) -->
            <q-select
              v-if="!isEditing"
              v-model="form.roleId"
              :options="rolesList"
              option-label="name"
              option-value="id"
              emit-value
              map-options
              label="Assign Primary Role"
              outlined
              dense
              bg-color="white"
              color="primary"
              label-color="primary"
              :rules="[(val) => !!val || 'Primary role is required']"
              input-class="text-black"
              popup-content-class="text-black"
            >
              <template v-slot:option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section>
                    <q-item-label class="text-black">{{
                      scope.opt.name.toUpperCase()
                    }}</q-item-label>
                  </q-item-section>
                </q-item>
              </template>
            </q-select>

            <q-toggle
              v-model="form.is_active"
              label="Access Status"
              :true-value="true"
              :false-value="false"
            >
              <template v-slot:default>
                <span :class="form.is_active ? 'text-positive' : 'text-negative'">
                  {{ form.is_active ? 'ENABLED' : 'DISABLED' }}
                </span>
              </template>
            </q-toggle>

            <div class="row justify-end q-mt-lg">
              <q-btn label="Cancel" color="grey" flat v-close-popup />
              <q-btn
                :label="isEditing ? 'Update User' : 'Create Account'"
                type="submit"
                color="primary"
                class="q-ml-sm"
                :loading="saving"
                unelevated
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Credentials Dialog -->
    <q-dialog v-model="credentialsDialogVisible" persistent>
      <q-card style="min-width: 400px">
        <q-card-section class="bg-positive text-white">
          <div class="text-h6 flex items-center">
            <q-icon name="check_circle" size="md" class="q-mr-sm" />
            User Created Successfully
          </div>
        </q-card-section>

        <q-card-section class="q-pt-md">
          <p class="text-subtitle1 q-mb-md text-weight-medium">
            Please share these credentials securely with the user. They will not be shown again.
          </p>

          <q-input
            readonly
            outlined
            v-model="newlyCreatedUser.email"
            label="Email / Login ID"
            class="q-mb-md"
          >
            <template v-slot:append>
              <q-btn
                round
                dense
                flat
                icon="content_copy"
                color="primary"
                @click="copyToClipboard(newlyCreatedUser.email)"
              >
                <q-tooltip>Copy Email</q-tooltip>
              </q-btn>
            </template>
          </q-input>

          <q-input
            readonly
            outlined
            v-model="newlyCreatedUser.password"
            label="Initial Password"
            type="text"
            class="q-mb-md"
          >
            <template v-slot:append>
              <q-btn
                round
                dense
                flat
                icon="content_copy"
                color="primary"
                @click="copyToClipboard(newlyCreatedUser.password)"
              >
                <q-tooltip>Copy Password</q-tooltip>
              </q-btn>
            </template>
          </q-input>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn label="Done" color="primary" unelevated v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const search = ref('')
const dialogVisible = ref(false)
const credentialsDialogVisible = ref(false)
const isEditing = ref(false)
const showPassword = ref(false)
const loading = ref(false)
const saving = ref(false)
const rolesList = ref([]) // For role selection

const newlyCreatedUser = reactive({
  email: '',
  password: '',
})

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    $q.notify({ type: 'positive', message: 'Copied to clipboard!', position: 'top' })
  } catch (err) {
    console.error('Copy failed:', err)
    $q.notify({ type: 'negative', message: 'Failed to copy', position: 'top' })
  }
}

const columns = [
  { name: 'full_name', label: 'Name', align: 'left', field: 'full_name', sortable: true },
  { name: 'email', label: 'Email', align: 'left', field: 'email', sortable: true },
  { name: 'phone', label: 'Phone', align: 'left', field: 'phone' },
  { name: 'status', label: 'Status', align: 'center', field: 'is_active', sortable: true },
  { name: 'actions', label: 'Actions', align: 'center', field: 'actions' },
]

const users = ref([])
const form = reactive({
  id: null,
  full_name: '',
  email: '',
  phone: '',
  password: '',
  roleId: null,
  is_active: true,
})

const employees = ref([])
const employeeOptions = ref([])
const selectedEmployee = ref(null)

onMounted(async () => {
  await fetchUsers()
  await fetchAvailableEmployees()
  await fetchRoles()
})

const fetchRoles = async () => {
  try {
    const { data, error } = await supabase.from('roles').select('id, name').order('name')
    if (error) throw error
    rolesList.value = data || []
  } catch (err) {
    console.error('Error fetching roles:', err)
  }
}

const fetchUsers = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    users.value = data
  } catch (err) {
    console.error('Error fetching users:', err)
  } finally {
    loading.value = false
  }
}

const fetchAvailableEmployees = async () => {
  try {
    // Fetch employees who don't have a linked profile yet (if adding new user)
    const { data, error } = await supabase
      .from('employees')
      .select('id, full_name, email, phone, employee_code, profile_id, designations(title)')
      .eq('is_active', true)

    if (error) throw error
    employees.value = data
    employeeOptions.value = data
  } catch (err) {
    console.error('Error fetching employees:', err)
  }
}

const filterEmployees = (val, update) => {
  if (val === '') {
    update(() => {
      employeeOptions.value = employees.value
    })
    return
  }

  update(() => {
    const need = val.toLowerCase()
    employeeOptions.value = employees.value.filter(
      (v) =>
        v.full_name.toLowerCase().indexOf(need) > -1 ||
        v.employee_code.toLowerCase().indexOf(need) > -1,
    )
  })
}

const onEmployeeSelected = (emp) => {
  if (emp) {
    form.full_name = emp.full_name
    form.email = emp.email || ''
    form.phone = emp.phone || ''
  } else {
    form.full_name = ''
    form.email = ''
    form.phone = ''
  }
}

const openDialog = () => {
  isEditing.value = false
  selectedEmployee.value = null
  Object.assign(form, {
    id: null,
    full_name: '',
    email: '',
    phone: '',
    password: '',
    roleId: null,
    is_active: true,
  })
  dialogVisible.value = true
}

const editUser = (user) => {
  isEditing.value = true
  Object.assign(form, user)
  dialogVisible.value = true
}

const saveUser = async () => {
  saving.value = true
  try {
    if (isEditing.value) {
      // Update existing profile
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name,
          phone: form.phone,
          is_active: form.is_active,
          updated_at: new Date(),
        })
        .eq('id', form.id)

      if (error) throw error
      $q.notify({ type: 'positive', message: 'User profile updated' })
    } else {
      // Create new user in Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.full_name,
          },
        },
      })

      if (authError) throw authError

      // Note: Trigger usually handles profile creation, but let's make sure
      // Link employee to profile_id if needed
      if (selectedEmployee.value) {
        await supabase
          .from('employees')
          .update({ profile_id: authData.user.id })
          .eq('id', selectedEmployee.value.id)
      }

      // ─── ADDED: Role Assignment ───
      if (form.roleId) {
        console.log('[UsersPage] Assigning role:', form.roleId, 'to user:', authData.user.id)
        const { error: roleError } = await supabase.from('user_roles').insert({
          user_id: authData.user.id,
          role_id: form.roleId,
        })
        if (roleError) console.error('[UsersPage] Role assignment error:', roleError)
      }

      newlyCreatedUser.email = form.email
      newlyCreatedUser.password = form.password
      credentialsDialogVisible.value = true
    }

    dialogVisible.value = false
    await fetchUsers()
  } catch (err) {
    console.error('Error saving user:', err)
    $q.notify({ type: 'negative', message: err.message || 'Failed to save user' })
  } finally {
    saving.value = false
  }
}

const deleteUser = (user) => {
  $q.dialog({
    title: 'Confirm Deactivation',
    message: `Are you sure you want to disable ${user.full_name}? This will block their system access.`,
    cancel: true,
    persistent: true,
    ok: { label: 'Disable Account', color: 'negative' },
  }).onOk(async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', user.id)

      if (error) throw error
      $q.notify({ type: 'info', message: 'User access disabled' })
      await fetchUsers()
    } catch (err) {
      console.error('Error disabling user:', err)
      $q.notify({ type: 'negative', message: 'Failed to disable user' })
    }
  })
}
</script>
