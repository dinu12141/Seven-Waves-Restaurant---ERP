import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { financeAccountService } from '../services/finance-account.service'

export const useFinanceAccountStore = defineStore('financeAccount', () => {
  const accounts = ref([])
  const loading = ref(false)
  const error = ref(null)

  const activeAccounts = computed(() => accounts.value.filter(a => a.is_active))
  const bankAccounts = computed(() => activeAccounts.value.filter(a => a.account_type === 'bank'))
  const cashAccounts = computed(() => activeAccounts.value.filter(a => a.account_type === 'cash'))
  const pettyCashAccounts = computed(() => activeAccounts.value.filter(a => a.account_type === 'petty_cash'))
  const defaultAccount = computed(() => activeAccounts.value.find(a => a.is_default))

  async function fetchAccounts(filters = {}) {
    loading.value = true; error.value = null
    try { accounts.value = await financeAccountService.list(filters) }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  // Same list, annotated with the linked ledger's GL balance and link problems.
  async function fetchAccountsWithGl(filters = {}) {
    loading.value = true; error.value = null
    try { accounts.value = await financeAccountService.listWithGl(filters) }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  async function createAccount(data) {
    const result = await financeAccountService.create(data)
    accounts.value.unshift(result)
    return result
  }

  async function updateAccount(id, data) {
    const result = await financeAccountService.update(id, data)
    const idx = accounts.value.findIndex(a => a.id === id)
    // Replace the whole array so Quasar's q-table reliably re-renders the row.
    if (idx !== -1) {
      const next = accounts.value.slice()
      next[idx] = result
      accounts.value = next
    }
    return result
  }

  async function deleteAccount(id) {
    await financeAccountService.remove(id)
    accounts.value = accounts.value.filter(a => a.id !== id)
    return true
  }

  return { accounts, loading, error, activeAccounts, bankAccounts, cashAccounts, pettyCashAccounts, defaultAccount, fetchAccounts, fetchAccountsWithGl, createAccount, updateAccount, deleteAccount }
})
