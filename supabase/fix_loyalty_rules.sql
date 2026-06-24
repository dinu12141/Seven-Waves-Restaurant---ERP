-- ═══════════════════════════════════════════════════════════════════
-- LOYALTY EARNING RULES TABLE
-- Seven Waves Restaurant ERP
-- Adds structured earning rules for base rate, category & item multipliers
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.loyalty_rules CASCADE;

CREATE TABLE public.loyalty_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_type       TEXT NOT NULL
                    CHECK (rule_type IN ('base_rate', 'category_multiplier', 'item_multiplier', 'redemption')),
  rule_code       TEXT,
  rule_config     JSONB,
  -- For base_rate: how many coins earned per LKR spent
  coins_per_lkr   NUMERIC(10,4),
  -- Minimum spend before any coins are earned (base_rate only)
  min_spend       NUMERIC(12,2) DEFAULT 0,
  -- For category_multiplier (references the 'categories' table)
  category_id     UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  -- For item_multiplier
  menu_item_id    UUID REFERENCES public.menu_items(id) ON DELETE CASCADE,
  -- Multiplier on top of base rate (for category/item rules)
  multiplier      NUMERIC(6,2) DEFAULT 1.0,
  is_active       BOOLEAN DEFAULT true,
  valid_from      DATE,
  valid_until     DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: one rule per type/category/item per company
-- Allow NULLs to coexist (only one base_rate per company, etc.)
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_rules_company_type_cat_item_idx
  ON public.loyalty_rules (company_id, rule_type, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::UUID), COALESCE(menu_item_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- Unique constraint for named rules (e.g. COIN_REDEMPTION_VALUE)
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_rules_company_rule_code_idx
  ON public.loyalty_rules (company_id, rule_code)
  WHERE rule_code IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_loyalty_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_loyalty_rules_updated_at ON public.loyalty_rules;
CREATE TRIGGER trg_loyalty_rules_updated_at
  BEFORE UPDATE ON public.loyalty_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_loyalty_rules_updated_at();

-- RLS
ALTER TABLE public.loyalty_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lr_company ON public.loyalty_rules;
CREATE POLICY lr_company ON public.loyalty_rules
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Grant table access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_rules TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- SEED: Insert a default base_rate rule (1 coin per LKR 5000)
-- Only if no base_rate row exists yet for any company
-- ═══════════════════════════════════════════════════════════════════
-- NOTE: This is informational — actual seed runs per company via UI
-- INSERT INTO public.loyalty_rules (company_id, rule_type, coins_per_lkr, min_spend)
-- SELECT id, 'base_rate', 0.0002, 0 FROM public.companies
-- ON CONFLICT DO NOTHING;
