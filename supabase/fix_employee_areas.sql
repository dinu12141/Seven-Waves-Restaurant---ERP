-- Create employee_areas table for officer area assignments
CREATE TABLE IF NOT EXISTS public.employee_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  area_name TEXT NOT NULL,
  area_code TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.employee_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY ea_emp_branch ON public.employee_areas
  FOR ALL TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE branch_id = ANY(public.auth_branch_ids())
    )
  );

-- Create employee_deductions table
CREATE TABLE IF NOT EXISTS public.employee_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id),
  company_id UUID,
  deduction_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.employee_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ed_emp_branch ON public.employee_deductions
  FOR ALL TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE branch_id = ANY(public.auth_branch_ids())
    )
  );
