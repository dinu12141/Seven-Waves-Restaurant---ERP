const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard' },
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
        path: 'orders',
        component: () => import('pages/OrdersPage.vue'),
        meta: { roles: ['admin', 'manager', 'waiter', 'cashier'], module: 'pos', permission: 'pos.order.view' },
      },
      {
        path: 'website-orders',
        component: () => import('pages/WebsiteOrdersPage.vue'),
        meta: { roles: ['admin', 'manager', 'cashier'], module: 'website', permission: 'website.orders.view' },
      },
      {
        path: 'website/dashboard',
        component: () => import('pages/website/WebsiteDashboard.vue'),
        meta: { roles: ['admin', 'manager'], module: 'website', permission: 'website.dashboard.view' },
      },
      {
        path: 'website-messages',
        component: () => import('pages/website/WebsiteMessagesPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'website', permission: 'website.messages.view' },
      },
      {
        path: 'website-reservations',
        component: () => import('pages/website/WebsiteReservationsPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'website', permission: 'website.reservations.view' },
      },
      {
        path: 'website-hall-bookings',
        component: () => import('pages/website/WebsiteHallBookingsPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'website', permission: 'website.hall_bookings.view' },
      },
      {
        path: 'cashier',
        component: () => import('pages/CashierPage.vue'),
        meta: { roles: ['admin', 'manager', 'cashier'], module: 'pos', permission: 'pos.payment.collect' },
      },
      {
        path: 'inventory',
        component: () => import('pages/InventoryPage.vue'),
        // NOTE: this single page handles all "?tab=" nav items (Items, Menu
        // Items, Categories, Stock, Warehouses, etc. — see config/roles.ts
        // NAV_ITEMS INVENTORY section) internally; the route itself can only
        // gate the page as a whole, not each tab, since it's one component.
        meta: { roles: ['admin', 'manager', 'inventory'], module: 'inventory', permission: 'inventory.dashboard.view' },
      },
      {
        path: 'inventory/dashboard',
        component: () => import('pages/inventory/InventoryDashboard.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'], module: 'inventory', permission: 'inventory.dashboard.view' },
      },
      {
        path: 'inventory/items',
        component: () => import('pages/inventory/ItemsPage.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'], module: 'inventory', permission: 'inventory.items.view' },
      },
      {
        path: 'inventory/adjustments',
        component: () => import('pages/inventory/StockAdjustmentPage.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'], module: 'inventory', permission: 'inventory.adjustments.view' },
      },
      {
        path: 'inventory/stocktake',
        component: () => import('pages/inventory/StockTakePage.vue'),
        meta: { roles: ['admin', 'manager', 'inventory'], module: 'inventory', permission: 'inventory.stocktake.view' },
      },
      {
        path: 'finance',
        component: () => import('pages/finance/FinanceLayout.vue'),
        meta: { roles: ['admin', 'manager', 'finance'], module: 'finance', permission: 'finance.view' },
        children: [
          { path: '', redirect: '/finance/dashboard' },

          // ── Overview ──
          { path: 'dashboard', component: () => import('pages/finance/FinanceDashboard.vue'), meta: { permission: 'finance.dashboard.view' } },

          // ── ERP Accounting (New) ──
          { path: 'ledgers', component: () => import('src/modules/finance/pages/LedgerRegistrationPage.vue'), meta: { permission: 'finance.ledgers.view' } },
          { path: 'accounts', component: () => import('src/modules/finance/pages/AccountRegistrationPage.vue'), meta: { permission: 'finance.accounts.view' } },

          // ── Voucher Management (New) ──
          { path: 'pay-vouchers', component: () => import('src/modules/finance/pages/PayVoucherPage.vue'), meta: { permission: 'finance.pay_vouchers.view' } },
          { path: 'received-vouchers', component: () => import('src/modules/finance/pages/ReceivedVoucherPage.vue'), meta: { permission: 'finance.received_vouchers.view' } },
          { path: 'voucher-approvals', component: () => import('src/modules/finance/pages/VoucherApprovalPage.vue'), meta: { permission: 'finance.voucher_approvals.view' } },

          // ── Cash & Banking (New ERP) ──
          { path: 'cashbook', component: () => import('src/modules/finance/pages/CashbookPage.vue'), meta: { permission: 'finance.cashbook.view' } },
          { path: 'petty-cash', component: () => import('src/modules/finance/pages/PettyCashBookPage.vue'), meta: { permission: 'finance.petty_cash.view' } },
          { path: 'cheque-plan', component: () => import('src/modules/finance/pages/ChequePlanPage.vue'), meta: { permission: 'finance.cheque_plan.view' } },
          { path: 'bank-reconciliation', component: () => import('src/modules/finance/pages/BankReconciliationPage.vue'), meta: { permission: 'finance.bank_reconciliation.view' } },
          { path: 'fiscal-periods', component: () => import('src/modules/finance/pages/FiscalPeriodsPage.vue'), meta: { permission: 'finance.fiscal_periods.view' } },
          { path: 'pos-shifts', component: () => import('pages/finance/PosShiftsPage.vue'), meta: { permission: 'finance.pos_shifts.view' } },

          // ── Statutory Reports (New ERP) ──
          { path: 'financial-statements', component: () => import('src/modules/finance/pages/FinancialStatementsPage.vue'), meta: { permission: 'finance.financial_statements.view' } },

          // ── Receivables, Payables, Expenses, Tax (Kept) ──
          { path: 'receivables', component: () => import('pages/finance/ReceivablesPage.vue'), meta: { permission: 'finance.receivables.view' } },
          { path: 'payables', component: () => import('pages/finance/PayablesPage.vue'), meta: { permission: 'finance.payables.view' } },
          { path: 'expenses', component: () => import('pages/finance/ExpensesPage.vue'), meta: { permission: 'finance.expenses.view' } },
          { path: 'tax', component: () => import('pages/finance/TaxPage.vue'), meta: { permission: 'finance.tax.view' } },

          // ── Payroll (Kept) ──
          { path: 'payroll', component: () => import('pages/finance/PayrollPage.vue'), meta: { permission: 'finance.payroll.view' } },
          { path: 'payroll/run', component: () => import('pages/finance/PayrollRunPage.vue'), meta: { permission: 'finance.payroll.view' } },
          { path: 'payroll/payslips', component: () => import('pages/finance/PayslipsPage.vue'), meta: { permission: 'finance.payroll.view' } },
          { path: 'payroll/salary-structure', component: () => import('pages/finance/SalaryStructurePage.vue'), meta: { permission: 'finance.payroll.view' } },

          // ── Reports & Audit (Kept) ──
          { path: 'reports', component: () => import('pages/finance/FinanceReportsPage.vue'), meta: { permission: 'finance.reports.view' } },
          { path: 'audit', component: () => import('pages/finance/FinanceAuditPage.vue'), meta: { permission: 'finance.audit.view' } },

          // ── Backward-compatibility redirects (old paths → new ERP) ──
          { path: 'chart-of-accounts', redirect: '/finance/ledgers' },
          { path: 'journal-entries', redirect: '/finance/pay-vouchers' },
          { path: 'general-ledger', redirect: '/finance/ledgers' },
          { path: 'trial-balance', redirect: '/finance/financial-statements' },
          { path: 'cash-bank', redirect: '/finance/cashbook' },
        ],
      },
      // ── DEVICE MANAGEMENT ─────────────────────────────────────────────
      {
        path: 'devices',
        meta: { roles: ['admin', 'manager'], module: 'devices', permission: 'devices.dashboard.view' },
        children: [
          { path: '', component: () => import('src/modules/devices/pages/DeviceDashboardPage.vue'), meta: { permission: 'devices.dashboard.view' } },
          { path: 'printers', component: () => import('src/modules/devices/pages/PrinterManagementPage.vue'), meta: { permission: 'devices.printers.view' } },
          { path: 'scanners', component: () => import('src/modules/devices/pages/ScannerManagementPage.vue'), meta: { permission: 'devices.scanners.view' } },
          { path: 'biometrics', component: () => import('src/modules/devices/pages/BiometricDevicesPage.vue'), meta: { permission: 'devices.biometrics.view' } },
          { path: 'health', component: () => import('src/modules/devices/pages/DeviceHealthPage.vue'), meta: { permission: 'devices.health.view' } },
        ],
      },
      {
        path: 'hr',
        component: () => import('pages/hr/HRLayout.vue'),
        meta: { roles: ['admin', 'manager', 'hr'], module: 'hr', permission: 'hr.view' },
        children: [
          { path: '', redirect: '/hr/dashboard' },
          { path: 'dashboard', component: () => import('pages/hr/HRDashboard.vue') },
          { path: 'employees', component: () => import('pages/hr/EmployeesPage.vue'), meta: { permission: 'hr.employees.view' } },
          { path: 'attendance', component: () => import('pages/hr/AttendancePage.vue'), meta: { permission: 'hr.attendance.view' } },
          { path: 'payroll', component: () => import('pages/hr/PayrollPage.vue'), meta: { permission: 'hr.payroll.view' } },
          { path: 'commission', component: () => import('pages/hr/CommissionPage.vue'), meta: { permission: 'hr.commission.view' } },
          { path: 'audit', component: () => import('pages/hr/SalaryAuditPage.vue'), meta: { permission: 'hr.audit.view' } },

          { path: 'resignation', component: () => import('pages/hr/ResignationPage.vue'), meta: { permission: 'hr.resignation.view' } },
          { path: 'shifts', component: () => import('pages/hr/ShiftManagementPage.vue'), meta: { permission: 'hr.shifts.view' } },
          { path: 'leave', component: () => import('pages/hr/LeaveManagementPage.vue'), meta: { permission: 'hr.leave.view' } },
          { path: 'finances', component: () => import('pages/hr/EmployeeFinancesPage.vue'), meta: { permission: 'hr.finances.view' } },
          { path: 'documents', component: () => import('pages/hr/DocumentManagementPage.vue'), meta: { permission: 'hr.documents.view' } },
        ],
      },
      {
        path: 'procurement',
        component: () => import('pages/procurement/ProcurementLayout.vue'),
        children: [
          { path: '', redirect: '/procurement/dashboard' },
          {
            path: 'dashboard',
            component: () => import('pages/procurement/ProcurementDashboard.vue'),
            meta: { permission: 'procurement.dashboard.view' },
          },
          { path: 'suppliers', component: () => import('pages/procurement/SuppliersPage.vue'), meta: { permission: 'procurement.suppliers.view' } },
          {
            path: 'purchase-orders',
            component: () => import('pages/procurement/PurchaseOrdersPage.vue'),
            meta: { permission: 'procurement.purchase_orders.view' },
          },
          { path: 'grn', component: () => import('pages/procurement/GRNPage.vue'), meta: { permission: 'procurement.grn.view' } },
          { path: 'gin', component: () => import('pages/procurement/GINPage.vue'), meta: { permission: 'procurement.gin.view' } },
          { path: 'ap-invoices', component: () => import('pages/procurement/APInvoicesPage.vue'), meta: { permission: 'procurement.ap_invoices.view' } },
          { path: 'payments', component: () => import('pages/procurement/PaymentsPage.vue'), meta: { permission: 'procurement.payments.view' } },
          { path: 'payments-report', component: () => import('pages/procurement/SupplierPaymentReport.vue'), meta: { permission: 'procurement.payments_report.view' } },
          { path: 'returns', component: () => import('pages/procurement/PurchaseReturnsPage.vue'), meta: { permission: 'procurement.returns.view' } },
          {
            path: 'reports',
            component: () => import('pages/procurement/ProcurementReportsPage.vue'),
            meta: { permission: 'procurement.reports.view' },
          },
          {
            path: 'settings',
            component: () => import('pages/procurement/ProcurementSettingsPage.vue'),
            meta: { permission: 'procurement.settings.view' },
          },
        ],
        meta: { roles: ['admin', 'manager', 'inventory', 'finance', 'procurement'], module: 'procurement', permission: 'procurement.dashboard.view' },
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
        meta: { roles: ['admin', 'manager'], module: 'ai', permission: 'ai.dashboard.view' },
      },
      {
        path: 'ai/forecasts',
        component: () => import('src/modules/ai/pages/AiForecastPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'ai', permission: 'ai.forecasts.view' },
      },
      {
        path: 'ai/anomalies',
        component: () => import('src/modules/ai/pages/AiAnomalyCenterPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'ai', permission: 'ai.anomalies.view' },
      },
      {
        path: 'ai/assistant',
        component: () => import('src/modules/ai/pages/AiAssistantPage.vue'),
        meta: { roles: ['admin', 'manager'], module: 'ai', permission: 'ai.assistant.view' },
      },
      {
        path: 'admin/ai-insights',
        component: () => import('pages/admin/AIInsightsPage.vue'),
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
        meta: { roles: ['admin'], module: 'admin', permission: 'admin.printers.view' },
      },
      {
        path: 'admin/settings',
        component: () => import('pages/admin/SettingsPage.vue'),
        meta: { roles: ['admin'], module: 'admin', permission: 'admin.settings.view' },
      },
      {
        path: 'admin/backup',
        component: () => import('pages/admin/SystemBackupPage.vue'),
        meta: { requiresAuth: true, roles: ['admin'], module: 'admin', permission: 'admin.backup.manage' },
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
          { path: '', redirect: '/reports/dashboard' },
          { path: 'dashboard', component: () => import('pages/reports/ReportsDashboard.vue'), meta: { permission: 'reports.dashboard.view' } },
          // ── Sales Reports ─────────────────────────────────
          { path: 'sales', component: () => import('pages/reports/SalesReport.vue'), meta: { permission: 'reports.sales.view' } },
          {
            path: 'electronic-journal',
            component: () => import('pages/reports/ElectronicJournal.vue'),
            meta: { permission: 'reports.electronic_journal.view' },
          },
          { path: 'item-wise-sale', component: () => import('pages/reports/ItemWiseSale.vue'), meta: { permission: 'reports.item_wise_sale.view' } },
          { path: 'waiter-wise-sale', component: () => import('pages/reports/WaiterWiseSale.vue'), meta: { permission: 'reports.waiter_wise_sale.view' } },
          { path: 'table-wise-sale', component: () => import('pages/reports/TableWiseSale.vue'), meta: { permission: 'reports.table_wise_sale.view' } },
          { path: 'sales-statement', component: () => import('pages/reports/SalesStatement.vue'), meta: { permission: 'reports.sales_statement.view' } },
          { path: 'group-summary', component: () => import('pages/reports/GroupSummary.vue'), meta: { permission: 'reports.group_summary.view' } },
          {
            path: 'category-wise-sales',
            component: () => import('pages/reports/CategoryWiseSales.vue'),
            meta: { permission: 'reports.category_wise_sales.view' },
          },
          { path: 'hourly-sales', component: () => import('pages/reports/HourlySalesReport.vue'), meta: { permission: 'reports.hourly_sales.view' } },
          {
            path: 'branch-wise-sales',
            component: () => import('pages/reports/BranchWiseSales.vue'),
            meta: { permission: 'reports.branch_wise_sales.view' },
          },
          { path: 'discount-report', component: () => import('pages/reports/DiscountReport.vue'), meta: { permission: 'reports.discount_report.view' } },
          {
            path: 'void-cancelled',
            component: () => import('pages/reports/VoidCancelledReport.vue'),
            meta: { permission: 'reports.void_cancelled.view' },
          },
          {
            path: 'payment-summary',
            component: () => import('pages/reports/PaymentMethodSummary.vue'),
            meta: { permission: 'reports.payment_summary.view' },
          },
          // ── Operations Reports ────────────────────────────
          {
            path: 'kitchen-orders',
            component: () => import('pages/reports/KitchenOrderReport.vue'),
            meta: { permission: 'reports.kitchen_orders.view' },
          },
          { path: 'order-status', component: () => import('pages/reports/OrderStatusReport.vue'), meta: { permission: 'reports.order_status.view' } },
          {
            path: 'item-availability',
            component: () => import('pages/reports/ItemAvailability.vue'),
            meta: { permission: 'reports.item_availability.view' },
          },
          {
            path: 'delivery-performance',
            component: () => import('pages/reports/DeliveryPerformanceReport.vue'),
            meta: { permission: 'reports.delivery_performance.view' },
          },
          {
            path: 'rider-performance',
            component: () => import('pages/reports/RiderPerformanceReport.vue'),
            meta: { permission: 'reports.rider_performance.view' },
          },
          {
            path: 'pickup-delivery',
            component: () => import('pages/reports/PickupDeliverySummary.vue'),
            meta: { permission: 'reports.pickup_delivery.view' },
          },
          { path: 'reservation', component: () => import('pages/reports/ReservationReport.vue'), meta: { permission: 'reports.reservation.view' } },
          {
            path: 'kitchen-usage',
            component: () => import('pages/reports/DailyKitchenUsage.vue'),
            meta: { permission: 'reports.kitchen_usage.view' },
          },
          {
            path: 'customer-history',
            component: () => import('pages/reports/CustomerOrderHistory.vue'),
            meta: { permission: 'reports.customer_history.view' },
          },
          // ── Inventory Reports ─────────────────────────────
          { path: 'stock-on-hand', component: () => import('pages/reports/StockOnHand.vue'), meta: { permission: 'reports.stock_on_hand.view' } },
          { path: 'inventory', component: () => import('pages/reports/InventoryLedger.vue'), meta: { permission: 'reports.inventory.view' } },
          { path: 'wastage', component: () => import('pages/reports/WastageReport.vue'), meta: { permission: 'reports.wastage.view' } },
          {
            path: 'ingredient-consumption',
            component: () => import('pages/reports/IngredientConsumption.vue'),
            meta: { permission: 'reports.ingredient_consumption.view' },
          },
          {
            path: 'reorder-level',
            component: () => import('pages/reports/ReorderLevelReport.vue'),
            meta: { permission: 'reports.reorder_level.view' },
          },
          {
            path: 'purchase-consumption',
            component: () => import('pages/reports/PurchaseConsumptionAnalysis.vue'),
            meta: { permission: 'reports.purchase_consumption.view' },
          },
          { path: 'variance', component: () => import('pages/reports/VarianceReport.vue'), meta: { permission: 'reports.variance.view' } },
          {
            path: 'kot-deduction-log',
            component: () => import('pages/reports/KotDeductionLog.vue'),
            meta: { permission: 'reports.kot_deduction_log.view' },
          },
          // ── Procurement Reports ───────────────────────────
          {
            path: 'purchase-summary',
            component: () => import('pages/reports/PurchaseSummary.vue'),
            meta: { permission: 'reports.purchase_summary.view' },
          },
          {
            path: 'supplier-purchases',
            component: () => import('pages/reports/SupplierWisePurchases.vue'),
            meta: { permission: 'reports.supplier_purchases.view' },
          },
          { path: 'grn-report', component: () => import('pages/reports/GRNReport.vue'), meta: { permission: 'reports.grn_report.view' } },
          // ── Finance Reports ───────────────────────────────
          { path: 'revenue-summary', component: () => import('pages/reports/RevenueSummary.vue'), meta: { permission: 'reports.revenue_summary.view' } },
          { path: 'expense-summary', component: () => import('pages/reports/ExpenseSummary.vue'), meta: { permission: 'reports.expense_summary.view' } },
          { path: 'daily-cash', component: () => import('pages/reports/DailyCashSummary.vue'), meta: { permission: 'reports.daily_cash.view' } },
          // ── HR / Staff Reports ────────────────────────────
          {
            path: 'staff-performance',
            component: () => import('pages/reports/StaffSalesPerformance.vue'),
            meta: { permission: 'reports.staff_performance.view' },
          },
          {
            path: 'cashier-performance',
            component: () => import('pages/reports/CashierPerformance.vue'),
            meta: { permission: 'reports.cashier_performance.view' },
          },
          // ── System / Audit Reports ────────────────────────
          { path: 'user-activity', component: () => import('pages/reports/UserActivityLog.vue'), meta: { permission: 'reports.user_activity.view' } },
          { path: 'price-change', component: () => import('pages/reports/PriceChangeLog.vue'), meta: { permission: 'reports.price_change.view' } },
          {
            path: 'inventory-adjustments',
            component: () => import('pages/reports/InventoryAdjustmentLog.vue'),
            meta: { permission: 'reports.inventory_adjustments.view' },
          },
        ],
      },
    ],
  },
  // ── KDS — fullscreen dark layout for kitchen display screens (NO MainLayout) ─
  {
    path: '/kitchen',
    component: () => import('layouts/KDSLayout.vue'),
    meta: { requiresAuth: true, roles: ['admin', 'manager', 'kitchen', 'cashier'] },
    children: [
      { path: '', component: () => import('pages/KitchenPage.vue') },
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
