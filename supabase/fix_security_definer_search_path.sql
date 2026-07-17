-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: SECURITY DEFINER Functions Missing SET search_path = public
-- Addresses: VULN-004 (SecurityAudit) / BUG-DB-003 (DBaudit)
-- Risk: search_path injection — a malicious user with CREATE SCHEMA can
--       shadow functions called by SECURITY DEFINER triggers.
-- ═══════════════════════════════════════════════════════════════════════════

-- Fix 1: enqueue_notification_delivery (critical_fix_04_notification_outbox.sql)
CREATE OR REPLACE FUNCTION public.enqueue_notification_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO notification_outbox (
        notification_id, channel, target_user_id, target_branch_id,
        payload, status, next_retry_at
    ) VALUES (
        NEW.id, 'realtime', NEW.user_id, NEW.branch_id,
        jsonb_build_object(
            'type', NEW.type, 'title', NEW.title,
            'message', NEW.message, 'icon', NEW.icon,
            'color', NEW.color, 'action_url', NEW.action_url,
            'ref_type', NEW.ref_type, 'ref_id', NEW.ref_id
        ),
        'pending', now()
    );

    IF EXISTS (SELECT 1 FROM push_tokens WHERE user_id = NEW.user_id AND is_active = true) THEN
        INSERT INTO notification_outbox (
            notification_id, channel, target_user_id, target_branch_id,
            payload, status, next_retry_at
        ) VALUES (
            NEW.id, 'push', NEW.user_id, NEW.branch_id,
            jsonb_build_object(
                'type', NEW.type, 'title', NEW.title,
                'message', NEW.message, 'icon', NEW.icon,
                'action_url', NEW.action_url
            ),
            'pending', now()
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Fix 2: audit_stock_change (critical_fix_01_inventory_concurrency.sql)
CREATE OR REPLACE FUNCTION public.audit_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.qty_on_hand IS DISTINCT FROM NEW.qty_on_hand THEN
        INSERT INTO audit_logs (
            user_id, action, table_name, record_id,
            old_data, new_data, severity
        ) VALUES (
            COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
            'STOCK_CHANGE',
            'stock_on_hand',
            NEW.id,
            jsonb_build_object(
                'qty_on_hand', OLD.qty_on_hand,
                'total_value', OLD.total_value
            ),
            jsonb_build_object(
                'qty_on_hand', NEW.qty_on_hand,
                'total_value', NEW.total_value,
                'warehouse_id', NEW.warehouse_id,
                'item_id', NEW.item_id,
                'delta', NEW.qty_on_hand - OLD.qty_on_hand
            ),
            CASE
                WHEN NEW.qty_on_hand < 0 THEN 'critical'
                WHEN NEW.qty_on_hand <= 5 THEN 'warning'
                ELSE 'info'
            END
        );
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

-- Record this migration
INSERT INTO applied_migrations (filename, notes)
VALUES ('fix_security_definer_search_path.sql', 'Security: add SET search_path=public to SECURITY DEFINER trigger functions')
ON CONFLICT DO NOTHING;
