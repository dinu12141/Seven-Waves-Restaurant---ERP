// ═══════════════════════════════════════════════════════════════════
// API Response Helpers — Typed Result Wrappers
// Seven Waves ERP — Step 03C
// ═══════════════════════════════════════════════════════════════════

import type { ErpError } from '../errors/types'

/**
 * Standard service return type — every service method returns this.
 * Components never see raw Supabase responses.
 */
export interface ServiceResult<T = undefined> {
  success: boolean
  data: T | null
  error: string | null
  /** Correlation ID for error tracing */
  correlationId?: string
}

/** Factory: success result */
export function ok<T>(data: T, correlationId?: string): ServiceResult<T> {
  return { success: true, data, error: null, correlationId }
}

/** Factory: failure result */
export function fail<T = never>(error: string, correlationId?: string): ServiceResult<T> {
  return { success: false, data: null, error, correlationId }
}

/** Factory: from ApiResult (bridge from ApiClient) */
export function fromApiResult<T>(result: {
  data: T | null
  error: { userMessage: string } | null
  correlationId: string
}): ServiceResult<T> {
  if (result.error) {
    return fail(result.error.userMessage, result.correlationId)
  }
  return ok(result.data as T, result.correlationId)
}

/**
 * Paginated result — for tables with server-side pagination.
 */
export interface PaginatedResult<T> extends ServiceResult<T[]> {
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

/** Factory: paginated success */
export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return {
    success: true,
    data,
    error: null,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  }
}
