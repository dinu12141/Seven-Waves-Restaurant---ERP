-- ==============================================================================
-- UOM CONVERSIONS TABLE
-- ==============================================================================
-- Enables explicit bidirectional unit conversion pairs for BOM calculations.
-- Example: 1 kg = 1000 g, 1 L = 1000 mL
-- ==============================================================================

CREATE TABLE IF NOT EXISTS uom_conversions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  from_uom_id   UUID NOT NULL REFERENCES uom(id) ON DELETE CASCADE,
  to_uom_id     UUID NOT NULL REFERENCES uom(id) ON DELETE CASCADE,
  factor        NUMERIC NOT NULL CHECK (factor > 0),
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, from_uom_id, to_uom_id)
);

ALTER TABLE uom_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uom_conversions_select" ON uom_conversions;
DROP POLICY IF EXISTS "uom_conversions_insert" ON uom_conversions;
DROP POLICY IF EXISTS "uom_conversions_update" ON uom_conversions;
DROP POLICY IF EXISTS "uom_conversions_delete" ON uom_conversions;

CREATE POLICY "uom_conversions_select" ON uom_conversions FOR SELECT USING (true);
CREATE POLICY "uom_conversions_insert" ON uom_conversions FOR INSERT WITH CHECK (true);
CREATE POLICY "uom_conversions_update" ON uom_conversions FOR UPDATE USING (true);
CREATE POLICY "uom_conversions_delete" ON uom_conversions FOR DELETE USING (true);

-- Seed common conversions
DO $$
DECLARE
  v_company_id UUID;
  v_kg_id UUID; v_g_id UUID; v_l_id UUID; v_ml_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  IF v_company_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_kg_id FROM uom WHERE company_id = v_company_id AND code = 'kg';
  SELECT id INTO v_g_id  FROM uom WHERE company_id = v_company_id AND code = 'g';
  SELECT id INTO v_l_id  FROM uom WHERE company_id = v_company_id AND code = 'l';
  SELECT id INTO v_ml_id FROM uom WHERE company_id = v_company_id AND code = 'ml';

  IF v_kg_id IS NOT NULL AND v_g_id IS NOT NULL THEN
    INSERT INTO uom_conversions (company_id, from_uom_id, to_uom_id, factor)
    VALUES (v_company_id, v_kg_id, v_g_id, 1000),
           (v_company_id, v_g_id, v_kg_id, 0.001)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_l_id IS NOT NULL AND v_ml_id IS NOT NULL THEN
    INSERT INTO uom_conversions (company_id, from_uom_id, to_uom_id, factor)
    VALUES (v_company_id, v_l_id, v_ml_id, 1000),
           (v_company_id, v_ml_id, v_l_id, 0.001)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE uom_conversions;

COMMENT ON TABLE uom_conversions IS 'Explicit unit-of-measure conversion pairs for BOM cost calculations. Bidirectional: 1 row per direction.';
