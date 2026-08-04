-- ============================================================================
-- Migration: Create Database Webhooks for Order Notifications
-- ============================================================================
-- This migration creates pg_net-based database webhooks that fire the
-- `order-notifier` Edge Function whenever the `status` column changes
-- on the `orders` or `order_items` tables.
--
-- Prerequisites:
--   1. The `pg_net` extension must be enabled (Supabase enables it by default).
--   2. The Edge Function `order-notifier` must be deployed.
--   3. Set `app.settings.edge_function_url` to your Supabase project URL
--      (or replace the placeholder below).
-- ============================================================================

-- ── 1. Ensure pg_net extension is enabled ──────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── 2. Trigger function: fires Edge Function via pg_net ────────────────────
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _payload jsonb;
  _edge_fn_url text;
  _service_role_key text;
BEGIN
  -- Only fire when the status column actually changed
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Build webhook payload matching Supabase webhook format
  _payload := jsonb_build_object(
    'type',       'UPDATE',
    'table',      TG_TABLE_NAME,
    'schema',     TG_TABLE_SCHEMA,
    'record',     row_to_json(NEW)::jsonb,
    'old_record', row_to_json(OLD)::jsonb
  );

  -- Read the Edge Function URL from Supabase vault/settings
  -- Replace with your actual project URL if not using app.settings
  _edge_fn_url := coalesce(
    current_setting('app.settings.edge_function_url', true),
    'https://clykwuzajtwvwuavmtzs.supabase.co'
  ) || '/functions/v1/order-notifier';

  _service_role_key := coalesce(
    current_setting('app.settings.service_role_key', true),
    current_setting('supabase.service_role_key', true)
  );

  -- Fire-and-forget HTTP POST via pg_net
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

-- ── 3. Trigger on `orders` table ───────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_order_status_notify ON public.orders;
CREATE TRIGGER trg_order_status_notify
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_order_status_change();

-- ── 4. Trigger on `order_items` table ──────────────────────────────────────
DROP TRIGGER IF EXISTS trg_order_item_status_notify ON public.order_items;
CREATE TRIGGER trg_order_item_status_notify
  AFTER UPDATE OF status ON public.order_items
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_order_status_change();

-- ── 5. Add index for faster push_token lookups ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_active
  ON public.push_tokens (user_id)
  WHERE is_active = true;

-- ── 6. Grant execute to authenticated role (for webhook calls) ─────────────
GRANT EXECUTE ON FUNCTION public.notify_order_status_change() TO postgres;
GRANT EXECUTE ON FUNCTION public.notify_order_status_change() TO service_role;
