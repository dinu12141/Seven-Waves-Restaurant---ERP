// ═══════════════════════════════════════════════════════════════════
// RBAC PERMISSION SYSTEM — Fine-Grained Permission Checks
// Seven Waves ERP — Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

import type { UserRole } from 'src/stores/auth'

/**
 * Permission format: {module}.{resource}.{action}
 *
 * Examples:
 *   finance.journal.create
 *   finance.journal.post
 *   inventory.stock.adjust
 *   procurement.po.approve
 *   hr.payroll.run
 *   pos.order.void
 *   pos.order.discount
 *   admin.users.manage
 */

/** Role → default permissions mapping (database overrides this) */
const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'], // Admin has all permissions

  manager: [
    'pos.*', 'kitchen.*', 'inventory.*', 'finance.view',
    'finance.journal.create', 'procurement.*', 'hr.view',
    'hr.attendance.*', 'hr.shifts.*', 'reports.*',
    'crm.*', 'delivery.*', 'audit.view',
  ],

  finance: [
    'finance.*', 'procurement.view', 'procurement.ap.*',
    'procurement.payment.*', 'reports.finance.*', 'reports.sales.*',
    'audit.view',
  ],

  cashier: [
    'pos.order.create', 'pos.order.view', 'pos.payment.*',
    'pos.order.void', 'pos.receipt.*', 'crm.loyalty.redeem',
    'pos.shift.open', 'pos.shift.close', 'pos.shift.view',
    'pos.shift.cash_movement',
  ],

  waiter: [
    'pos.order.create', 'pos.order.view', 'kitchen.view',
    'pos.table.manage',
  ],

  kitchen: [
    'kitchen.*', 'inventory.stock.view',
  ],

  inventory: [
    'inventory.*', 'procurement.view', 'reports.inventory.*',
  ],

  procurement: [
    'procurement.*', 'inventory.view', 'finance.view',
    'reports.procurement.*',
  ],

  hr: [
    'hr.*', 'reports.hr.*', 'finance.payroll.view',
  ],

  delivery: [
    'delivery.*', 'pos.order.view',
  ],
}

/**
 * Check if a user with given roles and explicit permissions can perform an action.
 *
 * @param roles - User's assigned roles
 * @param permission - Required permission string (e.g., 'finance.journal.post')
 * @param explicitPermissions - Permissions loaded from database
 */
export function hasPermission(
  roles: UserRole[],
  permission: string,
  explicitPermissions: string[] = [],
): boolean {
  // 1. Admin always passes
  if (roles.includes('admin')) return true

  // 2. Check explicit (database) permissions first
  if (explicitPermissions.includes(permission)) return true
  if (explicitPermissions.includes('*')) return true

  // 3. Check role-based default permissions
  for (const role of roles) {
    const defaults = ROLE_DEFAULT_PERMISSIONS[role] || []

    for (const perm of defaults) {
      if (perm === '*') return true
      if (perm === permission) return true

      // Wildcard matching: 'pos.*' matches 'pos.order.create'
      if (perm.endsWith('.*')) {
        const prefix = perm.slice(0, -2)
        if (permission.startsWith(prefix)) return true
      }
    }
  }

  return false
}

/**
 * Check if a user can access a specific module.
 */
export function hasModuleAccess(
  roles: UserRole[],
  module: string,
  explicitPermissions: string[] = [],
): boolean {
  return hasPermission(roles, `${module}.view`, explicitPermissions) ||
         hasPermission(roles, `${module}.*`, explicitPermissions)
}

/**
 * Get all effective permissions for a user (for debugging/admin view).
 */
export function getEffectivePermissions(
  roles: UserRole[],
  explicitPermissions: string[] = [],
): string[] {
  const perms = new Set<string>(explicitPermissions)

  for (const role of roles) {
    const defaults = ROLE_DEFAULT_PERMISSIONS[role] || []
    defaults.forEach((p) => perms.add(p))
  }

  return Array.from(perms).sort()
}
