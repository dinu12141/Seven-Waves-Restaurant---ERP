-- ============================================================
-- CUSTOMER IDENTITY + LOYALTY SYSTEM
-- Seven Waves Restaurant ERP
-- Applied: 2026-02-26
-- ============================================================

-- ============================================================
-- 1. CUSTOMERS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name       TEXT NOT NULL,
    phone           TEXT UNIQUE NOT NULL,
    national_id     TEXT,
    email           TEXT,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
ALTER TABLE customers REPLICA IDENTITY FULL;

-- ============================================================
-- 2. LOYALTY_ACCOUNTS
-- ============================================================

CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    points_balance  NUMERIC(12,2) DEFAULT 0,
    tier            TEXT DEFAULT 'bronze',
    card_number     TEXT UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_loyalty_tier CHECK (tier IN ('bronze','silver','gold','platinum')),
    CONSTRAINT chk_points_balance CHECK (points_balance >= 0)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_card ON loyalty_accounts(card_number);
ALTER TABLE loyalty_accounts REPLICA IDENTITY FULL;

-- ============================================================
-- 3. LOYALTY_TRANSACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
    type            TEXT NOT NULL,
    points          NUMERIC(12,2) NOT NULL,
    amount_value    NUMERIC(12,2),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_lt_type CHECK (type IN ('earn','redeem','adjust','expire'))
);

CREATE INDEX IF NOT EXISTS idx_lt_customer ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_lt_order    ON loyalty_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_lt_type     ON loyalty_transactions(type);
CREATE INDEX IF NOT EXISTS idx_lt_created  ON loyalty_transactions(created_at DESC);
ALTER TABLE loyalty_transactions REPLICA IDENTITY FULL;

-- ============================================================
-- 4. CUSTOMER_TABLE_SESSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_table_sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    table_session_id    UUID NOT NULL REFERENCES customer_sessions(id) ON DELETE CASCADE,
    linked_at           TIMESTAMPTZ DEFAULT now(),
    UNIQUE(customer_id, table_session_id)
);

CREATE INDEX IF NOT EXISTS idx_cts_customer ON customer_table_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_cts_session  ON customer_table_sessions(table_session_id);
ALTER TABLE customer_table_sessions REPLICA IDENTITY FULL;

-- ============================================================
-- 5. ORDERS table additions
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_session_id UUID REFERENCES customer_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

-- ============================================================
-- 6. LOYALTY_SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS loyalty_settings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
    earn_rate       NUMERIC(6,4) DEFAULT 0.05,
    min_redeem_pts  NUMERIC(10,2) DEFAULT 50,
    redeem_rate     NUMERIC(6,4) DEFAULT 1.00,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now()
);

INSERT INTO loyalty_settings (earn_rate, min_redeem_pts, redeem_rate)
VALUES (0.05, 50, 1.00) ON CONFLICT DO NOTHING;

-- ============================================================
-- RPCs, Triggers, RLS, Grants, Realtime
-- (See migration history - applied 2026-02-26)
-- ============================================================
