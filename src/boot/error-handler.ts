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
      console.error('[Unhandled Rejection]:', event.reason)
      Notify.create({
        type: 'negative',
        message: 'Async operation failed.',
        caption: event.reason instanceof Error ? event.reason.message : String(event.reason),
      })
    })
  }
})
