/**
 * useBranchScope — S3-1
 *
 * Centralises the repeated authStore.currentBranch?.id + company_id pattern
 * that is duplicated across every store and page.
 *
 * Usage:
 *   const { branchId, companyId, requireBranch } = useBranchScope()
 *   if (!requireBranch()) return
 */
import { computed } from 'vue'
import { useAuthStore } from 'src/stores/auth'

export function useBranchScope() {
  const authStore = useAuthStore()

  /** Current branch UUID — null if not logged in or no branch assigned. */
  const branchId = computed<string | null>(() => authStore.currentBranch?.id ?? null)

  /** Current company UUID. */
  const companyId = computed<string | null>(
    () => authStore.currentBranch?.company_id ?? null,
  )

  /** Current user UUID. */
  const userId = computed<string | null>(() => authStore.user?.id ?? null)

  /** Returns true and logs nothing if branch is available.
   *  Returns false and logs a warning if branch is missing.
   *  Use as an early-exit guard in store actions. */
  function requireBranch(context = 'action'): boolean {
    if (!branchId.value) {
      console.warn(`[useBranchScope] ${context}: no branch assigned to current user`)
      return false
    }
    return true
  }

  /** Returns true if user has admin role. */
  const isAdmin = computed(() => authStore.hasAnyRole(['admin']))

  /** Returns true if user has manager or admin role. */
  const isManagerOrAdmin = computed(() => authStore.hasAnyRole(['admin', 'manager']))

  return {
    branchId,
    companyId,
    userId,
    isAdmin,
    isManagerOrAdmin,
    requireBranch,
  }
}
