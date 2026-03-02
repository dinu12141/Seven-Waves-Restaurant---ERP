-- =====================================================
-- FIX: generate_kot_on_accept with NULL kitchen_id support
-- Also fixes inventory deduction to happen on KOT completion
-- =====================================================

-- FIX 1: Update generate_kot_on_accept to handle items with NULL kitchen_id
-- Items with no kitchen_id are grouped into the default kitchen KOT
CREATE OR REPLACE FUNCTION generate_kot_on_accept()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_kot_id UUID;
    v_default_kitchen_id UUID;
BEGIN
    -- Fire on: pending → accepted, pending_waiter → accepted
    IF NEW.status = 'accepted' AND OLD.status IN ('pending', 'pending_waiter') THEN

        -- Get a default kitchen for items with no kitchen_id
        SELECT id INTO v_default_kitchen_id
        FROM kitchens
        WHERE branch_id = NEW.branch_id
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        -- 1. Handle items WITH a kitchen_id (one KOT per kitchen)
        FOR r IN
            SELECT DISTINCT kitchen_id
            FROM order_items
            WHERE order_id = NEW.id
              AND kitchen_id IS NOT NULL
              AND status = 'queued'
        LOOP
            -- Idempotency: skip if KOT already exists for this kitchen
            PERFORM 1 FROM kot_tickets 
            WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id;
            
            IF NOT FOUND THEN
                INSERT INTO kot_tickets(order_id, kitchen_id, status)
                VALUES (NEW.id, r.kitchen_id, 'created')
                RETURNING id INTO v_kot_id;

                INSERT INTO kot_items(kot_id, order_item_id, quantity)
                SELECT v_kot_id, oi.id, oi.quantity
                FROM order_items oi
                WHERE oi.order_id = NEW.id
                  AND oi.kitchen_id = r.kitchen_id
                  AND oi.status = 'queued';

                UPDATE order_items
                SET status = 'sent_to_kitchen'
                WHERE order_id = NEW.id
                  AND kitchen_id = r.kitchen_id
                  AND status = 'queued';
            END IF;
        END LOOP;

        -- 2. Handle items WITHOUT a kitchen_id → assign to default kitchen
        IF v_default_kitchen_id IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM order_items 
                WHERE order_id = NEW.id 
                  AND kitchen_id IS NULL 
                  AND status = 'queued'
            ) THEN
                -- Idempotency check
                PERFORM 1 FROM kot_tickets 
                WHERE order_id = NEW.id 
                  AND kitchen_id = v_default_kitchen_id;
                
                IF NOT FOUND THEN
                    INSERT INTO kot_tickets(order_id, kitchen_id, status)
                    VALUES (NEW.id, v_default_kitchen_id, 'created')
                    RETURNING id INTO v_kot_id;

                    INSERT INTO kot_items(kot_id, order_item_id, quantity)
                    SELECT v_kot_id, oi.id, oi.quantity
                    FROM order_items oi
                    WHERE oi.order_id = NEW.id
                      AND oi.kitchen_id IS NULL
                      AND oi.status = 'queued';

                    -- Assign kitchen_id and mark as sent
                    UPDATE order_items
                    SET status = 'sent_to_kitchen',
                        kitchen_id = v_default_kitchen_id
                    WHERE order_id = NEW.id
                      AND kitchen_id IS NULL
                      AND status = 'queued';
                END IF;
            END IF;
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate trigger
DROP TRIGGER IF EXISTS trg_generate_kot ON orders;
CREATE TRIGGER trg_generate_kot
AFTER UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION generate_kot_on_accept();

-- =====================================================
-- FIX 2: Ensure all core tables are in realtime publication
-- =====================================================
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE invoice_items;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE payments;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE order_acceptance;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

ALTER TABLE invoices REPLICA IDENTITY FULL;
ALTER TABLE payments REPLICA IDENTITY FULL;

-- =====================================================
-- FIX 3: Cashier can see orders from 'accepted' status onwards
-- This is already handled in code (statuses array includes 'accepted')
-- But let's make sure the POS also marks orders for billing after KOT
-- =====================================================

-- Update the pending_waiter orders to be visible to cashier immediately after accept
-- The cashier store already fetches: 'accepted', 'preparing', 'ready', 'served', 'invoiced'
-- So this is already correct.

-- =====================================================
-- FIX 4: Inventory deduction should happen on payment (not KOT)
-- The existing trg_deduct_inv_on_pay already does this correctly
-- when payment_status changes to 'paid'
-- Make sure it is present on the DB:
-- =====================================================

CREATE OR REPLACE FUNCTION trg_func_deduct_inv()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM deduct_inv_for_order(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_deduct_inv_on_pay ON orders;
CREATE TRIGGER trg_deduct_inv_on_pay
AFTER UPDATE OF payment_status ON orders
FOR EACH ROW
WHEN (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
EXECUTE FUNCTION trg_func_deduct_inv();
