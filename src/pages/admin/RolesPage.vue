<template>
  <q-page class="acm-page q-pa-lg">
    <PageHeader
      title="Access Control Matrix"
      subtitle="Configure role-based module access and fine-grained permissions"
      show-back
      back-route="/admin"
    />

    <!-- Role-Module Access Matrix -->
    <div class="acm-matrix-card q-mt-lg">
      <!-- Controls Bar -->
      <div v-if="matrixDirty" class="acm-controls">
        <div class="acm-controls__label">
          <q-icon name="warning_amber" size="14px" />
          Unsaved changes to access matrix
        </div>
        <q-btn flat dense no-caps icon="undo" label="Discard" class="acm-btn-ghost q-mr-sm" @click="discardMatrixChanges" />
        <q-btn unelevated dense no-caps icon="save" label="Save Matrix" class="acm-btn-primary" :loading="matrixSaving" @click="saveRoleModuleAccess" />
      </div>
      <div v-else class="acm-controls">
        <div class="acm-controls__label">
          <q-icon name="grid_view" size="14px" />
          Role × Module Access Overview
        </div>
        <span class="acm-hint">
          <q-icon name="touch_app" size="12px" />
          Click any cell to toggle access
        </span>
      </div>

      <!-- Scrollable Matrix -->
      <div class="acm-scroll-container">
        <div class="acm-table-wrap">
          <table class="acm-table">
            <thead>
              <tr>
                <th class="acm-th-corner" rowspan="2">
                  <span class="acm-corner-label">Role / Module</span>
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
                <td
                  class="acm-td-role"
                  :style="{
                    borderLeftColor: ({
                      admin: '#dc2626', super_admin: '#dc2626',
                      manager: '#8b5cf6', regional_manager: '#8b5cf6',
                      waiter: '#f97316',
                      cashier: '#3b82f6',
                      kitchen: '#ef4444',
                      finance: '#3b82f6',
                      hr: '#8b5cf6',
                      inventory: '#22c55e',
                      delivery: '#14b8a6',
                      procurement: '#f59e0b'
                    })[role.key] || '#8b5cf6'
                  }"
                >
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
      </div>
    </div>

    <!-- Users Access List -->
    <div class="acm-users-card q-mt-lg">
      <div class="acm-users-toolbar">
        <q-input dense outlined v-model="search" placeholder="Search users by name or email..." clearable class="acm-search">
          <template #prepend><q-icon name="search" size="16px" /></template>
        </q-input>
        <span class="acm-users-hint">* Higher roles inherit standard permissions. Use Edit Access for granular control.</span>
      </div>

      <q-table
        :rows="filteredUsers"
        :columns="columns"
        row-key="id"
        :loading="loading"
        flat
        :pagination="{ rowsPerPage: 10 }"
        class="acm-users-table"
      >
        <template #body-cell-roles="props">
          <q-td :props="props">
            <div class="acm-roles-cell">
              <span
                v-for="role in props.row.user_roles"
                :key="role.role_id"
                class="acm-role-chip"
              >
                {{ role.roles?.name?.toUpperCase() }}
              </span>
              <span v-if="!props.row.user_roles?.length" class="acm-no-roles">No roles</span>
            </div>
          </q-td>
        </template>

        <template #body-cell-permissions="props">
          <q-td :props="props">
            <template v-if="isAdmin(props.row)">
              <span class="acm-perm-admin">
                <q-icon name="verified_user" size="13px" class="q-mr-xs" />Full Admin Access
              </span>
            </template>
            <template v-else>
              <span v-if="props.row.user_permissions?.length" class="acm-perm-custom">
                {{ props.row.user_permissions.length }} custom access points
              </span>
              <span v-else class="acm-perm-standard">Standard role access</span>
            </template>
          </q-td>
        </template>

        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn unelevated no-caps icon="security" label="Edit Access" size="sm" class="acm-edit-btn" @click="editUserAccess(props.row)" />
          </q-td>
        </template>

        <template #loading>
          <q-inner-loading showing color="purple-6" />
        </template>
      </q-table>
    </div>

    <!-- Manage User Access Dialog -->
    <q-dialog
      v-model="dialogVisible"
      persistent
      maximized
      transition-show="slide-up"
      transition-hide="slide-down"
    >
      <q-card class="acm-dialog-card">
        <div class="acm-dialog-header">
          <div class="acm-dialog-header__icon">
            <q-icon name="security" size="20px" />
          </div>
          <div>
            <div class="acm-dialog-title">Manage Access — {{ selectedUser?.full_name }}</div>
            <div class="acm-dialog-sub">Configure roles and fine-grained permissions</div>
          </div>
          <q-btn flat round dense icon="close" class="acm-dialog-close" v-close-popup />
        </div>

        <div class="acm-dialog-body">
          <!-- Role Selector Row -->
          <div class="acm-dialog-row q-mb-lg">
            <div class="acm-roles-panel">
              <div class="acm-panel-title">
                <q-icon name="group" size="15px" class="q-mr-xs" />Primary Roles
              </div>
              <div class="acm-panel-sub">Select roles to auto-assign default module permissions</div>
              <div class="acm-roles-grid">
                <div v-for="role in allRoles" :key="role.id">
                  <q-item tag="label" v-ripple dense class="acm-role-label rounded-borders">
                    <q-item-section avatar>
                      <q-checkbox
                        v-model="form.roleIds"
                        :val="role.id"
                        color="purple-6"
                        @update:model-value="onRoleToggled($event, role)"
                      />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="acm-role-item-name">{{ role.name.toUpperCase() }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </div>
              </div>
            </div>

            <div class="acm-info-panel">
              <div
                v-if="form.roleIds.some((id) => allRoles.find((r) => r.id === id)?.name === 'admin')"
                class="acm-admin-banner"
              >
                <q-icon name="verified_user" size="22px" class="q-mr-sm" style="flex-shrink:0" />
                <div>
                  <div class="acm-admin-banner__title">Admin Role Active</div>
                  <div class="acm-admin-banner__desc">Grants <strong>full access</strong> to all modules and features</div>
                </div>
              </div>
              <div v-else class="acm-info-hint">
                <q-icon name="info_outline" size="16px" class="q-mr-sm" style="flex-shrink:0;color:#8b5cf6" />
                <div>Select roles on the left to auto-enable default permissions, then fine-tune individual features in the matrix below.</div>
              </div>
            </div>
          </div>

          <!-- Permission Matrix -->
          <div class="acm-perm-matrix-card">
            <div class="acm-perm-matrix-header">
              <div class="acm-perm-matrix-title">
                <q-icon name="grid_view" size="15px" class="q-mr-xs" />Feature Access Matrix
              </div>
              <span class="acm-perm-count-badge">{{ form.permissionCodes.length }} permissions enabled</span>
            </div>

            <div class="acm-scroll-container">
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
                    <tr class="acm-et-section-row">
                      <td class="acm-et-section-cell" :rowspan="section.perms.length + 1">
                        <div class="acm-et-section-inner">
                          <q-icon
                            :name="section.icon"
                            size="16px"
                            :style="{ color: sectionHasAnyAccess(section) ? '#8b5cf6' : 'var(--erp-text-muted)' }"
                          />
                          <div class="acm-et-section-name">{{ section.label }}</div>
                        </div>
                      </td>
                      <td class="acm-et-toggle-cell" colspan="2">
                        <div class="acm-et-toggle-row">
                          <span class="acm-et-toggle-label">Toggle all features in this module</span>
                          <q-toggle
                            :model-value="sectionHasAllAccess(section)"
                            @update:model-value="toggleSection(section, $event)"
                            color="purple-6"
                            dense
                          />
                        </div>
                      </td>
                    </tr>
                    <tr v-for="perm in section.perms" :key="perm.code" class="acm-et-feature-row">
                      <td class="acm-et-feature-cell">
                        <div class="acm-et-feature-name">{{ perm.description || perm.code }}</div>
                        <div class="acm-et-feature-code">{{ perm.code }}</div>
                      </td>
                      <td class="acm-et-check-cell">
                        <q-checkbox v-model="form.permissionCodes" :val="perm.code" color="green-7" dense />
                      </td>
                    </tr>
                  </template>

                  <tr v-if="dialogSections.length === 0">
                    <td colspan="3">
                      <div class="acm-empty">
                        <div class="acm-empty__icon"><q-icon name="lock_outline" size="32px" /></div>
                        <div class="acm-empty__title">No permissions defined</div>
                        <div class="acm-empty__sub">No permission entries found in the system</div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="acm-dialog-footer">
          <q-btn flat no-caps label="Cancel" class="acm-btn-ghost" v-close-popup />
          <q-btn
            unelevated no-caps icon="save" label="Save Access Settings"
            class="acm-btn-primary acm-btn-primary--lg"
            :loading="saving"
            @click="saveUserAccess"
          />
        </div>
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

<style scoped lang="scss">
.acm-page {
  background: var(--erp-bg-page);
  min-height: 100vh;
}

// ── Matrix Card ────────────────────────────────────────────
.acm-matrix-card {
  background: var(--erp-bg-card) !important;
  border: 1px solid var(--erp-border) !important;
  border-radius: var(--erp-radius-lg) !important;
  overflow: hidden;
}

// Controls bar
.acm-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: rgba(245, 158, 11, 0.04);
  border-bottom: 1px solid rgba(245, 158, 11, 0.2);
}

.acm-controls__label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #d97706;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.acm-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--erp-bg-page);
  border: 1px solid var(--erp-border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.75rem;
  color: var(--erp-text-muted);
}

// Scroll container
.acm-scroll-container {
  overflow-x: auto;
  padding: 0;
}

.acm-table-wrap {
  min-width: 800px;
}

// Matrix Table
.acm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.acm-th-corner {
  background: var(--erp-bg-page);
  border-right: 2px solid var(--erp-border);
  border-bottom: 2px solid var(--erp-border);
  min-width: 140px;
  padding: 12px 16px;
  text-align: left;
}

.acm-corner-label {
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--erp-text-muted);
  text-transform: uppercase;
  letter-spacing: 1.5px;
}

.acm-th-group {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(109, 40, 217, 0.04));
  text-align: center;
  padding: 10px 16px;
  font-size: 0.7rem;
  font-weight: 800;
  color: #8b5cf6;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  border-bottom: 1px solid var(--erp-border);
}

.acm-th-module {
  background: var(--erp-bg-page);
  text-align: center;
  padding: 8px 6px;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--erp-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-right: 1px solid var(--erp-border);
  border-bottom: 2px solid var(--erp-border);
  white-space: nowrap;
  min-width: 72px;
}

.acm-row:hover .acm-td-access {
  background: rgba(139, 92, 246, 0.03);
}

.acm-td-role {
  background: var(--erp-bg-page);
  padding: 12px 16px;
  border-right: 2px solid var(--erp-border);
  border-bottom: 1px solid var(--erp-border);
  border-left: 3px solid transparent;
  position: sticky;
  left: 0;
  z-index: 1;
}

.acm-role-name {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--erp-text-primary);
  text-transform: capitalize;
}

.acm-role-caption {
  font-size: 0.72rem;
  color: var(--erp-text-muted);
  margin-top: 2px;
}

.acm-td-access {
  text-align: center;
  padding: 10px 6px;
  border-right: 1px solid var(--erp-border);
  border-bottom: 1px solid var(--erp-border);
  transition: background 0.15s;
  vertical-align: middle;
}

.acm-td-clickable {
  cursor: pointer;

  &:hover {
    background: rgba(139, 92, 246, 0.06) !important;
  }

  &:active {
    background: rgba(139, 92, 246, 0.12) !important;
  }

  &:hover .acm-icon-allow,
  &:hover .acm-icon-deny {
    transform: scale(1.15);
    transition: transform 0.1s;
  }
}

.acm-icon-allow {
  color: var(--erp-success) !important;
  transition: transform 0.1s;
}

.acm-icon-deny {
  color: var(--erp-border) !important;
  opacity: 0.5;
  transition: transform 0.1s, opacity 0.1s;
}

// ── Users Card ─────────────────────────────────────────────
.acm-users-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg);
  overflow: hidden;
}

.acm-users-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 18px;
  border-bottom: 1px solid var(--erp-border);
}

.acm-search {
  max-width: 360px;
}

.acm-users-hint {
  font-size: 0.78rem;
  color: var(--erp-text-muted);
  font-style: italic;
  flex: 1;
  text-align: right;
}

.acm-users-table {
  background: transparent !important;
}

// Role chips in table
.acm-roles-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.acm-role-chip {
  display: inline-flex;
  align-items: center;
  background: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  font-family: monospace;
}

.acm-no-roles {
  font-size: 0.8rem;
  color: var(--erp-text-muted);
}

// Permission cells
.acm-perm-admin {
  display: inline-flex;
  align-items: center;
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 0.78rem;
  font-weight: 700;
}

.acm-perm-custom {
  font-size: 0.82rem;
  font-weight: 700;
  color: #8b5cf6;
}

.acm-perm-standard {
  font-size: 0.82rem;
  color: var(--erp-text-muted);
}

.acm-edit-btn {
  background: rgba(139, 92, 246, 0.1) !important;
  color: #8b5cf6 !important;
  border-radius: 7px !important;
  font-weight: 600 !important;

  &:hover {
    background: rgba(139, 92, 246, 0.18) !important;
  }
}

// ── Dialog ─────────────────────────────────────────────────
.acm-dialog-card {
  background: var(--erp-bg-page) !important;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.acm-dialog-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--erp-border);
  background: var(--erp-bg-card);
  border-left: 4px solid #8b5cf6;
  position: sticky;
  top: 0;
  z-index: 10;
  flex-shrink: 0;
}

.acm-dialog-header__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(139, 92, 246, 0.12);
  color: #8b5cf6;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.acm-dialog-title {
  font-size: 1rem;
  font-weight: 800;
  color: var(--erp-text-primary);
}

.acm-dialog-sub {
  font-size: 0.8rem;
  color: var(--erp-text-muted);
  margin-top: 2px;
}

.acm-dialog-close {
  margin-left: auto;
  color: var(--erp-text-muted) !important;
}

.acm-dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.acm-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--erp-border);
  background: var(--erp-bg-card);
  flex-shrink: 0;
}

// Dialog row layout
.acm-dialog-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

// Roles panel
.acm-roles-panel {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-card);
  padding: 16px;
}

.acm-panel-title {
  font-size: 0.82rem;
  font-weight: 800;
  color: var(--erp-text-primary);
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.acm-panel-sub {
  font-size: 0.76rem;
  color: var(--erp-text-muted);
  margin-bottom: 14px;
}

.acm-roles-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.acm-role-label {
  border: 1px solid var(--erp-border);
  border-radius: 6px;
  padding: 6px 8px !important;
  min-height: unset !important;

  &:hover {
    background: rgba(139, 92, 246, 0.04) !important;
    border-color: rgba(139, 92, 246, 0.2) !important;
  }
}

.acm-role-item-name {
  font-size: 0.75rem !important;
  font-weight: 700 !important;
  color: var(--erp-text-primary) !important;
  font-family: monospace;
}

// Info panel
.acm-info-panel {
  display: flex;
  align-items: flex-start;
}

.acm-admin-banner {
  display: flex;
  align-items: flex-start;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--erp-radius-card);
  padding: 16px;
  color: #d97706;
  width: 100%;
}

.acm-admin-banner__title {
  font-size: 0.9rem;
  font-weight: 800;
  margin-bottom: 4px;
}

.acm-admin-banner__desc {
  font-size: 0.8rem;
}

.acm-info-hint {
  display: flex;
  align-items: flex-start;
  background: rgba(139, 92, 246, 0.06);
  border: 1px solid rgba(139, 92, 246, 0.15);
  border-radius: var(--erp-radius-card);
  padding: 16px;
  font-size: 0.82rem;
  color: var(--erp-text-secondary);
  line-height: 1.5;
  width: 100%;
}

// Permission matrix in dialog
.acm-perm-matrix-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-card);
  overflow: hidden;
}

.acm-perm-matrix-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--erp-border);
}

.acm-perm-matrix-title {
  font-size: 0.88rem;
  font-weight: 800;
  color: var(--erp-text-primary);
  display: flex;
  align-items: center;
}

.acm-perm-count-badge {
  font-size: 0.75rem;
  font-weight: 700;
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 20px;
  padding: 3px 10px;
}

// Edit table (permission matrix in dialog)
.acm-edit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.acm-edit-table th,
.acm-edit-table td {
  border: 1px solid var(--erp-border);
  padding: 6px 10px;
}

.acm-et-section-th {
  background: var(--erp-bg-page);
  font-weight: 700;
  font-size: 0.72rem;
  color: var(--erp-text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  width: 200px;
}

.acm-et-feature-th {
  background: var(--erp-bg-page);
  font-weight: 700;
  font-size: 0.72rem;
  color: var(--erp-text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.acm-et-access-th {
  background: var(--erp-bg-page);
  font-weight: 700;
  font-size: 0.72rem;
  color: var(--erp-text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  text-align: center;
  width: 80px;
}

.acm-et-section-row td {
  background: var(--erp-bg-card);
}

.acm-et-section-cell {
  vertical-align: top;
  padding-top: 12px !important;
  border-left: 3px solid #8b5cf6;
}

.acm-et-section-inner {
  display: flex;
  align-items: center;
  gap: 8px;
}

.acm-et-section-name {
  font-weight: 700;
  font-size: 0.84rem;
  color: var(--erp-text-primary);
}

.acm-et-toggle-cell {
  background: rgba(139, 92, 246, 0.04);
}

.acm-et-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.acm-et-toggle-label {
  font-size: 0.78rem;
  color: var(--erp-text-muted);
  font-style: italic;
}

.acm-et-feature-row:hover td {
  background: rgba(139, 92, 246, 0.03);
}

.acm-et-feature-cell {
  padding-left: 16px !important;
}

.acm-et-feature-name {
  font-weight: 500;
  font-size: 0.8rem;
  color: var(--erp-text-primary);
}

.acm-et-feature-code {
  font-size: 0.68rem;
  color: var(--erp-text-muted);
  font-family: monospace;
}

.acm-et-check-cell {
  text-align: center;
  vertical-align: middle;
}

// Empty state
.acm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  gap: 10px;
}

.acm-empty__icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: rgba(139, 92, 246, 0.08);
  color: #8b5cf6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.acm-empty__title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--erp-text-secondary);
}

.acm-empty__sub {
  font-size: 0.82rem;
  color: var(--erp-text-muted);
}

// Shared buttons
.acm-btn-primary {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed) !important;
  color: #fff !important;
  border-radius: 8px !important;
  font-weight: 600 !important;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25) !important;
}

.acm-btn-primary--lg {
  min-width: 180px;
}

.acm-btn-ghost {
  border: 1px solid var(--erp-border) !important;
  color: var(--erp-text-secondary) !important;
  border-radius: 8px !important;
  font-weight: 600 !important;

  &:hover {
    border-color: #8b5cf6 !important;
    color: #8b5cf6 !important;
  }
}
</style>
