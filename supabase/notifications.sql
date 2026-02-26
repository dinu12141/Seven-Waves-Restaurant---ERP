-- =====================================================
-- NOTIFICATION ENGINE (FINAL PRODUCTION VERSION)
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
-- 1. NOTIFICATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    branch_id     UUID REFERENCES branches(id) ON DELETE CASCADE,
    type          TEXT NOT NULL DEFAULT 'info',
    title         TEXT NOT NULL,
    message       TEXT NOT NULL,
    icon          TEXT DEFAULT 'info',
    color         TEXT DEFAULT 'blue',
    action_url    TEXT,
    ref_type      TEXT,
    ref_id        UUID,
    is_read       BOOLEAN DEFAULT false,
    read_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_notification_type CHECK (
        type IN (
            'order_new',
            'order_accepted',
            'kitchen_ready',
            'payment_complete',
            'system',
            'info',
            'warning',
            'alert'
        )
    )
);

CREATE INDEX idx_notif_user       ON notifications(user_id, is_read);
CREATE INDEX idx_notif_branch     ON notifications(branch_id);
CREATE INDEX idx_notif_ref        ON notifications(ref_type, ref_id);
CREATE INDEX idx_notif_created    ON notifications(created_at DESC);
CREATE INDEX idx_notif_unread     ON notifications(user_id) WHERE is_read = false;

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select_own" ON notifications;
CREATE POLICY "notif_select_own"
ON notifications FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_update_own" ON notifications;
CREATE POLICY "notif_update_own"
ON notifications FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_insert_system" ON notifications;
CREATE POLICY "notif_insert_system"
ON notifications FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "notif_delete_own" ON notifications;
CREATE POLICY "notif_delete_own"
ON notifications FOR DELETE
USING (user_id = auth.uid());

-- =====================================================
-- 2. PUSH TOKENS (FCM / OPTIONAL)
-- =====================================================

CREATE TABLE IF NOT EXISTS push_tokens (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token         TEXT NOT NULL,
    platform      TEXT NOT NULL DEFAULT 'web',
    device_info   JSONB,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_push_platform CHECK (
        platform IN ('web', 'android', 'ios')
    ),
    CONSTRAINT uq_push_token UNIQUE (token)
);

CREATE INDEX idx_push_user   ON push_tokens(user_id, is_active);

CREATE TRIGGER trg_push_tokens_updated
BEFORE UPDATE ON push_tokens
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_own" ON push_tokens;
CREATE POLICY "push_own"
ON push_tokens FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =====================================================
-- 3. HELPER: BATCH-INSERT NOTIFICATIONS BY ROLE
-- =====================================================
-- Inserts one notification row per user who has a given role
-- within the same branch as the order.

CREATE OR REPLACE FUNCTION notify_role(
    p_branch_id  UUID,
    p_role_name  TEXT,
    p_type       TEXT,
    p_title      TEXT,
    p_message    TEXT,
    p_icon       TEXT,
    p_color      TEXT,
    p_action_url TEXT,
    p_ref_type   TEXT,
    p_ref_id     UUID,
    p_exclude_user UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO notifications(user_id, branch_id, type, title, message, icon, color, action_url, ref_type, ref_id)
    SELECT DISTINCT ur.user_id,
           p_branch_id,
           p_type,
           p_title,
           p_message,
           p_icon,
           p_color,
           p_action_url,
           p_ref_type,
           p_ref_id
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN user_branches ub ON ub.user_id = ur.user_id
    JOIN branches b ON b.id = ub.branch_id
    WHERE r.name = p_role_name
      AND b.id = p_branch_id
      AND (p_exclude_user IS NULL OR ur.user_id != p_exclude_user);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGER 1: CUSTOMER PLACES ORDER → NOTIFY WAITERS
-- =====================================================
-- Fires when a new order is inserted with status 'pending'
-- Notifies all waiters on shift in that branch.

CREATE OR REPLACE FUNCTION notify_new_order()
RETURNS TRIGGER AS $$
DECLARE
    v_table_label TEXT;
    v_msg TEXT;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN

        -- Build table label
        IF NEW.table_id IS NOT NULL THEN
            SELECT 'Table ' || table_number INTO v_table_label
            FROM restaurant_tables WHERE id = NEW.table_id;
        END IF;

        v_msg := COALESCE(v_table_label, 'Takeaway') ||
                 ' · ' || UPPER(REPLACE(NEW.order_type, '_', '-')) ||
                 ' · Order #' || NEW.order_number;

        -- Notify all waiters in this branch
        PERFORM notify_role(
            NEW.branch_id,
            'waiter',
            'order_new',
            '🔔 New Order Placed',
            v_msg,
            'restaurant_menu',
            'primary',
            '/orders/' || NEW.id,
            'order',
            NEW.id,
            NULL
        );

        -- Also notify managers
        PERFORM notify_role(
            NEW.branch_id,
            'manager',
            'order_new',
            '🔔 New Order Placed',
            v_msg,
            'restaurant_menu',
            'primary',
            '/orders/' || NEW.id,
            'order',
            NEW.id,
            NULL
        );

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_order ON orders;
CREATE TRIGGER trg_notify_new_order
AFTER INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION notify_new_order();

-- =====================================================
-- TRIGGER 2: WAITER ACCEPTS ORDER → NOTIFY KITCHEN + CASHIER
-- =====================================================
-- Fires when order status changes to 'accepted'.
-- Notifies kitchen staff and cashiers.

CREATE OR REPLACE FUNCTION notify_order_accepted()
RETURNS TRIGGER AS $$
DECLARE
    v_msg TEXT;
BEGIN
    IF NEW.status = 'accepted'
       AND OLD.status IS DISTINCT FROM 'accepted' THEN

        v_msg := 'Order #' || NEW.order_number ||
                 ' · ' || UPPER(REPLACE(NEW.order_type, '_', '-')) ||
                 ' accepted — preparing';

        -- Notify kitchen staff
        PERFORM notify_role(
            NEW.branch_id,
            'kitchen',
            'order_accepted',
            '📋 Order Accepted',
            v_msg,
            'soup_kitchen',
            'orange',
            '/kitchen',
            'order',
            NEW.id,
            NEW.waiter_id
        );

        -- Notify cashiers
        PERFORM notify_role(
            NEW.branch_id,
            'cashier',
            'order_accepted',
            '📋 Order Accepted',
            v_msg,
            'point_of_sale',
            'teal',
            '/pos',
            'order',
            NEW.id,
            NEW.waiter_id
        );

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_order_accepted ON orders;
CREATE TRIGGER trg_notify_order_accepted
AFTER UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION notify_order_accepted();

-- =====================================================
-- TRIGGER 3: KITCHEN READY → NOTIFY ASSIGNED WAITER
-- =====================================================
-- Fires when a KOT ticket moves to 'ready'.
-- Notifies the waiter assigned to that order.

CREATE OR REPLACE FUNCTION notify_kitchen_ready()
RETURNS TRIGGER AS $$
DECLARE
    v_order RECORD;
    v_kitchen_name TEXT;
    v_msg TEXT;
BEGIN
    IF NEW.status = 'ready'
       AND OLD.status IS DISTINCT FROM 'ready' THEN

        -- Fetch order details
        SELECT o.id, o.order_number, o.waiter_id, o.branch_id, o.order_type
        INTO v_order
        FROM orders o
        WHERE o.id = NEW.order_id;

        -- Fetch kitchen name
        SELECT name INTO v_kitchen_name
        FROM kitchens WHERE id = NEW.kitchen_id;

        v_msg := COALESCE(v_kitchen_name, 'Kitchen') ||
                 ' · Order #' || v_order.order_number ||
                 ' is READY for pickup';

        -- Notify the assigned waiter directly
        IF v_order.waiter_id IS NOT NULL THEN
            INSERT INTO notifications(user_id, branch_id, type, title, message, icon, color, action_url, ref_type, ref_id)
            VALUES (
                v_order.waiter_id,
                v_order.branch_id,
                'kitchen_ready',
                '✅ Food Ready!',
                v_msg,
                'check_circle',
                'green',
                '/orders/' || v_order.id,
                'kot',
                NEW.id
            );
        END IF;

        -- Also notify managers
        PERFORM notify_role(
            v_order.branch_id,
            'manager',
            'kitchen_ready',
            '✅ Food Ready',
            v_msg,
            'check_circle',
            'green',
            '/orders/' || v_order.id,
            'kot',
            NEW.id,
            v_order.waiter_id
        );

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_kitchen_ready ON kot_tickets;
CREATE TRIGGER trg_notify_kitchen_ready
AFTER UPDATE OF status ON kot_tickets
FOR EACH ROW EXECUTE FUNCTION notify_kitchen_ready();

-- =====================================================
-- TRIGGER 4: PAYMENT COMPLETED → NOTIFY CUSTOMER SCREEN
-- =====================================================
-- Fires when order payment_status changes to 'paid'.
-- Inserts a 'payment_complete' notification that the
-- customer-facing screen (or waiter) can subscribe to.

CREATE OR REPLACE FUNCTION notify_payment_complete()
RETURNS TRIGGER AS $$
DECLARE
    v_msg TEXT;
BEGIN
    IF NEW.payment_status = 'paid'
       AND OLD.payment_status IS DISTINCT FROM 'paid' THEN

        v_msg := 'Order #' || NEW.order_number ||
                 ' — Payment received · Total ' ||
                 TO_CHAR(NEW.total_amount, 'FM999,999.00');

        -- Notify the assigned waiter
        IF NEW.waiter_id IS NOT NULL THEN
            INSERT INTO notifications(user_id, branch_id, type, title, message, icon, color, action_url, ref_type, ref_id)
            VALUES (
                NEW.waiter_id,
                NEW.branch_id,
                'payment_complete',
                '💰 Payment Complete',
                v_msg,
                'payments',
                'green',
                '/orders/' || NEW.id,
                'order',
                NEW.id
            );
        END IF;

        -- Notify cashiers
        PERFORM notify_role(
            NEW.branch_id,
            'cashier',
            'payment_complete',
            '💰 Payment Complete',
            v_msg,
            'payments',
            'green',
            '/pos',
            'order',
            NEW.id,
            NEW.waiter_id
        );

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_payment_complete ON orders;
CREATE TRIGGER trg_notify_payment_complete
AFTER UPDATE OF payment_status ON orders
FOR EACH ROW EXECUTE FUNCTION notify_payment_complete();

-- =====================================================
-- CLEANUP: AUTO-DELETE OLD NOTIFICATIONS (> 7 DAYS)
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
    DELETE FROM notifications
    WHERE created_at < now() - interval '7 days'
      AND is_read = true;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- REALTIME (Supabase Publication)
-- =====================================================

ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
