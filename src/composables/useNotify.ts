/**
 * useNotify — S3-2
 *
 * Wraps Quasar Notify.create() with standardised preset functions.
 * Replaces 10+ inline Notify.create() calls scattered across stores.
 *
 * Usage:
 *   const { notifySuccess, notifyError, notifyWarning, notifyInfo } = useNotify()
 *   notifySuccess('Payment recorded successfully!')
 *   notifyError('Stock insufficient for this item')
 */
import { Notify } from 'quasar'

export function useNotify() {
  function notifySuccess(message: string, caption?: string) {
    Notify.create({
      type: 'positive',
      icon: 'check_circle',
      message,
      caption,
      position: 'top',
      timeout: 3000,
    })
  }

  function notifyError(message: string, caption?: string, timeout = 5000) {
    Notify.create({
      type: 'negative',
      icon: 'error',
      message,
      caption,
      position: 'top',
      timeout,
    })
  }

  function notifyWarning(message: string, caption?: string) {
    Notify.create({
      type: 'warning',
      icon: 'warning',
      message,
      caption,
      position: 'top',
      timeout: 4000,
    })
  }

  function notifyInfo(message: string, caption?: string) {
    Notify.create({
      type: 'info',
      icon: 'info',
      message,
      caption,
      position: 'top',
      timeout: 3000,
    })
  }

  /** Silent banner — no icon, minimal style. Use for background completions. */
  function notifyBanner(message: string, color = 'grey-8') {
    Notify.create({
      message,
      color,
      position: 'bottom',
      timeout: 2000,
    })
  }

  return {
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo,
    notifyBanner,
  }
}
