-- ═══════════════════════════════════════════════════════════════════
-- SECURITY FIX: Price Manipulation & Discount Abuse Prevention
-- Seven Waves Restaurant ERP
-- Applied: 2026-06-22
--
-- PROBLEM 1: Any cashier could set order_items.unit_price to any value
--            (including LKR 0) with no server-side validation.
--
-- PROBLEM 2: Any cashier could apply a 100% manual discount to any order
--            with no server-side ceiling or manager approval.
--
-- FIX 1: BEFORE INSERT/UPDATE trigger on order_items validates unit_price
--         is within 10% of the canonical menu_items.base_price.
--         Deviations >10% require a manager_override_id to be set.
--
-- FIX 2: BEFORE INSERT/UPDATE trigger on orders validates discount_amount
--         cannot exceed 30% of subtotal without manager authorization.
--         Also adds max_cashier_discount_pct to company_settings.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- FIX 1 — ORDER ITEMS PRICE VALIDATION
-- ─────────────────────────────────────────────────────────────────

-- Add manager_override_id column to order_items for audit trail
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS manager_override_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

-- Price validation trigger: rejects unit_price > ±10% of base unless manager approved
CREATE OR REPLACE FUNCTION public.validate_order_item_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_price    NUMERIC;
  v_tolerance     NUMERIC := 0.10; -- 10% tolerance
  v_deviation     NUMERIC;
BEGIN
  -- Only validate if menu_item_id is set
  IF NEW.menu_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fetch canonical price from menu
  SELECT COALESCE(base_price, price, NEW.unit_price)
  INTO v_base_price
  FROM public.menu_items
  WHERE id = NEW.menu_item_id;

  -- If no canonical price found, allow through
  IF v_base_price IS NULL OR v_base_price = 0 THEN
    RETURN NEW;
  END IF;

  -- Calculate deviation as a fraction
  v_deviation := ABS(NEW.unit_price - v_base_price) / v_base_price;

  IF v_deviation > v_tolerance THEN
    -- Allow if manager has explicitly approved (set manager_override_id)
    IF NEW.manager_override_id IS NULL THEN
      RAISE EXCEPTION
        'unit_price (%) deviates %.0f%% from menu price (%). '
        'Deviations over 10%% require manager authorization (set manager_override_id).',
        NEW.unit_price,
        v_deviation * 100,
        v_base_price;
    END IF;

    -- Log the override to audit_logs
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, new_data, severity, created_at
    ) VALUES (
      auth.uid(),
      'PRICE_OVERRIDE',
      'order_items',
      NEW.id,
      jsonb_build_object(
        'menu_item_id', NEW.menu_item_id,
        'canonical_price', v_base_price,
        'submitted_price', NEW.unit_price,
        'deviation_pct', ROUND((v_deviation * 100)::NUMERIC, 2),
        'manager_override_id', NEW.manager_override_id,
        'override_reason', NEW.override_reason
      ),
      'warning',
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_item_price ON public.order_items;
CREATE TRIGGER trg_validate_order_item_price
  BEFORE INSERT OR UPDATE OF unit_price ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_item_price();


-- ─────────────────────────────────────────────────────────────────
-- FIX 2 — ORDER DISCOUNT CEILING
-- ─────────────────────────────────────────────────────────────────

-- Add max_cashier_discount_pct to company_settings (default 15%)
-- Add IF NOT EXISTS to be safe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_settings'
  ) THEN
    ALTER TABLE public.company_settings
      ADD COLUMN IF NOT EXISTS max_cashier_discount_pct NUMERIC DEFAULT 15
                                                         CHECK (max_cashier_discount_pct BETWEEN 0 AND 100);
  END IF;
END $$;

-- Add manager_discount_approved_by to orders for audit trail
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_override_reason TEXT;

-- Discount ceiling trigger: rejects discount_amount > company max without manager approval
CREATE OR REPLACE FUNCTION public.validate_order_discount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_discount_pct  NUMERIC := 15; -- fallback if company_settings not found
  v_subtotal          NUMERIC;
  v_discount_pct      NUMERIC;
BEGIN
  -- Only check when discount_amount changes
  IF NEW.discount_amount IS NULL OR NEW.discount_amount = 0 THEN
    RETURN NEW;
  END IF;

  -- Get the subtotal (use pre-discount amount)
  v_subtotal := COALESCE(NEW.subtotal, NEW.total_amount + NEW.discount_amount, 0);

  IF v_subtotal = 0 THEN
    RETURN NEW;
  END IF;

  -- Fetch company-configured maximum discount percentage
  BEGIN
    SELECT COALESCE(max_cashier_discount_pct, 15)
    INTO v_max_discount_pct
    FROM public.company_settings
    WHERE company_id = NEW.company_id
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_max_discount_pct := 15; -- fallback
  END;

  -- Calculate applied discount percentage
  v_discount_pct := (NEW.discount_amount / v_subtotal) * 100;

  IF v_discount_pct > v_max_discount_pct THEN
    -- Allow if manager has approved
    IF NEW.discount_approved_by IS NULL THEN
      RAISE EXCEPTION
        'Discount of %.1f%% exceeds the company maximum of %.0f%%. '
        'Discounts above this limit require manager authorization (set discount_approved_by).',
        v_discount_pct,
        v_max_discount_pct;
    END IF;

    -- Log the override
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, new_data, severity, created_at
    ) VALUES (
      auth.uid(),
      'DISCOUNT_OVERRIDE',
      'orders',
      NEW.id,
      jsonb_build_object(
        'subtotal', v_subtotal,
        'discount_amount', NEW.discount_amount,
        'discount_pct', ROUND(v_discount_pct::NUMERIC, 2),
        'max_allowed_pct', v_max_discount_pct,
        'approved_by', NEW.discount_approved_by,
        'reason', NEW.discount_override_reason
      ),
      'warning',
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_discount ON public.orders;
CREATE TRIGGER trg_validate_order_discount
  BEFORE INSERT OR UPDATE OF discount_amount ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_discount();


-- ─────────────────────────────────────────────────────────────────
-- RPC: apply_manager_price_override
-- Allows a manager to authorize a price deviation on an order item
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_manager_price_override(
  p_order_item_id UUID,
  p_new_price     NUMERIC,
  p_reason        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Must be manager or admin
  IF NOT (auth_has_role('manager') OR auth_has_role('admin')) THEN
    RAISE EXCEPTION 'Only managers and admins can authorize price overrides';
  END IF;

  UPDATE public.order_items
  SET
    unit_price          = p_new_price,
    manager_override_id = auth.uid(),
    override_reason     = p_reason
  WHERE id = p_order_item_id;

  RETURN jsonb_build_object('success', true, 'approved_by', auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_manager_price_override(UUID, NUMERIC, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- RPC: apply_manager_discount
-- Allows a manager to authorize a discount above the company limit
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_manager_discount_override(
  p_order_id      UUID,
  p_discount_pct  NUMERIC,
  p_reason        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal        NUMERIC;
  v_discount_amount NUMERIC;
BEGIN
  -- Must be manager or admin
  IF NOT (auth_has_role('manager') OR auth_has_role('admin')) THEN
    RAISE EXCEPTION 'Only managers and admins can authorize discount overrides';
  END IF;

  IF p_discount_pct < 0 OR p_discount_pct > 100 THEN
    RAISE EXCEPTION 'Discount percentage must be between 0 and 100';
  END IF;

  SELECT subtotal INTO v_subtotal FROM public.orders WHERE id = p_order_id;
  IF v_subtotal IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  v_discount_amount := v_subtotal * (p_discount_pct / 100);

  UPDATE public.orders
  SET
    discount_amount           = v_discount_amount,
    total_amount              = v_subtotal - v_discount_amount,
    discount_approved_by      = auth.uid(),
    discount_override_reason  = p_reason
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'discount_amount', v_discount_amount,
    'approved_by', auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_manager_discount_override(UUID, NUMERIC, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- DONE! Apply via Supabase dashboard SQL editor.
-- After applying:
--   1. Update POSPage.vue handleEdit() to call rpc_manager_price_override()
--      when price deviation > 10%
--   2. Update handleOther() to call rpc_manager_discount_override()
--      when discount > company max (default 15%)
-- ═══════════════════════════════════════════════════════════════════
