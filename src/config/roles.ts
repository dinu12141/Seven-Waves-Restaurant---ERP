/**
 * Role-Based Access Control (RBAC) Configuration
 *
 * Defines which routes each role can access.
 * The router guard and sidebar will use this as the single source of truth.
 *
 * Rules:
 *   Waiter:  POS, Orders (accept only)
 *   Kitchen: Kitchen Display only
 *   Cashier: POS, Payments
 *   Manager: Dashboard, Reports
 *   Admin:   Full access (bypasses all checks)
 */

import type { UserRole } from 'src/stores/auth'

/** Route paths each role is allowed to visit */
export const ROLE_ROUTE_ACCESS: Record<UserRole, string[]> = {
  waiter: ['/pos', '/orders', '/waiter'],
  kitchen: ['/kitchen'],
  cashier: ['/pos', '/orders', '/cashier'], // cashier needs orders for payment context
  manager: ['/dashboard', '/orders', '/inventory', '/finance', '/kitchen', '/operations/tables'],
  admin: ['*'], // wildcard — admin has full access
  inventory: ['/inventory'],
  finance: ['/finance'],
  hr: ['/hr'],
  procurement: ['/procurement'],
}

/** The default landing page for each role after login */
export const ROLE_LANDING: Record<UserRole, string> = {
  waiter: '/waiter',
  cashier: '/pos',
  kitchen: '/kitchen',
  inventory: '/inventory',
  finance: '/finance',
  hr: '/hr',
  procurement: '/procurement/suppliers',
  manager: '/dashboard',
  admin: '/dashboard',
}

/** Role-specific feature restrictions within pages */
export interface RolePageRestrictions {
  /** On the Orders page, waiter can only accept orders (no cancel, no advance beyond accept) */
  ordersAcceptOnly: boolean
  /** On the POS page, whether the user can process payments */
  canProcessPayment: boolean
  /** On the POS page, whether the user can send to kitchen */
  canSendToKitchen: boolean
}

export function getRoleRestrictions(roles: UserRole[]): RolePageRestrictions {
  const isAdmin = roles.includes('admin')
  const isManager = roles.includes('manager')
  const isWaiter = roles.includes('waiter')
  const isCashier = roles.includes('cashier')

  return {
    // Waiter can ONLY accept orders (not cancel, not advance to served, etc.)
    ordersAcceptOnly: isWaiter && !isAdmin && !isManager && !isCashier,
    // Only cashier, manager, admin can process payment
    canProcessPayment: isAdmin || isManager || isCashier,
    // Waiter and above can send to kitchen
    canSendToKitchen: isAdmin || isManager || isWaiter || isCashier,
  }
}

/**
 * Sidebar navigation items with their role requirements.
 * Only items whose roles match the user's roles will be displayed.
 */
export interface NavItem {
  label: string
  icon: string
  to?: string
  roles: UserRole[]
  /** Optional separator label to show before this item */
  section?: string
  /** Optional module code — nav item hidden when this module is disabled */
  moduleCode?: string
  /** Optional nested children */
  children?: NavItem[]
}

export const NAV_ITEMS: NavItem[] = [
  // ─── MAIN ──────────────────────────────────────────────────────────────────
  {
    label: 'Dashboard',
    icon: 'space_dashboard',
    to: '/dashboard',
    roles: ['admin', 'manager'],
    section: 'MAIN',
  },

  // ─── OPERATIONS ────────────────────────────────────────────────────────────
  {
    label: 'Point of Sale',
    icon: 'point_of_sale',
    to: '/pos',
    roles: ['admin', 'manager', 'cashier', 'waiter'],
    section: 'OPERATIONS',
  },
  {
    label: 'Orders',
    icon: 'receipt_long',
    to: '/orders',
    roles: ['admin', 'manager', 'waiter', 'cashier'],
  },
  {
    label: 'Kitchen Display',
    icon: 'soup_kitchen',
    to: '/kitchen',
    roles: ['admin', 'manager', 'kitchen'],
  },
  {
    label: 'Cashier Station',
    icon: 'local_atm',
    to: '/cashier',
    roles: ['admin', 'manager', 'cashier'],
  },
  {
    label: 'Waiter Station',
    icon: 'room_service',
    to: '/waiter',
    roles: ['admin', 'manager', 'waiter'],
  },
  {
    label: 'Table Management',
    icon: 'table_restaurant',
    to: '/operations/tables',
    roles: ['admin', 'manager'],
  },
  {
    label: 'Inventory',
    icon: 'inventory_2',
    to: '/inventory',
    roles: ['admin', 'manager', 'inventory'],
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
  },

  // ─── PROCUREMENT ───────────────────────────────────────────────────────────
  {
    label: 'Procurement',
    icon: 'shopping_cart',
    roles: ['admin', 'manager', 'inventory', 'finance', 'procurement'],
    section: 'PROCUREMENT',
    children: [
      {
        label: 'Suppliers',
        icon: 'local_shipping',
        to: '/procurement/suppliers',
        roles: ['admin', 'manager', 'inventory', 'procurement'],
      },
      {
        label: 'Purchase Orders',
        icon: 'assignment',
        to: '/procurement/purchase-orders',
        roles: ['admin', 'manager', 'inventory', 'procurement'],
      },
      {
        label: 'Goods Receipt',
        icon: 'move_to_inbox',
        to: '/procurement/grn',
        roles: ['admin', 'manager', 'inventory', 'procurement'],
      },
      {
        label: 'AP Invoices',
        icon: 'request_quote',
        to: '/procurement/ap-invoices',
        roles: ['admin', 'manager', 'inventory', 'finance', 'procurement'],
      },
      {
        label: 'Supplier Payments',
        icon: 'payments',
        to: '/procurement/payments',
        roles: ['admin', 'manager', 'finance', 'procurement'],
      },
      {
        label: 'Purchase Returns',
        icon: 'assignment_return',
        to: '/procurement/returns',
        roles: ['admin', 'manager', 'inventory', 'procurement'],
      },
      {
        label: 'Reports',
        icon: 'bar_chart',
        to: '/procurement/reports',
        roles: ['admin', 'manager', 'finance', 'procurement'],
      },
    ],
  },

  // ─── FINANCE ───────────────────────────────────────────────────────────────
  {
    label: 'Finance',
    icon: 'account_balance',
    to: '/finance',
    roles: ['admin', 'manager', 'finance'],
    section: 'FINANCE',
    moduleCode: 'FINANCE',
  },

  // ─── HR ────────────────────────────────────────────────────────────────────
  {
    label: 'HR & Payroll',
    icon: 'badge',
    to: '/hr',
    roles: ['admin', 'manager', 'hr'],
    section: 'HR',
    moduleCode: 'HR',
  },

  // ─── SYSTEM ────────────────────────────────────────────────────────────────
  {
    label: 'Admin Settings',
    icon: 'admin_panel_settings',
    to: '/admin',
    roles: ['admin'],
    section: 'SYSTEM',
  },
]

/**
 * Check if a user with the given roles can access a route path.
 */
export function canAccessRoute(userRoles: UserRole[], routePath: string): boolean {
  // Admin bypasses all checks
  if (userRoles.includes('admin')) return true

  // Check if any of the user's roles grant access to this path
  return userRoles.some((role) => {
    const allowedPaths = ROLE_ROUTE_ACCESS[role]
    if (!allowedPaths) return false
    if (allowedPaths.includes('*')) return true
    return allowedPaths.some((p) => routePath.startsWith(p))
  })
}

/**
 * Get filtered navigation items based on user roles.
 */
export function getFilteredNavItems(userRoles: UserRole[]): NavItem[] {
  function filterItems(items: NavItem[]): NavItem[] {
    return items
      .filter((item) => {
        // If user is admin, show everything.
        // Otherwise check if user has at least one role matching the item roles
        if (userRoles.includes('admin')) return true
        return item.roles.some((role) => userRoles.includes(role))
      })
      .map((item) => {
        // Recursively filter children if they exist
        if (item.children) {
          return {
            ...item,
            children: filterItems(item.children),
          }
        }
        return item
      })
      .filter((item) => {
        // If it has children but none passed the filter, hide the parent too (unless it has a 'to')
        if (item.children && item.children.length === 0 && !item.to) {
          return false
        }
        return true
      })
  }

  return filterItems(NAV_ITEMS)
}
