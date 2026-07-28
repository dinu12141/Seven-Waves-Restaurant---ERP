CREATE OR REPLACE FUNCTION public.validate_order_item_price()
RETURNS TRIGGER AS $$
DECLARE
  v_canonical  NUMERIC;
  v_tolerance  NUMERIC := 0.10;
  v_deviation  NUMERIC;
  v_source     TEXT := 'base';
BEGIN
  IF NEW.variant_id IS NOT NULL THEN
    SELECT iv.price
      INTO v_canonical
    FROM public.item_variants iv
    WHERE iv.id = NEW.variant_id;
    v_source := 'variant';
  END IF;

  IF v_canonical IS NULL THEN
    SELECT mi.base_price
      INTO v_canonical
    FROM public.menu_items mi
    WHERE mi.id = NEW.menu_item_id;
    v_source := 'base';
  END IF;

  IF v_canonical IS NULL OR v_canonical <= 0 THEN
    IF COALESCE(NEW.unit_price, 0) <= 0 AND NEW.manager_override_id IS NULL THEN
      RAISE EXCEPTION 'unit_price (%) is not allowed for menu_item % with no resolvable menu price. A manager override is required for zero/negative prices.', 
        NEW.unit_price, NEW.menu_item_id;
    END IF;
    RETURN NEW;
  END IF;

  v_deviation := ABS(COALESCE(NEW.unit_price, 0) - v_canonical) / v_canonical;

  IF v_deviation > v_tolerance AND NEW.manager_override_id IS NULL THEN
    RAISE EXCEPTION 'unit_price (%) deviates %.0f%% from the % price (%). Deviations over 10%% require manager authorization (rpc_manager_price_override).',
      NEW.unit_price, v_deviation * 100, v_source, v_canonical;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
