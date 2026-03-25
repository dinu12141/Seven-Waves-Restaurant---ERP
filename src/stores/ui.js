import { defineStore } from 'pinia'

// ─── Per-user theme storage ────────────────────────────────────────────────────
// Theme preference is stored per-user so every login (waiter, POS, kitchen,
// delivery, manager, admin…) remembers their own choice independently.

function themeKey(userId) {
  if (userId) return `seven-waves-theme-${userId}`
  return 'seven-waves-theme-guest' // fallback for unauthenticated pages
}

/**
 * Detect system color scheme preference.
 * Returns 'dark' or 'light'.
 */
function getSystemPreference() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark' // fallback to dark
}

/**
 * Load saved theme from localStorage for a specific user.
 * Returns 'dark', 'light', or null if no preference saved.
 */
function loadSavedTheme(userId) {
  if (typeof localStorage === 'undefined') return null
  const saved = localStorage.getItem(themeKey(userId))
  if (saved === 'dark' || saved === 'light') return saved
  return null
}

/**
 * Persist theme choice to localStorage for a specific user.
 */
function saveTheme(theme, userId) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(themeKey(userId), theme)
  }
}

export const useUIStore = defineStore('ui', {
  state: () => ({
    darkMode: true, // Will be overridden in initThemeForUser()
    _currentUserId: null, // Tracked so toggle/set know which key to write
    sidebarOpen: true,
    sidebarCollapsed: false,
    loading: false,
    notifications: {
      enabled: true,
      sound: true,
    },
  }),

  actions: {
    /**
     * Initialize theme for a specific logged-in user.
     * Priority: 1) user-specific localStorage  2) system preference  3) dark (default)
     *
     * Call this from App.vue once the auth user is known.
     * Also safe to call on route change if the user ID changes.
     */
    initThemeForUser(quasar, userId) {
      this._currentUserId = userId || null

      const saved = loadSavedTheme(userId)
      if (saved) {
        this.darkMode = saved === 'dark'
      } else {
        const system = getSystemPreference()
        this.darkMode = system === 'dark'
      }

      quasar.dark.set(this.darkMode)

      // Listen for system preference changes (only if the user has no saved preference)
      if (typeof window !== 'undefined' && window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          if (!loadSavedTheme(this._currentUserId)) {
            this.darkMode = e.matches
            quasar.dark.set(this.darkMode)
          }
        })
      }
    },

    /**
     * Legacy entry-point kept for backwards compatibility.
     * Used before a user ID is known (e.g. login page).
     */
    initTheme(quasar) {
      this.initThemeForUser(quasar, null)
    },

    /**
     * Toggle dark/light mode.
     * Persists choice under the current user's key and applies immediately.
     */
    toggleDarkMode(quasar) {
      this.darkMode = !this.darkMode
      saveTheme(this.darkMode ? 'dark' : 'light', this._currentUserId)
      if (quasar) {
        quasar.dark.set(this.darkMode)
      }
    },

    /**
     * Set dark mode to a specific value.
     */
    setDarkMode(isDark, quasar) {
      this.darkMode = isDark
      saveTheme(isDark ? 'dark' : 'light', this._currentUserId)
      if (quasar) {
        quasar.dark.set(isDark)
      }
    },

    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen
    },

    collapseSidebar(collapsed) {
      this.sidebarCollapsed = collapsed
    },

    setLoading(loading) {
      this.loading = loading
    },

    updateNotificationPreferences(preferences) {
      this.notifications = { ...this.notifications, ...preferences }
    },
  },

  getters: {
    isDarkMode: (state) => state.darkMode,
    isSidebarOpen: (state) => state.sidebarOpen,
    isSidebarCollapsed: (state) => state.sidebarCollapsed,
    isLoading: (state) => state.loading,
    themeIcon: (state) => (state.darkMode ? 'light_mode' : 'dark_mode'),
    themeLabel: (state) => (state.darkMode ? 'Light Mode' : 'Dark Mode'),
  },
})
