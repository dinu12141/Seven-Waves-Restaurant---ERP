DO $$
DECLARE
    v_cashier_id UUID;
    v_rec RECORD;
BEGIN
    -- 1. Find Cashier Kitchen
    SELECT id INTO v_cashier_id FROM kitchens WHERE name ILIKE '%CASHIER%' LIMIT 1;
    
    RAISE NOTICE '--- CASHIER KITCHEN INFO ---';
    IF v_cashier_id IS NULL THEN
        RAISE NOTICE 'CASHIER Kitchen NOT FOUND!';
    ELSE
        RAISE NOTICE 'ID: %', v_cashier_id;
        
        -- 2. Check for KOTs for this kitchen
        RAISE NOTICE '--- KOT TICKETS FOR CASHIER ---';
        FOR v_rec IN (
            SELECT k.id, k.kot_number, k.status, k.order_id, o.order_number, o.status as order_status
            FROM kot_tickets k
            JOIN orders o ON o.id = k.order_id
            WHERE k.kitchen_id = v_cashier_id
            ORDER BY k.created_at DESC
            LIMIT 10
        ) LOOP
            RAISE NOTICE 'KOT ID: %, No: %, Status: %, Order No: %, Order Status: %', 
                v_rec.id, v_rec.kot_number, v_rec.status, v_rec.order_number, v_rec.order_status;
        END LOOP;
        
        -- 3. Check for order items that SHOULD belong to Cashier but don't have a KOT or wrong kitchen_id
        RAISE NOTICE '--- ORDER ITEMS FOR RECENT PENDING/ACCEPTED ORDERS ---';
        FOR v_rec IN (
            SELECT oi.id, oi.order_id, oi.kitchen_id, oi.status, mi.name as item_name, o.order_number
            FROM order_items oi
            JOIN menu_items mi ON mi.id = oi.menu_item_id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status IN ('pending', 'accepted', 'pending_waiter')
            ORDER BY o.created_at DESC
            LIMIT 20
        ) LOOP
            RAISE NOTICE 'Item: %, Order: %, Status: %, KitchenID: %', 
                v_rec.item_name, v_rec.order_number, v_rec.status, v_rec.kitchen_id;
        END LOOP;
    END IF;
END $$;
