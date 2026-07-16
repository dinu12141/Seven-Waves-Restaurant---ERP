-- =====================================================
-- KOT NUMBER ALIGNMENT (FINAL PRODUCTION VERSION)
-- =====================================================

CREATE OR REPLACE FUNCTION public.trg_fn_set_kot_number_from_order()
RETURNS TRIGGER AS $$
DECLARE
    v_order_number INT;
BEGIN
    -- Get the order_number from the orders table
    SELECT order_number INTO v_order_number
      FROM public.orders
     WHERE id = NEW.order_id;
     
    -- If found, set the kot_number to the order_number
    IF v_order_number IS NOT NULL THEN
        NEW.kot_number := v_order_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and create it
DROP TRIGGER IF EXISTS trg_set_kot_number ON public.kot_tickets;

CREATE TRIGGER trg_set_kot_number
BEFORE INSERT ON public.kot_tickets
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_set_kot_number_from_order();

-- Update existing KOT tickets to match their order_number
UPDATE public.kot_tickets k
   SET kot_number = o.order_number
  FROM public.orders o
 WHERE k.order_id = o.id
   AND k.kot_number IS DISTINCT FROM o.order_number;
