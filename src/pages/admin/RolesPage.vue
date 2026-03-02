<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="User Role & Permissions"
      subtitle="Fine-grained system access control for every user"
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
              placeholder="Search users..."
              class="bg-white"
              clearable
            >
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>
          <q-space />
          <div class="text-caption text-grey-7 italic">
            * Higher roles inherit standard permissions. Use custom ticks for granular access.
          </div>
        </div>
      </q-card-section>

      <q-table
        :rows="filteredUsers"
        :columns="columns"
        row-key="id"
        :loading="loading"
        flat
        :pagination="{ rowsPerPage: 10 }"
      >
        <template v-slot:body-cell-roles="props">
          <q-td :props="props">
            <div class="row q-gutter-xs">
              <q-chip
                v-for="role in props.row.user_roles"
                :key="role.role_id"
                dense
                size="sm"
                color="indigo"
                text-color="white"
                outline
              >
                {{ role.roles.name.toUpperCase() }}
              </q-chip>
              <div v-if="!props.row.user_roles?.length" class="text-caption text-grey-5">
                No roles
              </div>
            </div>
          </q-td>
        </template>

        <template v-slot:body-cell-permissions="props">
          <q-td :props="props">
            <div class="row q-gutter-xs items-center">
              <template v-if="isAdmin(props.row)">
                <q-chip dense size="sm" color="amber-9" text-color="white" icon="star"
                  >Full Admin Access</q-chip
                >
              </template>
              <template v-else>
                <span
                  v-if="props.row.user_permissions?.length"
                  class="text-caption text-primary text-weight-bold"
                >
                  {{ props.row.user_permissions.length }} Custom Access Points
                </span>
                <span v-else class="text-caption text-grey-5">Standard role access</span>
              </template>
            </div>
          </q-td>
        </template>

        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="q-gutter-sm">
            <q-btn
              unelevated
              color="primary"
              label="Edit Access"
              icon="security"
              size="sm"
              @click="editUserAccess(props.row)"
            />
          </q-td>
        </template>
      </q-table>
    </q-card>

    <!-- Manage User Access Dialog -->
    <q-dialog
      v-model="dialogVisible"
      persistent
      maximized
      transition-show="slide-up"
      transition-hide="slide-down"
    >
      <q-card class="bg-grey-1">
        <q-toolbar class="bg-primary text-white sticky-top">
          <q-toolbar-title>Manage System Access for {{ selectedUser?.full_name }}</q-toolbar-title>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-toolbar>

        <q-card-section class="q-pa-lg">
          <div class="row q-col-gutter-lg">
            <!-- Left Side: Basic Roles -->
            <div class="col-12 col-md-4">
              <div class="text-h6 q-mb-md flex items-center">
                <q-icon name="group" class="q-mr-sm text-primary" />
                Primary Roles
              </div>
              <q-card flat bordered class="q-pa-md bg-white">
                <div class="text-caption q-mb-md text-grey-7">
                  Assign high-level roles for broad access.
                </div>
                <div class="row q-col-gutter-sm">
                  <div v-for="role in allRoles" :key="role.id" class="col-12">
                    <q-item
                      tag="label"
                      v-ripple
                      dense
                      class="rounded-borders border-grey-3 q-mb-xs"
                    >
                      <q-item-section avatar>
                        <q-checkbox
                          v-model="form.roleIds"
                          :val="role.id"
                          color="primary"
                          @update:model-value="onRoleToggled($event, role)"
                        />
                      </q-item-section>
                      <q-item-section>
                        <q-item-label class="text-weight-bold">{{
                          role.name.toUpperCase()
                        }}</q-item-label>
                        <q-item-label caption>{{ role.description }}</q-item-label>
                      </q-item-section>
                    </q-item>
                  </div>
                </div>
              </q-card>
            </div>

            <!-- Right Side: Fine-Grained Permissions -->
            <div class="col-12 col-md-8">
              <div class="text-h6 q-mb-md flex items-center">
                <q-icon name="tune" class="q-mr-sm text-primary" />
                Granular Access Points (Custom Permissions)
              </div>

              <div
                v-if="
                  form.roleIds.some((id) => allRoles.find((r) => r.id === id)?.name === 'admin')
                "
                class="q-pa-md bg-amber-1 border-amber rounded-borders q-mb-md text-amber-9 text-weight-bold"
              >
                <q-icon name="warning" class="q-mr-sm" />
                Note: USER HAS ADMIN ROLE. All granular permissions below are automatically granted.
              </div>

              <!-- Categories -->
              <div class="row q-col-gutter-md">
                <div
                  v-for="(group, gIndex) in groupedPermissions"
                  :key="gIndex"
                  class="col-12 col-sm-6"
                >
                  <q-card flat bordered class="bg-white full-height">
                    <q-card-section
                      class="bg-grey-2 q-py-xs text-weight-bold text-grey-8 uppercase letter-spacing-1"
                    >
                      {{ group.category }}
                    </q-card-section>
                    <q-card-section class="q-pa-sm">
                      <q-list dense>
                        <q-item
                          v-for="perm in group.items"
                          :key="perm.code"
                          tag="label"
                          v-ripple
                          dense
                        >
                          <q-item-section avatar>
                            <q-checkbox
                              v-model="form.permissionCodes"
                              :val="perm.code"
                              color="secondary"
                            />
                          </q-item-section>
                          <q-item-section>
                            <q-item-label>{{ perm.description }}</q-item-label>
                            <q-item-label caption class="text-xs text-grey-5">{{
                              perm.code
                            }}</q-item-label>
                          </q-item-section>
                        </q-item>
                      </q-list>
                    </q-card-section>
                  </q-card>
                </div>
              </div>
            </div>
          </div>
        </q-card-section>

        <q-separator />

        <q-card-actions align="right" class="q-pa-md bg-white">
          <q-btn label="Cancel" color="grey" flat v-close-popup class="q-px-md" />
          <q-btn
            label="Save Access Settings"
            color="primary"
            @click="saveUserAccess"
            :loading="saving"
            unelevated
            class="q-px-xl"
            icon="save"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const search = ref('')
const dialogVisible = ref(false)
const loading = ref(false)
const saving = ref(false)
const users = ref([])
const allRoles = ref([])
const allPermissions = ref([])
const selectedUser = ref(null)

const columns = [
  { name: 'full_name', label: 'User Name', align: 'left', field: 'full_name', sortable: true },
  { name: 'email', label: 'Email', align: 'left', field: 'email', sortable: true },
  { name: 'roles', label: 'Primary Roles', align: 'left', field: 'user_roles' },
  { name: 'permissions', label: 'Custom Access', align: 'left' },
  { name: 'actions', label: 'Actions', align: 'center' },
]

const form = reactive({
  roleIds: [],
  permissionCodes: [],
})

const isAdmin = (user) => {
  return (
    user.user_roles?.some((ur) => ur.roles.name === 'admin') ||
    user.user_permissions?.some((up) => up.permission_code === 'admin:console')
  )
}

const categorizedMap = {
  'CORE OPERATIONS': ['pos:', 'orders:', 'kitchen:', 'waiter:', 'cashier:', 'tables:'],
  MODULES: ['inventory:', 'procurement:', 'finance:', 'hr:'],
  'SYSTEM CONFIG': ['admin:'],
}

const groupedPermissions = computed(() => {
  const result = []

  // Create Groups
  for (const [category, prefixes] of Object.entries(categorizedMap)) {
    const items = allPermissions.value.filter((p) => prefixes.some((pre) => p.code.startsWith(pre)))
    if (items.length) {
      result.push({ category, items })
    }
  }

  // Other group for anything remaining
  const remaining = allPermissions.value.filter(
    (p) =>
      !Object.values(categorizedMap)
        .flat()
        .some((pre) => p.code.startsWith(pre)),
  )
  if (remaining.length) {
    result.push({ category: 'OTHERS', items: remaining })
  }

  return result
})

const filteredUsers = computed(() => {
  if (!search.value) return users.value
  const s = search.value.toLowerCase()
  return users.value.filter(
    (u) => u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s),
  )
})

// Auto-assign permissions when a role is selected
const defaultRolePrefixes = {
  admin: ['admin:console'],
  cashier: ['pos:', 'orders:', 'cashier:'],
  waiter: ['pos:', 'orders:', 'waiter:', 'tables:'],
  kitchen: ['kitchen:'],
  finance: ['finance:'],
  hr: ['hr:'],
  inventory: ['inventory:', 'procurement:'],
  manager: ['pos:', 'orders:', 'inventory:', 'finance:', 'hr:'],
}

const onRoleToggled = (newRoleIds, role) => {
  // Only auto-add when the role is explicitly CHECKED
  if (newRoleIds.includes(role.id)) {
    const roleName = role.name.toLowerCase()

    if (roleName === 'admin') {
      if (!form.permissionCodes.includes('admin:console')) {
        form.permissionCodes.push('admin:console')
      }
      return
    }

    const prefixes = defaultRolePrefixes[roleName] || []
    if (prefixes.length === 0) return

    // Find permissions matching the prefix
    const permsToAdd = allPermissions.value
      .filter((p) => prefixes.some((pre) => p.code.startsWith(pre)))
      .map((p) => p.code)

    // Add without duplicates
    permsToAdd.forEach((code) => {
      if (!form.permissionCodes.includes(code)) {
        form.permissionCodes.push(code)
      }
    })
  }
}

onMounted(async () => {
  await fetchData()
})

const fetchData = async () => {
  loading.value = true
  try {
    // Fetch users with roles and permissions
    const { data: usersData, error: usersError } = await supabase
      .from('profiles')
      .select(
        `
        id,
        full_name,
        email,
        user_roles (
          role_id,
          roles ( id, name )
        ),
        user_permissions (
          permission_code
        )
      `,
      )
      .order('full_name')

    if (usersError) throw usersError
    users.value = usersData

    // Fetch Roles
    const { data: rolesData, error: rolesError } = await supabase
      .from('roles')
      .select('*')
      .order('name')

    if (rolesError) throw rolesError
    allRoles.value = rolesData

    // Fetch Permissions
    const { data: permsData, error: permsError } = await supabase
      .from('permissions')
      .select('*')
      .order('code')

    if (permsError) throw permsError
    allPermissions.value = permsData
  } catch (err) {
    console.error('Error fetching access data:', err)
    $q.notify({ type: 'negative', message: 'Failed to load access system data' })
  } finally {
    loading.value = false
  }
}

const editUserAccess = (user) => {
  selectedUser.value = user
  form.roleIds = user.user_roles?.map((ur) => ur.role_id) || []
  form.permissionCodes = user.user_permissions?.map((up) => up.permission_code) || []
  dialogVisible.value = true
}

const saveUserAccess = async () => {
  if (!selectedUser.value) return

  saving.value = true
  try {
    const userId = selectedUser.value.id

    // 1. Update Roles
    await supabase.from('user_roles').delete().eq('user_id', userId)
    if (form.roleIds.length > 0) {
      const roleInserts = form.roleIds.map((rid) => ({ user_id: userId, role_id: rid }))
      await supabase.from('user_roles').insert(roleInserts)
    }

    // 2. Update Permissions
    await supabase.from('user_permissions').delete().eq('user_id', userId)
    if (form.permissionCodes.length > 0) {
      const permInserts = form.permissionCodes.map((code) => ({
        user_id: userId,
        permission_code: code,
      }))
      await supabase.from('user_permissions').insert(permInserts)
    }

    $q.notify({ type: 'positive', message: 'User system access updated successfully' })
    dialogVisible.value = false
    await fetchData()
  } catch (err) {
    console.error('Error saving access:', err)
    $q.notify({ type: 'negative', message: 'Failed to sync access settings' })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.sticky-top {
  position: sticky;
  top: 0;
  z-index: 10;
}
.letter-spacing-1 {
  letter-spacing: 1px;
}
.border-grey-3 {
  border: 1px solid #e0e0e0;
}
</style>
