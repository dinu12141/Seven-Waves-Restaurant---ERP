import { defineStore } from 'pinia'
import { ref } from 'vue'
import { financeStatementsService } from '../services/finance-statements.service'

export const useFinanceStatementsStore = defineStore('financeStatements', () => {
  const trialBalance = ref(null)
  const profitLoss = ref(null)
  const balanceSheet = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function fetchTrialBalance(filters = {}) {
    loading.value = true; error.value = null
    try { trialBalance.value = await financeStatementsService.generateTrialBalance(filters) }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  async function fetchProfitLoss(filters = {}) {
    loading.value = true; error.value = null
    try { profitLoss.value = await financeStatementsService.generateProfitLoss(filters) }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  async function fetchBalanceSheet(filters = {}) {
    loading.value = true; error.value = null
    try { balanceSheet.value = await financeStatementsService.generateBalanceSheet(filters) }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  // Builds all three statements from one data load so the tabs never show
  // results generated from different filters.
  async function fetchAll(filters = {}) {
    loading.value = true; error.value = null
    try {
      const all = await financeStatementsService.generateAll(filters)
      trialBalance.value = all.trialBalance
      profitLoss.value = all.profitLoss
      balanceSheet.value = all.balanceSheet
    }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  return { trialBalance, profitLoss, balanceSheet, loading, error, fetchTrialBalance, fetchProfitLoss, fetchBalanceSheet, fetchAll }
})
