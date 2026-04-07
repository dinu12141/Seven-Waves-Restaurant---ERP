/**
 * Tauri Auth Boot — Deep Link handler for Supabase OAuth
 *
 * When running inside Tauri (desktop), this boot file listens for
 * deep link events (sevenwaves://auth/callback?code=XXX) triggered
 * by the OS after the user completes OAuth in the system browser.
 *
 * The authorization code is exchanged for a Supabase session via PKCE.
 *
 * This boot file is a no-op in web/PWA/Capacitor environments.
 */
import { boot } from 'quasar/wrappers'
import { supabase } from './supabase'

export default boot(async () => {
  // Only run in Tauri desktop environment
  if (!('__TAURI__' in window)) return

  try {
    const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link')

    // Listen for deep link events
    await onOpenUrl(async (urls: string[]) => {
      for (const url of urls) {
        try {
          const parsed = new URL(url)

          // Handle auth callback: sevenwaves://auth/callback?code=XXX
          const code = parsed.searchParams.get('code')
          if (code) {
            console.log('[Tauri Auth] Received auth code, exchanging for session...')
            const { data, error } = await supabase.auth.exchangeCodeForSession(code)
            if (error) {
              console.error('[Tauri Auth] Code exchange failed:', error.message)
            } else {
              console.log('[Tauri Auth] Session established for:', data.user?.email)
              // Reload the app to reflect the authenticated state
              window.location.reload()
            }
          }
        } catch (err) {
          console.error('[Tauri Auth] Failed to parse deep link URL:', err)
        }
      }
    })

    console.log('[Tauri Auth] Deep link listener registered')
  } catch (err) {
    console.warn('[Tauri Auth] Deep link plugin not available:', err)
  }
})
