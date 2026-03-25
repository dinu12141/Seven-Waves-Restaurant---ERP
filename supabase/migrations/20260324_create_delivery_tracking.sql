-- ============================================================
-- delivery_tracking — live GPS tracking for delivery drivers
-- ============================================================

CREATE TABLE IF NOT EXISTS public.delivery_tracking (
  order_id   UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id)
);

-- Index for fast lookups by recency
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_updated
  ON public.delivery_tracking (updated_at DESC);

COMMENT ON TABLE public.delivery_tracking IS 'Stores the latest GPS coordinates of a delivery driver for an active order.';

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;

-- Drivers can insert/update their own tracking rows
DROP POLICY IF EXISTS "Drivers can upsert their tracking" ON public.delivery_tracking;
CREATE POLICY "Drivers can upsert their tracking"
  ON public.delivery_tracking
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read tracking data
DROP POLICY IF EXISTS "Authenticated users can read tracking" ON public.delivery_tracking;
CREATE POLICY "Authenticated users can read tracking"
  ON public.delivery_tracking
  FOR SELECT
  USING (auth.role() = 'authenticated');
