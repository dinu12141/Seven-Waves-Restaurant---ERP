import { defineStore } from 'pinia'
import { ref } from 'vue'
import { financeChequeService } from '../services/finance-cheque.service'

export const useFinanceChequeStore = defineStore('financeCheque', () => {
  const cheques = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function fetchCheques(filters = {}) {
    loading.value = true; error.value = null
    try { cheques.value = await financeChequeService.list(filters) }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  async function updateStatus(id, status, extra) {
    const result = await financeChequeService.updateStatus(id, status, extra)
    const idx = cheques.value.findIndex(c => c.id === id)
    if (idx !== -1) cheques.value[idx] = { ...cheques.value[idx], ...result }
    return result
  }

  async function markCleared(id, date) { return updateStatus(id, 'cleared', { cleared_date: date }) }
  async function cancel(id, reason) { return updateStatus(id, 'cancelled', { cancelled_reason: reason }) }
  async function markBounced(id) { return updateStatus(id, 'bounced') }

  return { cheques, loading, error, fetchCheques, updateStatus, markCleared, cancel, markBounced }
})
