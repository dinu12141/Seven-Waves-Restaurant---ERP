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

import type { UserRole } from '../stores/auth'

/** Route paths each role is allowed to visit */
export const ROLE_ROUTE_ACCESS: Record<UserRole, string[]> = {
  waiter: ['/pos', '/orders', '/waiter', '/waiter-app'],
  kitchen: ['/kitchen'],
  delivery: ['/delivery-app'],
  // '/admin/loyalty' — route meta + nav both grant cashiers the Loyalty Members
  // page (crm.loyalty.view); without it this legacy ACL silently bounced them.
  // Earning-rules stays admin/manager-only via its own route roles.
  cashier: ['/pos', '/orders', '/cashier', '/kitchen', '/website-orders', '/crm', '/admin/loyalty'],
  manager: [
    '/dashboard',
    '/orders',
    '/website',
    '/inventory',
    '/finance',
    '/procurement',
    '/kitchen',
    '/operations',
    '/reports',
    '/hr',
    '/crm',
    '/admin/customers',
    '/admin/loyalty',
    '/admin/loyalty/earning-rules',
    '/waiter-app',
    '/manager',
    '/manager-app',
    '/delivery-app',
    '/devices',
  ],
  admin: ['*'],
  super_admin: ['*'],
  inventory: ['/inventory', '/reports/inventory', '/procurement'],
  finance: ['/finance', '/reports', '/procurement'],
  hr: ['/hr', '/reports/hr', '/devices/biometrics'],
  procurement: ['/procurement', '/inventory'],
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
  'admin:printers': ['/admin/printers'],
  'admin:settings': ['/admin/settings'],
  'admin:customers': ['/admin/customers', '/admin/loyalty', '/admin/loyalty/earning-rules'],
  'tables:manage': ['/operations/tables'],
  'devices:view': ['/devices'],
  'devices:manage': ['/devices', '/devices/printers', '/devices/scanners'],
  'devices:biometric': ['/devices/biometrics'],
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
  super_admin: '/dashboard',
}

/**
 * Role priority order — highest privilege first.
 * The defaultLandingPage getter uses this to resolve the correct
 * landing page when a user has multiple roles (e.g. admin + cashier).
 * Without this, whichever role the DB returns first wins — which is wrong.
 */
export const ROLE_PRIORITY: UserRole[] = [
  'admin',
  'super_admin',
  'manager',
  'finance',
  'hr',
  'procurement',
  'inventory',
  'cashier',
  'kitchen',
  'delivery',
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
  /** Hide from the sidebar (used for action permissions like create/edit/delete that appear in RolesPage) */
  hidden?: boolean
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
    permission: 'operations.view',
    moduleCode: 'OPERATIONS',
    section: 'OPERATIONS',
    group: 'Overview',
  },
  {
    label: 'Point of Sale',
    icon: 'point_of_sale',
    to: '/pos',
    roles: ['admin', 'manager', 'cashier', 'waiter'],
    permission: 'pos.order.create',
    moduleCode: 'POS',
    section: 'OPERATIONS',
    group: 'Stations',
  },
  {
    label: 'Kitchen Display',
    icon: 'soup_kitchen',
    to: '/kitchen',
    // /kitchen is role-gated only (no meta.permission on the route) — a
    // terminal-style screen, not something individually custom-granted.
    roles: ['admin', 'manager', 'kitchen', 'cashier'],
    section: 'OPERATIONS',
    group: 'Stations',
  },
  {
    label: 'Cashier Station',
    icon: 'local_atm',
    to: '/cashier',
    roles: ['admin', 'manager', 'cashier'],
    permission: 'pos.payment.collect',
    moduleCode: 'POS',
    section: 'OPERATIONS',
    group: 'Stations',
  },
  {
    label: 'Waiter App',
    icon: 'room_service',
    to: '/waiter-app',
    // Standalone PWA route, role-gated only (no meta.permission).
    roles: ['admin', 'manager', 'waiter'],
    section: 'OPERATIONS',
    group: 'Stations',
  },
  {
    label: 'Manager App',
    icon: 'manage_accounts',
    to: '/manager-app',
    // Standalone PWA route, role-gated only (no meta.permission).
    roles: ['admin', 'manager'],
    section: 'OPERATIONS',
    group: 'Stations',
  },
  {
    label: 'Delivery App',
    icon: 'delivery_dining',
    to: '/delivery-app',
    // Standalone PWA route, role-gated only (no meta.permission).
    roles: ['admin', 'manager', 'delivery'],
    section: 'OPERATIONS',
    group: 'Stations',
  },
  {
    label: 'Orders',
    icon: 'receipt_long',
    to: '/orders',
    roles: ['admin', 'manager', 'waiter', 'cashier'],
    permission: 'pos.order.view',
    moduleCode: 'POS',
    section: 'OPERATIONS',
    group: 'Management',
  },
  {
    label: 'Table Management',
    icon: 'table_restaurant',
    to: '/operations/tables',
    roles: ['admin', 'manager'],
    permission: 'operations.tables.manage',
    moduleCode: 'OPERATIONS',
    section: 'OPERATIONS',
    group: 'Management',
  },

  // ─── INVENTORY ─────────────────────────────────────────────────────────────
  {
    label: 'Inventory Dashboard',
    icon: 'dashboard',
    to: '/inventory/dashboard',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.dashboard.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Overview',
  },
  {
    label: 'Inventory Items',
    icon: 'category',
    to: '/inventory?tab=items',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_items.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Catalog',
  },
  {
    label: 'Menu Items',
    icon: 'restaurant',
    to: '/inventory?tab=menu_items',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_menu_items.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Catalog',
  },
  {
    label: 'Categories',
    icon: 'list_alt',
    to: '/inventory?tab=menu_categories',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_menu_categories.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Catalog',
  },
  {
    label: 'Menu Book',
    icon: 'menu_book',
    to: '/inventory?tab=menu_book',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_menu_book.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Menu Management',
  },
  {
    label: 'Kitchen Mapping',
    icon: 'route',
    to: '/inventory?tab=kitchen_mapping',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_kitchen_mapping.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Menu Management',
  },
  {
    label: 'Recipes / BOM',
    icon: 'restaurant_menu',
    to: '/inventory?tab=recipes',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_recipes.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Catalog',
  },
  {
    label: 'BOM Margins',
    icon: 'analytics',
    to: '/inventory?tab=bom_margins',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_recipes.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Catalog',
  },
  {
    label: 'Stock Levels',
    icon: 'inventory_2',
    to: '/inventory?tab=stock',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_stock.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Stock',
  },
  {
    label: 'Warehouses',
    icon: 'warehouse',
    to: '/inventory?tab=warehouses',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_warehouses.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Stock',
  },

  {
    label: 'Stock Ledger',
    icon: 'menu_book',
    to: '/inventory?tab=ledger',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_ledger.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Stock',
  },
  {
    label: 'Wastage Management',
    icon: 'delete_sweep',
    to: '/inventory?tab=wastage',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_wastage.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Stock',
  },
  {
    label: 'Documents',
    icon: 'description',
    to: '/inventory?tab=documents',
    roles: ['admin', 'manager', 'inventory'],
    permission: 'inventory.tab_documents.view',
    section: 'INVENTORY',
    moduleCode: 'INVENTORY',
    group: 'Documents',
  },
  {
    label: 'Item Master',
    icon: 'inventory_2',
    to: '/inventory/items',
    section: 'INVENTORY',
    group: 'Inventory',
    roles: ['admin', 'manager', 'inventory'],
    moduleCode: 'INVENTORY',
    permission: 'inventory.items.view',
  },
  {
    label: 'Stock Adjustment',
    icon: 'tune',
    to: '/inventory/adjustments',
    section: 'INVENTORY',
    group: 'Inventory',
    roles: ['admin', 'manager', 'inventory'],
    moduleCode: 'INVENTORY',
    permission: 'inventory.adjustments.view',
  },
  {
    label: 'Stock Take',
    icon: 'fact_check',
    to: '/inventory/stocktake',
    section: 'INVENTORY',
    group: 'Inventory',
    roles: ['admin', 'manager', 'inventory'],
    moduleCode: 'INVENTORY',
    permission: 'inventory.stocktake.view',
  },

  // ─── PROCUREMENT ───────────────────────────────────────────────────────────
  {
    label: 'Procurement Dashboard',
    icon: 'dashboard',
    to: '/procurement/dashboard',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement.dashboard.view',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Overview',
  },
  {
    label: 'Suppliers',
    icon: 'local_shipping',
    to: '/procurement/suppliers',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement.suppliers.view',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Procurement',
  },
  {
    label: 'Create Supplier',
    icon: 'add',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement.suppliers.create',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Procurement',
    hidden: true,
  },
  {
    label: 'Edit Supplier',
    icon: 'edit',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement.suppliers.edit',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Procurement',
    hidden: true,
  },
  {
    label: 'Delete Supplier',
    icon: 'delete',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement.suppliers.delete',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Procurement',
    hidden: true,
  },
  {
    label: 'Purchase Orders',
    icon: 'assignment',
    to: '/procurement/purchase-orders',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement.purchase_orders.view',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Procurement',
  },
  {
    label: 'Goods Receipt',
    icon: 'move_to_inbox',
    to: '/procurement/grn',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement.grn.view',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Procurement',
  },
  {
    label: 'Goods Issue',
    icon: 'outbox',
    to: '/procurement/gin',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement.gin.view',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Procurement',
  },
  {
    label: 'Purchase Returns',
    icon: 'assignment_return',
    to: '/procurement/returns',
    roles: ['admin', 'manager', 'inventory', 'procurement'],
    permission: 'procurement.returns.view',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Procurement',
  },
  {
    label: 'AP Invoices',
    icon: 'request_quote',
    to: '/procurement/ap-invoices',
    roles: ['admin', 'manager', 'inventory', 'finance', 'procurement'],
    permission: 'procurement.ap_invoices.view',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Payables',
  },
  {
    label: 'Supplier Payments',
    icon: 'payments',
    to: '/procurement/payments',
    roles: ['admin', 'manager', 'finance', 'procurement'],
    permission: 'procurement.payments.view',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Payables',
  },
  {
    label: 'Payment Reports',
    icon: 'receipt_long',
    to: '/procurement/payments-report',
    roles: ['admin', 'manager', 'finance', 'procurement'],
    permission: 'procurement.payments_report.view',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Payables',
  },
  {
    label: 'Reports',
    icon: 'bar_chart',
    to: '/procurement/reports',
    roles: ['admin', 'manager', 'finance', 'procurement'],
    permission: 'procurement.reports.view',
    moduleCode: 'PROCUREMENT',
    section: 'PROCUREMENT',
    group: 'Payables',
  },

  // ─── FINANCE ───────────────────────────────────────────────────────────────
  {
    label: 'Finance Dashboard',
    icon: 'dashboard',
    to: '/finance/dashboard',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance.dashboard.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Overview',
  },
  // ── ERP Accounting ──
  {
    label: 'Ledger Registration',
    icon: 'book',
    to: '/finance/ledgers',
    roles: ['admin', 'finance'],
    permission: 'finance.ledgers.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'ERP Accounting',
  },
  {
    label: 'Account Registration',
    icon: 'account_balance_wallet',
    to: '/finance/accounts',
    roles: ['admin', 'finance'],
    permission: 'finance.accounts.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'ERP Accounting',
  },
  {
    label: 'Journal Entries (GL)',
    icon: 'menu_book',
    to: '/finance/journal-entries',
    roles: ['admin', 'finance'],
    permission: 'finance.journal.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'ERP Accounting',
  },
  {
    label: 'Fiscal Periods',
    icon: 'event_available',
    to: '/finance/fiscal-periods',
    roles: ['admin', 'finance'],
    permission: 'finance.fiscal_periods.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'ERP Accounting',
  },
  // ── Voucher Management ──
  {
    label: 'Pay Vouchers',
    icon: 'payment',
    to: '/finance/pay-vouchers',
    roles: ['admin', 'finance'],
    permission: 'finance.pay_vouchers.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Voucher Management',
  },
  {
    label: 'Received Vouchers',
    icon: 'receipt',
    to: '/finance/received-vouchers',
    roles: ['admin', 'finance'],
    permission: 'finance.received_vouchers.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Voucher Management',
  },
  {
    label: 'Voucher Approvals',
    icon: 'check_circle',
    to: '/finance/voucher-approvals',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance.voucher_approvals.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Voucher Management',
  },
  // ── Cash & Banking ──
  {
    label: 'Cashbook',
    icon: 'menu_book',
    to: '/finance/cashbook',
    roles: ['admin', 'finance'],
    permission: 'finance.cashbook.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Cash & Banking',
  },
  {
    label: 'Petty Cash Book',
    icon: 'savings',
    to: '/finance/petty-cash',
    roles: ['admin', 'finance'],
    permission: 'finance.petty_cash.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Cash & Banking',
  },
  {
    label: 'Cheque Plan',
    icon: 'credit_score',
    to: '/finance/cheque-plan',
    roles: ['admin', 'finance'],
    permission: 'finance.cheque_plan.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Cash & Banking',
  },
  {
    label: 'Bank Reconciliation',
    icon: 'compare_arrows',
    to: '/finance/bank-reconciliation',
    roles: ['admin', 'finance'],
    permission: 'finance.bank_reconciliation.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Cash & Banking',
  },
  {
    label: 'POS Shifts',
    icon: 'point_of_sale',
    to: '/finance/pos-shifts',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance.pos_shifts.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Cash & Banking',
  },

  // ── Receivables & Payables ──
  {
    label: 'Accounts Receivable',
    icon: 'request_quote',
    to: '/finance/receivables',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance.receivables.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Receivables & Payables',
  },
  {
    label: 'Accounts Payable',
    icon: 'receipt_long',
    to: '/finance/payables',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance.payables.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Receivables & Payables',
  },
  // ── Expenses & Tax ──
  {
    label: 'Expenses',
    icon: 'money_off',
    to: '/finance/expenses',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance.expenses.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Expenses & Tax',
  },
  {
    label: 'Tax Management',
    icon: 'gavel',
    to: '/finance/tax',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance.tax.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Expenses & Tax',
  },
  // ── Payroll ──
  {
    label: 'Payroll Overview',
    icon: 'payments',
    to: '/finance/payroll',
    roles: ['admin', 'manager', 'finance', 'hr'],
    permission: 'finance.payroll.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Payroll',
  },
  // ── Statutory Reports ──
  {
    label: 'Financial Statements',
    icon: 'assessment',
    to: '/finance/financial-statements',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance.financial_statements.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Statutory Reports',
  },
  // ── Reports & Audit ──
  {
    label: 'Financial Reports',
    icon: 'analytics',
    to: '/finance/reports',
    roles: ['admin', 'manager', 'finance'],
    permission: 'finance.reports.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Reports & Audit',
  },
  {
    label: 'Finance Audit Log',
    icon: 'policy',
    to: '/finance/audit',
    roles: ['admin', 'finance'],
    permission: 'finance.audit.view',
    section: 'FINANCE',
    moduleCode: 'FINANCE',
    group: 'Reports & Audit',
  },

  // ─── DEVICE MANAGEMENT ────────────────────────────────────────────────────
  {
    label: 'Device Dashboard',
    icon: 'devices',
    to: '/devices',
    roles: ['admin', 'manager'],
    permission: 'devices.dashboard.view',
    section: 'SYSTEM',
    moduleCode: 'DEVICES',
    group: 'Device Management',
  },
  {
    label: 'Printers',
    icon: 'print',
    to: '/devices/printers',
    roles: ['admin', 'manager'],
    permission: 'devices.printers.view',
    section: 'SYSTEM',
    moduleCode: 'DEVICES',
    group: 'Device Management',
  },
  {
    label: 'Scanners',
    icon: 'qr_code_scanner',
    to: '/devices/scanners',
    roles: ['admin', 'manager'],
    permission: 'devices.scanners.view',
    section: 'SYSTEM',
    moduleCode: 'DEVICES',
    group: 'Device Management',
  },
  {
    label: 'Biometric Devices',
    icon: 'fingerprint',
    to: '/devices/biometrics',
    roles: ['admin', 'hr', 'manager'],
    permission: 'devices.biometrics.view',
    section: 'SYSTEM',
    moduleCode: 'DEVICES',
    group: 'Device Management',
  },
  {
    label: 'Device Health',
    icon: 'monitor_heart',
    to: '/devices/health',
    roles: ['admin', 'manager'],
    permission: 'devices.health.view',
    section: 'SYSTEM',
    moduleCode: 'DEVICES',
    group: 'Device Management',
  },

  // ─── HR ────────────────────────────────────────────────────────────────────
  {
    label: 'Employees',
    icon: 'people',
    to: '/hr/employees',
    roles: ['admin', 'hr'],
    permission: 'hr.employees.view',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Staff',
  },
  {
    label: 'Attendance',
    icon: 'fingerprint',
    to: '/hr/attendance',
    roles: ['admin', 'hr', 'manager'],
    permission: 'hr.attendance.view',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Staff',
  },
  {
    label: 'Shift Management',
    icon: 'schedule',
    to: '/hr/shifts',
    roles: ['admin', 'manager', 'hr'],
    permission: 'hr.shifts.view',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Staff',
  },

  {
    label: 'Payroll',
    icon: 'payments',
    to: '/hr/payroll',
    roles: ['admin', 'hr'],
    permission: 'hr.payroll.view',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Payroll',
  },
  {
    label: 'Salary Configuration',
    icon: 'tune',
    to: '/hr/salary-config',
    roles: ['admin', 'hr'],
    permission: 'hr.payroll.view',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Payroll',
  },
  {
    label: 'Commission',
    icon: 'monetization_on',
    to: '/hr/commission',
    roles: ['admin', 'hr'],
    permission: 'hr.commission.view',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Payroll',
  },
  {
    label: 'Salary Audit',
    icon: 'fact_check',
    to: '/hr/audit',
    roles: ['admin', 'hr'],
    permission: 'hr.audit.view',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Payroll',
  },
  {
    label: 'Resignation',
    icon: 'exit_to_app',
    to: '/hr/resignation',
    roles: ['admin', 'hr'],
    permission: 'hr.resignation.view',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Payroll',
  },
  {
    label: 'Leave Management',
    icon: 'event_note',
    to: '/hr/leave',
    roles: ['admin', 'hr', 'manager'],
    permission: 'hr.leave.view',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Staff',
  },
  {
    label: 'Advances & Expenses',
    icon: 'account_balance_wallet',
    to: '/hr/finances',
    roles: ['admin', 'hr', 'manager'],
    permission: 'hr.finances.view',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Staff',
  },
  {
    label: 'Document Management',
    icon: 'folder_special',
    to: '/hr/documents',
    roles: ['admin', 'hr'],
    permission: 'hr.documents.view',
    section: 'HR',
    moduleCode: 'HR',
    group: 'Staff',
  },

  // ─── REPORTS ───────────────────────────────────────────────────────────────
  // Sales Reports
  {
    label: 'Sales Report',
    icon: 'receipt_long',
    to: '/reports/sales',
    permission: 'reports.sales.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Electronic Journal',
    icon: 'auto_stories',
    to: '/reports/electronic-journal',
    permission: 'reports.electronic_journal.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Item Wise Sale',
    icon: 'summarize',
    to: '/reports/item-wise-sale',
    permission: 'reports.item_wise_sale.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Waiter Wise Sale',
    icon: 'person_search',
    to: '/reports/waiter-wise-sale',
    permission: 'reports.waiter_wise_sale.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Table Wise Sale',
    icon: 'deck',
    to: '/reports/table-wise-sale',
    permission: 'reports.table_wise_sale.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Sales Statement',
    icon: 'analytics',
    to: '/reports/sales-statement',
    permission: 'reports.sales_statement.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Group Summary',
    icon: 'folder_shared',
    to: '/reports/group-summary',
    permission: 'reports.group_summary.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Category Wise Sales',
    icon: 'donut_small',
    to: '/reports/category-wise-sales',
    permission: 'reports.category_wise_sales.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Hourly Sales Report',
    icon: 'schedule',
    to: '/reports/hourly-sales',
    permission: 'reports.hourly_sales.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Kitchen Wise Sales',
    icon: 'kitchen',
    to: '/reports/branch-wise-sales',
    permission: 'reports.branch_wise_sales.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Discount Report',
    icon: 'local_offer',
    to: '/reports/discount-report',
    permission: 'reports.discount_report.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Void / Cancelled Bills',
    icon: 'cancel',
    to: '/reports/void-cancelled',
    permission: 'reports.void_cancelled.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  {
    label: 'Payment Method Summary',
    icon: 'payments',
    to: '/reports/payment-summary',
    permission: 'reports.payment_summary.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Sales',
  },
  // Operations Reports
  {
    label: 'Kitchen Order Report',
    icon: 'soup_kitchen',
    to: '/reports/kitchen-orders',
    permission: 'reports.kitchen_orders.view',
    roles: ['admin', 'manager'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Operations',
  },
  {
    label: 'Order Status Report',
    icon: 'fact_check',
    to: '/reports/order-status',
    permission: 'reports.order_status.view',
    roles: ['admin', 'manager'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Operations',
  },
  {
    label: 'Item Availability',
    icon: 'inventory_2',
    to: '/reports/item-availability',
    permission: 'reports.item_availability.view',
    roles: ['admin', 'manager', 'kitchen', 'waiter'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Operations',
  },
  {
    label: 'Delivery Performance',
    icon: 'local_shipping',
    to: '/reports/delivery-performance',
    permission: 'reports.delivery_performance.view',
    roles: ['admin', 'manager'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Operations',
  },
  // Inventory Reports
  {
    label: 'Stock on Hand',
    icon: 'shelves',
    to: '/reports/stock-on-hand',
    permission: 'reports.stock_on_hand.view',
    roles: ['admin', 'manager', 'inventory', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Inventory',
  },
  {
    label: 'Kitchen Usage Report',
    icon: 'soup_kitchen',
    to: '/reports/kitchen-usage',
    permission: 'reports.kitchen_usage.view',
    roles: ['admin', 'manager', 'inventory', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Inventory',
  },
  // Procurement Reports
  {
    label: 'Purchase Summary',
    icon: 'shopping_bag',
    to: '/reports/purchase-summary',
    permission: 'reports.purchase_summary.view',
    roles: ['admin', 'manager', 'finance', 'procurement'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Procurement',
  },
  {
    label: 'GRN Report',
    icon: 'fact_check',
    to: '/reports/grn-report',
    permission: 'reports.grn_report.view',
    roles: ['admin', 'manager', 'finance', 'procurement'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Procurement',
  },
  // Finance Reports
  {
    label: 'Expense Summary',
    icon: 'trending_down',
    to: '/reports/expense-summary',
    permission: 'reports.expense_summary.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Finance',
  },
  {
    label: 'Daily Cash Summary',
    icon: 'point_of_sale',
    to: '/reports/daily-cash',
    permission: 'reports.daily_cash.view',
    roles: ['admin', 'manager', 'finance'],
    moduleCode: 'REPORTS',
    section: 'REPORTS',
    group: 'Finance',
  },

  // ─── WEBSITE ───────────────────────────────────────────────────────────────
  {
    label: 'Website Dashboard',
    icon: 'dashboard',
    to: '/website/dashboard',
    roles: ['admin', 'manager'],
    permission: 'website.dashboard.view',
    moduleCode: 'WEBSITE',
    section: 'WEBSITE',
    group: 'Overview',
  },
  {
    label: 'Website Orders',
    icon: 'language',
    to: '/website-orders',
    roles: ['admin', 'manager', 'cashier'],
    permission: 'website.orders.view',
    moduleCode: 'WEBSITE',
    section: 'WEBSITE',
    group: 'Website Management',
  },
  {
    label: 'Contact Messages',
    icon: 'mail',
    to: '/website-messages',
    roles: ['admin', 'manager'],
    permission: 'website.messages.view',
    moduleCode: 'WEBSITE',
    section: 'WEBSITE',
    group: 'Website Management',
  },
  {
    label: 'Reservations',
    icon: 'event_seat',
    to: '/website-reservations',
    roles: ['admin', 'manager'],
    permission: 'website.reservations.view',
    moduleCode: 'WEBSITE',
    section: 'WEBSITE',
    group: 'Website Management',
  },
  {
    label: 'Hall Bookings',
    icon: 'meeting_room',
    to: '/website-hall-bookings',
    roles: ['admin', 'manager'],
    permission: 'website.hall_bookings.view',
    moduleCode: 'WEBSITE',
    section: 'WEBSITE',
    group: 'Website Management',
  },
  {
    label: 'Menu Book QR',
    icon: 'qr_code_2',
    to: '/website-menu-qr',
    roles: ['admin', 'manager'],
    permission: 'website.menu_qr.view',
    moduleCode: 'WEBSITE',
    section: 'WEBSITE',
    group: 'Website Management',
  },

  // ─── SYSTEM ────────────────────────────────────────────────────────────────
  {
    label: 'System Dashboard',
    icon: 'dashboard',
    to: '/system/dashboard',
    roles: ['admin'],
    permission: 'admin.system.view',
    moduleCode: 'ADMIN',
    section: 'SYSTEM',
    group: 'Overview',
  },
  {
    label: 'AI System Auditor',
    icon: 'smart_toy',
    to: '/admin/ai-insights',
    roles: ['admin'],
    permission: 'ai.view',
    moduleCode: 'AI',
    section: 'SYSTEM',
    group: 'Overview',
  },
  {
    label: 'Customers',
    icon: 'people_alt',
    to: '/admin/customers',
    roles: ['admin', 'manager'],
    permission: 'crm.customers.view',
    moduleCode: 'CRM',
    section: 'SYSTEM',
    group: 'CRM',
  },
  {
    label: 'Loyalty Program',
    icon: 'card_giftcard',
    to: '/admin/loyalty',
    roles: ['admin', 'manager', 'cashier'],
    permission: 'crm.loyalty.view',
    moduleCode: 'CRM',
    section: 'SYSTEM',
    group: 'CRM',
  },
  {
    label: 'Earning Rules',
    icon: 'rule',
    to: '/admin/loyalty/earning-rules',
    roles: ['admin', 'manager'],
    permission: 'crm.loyalty.manage',
    moduleCode: 'CRM',
    section: 'SYSTEM',
    group: 'CRM',
  },
  {
    label: 'Approvals Center',
    icon: 'verified',
    to: '/admin/approvals',
    roles: ['admin', 'manager'],
    permission: 'admin.system.view',
    section: 'APPROVALS',
    group: 'Governance',
  },
  {
    label: 'Users',
    icon: 'manage_accounts',
    to: '/admin/users',
    roles: ['admin'],
    permission: 'admin.users.manage',
    moduleCode: 'ADMIN',
    section: 'SYSTEM',
    group: 'Administration',
  },
  {
    label: 'Roles & Permissions',
    icon: 'verified_user',
    to: '/admin/roles',
    roles: ['admin'],
    permission: 'admin.roles.manage',
    moduleCode: 'ADMIN',
    section: 'SYSTEM',
    group: 'Administration',
  },
  {
    label: 'Branches',
    icon: 'store_mall_directory',
    to: '/admin/branches',
    roles: ['admin'],
    permission: 'admin.branches.manage',
    moduleCode: 'ADMIN',
    section: 'SYSTEM',
    group: 'Administration',
  },
  {
    label: 'System Backup',
    icon: 'cloud_download',
    to: '/admin/backup',
    roles: ['admin'],
    permission: 'admin.backup.manage',
    moduleCode: 'ADMIN',
    section: 'SYSTEM',
    group: 'Administration',
  },
  {
    label: 'Security Center',
    icon: 'admin_panel_settings',
    to: '/admin/security-center',
    roles: ['admin'],
    permission: 'admin.settings.view',
    moduleCode: 'ADMIN',
    section: 'SYSTEM',
    group: 'Administration',
  },
  {
    label: 'Notification Gateways',
    icon: 'campaign',
    to: '/admin/settings',
    roles: ['admin'],
    permission: 'admin.settings.view',
    moduleCode: 'ADMIN',
    section: 'SYSTEM',
    group: 'Configuration',
  },
  {
    label: 'Settings',
    icon: 'settings',
    to: '/admin/settings',
    roles: ['admin'],
    permission: 'admin.settings.view',
    moduleCode: 'ADMIN',
    section: 'SYSTEM',
    group: 'Configuration',
  },
  {
    label: 'Audit Center',
    icon: 'gavel',
    to: '/audit',
    roles: ['admin'],
    permission: 'audit.view',
    moduleCode: 'AUDIT',
    section: 'SYSTEM',
    group: 'Security',
  },
  // ── AI Intelligence Module ───────────────────────────────────────────
  {
    label: 'AI Dashboard',
    icon: 'auto_awesome',
    to: '/ai',
    roles: ['admin', 'manager'],
    permission: 'ai.dashboard.view',
    moduleCode: 'AI',
    section: 'SYSTEM',
    group: 'AI Engine',
  },
  {
    label: 'AI Forecasts',
    icon: 'trending_up',
    to: '/ai/forecasts',
    roles: ['admin', 'manager'],
    permission: 'ai.forecasts.view',
    moduleCode: 'AI',
    section: 'SYSTEM',
    group: 'AI Engine',
  },
  {
    label: 'Anomaly Detection',
    icon: 'security',
    to: '/ai/anomalies',
    roles: ['admin', 'manager'],
    permission: 'ai.anomalies.view',
    moduleCode: 'AI',
    section: 'SYSTEM',
    group: 'AI Engine',
  },
  {
    label: 'AI Assistant',
    icon: 'smart_toy',
    to: '/ai/assistant',
    roles: ['admin', 'manager'],
    permission: 'ai.assistant.view',
    moduleCode: 'AI',
    section: 'SYSTEM',
    group: 'AI Engine',
  },
  // ─── GRANULAR ACTION PERMISSIONS (HIDDEN FROM SIDEBAR, SHOWN IN MATRIX) ───
  // Inventory Actions
  { label: 'Create Item', icon: 'add', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.items.create', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Inventory', hidden: true },
  { label: 'Edit Item', icon: 'edit', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.items.edit', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Inventory', hidden: true },
  { label: 'Delete Item', icon: 'delete', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.items.delete', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Inventory', hidden: true },

  { label: 'Create Menu Item', icon: 'add', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_menu_items.create', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Catalog', hidden: true },
  { label: 'Edit Menu Item', icon: 'edit', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_menu_items.edit', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Catalog', hidden: true },
  { label: 'Delete Menu Item', icon: 'delete', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_menu_items.delete', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Catalog', hidden: true },

  { label: 'Create Category', icon: 'add', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_menu_categories.create', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Catalog', hidden: true },
  { label: 'Edit Category', icon: 'edit', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_menu_categories.edit', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Catalog', hidden: true },
  { label: 'Delete Category', icon: 'delete', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_menu_categories.delete', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Catalog', hidden: true },

  { label: 'Create Warehouse', icon: 'add', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_warehouses.create', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Stock', hidden: true },
  { label: 'Edit Warehouse', icon: 'edit', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_warehouses.edit', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Stock', hidden: true },
  { label: 'Delete Warehouse', icon: 'delete', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_warehouses.delete', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Stock', hidden: true },

  { label: 'Create Adjustment', icon: 'add', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.adjustments.create', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Inventory', hidden: true },
  { label: 'Edit Adjustment', icon: 'edit', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.adjustments.edit', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Inventory', hidden: true },
  { label: 'Approve Adjustment', icon: 'check', roles: ['admin', 'manager'], permission: 'inventory.adjustments.approve', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Inventory', hidden: true },

  { label: 'Create Stocktake', icon: 'add', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.stocktake.create', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Inventory', hidden: true },
  { label: 'Edit Stocktake', icon: 'edit', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.stocktake.edit', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Inventory', hidden: true },
  { label: 'Approve Stocktake', icon: 'check', roles: ['admin', 'manager'], permission: 'inventory.stocktake.approve', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Inventory', hidden: true },

  { label: 'Create Recipe', icon: 'add', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_recipes.create', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Catalog', hidden: true },
  { label: 'Edit Recipe', icon: 'edit', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_recipes.edit', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Catalog', hidden: true },
  { label: 'Delete Recipe', icon: 'delete', roles: ['admin', 'manager', 'inventory'], permission: 'inventory.tab_recipes.delete', moduleCode: 'INVENTORY', section: 'INVENTORY', group: 'Catalog', hidden: true },

  // Procurement Actions
  { label: 'Create PO', icon: 'add', roles: ['admin', 'manager', 'procurement'], permission: 'procurement.purchase_orders.create', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },
  { label: 'Edit PO', icon: 'edit', roles: ['admin', 'manager', 'procurement'], permission: 'procurement.purchase_orders.edit', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },
  { label: 'Delete PO', icon: 'delete', roles: ['admin', 'manager', 'procurement'], permission: 'procurement.purchase_orders.delete', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },

  { label: 'Create GRN', icon: 'add', roles: ['admin', 'manager', 'procurement', 'inventory'], permission: 'procurement.grn.create', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },
  { label: 'Edit GRN', icon: 'edit', roles: ['admin', 'manager', 'procurement', 'inventory'], permission: 'procurement.grn.edit', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },
  { label: 'Delete GRN', icon: 'delete', roles: ['admin', 'manager', 'procurement', 'inventory'], permission: 'procurement.grn.delete', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },

  { label: 'Create GIN', icon: 'add', roles: ['admin', 'manager', 'procurement', 'inventory'], permission: 'procurement.gin.create', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },
  { label: 'Edit GIN', icon: 'edit', roles: ['admin', 'manager', 'procurement', 'inventory'], permission: 'procurement.gin.edit', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },
  { label: 'Delete GIN', icon: 'delete', roles: ['admin', 'manager', 'procurement', 'inventory'], permission: 'procurement.gin.delete', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },

  { label: 'Create Return', icon: 'add', roles: ['admin', 'manager', 'procurement', 'inventory'], permission: 'procurement.returns.create', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },
  { label: 'Edit Return', icon: 'edit', roles: ['admin', 'manager', 'procurement', 'inventory'], permission: 'procurement.returns.edit', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },
  { label: 'Delete Return', icon: 'delete', roles: ['admin', 'manager', 'procurement', 'inventory'], permission: 'procurement.returns.delete', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Procurement', hidden: true },

  { label: 'Create AP Invoice', icon: 'add', roles: ['admin', 'manager', 'finance', 'procurement'], permission: 'procurement.ap_invoices.create', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Payables', hidden: true },
  { label: 'Edit AP Invoice', icon: 'edit', roles: ['admin', 'manager', 'finance', 'procurement'], permission: 'procurement.ap_invoices.edit', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Payables', hidden: true },
  { label: 'Delete AP Invoice', icon: 'delete', roles: ['admin', 'manager', 'finance', 'procurement'], permission: 'procurement.ap_invoices.delete', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Payables', hidden: true },

  { label: 'Create Supplier Payment', icon: 'add', roles: ['admin', 'manager', 'finance', 'procurement'], permission: 'procurement.payments.create', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Payables', hidden: true },
  { label: 'Edit Supplier Payment', icon: 'edit', roles: ['admin', 'manager', 'finance', 'procurement'], permission: 'procurement.payments.edit', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Payables', hidden: true },
  { label: 'Delete Supplier Payment', icon: 'delete', roles: ['admin', 'manager', 'finance', 'procurement'], permission: 'procurement.payments.delete', moduleCode: 'PROCUREMENT', section: 'PROCUREMENT', group: 'Payables', hidden: true },

  // Finance Actions
  { label: 'Create Ledger', icon: 'add', roles: ['admin', 'finance'], permission: 'finance.ledgers.create', moduleCode: 'FINANCE', section: 'FINANCE', group: 'ERP Accounting', hidden: true },
  { label: 'Edit Ledger', icon: 'edit', roles: ['admin', 'finance'], permission: 'finance.ledgers.edit', moduleCode: 'FINANCE', section: 'FINANCE', group: 'ERP Accounting', hidden: true },
  { label: 'Delete Ledger', icon: 'delete', roles: ['admin', 'finance'], permission: 'finance.ledgers.delete', moduleCode: 'FINANCE', section: 'FINANCE', group: 'ERP Accounting', hidden: true },

  { label: 'Create Account', icon: 'add', roles: ['admin', 'finance'], permission: 'finance.accounts.create', moduleCode: 'FINANCE', section: 'FINANCE', group: 'ERP Accounting', hidden: true },
  { label: 'Edit Account', icon: 'edit', roles: ['admin', 'finance'], permission: 'finance.accounts.edit', moduleCode: 'FINANCE', section: 'FINANCE', group: 'ERP Accounting', hidden: true },
  { label: 'Delete Account', icon: 'delete', roles: ['admin', 'finance'], permission: 'finance.accounts.delete', moduleCode: 'FINANCE', section: 'FINANCE', group: 'ERP Accounting', hidden: true },

  { label: 'Create Pay Voucher', icon: 'add', roles: ['admin', 'finance'], permission: 'finance.pay_vouchers.create', moduleCode: 'FINANCE', section: 'FINANCE', group: 'Voucher Management', hidden: true },
  { label: 'Edit Pay Voucher', icon: 'edit', roles: ['admin', 'finance'], permission: 'finance.pay_vouchers.edit', moduleCode: 'FINANCE', section: 'FINANCE', group: 'Voucher Management', hidden: true },
  { label: 'Delete Pay Voucher', icon: 'delete', roles: ['admin', 'finance'], permission: 'finance.pay_vouchers.delete', moduleCode: 'FINANCE', section: 'FINANCE', group: 'Voucher Management', hidden: true },

  { label: 'Create Received Voucher', icon: 'add', roles: ['admin', 'finance'], permission: 'finance.received_vouchers.create', moduleCode: 'FINANCE', section: 'FINANCE', group: 'Voucher Management', hidden: true },
  { label: 'Edit Received Voucher', icon: 'edit', roles: ['admin', 'finance'], permission: 'finance.received_vouchers.edit', moduleCode: 'FINANCE', section: 'FINANCE', group: 'Voucher Management', hidden: true },
  { label: 'Delete Received Voucher', icon: 'delete', roles: ['admin', 'finance'], permission: 'finance.received_vouchers.delete', moduleCode: 'FINANCE', section: 'FINANCE', group: 'Voucher Management', hidden: true },

  { label: 'Create Expense', icon: 'add', roles: ['admin', 'finance', 'manager'], permission: 'finance.expenses.create', moduleCode: 'FINANCE', section: 'FINANCE', group: 'Expenses & Tax', hidden: true },
  { label: 'Edit Expense', icon: 'edit', roles: ['admin', 'finance', 'manager'], permission: 'finance.expenses.edit', moduleCode: 'FINANCE', section: 'FINANCE', group: 'Expenses & Tax', hidden: true },
  { label: 'Delete Expense', icon: 'delete', roles: ['admin', 'finance', 'manager'], permission: 'finance.expenses.delete', moduleCode: 'FINANCE', section: 'FINANCE', group: 'Expenses & Tax', hidden: true },
  
  { label: 'Manage Payroll', icon: 'settings', roles: ['admin', 'hr', 'finance'], permission: 'finance.payroll.manage', moduleCode: 'FINANCE', section: 'FINANCE', group: 'Payroll', hidden: true },
  { label: 'Run Payroll', icon: 'play_arrow', roles: ['admin', 'finance'], permission: 'finance.payroll.run', moduleCode: 'FINANCE', section: 'FINANCE', group: 'Payroll', hidden: true },

  // HR Actions
  { label: 'Create Employee', icon: 'add', roles: ['admin', 'hr'], permission: 'hr.employees.create', moduleCode: 'HR', section: 'HR', group: 'Staff', hidden: true },
  { label: 'Edit Employee', icon: 'edit', roles: ['admin', 'hr'], permission: 'hr.employees.edit', moduleCode: 'HR', section: 'HR', group: 'Staff', hidden: true },
  { label: 'Delete Employee', icon: 'delete', roles: ['admin', 'hr'], permission: 'hr.employees.delete', moduleCode: 'HR', section: 'HR', group: 'Staff', hidden: true },

  { label: 'Create Shift', icon: 'add', roles: ['admin', 'hr', 'manager'], permission: 'hr.shifts.create', moduleCode: 'HR', section: 'HR', group: 'Staff', hidden: true },
  { label: 'Edit Shift', icon: 'edit', roles: ['admin', 'hr', 'manager'], permission: 'hr.shifts.edit', moduleCode: 'HR', section: 'HR', group: 'Staff', hidden: true },
  { label: 'Delete Shift', icon: 'delete', roles: ['admin', 'hr', 'manager'], permission: 'hr.shifts.delete', moduleCode: 'HR', section: 'HR', group: 'Staff', hidden: true },

  { label: 'Approve Leave', icon: 'check', roles: ['admin', 'hr', 'manager'], permission: 'hr.leave.approve', moduleCode: 'HR', section: 'HR', group: 'Staff', hidden: true },
  { label: 'Reject Leave', icon: 'close', roles: ['admin', 'hr', 'manager'], permission: 'hr.leave.reject', moduleCode: 'HR', section: 'HR', group: 'Staff', hidden: true },

  // SYSTEM / ADMIN Actions
  { label: 'Create Customer', icon: 'add', roles: ['admin', 'manager'], permission: 'crm.customers.create', moduleCode: 'CRM', section: 'SYSTEM', group: 'CRM', hidden: true },
  { label: 'Edit Customer', icon: 'edit', roles: ['admin', 'manager'], permission: 'crm.customers.edit', moduleCode: 'CRM', section: 'SYSTEM', group: 'CRM', hidden: true },
  { label: 'Delete Customer', icon: 'delete', roles: ['admin', 'manager'], permission: 'crm.customers.delete', moduleCode: 'CRM', section: 'SYSTEM', group: 'CRM', hidden: true },

  { label: 'Create User', icon: 'add', roles: ['admin'], permission: 'admin.users.create', moduleCode: 'ADMIN', section: 'SYSTEM', group: 'Administration', hidden: true },
  { label: 'Edit User', icon: 'edit', roles: ['admin'], permission: 'admin.users.edit', moduleCode: 'ADMIN', section: 'SYSTEM', group: 'Administration', hidden: true },
  { label: 'Delete User', icon: 'delete', roles: ['admin'], permission: 'admin.users.delete', moduleCode: 'ADMIN', section: 'SYSTEM', group: 'Administration', hidden: true },

  { label: 'Create Branch', icon: 'add', roles: ['admin'], permission: 'admin.branches.create', moduleCode: 'ADMIN', section: 'SYSTEM', group: 'Administration', hidden: true },
  { label: 'Edit Branch', icon: 'edit', roles: ['admin'], permission: 'admin.branches.edit', moduleCode: 'ADMIN', section: 'SYSTEM', group: 'Administration', hidden: true },
  { label: 'Delete Branch', icon: 'delete', roles: ['admin'], permission: 'admin.branches.delete', moduleCode: 'ADMIN', section: 'SYSTEM', group: 'Administration', hidden: true },
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
        // Skip hidden items in the navigation sidebar
        if (item.hidden) return false

        // Admin wildcard
        if (userRoles.includes('admin') || userPermissions.includes('admin:console')) return true

        // 1. Check role access FIRST — roles should never be overridden by permissions
        const roleAllows = item.roles.some((role) => userRoles.includes(role))
        if (roleAllows) return true

        // 2. Check permission-based access (additive — grants extra visibility beyond roles).
        // item.permission here is legacy COLON format ('hr:access') which no
        // longer matches what /admin/roles actually saves or what the router
        // guard actually checks (dot format module codes like 'hr.view' —
        // see src/core/rbac/permissions.ts hasModuleAccess and
        // 20260801_fix_custom_permission_grants.sql). Without this fallback,
        // a custom access grant would let a user navigate to a route by URL
        // but the sidebar would never show it — exactly the "access saved
        // but nothing shows" bug. Mirror hasModuleAccess's own fallback: any
        // permission inside the module's dot-format namespace counts.
        if (item.permission && userPermissions.includes(item.permission)) return true
        const moduleCode = item.moduleCode
        if (moduleCode && userPermissions.some((p) => p.startsWith(`${moduleCode.toLowerCase()}.`))) {
          return true
        }

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
