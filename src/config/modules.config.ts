// ═══════════════════════════════════════════════════════════════════
// Module Registry — Centralized Module Definitions
// Seven Waves ERP — Step 03C
// ═══════════════════════════════════════════════════════════════════

export interface ModuleDefinition {
  /** Unique module key — matches meta.module in routes */
  key: string
  /** Display name */
  label: string
  /** Material icon name */
  icon: string
  /** CSS variable for module accent: var(--erp-mod-{key}) */
  accentVar: string
  /** Default route for module entry */
  defaultRoute: string
  /** Minimum permission to view module */
  viewPermission: string
  /** Whether module supports offline mode */
  offlineCapable: boolean
  /** Whether module is a standalone PWA app */
  isPwa: boolean
}

/**
 * Master module registry — single source of truth for all ERP modules.
 * Used by: sidebar nav, module health checks, permission gates, breadcrumbs.
 */
export const MODULE_REGISTRY: Record<string, ModuleDefinition> = {
  dashboard: {
    key: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    accentVar: '--erp-primary',
    defaultRoute: '/dashboard',
    viewPermission: 'dashboard.view',
    offlineCapable: false,
    isPwa: false,
  },
  pos: {
    key: 'pos',
    label: 'Point of Sale',
    icon: 'point_of_sale',
    accentVar: '--erp-mod-pos',
    defaultRoute: '/pos',
    viewPermission: 'pos.order.create',
    offlineCapable: true,
    isPwa: false,
  },
  kitchen: {
    key: 'kitchen',
    label: 'Kitchen Display',
    icon: 'soup_kitchen',
    accentVar: '--erp-mod-kitchen',
    defaultRoute: '/kitchen',
    viewPermission: 'kitchen.view',
    offlineCapable: false,
    isPwa: false,
  },
  operations: {
    key: 'operations',
    label: 'Operations',
    icon: 'restaurant',
    accentVar: '--erp-mod-pos',
    defaultRoute: '/operations/tables',
    viewPermission: 'operations.view',
    offlineCapable: false,
    isPwa: false,
  },
  inventory: {
    key: 'inventory',
    label: 'Inventory',
    icon: 'inventory_2',
    accentVar: '--erp-mod-inventory',
    defaultRoute: '/inventory',
    viewPermission: 'inventory.view',
    offlineCapable: false,
    isPwa: false,
  },
  finance: {
    key: 'finance',
    label: 'Finance',
    icon: 'account_balance',
    accentVar: '--erp-mod-finance',
    defaultRoute: '/finance/dashboard',
    viewPermission: 'finance.view',
    offlineCapable: false,
    isPwa: false,
  },
  hr: {
    key: 'hr',
    label: 'Human Resources',
    icon: 'groups',
    accentVar: '--erp-mod-hr',
    defaultRoute: '/hr/dashboard',
    viewPermission: 'hr.view',
    offlineCapable: false,
    isPwa: false,
  },
  procurement: {
    key: 'procurement',
    label: 'Procurement',
    icon: 'local_shipping',
    accentVar: '--erp-mod-procurement',
    defaultRoute: '/procurement/dashboard',
    viewPermission: 'procurement.po.view',
    offlineCapable: false,
    isPwa: false,
  },
  crm: {
    key: 'crm',
    label: 'CRM & Loyalty',
    icon: 'loyalty',
    accentVar: '--erp-mod-crm',
    defaultRoute: '/admin/customers',
    viewPermission: 'crm.customers.view',
    offlineCapable: false,
    isPwa: false,
  },
  reports: {
    key: 'reports',
    label: 'Reports',
    icon: 'assessment',
    accentVar: '--erp-mod-reports',
    defaultRoute: '/reports/sales',
    viewPermission: 'reports.view',
    offlineCapable: false,
    isPwa: false,
  },
  admin: {
    key: 'admin',
    label: 'System Admin',
    icon: 'admin_panel_settings',
    accentVar: '--erp-mod-security',
    defaultRoute: '/admin/users',
    viewPermission: 'admin.view',
    offlineCapable: false,
    isPwa: false,
  },
  website: {
    key: 'website',
    label: 'Website',
    icon: 'language',
    accentVar: '--erp-mod-website',
    defaultRoute: '/website/dashboard',
    viewPermission: 'operations.view',
    offlineCapable: false,
    isPwa: false,
  },
  delivery: {
    key: 'delivery',
    label: 'Delivery',
    icon: 'delivery_dining',
    accentVar: '--erp-mod-delivery',
    defaultRoute: '/delivery-app',
    viewPermission: 'delivery.view',
    offlineCapable: true,
    isPwa: true,
  },
  waiter: {
    key: 'waiter',
    label: 'Waiter App',
    icon: 'person',
    accentVar: '--erp-role-waiter',
    defaultRoute: '/waiter-app',
    viewPermission: 'pos.order.create',
    offlineCapable: true,
    isPwa: true,
  },
  manager: {
    key: 'manager',
    label: 'Manager App',
    icon: 'supervisor_account',
    accentVar: '--erp-role-manager',
    defaultRoute: '/manager-app',
    viewPermission: 'operations.view',
    offlineCapable: false,
    isPwa: true,
  },
} as const

/** Get module by key */
export function getModule(key: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY[key]
}

/** Get all non-PWA modules (for admin sidebar) */
export function getAdminModules(): ModuleDefinition[] {
  return Object.values(MODULE_REGISTRY).filter(m => !m.isPwa)
}

/** Get all PWA modules */
export function getPwaModules(): ModuleDefinition[] {
  return Object.values(MODULE_REGISTRY).filter(m => m.isPwa)
}
