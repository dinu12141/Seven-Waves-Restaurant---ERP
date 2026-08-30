import { describe, it, expect } from 'vitest'
import {
  ROLE_ROUTE_ACCESS,
  ROLE_LANDING,
  ROLE_PRIORITY,
  getRoleRestrictions,
  canAccessRoute,
  getFilteredNavItems,
  type NavItem,
} from '../../config/roles'
import { hasPermission, hasModuleAccess } from '../rbac/permissions'

describe('Comprehensive User Role, Permission & Access Audit Suite', () => {
  // ─── 1. HR Role Audit ──────────────────────────────────────────────────
  describe('HR Role Access & Capabilities', () => {
    const hrRole = ['hr'] as const

    it('HR lands on /hr by default', () => {
      expect(ROLE_LANDING.hr).toBe('/hr')
    })

    it('HR has access to HR management and Biometric Attendance routes', () => {
      expect(canAccessRoute(hrRole as any, '/hr')).toBe(true)
      expect(canAccessRoute(hrRole as any, '/hr/employees')).toBe(true)
      expect(canAccessRoute(hrRole as any, '/hr/payroll')).toBe(true)
      expect(canAccessRoute(hrRole as any, '/hr/attendance')).toBe(true)
      expect(canAccessRoute(hrRole as any, '/reports/hr')).toBe(true)
      expect(canAccessRoute(hrRole as any, '/devices/biometrics')).toBe(true)
    })

    it('HR is blocked from unauthorized financial journal posting & cashier POS', () => {
      expect(canAccessRoute(hrRole as any, '/pos')).toBe(false)
      expect(canAccessRoute(hrRole as any, '/finance/journal')).toBe(false)
      expect(canAccessRoute(hrRole as any, '/admin/settings')).toBe(false)
    })

    it('HR has fine-grained permissions for payroll, employees, leaves, attendance', () => {
      expect(hasPermission(hrRole as any, 'hr.employee.create')).toBe(true)
      expect(hasPermission(hrRole as any, 'hr.payroll.run')).toBe(true)
      expect(hasPermission(hrRole as any, 'hr.leave.approve')).toBe(true)
      expect(hasPermission(hrRole as any, 'devices.biometrics.sync')).toBe(true)
      expect(hasPermission(hrRole as any, 'finance.journal.post')).toBe(false)
    })

    it('HR sidebar displays HR and Biometric navigation items', () => {
      const nav = getFilteredNavItems(hrRole as any)
      const labels = nav.map((i: NavItem) => i.label)
      expect(labels).toContain('Employees')
      expect(labels).not.toContain('Point of Sale')
    })
  })

  // ─── 2. Finance Role Audit ─────────────────────────────────────────────
  describe('Finance Role Access & Capabilities', () => {
    const financeRole = ['finance'] as const

    it('Finance lands on /finance by default', () => {
      expect(ROLE_LANDING.finance).toBe('/finance')
    })

    it('Finance has access to ledgers, invoices, AP, cashflow, and financial reports', () => {
      expect(canAccessRoute(financeRole as any, '/finance')).toBe(true)
      expect(canAccessRoute(financeRole as any, '/finance/ledgers')).toBe(true)
      expect(canAccessRoute(financeRole as any, '/finance/invoices')).toBe(true)
      expect(canAccessRoute(financeRole as any, '/reports')).toBe(true)
      expect(canAccessRoute(financeRole as any, '/reports/financial')).toBe(true)
    })

    it('Finance is blocked from kitchen display and waiter POS ordering', () => {
      expect(canAccessRoute(financeRole as any, '/kitchen')).toBe(false)
      expect(canAccessRoute(financeRole as any, '/waiter-app')).toBe(false)
    })

    it('Finance has fine-grained permissions for journals, AP payments, and audits', () => {
      expect(hasPermission(financeRole as any, 'finance.journal.create')).toBe(true)
      expect(hasPermission(financeRole as any, 'finance.journal.post')).toBe(true)
      expect(hasPermission(financeRole as any, 'procurement.payment.process')).toBe(true)
      expect(hasPermission(financeRole as any, 'pos.order.create')).toBe(false)
    })

    it('Finance sidebar displays Finance and Reports navigation items', () => {
      const nav = getFilteredNavItems(financeRole as any)
      const labels = nav.map((i: NavItem) => i.label)
      expect(labels).toContain('Finance')
      expect(labels).not.toContain('Kitchen Display')
    })
  })

  // ─── 3. Stores / Inventory Role Audit ──────────────────────────────────
  describe('Stores & Inventory Role Access & Capabilities', () => {
    const inventoryRole = ['inventory'] as const

    it('Inventory lands on /inventory by default', () => {
      expect(ROLE_LANDING.inventory).toBe('/inventory')
    })

    it('Inventory has access to stock count, recipes, GRN receipts, and inventory reports', () => {
      expect(canAccessRoute(inventoryRole as any, '/inventory')).toBe(true)
      expect(canAccessRoute(inventoryRole as any, '/inventory/stock-count')).toBe(true)
      expect(canAccessRoute(inventoryRole as any, '/inventory/recipes')).toBe(true)
      expect(canAccessRoute(inventoryRole as any, '/reports/inventory')).toBe(true)
      expect(canAccessRoute(inventoryRole as any, '/procurement')).toBe(true)
    })

    it('Inventory is blocked from HR employee salary access and cashier payments', () => {
      expect(canAccessRoute(inventoryRole as any, '/hr/payroll')).toBe(false)
      expect(canAccessRoute(inventoryRole as any, '/pos')).toBe(false)
    })

    it('Inventory has fine-grained permissions for stock adjustments, batches, and counts', () => {
      expect(hasPermission(inventoryRole as any, 'inventory.stock.adjust')).toBe(true)
      expect(hasPermission(inventoryRole as any, 'inventory.stock.count')).toBe(true)
      expect(hasPermission(inventoryRole as any, 'inventory.waste.record')).toBe(true)
      expect(hasPermission(inventoryRole as any, 'hr.payroll.run')).toBe(false)
    })

    it('Inventory sidebar displays Stock Levels, Recipes / BOM, and Stock Adjustment', () => {
      const nav = getFilteredNavItems(inventoryRole as any)
      const labels = nav.map((i: NavItem) => i.label)
      expect(labels).toContain('Stock Levels')
      expect(labels).toContain('Stock Adjustment')
      expect(labels).not.toContain('Point of Sale')
    })
  })

  // ─── 4. Waiter Role Audit ──────────────────────────────────────────────
  describe('Waiter Role Access & Capabilities', () => {
    const waiterRole = ['waiter'] as const

    it('Waiter lands on /waiter-app by default', () => {
      expect(ROLE_LANDING.waiter).toBe('/waiter-app')
    })

    it('Waiter has access to POS, Table Order entry, and Orders page', () => {
      expect(canAccessRoute(waiterRole as any, '/pos')).toBe(true)
      expect(canAccessRoute(waiterRole as any, '/orders')).toBe(true)
      expect(canAccessRoute(waiterRole as any, '/waiter-app')).toBe(true)
    })

    it('Waiter is blocked from Finance, HR, Inventory and Admin settings', () => {
      expect(canAccessRoute(waiterRole as any, '/finance')).toBe(false)
      expect(canAccessRoute(waiterRole as any, '/hr')).toBe(false)
      expect(canAccessRoute(waiterRole as any, '/inventory')).toBe(false)
      expect(canAccessRoute(waiterRole as any, '/admin/settings')).toBe(false)
    })

    it('Waiter has order restrictions: can punch/sendToKitchen but cannot process cashier payments or void arbitrary orders', () => {
      const restrictions = getRoleRestrictions(waiterRole as any)
      expect(restrictions.canSendToKitchen).toBe(true)
      expect(restrictions.canProcessPayment).toBe(false)
      expect(restrictions.ordersAcceptOnly).toBe(true)
    })
  })

  // ─── 5. Cashier Role Audit ─────────────────────────────────────────────
  describe('Cashier Role Access & Capabilities', () => {
    const cashierRole = ['cashier'] as const

    it('Cashier lands on /pos by default', () => {
      expect(ROLE_LANDING.cashier).toBe('/pos')
    })

    it('Cashier has access to POS, Payments, Invoices, Kitchen Display, and Website Orders', () => {
      expect(canAccessRoute(cashierRole as any, '/pos')).toBe(true)
      expect(canAccessRoute(cashierRole as any, '/orders')).toBe(true)
      expect(canAccessRoute(cashierRole as any, '/kitchen')).toBe(true)
      expect(canAccessRoute(cashierRole as any, '/website-orders')).toBe(true)
    })

    it('Cashier is blocked from HR Payroll and Admin user creation', () => {
      expect(canAccessRoute(cashierRole as any, '/hr')).toBe(false)
      expect(canAccessRoute(cashierRole as any, '/admin/users')).toBe(false)
    })

    it('Cashier can process full payments, cash drawer triggers, and open/close shifts', () => {
      const restrictions = getRoleRestrictions(cashierRole as any)
      expect(restrictions.canProcessPayment).toBe(true)
      expect(restrictions.canSendToKitchen).toBe(true)
      expect(restrictions.ordersAcceptOnly).toBe(false)

      expect(hasPermission(cashierRole as any, 'pos.payment.cash')).toBe(true)
      expect(hasPermission(cashierRole as any, 'pos.shift.open')).toBe(true)
      expect(hasPermission(cashierRole as any, 'pos.shift.close')).toBe(true)
      expect(hasPermission(cashierRole as any, 'crm.loyalty.redeem')).toBe(true)
    })
  })

  // ─── 6. Manager Role Audit ─────────────────────────────────────────────
  describe('Manager Role Access & Capabilities', () => {
    const managerRole = ['manager'] as const

    it('Manager lands on /manager-app by default', () => {
      expect(ROLE_LANDING.manager).toBe('/manager-app')
    })

    it('Manager has supervisory access across POS, Operations, Tables, Inventory, Finance, Reports, and Devices', () => {
      expect(canAccessRoute(managerRole as any, '/dashboard')).toBe(true)
      expect(canAccessRoute(managerRole as any, '/operations/tables')).toBe(true)
      expect(canAccessRoute(managerRole as any, '/inventory')).toBe(true)
      expect(canAccessRoute(managerRole as any, '/finance')).toBe(true)
      expect(canAccessRoute(managerRole as any, '/reports')).toBe(true)
      expect(canAccessRoute(managerRole as any, '/hr')).toBe(true)
      expect(canAccessRoute(managerRole as any, '/devices')).toBe(true)
      expect(canAccessRoute(managerRole as any, '/devices/printers')).toBe(true)
      expect(canAccessRoute(managerRole as any, '/devices/health')).toBe(true)
    })

    it('Manager has permissions to approve voids, discounts, shift closes, and view audit logs', () => {
      const restrictions = getRoleRestrictions(managerRole as any)
      expect(restrictions.canProcessPayment).toBe(true)
      expect(restrictions.canSendToKitchen).toBe(true)
      expect(restrictions.ordersAcceptOnly).toBe(false)

      expect(hasPermission(managerRole as any, 'pos.order.void')).toBe(true)
      expect(hasPermission(managerRole as any, 'pos.discount.apply')).toBe(true)
      expect(hasPermission(managerRole as any, 'devices.printers.manage')).toBe(true)
      expect(hasPermission(managerRole as any, 'audit.view')).toBe(true)
    })
  })

  // ─── 7. Role Priority & Conflict Resolution ────────────────────────────
  describe('Role Priority and Multi-Role Resolution', () => {
    it('admin has highest priority over cashier/waiter', () => {
      expect(ROLE_PRIORITY[0]).toBe('admin')
      expect(ROLE_PRIORITY.indexOf('admin')).toBeLessThan(ROLE_PRIORITY.indexOf('cashier'))
      expect(ROLE_PRIORITY.indexOf('manager')).toBeLessThan(ROLE_PRIORITY.indexOf('waiter'))
    })

    it('Admin wildcard allows access to every route and permission', () => {
      expect(canAccessRoute(['admin'], '/any-random-route')).toBe(true)
      expect(hasPermission(['admin'], 'any.arbitrary.permission')).toBe(true)
      expect(hasModuleAccess(['admin'], 'ANY_MODULE')).toBe(true)
    })
  })
})
