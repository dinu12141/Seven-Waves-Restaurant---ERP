-- =====================================================
-- PRINTERS (FINAL PRODUCTION VERSION)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 1. PRINTERS
-- =====================================================

DROP TABLE IF EXISTS printers CASCADE;
CREATE TABLE printers (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    kitchen_id  UUID REFERENCES kitchens(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'receipt',
    ip_address  TEXT,
    port        INT DEFAULT 9100,
    usb_vendor  TEXT,
    usb_product TEXT,
    paper_width INT NOT NULL DEFAULT 80,
    is_default  BOOLEAN DEFAULT false,
    is_active   BOOLEAN DEFAULT true,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_printer_type CHECK (
        type IN ('receipt', 'kitchen', 'label', 'pdf')
    ),
    CONSTRAINT chk_paper_width CHECK (
        paper_width IN (58, 80)
    )
);

CREATE INDEX idx_printers_branch    ON printers(branch_id);
CREATE INDEX idx_printers_kitchen   ON printers(kitchen_id);
CREATE INDEX idx_printers_active    ON printers(branch_id, is_active);

CREATE TRIGGER trg_printers_updated
BEFORE UPDATE ON printers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 2. RLS
-- =====================================================

ALTER TABLE printers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "printers_select_staff" ON printers;
CREATE POLICY "printers_select_staff"
ON printers FOR SELECT
USING (auth_has_role('admin') OR auth_has_role('manager') OR auth_has_role('kitchen'));

DROP POLICY IF EXISTS "printers_manage_admin" ON printers;
CREATE POLICY "printers_manage_admin"
ON printers FOR ALL
USING (auth_has_role('admin'))
WITH CHECK (auth_has_role('admin'));

-- =====================================================
-- 3. KOT PRINT LOGS (Ensure table exists before alter)
-- =====================================================

CREATE TABLE IF NOT EXISTS kot_print_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kot_id          UUID NOT NULL REFERENCES kot_tickets(id) ON DELETE CASCADE,
    printed_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    printer_id      UUID REFERENCES printers(id) ON DELETE SET NULL,
    printed_at      TIMESTAMPTZ DEFAULT now()
);

-- Ensure index exists
CREATE INDEX IF NOT EXISTS idx_kot_print_kot ON kot_print_logs(kot_id);

-- Ensure printer_id column exists if table was created elsewhere (like migration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='kot_print_logs' AND column_name='printer_id'
    ) THEN
        ALTER TABLE kot_print_logs ADD COLUMN printer_id UUID REFERENCES printers(id) ON DELETE SET NULL;
    END IF;
END $$;
