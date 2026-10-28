// ═══════════════════════════════════════════════════════════════════
// Route access evaluation — the single source of truth for the
// role / permission / module / legacy-ACL decision made by the router
// guard (src/boot/auth.ts). Also used by the sidebar (MainLayout) so a
// nav link is only shown when the guard would actually let the user in
// (previously the sidebar filtered on roles only, producing "dead" links
// that bounced the user straight back to their landing page).
// ═══════════════════════════════════════════════════════════════════

import type { UserRole } from '../../stores/auth'
import { hasPermission, hasModuleAccess } from './permissions'
import { canAccessRoute } from '../../config/roles'

export interface RouteRecordLike {
  meta?: Record<string, unknown> | undefined
}

export interface RouteAccessResult {
  allowed: boolean
  /** Which layer denied (for diagnostics / tests). */
  reason?: 'role' | 'permission' | 'legacy'
}

/** Role sets declared on every matched record (parent AND child must pass). */
export function getRequiredRoleSets(matched: RouteRecordLike[]): string[][] {
  return matched
    .filter((r) => Array.isArray(r.meta?.roles) && (r.meta?.roles as string[]).length)
    .map((r) => r.meta?.roles as string[])
}

/**
 * Decide whether a NON-admin user may enter a route. Admins are always
 * allowed (callers may short-circuit before calling this).
 *
 * Semantics (unchanged from the original inline guard):
 *  1. Every role set on the matched chain must contain one of the user's roles.
 *  2. The innermost meta.permission / meta.module must pass RBAC. An explicit
 *     custom grant matching the route's permission+module can SUBSTITUTE for
 *     a failed role check.
 *  3. When the role check passed, the legacy route ACL (canAccessRoute) must
 *     also allow the path.
 */
export function evaluateRouteAccess(
  roles: UserRole[],
  permissions: string[],
  matched: RouteRecordLike[],
  path: string,
): RouteAccessResult {
  if (roles.includes('admin')) return { allowed: true }

  const requiredRoleSets = getRequiredRoleSets(matched)
  const passesRoleCheck =
    requiredRoleSets.length === 0 ||
    requiredRoleSets.every((set) => set.some((role) => roles.includes(role as UserRole)))

  const requiredPermission = matched
    .map((r) => r.meta?.permission as string | undefined)
    .filter(Boolean)
    .pop()
  const requiredModule = matched
    .map((r) => r.meta?.module as string | undefined)
    .filter(Boolean)
    .pop()

  const passesPermissionCheck = !requiredPermission || hasPermission(roles, requiredPermission, permissions)
  const passesModuleCheck = !requiredModule || hasModuleAccess(roles, requiredModule, permissions)
  const hasCustomGrant =
    requiredPermission || requiredModule ? passesPermissionCheck && passesModuleCheck : false

  if (!passesRoleCheck && !hasCustomGrant) return { allowed: false, reason: 'role' }
  if (passesRoleCheck && (!passesPermissionCheck || !passesModuleCheck)) {
    return { allowed: false, reason: 'permission' }
  }
  if (passesRoleCheck && !canAccessRoute(roles, path, permissions)) {
    return { allowed: false, reason: 'legacy' }
  }
  return { allowed: true }
}
