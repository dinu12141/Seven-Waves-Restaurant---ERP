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
        path: 'operations/dashboard',
        component: () => import('pages/operations/OperationsDashboard.vue'),
        meta: { roles: ['admin', 'manager', 'waiter', 'cashier', 'kitchen'] },
      },
      {
        path: 'system/dashboard',
        component: () => import('pages/admin/SystemDashboard.vue'),
        meta: { roles: ['admin'] },
      },
      {
        path: 'manager/floor',
        component: () => import('pages/manager/ManagerFloorPage.vue'),
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
        meta: { roles: ['admin', 'manager', 'kitchen', 'cashier'] },
      },
      {
        path: 'orders',
        component: () => import('pages/OrdersPage.vue'),
        meta: { roles: ['admin', 'manager', 'waiter', 'cashier'] },
      },
      {
        path: 'cashier',
        component: () => import('pages/CashierPage.vue'),
        meta: { roles: ['admin', 'manager', 'cashier'] },
      },
      {
        path: 'inventory',
        component: () => import('pages/InventoryPage.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'] },
      },
      {
        path: 'inventory/dashboard',
        component: () => import('pages/inventory/InventoryDashboard.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'] },
      },
      {
        path: 'finance',
        component: () => import('pages/FinancePage.vue'),
        meta: { roles: ['admin', 'manager', 'finance'] },
      },
      {
        path: 'finance/dashboard',
        component: () => import('pages/finance/FinanceDashboard.vue'),
        meta: { roles: ['admin', 'manager', 'finance'] },
      },
      {
        path: 'hr',
        component: () => import('pages/hr/HRLayout.vue'),
        meta: { roles: ['admin', 'manager', 'hr'] },
        children: [
          { path: '', redirect: 'dashboard' },
          { path: 'dashboard', component: () => import('pages/hr/HRDashboard.vue') },
          { path: 'employees', component: () => import('pages/hr/EmployeesPage.vue') },
          { path: 'attendance', component: () => import('pages/hr/AttendancePage.vue') },
          { path: 'payroll', component: () => import('pages/hr/PayrollPage.vue') },
          { path: 'commission', component: () => import('pages/hr/CommissionPage.vue') },
          { path: 'audit', component: () => import('pages/hr/SalaryAuditPage.vue') },
          { path: 'performance', component: () => import('pages/hr/PerformancePage.vue') },
          { path: 'resignation', component: () => import('pages/hr/ResignationPage.vue') },
          { path: 'shifts', component: () => import('pages/hr/ShiftManagementPage.vue') },
        ],
      },
      {
        path: 'procurement',
        component: () => import('pages/procurement/ProcurementLayout.vue'),
        children: [
          { path: '', redirect: 'dashboard' },
          { path: 'dashboard', component: () => import('pages/procurement/ProcurementDashboard.vue') },
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
        path: 'admin/printers',
        component: () => import('pages/admin/PrintersPage.vue'),
        meta: { roles: ['admin'] },
      },
      {
        path: 'admin/settings',
        component: () => import('pages/admin/SettingsPage.vue'),
        meta: { roles: ['admin'] },
      },
      {
        path: 'admin/customers',
        component: () => import('pages/admin/CustomersPage.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      {
        path: 'admin/customers/:id',
        component: () => import('pages/admin/CustomerDetailPage.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      {
        // Loyalty Members Admin Module
        path: 'admin/loyalty',
        component: () => import('pages/admin/LoyaltyMembersPage.vue'),
        meta: { roles: ['admin', 'manager', 'cashier'] },
      },
      {
        path: 'admin/loyalty/:id',
        component: () => import('pages/admin/LoyaltyCustomerDetailPage.vue'),
        meta: { roles: ['admin', 'manager', 'cashier'] },
      },
      {
        path: 'operations/tables',
        component: () => import('pages/admin/TablesManagementPage.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      {
        // Legacy redirect — desktop view retired
        path: 'waiter',
        redirect: '/waiter-app',
        meta: { roles: ['admin', 'manager', 'waiter'] },
      },
      // NOTE: /waiter-app is a top-level standalone route (see below) — the
      // sidebar link navigates there directly; no child route needed here.
      {
        path: 'profile',
        component: () => import('pages/auth/UserProfilePage.vue'),
      },
      // ── Reports ───────────────────────────────────────────────────────────────
      {
        path: 'reports/dashboard',
        component: () => import('pages/reports/ReportsDashboard.vue'),
        meta: { roles: ['admin', 'manager', 'finance'] },
      },
      {
        path: 'reports/sales',
        component: () => import('pages/reports/SalesReport.vue'),
        meta: { roles: ['admin', 'manager', 'finance'] },
      },
      {
        path: 'reports/inventory',
        component: () => import('pages/reports/InventoryLedger.vue'),
        meta: { roles: ['admin', 'manager', 'inventory', 'finance'] },
      },
      {
        path: 'reports/electronic-journal',
        component: () => import('pages/reports/ElectronicJournal.vue'),
        meta: { roles: ['admin', 'manager', 'finance'] },
      },
      {
        path: 'reports/item-wise-sale',
        component: () => import('pages/reports/ItemWiseSale.vue'),
        meta: { roles: ['admin', 'manager', 'finance'] },
      },
      {
        path: 'reports/waiter-wise-sale',
        component: () => import('pages/reports/WaiterWiseSale.vue'),
        meta: { roles: ['admin', 'manager', 'finance'] },
      },
      {
        path: 'reports/table-wise-sale',
        component: () => import('pages/reports/TableWiseSale.vue'),
        meta: { roles: ['admin', 'manager', 'finance'] },
      },
      {
        path: 'reports/sales-statement',
        component: () => import('pages/reports/SalesStatement.vue'),
        meta: { roles: ['admin', 'manager', 'finance'] },
      },
      {
        path: 'reports/group-summary',
        component: () => import('pages/reports/GroupSummary.vue'),
        meta: { roles: ['admin', 'manager', 'finance'] },
      },
      {
        path: 'reports/inventory-performance',
        component: () => import('pages/reports/InventoryPerformanceReport.vue'),
        meta: { roles: ['admin', 'manager', 'inventory', 'finance'] },
      },
    ],
  },
  // ── Waiter App — standalone full-screen mobile PWA (NO MainLayout) ──────────
  {
    path: '/waiter-app',
    component: () => import('layouts/WaiterAppLayout.vue'),
    meta: { requiresAuth: true, roles: ['admin', 'manager', 'waiter'] },
    children: [
      { path: '', component: () => import('pages/waiter-app/WaiterHomePage.vue') },
      { path: 'inbox', component: () => import('pages/waiter-app/ShiftInboxPage.vue') },
      { path: 'orders', component: () => import('pages/waiter-app/MyOrdersPage.vue') },
      { path: 'alerts', component: () => import('pages/waiter-app/ReadyAlertsPage.vue') },
      { path: 'notifs', component: () => import('pages/waiter-app/NotificationsPage.vue') },
      { path: 'profile', component: () => import('pages/waiter-app/MyProfilePage.vue') },
    ],
  },
  // ── Manager App — standalone full-screen mobile PWA (NO MainLayout) ────────
  {
    path: '/manager-app',
    component: () => import('layouts/ManagerAppLayout.vue'),
    meta: { requiresAuth: true, roles: ['admin', 'manager'] },
    children: [
      { path: '', component: () => import('pages/manager-app/ManagerHomePage.vue') },
      { path: 'floor', component: () => import('pages/manager-app/FloorOverviewPage.vue') },
      { path: 'waiters', component: () => import('pages/manager-app/WaitersPage.vue') },
      { path: 'waiters/:id', component: () => import('pages/manager-app/WaiterDetailPage.vue') },
      { path: 'orders', component: () => import('pages/manager-app/OrdersMonitorPage.vue') },
      { path: 'messages', component: () => import('pages/manager-app/MessagesPage.vue') },
      { path: 'alerts', component: () => import('pages/manager-app/AlertsPage.vue') },
      { path: 'profile', component: () => import('pages/manager-app/ManagerProfilePage.vue') },
    ],
  },
  {
    path: '/menu',
    component: () => import('layouts/CustomerLayout.vue'),
    children: [
      { path: '', component: () => import('pages/CustomerMenuPage.vue') },
      { path: 'track/:orderId', component: () => import('pages/OrderTrackingPage.vue') },
    ],
  },
  {
    // Touch Screen Menu Book Layout (Tablet/Mobile WebApp format)
    path: '/touch',
    component: () => import('layouts/TouchMenuLayout.vue'),
    meta: { requiresAuth: false },
    children: [{ path: '', component: () => import('pages/touch-menu/MenuBookTablet.vue') }],
  },
  {
    // Customer authentication (email/password register + login)
    // Also accessible at /customer/register and /customer/login as aliases
    path: '/customer/auth',
    component: () => import('pages/CustomerAuthPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/customer/register',
    component: () => import('pages/CustomerAuthPage.vue'),
    meta: { requiresAuth: false },
    props: () => ({ defaultTab: 'register' }),
  },
  {
    path: '/customer/login',
    component: () => import('pages/CustomerAuthPage.vue'),
    meta: { requiresAuth: false },
    props: () => ({ defaultTab: 'login' }),
  },
  {
    // Loyalty digital card
    path: '/loyalty',
    component: () => import('pages/LoyaltyPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    // QR code entry — scanned from table, resolves token → session → menu
    path: '/c/:qrToken',
    component: () => import('pages/QrEntryPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    // Standalone table device login — no auth required
    path: '/table-login',
    component: () => import('pages/TableLoginPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    // Table customer menu — session validated in-component
    path: '/table/:sessionToken/menu',
    component: () => import('pages/TableMenuPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    // Order tracking (standalone from table session menu)
    path: '/menu/track/:orderId',
    component: () => import('pages/OrderTrackingPage.vue'),
    meta: { requiresAuth: false },
  },
  {
    // Order tracking within table session (supports back navigation to /table/:token/menu)
    path: '/table/:sessionToken/track/:orderId',
    component: () => import('pages/OrderTrackingPage.vue'),
    meta: { requiresAuth: false },
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
