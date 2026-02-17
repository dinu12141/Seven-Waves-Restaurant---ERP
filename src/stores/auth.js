import { defineStore } from 'pinia'
import { supabase } from 'boot/supabase'

// Default landing pages per role (first match wins)
const ROLE_LANDING = {
  waiter: '/pos',
  cashier: '/pos',
  kitchen: '/kitchen',
  inventory: '/inventory',
  finance: '/finance',
  hr: '/admin',
  manager: '/dashboard',
  admin: '/dashboard',
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    session: null,
    roles: [],
    profile: null,
    branches: [],
    loading: false,
    error: null,
    initialized: false,
  }),
  actions: {
    async initialize() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        this.session = session
        this.user = session?.user || null

        if (this.user) {
          await this.fetchUserData()
        }

        // Listen to auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('Auth State Change:', event)
          this.session = session
          this.user = session?.user || null

          if (event === 'SIGNED_IN' || (session && !this.roles.length)) {
            await this.fetchUserData()
          } else if (event === 'SIGNED_OUT') {
            this._clearUserData()
          }
        })
      } finally {
        this.initialized = true
      }
    },

    async fetchUserData() {
      if (!this.user) return
      // Fetch roles, profile, and branches in parallel
      await Promise.all([this.fetchUserRoles(), this.fetchProfile(), this.fetchBranches()])
    },

    async fetchUserRoles() {
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('roles(name)')
          .eq('user_id', this.user.id)

        if (error) throw error
        this.roles = data.map((r) => r.roles.name)
      } catch (error) {
        console.error('Error fetching roles:', error)
      }
    },

    async fetchProfile() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', this.user.id)
          .single()

        if (error) throw error
        this.profile = data
      } catch (error) {
        console.error('Error fetching profile:', error)
      }
    },

    async fetchBranches() {
      try {
        const { data, error } = await supabase
          .from('user_branches')
          .select('*, branches(id, name, is_main, is_active)')
          .eq('user_id', this.user.id)

        if (error) throw error
        this.branches = data
      } catch (error) {
        console.error('Error fetching branches:', error)
      }
    },

    async signIn(email, password) {
      this.loading = true
      this.error = null
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          let errorMessage = error.message
          if (error.message.includes('Invalid login credentials')) {
            errorMessage = 'Invalid email or password'
          } else if (error.message.includes('Email not confirmed')) {
            errorMessage = 'Please verify your email before logging in'
          } else if (error.message.includes('Too many requests')) {
            errorMessage = 'Too many login attempts. Please try again later'
          }
          this.error = errorMessage
          return { data: null, error: { message: errorMessage } }
        }

        this.user = data.user
        this.session = data.session
        await this.fetchUserData()
        return { data, error: null }
      } catch (err) {
        this.error = err.message || 'An unexpected error occurred'
        return { data: null, error: err }
      } finally {
        this.loading = false
      }
    },

    async signOut() {
      try {
        const { error } = await supabase.auth.signOut()
        if (error) {
          console.error('Logout error:', error)
          throw error
        }
        this._clearUserData()
      } catch (err) {
        console.error('Failed to sign out:', err)
        this._clearUserData()
        throw err
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
      return (role) => state.roles.includes(role)
    },
    hasAnyRole: (state) => {
      return (roles) => roles.some((role) => state.roles.includes(role))
    },
    defaultLandingPage: (state) => {
      // Return first matching landing page based on role priority
      for (const role of state.roles) {
        if (ROLE_LANDING[role]) return ROLE_LANDING[role]
      }
      return '/dashboard'
    },
  },
})
