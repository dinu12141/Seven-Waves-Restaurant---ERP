// ═══════════════════════════════════════════════════════════════════
// App Configuration — Constants & Environment
// Seven Waves ERP — Step 03C
// ═══════════════════════════════════════════════════════════════════

/** Application-wide constants (no magic strings in components) */
export const APP_CONFIG = {
  name: 'Seven Waves ERP',
  shortName: 'Seven Waves',
  version: __SW_VERSION__ ?? '1.0.0',
  company: 'Cosmo Solutions',

  /** Supabase */
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  publicUrl: import.meta.env.VITE_APP_PUBLIC_URL as string || 'https://app.sevenwaves.lk',

  /** Session & Auth */
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  tokenRefreshMarginMs: 5 * 60 * 1000, // refresh 5 min before expiry
  maxLoginAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000, // 15 minutes

  /** Offline */
  syncIntervalMs: 30_000,
  maxQueueSize: 500,
  maxRetries: 3,

  /** UI */
  defaultPageSize: 25,
  maxPageSize: 100,
  toastDurationMs: 3000,
  debounceMs: 300,

  /** Feature Flags */
  features: {
    offlineMode: true,
    realtimeUpdates: true,
    pushNotifications: true,
    biometricAuth: false,
    multiCurrency: false,
  },
} as const

/** Typed environment — prevents raw import.meta.env access in components */
export type AppConfig = typeof APP_CONFIG

// Vite define placeholder — replaced at build time
declare const __SW_VERSION__: string | undefined
