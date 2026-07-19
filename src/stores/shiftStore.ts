// ═══════════════════════════════════════════════════════════════════
// SHIFT STORE — POS Shift Lifecycle State Management
// Seven Waves ERP — POS Shift Management Module
// ═══════════════════════════════════════════════════════════════════

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from 'src/stores/auth'
import {
  getActiveShift,
  openShift as apiOpenShift,
  recordShiftPayment as apiRecordPayment,
  createCashMovement as apiCashMovement,
  closeShift as apiCloseShift,
  getShiftSummary as apiGetSummary,
  getShiftCashMovements as apiGetMovements,
  type ShiftSummary,
  type OpenShiftPayload,
} from 'src/services/pos/shiftService'
import { postShiftJournal } from 'src/services/pos/shiftFinanceService'

const TERMINAL_STORAGE_KEY = 'pos_terminal_id'

export const useShiftStore = defineStore('posShift', () => {
  // ── State ────────────────────────────────────────────────
  const activeShift = ref<ShiftSummary | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const terminalId = ref(typeof localStorage !== 'undefined' ? localStorage.getItem(TERMINAL_STORAGE_KEY) || 'POS-1' : 'POS-1')

  // ── Getters ──────────────────────────────────────────────
  const hasActiveShift = computed(() => !!activeShift.value && activeShift.value.status === 'open')
  const shiftId = computed(() => activeShift.value?.id || null)
  const isShiftOpen = computed(() => hasActiveShift.value)

  const shiftInfo = computed(() => {
    if (!activeShift.value) return null
    return {
      id: activeShift.value.id,
      terminalId: activeShift.value.terminal_id,
      cashierId: activeShift.value.cashier_id,
      openingFloat: activeShift.value.opening_cash_float,
      openedAt: activeShift.value.opened_at,
      cashSales: activeShift.value.cash_sales_total,
      cardSales: activeShift.value.card_sales_total,
      visaSales: activeShift.value.visa_sales_total || 0,
      masterSales: activeShift.value.master_sales_total || 0,
      qrSales: activeShift.value.qr_sales_total,
      bankSales: activeShift.value.bank_sales_total,
      creditSales: activeShift.value.credit_sales_total,
      cashDrops: activeShift.value.cash_drops_total,
      cashIn: activeShift.value.cash_in_total,
      cashOut: activeShift.value.cash_out_total,
    }
  })

  // ── Actions ──────────────────────────────────────────────

  /** Check if there's an existing active shift for the current user/branch/terminal */
  async function checkActiveShift(): Promise<boolean> {
    const authStore = useAuthStore()
    const branchId = authStore.currentBranch?.id
    const cashierId = authStore.user?.id

    if (!branchId || !cashierId) {
      activeShift.value = null
      return false
    }

    loading.value = true
    error.value = null

    try {
      const shift = await getActiveShift(branchId, terminalId.value, cashierId)
      activeShift.value = shift
      return !!shift
    } catch (err: any) {
      console.error('[ShiftStore] checkActiveShift error:', err)
      error.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  /** Open a new shift */
  async function openShift(openingCashFloat: number, openingNote?: string): Promise<boolean> {
    const authStore = useAuthStore()
    const branchId = authStore.currentBranch?.id
    const cashierId = authStore.user?.id

    if (!branchId || !cashierId) {
      error.value = 'Branch or user not available'
      return false
    }

    loading.value = true
    error.value = null

    try {
      // Save terminal ID preference
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TERMINAL_STORAGE_KEY, terminalId.value)
      }

      const result = await apiOpenShift({
        branchId,
        terminalId: terminalId.value,
        cashierId,
        openingCashFloat,
        openingNote,
      })

      if (!result.success) {
        error.value = result.error || 'Failed to open shift'
        return false
      }

      // Fetch the full shift object
      await checkActiveShift()
      return true
    } catch (err: any) {
      error.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  /** Record a payment against the active shift */
  async function recordPayment(
    orderId: string,
    paymentMethod: string,
    amount: number,
  ): Promise<boolean> {
    if (!activeShift.value) {
      console.warn('[ShiftStore] No active shift — skipping payment recording')
      return false
    }

    // Map POS payment methods to shift payment methods
    const methodMap: Record<string, string> = {
      cash: 'cash',
      card: 'card',
      visa: 'visa',
      master: 'master',
      'credit card': 'card',
      'credit_card': 'card',
      online: 'qr',
      qr: 'qr',
      bank: 'bank',
      credit: 'credit',
    }

    const mappedMethod = methodMap[paymentMethod.toLowerCase()] || 'cash'

    try {
      const result = await apiRecordPayment({
        shiftId: activeShift.value.id,
        orderId,
        paymentMethod: mappedMethod as 'cash' | 'card' | 'qr' | 'bank' | 'credit' | 'visa' | 'master',
        amount,
      })

      if (result.success) {
        // Update local state
        await refreshShiftTotals()
      }
      return result.success
    } catch (err: any) {
      console.error('[ShiftStore] recordPayment error:', err)
      return false
    }
  }

  /** Create a cash movement (drop, in, out) */
  async function cashMovement(
    type: 'cash_drop' | 'cash_in' | 'cash_out',
    amount: number,
    reason?: string,
    approvedBy?: string,
  ): Promise<{ success: boolean; movementId?: string; error?: string }> {
    if (!activeShift.value) {
      return { success: false, error: 'No active shift' }
    }

    loading.value = true
    error.value = null

    try {
      const result = await apiCashMovement({
        shiftId: activeShift.value.id,
        type,
        amount,
        reason,
        approvedBy,
      })

      if (result.success) {
        await refreshShiftTotals()
      }
      return { success: result.success, movementId: result.movement_id, error: result.error }
    } catch (err: any) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  /** Close the active shift */
  async function closeShift(counts: {
    countedCash: number
    countedCardSlips?: number
    countedQrTotal?: number
    countedBankTotal?: number
    closingNote?: string
    approvedBy?: string
    approvalNote?: string
  }): Promise<{
    success: boolean
    error?: string
    requiresApproval?: boolean
    expectedCash?: number
    variance?: number
  }> {
    if (!activeShift.value) {
      return { success: false, error: 'No active shift to close' }
    }

    loading.value = true
    error.value = null

    try {
      const result = await apiCloseShift({
        shiftId: activeShift.value.id,
        ...counts,
      })

      if (!result.success) {
        if (result.requires_approval) {
          return {
            success: false,
            requiresApproval: true,
            expectedCash: result.expected_cash,
            variance: result.variance,
            error: result.error,
          }
        }
        error.value = result.error || 'Failed to close shift'
        return { success: false, error: result.error }
      }

      // Post journal entry
      const updatedShift = await apiGetSummary(activeShift.value.id)
      if (updatedShift) {
        const journalResult = await postShiftJournal(updatedShift)
        if (!journalResult.success) {
          console.error('[ShiftStore] Journal posting failed:', journalResult.error)
          // Don't fail the close — journal can be posted manually
        }
      }

      // Clear active shift
      activeShift.value = null

      return {
        success: true,
        expectedCash: result.expected_cash,
        variance: result.variance,
      }
    } catch (err: any) {
      error.value = err.message
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  /** Fetch fresh totals for the active shift */
  async function refreshShiftTotals() {
    if (!activeShift.value) return
    try {
      const fresh = await apiGetSummary(activeShift.value.id)
      if (fresh) {
        activeShift.value = fresh
      }
    } catch (err: any) {
      console.error('[ShiftStore] refreshShiftTotals error:', err)
    }
  }

  /** Fetch shift summary for any shift (including closed) */
  async function fetchShiftSummary(sid: string): Promise<ShiftSummary | null> {
    return await apiGetSummary(sid)
  }

  /** Fetch cash movements for the active shift */
  async function fetchCashMovements() {
    if (!activeShift.value) return []
    return await apiGetMovements(activeShift.value.id)
  }

  /** Set terminal ID (persisted to localStorage) */
  function setTerminalId(id: string) {
    terminalId.value = id
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TERMINAL_STORAGE_KEY, id)
    }
  }

  /** Cleanup on logout */
  function cleanup() {
    activeShift.value = null
    loading.value = false
    error.value = null
  }

  return {
    // state
    activeShift,
    loading,
    error,
    terminalId,
    // getters
    hasActiveShift,
    shiftId,
    isShiftOpen,
    shiftInfo,
    // actions
    checkActiveShift,
    openShift,
    recordPayment,
    cashMovement,
    closeShift,
    refreshShiftTotals,
    fetchShiftSummary,
    fetchCashMovements,
    setTerminalId,
    cleanup,
  }
})
