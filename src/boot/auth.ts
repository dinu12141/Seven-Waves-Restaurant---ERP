import { boot } from 'quasar/wrappers'
import { useAuthStore } from 'src/stores/auth'
import { canAccessRoute } from 'src/config/roles'
import { hasPermission, hasModuleAccess } from 'src/core/rbac/permissions'

// ── Branch Access Guard ────────────────────────────────────────────────────
/**
 * Verify that the authenticated user has access to the branch they are
 * currently operating from.
 *
 * Rules:
 *  - Admin always passes (cross-branch access allowed).
 *  - If the user has no branches loaded, block (no branch = no access).
 *  - If the route does NOT require branch isolation (meta.requiresBranchAccess
 *    is false/absent), skip the check — this keeps auth/profile/public routes
 *    working without a branch.
 *  - Otherwise verify that `authStore.currentBranch` exists (i.e. the user
 *    is assigned to at least one active branch in branch_users).
 *
 * @param authStore - The hydrated auth store
 * @param requiresBranchAccess - from route meta (defaults to true for all
 *                                requiresAuth routes under MainLayout)
 */
function checkBranchAccess(
  authStore: ReturnType<typeof useAuthStore>,
  requiresBranchAccess: boolean,
): boolean {
  // Admins always have full cross-branch access
  if (authStore.isAdmin) return true

  // Route explicitly opts out of branch isolation
  if (!requiresBranchAccess) return true

  // User must have an active branch resolved
  const branch = authStore.currentBranch
  if (!branch) {
    // No branch resolved — user has no branch_users rows or all are inactive
    return false
  }

  // Branch must be active
  if (branch.is_active === false) return false

  return true
}

export default boot(async ({ router }) => {
  const authStore = useAuthStore()

  // Initialize auth — fast: just checks session + fetches roles
  await authStore.initialize()

  router.beforeEach(async (to) => {
    // Make sure we have the latest session
    if (!authStore.initialized) {
      await authStore.initialize()
    }

    const requiresAuth = to.matched.some((r) => r.meta.requiresAuth)

    // Not authenticated → login
    if (requiresAuth && !authStore.isAuthenticated) {
      return { path: '/auth/login', query: { redirect: to.fullPath } }
    }

    // Already authenticated → skip login page
    if (to.path === '/auth/login' && authStore.isAuthenticated) {
      return authStore.defaultLandingPage || '/dashboard'
    }

    // ── Manager-only guard ────────────────────────────────────────────────
    // Pure managers (no admin role AND no operational roles like kitchen/cashier/waiter)
    // can ONLY access /manager-app.
    // Any attempt to reach a MainLayout ERP route is blocked → /manager-app.
    const hasOperationalRole = authStore.roles.some(r => ['kitchen', 'cashier', 'waiter'].includes(r))
    const isPureManager =
      authStore.isAuthenticated &&
      authStore.roles.includes('manager') &&
      !authStore.roles.includes('admin') &&
      !hasOperationalRole

    if (isPureManager) {
      // Allow: /manager-app/**, /auth/login, /auth/**, public routes
      const isManagerRoute = to.path.startsWith('/manager-app')
      const isAuthRoute = to.path.startsWith('/auth')
      const isPublicRoute = !to.matched.some((r) => r.meta.requiresAuth)

      if (!isManagerRoute && !isAuthRoute && !isPublicRoute) {
        // Blocked — send them back where they belong
        return '/manager-app'
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    // Role-based guard (for non-manager, non-admin roles)
    if (requiresAuth && authStore.isAuthenticated && !authStore.isAdmin) {
      // 1. Check route meta roles
      const requiredRoles = to.matched.reduce<string[]>((roles, record) => {
        if (record.meta.roles && Array.isArray(record.meta.roles)) {
          return record.meta.roles
        }
        return roles
      }, [])

      if (requiredRoles.length > 0) {
        // @ts-ignore
        const hasAccess = requiredRoles.some((role) => authStore.roles.includes(role))
        if (!hasAccess) {
          return '/unauthorized'
        }
      }

      // 2. Check meta.permission via centralized RBAC hasPermission()
      const requiredPermission = to.matched
        .map((r) => r.meta.permission as string | undefined)
        .filter(Boolean)
        .pop()

      if (requiredPermission) {
        // @ts-ignore
        const permitted = hasPermission(authStore.roles, requiredPermission, authStore.permissions || [])
        if (!permitted) {
          return '/unauthorized'
        }
      }

      // 3. Check meta.module for module-level access
      const requiredModule = to.matched
        .map((r) => r.meta.module as string | undefined)
        .filter(Boolean)
        .pop()

      if (requiredModule) {
        // @ts-ignore
        const moduleAllowed = hasModuleAccess(authStore.roles, requiredModule)
        if (!moduleAllowed) {
          return '/unauthorized'
        }
      }

      // 4. Check centralized config (legacy route ACL table)
      if (!canAccessRoute(authStore.roles, to.path, authStore.permissions)) {
        return '/unauthorized'
      }
    }

    // ── Branch Access Guard ───────────────────────────────────────────────
    // Only enforce for authenticated routes under MainLayout (requiresAuth = true).
    // Standalone PWA routes (/waiter-app, /manager-app, /delivery-app) are
    // covered by their own layout auth, so we skip non-main-layout routes.
    //
    // A route opts OUT by setting: meta.requiresBranchAccess = false
    // A route opts IN (default) by having requiresAuth = true and no override.
    if (requiresAuth && authStore.isAuthenticated) {
      // Determine if this route requires branch-level access check.
      // Standalone PWA layouts and public-facing routes opt out.
      const isStandalonePwa =
        to.path.startsWith('/waiter-app') ||
        to.path.startsWith('/manager-app') ||
        to.path.startsWith('/delivery-app')

      // Explicit opt-out or standalone PWA = skip branch check
      const routeOptOut = to.matched.some((r) => r.meta.requiresBranchAccess === false)
      const skipBranchCheck = isStandalonePwa || routeOptOut

      if (!skipBranchCheck) {
        const branchOk = checkBranchAccess(authStore, true)
        if (!branchOk) {
          // User has no active branch — redirect to unauthorized with context
          console.warn('[Auth] Branch access denied for path:', to.path, '| currentBranch:', authStore.currentBranch)
          return '/unauthorized'
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    // Allow navigation (return nothing = proceed)
  })
})
