-- ═══════════════════════════════════════════════════════════════════
-- CRITICAL FIX #04: NOTIFICATION OUTBOX PATTERN & RELIABLE DELIVERY
-- Seven Waves Restaurant ERP — Step 02 Hardening
-- Applied: 2026-05-15
-- ═══════════════════════════════════════════════════════════════════

-- 1. NOTIFICATION OUTBOX TABLE (persistent delivery queue)
CREATE TABLE IF NOT EXISTS public.notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT 'realtime',
    target_user_id UUID NOT NULL,
    target_branch_id UUID,
    payload JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    last_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_outbox_status CHECK (
        status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')
    ),
    CONSTRAINT chk_outbox_channel CHECK (
        channel IN ('realtime', 'push', 'email', 'sms', 'webhook')
    )
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON notification_outbox(status, next_retry_at)
    WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_outbox_user ON notification_outbox(target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_outbox_dead ON notification_outbox(status) WHERE status = 'dead_letter';

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbox_admin ON notification_outbox;
CREATE POLICY outbox_admin ON notification_outbox FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS outbox_service ON notification_outbox;
CREATE POLICY outbox_service ON notification_outbox FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. DEAD LETTER QUEUE VIEW
CREATE OR REPLACE VIEW v_dead_letter_notifications AS
SELECT
    o.id, o.channel, o.target_user_id,
    p.full_name AS target_user_name,
    o.payload, o.attempts, o.error_message,
    o.created_at, o.last_attempt_at
FROM notification_outbox o
LEFT JOIN profiles p ON p.id = o.target_user_id
WHERE o.status = 'dead_letter'
ORDER BY o.created_at DESC;

GRANT SELECT ON v_dead_letter_notifications TO authenticated;

-- 3. OUTBOX WRITER TRIGGER (auto-enqueue on notification insert)
CREATE OR REPLACE FUNCTION enqueue_notification_delivery()
RETURNS TRIGGER AS $$
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

    -- Also enqueue push notification if user has push tokens
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enqueue_notification ON notifications;
CREATE TRIGGER trg_enqueue_notification
AFTER INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION enqueue_notification_delivery();

-- 4. PROCESS OUTBOX (called by Edge Function or pg_cron)
CREATE OR REPLACE FUNCTION process_notification_outbox(p_batch_size INT DEFAULT 50)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_item RECORD;
    v_processed INT := 0;
    v_delivered INT := 0;
    v_failed INT := 0;
    v_dead INT := 0;
BEGIN
    FOR v_item IN
        SELECT * FROM notification_outbox
        WHERE status IN ('pending', 'processing')
          AND next_retry_at <= now()
        ORDER BY created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    LOOP
        v_processed := v_processed + 1;

        -- Mark as processing
        UPDATE notification_outbox
        SET status = 'processing',
            attempts = attempts + 1,
            last_attempt_at = now()
        WHERE id = v_item.id;

        BEGIN
            -- For 'realtime' channel: notification is already in the table
            -- and published via Supabase Realtime. Mark as delivered.
            IF v_item.channel = 'realtime' THEN
                UPDATE notification_outbox
                SET status = 'delivered', completed_at = now()
                WHERE id = v_item.id;
                v_delivered := v_delivered + 1;

            ELSIF v_item.channel = 'push' THEN
                -- Push notifications handled by Edge Function
                -- Mark as delivered if this function processes it
                UPDATE notification_outbox
                SET status = 'delivered', completed_at = now()
                WHERE id = v_item.id;
                v_delivered := v_delivered + 1;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_failed := v_failed + 1;

            IF v_item.attempts + 1 >= v_item.max_attempts THEN
                -- Move to dead letter queue
                UPDATE notification_outbox
                SET status = 'dead_letter',
                    error_message = SQLERRM
                WHERE id = v_item.id;
                v_dead := v_dead + 1;
            ELSE
                -- Exponential backoff: 30s, 60s, 120s, 240s, 480s
                UPDATE notification_outbox
                SET status = 'pending',
                    error_message = SQLERRM,
                    next_retry_at = now() + (POWER(2, v_item.attempts) * INTERVAL '30 seconds')
                WHERE id = v_item.id;
            END IF;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'processed', v_processed,
        'delivered', v_delivered,
        'failed', v_failed,
        'dead_letter', v_dead
    );
END;
$$;

GRANT EXECUTE ON FUNCTION process_notification_outbox(INT) TO service_role;

-- 5. RETRY DEAD LETTER NOTIFICATIONS
CREATE OR REPLACE FUNCTION retry_dead_letter(p_notification_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admin only');
    END IF;

    UPDATE notification_outbox
    SET status = 'pending',
        attempts = 0,
        next_retry_at = now(),
        error_message = NULL
    WHERE status = 'dead_letter'
      AND (p_notification_id IS NULL OR id = p_notification_id);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'retried', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION retry_dead_letter(UUID) TO authenticated;

-- 6. CLEANUP OLD DELIVERED OUTBOX ENTRIES (keep 7 days)
CREATE OR REPLACE FUNCTION cleanup_notification_outbox()
RETURNS void AS $$
BEGIN
    DELETE FROM notification_outbox
    WHERE status = 'delivered' AND completed_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- 7. REALTIME PUBLICATION
ALTER TABLE notification_outbox REPLICA IDENTITY FULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notification_outbox') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notification_outbox;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- END OF CRITICAL FIX #04
-- ═══════════════════════════════════════════════════════════════════
