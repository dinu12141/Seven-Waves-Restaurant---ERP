-- =====================================================
-- HR & PAYROLL MODULE (FINAL PRODUCTION VERSION)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TRIGGER FUNCTION: set_updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 1. DEPARTMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_company_id ON departments(company_id);
CREATE INDEX IF NOT EXISTS idx_departments_branch_id ON departments(branch_id);

CREATE TRIGGER trg_departments_updated
BEFORE UPDATE ON departments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 2. DESIGNATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS designations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, title)
);

CREATE INDEX IF NOT EXISTS idx_designations_company_id ON designations(company_id);

CREATE TRIGGER trg_designations_updated
BEFORE UPDATE ON designations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 3. EMPLOYEES
-- =====================================================

CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    designation_id UUID REFERENCES designations(id) ON DELETE SET NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    employee_code TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    email TEXT,
    phone TEXT,
    date_of_birth DATE,
    gender TEXT,
    nic_number TEXT,
    address TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
    termination_date DATE,
    employment_status TEXT DEFAULT 'active',
    employment_type TEXT DEFAULT 'full_time',
    bank_name TEXT,
    bank_account_number TEXT,
    bank_branch TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, employee_code)
);

CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_designation_id ON employees(designation_id);
CREATE INDEX IF NOT EXISTS idx_employees_profile_id ON employees(profile_id);
CREATE INDEX IF NOT EXISTS idx_employees_employment_status ON employees(employment_status);

CREATE TRIGGER trg_employees_updated
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 4. SALARY STRUCTURES
-- =====================================================

CREATE TABLE IF NOT EXISTS salary_structures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    salary_type TEXT NOT NULL DEFAULT 'monthly',
    basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
    hourly_rate NUMERIC(10,2) DEFAULT 0,
    housing_allowance NUMERIC(10,2) DEFAULT 0,
    transport_allowance NUMERIC(10,2) DEFAULT 0,
    meal_allowance NUMERIC(10,2) DEFAULT 0,
    other_allowances NUMERIC(10,2) DEFAULT 0,
    overtime_rate_multiplier NUMERIC(4,2) DEFAULT 1.5,
    epf_employee_pct NUMERIC(5,2) DEFAULT 8.00,
    epf_employer_pct NUMERIC(5,2) DEFAULT 12.00,
    etf_employer_pct NUMERIC(5,2) DEFAULT 3.00,
    other_deductions NUMERIC(10,2) DEFAULT 0,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_current BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_salary_type CHECK (salary_type IN ('hourly', 'monthly'))
);

CREATE INDEX IF NOT EXISTS idx_salary_structures_employee_id ON salary_structures(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_structures_company_id ON salary_structures(company_id);
CREATE INDEX IF NOT EXISTS idx_salary_structures_is_current ON salary_structures(is_current) WHERE is_current = true;

CREATE TRIGGER trg_salary_structures_updated
BEFORE UPDATE ON salary_structures
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 5. SHIFTS
-- =====================================================

CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_duration_minutes INT DEFAULT 0,
    is_overnight BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, name)
);

CREATE INDEX IF NOT EXISTS idx_shifts_company_id ON shifts(company_id);
CREATE INDEX IF NOT EXISTS idx_shifts_branch_id ON shifts(branch_id);

CREATE TRIGGER trg_shifts_updated
BEFORE UPDATE ON shifts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 6. SHIFT ASSIGNMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS shift_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    assignment_date DATE NOT NULL,
    status TEXT DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_id, assignment_date),
    CONSTRAINT chk_shift_assignment_status CHECK (status IN ('scheduled', 'completed', 'missed', 'swapped'))
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee_id ON shift_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_shift_id ON shift_assignments(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_branch_id ON shift_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_date ON shift_assignments(assignment_date);

CREATE TRIGGER trg_shift_assignments_updated
BEFORE UPDATE ON shift_assignments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 7. ATTENDANCE LOGS (Raw Biometric Data)
-- =====================================================

CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    punch_time TIMESTAMPTZ NOT NULL,
    punch_type TEXT NOT NULL,
    device_id TEXT,
    source TEXT DEFAULT 'biometric',
    raw_data JSONB,
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_punch_type CHECK (punch_type IN ('in', 'out')),
    CONSTRAINT chk_log_source CHECK (source IN ('biometric', 'manual', 'mobile', 'web'))
);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_id ON attendance_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_branch_id ON attendance_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_punch_time ON attendance_logs(punch_time);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_is_processed ON attendance_logs(is_processed) WHERE is_processed = false;

-- =====================================================
-- 8. ATTENDANCE RECORDS (Processed Daily Attendance)
-- =====================================================

CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    attendance_date DATE NOT NULL,
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    total_hours NUMERIC(5,2) DEFAULT 0,
    overtime_hours NUMERIC(5,2) DEFAULT 0,
    break_hours NUMERIC(5,2) DEFAULT 0,
    late_minutes INT DEFAULT 0,
    early_departure_minutes INT DEFAULT 0,
    status TEXT DEFAULT 'present',
    remarks TEXT,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_id, attendance_date),
    CONSTRAINT chk_attendance_status CHECK (status IN ('present', 'absent', 'half_day', 'late', 'on_leave', 'holiday', 'rest_day'))
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_id ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_branch_id ON attendance_records(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status ON attendance_records(status);

CREATE TRIGGER trg_attendance_records_updated
BEFORE UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 9. LEAVE TYPES
-- =====================================================

CREATE TABLE IF NOT EXISTS leave_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    annual_quota NUMERIC(5,1) DEFAULT 0,
    is_paid BOOLEAN DEFAULT true,
    carry_forward BOOLEAN DEFAULT false,
    max_carry_forward_days NUMERIC(5,1) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_leave_types_company_id ON leave_types(company_id);

CREATE TRIGGER trg_leave_types_updated
BEFORE UPDATE ON leave_types
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 10. LEAVE REQUESTS
-- =====================================================

CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days NUMERIC(5,1) NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_leave_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_leave_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_branch_id ON leave_requests(branch_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type_id ON leave_requests(leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);

CREATE TRIGGER trg_leave_requests_updated
BEFORE UPDATE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 11. EMPLOYEE OVERTIME
-- =====================================================

CREATE TABLE IF NOT EXISTS employee_overtime (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    overtime_date DATE NOT NULL,
    hours NUMERIC(5,2) NOT NULL,
    rate_multiplier NUMERIC(4,2) DEFAULT 1.5,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_id, overtime_date),
    CONSTRAINT chk_overtime_hours CHECK (hours > 0),
    CONSTRAINT chk_overtime_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_employee_overtime_employee_id ON employee_overtime(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_overtime_branch_id ON employee_overtime(branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_overtime_date ON employee_overtime(overtime_date);
CREATE INDEX IF NOT EXISTS idx_employee_overtime_status ON employee_overtime(status);

CREATE TRIGGER trg_employee_overtime_updated
BEFORE UPDATE ON employee_overtime
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 12. PAYROLL RUNS
-- =====================================================

CREATE TABLE IF NOT EXISTS payroll_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    run_date TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'draft',
    total_gross NUMERIC(14,2) DEFAULT 0,
    total_deductions NUMERIC(14,2) DEFAULT 0,
    total_net NUMERIC(14,2) DEFAULT 0,
    total_epf_employee NUMERIC(14,2) DEFAULT 0,
    total_epf_employer NUMERIC(14,2) DEFAULT 0,
    total_etf_employer NUMERIC(14,2) DEFAULT 0,
    employee_count INT DEFAULT 0,
    processed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, period_start, period_end),
    CONSTRAINT chk_payroll_dates CHECK (period_end >= period_start),
    CONSTRAINT chk_payroll_status CHECK (status IN ('draft', 'processing', 'processed', 'approved', 'paid', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_id ON payroll_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_branch_id ON payroll_runs(branch_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(period_start, period_end);

CREATE TRIGGER trg_payroll_runs_updated
BEFORE UPDATE ON payroll_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 13. PAYSLIPS
-- =====================================================

CREATE TABLE IF NOT EXISTS payslips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    basic_salary NUMERIC(12,2) DEFAULT 0,
    housing_allowance NUMERIC(10,2) DEFAULT 0,
    transport_allowance NUMERIC(10,2) DEFAULT 0,
    meal_allowance NUMERIC(10,2) DEFAULT 0,
    other_allowances NUMERIC(10,2) DEFAULT 0,
    total_allowances NUMERIC(12,2) DEFAULT 0,
    overtime_hours NUMERIC(5,2) DEFAULT 0,
    overtime_amount NUMERIC(10,2) DEFAULT 0,
    gross_salary NUMERIC(14,2) DEFAULT 0,
    epf_employee NUMERIC(10,2) DEFAULT 0,
    epf_employer NUMERIC(10,2) DEFAULT 0,
    etf_employer NUMERIC(10,2) DEFAULT 0,
    loan_deduction NUMERIC(10,2) DEFAULT 0,
    other_deductions NUMERIC(10,2) DEFAULT 0,
    total_deductions NUMERIC(12,2) DEFAULT 0,
    net_salary NUMERIC(14,2) DEFAULT 0,
    days_worked INT DEFAULT 0,
    days_absent INT DEFAULT 0,
    days_leave INT DEFAULT 0,
    late_count INT DEFAULT 0,
    payment_method TEXT DEFAULT 'bank_transfer',
    payment_status TEXT DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(payroll_run_id, employee_id),
    CONSTRAINT chk_payslip_payment_status CHECK (payment_status IN ('pending', 'paid', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_payslips_payroll_run_id ON payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee_id ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_branch_id ON payslips(branch_id);
CREATE INDEX IF NOT EXISTS idx_payslips_payment_status ON payslips(payment_status);

CREATE TRIGGER trg_payslips_updated
BEFORE UPDATE ON payslips
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 14. EMPLOYEE LOANS
-- =====================================================

CREATE TABLE IF NOT EXISTS employee_loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    loan_amount NUMERIC(12,2) NOT NULL,
    monthly_installment NUMERIC(10,2) NOT NULL,
    total_paid NUMERIC(12,2) DEFAULT 0,
    remaining_balance NUMERIC(12,2) NOT NULL,
    interest_rate NUMERIC(5,2) DEFAULT 0,
    loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_completion_date DATE,
    status TEXT DEFAULT 'active',
    reason TEXT,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_loan_amount CHECK (loan_amount > 0),
    CONSTRAINT chk_loan_installment CHECK (monthly_installment > 0),
    CONSTRAINT chk_loan_status CHECK (status IN ('pending', 'active', 'completed', 'cancelled', 'defaulted'))
);

CREATE INDEX IF NOT EXISTS idx_employee_loans_employee_id ON employee_loans(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_loans_branch_id ON employee_loans(branch_id);
CREATE INDEX IF NOT EXISTS idx_employee_loans_status ON employee_loans(status);

CREATE TRIGGER trg_employee_loans_updated
BEFORE UPDATE ON employee_loans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- DONE ✅
-- =====================================================
