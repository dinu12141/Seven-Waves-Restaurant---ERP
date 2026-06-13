import { defineStore } from 'pinia'
import { ref } from 'vue'
import { financeCashbookService } from '../services/finance-cashbook.service'

export const useFinanceCashbookStore = defineStore('financeCashbook', () => {
  const entries = ref([])
  const pettyCashEntries = ref([])
  const totals = ref({ totalDebit: 0, totalCredit: 0, balance: 0, count: 0 })
  const loading = ref(false)
  const error = ref(null)

  async function fetchCashbook(filters = {}) {
    loading.value = true; error.value = null
    try {
      entries.value = await financeCashbookService.getReport(filters)
      totals.value = await financeCashbookService.getTotals(filters)
    } catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  async function fetchPettyCash(filters = {}) {
    loading.value = true; error.value = null
    try { pettyCashEntries.value = await financeCashbookService.getPettyCashReport(filters) }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  return { entries, pettyCashEntries, totals, loading, error, fetchCashbook, fetchPettyCash }
})
