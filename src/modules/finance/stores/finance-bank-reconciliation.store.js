// ═══════════════════════════════════════════════════════════════════════════════
// Finance Bank Reconciliation Pinia Store
// ═══════════════════════════════════════════════════════════════════════════════

import { defineStore } from 'pinia'
import { financeBankReconciliationService } from '../services/finance-bank-reconciliation.service'

export const useFinanceBankReconciliationStore = defineStore('finance-bank-reconciliation', {
  state: () => ({
    reconciliations: [],
    currentRecon: null,
    loading: false,
    saving: false,
    activeLineFilter: 'all', // 'all' | 'debit' | 'credit' | 'matched' | 'unmatched'
    searchQuery: '',
    filters: {
      bank_account_id: null,
      status: null,
      month: null,
    },
  }),

  getters: {
    // ── KPI Summary Metrics for Top of Page ────────────────────────────────
    summaryMetrics: (state) => {
      const list = state.reconciliations || []
      const total = list.length
      const draft = list.filter((r) => r.status === 'draft').length
      const reconciled = list.filter((r) => r.status === 'reconciled').length
      const approved = list.filter((r) => r.status === 'approved' || r.status === 'locked').length
      const totalVariance = list
        .filter((r) => r.status === 'draft')
        .reduce((sum, r) => sum + Math.abs(Number(r.difference_amount) || 0), 0)

      return {
        total,
        draft,
        reconciled,
        approved,
        totalVariance,
      }
    },

    // ── Active Reconciliation Lines Breakdown ──────────────────────────────
    currentLines: (state) => state.currentRecon?.lines || [],

    filteredLines: (state) => {
      const lines = state.currentRecon?.lines || []
      const filter = state.activeLineFilter
      const q = (state.searchQuery || '').toLowerCase().trim()

      return lines.filter((line) => {
        // Tab / Category filter
        if (filter === 'debit' && !(Number(line.debit_amount) > 0)) return false
        if (filter === 'credit' && !(Number(line.credit_amount) > 0)) return false
        if (filter === 'matched' && !line.is_matched) return false
        if (filter === 'unmatched' && line.is_matched) return false

        // Text search
        if (q) {
          const text = `${line.description || ''} ${line.source_type || ''} ${line.note || ''}`.toLowerCase()
          const amountStr = `${line.debit_amount || ''} ${line.credit_amount || ''}`
          if (!text.includes(q) && !amountStr.includes(q)) return false
        }

        return true
      })
    },

    isCurrentBalanced: (state) => {
      if (!state.currentRecon) return false
      const diff = Math.abs(Number(state.currentRecon.difference_amount) || 0)
      return diff < 0.01
    },

    matchedDebitsTotal: (state) => {
      const lines = state.currentRecon?.lines || []
      return lines.filter((l) => l.is_matched).reduce((s, l) => s + (Number(l.debit_amount) || 0), 0)
    },

    matchedCreditsTotal: (state) => {
      const lines = state.currentRecon?.lines || []
      return lines.filter((l) => l.is_matched).reduce((s, l) => s + (Number(l.credit_amount) || 0), 0)
    },

    unpresentedChequesTotal: (state) => {
      const lines = state.currentRecon?.lines || []
      return lines
        .filter((l) => !l.is_matched && Number(l.debit_amount) > 0)
        .reduce((s, l) => s + (Number(l.debit_amount) || 0), 0)
    },

    unpresentedChequesCount: (state) => {
      const lines = state.currentRecon?.lines || []
      return lines.filter((l) => !l.is_matched && Number(l.debit_amount) > 0).length
    },

    unclearedDepositsTotal: (state) => {
      const lines = state.currentRecon?.lines || []
      return lines
        .filter((l) => !l.is_matched && Number(l.credit_amount) > 0)
        .reduce((s, l) => s + (Number(l.credit_amount) || 0), 0)
    },

    unclearedDepositsCount: (state) => {
      const lines = state.currentRecon?.lines || []
      return lines.filter((l) => !l.is_matched && Number(l.credit_amount) > 0).length
    },
  },

  actions: {
    async fetchReconciliations(customFilters) {
      this.loading = true
      try {
        const f = customFilters || this.filters
        this.reconciliations = await financeBankReconciliationService.list(f)
      } finally {
        this.loading = false
      }
    },

    async fetchReconciliationById(id) {
      this.loading = true
      try {
        const recon = await financeBankReconciliationService.getById(id)
        this.currentRecon = recon
        return recon
      } finally {
        this.loading = false
      }
    },

    async createReconciliation(payload, options) {
      this.saving = true
      try {
        const created = await financeBankReconciliationService.create(payload, options)
        await this.fetchReconciliations()
        return created
      } finally {
        this.saving = false
      }
    },

    async syncTransactions(reconId) {
      this.saving = true
      try {
        const updated = await financeBankReconciliationService.fetchAndPopulateTransactions(reconId)
        this.currentRecon = updated
        await this.fetchReconciliations()
        return updated
      } finally {
        this.saving = false
      }
    },

    async toggleMatch(lineId, isMatched) {
      // Optimistically update local line state for instant UI response
      const line = this.currentRecon?.lines?.find((l) => l.id === lineId)
      if (line) {
        line.is_matched = isMatched
      }

      const res = await financeBankReconciliationService.toggleMatch(lineId, isMatched)
      if (this.currentRecon?.id) {
        // Refetch full data to sync accurate difference and status
        this.currentRecon = await financeBankReconciliationService.getById(this.currentRecon.id)
        // Also update list entry
        const idx = this.reconciliations.findIndex((r) => r.id === this.currentRecon.id)
        if (idx !== -1) {
          this.reconciliations[idx] = {
            ...this.reconciliations[idx],
            difference_amount: this.currentRecon.difference_amount,
            system_balance: this.currentRecon.system_balance,
            status: this.currentRecon.status,
          }
        }
      }
      return res
    },

    async matchAll(reconId, shouldMatch = true) {
      this.saving = true
      try {
        const updated = await financeBankReconciliationService.matchAll(reconId, shouldMatch)
        this.currentRecon = updated
        await this.fetchReconciliations()
        return updated
      } finally {
        this.saving = false
      }
    },

    async addAdjustment(reconId, adj) {
      this.saving = true
      try {
        await financeBankReconciliationService.addAdjustment(reconId, adj)
        this.currentRecon = await financeBankReconciliationService.getById(reconId)
        await this.fetchReconciliations()
      } finally {
        this.saving = false
      }
    },

    async deleteLine(lineId) {
      this.saving = true
      try {
        await financeBankReconciliationService.deleteLine(lineId)
        if (this.currentRecon?.id) {
          this.currentRecon = await financeBankReconciliationService.getById(this.currentRecon.id)
          await this.fetchReconciliations()
        }
      } finally {
        this.saving = false
      }
    },

    async updateBalances(reconId, balances) {
      this.saving = true
      try {
        const updated = await financeBankReconciliationService.updateBalances(reconId, balances)
        this.currentRecon = updated
        await this.fetchReconciliations()
        return updated
      } finally {
        this.saving = false
      }
    },

    async approveReconciliation(id) {
      this.saving = true
      try {
        const res = await financeBankReconciliationService.approve(id)
        if (this.currentRecon?.id === id) {
          this.currentRecon = await financeBankReconciliationService.getById(id)
        }
        await this.fetchReconciliations()
        return res
      } finally {
        this.saving = false
      }
    },

    async lockReconciliation(id) {
      this.saving = true
      try {
        const res = await financeBankReconciliationService.lock(id)
        if (this.currentRecon?.id === id) {
          this.currentRecon = await financeBankReconciliationService.getById(id)
        }
        await this.fetchReconciliations()
        return res
      } finally {
        this.saving = false
      }
    },

    async reopenReconciliation(id, reason) {
      this.saving = true
      try {
        const res = await financeBankReconciliationService.reopen(id, reason)
        if (this.currentRecon?.id === id) {
          this.currentRecon = await financeBankReconciliationService.getById(id)
        }
        await this.fetchReconciliations()
        return res
      } finally {
        this.saving = false
      }
    },

    async deleteReconciliation(id) {
      this.saving = true
      try {
        await financeBankReconciliationService.deleteReconciliation(id)
        if (this.currentRecon?.id === id) {
          this.currentRecon = null
        }
        await this.fetchReconciliations()
      } finally {
        this.saving = false
      }
    },
  },
})
