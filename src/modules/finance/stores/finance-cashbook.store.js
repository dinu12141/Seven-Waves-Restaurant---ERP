import { defineStore } from 'pinia'
import { ref } from 'vue'
import { financeCashbookService } from '../services/finance-cashbook.service'

const EMPTY_TOTALS = { opening: 0, debit: 0, credit: 0, closing: 0, shown_debit: 0, shown_credit: 0 }

export const useFinanceCashbookStore = defineStore('financeCashbook', () => {
  // Cashbook (cash & bank ledgers)
  const report = ref(null)
  const entries = ref([])
  // Petty Cash Book (petty cash ledgers)
  const pettyReport = ref(null)
  const pettyCashEntries = ref([])

  const totals = ref({ ...EMPTY_TOTALS })
  const loading = ref(false)
  const error = ref(null)

  // Realtime handlers / other stores call fetchCashbook() / fetchPettyCash()
  // without arguments — reuse the filters the page last applied instead of
  // silently resetting them.
  let lastCashFilters = {}
  let lastPettyFilters = {}
  let cashSeq = 0
  let pettySeq = 0
  const REFRESH_DEBOUNCE_MS = 1500
  const timers = {}

  // Argument-less calls come from realtime (one per GL leg) — collapse a burst
  // into one reload, and skip it entirely while the page was never opened.
  function debounced(key, loaded, fn) {
    if (!loaded) return Promise.resolve()
    const t = (timers[key] ||= { id: null, waiters: [] })
    clearTimeout(t.id)
    return new Promise((resolve) => {
      t.waiters.push(resolve)
      t.id = setTimeout(() => {
        const waiters = t.waiters.splice(0)
        fn().finally(() => waiters.forEach((w) => w()))
      }, REFRESH_DEBOUNCE_MS)
    })
  }

  async function fetchCashbook(filters) {
    if (!filters) return debounced('cash', report.value, loadCashbook)
    lastCashFilters = { ...filters }
    return loadCashbook()
  }

  async function loadCashbook() {
    const seq = ++cashSeq
    loading.value = true; error.value = null
    try {
      const r = await financeCashbookService.getReport(lastCashFilters)
      if (seq !== cashSeq) return // a newer request superseded this one
      report.value = r
      entries.value = r.rows
      totals.value = r.totals
    } catch (e) { if (seq === cashSeq) error.value = e.message }
    finally { if (seq === cashSeq) loading.value = false }
  }

  async function fetchPettyCash(filters) {
    if (!filters) return debounced('petty', pettyReport.value, loadPettyCash)
    lastPettyFilters = { ...filters }
    return loadPettyCash()
  }

  async function loadPettyCash() {
    const seq = ++pettySeq
    loading.value = true; error.value = null
    try {
      const r = await financeCashbookService.getPettyCashReport(lastPettyFilters)
      if (seq !== pettySeq) return
      pettyReport.value = r
      pettyCashEntries.value = r.rows
    } catch (e) { if (seq === pettySeq) error.value = e.message }
    finally { if (seq === pettySeq) loading.value = false }
  }

  return { report, entries, pettyReport, pettyCashEntries, totals, loading, error, fetchCashbook, fetchPettyCash }
})
