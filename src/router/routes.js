const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: 'dashboard' },
      {
        path: 'dashboard',
        component: () => import('pages/dashboard/DashboardPage.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      {
        path: 'pos',
        component: () => import('pages/POSPage.vue'),
        meta: { roles: ['admin', 'manager', 'cashier', 'waiter'] },
      },
      {
        path: 'kitchen',
        component: () => import('pages/KitchenPage.vue'),
        meta: { roles: ['admin', 'manager', 'kitchen'] },
      },
      {
        path: 'orders',
        component: () => import('pages/OrdersPage.vue'),
        meta: { roles: ['admin', 'manager', 'waiter', 'cashier'] },
      },
      {
        path: 'inventory',
        component: () => import('pages/InventoryPage.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'] },
      },
      {
        path: 'finance',
        component: () => import('pages/FinancePage.vue'),
        meta: { roles: ['admin', 'manager', 'finance'] },
      },
      {
        path: 'hr',
        component: () => import('pages/HRPage.vue'),
        meta: { roles: ['admin', 'manager', 'hr'] },
      },
      {
        path: 'procurement',
        component: () => import('pages/procurement/ProcurementLayout.vue'),
        children: [
          { path: '', redirect: 'suppliers' },
          { path: 'suppliers', component: () => import('pages/procurement/SuppliersPage.vue') },
          {
            path: 'purchase-orders',
            component: () => import('pages/procurement/PurchaseOrdersPage.vue'),
          },
          { path: 'grn', component: () => import('pages/procurement/GRNPage.vue') },
          { path: 'ap-invoices', component: () => import('pages/procurement/APInvoicesPage.vue') },
          { path: 'payments', component: () => import('pages/procurement/PaymentsPage.vue') },
          { path: 'returns', component: () => import('pages/procurement/PurchaseReturnsPage.vue') },
          {
            path: 'reports',
            component: () => import('pages/procurement/ProcurementReportsPage.vue'),
          },
          {
            path: 'settings',
            component: () => import('pages/procurement/ProcurementSettingsPage.vue'),
          },
        ],
        meta: { roles: ['admin', 'manager', 'inventory', 'finance', 'procurement'] },
      },
      {
        path: 'admin',
        component: () => import('pages/AdminPage.vue'),
        meta: { roles: ['admin'] },
      },
      {
        path: 'admin/users',
        component: () => import('pages/admin/UsersPage.vue'),
        meta: { roles: ['admin'] },
      },
      {
        path: 'admin/roles',
        component: () => import('pages/admin/RolesPage.vue'),
        meta: { roles: ['admin'] },
      },
      {
        path: 'admin/branches',
        component: () => import('pages/admin/BranchesPage.vue'),
        meta: { roles: ['admin'] },
      },
      {
        path: 'admin/kitchens',
        component: () => import('pages/admin/KitchensPage.vue'),
        meta: { roles: ['admin'] },
      },
      {
        path: 'admin/settings',
        component: () => import('pages/admin/SettingsPage.vue'),
        meta: { roles: ['admin'] },
      },
    ],
  },
  {
    path: '/menu',
    component: () => import('layouts/CustomerLayout.vue'),
    children: [
      { path: '', component: () => import('pages/CustomerMenuPage.vue') },
      { path: 'track', component: () => import('pages/OrderTrackingPage.vue') },
    ],
  },
  {
    path: '/auth',

    component: () => import('layouts/AuthLayout.vue'),
    meta: { requiresAuth: false },
    children: [{ path: 'login', component: () => import('pages/auth/LoginPage.vue') }],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
