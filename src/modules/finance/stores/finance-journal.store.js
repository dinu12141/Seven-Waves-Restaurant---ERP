import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { financeJournalService } from '../services/finance-journal.service'
import { useFinanceLedgerStore } from './finance-ledger.store'
import { useFinanceCashbookStore } from './finance-cashbook.store'

export const useFinanceJournalStore = defineStore('financeJournal', () => {
  const entries = ref([])
  const loading = ref(false)
  const error = ref(null)
  const selectedEntry = ref(null)

  const activeEntries = computed(() => entries.value.filter((e) => !e.is_reversed))
  const reversedEntries = computed(() => entries.value.filter((e) => e.is_reversed))

  async function fetchEntries(filters = {}) {
    loading.value = true
    error.value = null
    try {
      entries.value = await financeJournalService.list(filters)
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function getEntryById(id) {
    loading.value = true
    error.value = null
    try {
      const res = await financeJournalService.getById(id)
      selectedEntry.value = res
      return res
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createEntry(header, lines) {
    const result = await financeJournalService.create(header, lines)
    entries.value.unshift(result)
    // Refresh ledger store and cashbook store so balances everywhere reflect instantly
    useFinanceLedgerStore().fetchLedgers().catch(() => {})
    useFinanceCashbookStore().fetchPettyCash().catch(() => {})
    return result
  }

  async function reverseEntry(id, reason) {
    const result = await financeJournalService.reverse(id, reason)
    const idx = entries.value.findIndex((e) => e.id === id)
    if (idx !== -1) {
      entries.value[idx].is_reversed = true
      entries.value[idx].reversed_by_id = result.id
    }
    entries.value.unshift(result)
    useFinanceLedgerStore().fetchLedgers().catch(() => {})
    useFinanceCashbookStore().fetchPettyCash().catch(() => {})
    return result
  }

  return {
    entries,
    loading,
    error,
    selectedEntry,
    activeEntries,
    reversedEntries,
    fetchEntries,
    getEntryById,
    createEntry,
    reverseEntry,
  }
})
