// ═══════════════════════════════════════════════════════════════════
// CORE BOOT — Wires Enterprise Infrastructure into Quasar App
// Seven Waves ERP — Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

import { boot } from 'quasar/wrappers'
import { Notify } from 'quasar'
import { errorHandler } from 'src/core/errors/ErrorHandler'
import { realtimeEngine } from 'src/core/realtime/RealtimeEngine'
import { offlineSyncEngine } from 'src/core/offline/OfflineSyncEngine'
import { sessionGuard } from 'src/core/security/sessionGuard'
import { logger } from 'src/core/logging/logger'
import { useAuthStore } from 'src/stores/auth'

export default boot(({ app, router }) => {
  // ── 1. Global Vue Error Handler ──────────────────────────────────
  app.config.errorHandler = (err, instance, info) => {
    errorHandler.handle(err, 'vue', info || 'unknown')
  }

  // ── 2. Unhandled Promise Rejection ───────────────────────────────
  // NOTE: This is the single global rejection handler for the app. The former
  // src/boot/error-handler.ts registered a second, competing listener (double
  // firing the rejection path + clobbering app.config.errorHandler). Its useful
  // infrastructure-noise suppression is merged in here.
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason
      const msg = reason instanceof Error ? reason.message : String(reason)

      // Suppress non-critical infrastructure noise (Supabase reconnects,
      // AbortErrors, transient network blips) — don't surface these to users.
      const isSilent =
        msg.includes('AbortError') ||
        msg.includes('NetworkError') ||
        msg.includes('Failed to fetch') ||
        msg.includes('Load failed') ||
        msg.includes('timeout') ||
        msg.includes('The object can only be used once') ||
        (reason?.code && ['PGRST', 'CHANNEL_ERROR'].some((p) => String(reason.code).startsWith(p)))

      if (isSilent) {
        logger.warn('[Unhandled Rejection – suppressed]', { message: msg })
        event.preventDefault()
        return
      }

      errorHandler.handle(reason, 'global', 'unhandledRejection')
      event.preventDefault() // Don't crash the app
    })
  }

  // ── 3. Session Guard — Expiry Detection ──────────────────────────
  sessionGuard.onWarning((minutesLeft) => {
    Notify.create({
      type: 'warning',
      message: `Session expires in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}`,
      icon: 'schedule',
      position: 'top',
      timeout: 10000,
      actions: [
        {
          label: 'Extend',
          color: 'white',
          handler: () => {
            // Token auto-refresh handles this — just acknowledge
            logger.info('[Session] User acknowledged expiry warning')
          },
        },
      ],
    })
  })

  sessionGuard.onExpired(() => {
    if (typeof window === 'undefined') return

    const currentPath = window.location.pathname
    const isPublicRoute =
      currentPath === '/auth/login' ||
      currentPath === '/table-login' ||
      currentPath === '/loyalty' ||
      currentPath.startsWith('/touch') ||
      currentPath.startsWith('/table/') ||
      currentPath.startsWith('/customer/') ||
      currentPath.startsWith('/c/') ||
      currentPath.startsWith('/menu') ||
      currentPath.startsWith('/auth')

    // If on a public or table ordering page, do not force to staff login
    if (isPublicRoute) return

    try {
      useAuthStore().signOut()
    } catch (err) {
      logger.warn('[Session] signOut on expiry failed', { error: String(err) })
    }
    
    Notify.create({
      type: 'negative',
      message: 'Your session has expired. Redirecting to login...',
      icon: 'lock',
      position: 'top',
      timeout: 3000,
    })
    setTimeout(() => {
      router.push('/auth/login')
    }, 2000)
  })

  // ── 4. Offline Status Banner ─────────────────────────────────────
  let offlineDismiss: (() => void) | null = null

  if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => {
      offlineDismiss = Notify.create({
        type: 'warning',
        message: 'You are offline. Changes will be synced when connection is restored.',
        icon: 'cloud_off',
        position: 'bottom',
        timeout: 0, // Persistent until online
        actions: [{ label: 'Dismiss', color: 'white' }],
      }) as any
    })

    window.addEventListener('online', () => {
      if (offlineDismiss && typeof offlineDismiss === 'function') {
        offlineDismiss()
        offlineDismiss = null
      }
      Notify.create({
        type: 'positive',
        message: 'Connection restored. Syncing...',
        icon: 'cloud_done',
        position: 'bottom',
        timeout: 3000,
      })
    })
  }

  // ── 5. Realtime Dedup Cleanup Timer ──────────────────────────────
  setInterval(() => {
    realtimeEngine.cleanupDedup()
  }, 60000)

  // ── 6. Start Infrastructure ──────────────────────────────────────
  sessionGuard.start()
  offlineSyncEngine.startPeriodicSync()

  // ── 7. Cleanup on Navigation to Login ────────────────────────────
  router.beforeEach((to) => {
    if (to.path === '/auth/login') {
      realtimeEngine.unsubscribeAll()
      offlineSyncEngine.cleanup()
      sessionGuard.cleanup()
    }
  })

  // ── 8. Provide Core Services to Components ───────────────────────
  app.provide('errorHandler', errorHandler)
  app.provide('realtimeEngine', realtimeEngine)
  app.provide('offlineSyncEngine', offlineSyncEngine)
  app.provide('logger', logger)

  logger.info('[Core] Enterprise infrastructure initialized')
})
