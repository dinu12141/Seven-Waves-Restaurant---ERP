<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="User Access Control"
      subtitle="Overview of role-based system access and fine-grained permissions"
      show-back
      back-route="/admin"
    />

    <!-- ═══ ROLE-PERMISSION MATRIX ═══ -->
    <q-card flat bordered class="q-mt-md acm-matrix-card">
      <q-card-section class="q-pb-none">
        <div class="row items-center q-mb-sm">
          <q-icon name="grid_view" size="22px" color="primary" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">Access Control Overview</div>
          <q-space />
          <q-badge v-if="!matrixDirty" color="blue-1" text-color="blue-9" class="q-pa-xs q-mr-sm">
            <q-icon name="info" size="12px" class="q-mr-xs" />
            Click any cell to toggle access
          </q-badge>
          <template v-if="matrixDirty">
            <q-btn
              flat
              dense
              color="grey"
              label="Discard"
              icon="undo"
              size="sm"
              class="q-mr-sm"
              @click="discardMatrixChanges"
            />
            <q-btn
              unelevated
              color="primary"
              label="Save Matrix"
              icon="save"
              size="sm"
              :loading="matrixSaving"
              @click="saveRoleModuleAccess"
            />
          </template>
        </div>
      </q-card-section>

      <q-card-section class="q-pt-sm acm-scroll-container">
        <div class="acm-table-wrap">
          <table class="acm-table">
            <thead>
              <tr>
                <th class="acm-th-corner" rowspan="2">
                  <span class="acm-corner-label">Role</span>
                </th>
                <th :colspan="matrixModules.length" class="acm-th-group">Console Section</th>
              </tr>
              <tr>
                <th v-for="mod in matrixModules" :key="mod.key" class="acm-th-module">
                  {{ mod.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="role in matrixRoles" :key="role.key" class="acm-row">
                <td class="acm-td-role">
                  <div class="acm-role-name">{{ role.label }}</div>
                  <div v-if="role.caption" class="acm-role-caption">{{ role.caption }}</div>
                </td>
                <td
                  v-for="mod in matrixModules"
                  :key="mod.key"
                  class="acm-td-access acm-td-clickable"
                  @click="toggleMatrixCell(role.key, mod.key)"
                >
                  <q-icon
                    v-if="hasModuleAccess(role.key, mod.key)"
                    name="check_circle"
                    size="20px"
                    class="acm-icon-allow"
                  />
                  <q-icon v-else name="cancel" size="20px" class="acm-icon-deny" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-card-section>
    </q-card>
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

    <!-- ═══ MANAGE USER ACCESS DIALOG ═══ -->
    <q-dialog
      v-model="dialogVisible"
      persistent
      maximized
      transition-show="slide-up"
      transition-hide="slide-down"
    >
      <q-card class="acm-dialog-card">
        <q-toolbar class="bg-primary text-white sticky-top">
          <q-icon name="security" size="24px" class="q-mr-sm" />
          <q-toolbar-title> Manage Access — {{ selectedUser?.full_name }} </q-toolbar-title>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-toolbar>

        <q-card-section class="q-pa-lg">
          <!-- Role Selector -->
          <div class="row q-col-gutter-md items-start q-mb-lg">
            <div class="col-12 col-md-5">
              <q-card flat bordered class="q-pa-md">
                <div class="row items-center q-mb-sm">
                  <q-icon name="group" size="20px" color="primary" class="q-mr-sm" />
                  <div class="text-subtitle2 text-weight-bold">Primary Roles</div>
                </div>
                <div class="text-caption text-grey-7 q-mb-md">
                  Select roles to auto-assign default module permissions.
                </div>
                <div class="row q-col-gutter-xs">
                  <div v-for="role in allRoles" :key="role.id" class="col-6">
                    <q-item tag="label" v-ripple dense class="rounded-borders border-grey-3">
                      <q-item-section avatar>
                        <q-checkbox
                          v-model="form.roleIds"
                          :val="role.id"
                          color="primary"
                          @update:model-value="onRoleToggled($event, role)"
                        />
                      </q-item-section>
                      <q-item-section>
                        <q-item-label class="text-weight-bold" style="font-size: 0.78rem">
                          {{ role.name.toUpperCase() }}
                        </q-item-label>
                      </q-item-section>
                    </q-item>
                  </div>
                </div>
              </q-card>
            </div>
            <div class="col-12 col-md-7">
              <div
                v-if="
                  form.roleIds.some((id) => allRoles.find((r) => r.id === id)?.name === 'admin')
                "
                class="q-pa-md bg-amber-1 rounded-borders text-amber-9 text-weight-bold"
                style="border: 1px solid #fbbf24"
              >
                <q-icon name="verified_user" class="q-mr-sm" />
                Admin role grants <strong>full access</strong> to all modules and features.
              </div>
              <q-card v-else flat bordered class="q-pa-md">
                <div class="text-caption text-grey-8">
                  <q-icon name="info" size="14px" class="q-mr-xs" color="blue" />
                  Select roles on the left to auto-enable default permissions. Then fine-tune
                  individual features in the matrix below.
                </div>
              </q-card>
            </div>
          </div>

          <!-- Permission Matrix Table -->
          <q-card flat bordered>
            <q-card-section class="q-pb-xs">
              <div class="row items-center">
                <q-icon name="grid_view" size="20px" color="primary" class="q-mr-sm" />
                <div class="text-subtitle2 text-weight-bold">Feature Access Matrix</div>
                <q-space />
                <q-badge color="blue-1" text-color="blue-9" class="q-pa-xs">
                  {{ form.permissionCodes.length }} permissions enabled
                </q-badge>
              </div>
            </q-card-section>

            <q-card-section class="q-pt-xs acm-scroll-container">
              <table class="acm-edit-table">
                <thead>
                  <tr>
                    <th class="acm-et-section-th">Console Section</th>
                    <th class="acm-et-feature-th">Feature / Permission</th>
                    <th class="acm-et-access-th">Access</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="section in dialogSections" :key="section.key">
                    <!-- Section Header Row -->
                    <tr class="acm-et-section-row">
                      <td class="acm-et-section-cell" :rowspan="section.perms.length + 1">
                        <div class="row items-center no-wrap">
                          <q-icon
                            :name="section.icon"
                            size="18px"
                            class="q-mr-xs"
                            :color="sectionHasAnyAccess(section) ? 'primary' : 'grey-5'"
                          />
                          <div>
                            <div class="acm-et-section-name">{{ section.label }}</div>
                          </div>
                        </div>
                      </td>
                      <td class="acm-et-toggle-cell" colspan="2">
                        <div class="row items-center justify-between">
                          <span class="text-caption text-grey-7 text-italic"
                            >Toggle all features in this module</span
                          >
                          <q-toggle
                            :model-value="sectionHasAllAccess(section)"
                            @update:model-value="toggleSection(section, $event)"
                            color="primary"
                            dense
                          />
                        </div>
                      </td>
                    </tr>
                    <!-- Permission Feature Rows -->
                    <tr v-for="perm in section.perms" :key="perm.code" class="acm-et-feature-row">
                      <td class="acm-et-feature-cell">
                        <div class="acm-et-feature-name">{{ perm.description || perm.code }}</div>
                        <div class="acm-et-feature-code">{{ perm.code }}</div>
                      </td>
                      <td class="acm-et-check-cell">
                        <q-checkbox
                          v-model="form.permissionCodes"
                          :val="perm.code"
                          color="green"
                          dense
                        />
                      </td>
                    </tr>
                  </template>

                  <!-- Empty state -->
                  <tr v-if="dialogSections.length === 0">
                    <td colspan="3" class="text-center q-pa-lg text-grey-5">
                      <q-icon name="lock" size="32px" class="q-mb-sm" /><br />
                      No permissions defined in the system yet.
                    </td>
                  </tr>
                </tbody>
              </table>
            </q-card-section>
          </q-card>
        </q-card-section>

        <q-separator />

        <q-card-actions align="right" class="q-pa-md">
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
import { useAuthStore } from 'src/stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()
const search = ref('')
const dialogVisible = ref(false)
const loading = ref(false)
const saving = ref(false)
const matrixSaving = ref(false)
const matrixDirty = ref(false)
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

// ─── Role-Permission Matrix ────────────────────────────────────────────────
const matrixModules = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'pos', label: 'Point of Sale' },
  { key: 'orders', label: 'Order Mgmt' },
  { key: 'kitchen', label: 'Kitchen Display' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'finance', label: 'Finance' },
  { key: 'hr', label: 'HR & Payroll' },
  { key: 'reports', label: 'Reports' },
  { key: 'crm', label: 'CRM' },
  { key: 'system', label: 'System Config' },
]

const matrixRoles = [
  { key: 'waiter', label: 'Waiter', caption: 'basic floor access' },
  { key: 'cashier', label: 'Cashier', caption: 'POS & payment access' },
  { key: 'kitchen', label: 'Kitchen Staff', caption: 'kitchen display only' },
  { key: 'inventory', label: 'Inventory Manager', caption: 'stock & recipes' },
  { key: 'finance', label: 'Finance Officer', caption: 'accounts & payroll' },
  { key: 'hr', label: 'HR Manager', caption: 'staff & shifts' },
  { key: 'manager', label: 'Branch Manager', caption: 'broad operational access' },
  { key: 'admin', label: 'Console Admin', caption: 'full system control' },
]

const defaultRoleModuleMap = {
  waiter: ['dashboard', 'orders'],
  cashier: ['dashboard', 'pos', 'orders'],
  kitchen: ['dashboard', 'kitchen'],
  inventory: ['dashboard', 'inventory', 'procurement'],
  finance: ['dashboard', 'finance', 'reports'],
  hr: ['dashboard', 'hr'],
  manager: ['dashboard', 'pos', 'orders', 'kitchen', 'inventory', 'procurement', 'finance', 'hr', 'reports', 'crm'],
  admin: ['dashboard', 'pos', 'orders', 'kitchen', 'inventory', 'procurement', 'finance', 'hr', 'reports', 'crm', 'system'],
}

// Reactive matrix — loaded from DB, falls back to defaults
const roleModuleMap = ref(JSON.parse(JSON.stringify(defaultRoleModuleMap)))
// Snapshot for discard
let roleModuleMapSnapshot = JSON.parse(JSON.stringify(defaultRoleModuleMap))

function hasModuleAccess(roleKey, moduleKey) {
  return (roleModuleMap.value[roleKey] || []).includes(moduleKey)
}

function toggleMatrixCell(roleKey, moduleKey) {
  const current = roleModuleMap.value[roleKey] || []
  if (current.includes(moduleKey)) {
    roleModuleMap.value[roleKey] = current.filter((m) => m !== moduleKey)
  } else {
    roleModuleMap.value[roleKey] = [...current, moduleKey]
  }
  matrixDirty.value = true
}

function discardMatrixChanges() {
  roleModuleMap.value = JSON.parse(JSON.stringify(roleModuleMapSnapshot))
  matrixDirty.value = false
}

function getCompanyId() {
  return authStore.branches?.[0]?.branches?.company_id || null
}

async function loadRoleModuleAccess() {
  try {
    const companyId = getCompanyId()
    let query = supabase
      .from('module_settings')
      .select('setting_value')
      .eq('module_code', 'ADMIN')
      .eq('setting_key', 'role_module_access')

    if (companyId) query = query.eq('company_id', companyId)

    const { data, error } = await query.maybeSingle()

    if (!error && data?.setting_value) {
      const parsed = JSON.parse(data.setting_value)
      roleModuleMap.value = parsed
      roleModuleMapSnapshot = JSON.parse(JSON.stringify(parsed))
    } else {
      roleModuleMap.value = JSON.parse(JSON.stringify(defaultRoleModuleMap))
      roleModuleMapSnapshot = JSON.parse(JSON.stringify(defaultRoleModuleMap))
    }
  } catch {
    roleModuleMap.value = JSON.parse(JSON.stringify(defaultRoleModuleMap))
    roleModuleMapSnapshot = JSON.parse(JSON.stringify(defaultRoleModuleMap))
  }
}

async function saveRoleModuleAccess() {
  matrixSaving.value = true
  try {
    const companyId = getCompanyId()
    const payload = {
      module_code: 'ADMIN',
      setting_key: 'role_module_access',
      setting_value: JSON.stringify(roleModuleMap.value),
    }
    if (companyId) payload.company_id = companyId

    const { error } = await supabase
      .from('module_settings')
      .upsert(payload, { onConflict: 'company_id,module_code,setting_key' })

    if (error) throw error

    roleModuleMapSnapshot = JSON.parse(JSON.stringify(roleModuleMap.value))
    matrixDirty.value = false
    $q.notify({ type: 'positive', message: 'Access matrix saved successfully', position: 'top' })
  } catch (err) {
    console.error('Error saving role module access:', err)
    $q.notify({ type: 'negative', message: 'Failed to save matrix: ' + (err?.message || err), position: 'top' })
  } finally {
    matrixSaving.value = false
  }
}

// ─── Dialog Section Config ─────────────────────────────────
// Maps each Console Section to its permission prefixes and icon
const sectionConfig = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', prefixes: ['dashboard:'] },
  { key: 'pos', label: 'Point of Sale', icon: 'point_of_sale', prefixes: ['pos:', 'cashier:'] },
  { key: 'orders', label: 'Order Management', icon: 'receipt_long', prefixes: ['orders:'] },
  { key: 'kitchen', label: 'Kitchen Display', icon: 'restaurant', prefixes: ['kitchen:'] },
  {
    key: 'tables',
    label: 'Table Management',
    icon: 'table_restaurant',
    prefixes: ['tables:', 'waiter:'],
  },
  { key: 'inventory', label: 'Inventory', icon: 'inventory_2', prefixes: ['inventory:'] },
  { key: 'procurement', label: 'Procurement', icon: 'local_shipping', prefixes: ['procurement:'] },
  { key: 'finance', label: 'Finance', icon: 'account_balance', prefixes: ['finance:'] },
  { key: 'hr', label: 'HR & Payroll', icon: 'badge', prefixes: ['hr:'] },
  { key: 'reports', label: 'Reports', icon: 'assessment', prefixes: ['reports:'] },
  { key: 'crm', label: 'CRM / Customers', icon: 'people', prefixes: ['crm:', 'loyalty:'] },
  { key: 'system', label: 'System Config', icon: 'settings', prefixes: ['admin:'] },
]

const dialogSections = computed(() => {
  return sectionConfig
    .map((sec) => {
      const perms = allPermissions.value.filter((p) =>
        sec.prefixes.some((pre) => p.code.startsWith(pre)),
      )
      return { ...sec, perms }
    })
    .filter((sec) => sec.perms.length > 0)
})

function sectionHasAnyAccess(section) {
  return section.perms.some((p) => form.permissionCodes.includes(p.code))
}

function sectionHasAllAccess(section) {
  return (
    section.perms.length > 0 && section.perms.every((p) => form.permissionCodes.includes(p.code))
  )
}

function toggleSection(section, val) {
  if (val) {
    // Enable all permissions in section
    section.perms.forEach((p) => {
      if (!form.permissionCodes.includes(p.code)) {
        form.permissionCodes.push(p.code)
      }
    })
  } else {
    // Disable all permissions in section
    const codes = new Set(section.perms.map((p) => p.code))
    form.permissionCodes = form.permissionCodes.filter((c) => !codes.has(c))
  }
}

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
  await Promise.all([fetchData(), loadRoleModuleAccess()])
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

  // Start with saved custom permissions
  const savedPerms = new Set(user.user_permissions?.map((up) => up.permission_code) || [])

  // Auto-populate based on current roles
  for (const ur of user.user_roles || []) {
    const roleName = ur.roles?.name?.toLowerCase()
    if (!roleName) continue

    // Admin gets everything
    if (roleName === 'admin') {
      allPermissions.value.forEach((p) => savedPerms.add(p.code))
      break
    }

    // Add matching permissions by role prefix
    const prefixes = defaultRolePrefixes[roleName] || []
    allPermissions.value
      .filter((p) => prefixes.some((pre) => p.code.startsWith(pre)))
      .forEach((p) => savedPerms.add(p.code))
  }

  form.permissionCodes = [...savedPerms]
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

/* ── Access Control Matrix ── */
.acm-matrix-card {
  background: var(--erp-bg-card);
}

.acm-scroll-container {
  overflow-x: auto;
}

.acm-table-wrap {
  min-width: 800px;
}

.acm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.acm-table th,
.acm-table td {
  border: 1px solid var(--erp-border, #e5e7eb);
  padding: 8px 10px;
}

/* Corner cell */
.acm-th-corner {
  background: var(--erp-bg-card);
  text-align: left;
  font-weight: 700;
  min-width: 180px;
  vertical-align: middle;
}

.acm-corner-label {
  color: var(--erp-text-secondary, #64748b);
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Group header (Console Section) */
.acm-th-group {
  background: var(--erp-bg-hover, #f1f5f9);
  text-align: center;
  font-weight: 700;
  font-size: 0.78rem;
  color: var(--erp-text-primary, #1e293b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Module headers */
.acm-th-module {
  background: var(--erp-bg-hover, #f1f5f9);
  text-align: center;
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--erp-text-secondary, #475569);
  white-space: nowrap;
  min-width: 90px;
}

/* Role rows */
.acm-row:hover {
  background: rgba(59, 130, 246, 0.04);
}

.acm-td-role {
  font-weight: 600;
  color: var(--erp-text-primary, #1e293b);
  background: var(--erp-bg-card);
  min-width: 180px;
}

.acm-role-name {
  font-weight: 700;
  font-size: 0.82rem;
  color: var(--erp-text-primary, #1e293b);
}

.acm-role-caption {
  font-size: 0.68rem;
  font-weight: 400;
  color: var(--erp-text-muted, #94a3b8);
  margin-top: 1px;
}

/* Access cells */
.acm-td-access {
  text-align: center;
  vertical-align: middle;
}

.acm-td-clickable {
  cursor: pointer;
  transition: background 0.15s;
}

.acm-td-clickable:hover {
  background: rgba(59, 130, 246, 0.08) !important;
}

.acm-td-clickable:hover .acm-icon-allow {
  transform: scale(1.15);
  transition: transform 0.1s;
}

.acm-td-clickable:hover .acm-icon-deny {
  transform: scale(1.15);
  opacity: 1;
  transition: transform 0.1s, opacity 0.1s;
}

.acm-icon-allow {
  color: #16a34a;
  transition: transform 0.1s;
}

.acm-icon-deny {
  color: #dc2626;
  opacity: 0.65;
  transition: transform 0.1s, opacity 0.1s;
}

/* ── Edit Access Dialog ── */
.acm-dialog-card {
  background: var(--erp-bg-page, #f1f5f9);
}

.acm-edit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.acm-edit-table th,
.acm-edit-table td {
  border: 1px solid var(--erp-border, #e5e7eb);
  padding: 6px 10px;
}

.acm-et-section-th {
  background: var(--erp-bg-hover, #f1f5f9);
  font-weight: 700;
  font-size: 0.78rem;
  color: var(--erp-text-secondary, #475569);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  width: 200px;
}

.acm-et-feature-th {
  background: var(--erp-bg-hover, #f1f5f9);
  font-weight: 700;
  font-size: 0.78rem;
  color: var(--erp-text-secondary, #475569);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.acm-et-access-th {
  background: var(--erp-bg-hover, #f1f5f9);
  font-weight: 700;
  font-size: 0.78rem;
  color: var(--erp-text-secondary, #475569);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-align: center;
  width: 80px;
}

.acm-et-section-row td {
  background: var(--erp-bg-card);
}

.acm-et-section-cell {
  vertical-align: top;
  padding-top: 10px !important;
  border-left: 3px solid #3b82f6;
}

.acm-et-section-name {
  font-weight: 700;
  font-size: 0.84rem;
  color: var(--erp-text-primary, #1e293b);
}

.acm-et-toggle-cell {
  background: rgba(59, 130, 246, 0.04);
}

.acm-et-feature-row:hover td {
  background: rgba(59, 130, 246, 0.03);
}

.acm-et-feature-cell {
  padding-left: 16px !important;
}

.acm-et-feature-name {
  font-weight: 500;
  font-size: 0.8rem;
  color: var(--erp-text-primary, #1e293b);
}

.acm-et-feature-code {
  font-size: 0.68rem;
  color: var(--erp-text-muted, #94a3b8);
  font-family: monospace;
}

.acm-et-check-cell {
  text-align: center;
  vertical-align: middle;
}
</style>
