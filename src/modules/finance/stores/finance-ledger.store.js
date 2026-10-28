// ═══════════════════════════════════════════════════════════════════════════════
// Finance Ledger Store
// ═══════════════════════════════════════════════════════════════════════════════

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { financeLedgerService } from '../services/finance-ledger.service'

export const useFinanceLedgerStore = defineStore('financeLedger', () => {
  const ledgers = ref([])
  const loading = ref(false)
  const error = ref(null)
  const selectedLedger = ref(null)

  const activeLedgers = computed(() => ledgers.value.filter(l => l.is_active))
  const cashbookLedgers = computed(() => activeLedgers.value.filter(l => l.is_cashbook_ledger))
  const bankLedgers = computed(() => activeLedgers.value.filter(l => l.is_bank_ledger))
  const pettyCashLedgers = computed(() => activeLedgers.value.filter(l => l.is_petty_cash_ledger))

  const ledgersByType = computed(() => {
    const map = { asset: [], liability: [], equity: [], income: [], expense: [] }
    activeLedgers.value.forEach(l => { if (map[l.ledger_type]) map[l.ledger_type].push(l) })
    return map
  })

  async function fetchLedgers(filters = {}) {
    loading.value = true
    error.value = null
    try { ledgers.value = await financeLedgerService.list(filters) }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  // Same list, annotated with the GL balance (signed opening + Σ Dr − Cr),
  // stored-balance drift and statement-classification issues.
  async function fetchLedgersWithGl(filters = {}) {
    loading.value = true
    error.value = null
    try { ledgers.value = await financeLedgerService.listWithGl(filters) }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  async function createLedger(data) {
    const result = await financeLedgerService.create(data)
    ledgers.value.unshift(result)
    return result
  }

  async function updateLedger(id, data) {
    const result = await financeLedgerService.update(id, data)
    const idx = ledgers.value.findIndex(l => l.id === id)
    // Replace the whole array so q-table reliably re-renders the edited row.
    if (idx !== -1) {
      const next = ledgers.value.slice()
      next[idx] = result
      ledgers.value = next
    }
    return result
  }

  async function deactivateLedger(id) {
    await financeLedgerService.deactivate(id)
    const idx = ledgers.value.findIndex(l => l.id === id)
    if (idx !== -1) ledgers.value[idx].is_active = false
  }

  async function activateLedger(id) {
    const result = await financeLedgerService.activate(id)
    const idx = ledgers.value.findIndex(l => l.id === id)
    if (idx !== -1) ledgers.value[idx].is_active = true
    return result
  }

  async function deleteLedger(id) {
    await financeLedgerService.remove(id)
    ledgers.value = ledgers.value.filter(l => l.id !== id)
    return true
  }

  return { ledgers, loading, error, selectedLedger, activeLedgers, cashbookLedgers, bankLedgers, pettyCashLedgers, ledgersByType, fetchLedgers, fetchLedgersWithGl, createLedger, updateLedger, deactivateLedger, activateLedger, deleteLedger }
})
