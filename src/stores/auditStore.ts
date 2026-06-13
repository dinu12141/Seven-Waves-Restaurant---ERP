// ═══════════════════════════════════════════════════════════════════
// AUDIT STORE — Frontend Audit Trail Access
// Seven Waves ERP — Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

import { defineStore } from 'pinia'
import { supabase } from '../boot/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

interface AuditEntry {
  id: string
  user_id: string
  action: string
  table_name: string
  record_id: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  severity: string
  created_at: string
  // Joined fields
  user_name?: string
  user_email?: string
}

interface AuditFilter {
  module?: string
  action?: string
  userId?: string
  severity?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

interface AuditState {
  entries: AuditEntry[]
  totalCount: number
  loading: boolean
  error: string | null
  filter: AuditFilter
  page: number
  pageSize: number
  recentErrors: any[]
}

export const useAuditStore = defineStore('audit', {
  state: (): AuditState => ({
    entries: [],
    totalCount: 0,
    loading: false,
    error: null,
    filter: {},
    page: 1,
    pageSize: 50,
    recentErrors: [],
  }),

  getters: {
    hasMore: (state) => state.entries.length < state.totalCount,
    criticalCount: (state) => state.entries.filter((e) => e.severity === 'critical').length,
    warningCount: (state) => state.entries.filter((e) => e.severity === 'warning').length,
  },

  actions: {
    /** Fetch audit logs with filters and pagination */
    async fetchLogs() {
      this.loading = true
      this.error = null

      try {
        let q = supabase
          .from('audit_logs')
          .select('*, profiles!audit_logs_user_id_fkey(full_name, email)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((this.page - 1) * this.pageSize, this.page * this.pageSize - 1)

        // Apply filters
        if (this.filter.action) q = q.eq('action', this.filter.action)
        if (this.filter.userId) q = q.eq('user_id', this.filter.userId)
        if (this.filter.severity) q = q.eq('severity', this.filter.severity)
        if (this.filter.module) q = q.eq('table_name', this.filter.module)
        if (this.filter.dateFrom) q = q.gte('created_at', this.filter.dateFrom)
        if (this.filter.dateTo) q = q.lte('created_at', this.filter.dateTo)

        const { data, error } = await q

        if (error) throw error
        if (data) {
          this.entries = (data as any[]).map((e: any) => ({
            ...e,
            user_name: e.profiles?.full_name,
            user_email: e.profiles?.email,
          }))
        }
      } catch (err: any) {
        this.error = err.message || 'Failed to load audit logs'
      } finally {
        this.loading = false
      }
    },

    /** Load frontend error history (uses errorHandler when available) */
    loadRecentErrors() {
      try {
        // Dynamic import to avoid circular dependency
        import('../core/errors/ErrorHandler').then(({ errorHandler }) => {
          this.recentErrors = errorHandler.getRecentErrors()
        })
      } catch { this.recentErrors = [] }
    },

    /** Update filter and reload */
    setFilter(filter: Partial<AuditFilter>) {
      this.filter = { ...this.filter, ...filter }
      this.page = 1
      this.fetchLogs()
    },

    /** Go to next page */
    nextPage() {
      if (this.hasMore) {
        this.page++
        this.fetchLogs()
      }
    },

    /** Cleanup on logout */
    cleanup() {
      this.$reset()
    },
  },
})
