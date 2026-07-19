-- ═══════════════════════════════════════════════════════════════════
-- FEATURE: Detailed Payment Methods in EOD Reports
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE ai_daily_reports ADD COLUMN IF NOT EXISTS cash_collected NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE ai_daily_reports ADD COLUMN IF NOT EXISTS card_collected NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE ai_daily_reports ADD COLUMN IF NOT EXISTS visa_collected NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE ai_daily_reports ADD COLUMN IF NOT EXISTS master_collected NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE ai_daily_reports ADD COLUMN IF NOT EXISTS qr_collected NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE ai_daily_reports ADD COLUMN IF NOT EXISTS bank_collected NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE ai_daily_reports ADD COLUMN IF NOT EXISTS credit_collected NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE ai_daily_reports ADD COLUMN IF NOT EXISTS online_collected NUMERIC(12,2) DEFAULT 0.00;
