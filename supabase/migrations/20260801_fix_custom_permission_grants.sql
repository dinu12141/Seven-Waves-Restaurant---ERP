-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Admin's "grant a specific user access to a specific section" UI
--
-- PROBLEM:
--   The Edit Access dialog on /admin/roles lets an admin toggle per-user
--   "custom permissions" into user_permissions.permission_code. But it saves
--   COLON-format codes (e.g. 'finance:access', 'hr:access') sourced from the
--   `permissions` table, which is itself seeded with a THIRD, unrelated
--   dot+underscore vocabulary (e.g. 'finance.journal_create', 'hr.payroll_run').
--   Meanwhile the actual router guard that decides real access
--   (src/boot/auth.ts -> hasPermission/hasModuleAccess in
--   src/core/rbac/permissions.ts) checks DOT format module-level codes like
--   'finance.view', 'hr.view' that match route meta (meta.module/meta.permission
--   in src/router/routes.js). None of these three vocabularies agree, so a
--   custom grant made through the admin UI had NO effect on what a user could
--   actually reach — the checkboxes were fully cosmetic.
--
-- FIX:
--   Seed the specific dot-format module-level '.view' codes that routes.js
--   actually checks (matching every distinct `module:` value used there), so
--   the admin UI (now rewritten to grant simple per-module access instead of
--   the old granular colon-coded list) can insert rows that the router guard
--   genuinely honors. Paired with the src/boot/auth.ts fix that lets a custom
--   permission grant substitute for a missing role.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.permissions (code, description) VALUES
    ('dashboard.view',    'Access the Dashboard module'),
    ('operations.view',   'Access the Operations module'),
    ('pos.view',          'Access the Point of Sale module'),
    ('inventory.view',    'Access the Inventory module'),
    ('procurement.view',  'Access the Procurement module'),
    ('finance.view',      'Access the Finance module'),
    ('hr.view',           'Access the HR & Payroll module'),
    ('devices.view',      'Access the Device Management module'),
    ('reports.view',      'Access the Reports module'),
    ('crm.view',          'Access the CRM / Customers module'),
    ('audit.view',        'Access the Audit Center'),
    ('ai.view',           'Access the AI Intelligence module'),
    ('admin.view',        'Access System Administration pages')
ON CONFLICT (code) DO NOTHING;
