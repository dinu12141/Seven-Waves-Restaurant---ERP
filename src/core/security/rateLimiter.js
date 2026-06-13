// ═══════════════════════════════════════════════════════════════════
// RATE LIMITER — Client-side brute force & abuse protection
// Seven Waves ERP — Step 07 Production Hardening
// ═══════════════════════════════════════════════════════════════════

import { logger } from '../logging/logger'

/**
 * Token bucket rate limiter with configurable limits per action type.
 */
const buckets = new Map()
const failedAttempts = new Map()
const lockouts = new Map()

/**
 * Rate limit presets for different action categories.
 */
export const RATE_LIMITS = {
  login:          { maxAttempts: 5,  windowMs: 300_000,  lockoutMs: 900_000  },  // 5/5min, 15min lockout
  api_mutation:   { maxAttempts: 30, windowMs: 60_000,   lockoutMs: 60_000   },  // 30/min
  api_read:       { maxAttempts: 100, windowMs: 60_000,  lockoutMs: 30_000   },  // 100/min
  ai_request:     { maxAttempts: 10, windowMs: 60_000,   lockoutMs: 120_000  },  // 10/min, 2min lockout
  report_export:  { maxAttempts: 5,  windowMs: 300_000,  lockoutMs: 300_000  },  // 5/5min
  file_upload:    { maxAttempts: 10, windowMs: 300_000,  lockoutMs: 300_000  },  // 10/5min
  password_reset: { maxAttempts: 3,  windowMs: 600_000,  lockoutMs: 1800_000 },  // 3/10min, 30min lockout
  printer_job:    { maxAttempts: 20, windowMs: 60_000,   lockoutMs: 60_000   },  // 20/min
  voucher_post:   { maxAttempts: 10, windowMs: 60_000,   lockoutMs: 120_000  },  // 10/min, 2min lockout
  qr_validate:    { maxAttempts: 30, windowMs: 60_000,   lockoutMs: 30_000   },  // 30/min
}

/**
 * Check if an action is rate limited.
 * @returns {{ allowed: boolean, retryAfterMs?: number, remaining?: number }}
 */
export function checkRateLimit(actionType, identifier = 'default') {
  const config = RATE_LIMITS[actionType]
  if (!config) return { allowed: true, remaining: Infinity }

  const key = `${actionType}:${identifier}`
  const now = Date.now()

  // Check lockout
  const lockoutUntil = lockouts.get(key)
  if (lockoutUntil && now < lockoutUntil) {
    const retryAfterMs = lockoutUntil - now
    logger.warn(`[RateLimit] LOCKED OUT: ${key}`, { retryAfterMs })
    return { allowed: false, retryAfterMs, remaining: 0 }
  }

  // Get or create bucket
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { attempts: [], windowMs: config.windowMs }
    buckets.set(key, bucket)
  }

  // Purge expired entries
  bucket.attempts = bucket.attempts.filter(t => now - t < config.windowMs)

  // Check limit
  if (bucket.attempts.length >= config.maxAttempts) {
    // Trigger lockout
    lockouts.set(key, now + config.lockoutMs)
    logger.warn(`[RateLimit] RATE LIMITED: ${key}`, {
      attempts: bucket.attempts.length,
      lockoutMs: config.lockoutMs,
    })
    return { allowed: false, retryAfterMs: config.lockoutMs, remaining: 0 }
  }

  // Record attempt
  bucket.attempts.push(now)
  const remaining = config.maxAttempts - bucket.attempts.length

  return { allowed: true, remaining }
}

/**
 * Record a failed attempt (for login abuse detection).
 */
export function recordFailedAttempt(actionType, identifier = 'default') {
  const key = `${actionType}:${identifier}`
  const now = Date.now()

  let attempts = failedAttempts.get(key) || []
  attempts.push(now)

  // Keep last 1 hour of attempts
  attempts = attempts.filter(t => now - t < 3600_000)
  failedAttempts.set(key, attempts)

  // Detect brute force pattern
  if (attempts.length >= 10) {
    logger.error(`[RateLimit] BRUTE FORCE DETECTED: ${key}`, {
      failedAttempts: attempts.length,
      lastHour: true,
    })

    // Extended lockout for brute force
    const config = RATE_LIMITS[actionType]
    if (config) {
      lockouts.set(key, now + config.lockoutMs * 4) // 4x lockout
    }

    return {
      bruteForceDetected: true,
      totalFailedAttempts: attempts.length,
    }
  }

  return { bruteForceDetected: false, totalFailedAttempts: attempts.length }
}

/**
 * Detect impossible travel (login from different locations in short time).
 * @param {string} userId - User identifier
 * @param {string} ipAddress - Current IP address
 * @param {number} timestamp - Current login timestamp
 * @returns {{ suspicious: boolean, reason?: string }}
 */
const loginLocations = new Map()

export function detectImpossibleTravel(userId, ipAddress, timestamp = Date.now()) {
  const lastLogin = loginLocations.get(userId)

  if (lastLogin) {
    const timeDiffMinutes = (timestamp - lastLogin.timestamp) / 60_000

    // If different IP within 5 minutes — suspicious
    if (lastLogin.ip !== ipAddress && timeDiffMinutes < 5) {
      logger.error(`[Security] IMPOSSIBLE TRAVEL: ${userId}`, {
        previousIp: lastLogin.ip,
        currentIp: ipAddress,
        timeDiffMinutes,
      })
      return {
        suspicious: true,
        reason: `Login from different IP (${ipAddress}) within ${Math.round(timeDiffMinutes)} minutes of login from ${lastLogin.ip}`,
      }
    }
  }

  // Record this login
  loginLocations.set(userId, { ip: ipAddress, timestamp })
  return { suspicious: false }
}

/**
 * Detect session anomalies.
 */
export function detectSessionAnomaly(session) {
  const anomalies = []

  if (!session) {
    anomalies.push('No active session')
    return { anomalous: true, anomalies }
  }

  // Check if token is expired
  if (session.expires_at) {
    const expiresMs = session.expires_at * 1000
    if (Date.now() > expiresMs) {
      anomalies.push('Session token expired')
    }

    // Check if token was issued too far in the future (clock skew attack)
    const issuedAt = session.token?.iat || 0
    if (issuedAt > Date.now() / 1000 + 300) {
      anomalies.push('Token issued in the future (possible clock attack)')
    }
  }

  // Check for missing user metadata
  if (!session.user?.id) {
    anomalies.push('Session has no user ID')
  }

  return { anomalous: anomalies.length > 0, anomalies }
}

/**
 * Reset rate limit for a specific key (e.g., after successful login).
 */
export function resetRateLimit(actionType, identifier = 'default') {
  const key = `${actionType}:${identifier}`
  buckets.delete(key)
  lockouts.delete(key)
  failedAttempts.delete(key)
}

/**
 * Get current rate limit status for monitoring.
 */
export function getRateLimitStatus() {
  const status = {}
  for (const [key, bucket] of buckets) {
    const now = Date.now()
    const activeAttempts = bucket.attempts.filter(t => now - t < bucket.windowMs)
    status[key] = {
      activeAttempts: activeAttempts.length,
      isLocked: lockouts.has(key) && Date.now() < lockouts.get(key),
      lockoutUntil: lockouts.get(key) || null,
    }
  }
  return status
}

/**
 * Cleanup old entries (call periodically).
 */
export function cleanupRateLimits() {
  const now = Date.now()
  for (const [key, lockoutUntil] of lockouts) {
    if (now > lockoutUntil) lockouts.delete(key)
  }
  for (const [key, bucket] of buckets) {
    bucket.attempts = bucket.attempts.filter(t => now - t < bucket.windowMs)
    if (bucket.attempts.length === 0) buckets.delete(key)
  }
  for (const [key, attempts] of failedAttempts) {
    const recent = attempts.filter(t => now - t < 3600_000)
    if (recent.length === 0) failedAttempts.delete(key)
    else failedAttempts.set(key, recent)
  }
}
