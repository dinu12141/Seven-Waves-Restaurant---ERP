import { defineStore } from 'pinia'
import { supabase } from 'src/boot/supabase'
import { Session, User } from '@supabase/supabase-js'
import { ROLE_LANDING, canAccessRoute } from 'src/config/roles'

export type UserRole =
  | 'admin'
  | 'manager'
  | 'waiter'
  | 'cashier'
  | 'kitchen'
  | 'inventory'
  | 'finance'
  | 'hr'
  | 'procurement'

interface AuthState {
  user: User | null
  session: Session | null
  roles: UserRole[]
  profile: any | null
  branches: any[]
  loading: boolean
  error: string | null
  initialized: boolean
  _fetchingUserData: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    session: null,
    roles: [],
    profile: null,
    branches: [],
    loading: false,
    error: null,
    initialized: false,
    _fetchingUserData: false,
  }),
  actions: {
    async initialize() {
      if (this.initialized) return

      try {
        // Setup listener — but DON'T await fetchUserData inside it
        // to avoid double-fetching on initial load
        supabase.auth.onAuthStateChange((event, session) => {
          console.log('[Auth] State change:', event)

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
          // Fetch user data (roles etc.) — needed before first render
          await this.fetchUserData()
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
      try {
        // All 3 queries run in parallel — fastest possible
        await Promise.all([this._fetchRoles(), this._fetchProfile(), this._fetchBranches()])
      } finally {
        this._fetchingUserData = false
      }
    },

    /** Background fetch — doesn't block anything */
    _backgroundFetchUserData() {
      if (!this.user) return
      // Fire and forget — no await
      Promise.all([this._fetchRoles(), this._fetchProfile(), this._fetchBranches()]).catch((err) =>
        console.error('[Auth] Background fetch error:', err),
      )
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

    async _fetchProfile() {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, email, phone, avatar_url')
          .eq('id', this.user?.id)
          .single()
        this.profile = data
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
      } catch {
        /* non-critical */
      }
    },

    /**
     * FAST Sign In:
     * 1. Call Supabase signIn
     * 2. Set user + session immediately
     * 3. Fetch roles (critical for routing) — profile & branches in background
     * 4. Return ASAP so the UI can navigate
     */
    async signIn(email: string, password: string): Promise<{ data: any; error: any }> {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })

        if (error) {
          let msg = error.message
          if (msg.includes('Invalid login credentials')) msg = 'Invalid email or password'
          else if (msg.includes('Email not confirmed')) msg = 'Please verify your email first'
          else if (msg.includes('Too many requests')) msg = 'Too many attempts. Try later'
          this.error = msg
          return { data: null, error: { message: msg } }
        }

        // Set immediately — no waiting
        this.user = data.user
        this.session = data.session

        // Fetch ONLY roles — critical for route guard (fast, single RPC call)
        await this._fetchRoles()

        // Profile & branches in background — don't block navigation
        this._backgroundFetchNonCritical()

        return { data, error: null }
      } catch (err: any) {
        this.error = err.message || 'An unexpected error occurred'
        return { data: null, error: err }
      } finally {
        this.loading = false
      }
    },

    /** Fetch profile + branches + modules + notifications without blocking */
    _backgroundFetchNonCritical() {
      Promise.all([this._fetchProfile(), this._fetchBranches()]).catch(() => {})
      // Load system modules in background (non-blocking, separate promise)
      import('src/stores/modules').then(({ useModulesStore }) => {
        const modulesStore = useModulesStore()
        const companyId = this.branches?.[0]?.branches?.company_id
        modulesStore.fetchModules(companyId).catch(() => {})
      })
      // Initialize notification engine in background
      if (this.user?.id) {
        import('src/stores/notifications').then(({ useNotificationStore }) => {
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
      // Cleanup notifications before clearing user data
      import('src/stores/notifications')
        .then(({ useNotificationStore }) => {
          const notifStore = useNotificationStore()
          notifStore.cleanup()
        })
        .catch(() => {})

      // Clear local state FIRST — instant logout feel
      this._clearUserData()

      // Fire Supabase signOut in background — don't block the UI
      supabase.auth.signOut().catch((err) => {
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
        return this.roles.includes(roleName as UserRole)
      }
    },

    _clearUserData() {
      this.user = null
      this.session = null
      this.roles = []
      this.profile = null
      this.branches = []
    },
  },
  getters: {
    isAuthenticated: (state) => !!state.user,
    isAdmin: (state) => state.roles.includes('admin'),
    userDisplayName: (state) => state.profile?.full_name || state.user?.email || '',
    currentBranch: (state) => {
      const home = state.branches.find((b) => b.is_home_branch)
      return home?.branches || state.branches[0]?.branches || null
    },
    hasRole: (state) => {
      return (role: UserRole) => state.roles.includes(role)
    },
    hasAnyRole: (state) => {
      return (roles: UserRole[]) => roles.some((role) => state.roles.includes(role))
    },
    canAccess: (state) => {
      return (routePath: string) => canAccessRoute(state.roles, routePath)
    },
    defaultLandingPage: (state) => {
      for (const role of state.roles) {
        if (ROLE_LANDING[role]) return ROLE_LANDING[role]
      }
      return '/dashboard'
    },
  },
})
