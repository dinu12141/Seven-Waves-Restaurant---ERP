-- ═══════════════════════════════════════════════════════════════════════════
-- FEATURE: Expire QR Customer Sessions on Bill Payment
-- Seven Waves Restaurant ERP
--
-- Safely clears out active QR sessions (from personal phones) as soon as 
-- the table's bill is closed/paid. This prevents customers from retaining 
-- remote access to order after they leave the restaurant.
-- 
-- NOTE: Fixed iPads/Tablets (where device_id IS NOT NULL) are exempt from 
-- this, so staff don't have to re-login the device after every customer.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sw_trg_expire_qr_sessions_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if the order was just marked as paid
    IF (NEW.payment_status = 'paid' AND COALESCE(OLD.payment_status,'') <> 'paid')
       OR (NEW.status = 'paid' AND COALESCE(OLD.status,'') <> 'paid') THEN
       
       -- If the order belongs to a table
       IF NEW.table_id IS NOT NULL THEN
           -- Expire only QR sessions (device_id IS NULL) on that table
           UPDATE public.customer_sessions
           SET status = 'expired',
               last_activity_at = now()
           WHERE table_id = NEW.table_id
             AND status = 'active'
             AND device_id IS NULL;
       END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sw_expire_qr_sessions_on_paid ON public.orders;
CREATE TRIGGER trg_sw_expire_qr_sessions_on_paid
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.sw_trg_expire_qr_sessions_on_paid();
