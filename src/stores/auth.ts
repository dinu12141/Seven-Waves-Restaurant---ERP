/// <reference types="vite/client" />
import { defineStore } from 'pinia'
import { supabase } from '../boot/supabase'
import { Session, User } from '@supabase/supabase-js'
import { ROLE_LANDING, ROLE_PRIORITY, canAccessRoute } from '../config/roles'
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from '../core/security/rateLimiter'
import { sanitizeValue } from '../core/security/inputSanitizer'

// ── Login Audit Helper ─────────────────────────────────────────
function detectDevice(): { device_type: string; browser: string; os: string } {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  let device_type = 'Desktop'
  if (/Mobi|Android|iPhone|iPod/.test(ua)) device_type = 'Mobile'
  else if (/iPad|Tablet/.test(ua)) device_type = 'Tablet'

  let browser = 'Unknown'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari'
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'

  let os = 'Unknown'
  if (/Windows/.test(ua)) os = 'Windows'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  return { device_type, browser, os }
}

async function writeLoginAudit(payload: {
  user_id?: string
  email?: string
  full_name?: string
  role?: string
  status?: string
}) {
  try {
    const { device_type, browser, os } = detectDevice()
    await supabase.from('login_audit_logs').insert({
      ...payload,
      device_type,
      browser,
      os,
      logged_at: new Date().toISOString(),
    })
  } catch { /* non-critical */ }
}

export type UserRole =
  | 'admin'
  | 'super_admin'
  | 'manager'
  | 'waiter'
  | 'cashier'
  | 'kitchen'
  | 'delivery'
  | 'inventory'
  | 'finance'
  | 'hr'
  | 'procurement'

interface AuthState {
  user: User | null
  session: Session | null
  roles: UserRole[]
  permissions: string[]
  profile: any | null
  branches: any[]
  activeBranchId: string | null
  loading: boolean
  error: string | null
  initialized: boolean
  rolesVerified: boolean
  _fetchingUserData: boolean
}

// ── Login Brute-Force Protection ───────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes
let _loginAttempts = 0
let _lockoutUntil: number | null = null

// ── Auth cache helpers ─────────────────────────────────────────
// Caches roles, permissions, branches in localStorage so repeat
// logins are instant — one network call (signInWithPassword) instead of 4.
const CACHE_KEY = (uid: string) => `erp_auth_v2_${uid}`

interface AuthCache {
  roles: UserRole[]
  permissions: string[]
  branches: any[]
  cachedAt: number
}

function saveAuthCache(uid: string, data: Omit<AuthCache, 'cachedAt'>) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY(uid), JSON.stringify({ ...data, cachedAt: Date.now() }))
  } catch {}
}

function loadAuthCache(uid: string): AuthCache | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_KEY(uid))
    if (!raw) return null
    const cache: AuthCache = JSON.parse(raw)
    // Expire cache after 5 minutes — roles must be re-verified frequently
    if (Date.now() - cache.cachedAt > 300_000) {
      localStorage.removeItem(CACHE_KEY(uid))
      return null
    }
    return cache
  } catch {
    return null
  }
}

function clearAuthCache(uid: string) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.removeItem(CACHE_KEY(uid)) } catch {}
}

/** One-time migration: purge old-format cache keys that lack the v2 prefix */
function purgeOldCacheKeys() {
  if (typeof localStorage === 'undefined') return
  try {
    const toDelete: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('erp_auth_') && !key.startsWith('erp_auth_v2_')) {
        toDelete.push(key)
      }
    }
    toDelete.forEach((k) => localStorage.removeItem(k))
  } catch {}
}
// Run immediately at module load (safe — guarded above)
purgeOldCacheKeys()

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    session: null,
    roles: [],
    permissions: [],
    profile: null,
    branches: [],
    activeBranchId: null,
    loading: false,
    error: null,
    initialized: false,
    rolesVerified: false,
    _fetchingUserData: false,
  }),
  actions: {
    async initialize() {
      if (this.initialized) return

      try {
        // Setup listener — but DON'T await fetchUserData inside it
        // to avoid double-fetching on initial load
        supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
          if (import.meta.env.DEV) console.log('[Auth] State change:', event)

          this.session = session
          this.user = session?.user || null

          if (event === 'SIGNED_OUT') {
            this._clearUserData()
          }
          // For SIGNED_IN, we handle data fetching in signIn() directly
          // The listener only handles external auth changes (e.g. token refresh)
          if (event === 'TOKEN_REFRESHED' && session) {
            // Silently refresh user data in background on token refresh
            this._backgroundFetchUserData()
          }
        })

        // Get existing session — fast check
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session) {
          this.session = session
          this.user = session.user

          // Try cache first — avoids 3 DB calls on every app restart
          const cache = loadAuthCache(session.user.id)
          if (cache) {
            this.roles = cache.roles
            this.permissions = cache.permissions
            this.branches = cache.branches
            // Cached roles are NOT server-verified yet — the route guard
            // will force a server revalidation before privileged navigation.
            this.rolesVerified = false
            // Refresh roles/permissions/branches from server in background.
            this._backgroundRefreshUserData()
            // Profile (disabled-account) check MUST complete before we allow
            // navigation — a disabled account restored from cache would
            // otherwise slip through.
            await this._fetchProfile()
          } else {
            await this.fetchUserData()
          }
        }
      } catch (err) {
        console.error('[Auth] Init error:', err)
      } finally {
        this.initialized = true
      }
    },

    async fetchUserData() {
      if (!this.user || this._fetchingUserData) return
      this._fetchingUserData = true
      const uid = this.user.id
      try {
        await Promise.all([
          this._fetchRoles(),
          this._fetchPermissions(),
          this._fetchProfile(),
          this._fetchBranches(),
        ])
        // Save to cache for fast future logins/restarts
        saveAuthCache(uid, {
          roles: this.roles,
          permissions: this.permissions,
          branches: this.branches,
        })
        this.rolesVerified = true
      } finally {
        this._fetchingUserData = false
      }
    },

    /** Background fetch — doesn't block anything */
    _backgroundFetchUserData() {
      if (!this.user) return
      Promise.all([
        this._fetchRoles(),
        this._fetchPermissions(),
        this._fetchProfile(),
        this._fetchBranches(),
      ])
        .then(() => {
          if (this.user) {
            saveAuthCache(this.user.id, {
              roles: this.roles,
              permissions: this.permissions,
              branches: this.branches,
            })
          }
        })
        .catch((err) => console.error('[Auth] Background fetch error:', err))
    },

    async _fetchRoles() {
      try {
        const { data, error } = await supabase.rpc('auth_get_roles')
        if (error) throw error
        this.roles = (data || []) as UserRole[]
      } catch {
        // Fast fallback
        try {
          const { data } = await supabase
            .from('user_roles')
            .select('roles(name)')
            .eq('user_id', this.user?.id)
          this.roles = (data?.map((r: any) => r.roles?.name) || []).filter(Boolean) as UserRole[]
        } catch {
          /* silent */
        }
      }
    },

    async _fetchPermissions() {
      try {
        const { data } = await supabase
          .from('user_permissions')
          .select('permission_code')
          .eq('user_id', this.user?.id)
        this.permissions = data?.map((p: any) => p.permission_code) || []
      } catch (err) {
        console.error('[Auth] Failed to fetch permissions:', err)
        this.permissions = []
      }
    },

    async _fetchProfile() {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, email, phone, avatar_url, is_active, kitchen_id')
          .eq('id', this.user?.id)
          .single()
        this.profile = data
        // If profile is inactive, sign out and surface error
        if (data && data.is_active === false) {
          await this.signOut()
          this.error = 'Account disabled. Please contact admin.'
        }
      } catch {
        /* non-critical */
      }
    },

    async _fetchBranches() {
      try {
        const { data } = await supabase
          .from('user_branches')
          .select('is_home_branch, branches(id, name, company_id, is_main, is_active)')
          .eq('user_id', this.user?.id)
        this.branches = data || []
        // Set activeBranchId to home branch on first load if not already set
        if (!this.activeBranchId && this.branches.length > 0) {
          const home = this.branches.find((b) => b.is_home_branch)
          const branch = home?.branches || this.branches[0]?.branches
          if (branch?.id) this.activeBranchId = branch.id
        }
      } catch {
        /* non-critical */
      }
    },

    /**
     * FAST Sign In:
     * 1. signInWithPassword (unavoidable network call)
     * 2. If cache exists for this user → restore instantly, navigate, refresh in background
     * 3. If no cache → fetch roles+permissions+branches in parallel, cache result, navigate
     */
    async signIn(email: string, password: string): Promise<{ data: any; error: any }> {
      this.loading = true
      this.error = null

      // Sanitize the email only. The password must stay raw — escapeHtml
      // (inside sanitizeValue/sanitizePayload) would corrupt valid passwords
      // containing & < > " ' ` / and silently break login.
      email = sanitizeValue(email)
      const identifier = (email || '').toLowerCase()

      try {
        // ── Shared rate limiter (brute-force / lockout) ───────────
        const rl = checkRateLimit('login', identifier)
        if (!rl.allowed) {
          const retrySec = Math.ceil((rl.retryAfterMs || 0) / 1000)
          const msg = `Too many login attempts. Try again in ${retrySec}s.`
          this.error = msg
          return { data: null, error: { message: msg } }
        }

        // ── Brute-force lockout check ─────────────────────────────
        if (_lockoutUntil !== null && Date.now() < _lockoutUntil) {
          const remainingMin = Math.ceil((_lockoutUntil - Date.now()) / 60000)
          const msg = `Too many failed attempts. Try again in ${remainingMin} minute(s).`
          this.error = msg
          return { data: null, error: { message: msg } }
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password })

        if (error) {
          _loginAttempts++
          if (_loginAttempts >= MAX_LOGIN_ATTEMPTS) {
            _lockoutUntil = Date.now() + LOCKOUT_DURATION_MS
          }
          recordFailedAttempt('login', identifier)
          let msg = error.message
          if (msg.includes('Invalid login credentials')) msg = 'Invalid email or password'
          else if (msg.includes('Email not confirmed')) msg = 'Please verify your email first'
          else if (msg.includes('Too many requests')) msg = 'Too many attempts. Try later'
          this.error = msg
          return { data: null, error: { message: msg } }
        }

        // Successful login — reset lockout state
        _loginAttempts = 0
        _lockoutUntil = null
        resetRateLimit('login', identifier)

        this.user = data.user
        this.session = data.session

        // ── Try cache first ───────────────────────────────────────
        const cache = loadAuthCache(data.user.id)

        if (cache) {
          // Instant restore — no extra DB calls before navigating
          this.roles = cache.roles
          this.permissions = cache.permissions
          this.branches = cache.branches
          this.rolesVerified = false

          // Refresh all data silently in background
          this._backgroundRefreshUserData()
        } else {
          // First login for this user — fetch in parallel (no cache yet)
          await Promise.all([
            this._fetchRoles(),
            this._fetchPermissions(),
            this._fetchBranches(),
          ])
          // Save to cache for next login
          saveAuthCache(data.user.id, {
            roles: this.roles,
            permissions: this.permissions,
            branches: this.branches,
          })
          this.rolesVerified = true
        }

        // ── Step 4: Profile, modules, notifications — ALL background ──
        // Don't block navigation for profile fetch — page renders instantly
        this._backgroundFetchNonCritical()

        // ── Step 03D: Subscribe to realtime channels ──────────────────
        this._subscribeRealtimeChannels()

        // 🔐 Audit log — fire & forget
        writeLoginAudit({
          user_id: data.user.id,
          email: data.user.email,
          full_name: this.profile?.full_name,
          role: this.roles[0] || 'unknown',
          status: 'success',
        })

        return { data, error: null }
      } catch (err: any) {
        this.error = err.message || 'An unexpected error occurred'
        return { data: null, error: err }
      } finally {
        this.loading = false
      }
    },

    /**
     * Sign In with Numeric User Code (for Waiters / Cashiers):
     * Calls the login-with-code Edge Function which:
     *   1. Looks up the email by user_code
     *   2. Signs in with email+password
     *   3. Returns session + roles
     */
    async signInWithCode(userCode: string, password: string): Promise<{ data: any; error: any }> {
      this.loading = true
      this.error = null
      try {
        const identifier = String(userCode || '').trim()

        // ── Shared rate limiter (same as signIn) ──────────────────
        const rl = checkRateLimit('login', identifier)
        if (!rl.allowed) {
          const retrySec = Math.ceil((rl.retryAfterMs || 0) / 1000)
          const msg = `Too many login attempts. Try again in ${retrySec}s.`
          this.error = msg
          return { data: null, error: { message: msg } }
        }

        // ── Brute-force lockout check ─────────────────────────────
        if (_lockoutUntil !== null && Date.now() < _lockoutUntil) {
          const remainingMin = Math.ceil((_lockoutUntil - Date.now()) / 60000)
          const msg = `Too many failed attempts. Try again in ${remainingMin} minute(s).`
          this.error = msg
          return { data: null, error: { message: msg } }
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

        const response = await fetch(`${supabaseUrl}/functions/v1/login-with-code`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
          },
          body: JSON.stringify({ user_code: userCode, password }),
        })

        const result = await response.json()

        if (!response.ok || result.error) {
          _loginAttempts++
          if (_loginAttempts >= MAX_LOGIN_ATTEMPTS) {
            _lockoutUntil = Date.now() + LOCKOUT_DURATION_MS
          }
          recordFailedAttempt('login', identifier)
          const msg = result.error || 'Invalid user code or password'
          this.error = msg
          return { data: null, error: { message: msg } }
        }

        // Successful login — reset lockout state
        _loginAttempts = 0
        _lockoutUntil = null
        resetRateLimit('login', identifier)

        // Set the session from the edge function response
        if (result.session) {
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: result.session.access_token,
            refresh_token: result.session.refresh_token,
          })

          if (sessionError) {
            this.error = 'Failed to establish session'
            return { data: null, error: { message: 'Failed to establish session' } }
          }

          this.user = sessionData.user
          this.session = sessionData.session
        }

        // Apply roles from edge function response (instant — no extra DB call)
        if (result.roles && Array.isArray(result.roles)) {
          this.roles = result.roles as UserRole[]
        }

        // Fetch remaining data (permissions, branches) in parallel
        await Promise.all([
          this._fetchPermissions(),
          this._fetchBranches(),
        ])

        // Cache for fast future logins
        if (this.user) {
          saveAuthCache(this.user.id, {
            roles: this.roles,
            permissions: this.permissions,
            branches: this.branches,
          })
        }
        this.rolesVerified = true

        // ── Step 5: Profile, modules, notifications — ALL background ──
        // Don't block navigation — the profile name will appear within ~200ms
        this._backgroundFetchNonCritical()

        // ── Step 03D: Subscribe to realtime channels ──────────────────
        this._subscribeRealtimeChannels()

        // 🔐 Audit log — fire & forget
        writeLoginAudit({
          user_id: this.user?.id,
          email: this.user?.email,
          full_name: this.profile?.full_name,
          role: this.roles[0] || 'unknown',
          status: 'success',
        })

        return { data: result, error: null }
      } catch (err: any) {
        this.error = err.message || 'An unexpected error occurred'
        return { data: null, error: err }
      } finally {
        this.loading = false
      }
    },

    /** Refresh roles + permissions + branches in background and update cache */
    _backgroundRefreshUserData(): Promise<void> {
      if (!this.user) return Promise.resolve()
      const uid = this.user.id
      return Promise.all([
        this._fetchRoles(),
        this._fetchPermissions(),
        this._fetchBranches(),
      ])
        .then(() => {
          saveAuthCache(uid, {
            roles: this.roles,
            permissions: this.permissions,
            branches: this.branches,
          })
          // Roles are now confirmed against the server.
          this.rolesVerified = true
          // Step 03D: Resubscribe with potentially updated branch/permissions
          this._subscribeRealtimeChannels()
        })
        .catch((err) => console.error('[Auth] Background refresh error:', err))
    },

    /** Fetch profile + modules + notifications without blocking (branches already loaded) */
    _backgroundFetchNonCritical() {
      // Profile is non-critical — load in background
      this._fetchProfile().catch(() => {})
      // Load system modules in background using already-loaded branch data
      import('./modules').then(({ useModulesStore }) => {
        const modulesStore = useModulesStore()
        const companyId = this.branches?.[0]?.branches?.company_id
        if (companyId) modulesStore.fetchModules(companyId).catch(() => {})
      })
      // Initialize notification engine in background
      if (this.user?.id) {
        import('./notifications').then(({ useNotificationStore }) => {
          const notifStore = useNotificationStore()
          notifStore.initialize(this.user?.id).catch(() => {})
        })
      }
    },

    /**
     * FAST Sign Out:
     * 1. Clear local state IMMEDIATELY (instant UI update)
     * 2. Call Supabase signOut in background (don't wait for it)
     */
    async signOut() {
      const uid = this.user?.id

      // ── Step 03D: Cleanup realtime channels ──────────────────────
      import('../boot/realtime')
        .then(({ cleanupRealtime }) => {
          cleanupRealtime()
        })
        .catch(() => {})

      // Cleanup notifications before clearing user data
      import('./notifications')
        .then(({ useNotificationStore }) => {
          const notifStore = useNotificationStore()
          notifStore.cleanup()
        })
        .catch(() => {})

      // Cleanup Step 03A infrastructure stores
      import('./offlineSyncStore')
        .then(({ useOfflineSyncStore }) => {
          const syncStore = useOfflineSyncStore()
          syncStore.cleanup()
        })
        .catch(() => {})

      import('./auditStore')
        .then(({ useAuditStore }) => {
          const auditStore = useAuditStore()
          auditStore.cleanup()
        })
        .catch(() => {})

      // Clear AI chat history for this user (security: prevent cross-user leakage on shared devices)
      if (uid && typeof window !== 'undefined') {
        try { window.localStorage.removeItem(`sw_ai_chat_${uid}`) } catch { /* ignore */ }
      }

      // Clear local state FIRST — instant logout feel
      this._clearUserData()

      // Clear auth cache for this user
      if (uid) clearAuthCache(uid)

      // Forcefully clear session storage immediately
      if (typeof window !== 'undefined') {
        window.sessionStorage.clear()
      }

      // Fire Supabase signOut in background — DON'T await it
      // The local state is already cleared, so the UI is already logged out
      supabase.auth.signOut().catch((err: unknown) => {
        console.error('Background signOut error:', err)
      })
    },

    /**
     * Server-verified role check using auth_has_role RPC.
     */
    async authHasRole(roleName: string): Promise<boolean> {
      try {
        const { data, error } = await supabase.rpc('auth_has_role', { role_name: roleName })
        if (error) throw error
        return !!data
      } catch {
        return Array.isArray(this.roles) && this.roles.includes(roleName as UserRole)
      }
    },

    /**
     * Switch the active branch for multi-branch users.
     * Updates activeBranchId and re-subscribes realtime channels for the new branch.
     */
    switchBranch(branchId: string) {
      const targetBranch = this.branches.find((b) => b.branches?.id === branchId)
      if (!targetBranch) {
        console.warn('[Auth] switchBranch: branch not found in user branches:', branchId)
        return
      }
      this.activeBranchId = branchId
      // Re-subscribe realtime channels for the new branch
      this._subscribeRealtimeChannels()
    },

    _clearUserData() {
      this.user = null
      this.session = null
      this.roles = []
      this.permissions = []
      this.profile = null
      this.branches = []
      this.activeBranchId = null
      this.rolesVerified = false
    },

    /**
     * Step 03D: Subscribe to all realtime channels the user has permission for.
     * Called after every successful login and branch switch.
     */
    _subscribeRealtimeChannels() {
      const userId = this.user?.id
      const branchId = this.currentBranch?.id
      const role = this.roles[0] || 'waiter'

      if (!userId || !branchId) return

      import('../boot/realtime')
        .then(({ subscribeUserChannels }) => {
          subscribeUserChannels(userId, branchId, role, this.permissions)
        })
        .catch((err) => console.error('[Auth] Realtime subscribe error:', err))
    },
  },
  getters: {
    isAuthenticated: (state) => !!state.user,
    isAdmin: (state) => Array.isArray(state.roles) && state.roles.includes('admin'),
    userDisplayName: (state) => state.profile?.full_name || state.user?.email || '',
    currentBranch: (state) => {
      // Respect an explicit branch switch first
      if (state.activeBranchId) {
        const active = state.branches.find((b) => b.branches?.id === state.activeBranchId)
        if (active?.branches) return active.branches
      }
      const home = state.branches.find((b) => b.is_home_branch)
      return home?.branches || state.branches[0]?.branches || null
    },
    availableBranches: (state) => state.branches.map((b) => b.branches).filter(Boolean),
    hasRole: (state) => {
      return (role: UserRole) => Array.isArray(state.roles) && state.roles.includes(role)
    },
    hasAnyRole: (state) => {
      return (roles: UserRole[]) =>
        Array.isArray(state.roles) && roles.some((role) => state.roles.includes(role))
    },
    canAccess: (state) => {
      return (routePath: string) => canAccessRoute(state.roles, routePath, state.permissions)
    },
    defaultLandingPage: (state) => {
      // Evaluate roles in priority order (admin → manager → ... → waiter),
      // NOT in the random order the DB happens to return them.
      // Without this, an admin who also has 'cashier' might land on /pos.
      for (const role of ROLE_PRIORITY) {
        if (state.roles.includes(role) && ROLE_LANDING[role]) {
          return ROLE_LANDING[role]
        }
      }
      return '/dashboard'
    },
  },
})
