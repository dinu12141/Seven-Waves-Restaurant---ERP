// ═══════════════════════════════════════════════════════════════════
// CORE ERROR TYPE HIERARCHY — Seven Waves ERP
// Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  PERMISSION = 'PERMISSION',
  RLS = 'RLS',
  NETWORK = 'NETWORK',
  REALTIME = 'REALTIME',
  OFFLINE_QUEUE = 'OFFLINE_QUEUE',
  PAYMENT = 'PAYMENT',
  INVENTORY_CONFLICT = 'INVENTORY_CONFLICT',
  FINANCE_POSTING = 'FINANCE_POSTING',
  SESSION = 'SESSION',
  NOT_FOUND = 'NOT_FOUND',
  UNKNOWN = 'UNKNOWN',
}

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface ErpError {
  /** Unique correlation ID for tracing */
  correlationId: string
  /** Error category for routing to correct handler */
  category: ErrorCategory
  /** Severity level */
  severity: ErrorSeverity
  /** User-friendly message shown in UI */
  userMessage: string
  /** Technical detail for logging (never shown to user) */
  technicalMessage: string
  /** Original error object if available */
  originalError?: unknown
  /** Module that produced the error */
  module?: string
  /** Action that was being performed */
  action?: string
  /** Additional context for debugging */
  context?: Record<string, unknown>
  /** Timestamp */
  timestamp: string
  /** Whether this error has been reported to the user */
  reported?: boolean
}

/**
 * Maps Supabase/Postgres error codes and messages to ErpError categories.
 */
export function classifySupabaseError(
  error: { code?: string; message?: string; details?: string; hint?: string },
  module?: string,
  action?: string,
): ErpError {
  const correlationId = generateCorrelationId()
  const msg = error.message || ''
  const code = error.code || ''

  // ── Permission / RLS errors ──
  if (code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) {
    return buildError(ErrorCategory.RLS, ErrorSeverity.WARNING, 'You do not have permission to access this data.', msg, correlationId, module, action)
  }
  if (msg.includes('Insufficient role') || msg.includes('Unauthorized') || msg.includes('Admin only')) {
    return buildError(ErrorCategory.PERMISSION, ErrorSeverity.WARNING, 'You do not have the required role for this action.', msg, correlationId, module, action)
  }

  // ── Validation / business logic ──
  if (msg.includes('NEGATIVE_STOCK_BLOCKED') || msg.includes('INSUFFICIENT_STOCK')) {
    return buildError(ErrorCategory.INVENTORY_CONFLICT, ErrorSeverity.ERROR, 'Insufficient stock to complete this operation.', msg, correlationId, module, action)
  }
  if (msg.includes('DUPLICATE_MOVEMENT')) {
    return buildError(ErrorCategory.INVENTORY_CONFLICT, ErrorSeverity.WARNING, 'This stock movement has already been processed.', msg, correlationId, module, action)
  }
  if (msg.includes('JOURNAL_IMBALANCE') || msg.includes('IMMUTABLE_JOURNAL')) {
    return buildError(ErrorCategory.FINANCE_POSTING, ErrorSeverity.ERROR, 'Journal entry validation failed. Please check debit/credit balance.', msg, correlationId, module, action)
  }
  if (msg.includes('IMMUTABLE_DOC') || msg.includes('CLOSED_PERIOD')) {
    return buildError(ErrorCategory.FINANCE_POSTING, ErrorSeverity.ERROR, 'This document cannot be modified.', msg, correlationId, module, action)
  }
  if (code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint')) {
    return buildError(ErrorCategory.VALIDATION, ErrorSeverity.WARNING, 'A record with this information already exists.', msg, correlationId, module, action)
  }
  if (code === '23502' || msg.includes('not-null constraint') || msg.includes('violates not-null')) {
    return buildError(ErrorCategory.VALIDATION, ErrorSeverity.ERROR, 'Required information is missing. Please fill all mandatory fields.', msg, correlationId, module, action)
  }
  if (code === '23503' || msg.includes('foreign key')) {
    return buildError(ErrorCategory.VALIDATION, ErrorSeverity.ERROR, 'This record references data that does not exist.', msg, correlationId, module, action)
  }
  if (code === '23514' || msg.includes('check constraint')) {
    return buildError(ErrorCategory.VALIDATION, ErrorSeverity.WARNING, 'The value entered is not valid for this field.', msg, correlationId, module, action)
  }

  // ── Payment errors ──
  if (msg.includes('PAYMENT_FAILED') || msg.includes('PAYMENT_DECLINED') || msg.includes('payment_intent') || msg.includes('INSUFFICIENT_FUNDS')) {
    return buildError(ErrorCategory.PAYMENT, ErrorSeverity.ERROR, 'Payment processing failed. Please try again or use a different method.', msg, correlationId, module, action)
  }

  // ── Realtime errors ──
  if (msg.includes('realtime') || msg.includes('CHANNEL_ERROR') || msg.includes('websocket')) {
    return buildError(ErrorCategory.REALTIME, ErrorSeverity.WARNING, 'Live updates interrupted. Reconnecting...', msg, correlationId, module, action)
  }

  // ── Network errors ──
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ERR_NETWORK') || msg.includes('ECONNREFUSED')) {
    return buildError(ErrorCategory.NETWORK, ErrorSeverity.ERROR, 'Network connection lost. Please check your internet connection.', msg, correlationId, module, action)
  }

  // ── Session errors ──
  if (code === 'PGRST301' || msg.includes('JWT expired') || msg.includes('Invalid JWT')) {
    return buildError(ErrorCategory.SESSION, ErrorSeverity.WARNING, 'Your session has expired. Please log in again.', msg, correlationId, module, action)
  }

  // ── Not found ──
  if (code === 'PGRST116' || msg.includes('not found')) {
    return buildError(ErrorCategory.NOT_FOUND, ErrorSeverity.INFO, 'The requested record was not found.', msg, correlationId, module, action)
  }

  // ── Fallback ──
  return buildError(ErrorCategory.UNKNOWN, ErrorSeverity.ERROR, 'An unexpected error occurred. Please try again.', msg, correlationId, module, action)
}

function buildError(
  category: ErrorCategory,
  severity: ErrorSeverity,
  userMessage: string,
  technicalMessage: string,
  correlationId: string,
  module?: string,
  action?: string,
): ErpError {
  return {
    correlationId,
    category,
    severity,
    userMessage,
    technicalMessage,
    module,
    action,
    timestamp: new Date().toISOString(),
    reported: false,
  }
}

let _counter = 0
export function generateCorrelationId(): string {
  _counter++
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 6)
  return `erp-${ts}-${rand}-${_counter}`
}
