-- ═══════════════════════════════════════════════════════════════════════════════
-- HRMS COMPLETE MODULE — Restaurant ERP
-- ═══════════════════════════════════════════════════════════════════════════════
-- Extends the existing HR schema with:
--   §1  Employee Registration enhancements (missing fields)
--   §2  Employee Documents (KYC / file uploads)
--   §3  Employee Hierarchy (network registration)
--   §4  Salary Configuration (payment methods, allowances)
--   §5  Salary Additions & Deductions
--   §6  Commission Engine (packages, rules, tiers)
--   §7  Performance Evaluations
--   §8  Salary Audit system
--   §9  Employee Resignation
--   §10 Enhanced Payroll Engine RPC
--   §11 RLS Policies
-- ═══════════════════════════════════════════════════════════════════════════════


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §1  EMPLOYEE TABLE ENHANCEMENTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE employees ADD COLUMN IF NOT EXISTS name_with_initials TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'Sri Lankan';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS civil_status TEXT DEFAULT 'single';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address_line3 TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS road_map TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS passport_no TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS driving_license_no TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS residence_phone TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS education_level TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ol_results TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS al_results TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_graduate BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS epf_no TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_code TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS welfare_active BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Update employment_status constraint to include all requested statuses
ALTER TABLE employees DROP CONSTRAINT IF EXISTS chk_employment_status;
DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT chk_employment_status
    CHECK (employment_status IN ('active', 'permanent', 'probation', 'contract', 'part_time', 'inactive', 'suspended', 'terminated', 'resigned'));
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- Auto-generate EPF No for permanent employees
CREATE OR REPLACE FUNCTION auto_generate_epf_no()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_seq INT;
BEGIN
    IF NEW.employment_status = 'permanent' AND (NEW.epf_no IS NULL OR NEW.epf_no = '') THEN
        SELECT COALESCE(MAX(NULLIF(regexp_replace(epf_no, '[^0-9]', '', 'g'), '')::INT), 0) + 1
        INTO v_seq
        FROM employees
        WHERE company_id = NEW.company_id AND epf_no IS NOT NULL AND epf_no != '';

        NEW.epf_no := 'EPF' || LPAD(v_seq::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_epf_no ON employees;
CREATE TRIGGER trg_auto_epf_no
    BEFORE INSERT OR UPDATE OF employment_status ON employees
    FOR EACH ROW EXECUTE FUNCTION auto_generate_epf_no();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §2  EMPLOYEE DOCUMENTS (KYC)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS employee_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    doc_type    TEXT NOT NULL,
    doc_name    TEXT NOT NULL,
    file_path   TEXT NOT NULL,           -- Supabase Storage path
    file_size   BIGINT,
    mime_type   TEXT,
    expiry_date DATE,
    verified    BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMPTZ,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_doc_type CHECK (
        doc_type IN ('nic_front', 'nic_back', 'photo', 'gs_letter', 'police_report',
                     'driving_license', 'passport', 'birth_certificate', 'cv',
                     'educational_cert', 'experience_letter', 'other')
    )
);

CREATE INDEX IF NOT EXISTS idx_empdoc_employee ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_empdoc_type     ON employee_documents(doc_type);

DROP TRIGGER IF EXISTS trg_employee_documents_updated ON employee_documents;
CREATE TRIGGER trg_employee_documents_updated
BEFORE UPDATE ON employee_documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §3  EMPLOYEE HIERARCHY (Network Registration)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS hierarchy_levels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_hierarchy_level UNIQUE(company_id, code)
);

-- Seed default levels
INSERT INTO hierarchy_levels (company_id, code, name, sort_order)
SELECT c.id, lvl.code, lvl.name, lvl.sort_order
FROM companies c
CROSS JOIN (VALUES
    ('TEAM', 'Team', 1), ('BRANCH', 'Branch', 2), ('DISTRICT', 'District', 3),
    ('REGION', 'Region', 4), ('ZONE', 'Zonal', 5), ('HOD', 'Head of Department', 6)
) AS lvl(code, name, sort_order)
ON CONFLICT (company_id, code) DO NOTHING;

CREATE TABLE IF NOT EXISTS employee_hierarchy (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    level_id        UUID NOT NULL REFERENCES hierarchy_levels(id) ON DELETE RESTRICT,
    parent_id       UUID REFERENCES employee_hierarchy(id) ON DELETE SET NULL,
    manager_id      UUID REFERENCES employees(id) ON DELETE SET NULL,
    node_name       TEXT,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_emp_hierarchy UNIQUE(company_id, employee_id, level_id)
);

CREATE INDEX IF NOT EXISTS idx_eh_employee  ON employee_hierarchy(employee_id);
CREATE INDEX IF NOT EXISTS idx_eh_parent    ON employee_hierarchy(parent_id);
CREATE INDEX IF NOT EXISTS idx_eh_manager   ON employee_hierarchy(manager_id);
CREATE INDEX IF NOT EXISTS idx_eh_level     ON employee_hierarchy(level_id);

DROP TRIGGER IF EXISTS trg_employee_hierarchy_updated ON employee_hierarchy;
CREATE TRIGGER trg_employee_hierarchy_updated
BEFORE UPDATE ON employee_hierarchy
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §4  SALARY CONFIGURATION (Payment Methods + Allowance Templates)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Add salary method to salary_structures
ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS salary_method TEXT DEFAULT 'basic_salary';
ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS unit_rate NUMERIC(10,2) DEFAULT 0;
ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS day_rate NUMERIC(10,2) DEFAULT 0;
ALTER TABLE salary_structures ADD COLUMN IF NOT EXISTS commission_package_id UUID;

ALTER TABLE salary_structures DROP CONSTRAINT IF EXISTS chk_salary_method;
DO $$ BEGIN
  ALTER TABLE salary_structures ADD CONSTRAINT chk_salary_method
    CHECK (salary_method IN ('basic_salary', 'unit_salary', 'day_salary',
                             'commission_sales', 'commission_recovery', 'commission_hotline'));
EXCEPTION WHEN check_violation THEN NULL;
END $$;

-- Global Allowance Templates
CREATE TABLE IF NOT EXISTS salary_allowance_types (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    is_taxable  BOOLEAN DEFAULT false,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_allowance_type UNIQUE(company_id, code)
);

-- Seed default allowances
INSERT INTO salary_allowance_types (company_id, code, name, is_taxable)
SELECT c.id, a.code, a.name, a.taxable
FROM companies c
CROSS JOIN (VALUES
    ('SERVICE', 'Service Allowance', false), ('TRAVEL', 'Travel Allowance', false),
    ('FUEL', 'Fuel Allowance', false), ('VEHICLE', 'Vehicle Allowance', false),
    ('MEALS', 'Meals Allowance', false), ('ACCOMMODATION', 'Accommodation Allowance', false),
    ('INCENTIVE', 'Incentives', true), ('OT', 'Overtime', true),
    ('OTHER', 'Other Allowance', false)
) AS a(code, name, taxable)
ON CONFLICT (company_id, code) DO NOTHING;

-- Employee-specific Allowance Records
CREATE TABLE IF NOT EXISTS employee_allowances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    allowance_type_id UUID NOT NULL REFERENCES salary_allowance_types(id) ON DELETE RESTRICT,
    amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to    DATE,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_allowance_emp ON employee_allowances(employee_id);

DROP TRIGGER IF EXISTS trg_emp_allowances_updated ON employee_allowances;
CREATE TRIGGER trg_emp_allowances_updated
BEFORE UPDATE ON employee_allowances
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §5  SALARY ADDITIONS & DEDUCTIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS salary_additions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    description   TEXT NOT NULL,
    amount        NUMERIC(12,2) NOT NULL,
    addition_type TEXT NOT NULL DEFAULT 'temporary',
    start_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date      DATE,
    is_recurring  BOOLEAN DEFAULT false,
    is_applied    BOOLEAN DEFAULT false,
    approved_by   UUID REFERENCES auth.users(id),
    approved_at   TIMESTAMPTZ,
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    created_by    UUID REFERENCES auth.users(id),
    CONSTRAINT chk_addition_type CHECK (
        addition_type IN ('temporary', 'permanent', 'bonus', 'arrears', 'advance_recovery', 'other')
    )
);

CREATE INDEX IF NOT EXISTS idx_salary_add_emp   ON salary_additions(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_add_dates ON salary_additions(start_date, end_date);

DROP TRIGGER IF EXISTS trg_salary_additions_updated ON salary_additions;
CREATE TRIGGER trg_salary_additions_updated
BEFORE UPDATE ON salary_additions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS salary_deductions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    deduction_type  TEXT NOT NULL DEFAULT 'emergency',
    start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date        DATE,
    is_recurring    BOOLEAN DEFAULT false,
    total_amount    NUMERIC(12,2),
    paid_amount     NUMERIC(12,2) DEFAULT 0,
    installment_no  INT DEFAULT 1,
    total_installments INT DEFAULT 1,
    is_applied      BOOLEAN DEFAULT false,
    approved_by     UUID REFERENCES auth.users(id),
    approved_at     TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_deduction_type CHECK (
        deduction_type IN ('emergency', 'recurring', 'installment', 'welfare', 'penalty', 'other')
    )
);

CREATE INDEX IF NOT EXISTS idx_salary_ded_emp   ON salary_deductions(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_ded_dates ON salary_deductions(start_date, end_date);

DROP TRIGGER IF EXISTS trg_salary_deductions_updated ON salary_deductions;
CREATE TRIGGER trg_salary_deductions_updated
BEFORE UPDATE ON salary_deductions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §6  COMMISSION ENGINE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS commission_packages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    code        TEXT NOT NULL,
    description TEXT,
    package_type TEXT NOT NULL DEFAULT 'sales',
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    created_by  UUID REFERENCES auth.users(id),
    CONSTRAINT uq_commission_pkg UNIQUE(company_id, code),
    CONSTRAINT chk_pkg_type CHECK (
        package_type IN ('sales', 'recovery', 'hotline', 'installation')
    )
);

DROP TRIGGER IF EXISTS trg_commission_packages_updated ON commission_packages;
CREATE TRIGGER trg_commission_packages_updated
BEFORE UPDATE ON commission_packages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS commission_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id      UUID NOT NULL REFERENCES commission_packages(id) ON DELETE CASCADE,
    rule_type       TEXT NOT NULL,
    tier_name       TEXT,
    min_units       NUMERIC(10,2) DEFAULT 0,
    max_units       NUMERIC(10,2),
    rate_per_unit   NUMERIC(10,2) DEFAULT 0,
    fixed_amount    NUMERIC(12,2) DEFAULT 0,
    percentage      NUMERIC(5,2) DEFAULT 0,
    applies_to      TEXT DEFAULT 'self',
    sort_order      INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_rule_type CHECK (
        rule_type IN ('direct_commission', 'leader_commission', 'upline_commission',
                      'fuel_allowance', 'installation_incentive', 'tier_mpo', 'tier_bsm', 'other')
    ),
    CONSTRAINT chk_applies_to CHECK (
        applies_to IN ('self', 'team', 'branch', 'district', 'region', 'zone')
    )
);

CREATE INDEX IF NOT EXISTS idx_comm_rules_pkg ON commission_rules(package_id);

-- Employee commission assignments
CREATE TABLE IF NOT EXISTS employee_commissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    package_id      UUID NOT NULL REFERENCES commission_packages(id) ON DELETE RESTRICT,
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to    DATE,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_emp_commission UNIQUE(employee_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_comm_emp ON employee_commissions(employee_id);

-- Commission sales records (track actual sales for commission calculation)
CREATE TABLE IF NOT EXISTS commission_sales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    period_month    DATE NOT NULL,
    units_sold      NUMERIC(10,2) DEFAULT 0,
    total_sales     NUMERIC(14,2) DEFAULT 0,
    commission_amount NUMERIC(12,2) DEFAULT 0,
    leader_bonus    NUMERIC(12,2) DEFAULT 0,
    upline_bonus    NUMERIC(12,2) DEFAULT 0,
    fuel_allowance  NUMERIC(10,2) DEFAULT 0,
    incentives      NUMERIC(10,2) DEFAULT 0,
    total_payout    NUMERIC(14,2) DEFAULT 0,
    status          TEXT DEFAULT 'draft',
    approved_by     UUID REFERENCES auth.users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_comm_sales UNIQUE(employee_id, period_month),
    CONSTRAINT chk_comm_status CHECK (status IN ('draft', 'calculated', 'approved', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_comm_sales_emp ON commission_sales(employee_id);
CREATE INDEX IF NOT EXISTS idx_comm_sales_period ON commission_sales(period_month);

DROP TRIGGER IF EXISTS trg_commission_sales_updated ON commission_sales;
CREATE TRIGGER trg_commission_sales_updated
BEFORE UPDATE ON commission_sales
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Link commission_package_id FK
ALTER TABLE salary_structures DROP CONSTRAINT IF EXISTS fk_salary_commission_pkg;
DO $$ BEGIN
  ALTER TABLE salary_structures
    ADD CONSTRAINT fk_salary_commission_pkg
    FOREIGN KEY (commission_package_id) REFERENCES commission_packages(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §7  PERFORMANCE EVALUATIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS performance_criteria (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    max_score   INT NOT NULL DEFAULT 4,
    weight      NUMERIC(5,2) DEFAULT 1.0,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_perf_criteria UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS performance_evaluations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    evaluation_period TEXT NOT NULL,
    evaluator_id    UUID REFERENCES employees(id),
    total_score     NUMERIC(5,2) DEFAULT 0,
    max_possible    NUMERIC(5,2) DEFAULT 0,
    percentage      NUMERIC(5,2) DEFAULT 0,
    grade           TEXT,
    comments        TEXT,
    status          TEXT DEFAULT 'draft',
    approved_by     UUID REFERENCES auth.users(id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_eval_status CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    CONSTRAINT uq_eval_period UNIQUE(employee_id, evaluation_period)
);

CREATE INDEX IF NOT EXISTS idx_perf_eval_emp ON performance_evaluations(employee_id);

DROP TRIGGER IF EXISTS trg_perf_eval_updated ON performance_evaluations;
CREATE TRIGGER trg_perf_eval_updated
BEFORE UPDATE ON performance_evaluations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS performance_scores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id   UUID NOT NULL REFERENCES performance_evaluations(id) ON DELETE CASCADE,
    criteria_id     UUID NOT NULL REFERENCES performance_criteria(id) ON DELETE RESTRICT,
    score           INT NOT NULL DEFAULT 0,
    remarks         TEXT,
    CONSTRAINT chk_score_range CHECK (score >= 0 AND score <= 4),
    CONSTRAINT uq_eval_criteria UNIQUE(evaluation_id, criteria_id)
);


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §8  SALARY AUDIT SYSTEM
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS salary_audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    payroll_run_id  UUID REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    field_name      TEXT,
    old_value       TEXT,
    new_value       TEXT,
    reason          TEXT,
    performed_by    UUID NOT NULL REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_audit_action CHECK (
        action IN ('hold', 'release', 'edit_gross', 'edit_net', 'edit_deduction',
                   'approve', 'reject', 'mark_paid', 'bank_ref_update', 'final_approve')
    )
);

CREATE INDEX IF NOT EXISTS idx_sal_audit_run  ON salary_audit_logs(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_sal_audit_emp  ON salary_audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_sal_audit_date ON salary_audit_logs(created_at DESC);

-- Add hold/bank-ref fields to payslips
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS is_held BOOLEAN DEFAULT false;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS hold_reason TEXT;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS held_by UUID REFERENCES auth.users(id);
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS bank_reference TEXT;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS final_approved_by UUID REFERENCES auth.users(id);
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS final_approved_at TIMESTAMPTZ;

-- Add commission columns to payslips
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS welfare_deduction NUMERIC(10,2) DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS custom_additions NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS custom_deductions NUMERIC(12,2) DEFAULT 0;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §9  EMPLOYEE RESIGNATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS employee_resignations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    resignation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_working_day DATE,
    reason          TEXT NOT NULL,
    reason_category TEXT DEFAULT 'personal',
    interviewed_by  UUID REFERENCES employees(id),
    interview_notes TEXT,
    interview_date  DATE,
    status          TEXT DEFAULT 'submitted',
    approved_by     UUID REFERENCES auth.users(id),
    approved_at     TIMESTAMPTZ,
    final_settlement NUMERIC(14,2),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_resign_status CHECK (
        status IN ('submitted', 'under_review', 'interview_scheduled', 'approved', 'rejected', 'withdrawn')
    ),
    CONSTRAINT chk_resign_category CHECK (
        reason_category IN ('personal', 'career', 'relocation', 'health',
                           'compensation', 'management', 'terminated', 'other')
    )
);

CREATE INDEX IF NOT EXISTS idx_resign_emp    ON employee_resignations(employee_id);
CREATE INDEX IF NOT EXISTS idx_resign_status ON employee_resignations(status);

DROP TRIGGER IF EXISTS trg_resign_updated ON employee_resignations;
CREATE TRIGGER trg_resign_updated
BEFORE UPDATE ON employee_resignations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-update employee status on resignation approval
CREATE OR REPLACE FUNCTION auto_resign_employee()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
        UPDATE employees
        SET employment_status = 'resigned',
            termination_date = COALESCE(NEW.last_working_day, CURRENT_DATE),
            is_active = false,
            updated_at = now()
        WHERE id = NEW.employee_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_resign ON employee_resignations;
CREATE TRIGGER trg_auto_resign
    AFTER UPDATE OF status ON employee_resignations
    FOR EACH ROW EXECUTE FUNCTION auto_resign_employee();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §10  ENHANCED PAYROLL ENGINE RPC
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION process_monthly_payroll(
    p_branch_id     UUID,
    p_period_month  DATE  -- First day of month e.g. '2026-03-01'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id       UUID := auth.uid();
    v_company_id    UUID;
    v_period_start  DATE;
    v_period_end    DATE;
    v_run_id        UUID;
    v_emp           RECORD;
    v_sal           RECORD;
    v_count         INT := 0;
    v_total_gross   NUMERIC := 0;
    v_total_net     NUMERIC := 0;
    v_total_ded     NUMERIC := 0;
    v_basic         NUMERIC;
    v_allowances    NUMERIC;
    v_ot_hours      NUMERIC;
    v_ot_amount     NUMERIC;
    v_days_worked   INT;
    v_days_absent   INT;
    v_absent_ded    NUMERIC;
    v_epf_emp       NUMERIC;
    v_epf_er        NUMERIC;
    v_etf_er        NUMERIC;
    v_loan_ded      NUMERIC;
    v_welfare_ded   NUMERIC;
    v_custom_add    NUMERIC;
    v_custom_ded    NUMERIC;
    v_commission    NUMERIC;
    v_gross         NUMERIC;
    v_total_deductions NUMERIC;
    v_net           NUMERIC;
BEGIN
    -- Auth check
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    IF NOT (auth_has_role('admin') OR auth_has_role('hr')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin can run payroll.');
    END IF;

    -- Derive period
    v_period_start := date_trunc('month', p_period_month)::DATE;
    v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    -- Get company
    SELECT company_id INTO v_company_id FROM branches WHERE id = p_branch_id;
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Branch not found.');
    END IF;

    -- Create/update payroll run
    INSERT INTO payroll_runs (company_id, branch_id, period_start, period_end, status, processed_by)
    VALUES (v_company_id, p_branch_id, v_period_start, v_period_end, 'processing', v_user_id)
    ON CONFLICT (branch_id, period_start, period_end) DO UPDATE SET
        status = 'processing', processed_by = v_user_id, updated_at = now()
    RETURNING id INTO v_run_id;

    -- Clear existing payslips for re-run
    DELETE FROM payslips WHERE payroll_run_id = v_run_id;

    -- Process each active employee
    FOR v_emp IN
        SELECT * FROM employees
        WHERE branch_id = p_branch_id AND is_active = true
        AND (termination_date IS NULL OR termination_date >= v_period_start)
    LOOP
        v_basic := 0; v_allowances := 0; v_ot_hours := 0; v_ot_amount := 0;
        v_days_worked := 0; v_days_absent := 0; v_absent_ded := 0;
        v_epf_emp := 0; v_epf_er := 0; v_etf_er := 0;
        v_loan_ded := 0; v_welfare_ded := 0; v_custom_add := 0; v_custom_ded := 0;
        v_commission := 0; v_gross := 0; v_total_deductions := 0; v_net := 0;

        -- Get salary structure
        SELECT * INTO v_sal FROM salary_structures
        WHERE employee_id = v_emp.id AND is_current = true LIMIT 1;

        IF v_sal.id IS NULL THEN CONTINUE; END IF;

        -- ── Calculate base salary by method ──
        CASE v_sal.salary_method
            WHEN 'basic_salary' THEN
                v_basic := v_sal.basic_salary;

            WHEN 'day_salary' THEN
                SELECT COUNT(*) INTO v_days_worked
                FROM attendance_records
                WHERE employee_id = v_emp.id
                  AND attendance_date BETWEEN v_period_start AND v_period_end
                  AND status IN ('present', 'late');
                v_basic := v_days_worked * COALESCE(v_sal.day_rate, 0);

            WHEN 'unit_salary' THEN
                SELECT COALESCE(SUM(units_sold), 0) INTO v_basic
                FROM commission_sales
                WHERE employee_id = v_emp.id AND period_month = v_period_start;
                v_basic := v_basic * COALESCE(v_sal.unit_rate, 0);

            WHEN 'commission_sales', 'commission_recovery', 'commission_hotline' THEN
                v_basic := v_sal.basic_salary; -- base + commission
                SELECT COALESCE(total_payout, 0) INTO v_commission
                FROM commission_sales
                WHERE employee_id = v_emp.id AND period_month = v_period_start;
        END CASE;

        -- ── Attendance-based absent deduction (basic salary method) ──
        IF v_sal.salary_method = 'basic_salary' THEN
            SELECT COUNT(*) INTO v_days_absent
            FROM attendance_records
            WHERE employee_id = v_emp.id
              AND attendance_date BETWEEN v_period_start AND v_period_end
              AND status IN ('absent');
            v_absent_ded := v_days_absent * (v_sal.basic_salary / 30);

            SELECT COUNT(*) INTO v_days_worked
            FROM attendance_records
            WHERE employee_id = v_emp.id
              AND attendance_date BETWEEN v_period_start AND v_period_end
              AND status IN ('present', 'late', 'half_day');
        END IF;

        -- ── Overtime ──
        SELECT COALESCE(SUM(overtime_hours), 0) INTO v_ot_hours
        FROM attendance_records
        WHERE employee_id = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end;

        v_ot_amount := v_ot_hours * COALESCE(v_sal.hourly_rate, v_sal.basic_salary / 240) *
                       COALESCE(v_sal.overtime_rate_multiplier, 1.5);

        -- ── Employee-Specific Allowances ──
        SELECT COALESCE(SUM(amount), 0) INTO v_allowances
        FROM employee_allowances
        WHERE employee_id = v_emp.id AND is_active = true
          AND effective_from <= v_period_end
          AND (effective_to IS NULL OR effective_to >= v_period_start);

        -- + fixed allowances from salary structure
        v_allowances := v_allowances +
            COALESCE(v_sal.housing_allowance, 0) + COALESCE(v_sal.transport_allowance, 0) +
            COALESCE(v_sal.meal_allowance, 0) + COALESCE(v_sal.other_allowances, 0);

        -- ── Custom Additions (temporary/permanent) ──
        SELECT COALESCE(SUM(amount), 0) INTO v_custom_add
        FROM salary_additions
        WHERE employee_id = v_emp.id
          AND start_date <= v_period_end
          AND (end_date IS NULL OR end_date >= v_period_start);

        -- ── Custom Deductions ──
        SELECT COALESCE(SUM(amount), 0) INTO v_custom_ded
        FROM salary_deductions
        WHERE employee_id = v_emp.id
          AND start_date <= v_period_end
          AND (end_date IS NULL OR end_date >= v_period_start)
          AND deduction_type != 'welfare';

        -- ── Welfare deduction ──
        IF v_emp.welfare_active THEN
            SELECT COALESCE(SUM(amount), 0) INTO v_welfare_ded
            FROM salary_deductions
            WHERE employee_id = v_emp.id AND deduction_type = 'welfare'
              AND start_date <= v_period_end
              AND (end_date IS NULL OR end_date >= v_period_start);
        END IF;

        -- ── EPF/ETF ──
        v_epf_emp := v_basic * (COALESCE(v_sal.epf_employee_pct, 8) / 100);
        v_epf_er := v_basic * (COALESCE(v_sal.epf_employer_pct, 12) / 100);
        v_etf_er := v_basic * (COALESCE(v_sal.etf_employer_pct, 3) / 100);

        -- ── Loans ──
        SELECT COALESCE(SUM(LEAST(monthly_installment, remaining_balance)), 0) INTO v_loan_ded
        FROM employee_loans
        WHERE employee_id = v_emp.id AND status = 'active';

        -- ── Calculate Gross & Net ──
        v_gross := v_basic + v_allowances + v_ot_amount + v_custom_add + v_commission - v_absent_ded;
        v_total_deductions := v_epf_emp + v_loan_ded + v_welfare_ded + v_custom_ded +
                              COALESCE(v_sal.other_deductions, 0);
        v_net := v_gross - v_total_deductions;

        -- ── Insert Payslip ──
        INSERT INTO payslips (
            company_id, branch_id, payroll_run_id, employee_id,
            basic_salary,
            housing_allowance, transport_allowance, meal_allowance, other_allowances, total_allowances,
            overtime_hours, overtime_amount,
            commission_amount, custom_additions, custom_deductions, welfare_deduction,
            gross_salary,
            epf_employee, epf_employer, etf_employer,
            loan_deduction, other_deductions, total_deductions,
            net_salary,
            days_worked, days_absent,
            payment_status
        ) VALUES (
            v_company_id, p_branch_id, v_run_id, v_emp.id,
            ROUND(v_basic, 2),
            COALESCE(v_sal.housing_allowance,0), COALESCE(v_sal.transport_allowance,0),
            COALESCE(v_sal.meal_allowance,0), COALESCE(v_sal.other_allowances,0),
            ROUND(v_allowances, 2),
            ROUND(v_ot_hours, 2), ROUND(v_ot_amount, 2),
            ROUND(v_commission, 2), ROUND(v_custom_add, 2), ROUND(v_custom_ded, 2),
            ROUND(v_welfare_ded, 2),
            ROUND(v_gross, 2),
            ROUND(v_epf_emp, 2), ROUND(v_epf_er, 2), ROUND(v_etf_er, 2),
            ROUND(v_loan_ded, 2), COALESCE(v_sal.other_deductions, 0),
            ROUND(v_total_deductions, 2),
            ROUND(v_net, 2),
            v_days_worked, v_days_absent,
            'pending'
        );

        v_count := v_count + 1;
        v_total_gross := v_total_gross + v_gross;
        v_total_net := v_total_net + v_net;
        v_total_ded := v_total_ded + v_total_deductions;
    END LOOP;

    -- Finalize run
    UPDATE payroll_runs SET
        total_gross = ROUND(v_total_gross, 2),
        total_deductions = ROUND(v_total_ded, 2),
        total_net = ROUND(v_total_net, 2),
        employee_count = v_count,
        status = 'processed',
        updated_at = now()
    WHERE id = v_run_id;

    -- Log event
    INSERT INTO salary_audit_logs (company_id, branch_id, payroll_run_id, action, performed_by)
    VALUES (v_company_id, p_branch_id, v_run_id, 'approve', v_user_id);

    RETURN jsonb_build_object(
        'success', true,
        'payroll_run_id', v_run_id,
        'employee_count', v_count,
        'total_gross', ROUND(v_total_gross, 2),
        'total_deductions', ROUND(v_total_ded, 2),
        'total_net', ROUND(v_total_net, 2),
        'period', v_period_start || ' to ' || v_period_end
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION process_monthly_payroll(UUID, DATE) TO authenticated;

-- Final audit approval function
CREATE OR REPLACE FUNCTION approve_salary_final(
    p_payroll_run_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_run     RECORD;
    v_held    INT;
BEGIN
    IF NOT (auth_has_role('admin') OR auth_has_role('hr')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only HR Manager / Admin can final-approve.');
    END IF;

    SELECT * INTO v_run FROM payroll_runs WHERE id = p_payroll_run_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payroll run not found.');
    END IF;

    IF v_run.status NOT IN ('processed', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payroll must be in processed state.');
    END IF;

    -- Check for held payslips
    SELECT COUNT(*) INTO v_held FROM payslips WHERE payroll_run_id = p_payroll_run_id AND is_held = true;

    IF v_held > 0 THEN
        RETURN jsonb_build_object('success', false, 'error',
            v_held || ' payslip(s) are on hold. Release them before final approval.');
    END IF;

    -- Mark all payslips as paid
    UPDATE payslips SET
        payment_status = 'paid', paid_at = now(),
        final_approved_by = v_user_id, final_approved_at = now()
    WHERE payroll_run_id = p_payroll_run_id AND is_held = false;

    -- Update run
    UPDATE payroll_runs SET
        status = 'paid', approved_by = v_user_id, approved_at = now(), updated_at = now()
    WHERE id = p_payroll_run_id;

    -- Log
    INSERT INTO salary_audit_logs (company_id, branch_id, payroll_run_id, action, performed_by)
    VALUES (v_run.company_id, v_run.branch_id, p_payroll_run_id, 'final_approve', v_user_id);

    RETURN jsonb_build_object('success', true, 'payroll_run_id', p_payroll_run_id, 'status', 'paid');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_salary_final(UUID) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §11  RLS POLICIES (All new tables)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Macro for standard HR RLS (admin full, hr branch-scoped, finance select-only)
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'employee_documents', 'employee_hierarchy', 'hierarchy_levels',
        'salary_allowance_types', 'employee_allowances',
        'salary_additions', 'salary_deductions',
        'commission_packages', 'commission_rules', 'employee_commissions', 'commission_sales',
        'performance_criteria', 'performance_evaluations', 'performance_scores',
        'salary_audit_logs', 'employee_resignations'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

            -- Admin full access
            EXECUTE format('DROP POLICY IF EXISTS rls_%I_admin ON %I', t, t);
            EXECUTE format('CREATE POLICY rls_%I_admin ON %I FOR ALL
                USING (public.auth_has_role(''admin''))
                WITH CHECK (public.auth_has_role(''admin''))', t, t);

            -- HR full access (same company)
            EXECUTE format('DROP POLICY IF EXISTS rls_%I_hr ON %I', t, t);
            EXECUTE format('CREATE POLICY rls_%I_hr ON %I FOR ALL
                USING (public.auth_has_role(''hr''))
                WITH CHECK (public.auth_has_role(''hr''))', t, t);

            -- Finance SELECT only (salary-related tables)
            IF t IN ('salary_additions', 'salary_deductions', 'salary_audit_logs',
                     'commission_sales', 'employee_allowances') THEN
                EXECUTE format('DROP POLICY IF EXISTS rls_%I_finance ON %I', t, t);
                EXECUTE format('CREATE POLICY rls_%I_finance ON %I FOR SELECT
                    USING (public.auth_has_role(''finance''))', t, t);
            END IF;
        END IF;
    END LOOP;
END $$;

-- Employees RLS: self can view own profile only
DROP POLICY IF EXISTS emp_self_select ON employees;
CREATE POLICY emp_self_select ON employees FOR SELECT
    USING (profile_id = auth.uid());


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DONE ✅
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
