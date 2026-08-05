import { boot } from 'quasar/wrappers'
import { watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { canAccessRoute } from '../config/roles'
import { hasPermission, hasModuleAccess } from '../core/rbac/permissions'

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

// ── Inactivity Timeout ─────────────────────────────────────────────────────
// Shared POS terminals must sign out idle users automatically.
// 30 minutes of inactivity → sign out and redirect to login.
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000
let inactivityTimer: ReturnType<typeof setTimeout> | null = null

function resetInactivityTimer(authStore: ReturnType<typeof useAuthStore>) {
  if (inactivityTimer) clearTimeout(inactivityTimer)
  if (!authStore.isAuthenticated) return
  inactivityTimer = setTimeout(() => {
    authStore.signOut()
  }, INACTIVITY_TIMEOUT_MS)
}

function startInactivityWatcher(authStore: ReturnType<typeof useAuthStore>) {
  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']
  const handler = () => resetInactivityTimer(authStore)
  events.forEach((e) => window.addEventListener(e, handler, { passive: true }))
  resetInactivityTimer(authStore)
}
// ─────────────────────────────────────────────────────────────────────────────

export default boot(async ({ router }) => {
  const authStore = useAuthStore()

  // Initialize auth — fast: just checks session + fetches roles
  await authStore.initialize()

  // Start inactivity watcher after auth is ready (only in browser, not SSR)
  if (typeof window !== 'undefined') {
    startInactivityWatcher(authStore)

    // Re-arm the inactivity timer whenever the user (re-)authenticates.
    // Without this, a logout clears the timer and a subsequent re-login on the
    // same shared terminal would run without an idle-timeout.
    watch(
      () => authStore.isAuthenticated,
      (val) => {
        if (val) resetInactivityTimer(authStore)
      },
    )
  }

  router.beforeEach(async (to, from) => {
    // Make sure we have the latest session
    if (!authStore.initialized) {
      await authStore.initialize()
    }

    const requiresAuth = to.matched.some((r) => r.meta.requiresAuth)

    // ── QR / table-session back-navigation trap ─────────────────────────────
    // A customer's browser back-button can walk past the QR flow (which uses
    // router.replace() and therefore never pushes history entries) straight
    // into whatever ERP page was open on that device before the QR scan —
    // typically the staff login screen. If the browser is actually coming
    // FROM the customer touch-menu flow (not just "has a stale table-session
    // token lying around from an old visit"), send it back into the customer
    // flow instead of showing the ERP login page. Scoping this to `from` (not
    // just localStorage) keeps staff able to load the ERP login/dashboard
    // directly on any device, even one that previously ran a table session.
    if (requiresAuth && !authStore.isAuthenticated && typeof window !== 'undefined') {
      const cameFromTouchFlow =
        from.path.startsWith('/touch') ||
        from.path.startsWith('/table/') ||
        from.path.startsWith('/customer/') ||
        from.path.startsWith('/c/')
      const hasTableSession = !!localStorage.getItem('tm_session_token')
      if (cameFromTouchFlow && hasTableSession) {
        return '/touch'
      }
    }

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
    const hasOperationalRole = authStore.roles.some((r: string) => ['kitchen', 'cashier', 'waiter'].includes(r))
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
      // Loop-safe deny: never redirect a blocked route back to itself (that
      // causes Vue Router's "infinite redirection" abort). If the landing page
      // IS the blocked route, send to /unauthorized instead.
      const denyTo = () => {
        const landing = authStore.defaultLandingPage || '/unauthorized'
        return landing === to.path ? '/unauthorized' : landing
      }
      // 1. Collect ALL role requirement sets across matched records.
      // A parent's roles AND a child's roles must both be satisfied.
      const requiredRoleSets = to.matched
        .filter((r) => Array.isArray(r.meta.roles) && r.meta.roles.length)
        .map((r) => r.meta.roles as string[])

      let passesRoleCheck = true

      if (requiredRoleSets.length > 0) {
        // C7 — Never trust cached roles for privileged routes.
        // If any required set names a privileged role and roles are not yet
        // server-verified, force a synchronous revalidation before deciding.
        const PRIVILEGED = ['admin', 'super_admin', 'manager', 'finance', 'hr']
        const touchesPrivileged = requiredRoleSets.some((set) =>
          set.some((role) => PRIVILEGED.includes(role)),
        )
        if (touchesPrivileged && !authStore.rolesVerified) {
          await authStore._backgroundRefreshUserData()
          
          // IMPORTANT: If background refresh triggered a token refresh failure (e.g. invalid refresh token),
          // the session might have been cleared. If we're no longer authenticated, kick to login immediately
          // instead of proceeding to /unauthorized.
          if (!authStore.isAuthenticated) {
            return { path: '/auth/login', query: { redirect: to.fullPath } }
          }
        }

        // User must satisfy every set (at least one role from each).
        passesRoleCheck = requiredRoleSets.every((set) =>
          set.some((role) => authStore.roles.includes(role as import('../stores/auth').UserRole)),
        )
      }

      // 2. Check meta.permission / meta.module via centralized RBAC. These
      // also serve as a SUBSTITUTE for a missing role: if an admin explicitly
      // granted this user a custom permission (via /admin/roles →
      // user_permissions) matching this route's module/permission, that grant
      // must be able to let them in even without the role. Previously the
      // role check above denied immediately on failure, so a custom grant
      // with no matching role did NOTHING for any route with meta.roles set
      // (i.e. almost every module route) — the admin's "grant access to a
      // specific section" UI was silently non-functional.
      const requiredPermission = to.matched
        .map((r) => r.meta.permission as string | undefined)
        .filter(Boolean)
        .pop()
      const requiredModule = to.matched
        .map((r) => r.meta.module as string | undefined)
        .filter(Boolean)
        .pop()

      const passesPermissionCheck =
        !requiredPermission ||
        hasPermission(authStore.roles, requiredPermission, authStore.permissions || [])
      const passesModuleCheck =
        !requiredModule || hasModuleAccess(authStore.roles, requiredModule, authStore.permissions || [])
      const hasCustomGrant = (requiredPermission || requiredModule) ? (passesPermissionCheck && passesModuleCheck) : false

      if (!passesRoleCheck && !hasCustomGrant) {
        return denyTo()
      }
      if (passesRoleCheck && (!passesPermissionCheck || !passesModuleCheck)) {
        return denyTo()
      }

      // 4. Check centralized config (legacy route ACL table) — skipped when
      // the role check failed but a custom permission grant let the user in
      // above (this legacy check only understands roles + colon-format codes,
      // so it would otherwise re-deny a dot-format custom grant that just
      // correctly passed steps 1-3).
      if (passesRoleCheck && !canAccessRoute(authStore.roles, to.path, authStore.permissions)) {
        return denyTo()
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
