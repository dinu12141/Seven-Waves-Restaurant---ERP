-- =====================================================
-- HR & PAYROLL: ADVANCES & EXPENSES MODULE
-- =====================================================

-- 1. Create table for Employee Salary Advances
CREATE TABLE IF NOT EXISTS employee_advances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    request_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    deducted_date DATE,
    payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_advance_amount CHECK (amount > 0),
    CONSTRAINT chk_advance_status CHECK (status IN ('pending', 'approved', 'rejected', 'deducted'))
);

CREATE INDEX IF NOT EXISTS idx_employee_advances_employee_id ON employee_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_advances_branch_id ON employee_advances(branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_advances_status ON employee_advances(status);

CREATE TRIGGER trg_employee_advances_upd
BEFORE UPDATE ON employee_advances
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Create table for Employee Expenses
CREATE TABLE IF NOT EXISTS employee_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    expense_type TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    receipt_url TEXT,
    status TEXT DEFAULT 'pending',
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    reimbursed_date DATE,
    payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_expense_amount CHECK (amount > 0),
    CONSTRAINT chk_expense_status CHECK (status IN ('pending', 'approved', 'rejected', 'reimbursed'))
);

CREATE INDEX IF NOT EXISTS idx_employee_expenses_employee_id ON employee_expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_expenses_branch_id ON employee_expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_expenses_status ON employee_expenses(status);

CREATE TRIGGER trg_employee_expenses_upd
BEFORE UPDATE ON employee_expenses
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- 3. Update payslips table to explicitly show advances and reimbursements
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='advance_deduction') THEN
        ALTER TABLE payslips ADD COLUMN advance_deduction NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='expense_reimbursement') THEN
        ALTER TABLE payslips ADD COLUMN expense_reimbursement NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;


-- 4. Set proper RLS policies for advances
ALTER TABLE employee_advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adv_admin ON employee_advances;
CREATE POLICY adv_admin ON employee_advances FOR ALL USING (public.auth_has_role('admin')) WITH CHECK (public.auth_has_role('admin'));

DROP POLICY IF EXISTS adv_hr ON employee_advances;
CREATE POLICY adv_hr ON employee_advances FOR ALL USING (public.auth_has_role('hr') AND branch_id = ANY(public.auth_branch_ids())) WITH CHECK (public.auth_has_role('hr'));

DROP POLICY IF EXISTS adv_manager ON employee_advances;
CREATE POLICY adv_manager ON employee_advances FOR SELECT USING (public.auth_has_role('manager') AND branch_id = ANY(public.auth_branch_ids()));

DROP POLICY IF EXISTS adv_self ON employee_advances;
CREATE POLICY adv_self ON employee_advances FOR SELECT USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_advances.employee_id AND e.profile_id = auth.uid()));


-- 5. Set proper RLS policies for expenses
ALTER TABLE employee_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exp_admin ON employee_expenses;
CREATE POLICY exp_admin ON employee_expenses FOR ALL USING (public.auth_has_role('admin')) WITH CHECK (public.auth_has_role('admin'));

DROP POLICY IF EXISTS exp_hr ON employee_expenses;
CREATE POLICY exp_hr ON employee_expenses FOR ALL USING (public.auth_has_role('hr') AND branch_id = ANY(public.auth_branch_ids())) WITH CHECK (public.auth_has_role('hr'));

DROP POLICY IF EXISTS exp_manager ON employee_expenses;
CREATE POLICY exp_manager ON employee_expenses FOR SELECT USING (public.auth_has_role('manager') AND branch_id = ANY(public.auth_branch_ids()));

DROP POLICY IF EXISTS exp_self ON employee_expenses;
CREATE POLICY exp_self ON employee_expenses FOR SELECT USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_expenses.employee_id AND e.profile_id = auth.uid()));
