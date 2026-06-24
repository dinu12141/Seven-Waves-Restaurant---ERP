DROP TABLE IF EXISTS public.fiscal_periods CASCADE;

CREATE TABLE public.fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_name TEXT NOT NULL,          -- e.g. "June 2026"
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'closed')),
  locked_by UUID REFERENCES auth.users(id),
  locked_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, period_start)
);

ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY fp_company ON public.fiscal_periods FOR ALL USING (
  company_id = get_user_company_id()
);

-- Function: check if a date falls in a locked/closed period
CREATE OR REPLACE FUNCTION public.is_period_locked(p_date DATE, p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM fiscal_periods
    WHERE company_id = p_company_id
      AND p_date BETWEEN period_start AND period_end
      AND status IN ('locked', 'closed')
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_period_locked(DATE, UUID) TO authenticated;
