// ═══════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER — Seven Waves ERP
// Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

import { Notify, Dialog } from 'quasar'
import { ErpError, ErrorCategory, ErrorSeverity, classifySupabaseError, generateCorrelationId } from './types'
import { logger } from '../logging/logger'

type ErrorListener = (error: ErpError) => void

// Minimal shape of the Sentry client we depend on. Injected from src/boot/sentry.ts
// so this module has no hard dependency on @sentry/vue (keeps it importable
// everywhere + testable, and a no-op when Sentry isn't configured).
interface SentryLike {
  captureException(error: unknown, hint?: { tags?: Record<string, string | undefined>; extra?: Record<string, unknown> }): void
}

let sentryClient: SentryLike | null = null

/** Wire the Sentry client so classified errors are forwarded to it. */
export function setSentryClient(client: SentryLike | null): void {
  sentryClient = client
}

class ErrorHandler {
  private listeners: ErrorListener[] = []
  private recentErrors: ErpError[] = []
  private readonly MAX_RECENT = 50

  /**
   * Primary entry point: handle any error from any module.
   */
  handle(error: unknown, module?: string, action?: string): ErpError {
    const erpError = this.classify(error, module, action)

    // Log it
    logger.error(`[${erpError.category}] ${erpError.technicalMessage}`, {
      correlationId: erpError.correlationId,
      module: erpError.module,
      action: erpError.action,
      category: erpError.category,
    })

    // Store for audit
    this.recentErrors.unshift(erpError)
    if (this.recentErrors.length > this.MAX_RECENT) {
      this.recentErrors.pop()
    }

    // Forward to Sentry (no-op if not configured). Skip INFO-level noise.
    if (sentryClient && erpError.severity !== ErrorSeverity.INFO) {
      try {
        sentryClient.captureException(
          erpError.originalError ?? new Error(erpError.technicalMessage),
          {
            tags: {
              module: erpError.module,
              action: erpError.action,
              category: erpError.category,
              severity: erpError.severity,
            },
            extra: {
              correlationId: erpError.correlationId,
              technicalMessage: erpError.technicalMessage,
              userMessage: erpError.userMessage,
            },
          },
        )
      } catch {
        // Never let telemetry break the error path.
      }
    }

    // Show to user based on category
    this.displayError(erpError)

    // Notify listeners (stores, components)
    this.listeners.forEach((fn) => fn(erpError))

    return erpError
  }

  /**
   * Classify raw error into ErpError
   */
  classify(error: unknown, module?: string, action?: string): ErpError {
    // Already classified
    if (this.isErpError(error)) return error

    // Supabase-style error object
    if (error && typeof error === 'object' && ('code' in error || 'message' in error)) {
      return classifySupabaseError(error as any, module, action)
    }

    // Standard Error
    if (error instanceof Error) {
      return {
        correlationId: generateCorrelationId(),
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.ERROR,
        userMessage: 'An unexpected error occurred.',
        technicalMessage: error.message,
        originalError: error,
        module,
        action,
        timestamp: new Date().toISOString(),
      }
    }

    // String
    if (typeof error === 'string') {
      return classifySupabaseError({ message: error }, module, action)
    }

    // Unknown
    return {
      correlationId: generateCorrelationId(),
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.ERROR,
      userMessage: 'An unexpected error occurred.',
      technicalMessage: String(error),
      originalError: error,
      module,
      action,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Display error to user via Quasar Notify / Dialog
   */
  private displayError(error: ErpError): void {
    if (error.reported) return
    error.reported = true

    switch (error.category) {
      case ErrorCategory.NETWORK:
        Notify.create({
          type: 'warning',
          message: error.userMessage,
          icon: 'wifi_off',
          position: 'top',
          timeout: 5000,
          actions: [{ label: 'Retry', color: 'white', handler: () => { if (typeof window !== 'undefined') window.location.reload() } }],
        })
        break

      case ErrorCategory.SESSION:
        Dialog.create({
          title: 'Session Expired',
          message: error.userMessage,
          persistent: true,
          ok: { label: 'Log In', color: 'primary' },
        }).onOk(() => {
          if (typeof window !== 'undefined') window.location.href = '/auth/login'
        })
        break

      case ErrorCategory.PERMISSION:
      case ErrorCategory.RLS:
        Notify.create({
          type: 'negative',
          message: error.userMessage,
          icon: 'lock',
          position: 'top',
          timeout: 4000,
        })
        break

      case ErrorCategory.INVENTORY_CONFLICT:
        Notify.create({
          type: 'warning',
          message: error.userMessage,
          icon: 'inventory_2',
          position: 'top',
          timeout: 5000,
          caption: `Ref: ${error.correlationId}`,
        })
        break

      case ErrorCategory.FINANCE_POSTING:
        Notify.create({
          type: 'negative',
          message: error.userMessage,
          icon: 'account_balance',
          position: 'top',
          timeout: 6000,
          caption: `Ref: ${error.correlationId}`,
        })
        break

      case ErrorCategory.VALIDATION:
        Notify.create({
          type: 'warning',
          message: error.userMessage,
          icon: 'warning',
          position: 'top',
          timeout: 4000,
        })
        break

      case ErrorCategory.PAYMENT:
        Notify.create({
          type: 'negative',
          message: error.userMessage,
          icon: 'credit_card_off',
          position: 'top',
          timeout: 6000,
          caption: `Ref: ${error.correlationId}`,
        })
        break

      case ErrorCategory.REALTIME:
        Notify.create({
          type: 'info',
          message: error.userMessage,
          icon: 'sync_problem',
          position: 'top-right',
          timeout: 4000,
        })
        break

      case ErrorCategory.OFFLINE_QUEUE:
        Notify.create({
          type: 'warning',
          message: error.userMessage,
          icon: 'cloud_off',
          position: 'bottom',
          timeout: 4000,
        })
        break

      case ErrorCategory.NOT_FOUND:
        // Silent for NOT_FOUND — usually handled by UI
        break

      default:
        Notify.create({
          type: 'negative',
          message: error.userMessage,
          position: 'top',
          timeout: 4000,
          caption: `Ref: ${error.correlationId}`,
        })
    }
  }

  /** Subscribe to error events */
  onError(listener: ErrorListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  /** Get recent errors for audit/debug page */
  getRecentErrors(): ErpError[] {
    return [...this.recentErrors]
  }

  /** Clear recent errors */
  clearRecentErrors(): void {
    this.recentErrors = []
  }

  /** Type guard */
  isErpError(error: unknown): error is ErpError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'correlationId' in error &&
      'category' in error &&
      'severity' in error
    )
  }
}

/** Singleton instance */
export const errorHandler = new ErrorHandler()
