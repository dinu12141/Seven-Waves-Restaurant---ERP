import { defineStore } from 'pinia'

const THEME_STORAGE_KEY = 'seven-waves-erp-theme'

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
 * Load saved theme from localStorage.
 * Returns 'dark', 'light', or null if no preference saved.
 */
function loadSavedTheme() {
  if (typeof localStorage === 'undefined') return null
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return null
}

/**
 * Persist theme choice to localStorage.
 */
function saveTheme(theme) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }
}

export const useUIStore = defineStore('ui', {
  state: () => ({
    darkMode: true, // Will be overridden in initTheme()
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
     * Initialize theme on app startup.
     * Priority: 1) localStorage  2) system preference  3) dark (default)
     * Call this from App.vue on mount.
     */
    initTheme(quasar) {
      const saved = loadSavedTheme()
      if (saved) {
        this.darkMode = saved === 'dark'
      } else {
        const system = getSystemPreference()
        this.darkMode = system === 'dark'
      }
      // Apply to Quasar
      quasar.dark.set(this.darkMode)

      // Listen for system preference changes (if no user override)
      if (typeof window !== 'undefined' && window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          // Only auto-switch if user hasn't saved a preference
          if (!loadSavedTheme()) {
            this.darkMode = e.matches
            quasar.dark.set(this.darkMode)
          }
        })
      }
    },

    /**
     * Toggle dark/light mode.
     * Persists choice and applies immediately.
     */
    toggleDarkMode(quasar) {
      this.darkMode = !this.darkMode
      saveTheme(this.darkMode ? 'dark' : 'light')
      if (quasar) {
        quasar.dark.set(this.darkMode)
      }
    },

    /**
     * Set dark mode to a specific value.
     */
    setDarkMode(isDark, quasar) {
      this.darkMode = isDark
      saveTheme(isDark ? 'dark' : 'light')
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
