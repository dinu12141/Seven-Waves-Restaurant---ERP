-- =====================================================
-- Admin Settings: company_settings table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(company_id, key)
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY cs_admin_all ON public.company_settings
  FOR ALL
  USING (is_admin());

-- Authenticated users in the same company can read
CREATE POLICY cs_auth_read ON public.company_settings
  FOR SELECT
  USING (company_id = get_user_company_id());
