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
  waiter: ['/pos', '/orders', '/waiter', '/waiter-app'],
  kitchen: ['/kitchen'],
  cashier: ['/pos', '/orders', '/cashier', '/kitchen'],
  manager: [
    '/dashboard',
    '/orders',
    '/inventory',
    '/finance',
    '/kitchen',
    '/operations/tables',
    '/reports',
    '/hr',
    '/admin/customers',
    '/admin/loyalty',
    '/waiter-app',
    '/manager',
    '/manager-app',
  ],
  admin: ['*'],
  inventory: ['/inventory', '/reports/inventory'],
  finance: ['/finance', '/reports'],
  hr: ['/hr'],
  procurement: ['/procurement'],
}

/** Specific permission codes mapping to routes */
export const PERMISSION_ROUTE_ACCESS: Record<string, string[]> = {
  'pos:access': ['/pos'],
  'orders:view': ['/orders'],
  'kitchen:access': ['/kitchen'],
  'cashier:access': ['/cashier'],
  'waiter:access': ['/waiter'],
  'inventory:view': ['/inventory'],
  'procurement:access': ['/procurement'],
  'finance:access': ['/finance'],
  'hr:access': ['/hr'],
  'admin:console': ['/admin'],
  'admin:users': ['/admin/users'],
  'admin:roles': ['/admin/roles'],
  'admin:branches': ['/admin/branches'],
  'admin:kitchens': ['/admin/kitchens'],
  'admin:printers': ['/admin/printers'],
  'admin:settings': ['/admin/settings'],
  'admin:customers': ['/admin/customers', '/admin/loyalty'],
  'tables:manage': ['/operations/tables'],
}

/** The default landing page for each role after login */
export const ROLE_LANDING: Record<UserRole, string> = {
  waiter: '/waiter-app',
  cashier: '/pos',
  kitchen: '/kitchen',
  inventory: '/inventory',
  finance: '/finance',
  hr: '/hr',
  procurement: '/procurement/suppliers',
  manager: '/manager-app',
  admin: '/dashboard',
}

/**
 * Role priority order — highest privilege first.
 * The defaultLandingPage getter uses this to resolve the correct
 * landing page when a user has multiple roles (e.g. admin + cashier).
 * Without this, whichever role the DB returns first wins — which is wrong.
 */
export const ROLE_PRIORITY: UserRole[] = [
  'admin',
  'manager',
  'finance',
  'hr',
  'procurement',
  'inventory',
  'cashier',
  'kitchen',
  'waiter',
]

/** Role-specific feature restrictions within pages */
export interface RolePageRestrictions {
  /** On the Orders page, waiter can only accept orders (no cancel, no advance beyond accept) */
  ordersAcceptOnly: boolean
  /** On the POS page, whether the user can process payments */
  canProcessPayment: boolean
  /** On the POS page, whether the user can send to kitchen */
  canSendToKitchen: boolean
}

export function getRoleRestrictions(
  roles: UserRole[],
  permissions: string[] = [],
): RolePageRestrictions {
  const isAdmin = roles.includes('admin') || permissions.includes('admin:console')
  const isManager = roles.includes('manager')
  const isWaiter = roles.includes('waiter') || permissions.includes('waiter:access')
  const isCashier = roles.includes('cashier') || permissions.includes('cashier:access')
  const canManageOrders = permissions.includes('orders:manage') || isAdmin || isManager

  return {
    // Waiter can ONLY accept orders unless they have manage permission or are admin/manager/cashier
    ordersAcceptOnly: isWaiter && !canManageOrders && !isCashier,
    // Only cashier, manager, admin or relevant permission can process payment
    canProcessPayment: isAdmin || isManager || isCashier || permissions.includes('cashier:access'),
    // Waiter and above can send to kitchen
    canSendToKitchen:
      isAdmin || isManager || isWaiter || isCashier || permissions.includes('pos:access'),
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
  /** Optional group label to organize items within the same section */
  group?: string
  /** Optional module code — nav item hidden when this module is disabled */
  moduleCode?: string
  /** Fine-grained permission required for this item */
  permission?: string
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
    permission: 'nav:dashboard',
    section: 'MAIN',
  },
  {
    label: 'Floor Dashboard',
    icon: 'supervisor_account',
    to: '/manager/floor',
    roles: ['admin', 'manager'],
    section: 'MAIN',
  },
  {
    label: 'Sales Snapshot',
    icon: 'trending_up',
    to: '/dashboard#sales',
    roles: ['admin', 'manager'],
    section: 'MAIN',
  },
  {
    label: 'Inventory Alerts',
    icon: 'error_outline',
    to: '/dashboard#inventory',
    roles: ['admin', 'manager'],
    section: 'MAIN',
  },
  {
    label: 'Finance Snapshot',
    icon: 'account_balance_wallet',
    to: '/dashboard#finance',
    roles: ['admin', 'manager'],
    section: 'MAIN',
  },
  {
    label: 'Staff Snapshot',
    icon: 'diversity_3',
    to: '/dashboard#staff',
    roles: ['admin', 'manager'],
    section: 'MAIN',
  },
  {
    label: 'Procurement Snapshot',
    icon: 'local_shipping',
    to: '/dashboard#procurement',
    roles: ['admin', 'manager'],
    section: 'MAIN',
  },
  {
    label: 'System Health',
    icon: 'monitor_heart',
    to: '/dashboard#health',
    roles: ['admin', 'manager'],
    section: 'MAIN',
  },
  {
    label: 'Recent Activity',
    icon: 'history',
    to: '/dashboard#activity',
    roles: ['admin', 'manager'],
    section: 'MAIN',
  },
  {
    label: 'Quick Actions',
    icon: 'bolt',
    to: '/dashboard#actions',
    roles: ['admin', 'manager'],
    section: 'MAIN',
  },

  // ─── OPERATIONS ────────────────────────────────────────────────────────────
  {
    label: 'Point of Sale',
    icon: 'point_of_sale',
    to: '/pos',
    roles: ['admin', 'manager', 'cashier', 'waiter'],
    permission: 'pos:access',
    section: 'OPERATIONS',
  },
  {
    label: 'Orders',
    icon: 'receipt_long',
    to: '/orders',
    roles: ['admin', 'manager', 'waiter', 'cashier'],
    permission: 'orders:view',
    section: 'OPERATIONS',
  },
  {
    label: 'Kitchen Display',
    icon: 'soup_kitchen',
    to: '/kitchen',
    roles: ['admin', 'manager', 'kitchen', 'cashier'],
    permission: 'kitchen:access',
    section: 'OPERATIONS',
  },
  {
    label: 'Cashier Station',
    icon: 'local_atm',
    to: '/cashier',
    roles: ['admin', 'manager', 'cashier'],
    permission: 'cashier:access',
    section: 'OPERATIONS',
  },
  {
    label: 'Waiter Station',
    icon: 'room_service',
    to: '/waiter-app',
    roles: ['admin', 'manager', 'waiter'],
    section: 'OPERATIONS',
  },
  {
    label: 'Manager App',
    icon: 'manage_accounts',
    to: '/manager-app',
    roles: ['admin', 'manager'],
    section: 'OPERATIONS',
  },
  {
    label: 'Table Management',
    icon: 'table_restaurant',
    to: '/operations/tables',
    roles: ['admin', 'manager'],
    permission: 'tables:manage',
    section: 'OPERATIONS',
  },

  {
    label: 'Inventory Items',
    icon: 'category',
    to: '/inventory?tab=items',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
  },
  {
    label: 'Menu Items',
    icon: 'restaurant',
    to: '/inventory?tab=menu_items',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
  },
  {
    label: 'Category Management',
    icon: 'list_alt',
    to: '/inventory?tab=menu_categories',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
  },
  {
    label: 'Recipes / BOM',
    icon: 'restaurant_menu',
    to: '/inventory?tab=recipes',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
  },
  {
    label: 'Stock Levels',
    icon: 'inventory_2',
    to: '/inventory?tab=stock',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
  },
  {
    label: 'Warehouses',
    icon: 'warehouse',
    to: '/inventory?tab=warehouses',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
  },
  {
    label: 'Good Requests',
    icon: 'swap_horiz',
    to: '/inventory?tab=good_requests',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
  },
  {
    label: 'Suppliers',
    icon: 'local_shipping',
    to: '/inventory?tab=suppliers',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
  },
  {
    label: 'Documents',
    icon: 'description',
    to: '/inventory?tab=documents',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
  },
  {
    label: 'Stock Ledger',
    icon: 'menu_book',
    to: '/inventory?tab=ledger',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
  },

  // ─── PROCUREMENT ───────────────────────────────────────────────────────────
  {
    label: 'Suppliers',
    icon: 'local_shipping',
    to: '/procurement/suppliers',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
  },
  {
    label: 'Purchase Orders',
    icon: 'assignment',
    to: '/procurement/purchase-orders',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
  },
  {
    label: 'Goods Receipt',
    icon: 'move_to_inbox',
    to: '/procurement/grn',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
  },
  {
    label: 'AP Invoices',
    icon: 'request_quote',
    to: '/procurement/ap-invoices',
    roles: ['admin', 'manager', 'inventory', 'finance', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
  },
  {
    label: 'Supplier Payments',
    icon: 'payments',
    to: '/procurement/payments',
    roles: ['admin', 'manager', 'finance', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
  },
  {
    label: 'Purchase Returns',
    icon: 'assignment_return',
    to: '/procurement/returns',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
  },
  {
    label: 'Reports',
    icon: 'bar_chart',
    to: '/procurement/reports',
    roles: ['admin', 'manager', 'finance', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
  },

  // ─── FINANCE ───────────────────────────────────────────────────────────────
  {
    label: 'Finance',
    icon: 'account_balance',
    to: '/finance',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance:access',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
  },

  // ─── REPORTS ───────────────────────────────────────────────────────────────
  {
    label: 'Sales Report',
    icon: 'receipt_long',
    to: '/reports/sales',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
  },
  {
    label: 'Electronic Journal',
    icon: 'auto_stories',
    to: '/reports/electronic-journal',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
  },
  {
    label: 'Item Wise Sale',
    icon: 'summarize',
    to: '/reports/item-wise-sale',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
  },
  {
    label: 'Waiter Wise Sale',
    icon: 'person_search',
    to: '/reports/waiter-wise-sale',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
  },
  {
    label: 'Table Wise Sale',
    icon: 'deck',
    to: '/reports/table-wise-sale',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
  },
  {
    label: 'Sales Statement',
    icon: 'analytics',
    to: '/reports/sales-statement',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
  },
  {
    label: 'Group Summary',
    icon: 'folder_shared',
    to: '/reports/group-summary',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
  },
  {
    label: 'Inventory Performance',
    icon: 'monitoring',
    to: '/reports/inventory-performance',
    roles: ['admin', 'manager', 'inventory', 'finance'],
    section: 'REPORTS',
  },
  {
    label: 'Inventory Ledger',
    icon: 'inventory_2',
    to: '/reports/inventory',
    roles: ['admin', 'manager', 'inventory', 'finance'],
    section: 'REPORTS',
  },

  // ─── HR ────────────────────────────────────────────────────────────────────
  {
    label: 'Employees',
    icon: 'people',
    to: '/hr/employees',
    roles: ['admin', 'hr'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
  },
  {
    label: 'Attendance',
    icon: 'fingerprint',
    to: '/hr/attendance',
    roles: ['admin', 'hr', 'manager'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
  },
  {
    label: 'Payroll',
    icon: 'payments',
    to: '/hr/payroll',
    roles: ['admin', 'hr'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
  },
  {
    label: 'Commission',
    icon: 'monetization_on',
    to: '/hr/commission',
    roles: ['admin', 'hr'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
  },
  {
    label: 'Salary Audit',
    icon: 'fact_check',
    to: '/hr/audit',
    roles: ['admin', 'hr'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
  },
  {
    label: 'Performance',
    icon: 'trending_up',
    to: '/hr/performance',
    roles: ['admin', 'hr', 'manager'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
  },
  {
    label: 'Resignation',
    icon: 'exit_to_app',
    to: '/hr/resignation',
    roles: ['admin', 'hr'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
  },
  {
    label: 'Shift Management',
    icon: 'schedule',
    to: '/hr/shifts',
    roles: ['admin', 'manager', 'hr'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
  },

  // ─── SYSTEM ────────────────────────────────────────────────────────────────
  {
    label: 'Customers',
    icon: 'people_alt',
    to: '/admin/customers',
    roles: ['admin', 'manager'],
    permission: 'admin:customers',
    section: 'SYSTEM',
  },
  {
    label: 'Loyalty Program',
    icon: 'card_giftcard',
    to: '/admin/loyalty',
    roles: ['admin', 'manager', 'cashier'],
    permission: 'admin:customers',
    section: 'SYSTEM',
  },
  {
    label: 'Admin Settings',
    icon: 'admin_panel_settings',
    to: '/admin',
    roles: ['admin'],
    permission: 'admin:console',
    section: 'SYSTEM',
  },
]

/**
 * Check if a user with given roles & permissions can access a route path.
 */
export function canAccessRoute(
  userRoles: UserRole[],
  routePath: string,
  userPermissions: string[] = [],
): boolean {
  // Admin bypasses all checks, and everyone can access profile
  // Everyone can access profile and its subroutes
  if (routePath === '/profile' || routePath.startsWith('/profile/')) return true
  if (userRoles.includes('admin') || userPermissions.includes('admin:console')) return true

  // 1. Check Permissions (Direct/Custom Access)
  for (const [perm, paths] of Object.entries(PERMISSION_ROUTE_ACCESS)) {
    if (userPermissions.includes(perm)) {
      if (paths.some((p) => routePath.startsWith(p))) return true
    }
  }

  // Strict check: if user has any custom permissions configured AND the route requires one, deny if not found.
  // If userPermissions is completely empty, we assume legacy setup and fallback to role check.
  if (userPermissions.length > 0) {
    const isProtectedByPermissions = Object.values(PERMISSION_ROUTE_ACCESS)
      .flat()
      .some((p) => routePath.startsWith(p))
    if (isProtectedByPermissions) {
      return false
    }
  }

  // 2. Check Roles (Group Access) - fallback
  return userRoles.some((role) => {
    const allowedPaths = ROLE_ROUTE_ACCESS[role]
    if (!allowedPaths) return false
    if (allowedPaths.includes('*')) return true
    return allowedPaths.some((p) => routePath.startsWith(p))
  })
}

/**
 * Get filtered navigation items based on user roles and permissions.
 */
export function getFilteredNavItems(
  userRoles: UserRole[],
  userPermissions: string[] = [],
): NavItem[] {
  function filterItems(items: NavItem[]): NavItem[] {
    return items
      .filter((item) => {
        // Admin wildcard
        if (userRoles.includes('admin') || userPermissions.includes('admin:console')) return true

        // Strict Check: if item requires a permission AND user has custom permissions configured
        if (item.permission && userPermissions.length > 0) {
          return userPermissions.includes(item.permission)
        }

        // Fallback to role check
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
