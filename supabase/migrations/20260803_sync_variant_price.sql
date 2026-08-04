-- Migration to synchronize item_variants price when menu_items.base_price is updated

CREATE OR REPLACE FUNCTION trg_sync_base_price_to_variant()
RETURNS TRIGGER AS $$
BEGIN
    -- Only act if the base_price has actually changed
    IF NEW.base_price IS DISTINCT FROM OLD.base_price THEN
        -- Update any variants that had the exact same price as the old base price
        -- This ensures that default variants (like "Regular") are automatically updated
        -- without breaking higher-priced variants (like "Large").
        UPDATE public.item_variants 
        SET price = NEW.base_price 
        WHERE menu_item_id = NEW.id 
          AND price = OLD.base_price;
          
        -- If the item has EXACTLY one active variant, and its price didn't match the old base price,
        -- we might want to update it anyway. But safely, updating matches is best.
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists to allow re-running
DROP TRIGGER IF EXISTS trg_menu_items_base_price_sync ON public.menu_items;

-- Create the trigger
CREATE TRIGGER trg_menu_items_base_price_sync
AFTER UPDATE OF base_price ON public.menu_items
FOR EACH ROW
EXECUTE FUNCTION trg_sync_base_price_to_variant();

-- Manual fix for already out-of-sync variants
-- If an item has exactly ONE active variant, we sync its price to the menu_items.base_price
UPDATE public.item_variants iv
SET price = mi.base_price
FROM public.menu_items mi
WHERE iv.menu_item_id = mi.id
  AND iv.is_active = true
  AND iv.price != mi.base_price
  AND (
    SELECT COUNT(*) 
    FROM public.item_variants iv2 
    WHERE iv2.menu_item_id = mi.id AND iv2.is_active = true
  ) = 1;
