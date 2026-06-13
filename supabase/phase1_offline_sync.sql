-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1 — DELIVERY + KITCHEN + CASHIER + FISCAL + SYSTEM + OFFLINE
-- Seven Waves Restaurant ERP
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 0. CLEAN UP FOR ITERATIVE DEVELOPMENT
-- ─────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS offline_sync_queue CASCADE;
DROP TABLE IF EXISTS feature_flags CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS tax_rules CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS fiscal_years CASCADE;
DROP TABLE IF EXISTS cashier_sessions CASCADE;
DROP TABLE IF EXISTS tills CASCADE;
DROP TABLE IF EXISTS kitchen_station_items CASCADE;
DROP TABLE IF EXISTS kitchen_stations CASCADE;
DROP TABLE IF EXISTS delivery_tracking CASCADE;
DROP TABLE IF EXISTS delivery_orders CASCADE;
DROP TABLE IF EXISTS riders CASCADE;
DROP TABLE IF EXISTS delivery_zones CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- 1. DELIVERY ZONES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_zones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    min_order_value NUMERIC(10,2) DEFAULT 0,
    delivery_fee    NUMERIC(10,2) DEFAULT 0,
    estimated_time  INT DEFAULT 30,
    radius_km       NUMERIC(6,2),
    polygon         JSONB,
    is_active       BOOLEAN DEFAULT true,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_dz_branch  ON delivery_zones(branch_id);
CREATE INDEX IF NOT EXISTS idx_dz_company ON delivery_zones(company_id);
CREATE INDEX IF NOT EXISTS idx_dz_active  ON delivery_zones(branch_id, is_active) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 2. RIDERS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS riders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    profile_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    phone           TEXT NOT NULL,
    vehicle_type    TEXT DEFAULT 'motorcycle',
    vehicle_number  TEXT,
    license_number  TEXT,
    status          TEXT DEFAULT 'offline',
    current_lat     NUMERIC(10,7),
    current_lng     NUMERIC(10,7),
    total_deliveries INT DEFAULT 0,
    avg_rating      NUMERIC(3,2) DEFAULT 0,
    is_active       BOOLEAN DEFAULT true,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_ri_vehicle CHECK (vehicle_type IN ('motorcycle','bicycle','car','van','scooter','other')),
    CONSTRAINT chk_ri_status CHECK (status IN ('online','busy','offline','break'))
);
CREATE INDEX IF NOT EXISTS idx_ri_branch  ON riders(branch_id);
CREATE INDEX IF NOT EXISTS idx_ri_status  ON riders(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ri_profile ON riders(profile_id);
CREATE INDEX IF NOT EXISTS idx_ri_company ON riders(company_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. DELIVERY ORDERS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rider_id        UUID REFERENCES riders(id) ON DELETE SET NULL,
    zone_id         UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
    customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name   TEXT,
    customer_phone  TEXT,
    delivery_address TEXT NOT NULL,
    delivery_lat    NUMERIC(10,7),
    delivery_lng    NUMERIC(10,7),
    delivery_notes  TEXT,
    estimated_time  INT,
    actual_time     INT,
    distance_km     NUMERIC(6,2),
    delivery_fee    NUMERIC(10,2) DEFAULT 0,
    status          TEXT DEFAULT 'pending',
    assigned_at     TIMESTAMPTZ,
    picked_up_at    TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   TEXT,
    rating          INT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    rating_comment  TEXT,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_do_status CHECK (status IN ('pending','assigned','picked_up','in_transit','delivered','cancelled','failed','returned'))
);
CREATE INDEX IF NOT EXISTS idx_do_order   ON delivery_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_do_rider   ON delivery_orders(rider_id);
CREATE INDEX IF NOT EXISTS idx_do_status  ON delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_do_date    ON delivery_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_do_branch  ON delivery_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_do_company ON delivery_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_do_cust    ON delivery_orders(customer_id);

-- ─────────────────────────────────────────────────────────────────
-- 4. DELIVERY TRACKING
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_tracking (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    delivery_id     UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
    lat             NUMERIC(10,7) NOT NULL,
    lng             NUMERIC(10,7) NOT NULL,
    speed_kmh       NUMERIC(6,2),
    heading         NUMERIC(5,2),
    accuracy_m      NUMERIC(6,2),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dt_delivery ON delivery_tracking(delivery_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_dt_company  ON delivery_tracking(company_id);

-- ─────────────────────────────────────────────────────────────────
-- 5. KITCHEN STATIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kitchen_stations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kitchen_id      UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    station_type    TEXT DEFAULT 'general',
    display_order   INT DEFAULT 0,
    max_concurrent  INT DEFAULT 10,
    avg_prep_time   INT DEFAULT 15,
    is_active       BOOLEAN DEFAULT true,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_ks_type CHECK (station_type IN ('general','grill','fryer','prep','salad','dessert','beverage','bakery','wok','sushi','pizza'))
);
CREATE INDEX IF NOT EXISTS idx_ks_kitchen ON kitchen_stations(kitchen_id);
CREATE INDEX IF NOT EXISTS idx_ks_company ON kitchen_stations(company_id);
CREATE INDEX IF NOT EXISTS idx_ks_active  ON kitchen_stations(kitchen_id, is_active) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS kitchen_station_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id      UUID NOT NULL REFERENCES kitchen_stations(id) ON DELETE CASCADE,
    menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    priority        INT DEFAULT 0,
    avg_prep_time   INT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    UNIQUE(station_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS idx_ksi_station ON kitchen_station_items(station_id);
CREATE INDEX IF NOT EXISTS idx_ksi_menu    ON kitchen_station_items(menu_item_id);

-- ─────────────────────────────────────────────────────────────────
-- 6. TILLS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    till_number     INT NOT NULL,
    location_desc   TEXT,
    is_active       BOOLEAN DEFAULT true,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    UNIQUE(branch_id, till_number)
);
CREATE INDEX IF NOT EXISTS idx_till_branch ON tills(branch_id);
CREATE INDEX IF NOT EXISTS idx_till_active ON tills(branch_id, is_active) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 7. CASHIER SESSIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashier_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    till_id         UUID REFERENCES tills(id) ON DELETE SET NULL,
    cashier_id      UUID NOT NULL REFERENCES profiles(id),
    opening_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
    closing_amount  NUMERIC(14,2),
    expected_amount NUMERIC(14,2),
    variance        NUMERIC(14,2),
    cash_sales      NUMERIC(14,2) DEFAULT 0,
    card_sales      NUMERIC(14,2) DEFAULT 0,
    other_sales     NUMERIC(14,2) DEFAULT 0,
    total_orders    INT DEFAULT 0,
    total_refunds   NUMERIC(14,2) DEFAULT 0,
    total_voids     INT DEFAULT 0,
    status          TEXT DEFAULT 'open',
    opened_at       TIMESTAMPTZ DEFAULT now(),
    closed_at       TIMESTAMPTZ,
    reconciled_by   UUID REFERENCES profiles(id),
    reconciled_at   TIMESTAMPTZ,
    notes           TEXT,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_cs_status CHECK (status IN ('open','closed','reconciled'))
);
CREATE INDEX IF NOT EXISTS idx_cs_branch  ON cashier_sessions(branch_id);
CREATE INDEX IF NOT EXISTS idx_cs_cashier ON cashier_sessions(cashier_id);
CREATE INDEX IF NOT EXISTS idx_cs_status  ON cashier_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cs_date    ON cashier_sessions(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_company ON cashier_sessions(company_id);

-- ─────────────────────────────────────────────────────────────────
-- 8. FISCAL YEARS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fiscal_years (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_current      BOOLEAN DEFAULT false,
    is_closed       BOOLEAN DEFAULT false,
    closed_by       UUID REFERENCES profiles(id),
    closed_at       TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_fy_dates CHECK (end_date > start_date)
);
CREATE INDEX IF NOT EXISTS idx_fy_company ON fiscal_years(company_id);
CREATE INDEX IF NOT EXISTS idx_fy_current ON fiscal_years(company_id, is_current) WHERE is_current = true;

-- ─────────────────────────────────────────────────────────────────
-- 9. BUDGETS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    fiscal_year_id  UUID NOT NULL REFERENCES fiscal_years(id) ON DELETE CASCADE,
    department      TEXT NOT NULL,
    account_code    TEXT REFERENCES chart_of_accounts(code),
    budget_type     TEXT DEFAULT 'expense',
    period_type     TEXT DEFAULT 'monthly',
    jan NUMERIC(14,2) DEFAULT 0, feb NUMERIC(14,2) DEFAULT 0,
    mar NUMERIC(14,2) DEFAULT 0, apr NUMERIC(14,2) DEFAULT 0,
    may NUMERIC(14,2) DEFAULT 0, jun NUMERIC(14,2) DEFAULT 0,
    jul NUMERIC(14,2) DEFAULT 0, aug NUMERIC(14,2) DEFAULT 0,
    sep NUMERIC(14,2) DEFAULT 0, oct NUMERIC(14,2) DEFAULT 0,
    nov NUMERIC(14,2) DEFAULT 0, dec_amt NUMERIC(14,2) DEFAULT 0,
    total_budget    NUMERIC(14,2) GENERATED ALWAYS AS (jan+feb+mar+apr+may+jun+jul+aug+sep+oct+nov+dec_amt) STORED,
    status          TEXT DEFAULT 'draft',
    approved_by     UUID REFERENCES profiles(id),
    approved_at     TIMESTAMPTZ,
    notes           TEXT,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_bud_type CHECK (budget_type IN ('revenue','expense','capex')),
    CONSTRAINT chk_bud_period CHECK (period_type IN ('monthly','quarterly','annual')),
    CONSTRAINT chk_bud_status CHECK (status IN ('draft','submitted','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_bud_company ON budgets(company_id);
CREATE INDEX IF NOT EXISTS idx_bud_branch  ON budgets(branch_id);
CREATE INDEX IF NOT EXISTS idx_bud_fy      ON budgets(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_bud_dept    ON budgets(department);

-- ─────────────────────────────────────────────────────────────────
-- 10. TAX RULES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    code            TEXT NOT NULL,
    rate            NUMERIC(5,2) NOT NULL,
    tax_type        TEXT DEFAULT 'vat',
    is_inclusive    BOOLEAN DEFAULT false,
    applies_to      TEXT DEFAULT 'all',
    effective_from  DATE DEFAULT CURRENT_DATE,
    effective_to    DATE,
    is_active       BOOLEAN DEFAULT true,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_tr_type CHECK (tax_type IN ('vat','service_tax','gst','cess','custom')),
    CONSTRAINT chk_tr_applies CHECK (applies_to IN ('all','dine_in','takeaway','delivery','online')),
    UNIQUE(company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_tr_company ON tax_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_tr_active  ON tax_rules(company_id, is_active) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 11. SYSTEM SETTINGS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE CASCADE,
    setting_key     TEXT NOT NULL,
    setting_value   JSONB NOT NULL DEFAULT '{}',
    setting_type    TEXT DEFAULT 'string',
    description     TEXT,
    is_sensitive    BOOLEAN DEFAULT false,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    CONSTRAINT chk_ss_type CHECK (setting_type IN ('string','number','boolean','json','array'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ss_company_branch_key ON system_settings(company_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::UUID), setting_key);
CREATE INDEX IF NOT EXISTS idx_ss_company ON system_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_ss_branch  ON system_settings(branch_id);
CREATE INDEX IF NOT EXISTS idx_ss_key     ON system_settings(setting_key);

-- ─────────────────────────────────────────────────────────────────
-- 12. FEATURE FLAGS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
    flag_key        TEXT NOT NULL,
    display_name    TEXT,
    description     TEXT,
    is_enabled      BOOLEAN DEFAULT false,
    rollout_pct     INT DEFAULT 0 CHECK (rollout_pct >= 0 AND rollout_pct <= 100),
    metadata        JSONB DEFAULT '{}',
    expires_at      TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    created_by      UUID REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ff_company_key ON feature_flags(COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::UUID), flag_key);
CREATE INDEX IF NOT EXISTS idx_ff_company ON feature_flags(company_id);
CREATE INDEX IF NOT EXISTS idx_ff_key     ON feature_flags(flag_key);
CREATE INDEX IF NOT EXISTS idx_ff_active  ON feature_flags(is_enabled) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 13. OFFLINE SYNC QUEUE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offline_sync_queue (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id        UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    client_id        TEXT NOT NULL,
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    operation        TEXT NOT NULL,
    table_name       TEXT NOT NULL,
    record_id        UUID,
    payload          JSONB NOT NULL,
    client_timestamp TIMESTAMPTZ NOT NULL,
    server_timestamp TIMESTAMPTZ,
    status           TEXT DEFAULT 'pending',
    conflict_data    JSONB,
    resolution       TEXT,
    error_message    TEXT,
    retry_count      INT DEFAULT 0,
    max_retries      INT DEFAULT 5,
    priority         INT DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT now(),
    processed_at     TIMESTAMPTZ,
    created_by       UUID REFERENCES auth.users(id),
    CONSTRAINT chk_osq_op CHECK (operation IN ('INSERT','UPDATE','DELETE','UPSERT')),
    CONSTRAINT chk_osq_status CHECK (status IN ('pending','processing','synced','conflict','failed','expired')),
    CONSTRAINT chk_osq_res CHECK (resolution IS NULL OR resolution IN ('server_wins','client_wins','merged','manual'))
);
CREATE INDEX IF NOT EXISTS idx_osq_user     ON offline_sync_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_osq_branch   ON offline_sync_queue(branch_id);
CREATE INDEX IF NOT EXISTS idx_osq_status   ON offline_sync_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_osq_company  ON offline_sync_queue(company_id);
CREATE INDEX IF NOT EXISTS idx_osq_priority ON offline_sync_queue(priority DESC, created_at) WHERE status = 'pending';


-- ═══════════════════════════════════════════════════════════════════
-- RLS ENABLE + POLICIES
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE t TEXT;
    tbls TEXT[] := ARRAY[
        'delivery_zones','riders','delivery_orders','delivery_tracking',
        'kitchen_stations','kitchen_station_items','tills','cashier_sessions',
        'fiscal_years','budgets','tax_rules','system_settings','feature_flags',
        'offline_sync_queue'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

-- Delivery: admin/manager full; rider self
CREATE POLICY dz_admin ON delivery_zones FOR ALL USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());
CREATE POLICY dz_read ON delivery_zones FOR SELECT USING (branch_id = ANY(auth_branch_ids()) AND deleted_at IS NULL);

CREATE POLICY ri_admin ON riders FOR ALL USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());
CREATE POLICY ri_self ON riders FOR SELECT USING (profile_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY do_admin ON delivery_orders FOR ALL USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());
CREATE POLICY do_rider ON delivery_orders FOR SELECT
    USING (EXISTS (SELECT 1 FROM riders r WHERE r.id = delivery_orders.rider_id AND r.profile_id = auth.uid()) AND deleted_at IS NULL);
CREATE POLICY do_branch ON delivery_orders FOR SELECT USING (branch_id = ANY(auth_branch_ids()) AND deleted_at IS NULL);

CREATE POLICY dt_admin ON delivery_tracking FOR ALL USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());
CREATE POLICY dt_ins ON delivery_tracking FOR INSERT WITH CHECK (true);

-- Kitchen: read all, write admin/manager
CREATE POLICY ks_read ON kitchen_stations FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY ks_write ON kitchen_stations FOR ALL USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());
CREATE POLICY ksi_read ON kitchen_station_items FOR SELECT USING (true);
CREATE POLICY ksi_write ON kitchen_station_items FOR ALL USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

-- Tills / Cashier
CREATE POLICY till_read ON tills FOR SELECT USING (branch_id = ANY(auth_branch_ids()) AND deleted_at IS NULL);
CREATE POLICY till_write ON tills FOR ALL USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

CREATE POLICY cs_admin ON cashier_sessions FOR ALL USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());
CREATE POLICY cs_own ON cashier_sessions FOR SELECT USING (cashier_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY cs_ins ON cashier_sessions FOR INSERT WITH CHECK (auth_has_role('cashier') AND cashier_id = auth.uid());
CREATE POLICY cs_upd ON cashier_sessions FOR UPDATE USING (auth_has_role('cashier') AND cashier_id = auth.uid()) WITH CHECK (auth_has_role('cashier') AND cashier_id = auth.uid());

-- Fiscal / Budgets / Tax
CREATE POLICY fy_admin ON fiscal_years FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY fy_read ON fiscal_years FOR SELECT USING (is_finance() OR is_manager());

CREATE POLICY bud_admin ON budgets FOR ALL USING (is_admin() OR is_finance()) WITH CHECK (is_admin() OR is_finance());
CREATE POLICY bud_read ON budgets FOR SELECT USING (is_manager() AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids())));

CREATE POLICY tr_admin ON tax_rules FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY tr_read ON tax_rules FOR SELECT USING (deleted_at IS NULL);

-- System / Feature Flags
CREATE POLICY ss_admin ON system_settings FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY ss_read ON system_settings FOR SELECT USING (NOT is_sensitive AND deleted_at IS NULL);

CREATE POLICY ff_admin ON feature_flags FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY ff_read ON feature_flags FOR SELECT USING (deleted_at IS NULL);

-- Offline Sync
CREATE POLICY osq_own ON offline_sync_queue FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY osq_admin ON offline_sync_queue FOR ALL USING (is_admin()) WITH CHECK (is_admin());


-- ═══════════════════════════════════════════════════════════════════
-- AUDIT TRIGGERS
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE t TEXT;
    tbls TEXT[] := ARRAY[
        'delivery_zones','riders','delivery_orders','cashier_sessions',
        'kitchen_stations','tills','fiscal_years','budgets',
        'tax_rules','system_settings','feature_flags','offline_sync_queue'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON %I', t, t);
            EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.audit_record()', t, t);
        END IF;
    END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- REALTIME PUBLICATION
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE t TEXT;
    tbls TEXT[] := ARRAY['delivery_orders','riders','delivery_tracking','cashier_sessions','kitchen_stations'];
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
DECLARE t TEXT;
    tbls TEXT[] := ARRAY[
        'delivery_zones','riders','delivery_orders','kitchen_stations',
        'tills','cashier_sessions','fiscal_years','budgets',
        'tax_rules','system_settings','feature_flags'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON %I', t, t);
            EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
        END IF;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- DONE ✅ Phase 1: Delivery+Kitchen+Cashier+Fiscal+System+Offline
-- ═══════════════════════════════════════════════════════════════════
