import { useAuthStore, type UserRole } from 'src/stores/auth'
import { useQuasar } from 'quasar'

export function useToolbarPermissions() {
  const authStore = useAuthStore()
  const $q = useQuasar()

  // Module to Roles that can CREATE/EDIT
  const writeMatrix: Record<string, UserRole[]> = {
    orders: ['admin', 'manager', 'cashier', 'waiter'],
    inventory: ['admin', 'manager', 'inventory'],
    hr: ['admin', 'hr'],
    finance: ['admin', 'finance', 'manager'],
  }

  // Module to Roles that can EXPORT
  const exportMatrix: Record<string, UserRole[]> = {
    orders: ['admin', 'manager', 'finance'],
    inventory: ['admin', 'manager', 'finance'],
    hr: ['admin', 'hr'],
    finance: ['admin', 'finance'],
  }

  const checkRole = (allowedRoles: UserRole[]) => {
    return authStore.hasAnyRole(allowedRoles)
  }

  const canPerformAction = (module: string, action: string) => {
    if (action === 'export') return canExportData(module)
    if (action === 'create') return canCreateRecord(module)
    return true
  }

  const canCreateRecord = (module: string) => {
    // Basic write permissions validation
    const allowed = writeMatrix[module] || (['admin'] as UserRole[])
    return checkRole(allowed)
  }

  const canExportData = (module: string) => {
    const allowed = exportMatrix[module] || (['admin'] as UserRole[])
    return checkRole(allowed)
  }

  const requireConfirmation = (actionDesc: string) => {
    return new Promise<boolean>((resolve) => {
      $q.dialog({
        title: 'Confirm Operation',
        message: `Are you sure you want to ${actionDesc}?`,
        cancel: true,
        persistent: true,
        dark: true,
        color: 'negative',
      })
        .onOk(() => {
          resolve(true)
        })
        .onCancel(() => {
          resolve(false)
        })
    })
  }

  return {
    canPerformAction,
    canCreateRecord,
    canExportData,
    requireConfirmation,
  }
}
