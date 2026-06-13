-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1 — SECURITY + CRM MODULE (Production-Grade)
-- Seven Waves Restaurant ERP
-- Run AFTER: schema.sql, rbac_rls.sql, erp_security_lockdown.sql
--
-- Tables:
--   1. login_attempts
--   2. device_sessions
--   3. security_events
--   4. session_tokens
--   5. customers
--   6. loyalty_accounts
--   7. loyalty_transactions
--   8. customer_feedback
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop tables to ensure clean schema recreation during Phase 1 development
DROP TABLE IF EXISTS customer_feedback CASCADE;
DROP TABLE IF EXISTS loyalty_transactions CASCADE;
DROP TABLE IF EXISTS loyalty_accounts CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS session_tokens CASCADE;
DROP TABLE IF EXISTS security_events CASCADE;
DROP TABLE IF EXISTS device_sessions CASCADE;
DROP TABLE IF EXISTS login_attempts CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- 1. LOGIN ATTEMPTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id         UUID REFERENCES companies(id) ON DELETE SET NULL,
    user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email              TEXT,
    ip_address         TEXT,
    user_agent         TEXT,
    device_fingerprint TEXT,
    geo_location       JSONB,
    attempt_type       TEXT NOT NULL DEFAULT 'login',
    success            BOOLEAN NOT NULL DEFAULT false,
    failure_reason     TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_la_type CHECK (attempt_type IN ('login','mfa','refresh','biometric','api_key')),
    CONSTRAINT chk_la_fail CHECK (failure_reason IS NULL OR failure_reason IN (
        'invalid_password','account_locked','mfa_failed','expired_token',
        'ip_blocked','device_untrusted','rate_limited','account_disabled'
    ))
);
CREATE INDEX IF NOT EXISTS idx_la_user      ON login_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_la_email     ON login_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_la_ip        ON login_attempts(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_la_success   ON login_attempts(success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_la_company   ON login_attempts(company_id);

-- ─────────────────────────────────────────────────────────────────
-- 2. DEVICE SESSIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id         UUID REFERENCES companies(id) ON DELETE SET NULL,
    user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_fingerprint TEXT NOT NULL,
    device_name        TEXT,
    device_type        TEXT DEFAULT 'desktop',
    os_info            TEXT,
    browser_info       TEXT,
    ip_address         TEXT,
    last_active_at     TIMESTAMPTZ DEFAULT now(),
    is_trusted         BOOLEAN DEFAULT false,
    is_active          BOOLEAN DEFAULT true,
    deleted_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now(),
    created_by         UUID REFERENCES auth.users(id),
    CONSTRAINT chk_ds_type CHECK (device_type IN ('desktop','mobile','tablet','pos_terminal','kds','kiosk')),
    UNIQUE(user_id, device_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_ds_user    ON device_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ds_active  ON device_sessions(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ds_company ON device_sessions(company_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. SECURITY EVENTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'warning',
    user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ip_address      TEXT,
    details         JSONB,
    resolved        BOOLEAN DEFAULT false,
    resolved_by     UUID REFERENCES auth.users(id),
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_se_severity CHECK (severity IN ('info','warning','critical','emergency')),
    CONSTRAINT chk_se_type CHECK (event_type IN (
        'brute_force','unusual_location','privilege_escalation','data_export',
        'mass_deletion','config_change','rls_bypass_attempt','rate_limit_exceeded',
        'suspicious_query','unauthorized_access','session_hijack','other'
    ))
);
CREATE INDEX IF NOT EXISTS idx_se_type     ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_se_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_se_user     ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_se_date     ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_company  ON security_events(company_id);
CREATE INDEX IF NOT EXISTS idx_se_branch   ON security_events(branch_id);
CREATE INDEX IF NOT EXISTS idx_se_unresolved ON security_events(resolved) WHERE resolved = false AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 4. SESSION TOKENS (Extended session management)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id       UUID REFERENCES device_sessions(id) ON DELETE SET NULL,
    token_hash      TEXT NOT NULL UNIQUE,
    token_type      TEXT NOT NULL DEFAULT 'access',
    ip_address      TEXT,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN DEFAULT false,
    revoked_at      TIMESTAMPTZ,
    revoked_reason  TEXT,
    last_used_at    TIMESTAMPTZ DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_st_type CHECK (token_type IN ('access','refresh','api_key','service')),
    CONSTRAINT chk_st_revoke CHECK (revoked_reason IS NULL OR revoked_reason IN (
        'logout','password_change','admin_revoke','expired','security_event','device_removed'
    ))
);
CREATE INDEX IF NOT EXISTS idx_st_user    ON session_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_st_hash    ON session_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_st_expires ON session_tokens(expires_at) WHERE revoked = false;
CREATE INDEX IF NOT EXISTS idx_st_device  ON session_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_st_company ON session_tokens(company_id);

-- ─────────────────────────────────────────────────────────────────
-- 5. CUSTOMERS (CRM)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    auth_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    customer_code   TEXT,
    first_name      TEXT NOT NULL,
    last_name       TEXT,
    email           TEXT,
    phone           TEXT,
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    postal_code     TEXT,
    country         TEXT DEFAULT 'Sri Lanka',
    date_of_birth   DATE,
    gender          TEXT,
    profile_photo   TEXT,
    total_orders    INT DEFAULT 0,
    total_spent     NUMERIC(14,2) DEFAULT 0,
    avg_order_value NUMERIC(10,2) DEFAULT 0,
    last_order_at   TIMESTAMPTZ,
    preferred_branch UUID REFERENCES branches(id) ON DELETE SET NULL,
    tags            TEXT[],
    notes           TEXT,
    source          TEXT DEFAULT 'walk_in',
    is_active       BOOLEAN DEFAULT true,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_cust_gender CHECK (gender IS NULL OR gender IN ('male','female','other','prefer_not_to_say')),
    CONSTRAINT chk_cust_source CHECK (source IN ('walk_in','website','qr_scan','referral','social_media','delivery_app','other'))
);
CREATE INDEX IF NOT EXISTS idx_cust_company ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_cust_branch  ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_cust_auth    ON customers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_cust_email   ON customers(email);
CREATE INDEX IF NOT EXISTS idx_cust_phone   ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_cust_name    ON customers(company_id, last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_cust_code    ON customers(company_id, customer_code);
CREATE INDEX IF NOT EXISTS idx_cust_active  ON customers(company_id, is_active) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 6. LOYALTY ACCOUNTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    card_number     TEXT UNIQUE,
    tier            TEXT DEFAULT 'bronze',
    points_balance  INT DEFAULT 0,
    lifetime_points INT DEFAULT 0,
    tier_expiry     DATE,
    enrolled_at     TIMESTAMPTZ DEFAULT now(),
    last_activity   TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT true,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_loy_tier CHECK (tier IN ('bronze','silver','gold','platinum','diamond')),
    UNIQUE(company_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_loy_customer ON loyalty_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_loy_card     ON loyalty_accounts(card_number);
CREATE INDEX IF NOT EXISTS idx_loy_tier     ON loyalty_accounts(tier);
CREATE INDEX IF NOT EXISTS idx_loy_company  ON loyalty_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_loy_active   ON loyalty_accounts(company_id, is_active) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 7. LOYALTY TRANSACTIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id        UUID REFERENCES branches(id) ON DELETE SET NULL,
    loyalty_id       UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
    order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL,
    points           INT NOT NULL,
    balance_after    INT NOT NULL,
    description      TEXT,
    reference_code   TEXT,
    deleted_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now(),
    created_by       UUID REFERENCES auth.users(id),
    CONSTRAINT chk_lt_type CHECK (transaction_type IN ('earn','redeem','expire','adjust','bonus','transfer','reversal'))
);
CREATE INDEX IF NOT EXISTS idx_lt_loyalty  ON loyalty_transactions(loyalty_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lt_order    ON loyalty_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_lt_company  ON loyalty_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_lt_branch   ON loyalty_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_lt_type     ON loyalty_transactions(transaction_type);

-- ─────────────────────────────────────────────────────────────────
-- 8. CUSTOMER FEEDBACK
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
    rating          INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    food_rating     INT CHECK (food_rating >= 1 AND food_rating <= 5),
    service_rating  INT CHECK (service_rating >= 1 AND service_rating <= 5),
    ambience_rating INT CHECK (ambience_rating >= 1 AND ambience_rating <= 5),
    value_rating    INT CHECK (value_rating >= 1 AND value_rating <= 5),
    comment         TEXT,
    response        TEXT,
    responded_by    UUID REFERENCES profiles(id),
    responded_at    TIMESTAMPTZ,
    feedback_source TEXT DEFAULT 'in_app',
    is_published    BOOLEAN DEFAULT false,
    is_flagged      BOOLEAN DEFAULT false,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_cf_source CHECK (feedback_source IN ('in_app','website','qr','email','sms','google','tripadvisor','other'))
);
CREATE INDEX IF NOT EXISTS idx_cf_branch   ON customer_feedback(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cf_customer ON customer_feedback(customer_id);
CREATE INDEX IF NOT EXISTS idx_cf_rating   ON customer_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_cf_company  ON customer_feedback(company_id);
CREATE INDEX IF NOT EXISTS idx_cf_order    ON customer_feedback(order_id);
CREATE INDEX IF NOT EXISTS idx_cf_active   ON customer_feedback(company_id) WHERE deleted_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════
-- RLS — ENABLE + POLICIES
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE login_attempts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_feedback   ENABLE ROW LEVEL SECURITY;

-- login_attempts: admin read, system insert
DROP POLICY IF EXISTS la_admin ON login_attempts;
CREATE POLICY la_admin ON login_attempts FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS la_sys_ins ON login_attempts;
CREATE POLICY la_sys_ins ON login_attempts FOR INSERT WITH CHECK (true);

-- device_sessions: own + admin
DROP POLICY IF EXISTS ds_own ON device_sessions;
CREATE POLICY ds_own ON device_sessions FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS ds_admin ON device_sessions;
CREATE POLICY ds_admin ON device_sessions FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS ds_own_upd ON device_sessions;
CREATE POLICY ds_own_upd ON device_sessions FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- security_events: admin only
DROP POLICY IF EXISTS se_admin ON security_events;
CREATE POLICY se_admin ON security_events FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS se_sys_ins ON security_events;
CREATE POLICY se_sys_ins ON security_events FOR INSERT WITH CHECK (true);

-- session_tokens: own + admin
DROP POLICY IF EXISTS st_own ON session_tokens;
CREATE POLICY st_own ON session_tokens FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS st_admin ON session_tokens;
CREATE POLICY st_admin ON session_tokens FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS st_sys_ins ON session_tokens;
CREATE POLICY st_sys_ins ON session_tokens FOR INSERT WITH CHECK (true);

-- customers: admin/manager full, cashier read, self read
DROP POLICY IF EXISTS cust_admin ON customers;
CREATE POLICY cust_admin ON customers FOR ALL
    USING ((is_admin() OR is_manager()) AND deleted_at IS NULL)
    WITH CHECK (is_admin() OR is_manager());
DROP POLICY IF EXISTS cust_cashier ON customers;
CREATE POLICY cust_cashier ON customers FOR SELECT
    USING (auth_has_role('cashier') AND deleted_at IS NULL);
DROP POLICY IF EXISTS cust_self ON customers;
CREATE POLICY cust_self ON customers FOR SELECT
    USING (auth_user_id = auth.uid() AND deleted_at IS NULL);

-- loyalty_accounts: admin/manager full, self read
DROP POLICY IF EXISTS loy_admin ON loyalty_accounts;
CREATE POLICY loy_admin ON loyalty_accounts FOR ALL
    USING ((is_admin() OR is_manager()) AND deleted_at IS NULL)
    WITH CHECK (is_admin() OR is_manager());
DROP POLICY IF EXISTS loy_cashier ON loyalty_accounts;
CREATE POLICY loy_cashier ON loyalty_accounts FOR SELECT
    USING (auth_has_role('cashier') AND deleted_at IS NULL);
DROP POLICY IF EXISTS loy_self ON loyalty_accounts;
CREATE POLICY loy_self ON loyalty_accounts FOR SELECT
    USING (EXISTS (SELECT 1 FROM customers c WHERE c.id = loyalty_accounts.customer_id AND c.auth_user_id = auth.uid()) AND deleted_at IS NULL);

-- loyalty_transactions: admin/manager, cashier read
DROP POLICY IF EXISTS lt_admin ON loyalty_transactions;
CREATE POLICY lt_admin ON loyalty_transactions FOR ALL
    USING ((is_admin() OR is_manager()) AND deleted_at IS NULL)
    WITH CHECK (is_admin() OR is_manager());
DROP POLICY IF EXISTS lt_cashier ON loyalty_transactions;
CREATE POLICY lt_cashier ON loyalty_transactions FOR SELECT
    USING (auth_has_role('cashier') AND branch_id = ANY(auth_branch_ids()) AND deleted_at IS NULL);

-- customer_feedback: admin/manager full, self insert
DROP POLICY IF EXISTS cf_admin ON customer_feedback;
CREATE POLICY cf_admin ON customer_feedback FOR ALL
    USING ((is_admin() OR is_manager()) AND deleted_at IS NULL)
    WITH CHECK (is_admin() OR is_manager());
DROP POLICY IF EXISTS cf_public_ins ON customer_feedback;
CREATE POLICY cf_public_ins ON customer_feedback FOR INSERT WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- AUDIT TRIGGERS
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
    t TEXT;
    tbls TEXT[] := ARRAY[
        'login_attempts','device_sessions','security_events','session_tokens',
        'customers','loyalty_accounts','loyalty_transactions','customer_feedback'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
            EXECUTE format('
                DROP TRIGGER IF EXISTS audit_%I ON %I;
                CREATE TRIGGER audit_%I
                AFTER INSERT OR UPDATE OR DELETE ON %I
                FOR EACH ROW EXECUTE FUNCTION public.audit_record();
            ', t, t, t, t);
        END IF;
    END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- REALTIME PUBLICATION
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
    t TEXT;
    tbls TEXT[] := ARRAY['customers','loyalty_accounts','security_events'];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
           AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename=t)
        THEN
            EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
        END IF;
    END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- updated_at TRIGGERS
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
    t TEXT;
    tbls TEXT[] := ARRAY['device_sessions','customers','loyalty_accounts','customer_feedback'];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
            EXECUTE format('
                DROP TRIGGER IF EXISTS trg_%I_updated ON %I;
                CREATE TRIGGER trg_%I_updated
                BEFORE UPDATE ON %I
                FOR EACH ROW EXECUTE FUNCTION set_updated_at();
            ', t, t, t, t);
        END IF;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- DONE ✅ Phase 1: Security + CRM (8 tables, production-grade)
-- ═══════════════════════════════════════════════════════════════════
