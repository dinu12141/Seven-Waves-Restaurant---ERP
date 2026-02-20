-- =====================================================
-- TABLE ORDERING & REALTIME FEATURES MIGRATION
-- =====================================================

-- 1. Table Devices
CREATE TABLE IF NOT EXISTS table_devices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_id        UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    device_code     TEXT NOT NULL UNIQUE,
    device_name     TEXT,
    is_active       BOOLEAN DEFAULT true,
    last_seen_at    TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_table_devices_branch ON table_devices(branch_id);
CREATE INDEX idx_table_devices_table ON table_devices(table_id);

-- 2. Customer Sessions
CREATE TABLE IF NOT EXISTS customer_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id        UUID NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
    device_id       UUID REFERENCES table_devices(id) ON DELETE SET NULL,
    session_token   TEXT NOT NULL, -- To be stored as hash in production
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_customer_sessions_table ON customer_sessions(table_id);
CREATE INDEX idx_customer_sessions_device ON customer_sessions(device_id);
CREATE INDEX idx_customer_sessions_status ON customer_sessions(status);

-- 3. Order Acceptance
CREATE TABLE IF NOT EXISTS order_acceptance (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    accepted_by     UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    accepted_at     TIMESTAMPTZ DEFAULT now(),
    rejected_at     TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_order_acceptance_order ON order_acceptance(order_id);
CREATE INDEX idx_order_acceptance_waiter ON order_acceptance(accepted_by);

-- 4. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    body              TEXT NOT NULL,
    data              JSONB DEFAULT '{}'::jsonb,
    is_read           BOOLEAN DEFAULT false,
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

-- 5. Push Subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_type     TEXT NOT NULL, -- e.g., 'web', 'android', 'ios'
    fcm_token       TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, fcm_token)
);

CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);

-- 6. KOT Print Logs
CREATE TABLE IF NOT EXISTS kot_print_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kot_id          UUID NOT NULL REFERENCES kot_tickets(id) ON DELETE CASCADE,
    printed_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    printer_id      TEXT,
    printed_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_kot_print_kot ON kot_print_logs(kot_id);

-- =====================================================
-- UPDATES TO EXISTING TABLES
-- =====================================================

-- Update Orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_waiter_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Drop existing status constraint and add updated one
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE orders ADD CONSTRAINT chk_order_status CHECK (
    status IN (
        'pending_waiter', 
        'accepted', 
        'preparing', 
        'ready', 
        'served', 
        'invoiced', 
        'paid', 
        'cancelled'
    )
);

-- Update default status
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending_waiter';

-- Update KOT Tickets table
ALTER TABLE kot_tickets DROP CONSTRAINT IF EXISTS chk_kot_status;
ALTER TABLE kot_tickets ADD CONSTRAINT chk_kot_status CHECK (
    status IN (
        'created', 
        'preparing', 
        'ready', 
        'cancelled'
    )
);

-- Update default status
ALTER TABLE kot_tickets ALTER COLUMN status SET DEFAULT 'created';

-- =====================================================
-- REALTIME ENABLEMENT
-- =====================================================

-- Ensure Replica Identity is FULL for new tables
ALTER TABLE table_devices REPLICA IDENTITY FULL;
ALTER TABLE customer_sessions REPLICA IDENTITY FULL;
ALTER TABLE order_acceptance REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE push_subscriptions REPLICA IDENTITY FULL;
ALTER TABLE kot_print_logs REPLICA IDENTITY FULL;

-- Add to Realtime Publication
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE table_devices;
        ALTER PUBLICATION supabase_realtime ADD TABLE customer_sessions;
        ALTER PUBLICATION supabase_realtime ADD TABLE order_acceptance;
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
        ALTER PUBLICATION supabase_realtime ADD TABLE push_subscriptions;
        ALTER PUBLICATION supabase_realtime ADD TABLE kot_print_logs;
    END IF;
END $$;
