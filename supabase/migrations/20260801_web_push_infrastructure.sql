-- ============================================================================
-- Migration: Web Push infrastructure for the Waiter PWA
-- ============================================================================
-- PROBLEM:
--   Waiters currently only get notified of new orders via a live Supabase
--   Realtime (WebSocket) subscription in waiterAppStore.js/waiterOrderStore.js.
--   That connection dies the moment the PWA is closed or the phone screen
--   locks/suspends the tab — so waiters miss orders while off-screen even
--   though they're clocked in on shift.
--
--   The client already has a fully-written Web Push subscriber
--   (src/composables/useWaiterPush.js) and service worker (public/waiter-sw.js)
--   that can show a system notification and wake the device even when the PWA
--   is fully closed — but they call a `waiter-push-notify` Edge Function that
--   was never created, and there was no `push_subscriptions` table shaped for
--   Web Push (endpoint + p256dh + auth keys), and no trigger to send a push on
--   a brand NEW order (only an existing webhook on status UPDATE existed).
--
-- FIX:
--   1. `push_subscriptions` table — stores each waiter's Web Push subscription
--      (browser endpoint + encryption keys), keyed by profiles.id (auth user).
--   2. pg_net webhook trigger on `orders` INSERT (status = 'pending_waiter')
--      that calls a new `waiter-push-send` Edge Function to actually deliver
--      the Web Push notification to on-shift waiters, independent of whether
--      the app is open.
-- ============================================================================

-- ── 1. push_subscriptions table (Web Push, distinct from FCM's push_tokens) ─
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  device_name TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active
  ON public.push_subscriptions (user_id)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated ON public.push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_sub_self ON public.push_subscriptions;
CREATE POLICY push_sub_self ON public.push_subscriptions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_sub_admin ON public.push_subscriptions;
CREATE POLICY push_sub_admin ON public.push_subscriptions
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- The Edge Function uses the service_role key (bypasses RLS) for subscribe/
-- unsubscribe and for reading subscriptions to send pushes, so no extra
-- policy is needed for that path.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

-- ── 2. pg_net webhook: fire waiter-push-send on brand-new orders ────────────
-- This is separate from notify_order_status_change() (20260323 migration),
-- which only fires on UPDATE OF status — a new order INSERT never triggers it,
-- so no push was ever sent for the single most important event (a new order
-- landing in the waiter inbox). This trigger closes that gap specifically for
-- pending_waiter / pending orders (the ones that need a waiter to act on them).
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_new_order_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _payload jsonb;
  _edge_fn_url text;
  _service_role_key text;
BEGIN
  IF NEW.status NOT IN ('pending_waiter', 'pending') THEN
    RETURN NEW;
  END IF;

  _payload := jsonb_build_object(
    'type',   'INSERT',
    'table',  TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW)::jsonb
  );

  _edge_fn_url := coalesce(
    current_setting('app.settings.edge_function_url', true),
    'https://clykwuzajtwvwuavmtzs.supabase.co'
  ) || '/functions/v1/waiter-push-send';

  _service_role_key := coalesce(
    current_setting('app.settings.service_role_key', true),
    current_setting('supabase.service_role_key', true)
  );

  PERFORM net.http_post(
    url     := _edge_fn_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body    := _payload
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_order_push ON public.orders;
CREATE TRIGGER trg_new_order_push
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_order_push();

GRANT EXECUTE ON FUNCTION public.notify_new_order_push() TO postgres;
GRANT EXECUTE ON FUNCTION public.notify_new_order_push() TO service_role;

-- ── 3. Helper RPC: on-shift waiter/manager recipient IDs for a branch ───────
-- Reuses the same shift-aware eligibility rules as notify_role() in
-- notifications.sql (waiters/captains must be on shift right now, unless they
-- are also manager/admin) so push recipients exactly match who'd get the
-- in-app notification — called by the waiter-push-send Edge Function via the
-- service-role key (bypasses RLS, hence SECURITY DEFINER + explicit checks
-- are unnecessary beyond what notify_role already relies on).
CREATE OR REPLACE FUNCTION public.get_on_shift_notification_recipients(p_branch_id UUID)
RETURNS TABLE (user_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ur.user_id
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  JOIN user_branches ub ON ub.user_id = ur.user_id
  LEFT JOIN employees e ON e.profile_id = ur.user_id
  LEFT JOIN shift_assignments sa ON sa.employee_id = e.id
       AND sa.assignment_date = CURRENT_DATE
       AND sa.status = 'scheduled'
  LEFT JOIN shifts s ON s.id = sa.shift_id
  WHERE r.name IN ('waiter', 'captain', 'manager', 'admin')
    AND ub.branch_id = p_branch_id
    AND (
        r.name NOT IN ('waiter', 'captain')
        OR (
          sa.id IS NOT NULL AND (
              CASE
                  WHEN NOT s.is_overnight THEN
                      CURRENT_TIME BETWEEN (s.start_time - INTERVAL '30 minutes') AND (s.end_time + INTERVAL '30 minutes')
                  ELSE
                      CURRENT_TIME >= (s.start_time - INTERVAL '30 minutes') OR CURRENT_TIME <= (s.end_time + INTERVAL '30 minutes')
              END
          )
        )
        OR EXISTS (
          SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id
          WHERE ur2.user_id = ur.user_id AND r2.name IN ('admin', 'manager')
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_on_shift_notification_recipients(UUID) TO service_role;
