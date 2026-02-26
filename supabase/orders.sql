-- =====================================================
-- ORDER MANAGEMENT (FINAL PRODUCTION VERSION)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- AUTO UPDATED_AT TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 1. ORDERS
-- =====================================================

DROP TABLE IF EXISTS orders CASCADE;
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_id        UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    waiter_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    order_number    SERIAL,
    order_type      TEXT NOT NULL DEFAULT 'dine_in',
    order_source    TEXT NOT NULL DEFAULT 'pos',
    status          TEXT NOT NULL DEFAULT 'pending',
    payment_status  TEXT NOT NULL DEFAULT 'unpaid',
    customer_name   TEXT,
    customer_phone  TEXT,
    delivery_address TEXT,
    subtotal        NUMERIC(12,2) DEFAULT 0,
    tax_amount      NUMERIC(12,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    total_amount    NUMERIC(12,2) DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_order_type CHECK (
        order_type IN ('dine_in', 'takeaway', 'delivery', 'online')
    ),
    CONSTRAINT chk_order_source CHECK (
        order_source IN ('pos', 'qr', 'website', 'uber_eats', 'pickme', 'other')
    ),
    CONSTRAINT chk_order_status CHECK (
        status IN (
            'pending',
            'accepted',
            'preparing',
            'ready',
            'served',
            'invoiced',
            'paid',
            'cancelled'
        )
    ),
    CONSTRAINT chk_payment_status CHECK (
        payment_status IN ('unpaid', 'partial', 'paid', 'refunded')
    )
);

CREATE INDEX idx_orders_company   ON orders(company_id);
CREATE INDEX idx_orders_branch    ON orders(branch_id);
CREATE INDEX idx_orders_table     ON orders(table_id);
CREATE INDEX idx_orders_waiter    ON orders(waiter_id);
CREATE INDEX idx_orders_status    ON orders(status);
CREATE INDEX idx_orders_created   ON orders(created_at DESC);

CREATE TRIGGER trg_orders_updated
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 2. ORDER ITEMS
-- =====================================================

DROP TABLE IF EXISTS order_items CASCADE;
CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    variant_id      UUID REFERENCES item_variants(id) ON DELETE SET NULL,
    kitchen_id      UUID REFERENCES kitchens(id) ON DELETE SET NULL,
    quantity        INT NOT NULL DEFAULT 1,
    unit_price      NUMERIC(12,2) NOT NULL,
    total_price     NUMERIC(12,2) NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_oi_quantity CHECK (quantity > 0),
    CONSTRAINT chk_oi_status CHECK (
        status IN ('queued', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'cancelled')
    )
);

CREATE INDEX idx_oi_order     ON order_items(order_id);
CREATE INDEX idx_oi_menu_item ON order_items(menu_item_id);
CREATE INDEX idx_oi_kitchen   ON order_items(kitchen_id);
CREATE INDEX idx_oi_status    ON order_items(status);

CREATE TRIGGER trg_order_items_updated
BEFORE UPDATE ON order_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 3. ORDER STATUS LOGS (LIFECYCLE AUDIT)
-- =====================================================
--
-- Workflow lifecycle tracked here:
--   pending → accepted → preparing → ready → served → invoiced → paid
--   (cancelled can occur at any stage)
--

DROP TABLE IF EXISTS order_status_logs CASCADE;
CREATE TABLE order_status_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status      TEXT NOT NULL,
    changed_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_osl_order     ON order_status_logs(order_id);
CREATE INDEX idx_osl_status    ON order_status_logs(new_status);
CREATE INDEX idx_osl_created   ON order_status_logs(created_at DESC);

-- =====================================================
-- 4. KOT TICKETS (Kitchen Order Tickets)
-- =====================================================

DROP TABLE IF EXISTS kot_tickets CASCADE;
CREATE TABLE kot_tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    kitchen_id      UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
    kot_number      SERIAL,
    status          TEXT NOT NULL DEFAULT 'pending',
    printed_at      TIMESTAMPTZ,
    accepted_at     TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_kot_status CHECK (
        status IN ('created', 'pending', 'accepted', 'preparing', 'ready', 'cancelled')
    )
);

CREATE INDEX idx_kot_order    ON kot_tickets(order_id);
CREATE INDEX idx_kot_kitchen  ON kot_tickets(kitchen_id);
CREATE INDEX idx_kot_status   ON kot_tickets(status);

CREATE TRIGGER trg_kot_tickets_updated
BEFORE UPDATE ON kot_tickets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 5. KOT ITEMS
-- =====================================================

DROP TABLE IF EXISTS kot_items CASCADE;
CREATE TABLE kot_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kot_id          UUID NOT NULL REFERENCES kot_tickets(id) ON DELETE CASCADE,
    order_item_id   UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    quantity        INT NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'queued',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_ki_quantity CHECK (quantity > 0),
    CONSTRAINT chk_ki_status CHECK (
        status IN ('queued', 'preparing', 'ready', 'cancelled')
    )
);

CREATE INDEX idx_ki_kot        ON kot_items(kot_id);
CREATE INDEX idx_ki_order_item ON kot_items(order_item_id);
CREATE INDEX idx_ki_status     ON kot_items(status);

CREATE TRIGGER trg_kot_items_updated
BEFORE UPDATE ON kot_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- TRIGGER: AUTO-LOG ORDER STATUS CHANGES
-- =====================================================

CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO order_status_logs(order_id, previous_status, new_status, changed_by)
        VALUES (NEW.id, NULL, NEW.status, NEW.waiter_id);
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_status_logs(order_id, previous_status, new_status, changed_by)
        VALUES (NEW.id, OLD.status, NEW.status, NEW.waiter_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_status_log
AFTER INSERT OR UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- =====================================================
-- TRIGGER: AUTO-GENERATE KOT ON ORDER ACCEPTED
-- =====================================================
-- When an order moves to 'accepted', group order_items
-- by kitchen and create one KOT per kitchen.

CREATE OR REPLACE FUNCTION generate_kot_on_accept()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_kot_id UUID;
BEGIN
    IF NEW.status = 'accepted' AND OLD.status IN ('pending', 'pending_waiter') THEN

        FOR r IN
            SELECT DISTINCT kitchen_id
            FROM order_items
            WHERE order_id = NEW.id
              AND kitchen_id IS NOT NULL
              AND status = 'queued'
        LOOP
            INSERT INTO kot_tickets(order_id, kitchen_id, status)
            VALUES (NEW.id, r.kitchen_id, 'created')
            RETURNING id INTO v_kot_id;

            INSERT INTO kot_items(kot_id, order_item_id, quantity)
            SELECT v_kot_id, oi.id, oi.quantity
            FROM order_items oi
            WHERE oi.order_id = NEW.id
              AND oi.kitchen_id = r.kitchen_id
              AND oi.status = 'queued';

            UPDATE order_items
            SET status = 'sent_to_kitchen'
            WHERE order_id = NEW.id
              AND kitchen_id = r.kitchen_id
              AND status = 'queued';
        END LOOP;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_kot
AFTER UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION generate_kot_on_accept();

-- =====================================================
-- TRIGGER: AUTO-UPDATE ORDER STATUS ON KOT COMPLETE
-- =====================================================
-- When all KOTs for an order are 'ready',
-- set the order status to 'ready'.

CREATE OR REPLACE FUNCTION check_order_ready()
RETURNS TRIGGER AS $$
DECLARE
    v_total     INT;
    v_ready     INT;
    v_cancelled INT;
BEGIN
    IF NEW.status IN ('ready', 'cancelled') THEN

        SELECT COUNT(*),
               COUNT(*) FILTER (WHERE status = 'ready'),
               COUNT(*) FILTER (WHERE status = 'cancelled')
        INTO v_total, v_ready, v_cancelled
        FROM kot_tickets
        WHERE order_id = NEW.order_id;

        IF v_total > 0 AND (v_ready + v_cancelled) = v_total AND v_ready > 0 THEN
            UPDATE orders
            SET status = 'ready'
            WHERE id = NEW.order_id
              AND status IN ('accepted', 'preparing');
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_order_ready
AFTER UPDATE OF status ON kot_tickets
FOR EACH ROW EXECUTE FUNCTION check_order_ready();

-- =====================================================
-- REALTIME (Supabase Publication)
-- =====================================================

ALTER TABLE orders       REPLICA IDENTITY FULL;
ALTER TABLE order_items  REPLICA IDENTITY FULL;
ALTER TABLE kot_tickets  REPLICA IDENTITY FULL;
ALTER TABLE kot_items    REPLICA IDENTITY FULL;
ALTER TABLE order_status_logs REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE kot_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE kot_items;
ALTER PUBLICATION supabase_realtime ADD TABLE order_status_logs;
