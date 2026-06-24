import { createClient } from '@supabase/supabase-js'
import { boot } from 'quasar/wrappers'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Boot] Supabase URL or Anon Key missing!')
  throw new Error('Supabase URL or Anon Key not found in environment variables.')
}

// Detect Tauri desktop environment (safe for SSR where window doesn't exist)
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

// Exponential backoff: 2s, 4s, 8s, 16s, 30s (capped)
// Prevents the WebSocket reconnection storm / console flood
function realtimeBackoff(tries: number) {
  return Math.min(Math.pow(2, tries) * 1000, 30000)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE is the modern secure flow for all environments.
    // Implicit flow is deprecated — tokens were exposed in URL fragments.
    flowType: 'pkce',
    // Persist session to localStorage — works in Tauri's WebView2
    persistSession: true,
    autoRefreshToken: true,
    // In Tauri, we handle the redirect via deep link, not URL detection
    detectSessionInUrl: !isTauri,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
    reconnectAfterMs: realtimeBackoff,
    // Heartbeat interval — keep connection alive every 30s
    heartbeatIntervalMs: 30000,
    // Timeout before declaring a connection dead
    timeout: 20000,
  },
})

export default boot(({ app }) => {
  app.config.globalProperties.$supabase = supabase
  app.provide('supabase', supabase)
})
