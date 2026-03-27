import { boot } from 'quasar/wrappers'
import { useAuthStore } from 'src/stores/auth'
import { canAccessRoute } from 'src/config/roles'
import { supabase } from 'src/boot/supabase'

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
      // Check route meta roles
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
          if (to.path === authStore.defaultLandingPage) return '/profile'
          return authStore.defaultLandingPage || '/dashboard'
        }
      }

      // Check centralized config
      if (!canAccessRoute(authStore.roles, to.path, authStore.permissions)) {
        if (to.path === authStore.defaultLandingPage) return '/profile'
        return authStore.defaultLandingPage || '/dashboard'
      }
    }

    // Allow navigation (return nothing = proceed)
  })
})

