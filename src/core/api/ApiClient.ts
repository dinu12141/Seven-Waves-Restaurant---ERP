// ═══════════════════════════════════════════════════════════════════
// API CLIENT — Centralized Supabase Wrapper
// Seven Waves ERP — Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { errorHandler } from '../errors/ErrorHandler'
import { generateCorrelationId, ErrorCategory } from '../errors/types'
import { logger } from '../logging/logger'

export interface ApiCallOptions {
  /** Module name for error classification */
  module?: string
  /** Action name for error classification */
  action?: string
  /** Number of retry attempts (default: 0) */
  retries?: number
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number
  /** Whether this operation is safe to retry (default: false for mutations) */
  idempotent?: boolean
  /** Suppress error notification */
  silent?: boolean
}

export interface ApiResult<T> {
  data: T | null
  error: ReturnType<typeof errorHandler.classify> | null
  correlationId: string
}

class ApiClient {
  /**
   * Execute a Supabase RPC call with standardized error handling.
   */
  async rpc<T = any>(
    fnName: string,
    params?: Record<string, unknown>,
    options: ApiCallOptions = {},
  ): Promise<ApiResult<T>> {
    const correlationId = generateCorrelationId()
    const { module, action = fnName, retries = 0, retryDelay = 1000, silent = false } = options

    logger.debug(`[API] RPC ${fnName}`, { params, correlationId })

    let lastError: any = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { data, error } = await supabase.rpc(fnName, params as any)

        if (error) {
          lastError = error

          // Don't retry permission/validation errors
          const classified = errorHandler.classify(error, module, action)
          if (
            classified.category === ErrorCategory.PERMISSION ||
            classified.category === ErrorCategory.RLS ||
            classified.category === ErrorCategory.VALIDATION
          ) {
            if (!silent) errorHandler.handle(error, module, action)
            return { data: null, error: classified, correlationId }
          }

          // Retry if attempts remain
          if (attempt < retries) {
            logger.warn(`[API] RPC ${fnName} failed, retry ${attempt + 1}/${retries}`, { error: error.message })
            await this.delay(retryDelay * Math.pow(2, attempt))
            continue
          }

          if (!silent) errorHandler.handle(error, module, action)
          return { data: null, error: classified, correlationId }
        }

        logger.debug(`[API] RPC ${fnName} success`, { correlationId })
        return { data: data as T, error: null, correlationId }
      } catch (err: any) {
        lastError = err
        if (attempt < retries) {
          await this.delay(retryDelay * Math.pow(2, attempt))
          continue
        }
      }
    }

    const classified = errorHandler.classify(lastError, module, action)
    if (!silent) errorHandler.handle(lastError, module, action)
    return { data: null, error: classified, correlationId }
  }

  /**
   * Execute a Supabase query (select/insert/update/delete).
   * Pass a function that receives the supabase client and returns the query.
   */
  async query<T = any>(
    queryFn: (client: typeof supabase) => PromiseLike<{ data: any; error: any }>,
    options: ApiCallOptions = {},
  ): Promise<ApiResult<T>> {
    const correlationId = generateCorrelationId()
    const { module, action, retries = 0, retryDelay = 1000, silent = false } = options

    logger.debug(`[API] Query ${action || 'anonymous'}`, { correlationId })

    let lastError: any = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { data, error } = await queryFn(supabase)

        if (error) {
          lastError = error
          const classified = errorHandler.classify(error, module, action)

          if (
            classified.category === ErrorCategory.PERMISSION ||
            classified.category === ErrorCategory.RLS ||
            classified.category === ErrorCategory.VALIDATION
          ) {
            if (!silent) errorHandler.handle(error, module, action)
            return { data: null, error: classified, correlationId }
          }

          if (attempt < retries) {
            logger.warn(`[API] Query retry ${attempt + 1}/${retries}`, { error: error.message })
            await this.delay(retryDelay * Math.pow(2, attempt))
            continue
          }

          if (!silent) errorHandler.handle(error, module, action)
          return { data: null, error: classified, correlationId }
        }

        return { data: data as T, error: null, correlationId }
      } catch (err: any) {
        lastError = err
        if (attempt < retries) {
          await this.delay(retryDelay * Math.pow(2, attempt))
          continue
        }
      }
    }

    const classified = errorHandler.classify(lastError, module, action)
    if (!silent) errorHandler.handle(lastError, module, action)
    return { data: null, error: classified, correlationId }
  }

  /**
   * Get the raw supabase client (for advanced use).
   * Prefer rpc() and query() for standardized error handling.
   */
  get client() {
    return supabase
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/** Singleton API client */
export const api = new ApiClient()
