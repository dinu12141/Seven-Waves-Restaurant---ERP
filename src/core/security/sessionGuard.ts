// ═══════════════════════════════════════════════════════════════════
// SESSION GUARD — Expiry Detection + Device Tracking
// Seven Waves ERP — Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logger } from '../logging/logger'

const SESSION_CHECK_INTERVAL = 60_000 // 1 minute
const SESSION_WARNING_THRESHOLD = 300_000 // 5 minutes before expiry

type SessionWarningCallback = (minutesLeft: number) => void
type SessionExpiredCallback = () => void

class SessionGuard {
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private warningCallbacks: SessionWarningCallback[] = []
  private expiredCallbacks: SessionExpiredCallback[] = []

  /**
   * Start monitoring session expiry.
   */
  start(): void {
    this.stop()
    this.checkTimer = setInterval(() => this.checkSession(), SESSION_CHECK_INTERVAL)
    logger.info('[SessionGuard] Started monitoring')
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
  }

  /**
   * Check current session state.
   */
  private async checkSession(): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        // No session active — do not notify expired (user may be on login or table ordering)
        return
      }

      // Check token expiry
      const expiresAt = session.expires_at
      if (expiresAt) {
        const expiryMs = expiresAt * 1000
        const now = Date.now()
        const timeLeft = expiryMs - now

        if (timeLeft <= 0) {
          this.notifyExpired()
        } else if (timeLeft <= SESSION_WARNING_THRESHOLD) {
          const minutesLeft = Math.ceil(timeLeft / 60000)
          this.notifyWarning(minutesLeft)
        }
      }
    } catch (err) {
      logger.warn('[SessionGuard] Check failed', { error: String(err) })
    }
  }

  /**
   * Register a callback for session expiry warning.
   */
  onWarning(callback: SessionWarningCallback): () => void {
    this.warningCallbacks.push(callback)
    return () => {
      this.warningCallbacks = this.warningCallbacks.filter((c) => c !== callback)
    }
  }

  /**
   * Register a callback for session expiry.
   */
  onExpired(callback: SessionExpiredCallback): () => void {
    this.expiredCallbacks.push(callback)
    return () => {
      this.expiredCallbacks = this.expiredCallbacks.filter((c) => c !== callback)
    }
  }

  private notifyWarning(minutesLeft: number) {
    this.warningCallbacks.forEach((cb) => cb(minutesLeft))
  }

  private notifyExpired() {
    this.expiredCallbacks.forEach((cb) => cb())
  }

  /**
   * Cleanup on logout.
   */
  cleanup(): void {
    this.stop()
    this.warningCallbacks = []
    this.expiredCallbacks = []
  }
}

/** Singleton session guard */
export const sessionGuard = new SessionGuard()
