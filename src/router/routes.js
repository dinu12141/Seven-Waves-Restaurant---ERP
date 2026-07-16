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
        meta: { roles: ['admin', 'manager'], module: 'dashboard', permission: 'dashboard.view' },
      },
      {
        path: 'operations/dashboard',
        component: () => import('pages/operations/OperationsDashboard.vue'),
        meta: { roles: ['admin', 'manager', 'waiter', 'cashier', 'kitchen'], module: 'operations', permission: 'operations.view' },
      },
      {
        path: 'system/dashboard',
        component: () => import('pages/admin/SystemDashboard.vue'),
        meta: { roles: ['admin'], module: 'admin', permission: 'admin.system.view' },
      },
      {
        path: 'manager/floor',
        component: () => import('pages/manager/ManagerFloorPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'operations', permission: 'operations.floor.view' },
      },
      {
        path: 'pos',
        component: () => import('pages/POSPage.vue'),
        meta: { roles: ['admin', 'manager', 'cashier', 'waiter'], module: 'pos', permission: 'pos.order.create' },
      },
      {
        path: 'kitchen',
        component: () => import('pages/KitchenPage.vue'),
        meta: { roles: ['admin', 'manager', 'kitchen', 'cashier'], module: 'kitchen', permission: 'kitchen.view' },
      },
      {
        path: 'orders',
        component: () => import('pages/OrdersPage.vue'),
        meta: { roles: ['admin', 'manager', 'waiter', 'cashier'], module: 'pos', permission: 'pos.order.view' },
      },
      {
        path: 'website-orders',
        component: () => import('pages/WebsiteOrdersPage.vue'),
        meta: { roles: ['admin', 'manager', 'cashier'], module: 'pos', permission: 'pos.order.view' },
      },
      {
        path: 'website/dashboard',
        component: () => import('pages/website/WebsiteDashboard.vue'),
        meta: { roles: ['admin', 'manager'], module: 'operations', permission: 'operations.view' },
      },
      {
        path: 'website-messages',
        component: () => import('pages/website/WebsiteMessagesPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'operations', permission: 'operations.view' },
      },
      {
        path: 'website-reservations',
        component: () => import('pages/website/WebsiteReservationsPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'operations', permission: 'operations.view' },
      },
      {
        path: 'website-hall-bookings',
        component: () => import('pages/website/WebsiteHallBookingsPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'operations', permission: 'operations.view' },
      },
      {
        path: 'cashier',
        component: () => import('pages/CashierPage.vue'),
        meta: { roles: ['admin', 'manager', 'cashier'], module: 'pos', permission: 'pos.payment.collect' },
      },
      {
        path: 'inventory',
        component: () => import('pages/InventoryPage.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'], module: 'inventory', permission: 'inventory.view' },
      },
      {
        path: 'inventory/dashboard',
        component: () => import('pages/inventory/InventoryDashboard.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'], module: 'inventory', permission: 'inventory.view' },
      },
      {
        path: 'inventory/items',
        component: () => import('pages/inventory/ItemsPage.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'], module: 'inventory', permission: 'inventory.items' },
      },
      {
        path: 'inventory/adjustments',
        component: () => import('pages/inventory/StockAdjustmentPage.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'], module: 'inventory', permission: 'inventory.adjust' },
      },
      {
        path: 'inventory/stocktake',
        component: () => import('pages/inventory/StockTakePage.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'], module: 'inventory', permission: 'inventory.stocktake' },
      },
      {
        path: 'finance',
        component: () => import('pages/finance/FinanceLayout.vue'),
        meta: { roles: ['admin', 'manager', 'finance'], module: 'finance', permission: 'finance.view' },
        children: [
          { path: '', redirect: 'dashboard' },

          // ── Overview ──
          { path: 'dashboard', component: () => import('pages/finance/FinanceDashboard.vue') },

          // ── ERP Accounting (New) ──
          { path: 'ledgers', component: () => import('src/modules/finance/pages/LedgerRegistrationPage.vue') },
          { path: 'accounts', component: () => import('src/modules/finance/pages/AccountRegistrationPage.vue') },

          // ── Voucher Management (New) ──
          { path: 'pay-vouchers', component: () => import('src/modules/finance/pages/PayVoucherPage.vue') },
          { path: 'received-vouchers', component: () => import('src/modules/finance/pages/ReceivedVoucherPage.vue') },
          { path: 'voucher-approvals', component: () => import('src/modules/finance/pages/VoucherApprovalPage.vue') },

          // ── Cash & Banking (New ERP) ──
          { path: 'cashbook', component: () => import('src/modules/finance/pages/CashbookPage.vue') },
          { path: 'petty-cash', component: () => import('src/modules/finance/pages/PettyCashBookPage.vue') },
          { path: 'cheque-plan', component: () => import('src/modules/finance/pages/ChequePlanPage.vue') },
          { path: 'bank-reconciliation', component: () => import('src/modules/finance/pages/BankReconciliationPage.vue') },
          { path: 'fiscal-periods', component: () => import('src/modules/finance/pages/FiscalPeriodsPage.vue') },
          { path: 'pos-shifts', component: () => import('pages/finance/PosShiftsPage.vue') },

          // ── Statutory Reports (New ERP) ──
          { path: 'financial-statements', component: () => import('src/modules/finance/pages/FinancialStatementsPage.vue') },

          // ── Receivables, Payables, Expenses, Tax (Kept) ──
          { path: 'receivables', component: () => import('pages/finance/ReceivablesPage.vue') },
          { path: 'payables', component: () => import('pages/finance/PayablesPage.vue') },
          { path: 'expenses', component: () => import('pages/finance/ExpensesPage.vue') },
          { path: 'tax', component: () => import('pages/finance/TaxPage.vue') },

          // ── Payroll (Kept) ──
          { path: 'payroll', component: () => import('pages/finance/PayrollPage.vue') },
          { path: 'payroll/run', component: () => import('pages/finance/PayrollRunPage.vue') },
          { path: 'payroll/payslips', component: () => import('pages/finance/PayslipsPage.vue') },
          { path: 'payroll/salary-structure', component: () => import('pages/finance/SalaryStructurePage.vue') },

          // ── Reports & Audit (Kept) ──
          { path: 'reports', component: () => import('pages/finance/FinanceReportsPage.vue') },
          { path: 'audit', component: () => import('pages/finance/FinanceAuditPage.vue') },

          // ── Backward-compatibility redirects (old paths → new ERP) ──
          { path: 'chart-of-accounts', redirect: 'ledgers' },
          { path: 'journal-entries', redirect: 'pay-vouchers' },
          { path: 'general-ledger', redirect: 'ledgers' },
          { path: 'trial-balance', redirect: 'financial-statements' },
          { path: 'cash-bank', redirect: 'cashbook' },
        ],
      },
      // ── DEVICE MANAGEMENT ─────────────────────────────────────────────
      {
        path: 'devices',
        meta: { roles: ['admin', 'manager'], module: 'devices', permission: 'devices.view' },
        children: [
          { path: '', component: () => import('src/modules/devices/pages/DeviceDashboardPage.vue') },
          { path: 'printers', component: () => import('src/modules/devices/pages/PrinterManagementPage.vue') },
          { path: 'scanners', component: () => import('src/modules/devices/pages/ScannerManagementPage.vue') },
          { path: 'biometrics', component: () => import('src/modules/devices/pages/BiometricDevicesPage.vue') },
          { path: 'health', component: () => import('src/modules/devices/pages/DeviceHealthPage.vue') },
        ],
      },
      {
        path: 'hr',
        component: () => import('pages/hr/HRLayout.vue'),
        meta: { roles: ['admin', 'manager', 'hr'], module: 'hr', permission: 'hr.view' },
        children: [
          { path: '', redirect: 'dashboard' },
          { path: 'dashboard', component: () => import('pages/hr/HRDashboard.vue') },
          { path: 'employees', component: () => import('pages/hr/EmployeesPage.vue') },
          { path: 'attendance', component: () => import('pages/hr/AttendancePage.vue') },
          { path: 'payroll', component: () => import('pages/hr/PayrollPage.vue') },
          { path: 'commission', component: () => import('pages/hr/CommissionPage.vue') },
          { path: 'audit', component: () => import('pages/hr/SalaryAuditPage.vue') },

          { path: 'resignation', component: () => import('pages/hr/ResignationPage.vue') },
          { path: 'shifts', component: () => import('pages/hr/ShiftManagementPage.vue') },
          { path: 'leave', component: () => import('pages/hr/LeaveManagementPage.vue') },
          { path: 'finances', component: () => import('pages/hr/EmployeeFinancesPage.vue') },
          { path: 'documents', component: () => import('pages/hr/DocumentManagementPage.vue') },
        ],
      },
      {
        path: 'procurement',
        component: () => import('pages/procurement/ProcurementLayout.vue'),
        children: [
          { path: '', redirect: 'dashboard' },
          {
            path: 'dashboard',
            component: () => import('pages/procurement/ProcurementDashboard.vue'),
          },
          { path: 'suppliers', component: () => import('pages/procurement/SuppliersPage.vue') },
          {
            path: 'purchase-orders',
            component: () => import('pages/procurement/PurchaseOrdersPage.vue'),
          },
          { path: 'grn', component: () => import('pages/procurement/GRNPage.vue') },
          { path: 'ap-invoices', component: () => import('pages/procurement/APInvoicesPage.vue') },
          { path: 'payments', component: () => import('pages/procurement/PaymentsPage.vue') },
          { path: 'payments-report', component: () => import('pages/procurement/SupplierPaymentReport.vue') },
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
        meta: { roles: ['admin', 'manager', 'inventory', 'finance', 'procurement'], module: 'procurement', permission: 'procurement.po.view' },
      },
      {
        path: 'admin',
        component: () => import('pages/AdminPage.vue'),
        meta: { roles: ['admin'], module: 'admin', permission: 'admin.view' },
      },
      // ── AI Intelligence Module ───────────────────────────────────────────
      {
        path: 'ai',
        component: () => import('src/modules/ai/pages/AiDashboardPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'ai', permission: 'ai.view' },
      },
      {
        path: 'ai/forecasts',
        component: () => import('src/modules/ai/pages/AiForecastPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'ai', permission: 'ai.view' },
      },
      {
        path: 'ai/anomalies',
        component: () => import('src/modules/ai/pages/AiAnomalyCenterPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'ai', permission: 'ai.security' },
      },
      {
        path: 'ai/assistant',
        component: () => import('src/modules/ai/pages/AiAssistantPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'ai', permission: 'ai.view' },
      },
      {
        path: 'admin/users',
        component: () => import('pages/admin/UsersPage.vue'),
        meta: { roles: ['admin'], module: 'admin', permission: 'admin.users.manage' },
      },
      {
        path: 'admin/roles',
        component: () => import('pages/admin/RolesPage.vue'),
        meta: { roles: ['admin'], module: 'admin', permission: 'admin.roles.manage' },
      },
      {
        path: 'admin/branches',
        component: () => import('pages/admin/BranchesPage.vue'),
        meta: { roles: ['admin'], module: 'admin', permission: 'admin.branches.manage' },
      },
      {
        path: 'admin/printers',
        component: () => import('pages/admin/PrintersPage.vue'),
        meta: { roles: ['admin'], module: 'admin', permission: 'admin.view' },
      },
      {
        path: 'admin/settings',
        component: () => import('pages/admin/SettingsPage.vue'),
        meta: { roles: ['admin'], module: 'admin', permission: 'admin.view' },
      },
      {
        path: 'audit',
        component: () => import('pages/audit/AuditCenterPage.vue'),
        meta: { roles: ['admin', 'super_admin'], module: 'audit', permission: 'audit.view' },
      },
      {
        path: 'admin/customers',
        component: () => import('pages/admin/CustomersPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'crm', permission: 'crm.customers.view' },
      },
      {
        path: 'admin/customers/:id',
        component: () => import('pages/admin/CustomerDetailPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'crm', permission: 'crm.customers.view' },
      },
      {
        // Loyalty Members Admin Module
        path: 'admin/loyalty',
        component: () => import('pages/admin/LoyaltyMembersPage.vue'),
        meta: { roles: ['admin', 'manager', 'cashier'], module: 'crm', permission: 'crm.loyalty.view' },
      },
      {
        path: 'admin/loyalty/:id',
        component: () => import('pages/admin/LoyaltyCustomerDetailPage.vue'),
        meta: { roles: ['admin', 'manager', 'cashier'], module: 'crm', permission: 'crm.loyalty.view' },
      },
      {
        path: 'admin/loyalty/earning-rules',
        component: () => import('pages/admin/EarningRulesPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'crm', permission: 'crm.loyalty.view' },
      },
      {
        path: 'operations/tables',
        component: () => import('pages/admin/TablesManagementPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'operations', permission: 'operations.tables.manage' },
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
      // ── Reports — nested under ReportsLayout for sidebar navigation ────────
      {
        path: 'reports',
        component: () => import('layouts/ReportsLayout.vue'),
        meta: { roles: ['admin', 'manager', 'finance', 'inventory', 'hr', 'procurement'], module: 'reports', permission: 'reports.view' },
        children: [
          { path: '', redirect: 'dashboard' },
          { path: 'dashboard', component: () => import('pages/reports/ReportsDashboard.vue') },
          // ── Sales Reports ─────────────────────────────────
          { path: 'sales', component: () => import('pages/reports/SalesReport.vue') },
          {
            path: 'electronic-journal',
            component: () => import('pages/reports/ElectronicJournal.vue'),
          },
          { path: 'item-wise-sale', component: () => import('pages/reports/ItemWiseSale.vue') },
          { path: 'waiter-wise-sale', component: () => import('pages/reports/WaiterWiseSale.vue') },
          { path: 'table-wise-sale', component: () => import('pages/reports/TableWiseSale.vue') },
          { path: 'sales-statement', component: () => import('pages/reports/SalesStatement.vue') },
          { path: 'group-summary', component: () => import('pages/reports/GroupSummary.vue') },
          {
            path: 'category-wise-sales',
            component: () => import('pages/reports/CategoryWiseSales.vue'),
          },
          { path: 'hourly-sales', component: () => import('pages/reports/HourlySalesReport.vue') },
          {
            path: 'branch-wise-sales',
            component: () => import('pages/reports/BranchWiseSales.vue'),
          },
          { path: 'discount-report', component: () => import('pages/reports/DiscountReport.vue') },
          {
            path: 'void-cancelled',
            component: () => import('pages/reports/VoidCancelledReport.vue'),
          },
          {
            path: 'payment-summary',
            component: () => import('pages/reports/PaymentMethodSummary.vue'),
          },
          // ── Operations Reports ────────────────────────────
          {
            path: 'kitchen-orders',
            component: () => import('pages/reports/KitchenOrderReport.vue'),
          },
          { path: 'order-status', component: () => import('pages/reports/OrderStatusReport.vue') },
          {
            path: 'item-availability',
            component: () => import('pages/reports/ItemAvailability.vue'),
          },
          {
            path: 'delivery-performance',
            component: () => import('pages/reports/DeliveryPerformanceReport.vue'),
          },
          {
            path: 'rider-performance',
            component: () => import('pages/reports/RiderPerformanceReport.vue'),
          },
          {
            path: 'pickup-delivery',
            component: () => import('pages/reports/PickupDeliverySummary.vue'),
          },
          { path: 'reservation', component: () => import('pages/reports/ReservationReport.vue') },
          {
            path: 'kitchen-usage',
            component: () => import('pages/reports/DailyKitchenUsage.vue'),
          },
          {
            path: 'customer-history',
            component: () => import('pages/reports/CustomerOrderHistory.vue'),
          },
          // ── Inventory Reports ─────────────────────────────
          { path: 'stock-on-hand', component: () => import('pages/reports/StockOnHand.vue') },
          { path: 'inventory', component: () => import('pages/reports/InventoryLedger.vue') },
          { path: 'wastage', component: () => import('pages/reports/WastageReport.vue') },
          {
            path: 'ingredient-consumption',
            component: () => import('pages/reports/IngredientConsumption.vue'),
          },
          {
            path: 'reorder-level',
            component: () => import('pages/reports/ReorderLevelReport.vue'),
          },
          {
            path: 'purchase-consumption',
            component: () => import('pages/reports/PurchaseConsumptionAnalysis.vue'),
          },
          { path: 'variance', component: () => import('pages/reports/VarianceReport.vue') },
          {
            path: 'kot-deduction-log',
            component: () => import('pages/reports/KotDeductionLog.vue'),
          },
          // ── Procurement Reports ───────────────────────────
          {
            path: 'purchase-summary',
            component: () => import('pages/reports/PurchaseSummary.vue'),
          },
          {
            path: 'supplier-purchases',
            component: () => import('pages/reports/SupplierWisePurchases.vue'),
          },
          { path: 'grn-report', component: () => import('pages/reports/GRNReport.vue') },
          // ── Finance Reports ───────────────────────────────
          { path: 'revenue-summary', component: () => import('pages/reports/RevenueSummary.vue') },
          { path: 'expense-summary', component: () => import('pages/reports/ExpenseSummary.vue') },
          { path: 'daily-cash', component: () => import('pages/reports/DailyCashSummary.vue') },
          // ── HR / Staff Reports ────────────────────────────
          {
            path: 'staff-performance',
            component: () => import('pages/reports/StaffSalesPerformance.vue'),
          },
          {
            path: 'cashier-performance',
            component: () => import('pages/reports/CashierPerformance.vue'),
          },
          // ── System / Audit Reports ────────────────────────
          { path: 'user-activity', component: () => import('pages/reports/UserActivityLog.vue') },
          { path: 'price-change', component: () => import('pages/reports/PriceChangeLog.vue') },
          {
            path: 'inventory-adjustments',
            component: () => import('pages/reports/InventoryAdjustmentLog.vue'),
          },
        ],
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
      { path: 'tables', component: () => import('pages/waiter-app/WaiterTablesPage.vue') },
      { path: 'inbox', component: () => import('pages/waiter-app/ShiftInboxPage.vue') },
      { path: 'orders', component: () => import('pages/waiter-app/MyOrdersPage.vue') },
      { path: 'alerts', component: () => import('pages/waiter-app/ReadyAlertsPage.vue') },
      { path: 'notifs', component: () => import('pages/waiter-app/NotificationsPage.vue') },
      { path: 'profile', component: () => import('pages/waiter-app/MyProfilePage.vue') },
      { path: 'pos', component: () => import('pages/waiter-app/WaiterPOSPage.vue') },
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
  // ── Delivery App — standalone full-screen mobile PWA (NO MainLayout) ───────
  {
    path: '/delivery-app',
    component: () => import('layouts/DeliveryAppLayout.vue'),
    meta: { requiresAuth: true, roles: ['admin', 'manager', 'delivery'] },
    children: [
      { path: '', component: () => import('pages/delivery-app/DeliveryHomePage.vue') },
      { path: 'active', component: () => import('pages/delivery-app/DeliveryActivePage.vue') },
      { path: 'map', component: () => import('pages/delivery-app/DeliveryMapPage.vue') },
      { path: 'history', component: () => import('pages/delivery-app/DeliveryHistoryPage.vue') },
      { path: 'profile', component: () => import('pages/delivery-app/DeliveryProfilePage.vue') },
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
    path: '/unauthorized',
    component: () => import('pages/UnauthorizedPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
