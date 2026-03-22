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
  delivery: ['/delivery-app'],
  cashier: ['/pos', '/orders', '/cashier', '/kitchen', '/website-orders'],
  manager: [
    '/dashboard',
    '/orders',
    '/website-orders',
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
    '/delivery-app',
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
  delivery: '/delivery-app',
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
  'kitchen',
  'delivery',
  'cashier',
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

  // Overview
  {
    label: 'Dashboard',
    icon: 'space_dashboard',
    to: '/dashboard',
    roles: ['admin', 'manager'],
    section: 'MAIN',
    group: 'Overview',
  },
  {
    label: 'Floor Dashboard',
    icon: 'supervisor_account',
    to: '/manager/floor',
    roles: ['admin', 'manager'],
    section: 'MAIN',
    group: 'Overview',
  },
  {
    label: 'Operations Overview',
    icon: 'monitor',
    to: '/operations/dashboard',
    roles: ['admin', 'manager'],
    section: 'MAIN',
    group: 'Overview',
  },
  {
    label: 'System Health',
    icon: 'monitor_heart',
    to: '/system/dashboard',
    roles: ['admin'],
    section: 'MAIN',
    group: 'Overview',
  },

  // Quick Actions
  {
    label: 'Point of Sale',
    icon: 'point_of_sale',
    to: '/pos',
    roles: ['admin', 'manager', 'cashier'],
    section: 'MAIN',
    group: 'Quick Actions',
  },
  {
    label: 'Kitchen Display',
    icon: 'soup_kitchen',
    to: '/kitchen',
    roles: ['admin', 'manager', 'kitchen', 'cashier'],
    section: 'MAIN',
    group: 'Quick Actions',
  },
  {
    label: 'Orders',
    icon: 'receipt_long',
    to: '/orders',
    roles: ['admin', 'manager', 'cashier', 'waiter'],
    section: 'MAIN',
    group: 'Quick Actions',
  },
  {
    label: 'Table Management',
    icon: 'table_restaurant',
    to: '/operations/tables',
    roles: ['admin', 'manager'],
    section: 'MAIN',
    group: 'Quick Actions',
  },

  // Snapshots
  {
    label: 'Sales Reports',
    icon: 'trending_up',
    to: '/reports/sales',
    roles: ['admin', 'manager', 'finance'],
    section: 'MAIN',
    group: 'Snapshots',
  },
  {
    label: 'Finance',
    icon: 'account_balance_wallet',
    to: '/finance/dashboard',
    roles: ['admin', 'manager', 'finance'],
    section: 'MAIN',
    group: 'Snapshots',
    moduleCode: 'FINANCE',
  },
  {
    label: 'Inventory Alerts',
    icon: 'inventory_2',
    to: '/inventory/dashboard',
    roles: ['admin', 'manager', 'inventory'],
    section: 'MAIN',
    group: 'Snapshots',
    moduleCode: 'INVENTORY',
  },
  {
    label: 'HR Overview',
    icon: 'diversity_3',
    to: '/hr/dashboard',
    roles: ['admin', 'manager', 'hr'],
    section: 'MAIN',
    group: 'Snapshots',
    moduleCode: 'HR',
  },
  {
    label: 'Procurement',
    icon: 'local_shipping',
    to: '/procurement/dashboard',
    roles: ['admin', 'manager', 'procurement'],
    section: 'MAIN',
    group: 'Snapshots',
  },

  // ─── OPERATIONS ────────────────────────────────────────────────────────────
  {
    label: 'Operations Dashboard',
    icon: 'dashboard',
    to: '/operations/dashboard',
    roles: ['admin', 'manager', 'cashier', 'kitchen'],
    section: 'OPERATIONS',
    group: 'Overview',
  },
  {
    label: 'Point of Sale',
    icon: 'point_of_sale',
    to: '/pos',
    roles: ['admin', 'manager', 'cashier', 'waiter'],
    permission: 'pos:access',
    section: 'OPERATIONS',
    group: 'Stations',
  },
  {
    label: 'Kitchen Display',
    icon: 'soup_kitchen',
    to: '/kitchen',
    roles: ['admin', 'manager', 'kitchen', 'cashier'],
    permission: 'kitchen:access',
    section: 'OPERATIONS',
    group: 'Stations',
  },
  {
    label: 'Cashier Station',
    icon: 'local_atm',
    to: '/cashier',
    roles: ['admin', 'manager', 'cashier'],
    permission: 'cashier:access',
    section: 'OPERATIONS',
    group: 'Stations',
  },
  {
    label: 'Waiter App',
    icon: 'room_service',
    to: '/waiter-app',
    roles: ['admin', 'manager', 'waiter'],
    section: 'OPERATIONS',
    group: 'Stations',
  },
  {
    label: 'Manager App',
    icon: 'manage_accounts',
    to: '/manager-app',
    roles: ['admin', 'manager'],
    section: 'OPERATIONS',
    group: 'Stations',
  },
  {
    label: 'Orders',
    icon: 'receipt_long',
    to: '/orders',
    roles: ['admin', 'manager', 'waiter', 'cashier'],
    permission: 'orders:view',
    section: 'OPERATIONS',
    group: 'Management',
  },
  {
    label: 'Website Orders',
    icon: 'language',
    to: '/website-orders',
    roles: ['admin', 'manager', 'cashier'],
    section: 'OPERATIONS',
    group: 'Management',
  },
  {
    label: 'Table Management',
    icon: 'table_restaurant',
    to: '/operations/tables',
    roles: ['admin', 'manager'],
    permission: 'tables:manage',
    section: 'OPERATIONS',
    group: 'Management',
  },

  // ─── INVENTORY ─────────────────────────────────────────────────────────────
  {
    label: 'Inventory Dashboard',
    icon: 'dashboard',
    to: '/inventory/dashboard',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Overview',
  },
  {
    label: 'Inventory Items',
    icon: 'category',
    to: '/inventory?tab=items',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Catalog',
  },
  {
    label: 'Menu Items',
    icon: 'restaurant',
    to: '/inventory?tab=menu_items',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Catalog',
  },
  {
    label: 'Categories',
    icon: 'list_alt',
    to: '/inventory?tab=menu_categories',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Catalog',
  },
  {
    label: 'Menu Book',
    icon: 'menu_book',
    to: '/inventory?tab=menu_book',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Menu Management',
  },
  {
    label: 'Kitchen Mapping',
    icon: 'route',
    to: '/inventory?tab=kitchen_mapping',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Menu Management',
  },
  {
    label: 'Recipes / BOM',
    icon: 'restaurant_menu',
    to: '/inventory?tab=recipes',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Catalog',
  },
  {
    label: 'Stock Levels',
    icon: 'inventory_2',
    to: '/inventory?tab=stock',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Stock',
  },
  {
    label: 'Warehouses',
    icon: 'warehouse',
    to: '/inventory?tab=warehouses',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Stock',
  },
  {
    label: 'Good Requests',
    icon: 'swap_horiz',
    to: '/inventory?tab=good_requests',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Stock',
  },
  {
    label: 'Stock Ledger',
    icon: 'menu_book',
    to: '/inventory?tab=ledger',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Stock',
  },
  {
    label: 'Documents',
    icon: 'description',
    to: '/inventory?tab=documents',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Documents',
  },
  {
    label: 'Suppliers',
    icon: 'local_shipping',
    to: '/inventory?tab=suppliers',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory:view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Documents',
  },

  // ─── PROCUREMENT ───────────────────────────────────────────────────────────
  {
    label: 'Procurement Dashboard',
    icon: 'dashboard',
    to: '/procurement/dashboard',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
    group: 'Overview',
  },
  {
    label: 'Suppliers',
    icon: 'local_shipping',
    to: '/procurement/suppliers',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
    group: 'Procurement',
  },
  {
    label: 'Purchase Orders',
    icon: 'assignment',
    to: '/procurement/purchase-orders',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
    group: 'Procurement',
  },
  {
    label: 'Goods Receipt',
    icon: 'move_to_inbox',
    to: '/procurement/grn',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
    group: 'Procurement',
  },
  {
    label: 'Purchase Returns',
    icon: 'assignment_return',
    to: '/procurement/returns',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
    group: 'Procurement',
  },
  {
    label: 'AP Invoices',
    icon: 'request_quote',
    to: '/procurement/ap-invoices',
    roles: ['admin', 'manager', 'inventory', 'finance', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
    group: 'Payables',
  },
  {
    label: 'Supplier Payments',
    icon: 'payments',
    to: '/procurement/payments',
    roles: ['admin', 'manager', 'finance', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
    group: 'Payables',
  },
  {
    label: 'Reports',
    icon: 'bar_chart',
    to: '/procurement/reports',
    roles: ['admin', 'manager', 'finance', 'procurement'],
    permission: 'procurement:access',
    section: 'PROCUREMENT',
    group: 'Payables',
  },

  // ─── FINANCE ───────────────────────────────────────────────────────────────
  {
    label: 'Finance Dashboard',
    icon: 'dashboard',
    to: '/finance/dashboard',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance:access',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Overview',
  },
  {
    label: 'Finance',
    icon: 'account_balance',
    to: '/finance',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance:access',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Overview',
  },

  // ─── REPORTS ───────────────────────────────────────────────────────────────
  {
    label: 'Sales Report',
    icon: 'receipt_long',
    to: '/reports/sales',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Electronic Journal',
    icon: 'auto_stories',
    to: '/reports/electronic-journal',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Item Wise Sale',
    icon: 'summarize',
    to: '/reports/item-wise-sale',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Waiter Wise Sale',
    icon: 'person_search',
    to: '/reports/waiter-wise-sale',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Table Wise Sale',
    icon: 'deck',
    to: '/reports/table-wise-sale',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Sales Statement',
    icon: 'analytics',
    to: '/reports/sales-statement',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Group Summary',
    icon: 'folder_shared',
    to: '/reports/group-summary',
    roles: ['admin', 'manager', 'finance'],
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Inventory Performance',
    icon: 'monitoring',
    to: '/reports/inventory-performance',
    roles: ['admin', 'manager', 'inventory', 'finance'],
    section: 'REPORTS',
    group: 'Inventory',
  },
  {
    label: 'Inventory Ledger',
    icon: 'inventory_2',
    to: '/reports/inventory',
    roles: ['admin', 'manager', 'inventory', 'finance'],
    section: 'REPORTS',
    group: 'Inventory',
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
    group: 'Staff',
  },
  {
    label: 'Attendance',
    icon: 'fingerprint',
    to: '/hr/attendance',
    roles: ['admin', 'hr', 'manager'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Staff',
  },
  {
    label: 'Shift Management',
    icon: 'schedule',
    to: '/hr/shifts',
    roles: ['admin', 'manager', 'hr'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Staff',
  },
  {
    label: 'Performance',
    icon: 'trending_up',
    to: '/hr/performance',
    roles: ['admin', 'hr', 'manager'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Staff',
  },
  {
    label: 'Payroll',
    icon: 'payments',
    to: '/hr/payroll',
    roles: ['admin', 'hr'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Payroll',
  },
  {
    label: 'Commission',
    icon: 'monetization_on',
    to: '/hr/commission',
    roles: ['admin', 'hr'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Payroll',
  },
  {
    label: 'Salary Audit',
    icon: 'fact_check',
    to: '/hr/audit',
    roles: ['admin', 'hr'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Payroll',
  },
  {
    label: 'Resignation',
    icon: 'exit_to_app',
    to: '/hr/resignation',
    roles: ['admin', 'hr'],
    permission: 'hr:access',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Payroll',
  },

  // ─── SYSTEM ────────────────────────────────────────────────────────────────
  {
    label: 'System Dashboard',
    icon: 'dashboard',
    to: '/system/dashboard',
    roles: ['admin'],
    permission: 'admin:console',
    section: 'SYSTEM',
    group: 'Overview',
  },
  {
    label: 'Customers',
    icon: 'people_alt',
    to: '/admin/customers',
    roles: ['admin', 'manager'],
    permission: 'admin:customers',
    section: 'SYSTEM',
    group: 'CRM',
  },
  {
    label: 'Loyalty Program',
    icon: 'card_giftcard',
    to: '/admin/loyalty',
    roles: ['admin', 'manager', 'cashier'],
    permission: 'admin:customers',
    section: 'SYSTEM',
    group: 'CRM',
  },
  {
    label: 'Users',
    icon: 'manage_accounts',
    to: '/admin/users',
    roles: ['admin'],
    permission: 'admin:users',
    section: 'SYSTEM',
    group: 'Administration',
  },
  {
    label: 'Roles & Permissions',
    icon: 'verified_user',
    to: '/admin/roles',
    roles: ['admin'],
    permission: 'admin:roles',
    section: 'SYSTEM',
    group: 'Administration',
  },
  {
    label: 'Branches',
    icon: 'store_mall_directory',
    to: '/admin/branches',
    roles: ['admin'],
    permission: 'admin:branches',
    section: 'SYSTEM',
    group: 'Administration',
  },
  {
    label: 'Kitchens',
    icon: 'soup_kitchen',
    to: '/admin/kitchens',
    roles: ['admin'],
    permission: 'admin:kitchens',
    section: 'SYSTEM',
    group: 'Configuration',
  },
  {
    label: 'Printers',
    icon: 'print',
    to: '/admin/printers',
    roles: ['admin'],
    permission: 'admin:printers',
    section: 'SYSTEM',
    group: 'Configuration',
  },
  {
    label: 'Settings',
    icon: 'settings',
    to: '/admin/settings',
    roles: ['admin'],
    permission: 'admin:settings',
    section: 'SYSTEM',
    group: 'Configuration',
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

  // 1. Check Roles FIRST (Primary Access) — roles should never be overridden
  const roleAllows = userRoles.some((role) => {
    const allowedPaths = ROLE_ROUTE_ACCESS[role]
    if (!allowedPaths) return false
    if (allowedPaths.includes('*')) return true
    return allowedPaths.some((p) => routePath.startsWith(p))
  })
  if (roleAllows) return true

  // 2. Check Permissions (Additive/Custom Access — grants extra access beyond roles)
  for (const [perm, paths] of Object.entries(PERMISSION_ROUTE_ACCESS)) {
    if (userPermissions.includes(perm)) {
      if (paths.some((p) => routePath.startsWith(p))) return true
    }
  }

  return false
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

        // 1. Check role access FIRST — roles should never be overridden by permissions
        const roleAllows = item.roles.some((role) => userRoles.includes(role))
        if (roleAllows) return true

        // 2. Check permission-based access (additive — grants extra visibility beyond roles)
        if (item.permission && userPermissions.includes(item.permission)) return true

        return false
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
