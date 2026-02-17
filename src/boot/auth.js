import { boot } from 'quasar/wrappers'
import { useAuthStore } from 'stores/auth'

export default boot(async ({ router, store }) => {
  const authStore = useAuthStore(store)

  // Initialize auth state (check existing session)
  try {
    await authStore.initialize()
  } catch (error) {
    console.error('Auth initialization failed:', error)
  }

  router.beforeEach((to, from, next) => {
    if (!authStore.initialized) {
      console.warn('Router guard called before auth initialized')
      return next()
    }

    // Check if the route requires authentication
    const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
    if (requiresAuth && !authStore.isAuthenticated) {
      console.log('Redirecting to login - user not authenticated')
      return next({ path: '/auth/login', query: { redirect: to.fullPath } })
    }

    // Prevent authenticated users from visiting login page
    if (to.path === '/auth/login' && authStore.isAuthenticated) {
      console.log('Redirecting to landing page - user already authenticated')
      return next(authStore.defaultLandingPage)
    }

    // Role-based route guard
    // Collect roles from matched route records (child meta inherits from parent)
    const requiredRoles = to.matched.reduce((roles, record) => {
      if (record.meta.roles && record.meta.roles.length) {
        return record.meta.roles
      }
      return roles
    }, [])

    if (requiredRoles.length > 0 && authStore.isAuthenticated) {
      // Admin bypasses all role checks
      if (authStore.isAdmin) {
        return next()
      }

      const hasAccess = requiredRoles.some((role) => authStore.roles.includes(role))
      if (!hasAccess) {
        console.log(
          `Access denied to ${to.path} — user roles: ${authStore.roles}, required: ${requiredRoles}`,
        )
        return next(authStore.defaultLandingPage)
      }
    }

    next()
  })
})
