<template>
  <q-page class="um-page q-pa-lg">
    <!-- Module Header -->
    <div class="um-header">
      <div class="um-header__left">
        <div class="um-header__icon-wrap">
          <q-icon name="manage_accounts" size="22px" />
        </div>
        <div>
          <h1 class="um-header__title">User Management</h1>
          <p class="um-header__sub">Create and manage system login accounts</p>
        </div>
      </div>
      <div class="um-header__actions">
        <q-btn unelevated no-caps icon="admin_panel_settings" label="Access Control"
          to="/admin/roles" class="um-btn um-btn--outline" />
        <PermissionGate permission="admin.users.create">
          <q-btn unelevated no-caps icon="add" label="Add User"
            @click="openDialog" class="um-btn um-btn--primary" />
        </PermissionGate>
      </div>
    </div>

    <!-- Stats Strip -->
    <div class="um-stats-row">
      <div class="um-stat um-stat--total">
        <q-icon name="people" size="20px" />
        <div class="um-stat__body">
          <div class="um-stat__value">{{ users.length }}</div>
          <div class="um-stat__label">Total Users</div>
        </div>
      </div>
      <div class="um-stat um-stat--active">
        <q-icon name="check_circle" size="20px" />
        <div class="um-stat__body">
          <div class="um-stat__value">{{ users.filter(u => u.is_active).length }}</div>
          <div class="um-stat__label">Active</div>
        </div>
      </div>
      <div class="um-stat um-stat--inactive">
        <q-icon name="block" size="20px" />
        <div class="um-stat__body">
          <div class="um-stat__value">{{ users.filter(u => !u.is_active).length }}</div>
          <div class="um-stat__label">Inactive</div>
        </div>
      </div>
      <div class="um-stat um-stat--code">
        <q-icon name="pin" size="20px" />
        <div class="um-stat__body">
          <div class="um-stat__value">{{ users.filter(u => u.user_code).length }}</div>
          <div class="um-stat__label">Have Code</div>
        </div>
      </div>
    </div>

    <!-- Search + Filter Bar -->
    <div class="um-toolbar">
      <q-input v-model="search" dense outlined clearable placeholder="Search by name, email, code..."
        class="um-search">
        <template #prepend><q-icon name="search" size="16px" /></template>
      </q-input>
    </div>

    <!-- Users Table -->
    <div class="um-table-card">
      <q-table :rows="users" :columns="columns" row-key="id" :filter="search"
        :loading="loading" flat class="um-table">
        <!-- Name cell with avatar -->
        <template #body-cell-full_name="props">
          <q-td :props="props">
            <div class="um-user-cell">
              <div class="um-avatar">{{ initials(props.row.full_name) }}</div>
              <div>
                <div class="um-user-name">{{ props.row.full_name || '—' }}</div>
                <div class="um-user-email">{{ props.row.email }}</div>
              </div>
            </div>
          </q-td>
        </template>
        <!-- User Code cell -->
        <template #body-cell-user_code="props">
          <q-td :props="props" class="text-center">
            <span v-if="props.row.user_code" class="um-code-badge">
              <q-icon name="pin" size="12px" class="q-mr-xs" />{{ props.row.user_code }}
            </span>
            <span v-else class="um-code-empty">—</span>
          </q-td>
        </template>
        <!-- Designation cell -->
        <template #body-cell-designation="props">
          <q-td :props="props">
            <span class="um-designation">{{ props.row._designation || '—' }}</span>
          </q-td>
        </template>
        <!-- Status cell -->
        <template #body-cell-status="props">
          <q-td :props="props" class="text-center">
            <span class="um-status-badge" :class="props.row.is_active ? 'um-status-badge--active' : 'um-status-badge--inactive'">
              <span class="um-status-dot"></span>
              {{ props.row.is_active ? 'Active' : 'Inactive' }}
            </span>
          </q-td>
        </template>
        <!-- Actions cell -->
        <template #body-cell-actions="props">
          <q-td :props="props">
            <div class="um-actions">
              <template v-if="!isAdminUser(props.row)">
                <PermissionGate permission="admin.users.edit">
                  <q-btn flat round size="sm" icon="edit" class="um-action-btn um-action-btn--edit"
                    @click="editUser(props.row)">
                    <q-tooltip>Edit User</q-tooltip>
                  </q-btn>
                </PermissionGate>
                <PermissionGate permission="admin.users.manage">
                  <q-btn flat round size="sm"
                    :icon="props.row.is_active ? 'block' : 'check_circle'"
                    :class="props.row.is_active ? 'um-action-btn um-action-btn--danger' : 'um-action-btn um-action-btn--success'"
                    @click="toggleUserStatus(props.row)">
                    <q-tooltip>{{ props.row.is_active ? 'Deactivate' : 'Activate' }}</q-tooltip>
                  </q-btn>
                  <q-btn flat round size="sm" icon="delete" class="um-action-btn um-action-btn--danger"
                    @click="deleteUser(props.row)">
                    <q-tooltip>Delete User</q-tooltip>
                  </q-btn>
                </PermissionGate>
              </template>
              <span v-else class="text-caption text-amber-8 q-px-xs row items-center">
                <q-icon name="lock" size="13px" class="q-mr-xs" />Protected
              </span>
            </div>
          </q-td>
        </template>
        <!-- Loading -->
        <template #loading>
          <q-inner-loading showing color="purple-6" />
        </template>
        <!-- Empty -->
        <template #no-data>
          <div class="um-empty">
            <div class="um-empty__icon"><q-icon name="people_outline" size="32px" /></div>
            <div class="um-empty__title">No users found</div>
            <div class="um-empty__sub">Create your first system user to get started</div>
          </div>
        </template>
      </q-table>
    </div>

    <!-- ADD/EDIT USER DIALOG -->
    <q-dialog v-model="dialogVisible" persistent>
      <q-card class="um-dialog">
        <!-- Dialog Header -->
        <div class="um-dialog__header">
          <div class="um-dialog__header-icon">
            <q-icon :name="isEditing ? 'edit' : 'person_add'" size="20px" />
          </div>
          <div>
            <div class="um-dialog__title">{{ isEditing ? 'Edit User Profile' : 'Create System Account' }}</div>
            <div class="um-dialog__sub">{{ isEditing ? 'Update user information' : 'New login credentials for a staff member' }}</div>
          </div>
          <q-btn flat round dense icon="close" class="um-dialog__close" v-close-popup />
        </div>

        <div class="um-dialog__body">
          <q-form @submit="saveUser" class="um-form">
            <!-- SECTION: Employee Link (create only) -->
            <div v-if="!isEditing" class="um-form-section">
              <div class="um-form-section__title">
                <q-icon name="badge" size="14px" class="q-mr-xs" />LINK TO EMPLOYEE
              </div>
              <q-select v-model="selectedEmployee" label="Select Employee (from HR)" outlined dense stack-label
                use-input input-debounce="0" :options="employeeOptions"
                @filter="filterEmployees" @update:model-value="onEmployeeSelected"
                option-label="full_name" option-value="id"
                :rules="[(val) => !!val || 'Employee selection is required']"
                class="um-field">
                <template #prepend><q-icon name="people" size="16px" /></template>
                <template #no-option>
                  <q-item><q-item-section class="text-grey-6">No employees found</q-item-section></q-item>
                </template>
                <template #option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section avatar>
                      <div class="um-opt-avatar">{{ initials(scope.opt.full_name) }}</div>
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-weight-bold">{{ scope.opt.full_name }}</q-item-label>
                      <q-item-label caption>{{ scope.opt.employee_code }} · {{ scope.opt.designations?.title || 'No Title' }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>

            <!-- SECTION: Personal Info -->
            <div class="um-form-section">
              <div class="um-form-section__title">
                <q-icon name="person" size="14px" class="q-mr-xs" />PERSONAL INFO
              </div>
              <q-input v-model="form.full_name" label="Full Name" outlined dense stack-label readonly disable class="um-field">
                <template #prepend><q-icon name="person_outline" size="16px" /></template>
              </q-input>
              <q-input v-model="form.phone" label="Phone Number" outlined dense stack-label class="um-field">
                <template #prepend><q-icon name="phone" size="16px" /></template>
              </q-input>
            </div>

            <!-- SECTION: Login Credentials -->
            <div class="um-form-section">
              <div class="um-form-section__title">
                <q-icon name="lock" size="14px" class="q-mr-xs" />LOGIN CREDENTIALS
              </div>
              <!-- Login method info banner -->
              <div class="um-login-info">
                <q-icon name="info_outline" size="16px" class="q-mr-sm" />
                <div>
                  <div class="um-login-info__title">Two login methods available</div>
                  <div class="um-login-info__desc">
                    <strong>Email + Password</strong> — for managers, admin, finance roles<br>
                    <strong>User Code + Password</strong> — for waiters, cashiers, kitchen staff
                  </div>
                </div>
              </div>

              <q-input v-model="form.email" label="Email Address" type="email" outlined dense stack-label
                :readonly="isEditing" :disable="isEditing"
                :rules="[(val) => !!val || 'Email is required']"
                autocomplete="new-password" class="um-field">
                <template #prepend><q-icon name="mail_outline" size="16px" /></template>
              </q-input>

              <q-input v-if="!isEditing" v-model="form.password" label="Initial Password"
                :type="showPassword ? 'text' : 'password'" outlined dense stack-label
                autocomplete="off"
                :rules="[(val) => !!val || 'Password is required', (val) => val.length >= 6 || 'Min 6 characters']"
                class="um-field">
                <template #prepend><q-icon name="lock_outline" size="16px" /></template>
                <template #append>
                  <q-icon :name="showPassword ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer" @click="showPassword = !showPassword" />
                </template>
              </q-input>

              <!-- User Code -->
              <q-input v-model="form.user_code" label="User Code (Numeric Quick Login)"
                outlined dense stack-label autocomplete="off"
                hint="4-digit numeric code for quick login (waiter/cashier/kitchen)"
                :rules="[val => !val || /^\d+$/.test(val) || 'Numbers only']"
                maxlength="10"
                @input="e => form.user_code = (e.target?.value || '').replace(/\D/g, '')"
                class="um-field">
                <template #prepend><q-icon name="pin" size="16px" /></template>
                <template #append>
                  <q-btn flat dense round icon="auto_awesome" size="sm" color="purple-6"
                    @click="autoGenerateCode">
                    <q-tooltip>Auto-generate</q-tooltip>
                  </q-btn>
                </template>
              </q-input>
            </div>

            <!-- SECTION: Role & Access (create only) -->
            <div v-if="!isEditing" class="um-form-section">
              <div class="um-form-section__title">
                <q-icon name="shield" size="14px" class="q-mr-xs" />ROLE & ACCESS
              </div>
              <q-select v-model="form.roleId" label="System Role" outlined dense stack-label
                :options="rolesList" option-label="name" option-value="id" map-options emit-value
                :rules="[(val) => !!val || 'Role is required']" class="um-field">
                <template #prepend><q-icon name="admin_panel_settings" size="16px" /></template>
                <template #option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section>
                      <q-item-label>
                        <span class="um-role-option">{{ scope.opt.name.toUpperCase() }}</span>
                      </q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>

            </div>

            <!-- SECTION: Access Status -->
            <div class="um-form-section">
              <div class="um-form-section__title">
                <q-icon name="toggle_on" size="14px" class="q-mr-xs" />ACCESS STATUS
              </div>
              <div class="um-toggle-row">
                <div>
                  <div class="um-toggle-label">Account Access</div>
                  <div class="um-toggle-desc">{{ form.is_active ? 'User can log in to the system' : 'Login blocked — account disabled' }}</div>
                </div>
                <q-toggle v-model="form.is_active" :true-value="true" :false-value="false"
                  color="green-7" size="lg" />
              </div>
            </div>

            <!-- Footer Buttons -->
            <div class="um-dialog__footer">
              <q-btn flat no-caps label="Cancel" class="um-btn--cancel" v-close-popup />
              <q-btn unelevated no-caps :label="isEditing ? 'Save Changes' : 'Create Account'"
                type="submit" class="um-btn--submit" :loading="saving">
                <template #loading>
                  <q-spinner-dots size="18px" />
                </template>
              </q-btn>
            </div>
          </q-form>
        </div>
      </q-card>
    </q-dialog>

    <!-- CREDENTIALS DIALOG -->
    <q-dialog v-model="credentialsDialogVisible" persistent>
      <q-card class="um-cred-dialog">
        <div class="um-cred-dialog__header">
          <div class="um-cred-dialog__check">
            <q-icon name="check_circle" size="28px" />
          </div>
          <div>
            <div class="um-cred-dialog__title">Account Created!</div>
            <div class="um-cred-dialog__sub">Share these credentials securely — they won't be shown again</div>
          </div>
        </div>

        <div class="um-cred-dialog__body">
          <!-- Email -->
          <div class="um-cred-field">
            <div class="um-cred-field__label"><q-icon name="mail" size="14px" class="q-mr-xs" />Email / Login</div>
            <div class="um-cred-field__value-row">
              <code class="um-cred-field__value">{{ newlyCreatedUser.email }}</code>
              <q-btn flat round dense icon="content_copy" size="sm" class="um-copy-btn"
                @click="copyToClipboard(newlyCreatedUser.email)">
                <q-tooltip>Copy</q-tooltip>
              </q-btn>
            </div>
          </div>
          <!-- Password -->
          <div class="um-cred-field">
            <div class="um-cred-field__label"><q-icon name="lock" size="14px" class="q-mr-xs" />Initial Password</div>
            <div class="um-cred-field__value-row">
              <code class="um-cred-field__value">{{ newlyCreatedUser.password }}</code>
              <q-btn flat round dense icon="content_copy" size="sm" class="um-copy-btn"
                @click="copyToClipboard(newlyCreatedUser.password)">
                <q-tooltip>Copy</q-tooltip>
              </q-btn>
            </div>
          </div>
          <!-- User Code (if set) -->
          <div v-if="newlyCreatedUser.user_code" class="um-cred-field um-cred-field--code">
            <div class="um-cred-field__label"><q-icon name="pin" size="14px" class="q-mr-xs" />User Code (Quick Login)</div>
            <div class="um-cred-field__value-row">
              <code class="um-cred-field__value um-cred-field__value--code">{{ newlyCreatedUser.user_code }}</code>
              <q-btn flat round dense icon="content_copy" size="sm" class="um-copy-btn"
                @click="copyToClipboard(newlyCreatedUser.user_code)">
                <q-tooltip>Copy</q-tooltip>
              </q-btn>
            </div>
          </div>
          <!-- Login instructions -->
          <div class="um-cred-instructions">
            <q-icon name="info_outline" size="14px" class="q-mr-xs" />
            User can login at <strong>/auth/login</strong> using email or user code
          </div>
        </div>
        <div class="um-cred-dialog__footer">
          <q-btn unelevated no-caps label="Done" class="um-btn--submit full-width" v-close-popup />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import PermissionGate from 'components/common/PermissionGate.vue'
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
  user_code: '',
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
  { name: 'user_code', label: 'User Code', align: 'center', field: 'user_code', sortable: true },
  {
    name: 'designation',
    label: 'Designation',
    align: 'left',
    field: (row) => row._designation || '',
    sortable: true,
  },
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
  user_code: '',
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

const isAdminUser = (user) => {
  if (!user) return false
  return (
    user.email === 'admin@sevenwaves.lk' ||
    user._role?.toLowerCase() === 'admin' ||
    user._role?.toLowerCase() === 'super_admin' ||
    user.user_roles?.some((ur) => ur.roles?.name === 'admin' || ur.roles?.name === 'super_admin')
  )
}

const fetchRoles = async () => {
  try {
    const { data, error } = await supabase.from('roles').select('id, name').order('name')
    if (error) throw error
    // Filter out admin and super_admin so HR / standard users cannot assign admin privileges
    rolesList.value = (data || []).filter(
      (r) => r.name !== 'admin' && r.name !== 'super_admin',
    )
  } catch (err) {
    console.error('Error fetching roles:', err)
  }
}

const fetchUsers = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, employees(designation_id, designations(title)), user_roles(roles(name))')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    // Flatten a display designation: employee designation → else system role.
    users.value = (data || []).map((u) => ({
      ...u,
      _designation:
        u.employees?.[0]?.designations?.title ||
        titleCase(u.user_roles?.[0]?.roles?.name) ||
        '',
    }))
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
    user_code: '',
    roleId: null,
    is_active: true,
  })
  dialogVisible.value = true
}

const autoGenerateCode = async () => {
  try {
    const { data, error } = await supabase.rpc('generate_next_user_code')
    if (error) throw error
    form.user_code = data || ''
  } catch (err) {
    console.error('Error generating code:', err)
    $q.notify({ type: 'negative', message: 'Failed to generate code' })
  }
}

const editUser = (user) => {
  if (isAdminUser(user)) {
    $q.notify({
      type: 'warning',
      icon: 'lock',
      message: 'System Administrator profile is protected and cannot be edited by standard users.',
    })
    return
  }
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
          user_code: form.user_code || null,
          is_active: form.is_active,
          updated_at: new Date(),
        })
        .eq('id', form.id)

      if (error) throw error
      $q.notify({ type: 'positive', message: 'User profile updated' })
    } else {
      // Create new user via server-side RPC (bypasses email confirmation)
      const { data: newUserId, error: createError } = await supabase.rpc('admin_create_user', {
        p_email: form.email,
        p_password: form.password,
        p_full_name: form.full_name,
        p_phone: form.phone || '',
      })

      if (createError) throw createError

      // Link employee to profile_id if needed
      if (selectedEmployee.value && newUserId) {
        await supabase
          .from('employees')
          .update({ profile_id: newUserId })
          .eq('id', selectedEmployee.value.id)
      }

      // Assign role (idempotent — safe when reclaiming an account or re-adding)
      if (form.roleId && newUserId) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .upsert(
            { user_id: newUserId, role_id: form.roleId },
            { onConflict: 'user_id,role_id', ignoreDuplicates: true },
          )
        if (roleError) console.error('[UsersPage] Role assignment error:', roleError)
      }

      // Set user_code on profile if provided
      if (form.user_code && newUserId) {
        await supabase
          .from('profiles')
          .update({ user_code: form.user_code })
          .eq('id', newUserId)
      }

      newlyCreatedUser.email = form.email
      newlyCreatedUser.password = form.password
      newlyCreatedUser.user_code = form.user_code || ''
      credentialsDialogVisible.value = true
    }

    dialogVisible.value = false
    await fetchUsers()
  } catch (err) {
    console.error('Error saving user:', err)
    $q.notify({
      type: 'negative',
      message: err.message || 'Failed to save user',
      position: 'top',
      timeout: 4000,
    })
  } finally {
    saving.value = false
  }
}

const toggleUserStatus = (user) => {
  if (isAdminUser(user)) {
    $q.notify({
      type: 'negative',
      icon: 'shield',
      message: 'System Administrator account is protected and cannot be deactivated.',
    })
    return
  }

  const isCurrentlyActive = user.is_active
  const actionText = isCurrentlyActive ? 'deactivate' : 'activate'
  const actionPast = isCurrentlyActive ? 'deactivated' : 'activated'
  const okLabel = isCurrentlyActive ? 'Deactivate Account' : 'Activate Account'
  const okColor = isCurrentlyActive ? 'negative' : 'positive'

  $q.dialog({
    title: `Confirm ${isCurrentlyActive ? 'Deactivation' : 'Activation'}`,
    message: `Are you sure you want to ${actionText} ${user.full_name}?<br><br>
              ${isCurrentlyActive ? 'This will prevent them from logging into the system.' : 'This will grant them access to log in again.'}`,
    html: true,
    cancel: true,
    persistent: true,
    ok: { label: okLabel, color: okColor, unelevated: true },
  }).onOk(async () => {
    try {
      loading.value = true

      const { error } = await supabase.rpc('admin_toggle_user_status', {
        target_user_id: user.id,
        new_status: !isCurrentlyActive,
      })

      if (error) {
        throw new Error(error.message || 'Server error occurred')
      }

      $q.notify({ type: 'positive', message: `User account successfully ${actionPast}` })
      await fetchUsers()
    } catch (err) {
      console.error(`Error trying to ${actionText} user:`, err)
      $q.notify({
        type: 'negative',
        message: err.message || `Failed to ${actionText} user`,
      })
    } finally {
      loading.value = false
    }
  })
}

const deleteUser = (user) => {
  if (isAdminUser(user)) {
    $q.notify({
      type: 'negative',
      icon: 'shield',
      message: 'System Administrator account is protected and cannot be deleted.',
    })
    return
  }
  $q.dialog({
    title: 'Delete User',
    message: `Are you sure you want to delete <strong>${user.full_name || user.email}</strong>?<br><br>
              The account will be removed from this list and can no longer log in.
              Their order & audit history is preserved.`,
    html: true,
    cancel: true,
    persistent: true,
    ok: { label: 'Delete User', color: 'negative', unelevated: true },
  }).onOk(async () => {
    try {
      loading.value = true
      const { error } = await supabase.rpc('admin_soft_delete_user', {
        target_user_id: user.id,
      })
      if (error) throw new Error(error.message || 'Server error occurred')
      $q.notify({ type: 'positive', message: 'User deleted' })
      await fetchUsers()
    } catch (err) {
      console.error('Error deleting user:', err)
      $q.notify({ type: 'negative', message: err.message || 'Failed to delete user' })
    } finally {
      loading.value = false
    }
  })
}

function titleCase(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function initials(name) {
  if (!name) return '?'
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}
</script>

<style lang="scss" scoped>
.um-page { background: var(--erp-bg-page); min-height: 100vh; }

// Header
.um-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
.um-header__left { display: flex; align-items: center; gap: 14px; }
.um-header__icon-wrap { width: 48px; height: 48px; border-radius: 12px; background: rgba(139,92,246,0.12); color: #8b5cf6; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.um-header__title { font-size: 1.4rem; font-weight: 800; color: var(--erp-text-primary); margin: 0; }
.um-header__sub { font-size: 0.85rem; color: var(--erp-text-muted); margin: 2px 0 0; }
.um-header__actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

// Buttons
.um-btn { border-radius: 8px !important; font-weight: 600 !important; font-size: 0.88rem !important; }
.um-btn--outline { background: var(--erp-bg-card) !important; border: 1px solid var(--erp-border) !important; color: var(--erp-text-secondary) !important;
  &:hover { border-color: #8b5cf6 !important; color: #8b5cf6 !important; }
}
.um-btn--primary { background: linear-gradient(135deg, #8b5cf6, #7c3aed) !important; color: #fff !important; box-shadow: 0 4px 14px rgba(139,92,246,0.3) !important; }

// Stats strip
.um-stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px;
  @media (max-width: 600px) { grid-template-columns: repeat(2, 1fr); }
}
.um-stat { background: var(--erp-bg-card); border: 1px solid var(--erp-border); border-radius: var(--erp-radius-card); padding: 16px 18px; display: flex; align-items: center; gap: 12px; border-left: 3px solid transparent; }
.um-stat--total { border-left-color: #8b5cf6; .q-icon { color: #8b5cf6; } }
.um-stat--active { border-left-color: var(--erp-success); .q-icon { color: var(--erp-success); } }
.um-stat--inactive { border-left-color: var(--erp-danger); .q-icon { color: var(--erp-danger); } }
.um-stat--code { border-left-color: #f59e0b; .q-icon { color: #f59e0b; } }
.um-stat__body { display: flex; flex-direction: column; }
.um-stat__value { font-size: 1.5rem; font-weight: 900; color: var(--erp-text-primary); line-height: 1; }
.um-stat__label { font-size: 0.75rem; color: var(--erp-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

// Toolbar
.um-toolbar { margin-bottom: 16px; }
.um-search { max-width: 380px; }

// Table Card
.um-table-card { background: var(--erp-bg-card); border: 1px solid var(--erp-border); border-radius: var(--erp-radius-lg); overflow: hidden; }
.um-table { background: transparent !important; }

// User cell
.um-user-cell { display: flex; align-items: center; gap: 12px; }
.um-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: #fff; font-size: 0.8rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.um-user-name { font-size: 0.92rem; font-weight: 700; color: var(--erp-text-primary); }
.um-user-email { font-size: 0.78rem; color: var(--erp-text-muted); margin-top: 1px; }

// User code
.um-code-badge { display: inline-flex; align-items: center; background: rgba(245,158,11,0.1); color: #d97706; border: 1px solid rgba(245,158,11,0.25); border-radius: 6px; padding: 2px 8px; font-size: 0.8rem; font-weight: 700; font-family: monospace; letter-spacing: 1px; }
.um-code-empty { color: var(--erp-text-muted); font-size: 0.85rem; }
.um-designation { font-size: 0.85rem; color: var(--erp-text-secondary); }

// Status badge
.um-status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
.um-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.um-status-badge--active { background: var(--erp-success-subtle); color: var(--erp-success); .um-status-dot { background: var(--erp-success); } }
.um-status-badge--inactive { background: var(--erp-danger-subtle); color: var(--erp-danger); .um-status-dot { background: var(--erp-danger); } }

// Actions
.um-actions { display: flex; gap: 4px; justify-content: center; }
.um-action-btn { transition: all 0.15s !important; }
.um-action-btn--edit { color: #8b5cf6 !important; &:hover { background: rgba(139,92,246,0.1) !important; } }
.um-action-btn--danger { color: var(--erp-danger) !important; &:hover { background: var(--erp-danger-subtle) !important; } }
.um-action-btn--success { color: var(--erp-success) !important; &:hover { background: var(--erp-success-subtle) !important; } }

// Empty state
.um-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; gap: 10px; }
.um-empty__icon { width: 64px; height: 64px; border-radius: 16px; background: rgba(139,92,246,0.08); color: #8b5cf6; display: flex; align-items: center; justify-content: center; }
.um-empty__title { font-size: 1rem; font-weight: 700; color: var(--erp-text-secondary); }
.um-empty__sub { font-size: 0.85rem; color: var(--erp-text-muted); }

// Dialog
.um-dialog { width: 520px; max-width: 95vw; max-height: 92vh; overflow-y: auto; background: var(--erp-bg-card) !important; border-radius: 16px !important; }
.um-dialog__header { display: flex; align-items: center; gap: 14px; padding: 20px 24px 16px; border-bottom: 1px solid var(--erp-border); position: sticky; top: 0; background: var(--erp-bg-card); z-index: 1; }
.um-dialog__header-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(139,92,246,0.12); color: #8b5cf6; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.um-dialog__title { font-size: 1.1rem; font-weight: 800; color: var(--erp-text-primary); }
.um-dialog__sub { font-size: 0.8rem; color: var(--erp-text-muted); margin-top: 2px; }
.um-dialog__close { margin-left: auto; color: var(--erp-text-muted) !important; }
.um-dialog__body { padding: 20px 24px; }
.um-dialog__footer { display: flex; justify-content: flex-end; gap: 10px; padding-top: 16px; border-top: 1px solid var(--erp-border); margin-top: 20px; }

// Form sections
.um-form { display: flex; flex-direction: column; gap: 20px; }
.um-form-section { display: flex; flex-direction: column; gap: 12px; }
.um-form-section__title { font-size: 0.75rem; font-weight: 700; color: var(--erp-text-secondary); text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; padding-bottom: 8px; border-bottom: 1px solid var(--erp-border); }
.um-field { padding-bottom: 0px; }

// Login info banner
.um-login-info { display: flex; align-items: flex-start; gap: 10px; background: rgba(139,92,246,0.06); border: 1px solid rgba(139,92,246,0.15); border-radius: 10px; padding: 12px 14px;
  .q-icon { color: #8b5cf6; flex-shrink: 0; margin-top: 1px; }
}
.um-login-info__title { font-size: 0.85rem; font-weight: 700; color: var(--erp-text-primary); margin-bottom: 4px; }
.um-login-info__desc { font-size: 0.8rem; color: var(--erp-text-secondary); line-height: 1.5; }

// Role hints
.um-role-hints { display: flex; flex-direction: column; gap: 4px; background: var(--erp-bg-page); border: 1px solid var(--erp-border); border-radius: 8px; padding: 10px 12px; }
.um-role-hint { font-size: 0.78rem; color: var(--erp-text-muted); display: flex; gap: 8px; }
.um-role-hint__name { font-weight: 700; color: #8b5cf6; min-width: 80px; font-family: monospace; font-size: 0.75rem; }

// Toggle row
.um-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: var(--erp-bg-page); border: 1px solid var(--erp-border); border-radius: 10px; padding: 14px 16px; }
.um-toggle-label { font-size: 0.9rem; font-weight: 700; color: var(--erp-text-primary); }
.um-toggle-desc { font-size: 0.78rem; color: var(--erp-text-muted); margin-top: 2px; }

// Option avatar
.um-opt-avatar { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: #fff; font-size: 0.72rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }

// Dialog buttons
.um-btn--cancel { color: var(--erp-text-secondary) !important; border-radius: 8px !important; }
.um-btn--submit { background: linear-gradient(135deg, #8b5cf6, #7c3aed) !important; color: #fff !important; border-radius: 8px !important; font-weight: 600 !important; min-width: 140px; }

// Credentials Dialog
.um-cred-dialog { width: 460px; max-width: 95vw; background: var(--erp-bg-card) !important; border-radius: 16px !important; }
.um-cred-dialog__header { display: flex; align-items: center; gap: 14px; padding: 20px 24px 16px; border-bottom: 1px solid var(--erp-border); background: var(--erp-success-subtle); }
.um-cred-dialog__check { width: 48px; height: 48px; border-radius: 12px; background: var(--erp-success); color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.um-cred-dialog__title { font-size: 1.1rem; font-weight: 800; color: var(--erp-success); }
.um-cred-dialog__sub { font-size: 0.8rem; color: var(--erp-text-secondary); margin-top: 2px; }
.um-cred-dialog__body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
.um-cred-dialog__footer { padding: 0 24px 20px; }

.um-cred-field { background: var(--erp-bg-page); border: 1px solid var(--erp-border); border-radius: 10px; padding: 12px 14px; }
.um-cred-field--code { border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.04); }
.um-cred-field__label { font-size: 0.72rem; font-weight: 700; color: var(--erp-text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; display: flex; align-items: center; }
.um-cred-field__value-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.um-cred-field__value { font-family: 'Courier New', monospace; font-size: 0.95rem; font-weight: 700; color: var(--erp-text-primary); background: transparent; flex: 1; word-break: break-all; }
.um-cred-field__value--code { font-size: 1.2rem; color: #d97706; letter-spacing: 2px; }
.um-copy-btn { color: var(--erp-text-muted) !important; &:hover { color: #8b5cf6 !important; } }
.um-cred-instructions { font-size: 0.8rem; color: var(--erp-text-muted); display: flex; align-items: center; background: rgba(139,92,246,0.06); border: 1px solid rgba(139,92,246,0.15); border-radius: 8px; padding: 10px 12px;
  .q-icon { color: #8b5cf6; flex-shrink: 0; }
}
</style>
