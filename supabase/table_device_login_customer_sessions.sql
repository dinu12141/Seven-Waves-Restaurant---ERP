-- =============================================================
-- Migration: Table Device Login + Customer Sessions
-- Applied via Supabase MCP
-- =============================================================

-- =============================================================
-- TABLES
-- =============================================================

-- 1) table_devices
CREATE TABLE IF NOT EXISTS table_devices (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id        UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_id         UUID NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
    device_code      TEXT UNIQUE NOT NULL,        -- e.g. "TB-000123"
    device_secret_hash TEXT NOT NULL,             -- bcrypt hash via pgcrypto
    device_name      TEXT,
    is_active        BOOLEAN DEFAULT true,
    last_seen_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_devices_table  ON table_devices(table_id);
CREATE INDEX IF NOT EXISTS idx_table_devices_branch ON table_devices(branch_id);
CREATE INDEX IF NOT EXISTS idx_table_devices_code   ON table_devices(device_code);

-- 2) table_qr_tokens
CREATE TABLE IF NOT EXISTS table_qr_tokens (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id         UUID NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
    qr_token         TEXT UNIQUE NOT NULL,        -- random URL-safe string
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_tokens_table ON table_qr_tokens(table_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_token ON table_qr_tokens(qr_token);

-- 3) customer_sessions
CREATE TABLE IF NOT EXISTS customer_sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id            UUID NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
    device_id           UUID REFERENCES table_devices(id) ON DELETE SET NULL,
    session_token_hash  TEXT UNIQUE NOT NULL,      -- bcrypt hash
    status              TEXT NOT NULL DEFAULT 'active',
    started_at          TIMESTAMPTZ DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    last_activity_at    TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_session_status CHECK (
        status IN ('active','expired','closed')
    )
);

CREATE INDEX IF NOT EXISTS idx_cs_table_status ON customer_sessions(table_id, status);
CREATE INDEX IF NOT EXISTS idx_cs_expires      ON customer_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_cs_device       ON customer_sessions(device_id);


-- =============================================================
-- RLS
-- =============================================================

ALTER TABLE table_devices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_qr_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;

-- table_devices: admin/manager full, staff read own branch
CREATE POLICY td_admin ON table_devices FOR ALL
    USING  (is_admin() OR (is_manager() AND branch_id = ANY(auth_branch_ids())))
    WITH CHECK (is_admin() OR (is_manager() AND branch_id = ANY(auth_branch_ids())));

CREATE POLICY td_staff_select ON table_devices FOR SELECT
    USING (is_staff() AND branch_id = ANY(auth_branch_ids()));

-- table_qr_tokens: admin/manager full, public read (for QR scanning)
CREATE POLICY qr_admin ON table_qr_tokens FOR ALL
    USING  (is_admin() OR is_manager())
    WITH CHECK (is_admin() OR is_manager());

CREATE POLICY qr_public_select ON table_qr_tokens FOR SELECT
    USING (true);

-- customer_sessions: admin/manager full, staff can read
CREATE POLICY cs_admin ON customer_sessions FOR ALL
    USING  (is_admin() OR is_manager())
    WITH CHECK (is_admin() OR is_manager());

CREATE POLICY cs_staff_select ON customer_sessions FOR SELECT
    USING (is_staff());

-- Grants
GRANT SELECT ON table_qr_tokens   TO anon;
GRANT SELECT ON customer_sessions  TO anon;
GRANT ALL ON table_devices         TO authenticated;
GRANT ALL ON table_qr_tokens      TO authenticated;
GRANT ALL ON customer_sessions    TO authenticated;


-- =============================================================
-- RPC: create_table_session(device_code, device_secret)
-- =============================================================
-- Validates device, compares hashed secret via pgcrypto crypt(),
-- expires/closes previous active sessions, creates new one,
-- returns plaintext session token (only time it's exposed).
-- =============================================================

CREATE OR REPLACE FUNCTION create_table_session(
    p_device_code  TEXT,
    p_device_secret TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_device      RECORD;
    v_token       TEXT;
    v_token_hash  TEXT;
    v_session_id  UUID;
    v_expires_at  TIMESTAMPTZ;
BEGIN
    -- 1. Look up active device
    SELECT id, branch_id, table_id, device_secret_hash, is_active
      INTO v_device
      FROM table_devices
     WHERE device_code = p_device_code;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Device not found');
    END IF;

    IF NOT v_device.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'Device is deactivated');
    END IF;

    -- 2. Verify secret using pgcrypto crypt()
    IF v_device.device_secret_hash != crypt(p_device_secret, v_device.device_secret_hash) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid device secret');
    END IF;

    -- 3. Close/expire existing active sessions for this device + table
    UPDATE customer_sessions
       SET status = 'closed',
           last_activity_at = now()
     WHERE device_id = v_device.id
       AND table_id  = v_device.table_id
       AND status    = 'active';

    -- 4. Generate random session token (32 bytes → 64 hex chars)
    v_token      := encode(gen_random_bytes(32), 'hex');
    v_token_hash := crypt(v_token, gen_salt('bf', 8));
    v_expires_at := now() + INTERVAL '12 hours';

    -- 5. Insert new session
    INSERT INTO customer_sessions (
        table_id, device_id, session_token_hash, status, expires_at
    ) VALUES (
        v_device.table_id, v_device.id, v_token_hash, 'active', v_expires_at
    )
    RETURNING id INTO v_session_id;

    -- 6. Touch device last_seen_at
    UPDATE table_devices
       SET last_seen_at = now()
     WHERE id = v_device.id;

    -- 7. Return plaintext token (only time exposed)
    RETURN jsonb_build_object(
        'success',       true,
        'session_id',    v_session_id,
        'session_token', v_token,
        'table_id',      v_device.table_id,
        'branch_id',     v_device.branch_id,
        'expires_at',    v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION create_table_session(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION create_table_session(TEXT, TEXT) TO authenticated;


-- =============================================================
-- RPC: get_or_create_session_by_qr(qr_token)
-- =============================================================
-- Resolves table from QR, re-uses active session if valid,
-- else creates new one. Returns session token.
-- =============================================================

CREATE OR REPLACE FUNCTION get_or_create_session_by_qr(
    p_qr_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_qr          RECORD;
    v_session     RECORD;
    v_token       TEXT;
    v_token_hash  TEXT;
    v_session_id  UUID;
    v_expires_at  TIMESTAMPTZ;
BEGIN
    -- 1. Resolve QR token → table
    SELECT qt.id, qt.table_id, qt.is_active,
           rt.branch_id
      INTO v_qr
      FROM table_qr_tokens qt
      JOIN restaurant_tables rt ON rt.id = qt.table_id
     WHERE qt.qr_token = p_qr_token;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid QR code');
    END IF;

    IF NOT v_qr.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'QR code is deactivated');
    END IF;

    -- 2. Check for existing active, non-expired QR session
    SELECT id, session_token_hash, expires_at
      INTO v_session
      FROM customer_sessions
     WHERE table_id  = v_qr.table_id
       AND device_id IS NULL
       AND status    = 'active'
       AND expires_at > now()
     ORDER BY started_at DESC
     LIMIT 1;

    IF FOUND THEN
        -- Re-issue fresh token for the existing session
        v_token      := encode(gen_random_bytes(32), 'hex');
        v_token_hash := crypt(v_token, gen_salt('bf', 8));

        UPDATE customer_sessions
           SET session_token_hash = v_token_hash,
               last_activity_at   = now()
         WHERE id = v_session.id;

        RETURN jsonb_build_object(
            'success',       true,
            'session_id',    v_session.id,
            'session_token', v_token,
            'table_id',      v_qr.table_id,
            'branch_id',     v_qr.branch_id,
            'expires_at',    v_session.expires_at,
            'reused',        true
        );
    END IF;

    -- 3. Close stale sessions
    UPDATE customer_sessions
       SET status = 'expired',
           last_activity_at = now()
     WHERE table_id  = v_qr.table_id
       AND device_id IS NULL
       AND status    = 'active';

    -- 4. Create new session
    v_token      := encode(gen_random_bytes(32), 'hex');
    v_token_hash := crypt(v_token, gen_salt('bf', 8));
    v_expires_at := now() + INTERVAL '12 hours';

    INSERT INTO customer_sessions (
        table_id, device_id, session_token_hash, status, expires_at
    ) VALUES (
        v_qr.table_id, NULL, v_token_hash, 'active', v_expires_at
    )
    RETURNING id INTO v_session_id;

    RETURN jsonb_build_object(
        'success',       true,
        'session_id',    v_session_id,
        'session_token', v_token,
        'table_id',      v_qr.table_id,
        'branch_id',     v_qr.branch_id,
        'expires_at',    v_expires_at,
        'reused',        false
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_session_by_qr(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_or_create_session_by_qr(TEXT) TO authenticated;


-- =============================================================
-- RPC: heartbeat_session(session_token)
-- =============================================================
-- Lightweight keep-alive. Returns remaining TTL.
-- =============================================================

CREATE OR REPLACE FUNCTION heartbeat_session(
    p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_session RECORD;
BEGIN
    SELECT id, table_id, status, expires_at, session_token_hash
      INTO v_session
      FROM customer_sessions
     WHERE status = 'active'
       AND expires_at > now()
       AND session_token_hash = crypt(p_session_token, session_token_hash);

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Session not found or expired'
        );
    END IF;

    UPDATE customer_sessions
       SET last_activity_at = now()
     WHERE id = v_session.id;

    RETURN jsonb_build_object(
        'success',       true,
        'session_id',    v_session.id,
        'table_id',      v_session.table_id,
        'expires_at',    v_session.expires_at,
        'remaining_sec', EXTRACT(EPOCH FROM (v_session.expires_at - now()))::INT
    );
END;
$$;

GRANT EXECUTE ON FUNCTION heartbeat_session(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION heartbeat_session(TEXT) TO authenticated;


-- =============================================================
-- Helper: register_table_device (admin convenience)
-- =============================================================

CREATE OR REPLACE FUNCTION register_table_device(
    p_branch_id     UUID,
    p_table_id      UUID,
    p_device_code   TEXT,
    p_device_secret TEXT,
    p_device_name   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_hash TEXT;
    v_id   UUID;
BEGIN
    IF NOT (is_admin() OR is_manager()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    v_hash := crypt(p_device_secret, gen_salt('bf', 8));

    INSERT INTO table_devices (branch_id, table_id, device_code, device_secret_hash, device_name)
    VALUES (p_branch_id, p_table_id, p_device_code, v_hash, p_device_name)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'success',     true,
        'device_id',   v_id,
        'device_code', p_device_code
    );
END;
$$;


-- =============================================================
-- Helper: generate_qr_token_for_table (admin convenience)
-- =============================================================

CREATE OR REPLACE FUNCTION generate_qr_token_for_table(
    p_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_token TEXT;
    v_id    UUID;
BEGIN
    IF NOT (is_admin() OR is_manager()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Deactivate old tokens for this table
    UPDATE table_qr_tokens
       SET is_active = false
     WHERE table_id = p_table_id
       AND is_active = true;

    -- Generate URL-safe base64 token (24 bytes = ~32 chars)
    v_token := encode(gen_random_bytes(24), 'base64');
    v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');

    INSERT INTO table_qr_tokens (table_id, qr_token)
    VALUES (p_table_id, v_token)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'success',  true,
        'token_id', v_id,
        'qr_token', v_token,
        'table_id', p_table_id
    );
END;
$$;
