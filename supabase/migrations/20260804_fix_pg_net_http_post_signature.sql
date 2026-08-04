-- ============================================================================
-- Migration: Fix pg_net http_post signature mismatch
-- ============================================================================
-- Newer versions of pg_net expect `body` to be of type `jsonb`.
-- Casting `jsonb` to `text` (e.g. `body := _payload::text`) causes a signature
-- mismatch error: "function net.http_post(url => text, headers => jsonb, body => text) does not exist".
-- This migration re-creates the affected webhook and cron functions to pass `jsonb` directly.

-- 1. Fix notify_order_status_change()
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _payload jsonb;
  _edge_fn_url text;
  _service_role_key text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  _payload := jsonb_build_object(
    'type',       'UPDATE',
    'table',      TG_TABLE_NAME,
    'schema',     TG_TABLE_SCHEMA,
    'record',     row_to_json(NEW)::jsonb,
    'old_record', row_to_json(OLD)::jsonb
  );

  _edge_fn_url := coalesce(
    current_setting('app.settings.edge_function_url', true),
    'https://clykwuzajtwvwuavmtzs.supabase.co'
  ) || '/functions/v1/order-notifier';

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

-- 2. Fix trigger_daily_system_backup()
CREATE OR REPLACE FUNCTION public.trigger_daily_system_backup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _edge_fn_url TEXT;
  _service_role_key TEXT;
BEGIN
  _edge_fn_url := coalesce(
    current_setting('app.settings.edge_function_url', true),
    'https://clykwuzajtwvwuavmtzs.supabase.co'
  ) || '/functions/v1/system-backup';

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
    body    := jsonb_build_object('action', 'trigger')
  );
END;
$$;

-- 3. Fix notify_waiters_of_new_order()
CREATE OR REPLACE FUNCTION public.notify_waiters_of_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _payload jsonb;
  _edge_fn_url text;
  _service_role_key text;
BEGIN
  _payload := jsonb_build_object(
    'type',   'NEW_ORDER',
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
