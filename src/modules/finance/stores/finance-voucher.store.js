import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { financeVoucherService } from '../services/finance-voucher.service'
import { useFinanceAccountStore } from './finance-account.store'
import { useFinanceLedgerStore } from './finance-ledger.store'

export const useFinanceVoucherStore = defineStore('financeVoucher', () => {
  const vouchers = ref([])
  const approvalQueue = ref([])
  const loading = ref(false)
  const error = ref(null)
  const selectedVoucher = ref(null)

  const payVouchers = computed(() => vouchers.value.filter(v => v.voucher_type === 'pay'))
  const receivedVouchers = computed(() => vouchers.value.filter(v => v.voucher_type === 'received'))
  const draftVouchers = computed(() => vouchers.value.filter(v => v.status === 'draft'))
  const postedVouchers = computed(() => vouchers.value.filter(v => v.status === 'posted'))

  // Realtime calls fetchVouchers() without arguments — keep the page's filters.
  let lastFilters = {}
  async function fetchVouchers(filters) {
    if (filters) lastFilters = { ...filters }
    loading.value = true; error.value = null
    try { vouchers.value = await financeVoucherService.list(lastFilters) }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  async function fetchApprovalQueue(filters = {}) {
    loading.value = true
    try { approvalQueue.value = await financeVoucherService.getApprovalQueue(filters) }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }

  async function createPayVoucher(data) {
    const result = await financeVoucherService.createPayVoucher(data)
    vouchers.value.unshift(result)
    return result
  }

  async function createReceivedVoucher(data) {
    const result = await financeVoucherService.createReceivedVoucher(data)
    vouchers.value.unshift(result)
    return result
  }

  async function submitVoucher(id) {
    const result = await financeVoucherService.submitVoucher(id)
    _replaceVoucher(id, result)
    return result
  }

  async function approveVoucher(id, autoPost = true) {
    let result
    try {
      result = await financeVoucherService.approveVoucher(id, autoPost)
    } catch (e) {
      // Approved but the post failed: the voucher is now 'approved' — show that.
      if (e?.approved) {
        approvalQueue.value = approvalQueue.value.filter(v => v.id !== id)
        financeVoucherService.getById(id).then(v => _replaceVoucher(id, v)).catch(() => {})
      }
      throw e
    }
    _replaceVoucher(id, result)
    approvalQueue.value = approvalQueue.value.filter(v => v.id !== id)
    useFinanceAccountStore().fetchAccounts().catch(() => {})
    useFinanceLedgerStore().fetchLedgers().catch(() => {})
    return result
  }

  async function rejectVoucher(id, reason) {
    const result = await financeVoucherService.rejectVoucher(id, reason)
    _replaceVoucher(id, result)
    approvalQueue.value = approvalQueue.value.filter(v => v.id !== id)
    return result
  }

  async function postVoucher(id) {
    const result = await financeVoucherService.postVoucher(id)
    _replaceVoucher(id, result)
    useFinanceAccountStore().fetchAccounts().catch(() => {})
    useFinanceLedgerStore().fetchLedgers().catch(() => {})
    return result
  }

  async function cancelVoucher(id, reason) {
    const result = await financeVoucherService.cancelVoucher(id, reason)
    _replaceVoucher(id, result)
    useFinanceAccountStore().fetchAccounts().catch(() => {})
    useFinanceLedgerStore().fetchLedgers().catch(() => {})
    return result
  }

  async function updateVoucher(id, data) {
    const result = await financeVoucherService.updateVoucher(id, data)
    _replaceVoucher(id, result)
    return result
  }

  function _replaceVoucher(id, data) {
    const idx = vouchers.value.findIndex(v => v.id === id)
    if (idx !== -1) vouchers.value[idx] = { ...vouchers.value[idx], ...data }
  }

  return { vouchers, approvalQueue, loading, error, selectedVoucher, payVouchers, receivedVouchers, draftVouchers, postedVouchers, fetchVouchers, fetchApprovalQueue, createPayVoucher, createReceivedVoucher, submitVoucher, approveVoucher, rejectVoucher, postVoucher, cancelVoucher, updateVoucher }
})
