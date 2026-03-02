import { boot } from 'quasar/wrappers'
import { useAuthStore } from 'src/stores/auth'
import { canAccessRoute } from 'src/config/roles'
import { supabase } from 'src/boot/supabase'

export default boot(async ({ router }) => {
  const authStore = useAuthStore()

  // Initialize auth — fast: just checks session + fetches roles
  await authStore.initialize()

  router.beforeEach(async (to, _from, next) => {
    // Make sure we have the latest session
    if (!authStore.initialized) {
      await authStore.initialize()
    }

    const requiresAuth = to.matched.some((r) => r.meta.requiresAuth)

    // Not authenticated → login
    if (requiresAuth && !authStore.isAuthenticated) {
      return next({ path: '/auth/login', query: { redirect: to.fullPath } })
    }

    // Already authenticated → skip login page
    if (to.path === '/auth/login' && authStore.isAuthenticated) {
      return next(authStore.defaultLandingPage || '/dashboard')
    }

    // Role-based guard
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
          if (to.path === authStore.defaultLandingPage) return next('/profile')
          return next(authStore.defaultLandingPage || '/dashboard')
        }
      }

      // Check centralized config
      if (!canAccessRoute(authStore.roles, to.path, authStore.permissions)) {
        if (to.path === authStore.defaultLandingPage) return next('/profile')
        return next(authStore.defaultLandingPage || '/dashboard')
      }
    }

    next()
  })
})
