-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1: Extended RBAC — Enterprise Role Hierarchy
-- Seven Waves Restaurant ERP
-- Run AFTER: schema.sql, rbac_rls.sql
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- §1  EXTENDED ROLES
-- ─────────────────────────────────────────────────────────────────

INSERT INTO roles (name, description) VALUES
    ('owner',             'Restaurant owner with multi-branch oversight'),
    ('regional_manager',  'Regional Manager overseeing multiple branches'),
    ('procurement',       'Procurement Manager (PO, GRN, supplier management)'),
    ('delivery',          'Delivery Rider'),
    ('customer',          'End customer (self-service)'),
    ('super_admin',       'System super administrator')
ON CONFLICT (name) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────
-- §2  COMPREHENSIVE PERMISSION CATALOG
-- ─────────────────────────────────────────────────────────────────

INSERT INTO permissions (code, description) VALUES
    -- Dashboard
    ('dashboard.view',              'View main dashboard'),
    ('dashboard.analytics',         'View analytics widgets'),

    -- Orders / POS
    ('orders.create',               'Create new orders'),
    ('orders.read',                 'View orders'),
    ('orders.update',               'Modify existing orders'),
    ('orders.void',                 'Void/cancel orders'),
    ('orders.discount',             'Apply discounts to orders'),
    ('orders.refund',               'Process refunds'),
    ('orders.reprint',              'Reprint receipts'),
    ('orders.transfer_table',       'Transfer orders between tables'),

    -- Payments
    ('payments.process',            'Process payments'),
    ('payments.refund',             'Issue refunds'),
    ('payments.view_all',           'View all payment records'),
    ('payments.cash_drawer',        'Open cash drawer'),

    -- Kitchen
    ('kitchen.view',                'View kitchen display'),
    ('kitchen.manage',              'Manage kitchen stations'),
    ('kitchen.update_status',       'Update KOT status'),
    ('kitchen.void_item',           'Void kitchen items'),

    -- Inventory
    ('inventory.read',              'View inventory'),
    ('inventory.adjust',            'Make stock adjustments'),
    ('inventory.transfer',          'Transfer stock between warehouses'),
    ('inventory.count',             'Perform stock counts'),
    ('inventory.recipe_manage',     'Manage BOM/recipes'),

    -- Procurement
    ('procurement.po_create',       'Create purchase orders'),
    ('procurement.po_approve',      'Approve purchase orders'),
    ('procurement.grn_create',      'Create goods receipts'),
    ('procurement.grn_post',        'Post goods receipts'),
    ('procurement.supplier_manage', 'Manage suppliers'),
    ('procurement.ap_invoice',      'Manage AP invoices'),
    ('procurement.payment',         'Process supplier payments'),

    -- Finance
    ('finance.journal_create',      'Create journal entries'),
    ('finance.journal_approve',     'Approve journal entries'),
    ('finance.ledger_view',         'View general ledger'),
    ('finance.reports',             'View financial reports'),
    ('finance.coa_manage',          'Manage chart of accounts'),
    ('finance.tax_manage',          'Manage tax rules'),
    ('finance.fiscal_manage',       'Manage fiscal years'),

    -- HR
    ('hr.employees_manage',         'Manage employee records'),
    ('hr.attendance_manage',        'Manage attendance'),
    ('hr.leave_manage',             'Manage leave requests'),
    ('hr.payroll_run',              'Run payroll'),
    ('hr.payroll_approve',          'Approve payroll'),
    ('hr.salary_view',              'View salary details'),
    ('hr.documents_manage',         'Manage employee documents'),

    -- Reports
    ('reports.sales',               'View sales reports'),
    ('reports.operations',          'View operations reports'),
    ('reports.inventory',           'View inventory reports'),
    ('reports.finance',             'View finance reports'),
    ('reports.hr',                  'View HR reports'),
    ('reports.export',              'Export reports'),

    -- Admin
    ('admin.settings',              'Manage system settings'),
    ('admin.users',                 'Manage user accounts'),
    ('admin.roles',                 'Manage roles and permissions'),
    ('admin.branches',              'Manage branches'),
    ('admin.printers',              'Manage printer config'),
    ('admin.audit_view',            'View audit logs'),
    ('admin.security_view',         'View security events'),

    -- CRM
    ('crm.customers_manage',        'Manage customer records'),
    ('crm.loyalty_manage',          'Manage loyalty program'),
    ('crm.feedback_view',           'View customer feedback'),

    -- Delivery
    ('delivery.manage',             'Manage delivery orders'),
    ('delivery.assign',             'Assign riders'),
    ('delivery.track',              'Track deliveries'),
    ('delivery.self_orders',        'View own delivery orders')
ON CONFLICT (code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────
-- §3  DEFAULT ROLE → PERMISSION MAPPINGS
-- ─────────────────────────────────────────────────────────────────

-- Admin gets ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'manager' AND p.code IN (
    'dashboard.view', 'dashboard.analytics',
    'orders.create', 'orders.read', 'orders.update', 'orders.void', 'orders.discount', 'orders.refund', 'orders.reprint', 'orders.transfer_table',
    'payments.process', 'payments.refund', 'payments.view_all', 'payments.cash_drawer',
    'kitchen.view', 'kitchen.manage', 'kitchen.update_status', 'kitchen.void_item',
    'inventory.read', 'inventory.adjust', 'inventory.transfer', 'inventory.count', 'inventory.recipe_manage',
    'procurement.po_create', 'procurement.po_approve', 'procurement.grn_create', 'procurement.grn_post', 'procurement.supplier_manage', 'procurement.ap_invoice', 'procurement.payment',
    'reports.sales', 'reports.operations', 'reports.inventory', 'reports.finance', 'reports.hr', 'reports.export',
    'crm.customers_manage', 'crm.loyalty_manage', 'crm.feedback_view',
    'delivery.manage', 'delivery.assign', 'delivery.track'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Cashier
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'cashier' AND p.code IN (
    'orders.create', 'orders.read', 'orders.update', 'orders.reprint',
    'payments.process', 'payments.cash_drawer',
    'crm.customers_manage', 'crm.loyalty_manage'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Waiter
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'waiter' AND p.code IN (
    'orders.create', 'orders.read', 'orders.update', 'orders.transfer_table'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Kitchen
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'kitchen' AND p.code IN (
    'kitchen.view', 'kitchen.update_status',
    'inventory.read'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- HR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'hr' AND p.code IN (
    'hr.employees_manage', 'hr.attendance_manage', 'hr.leave_manage',
    'hr.payroll_run', 'hr.payroll_approve', 'hr.salary_view', 'hr.documents_manage',
    'reports.hr'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Finance
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'finance' AND p.code IN (
    'finance.journal_create', 'finance.journal_approve', 'finance.ledger_view',
    'finance.reports', 'finance.coa_manage', 'finance.tax_manage', 'finance.fiscal_manage',
    'reports.finance', 'reports.sales'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Inventory
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'inventory' AND p.code IN (
    'inventory.read', 'inventory.adjust', 'inventory.transfer',
    'inventory.count', 'inventory.recipe_manage',
    'reports.inventory'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Delivery
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'delivery' AND p.code IN (
    'delivery.self_orders', 'delivery.track'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────
-- §4  HELPER: Check permission via role_permissions
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_has_module_permission(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check role-level permission
    IF EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = auth.uid() AND p.code = p_code
    ) THEN
        RETURN true;
    END IF;

    -- Check user-level override
    RETURN COALESCE(auth_has_permission(p_code), false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_has_module_permission(TEXT) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- DONE ✅ Phase 1: Extended RBAC
-- ═══════════════════════════════════════════════════════════════════
