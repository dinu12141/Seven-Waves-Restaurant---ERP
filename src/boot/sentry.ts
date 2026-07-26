// ═══════════════════════════════════════════════════════════════════
// SENTRY BOOT — Centralized Error Tracking for the SPA/PWA
// Seven Waves ERP — Pillar 4 (#100) monitoring
// ═══════════════════════════════════════════════════════════════════
//
// Wires @sentry/vue as the production error sink. Errors flowing through
// src/core/errors/ErrorHandler are forwarded here (see ErrorHandler.handle),
// so every classified ERP error also lands in Sentry with its correlationId.
//
// No-op when VITE_SENTRY_DSN is empty (local/dev) — Sentry.init with a falsy
// dsn disables the SDK, so this is safe to leave enabled in every environment.

import { boot } from 'quasar/wrappers'
import * as Sentry from '@sentry/vue'
import { setSentryClient } from 'src/core/errors/ErrorHandler'
import { logger } from 'src/core/logging/logger'

export default boot(({ app, router }) => {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

  if (!dsn) {
    logger.info('[Sentry] No VITE_SENTRY_DSN configured — error tracking disabled')
    return
  }

  const environment = (import.meta.env.VITE_APP_ENV as string) || 'production'

  Sentry.init({
    app,
    dsn,
    environment,
    // Keep tracing light in prod; disabled entirely outside production.
    tracesSampleRate: environment === 'production' ? 0.1 : 0,
    integrations: [Sentry.browserTracingIntegration({ router })],
    // Don't ship benign infrastructure noise (matches core.ts suppression list).
    ignoreErrors: [
      'AbortError',
      'NetworkError',
      'Failed to fetch',
      'Load failed',
      'ResizeObserver loop',
    ],
  })

  // Let ErrorHandler forward classified errors without a hard import cycle.
  setSentryClient(Sentry)

  logger.info('[Sentry] Error tracking initialized', { environment })
})
