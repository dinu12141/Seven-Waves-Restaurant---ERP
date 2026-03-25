-- ============================================================================
-- Seven Waves ERP – Inventory Alert System: Tables, Triggers & Webhook
-- ============================================================================
-- This migration sets up the automated inventory alert pipeline:
--   1. stock_alert_logs table — audit/de-duplication for email alerts
--   2. Trigger on stock_on_hand — fires on qty_on_hand changes
--   3. Webhook → calls the inventory-alerts Edge Function
-- ============================================================================

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 1. STOCK ALERT LOGS TABLE                                              │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS public.stock_alert_logs (
  id            uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  company_id    uuid NOT NULL REFERENCES public.companies(id),
  item_id       uuid NOT NULL REFERENCES public.items(id),
  warehouse_id  uuid NOT NULL REFERENCES public.warehouses(id),
  supplier_id   uuid REFERENCES public.suppliers(id),
  item_name     text NOT NULL,
  item_code     text,
  qty_on_hand   numeric NOT NULL DEFAULT 0,
  reorder_level numeric NOT NULL DEFAULT 0,
  supplier_email text,
  alert_type    text NOT NULL DEFAULT 'low_stock'
    CHECK (alert_type IN ('low_stock', 'out_of_stock', 'critical')),
  email_sent    boolean NOT NULL DEFAULT false,
  email_error   text,
  resolved_at   timestamptz,                    -- NULL = still unresolved
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Fast de-duplication lookup (item + warehouse within last 24 h)
CREATE INDEX IF NOT EXISTS idx_stock_alert_logs_dedup
  ON public.stock_alert_logs (item_id, warehouse_id, created_at DESC);

-- Find all unresolved alerts quickly
CREATE INDEX IF NOT EXISTS idx_stock_alert_logs_unresolved
  ON public.stock_alert_logs (item_id, warehouse_id)
  WHERE resolved_at IS NULL;

-- Enable Row-Level Security
ALTER TABLE public.stock_alert_logs ENABLE ROW LEVEL SECURITY;

-- RLS: service role owns everything, authenticated users can read
CREATE POLICY "Service role full access on stock_alert_logs"
  ON public.stock_alert_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view stock_alert_logs"
  ON public.stock_alert_logs FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.stock_alert_logs IS
  'Audit log for automated low-stock email alerts. Prevents duplicate emails '
  'within a 24-hour window per item/warehouse combination.';


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 2. DATABASE TRIGGER ON stock_on_hand                                   │
-- └─────────────────────────────────────────────────────────────────────────┘
-- Ensure pg_net extension is available (for async HTTP POST)
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Trigger function: calls the inventory-alerts edge function via HTTP
CREATE OR REPLACE FUNCTION public.notify_inventory_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _payload jsonb;
  _edge_function_url text;
BEGIN
  -- Only fire when qty_on_hand actually decreased
  IF OLD.qty_on_hand IS NOT DISTINCT FROM NEW.qty_on_hand THEN
    RETURN NEW;
  END IF;

  -- Build the webhook payload (matches Supabase webhook format)
  _payload := jsonb_build_object(
    'type',       'UPDATE',
    'table',      'stock_on_hand',
    'schema',     'public',
    'record',     row_to_json(NEW)::jsonb,
    'old_record', row_to_json(OLD)::jsonb
  );

  _edge_function_url :=
    'https://clykwuzajtwvwuavmtzs.supabase.co/functions/v1/inventory-alerts';

  -- Asynchronous HTTP POST via pg_net (non-blocking)
  PERFORM extensions.http_post(
    url          := _edge_function_url,
    body         := _payload::text,
    content_type := 'application/json'
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block the original inventory transaction
    RAISE WARNING '[inventory-alerts] webhook call failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Attach the trigger (fires only when qty_on_hand column changes)
DROP TRIGGER IF EXISTS trg_stock_on_hand_alert ON public.stock_on_hand;

CREATE TRIGGER trg_stock_on_hand_alert
  AFTER UPDATE OF qty_on_hand
  ON public.stock_on_hand
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inventory_alerts();

COMMENT ON TRIGGER trg_stock_on_hand_alert ON public.stock_on_hand IS
  'Fires when qty_on_hand changes. Calls inventory-alerts Edge Function '
  'via HTTP to check reorder levels and send supplier email notifications.';


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 3. OPTIONAL: Supabase Dashboard Webhook (alternative to trigger)       │
-- └─────────────────────────────────────────────────────────────────────────┘
-- If you prefer to use the Supabase Dashboard webhook UI instead of the
-- pg_net trigger above, create a Database Webhook with:
--
--   Name:       inventory-alerts-webhook
--   Table:      stock_on_hand
--   Events:     UPDATE
--   Type:       Supabase Edge Functions
--   Function:   inventory-alerts
--   HTTP Method: POST
--   Headers:
--     Content-Type: application/json
--     Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
--
-- NOTE: The trigger approach above is preferred because it fires only when
-- qty_on_hand actually changes (more efficient than firing on every UPDATE).
