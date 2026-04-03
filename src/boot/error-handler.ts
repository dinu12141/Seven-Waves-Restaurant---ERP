import { boot } from 'quasar/wrappers'
import { Notify } from 'quasar'

export default boot(({ app }) => {
  // Vue Global Error Handler
  app.config.errorHandler = (err, instance, info) => {
    console.error('[Global Error API]:', err)
    console.error('[Global Error Info]:', info)

    Notify.create({
      type: 'negative',
      message: 'An unexpected error occurred.',
      caption: err instanceof Error ? err.message : String(err),
    })
  }

  // Global Promise Rejection Handler
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason
      const msg = reason instanceof Error ? reason.message : String(reason)

      // Suppress non-critical infrastructure noise (Supabase reconnects, AbortErrors, etc.)
      const isSilent =
        msg.includes('AbortError') ||
        msg.includes('NetworkError') ||
        msg.includes('Failed to fetch') ||
        msg.includes('Load failed') ||
        msg.includes('timeout') ||
        msg.includes('The object can only be used once') ||
        (reason?.code && ['PGRST', 'CHANNEL_ERROR'].some((p) => String(reason.code).startsWith(p)))

      if (isSilent) {
        console.warn('[Unhandled Rejection – suppressed]:', msg)
        return
      }

      console.error('[Unhandled Rejection]:', reason)
      Notify.create({
        type: 'negative',
        message: 'Async operation failed.',
        caption: msg,
      })
    })
  }
})
