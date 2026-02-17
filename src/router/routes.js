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
    path: '/auth',
    component: () => import('layouts/AuthLayout.vue'),
    meta: { requiresAuth: false },
    children: [{ path: 'login', component: () => import('pages/auth/LoginPage.vue') }],
  },

  // Always leave this as last one
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
