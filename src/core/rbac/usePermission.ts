// ═══════════════════════════════════════════════════════════════════
// PERMISSION COMPOSABLE — Template-Level Permission Checks
// Seven Waves ERP — Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

import { computed } from 'vue'
import { useAuthStore } from 'src/stores/auth'
import { hasPermission, hasModuleAccess, getEffectivePermissions } from './permissions'

/**
 * Composable for checking permissions in Vue components.
 *
 * Usage:
 *   const { can, canModule, isRole } = usePermission()
 *
 *   // In template:
 *   <q-btn v-if="can('pos.order.void')" label="Void Order" />
 *   <q-btn v-if="can('finance.journal.post')" label="Post Journal" />
 *   <div v-if="canModule('finance')">Finance Section</div>
 */
export function usePermission() {
  const authStore = useAuthStore()

  /** Check if user has a specific permission */
  const can = (permission: string): boolean => {
    return hasPermission(authStore.roles, permission, authStore.permissions)
  }

  /** Check if user has access to a module */
  const canModule = (module: string): boolean => {
    return hasModuleAccess(authStore.roles, module, authStore.permissions)
  }

  /** Check if user has a specific role */
  const isRole = (role: string): boolean => {
    return authStore.roles.includes(role as any)
  }

  /** Check if user has any of the specified roles */
  const hasAnyRole = (roles: string[]): boolean => {
    return roles.some((r) => authStore.roles.includes(r as any))
  }

  /** Reactive: all effective permissions (for debug/admin) */
  const allPermissions = computed(() => {
    return getEffectivePermissions(authStore.roles, authStore.permissions)
  })

  /** Reactive: is admin */
  const isAdmin = computed(() => authStore.isAdmin)

  /** Reactive: current user roles */
  const roles = computed(() => authStore.roles)

  return {
    can,
    canModule,
    isRole,
    hasAnyRole,
    allPermissions,
    isAdmin,
    roles,
  }
}
