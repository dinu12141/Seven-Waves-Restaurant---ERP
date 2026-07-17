-- ==========================================================================================
-- MERGED TABLE ORDERS & PAYMENT (Consolidating multiple KOTs per table)
-- ==========================================================================================

DROP FUNCTION IF EXISTS merge_table_orders_and_pay(uuid[], text, numeric);

CREATE OR REPLACE FUNCTION merge_table_orders_and_pay(
    p_order_ids uuid[],
    p_payment_method text,
    p_amount_paid numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_count int;
    v_total_amount numeric := 0;
    v_subtotal numeric := 0;
    v_tax_amount numeric := 0;
    v_service_charge numeric := 0;
    v_table_id uuid;
    v_anchor_order_id uuid;
    v_invoice_id uuid;
    v_shift_id uuid;
    v_order record;
    v_success boolean;
    v_message text;
BEGIN
    -- 1. Validate inputs
    IF array_length(p_order_ids, 1) IS NULL OR array_length(p_order_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No orders provided for merging.');
    END IF;

    -- 2. Verify all orders belong to the same table and are unpaid
    FOR v_order IN 
        SELECT id, company_id, branch_id, table_id, payment_status, status, total_amount, subtotal, tax_amount, service_charge 
        FROM orders 
        WHERE id = ANY(p_order_ids)
    LOOP
        IF v_order.payment_status = 'paid' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Order ' || v_order.id || ' is already paid.');
        END IF;
        
        IF v_table_id IS NULL THEN
            v_table_id := v_order.table_id;
            v_anchor_order_id := v_order.id;
        ELSIF v_table_id != v_order.table_id THEN
            -- In rare cases, if they try to merge cross-table, block it
            RETURN jsonb_build_object('success', false, 'error', 'Cannot merge orders from different tables.');
        END IF;

        v_total_amount := v_total_amount + COALESCE(v_order.total_amount, 0);
        v_subtotal := v_subtotal + COALESCE(v_order.subtotal, 0);
        v_tax_amount := v_tax_amount + COALESCE(v_order.tax_amount, 0);
        v_service_charge := v_service_charge + COALESCE(v_order.service_charge, 0);
    END LOOP;

    v_order_count := array_length(p_order_ids, 1);

    -- 3. Check for active shift
    SELECT id INTO v_shift_id 
    FROM pos_shifts 
    WHERE status = 'open' 
      AND branch_id = (SELECT branch_id FROM orders WHERE id = v_anchor_order_id)
    ORDER BY opened_at DESC LIMIT 1;

    IF v_shift_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No active POS shift found.');
    END IF;

    -- 4. Create the consolidated invoice
    INSERT INTO invoices (
        company_id,
        branch_id,
        order_id, 
        subtotal, 
        tax, 
        service_charge, 
        total, 
        payment_status, 
        status
    ) VALUES (
        v_order.company_id,
        v_order.branch_id,
        v_anchor_order_id, 
        v_subtotal, 
        v_tax_amount, 
        v_service_charge, 
        v_total_amount, 
        'paid', 
        'issued'
    ) RETURNING id INTO v_invoice_id;

    -- 4b. Create invoice items by combining all order_items from all merged orders
    INSERT INTO invoice_items (
        invoice_id,
        order_item_id,
        menu_item_name,
        quantity,
        unit_price,
        total_price,
        tax_amount,
        discount_amount
    )
    SELECT
        v_invoice_id,
        oi.id,
        mi.name,
        oi.quantity,
        oi.unit_price,
        oi.total_price,
        0,
        0
    FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE oi.order_id = ANY(p_order_ids);

    -- 5. Record the consolidated payment
    INSERT INTO payments (
        invoice_id,
        payment_method_id,
        amount,
        status
    ) VALUES (
        v_invoice_id,
        (SELECT id FROM payment_methods WHERE name ilike p_payment_method LIMIT 1),
        p_amount_paid, -- they might pay exactly or over, record exactly what was requested for the total
        'completed'
    );

    -- 6. Link all other orders to this same invoice (so KOTs can be traced, though we rely on orderIds in UI)
    -- Update all merged orders to paid
    UPDATE orders 
    SET payment_status = 'paid', 
        status = 'paid', 
        updated_at = now() 
    WHERE id = ANY(p_order_ids);

    -- 7. Free up the table
    IF v_table_id IS NOT NULL THEN
        UPDATE restaurant_tables 
        SET status = 'available'
        WHERE id = v_table_id;
    END IF;

    -- 8. Log the merge transaction
    INSERT INTO audit_logs (action, table_name, record_id, new_data)
    VALUES (
        'merge_and_pay',
        'invoices',
        v_invoice_id,
        jsonb_build_object(
            'table_id', v_table_id,
            'order_ids', p_order_ids,
            'total_amount', v_total_amount
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'order_count', v_order_count
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
