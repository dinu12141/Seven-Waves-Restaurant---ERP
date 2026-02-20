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
  waiter: ['/pos', '/orders'],
  kitchen: ['/kitchen'],
  cashier: ['/pos', '/orders'], // cashier needs orders for payment context
  manager: ['/dashboard', '/orders', '/inventory', '/finance', '/kitchen'],
  admin: ['*'], // wildcard — admin has full access
  inventory: ['/inventory'],
  finance: ['/finance'],
  hr: ['/hr'],
  procurement: ['/procurement'],
}

/** The default landing page for each role after login */
export const ROLE_LANDING: Record<UserRole, string> = {
  waiter: '/pos',
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
  {
    label: 'Dashboard',
    icon: 'dashboard',
    to: '/dashboard',
    roles: ['admin', 'manager'],
    section: 'MAIN',
  },
  {
    label: 'POS',
    icon: 'point_of_sale',
    to: '/pos',
    roles: ['admin', 'manager', 'cashier', 'waiter'],
  },
  {
    label: 'Kitchen',
    icon: 'kitchen',
    to: '/kitchen',
    roles: ['admin', 'manager', 'kitchen'],
  },
  {
    label: 'Orders',
    icon: 'receipt_long',
    to: '/orders',
    roles: ['admin', 'manager', 'waiter', 'cashier'],
  },
  {
    label: 'Management',
    icon: 'business_center',
    roles: ['admin', 'manager', 'inventory', 'finance', 'hr'],
    section: 'MANAGEMENT',
    children: [
      {
        label: 'Inventory',
        icon: 'inventory_2',
        to: '/inventory',
        roles: ['admin', 'manager', 'inventory'],
        moduleCode: 'INVENTORY',
      },
      {
        label: 'Finance',
        icon: 'account_balance',
        to: '/finance',
        roles: ['admin', 'manager', 'finance'],
        moduleCode: 'FINANCE',
      },
      {
        label: 'HR & Payroll',
        icon: 'people',
        to: '/hr',
        roles: ['admin', 'manager', 'hr'],
        moduleCode: 'HR',
      },
    ],
  },
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
        label: 'Goods Receipt (GRN)',
        icon: 'inventory',
        to: '/procurement/grn',
        roles: ['admin', 'manager', 'inventory', 'procurement'],
      },
      {
        label: 'AP Invoices',
        icon: 'receipt',
        to: '/procurement/ap-invoices',
        roles: ['admin', 'manager', 'inventory', 'finance', 'procurement'],
      },
      {
        label: 'Supplier Payments',
        icon: 'payment',
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
        label: 'Procurement Reports',
        icon: 'analytics',
        to: '/procurement/reports',
        roles: ['admin', 'manager', 'finance', 'procurement'],
      },
    ],
  },
  {
    label: 'Admin',
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
