-- Debug: Check kitchens, orders and kot_tickets
SELECT id, name FROM kitchens WHERE is_active = true;

SELECT 
    kt.id, 
    kt.kot_number, 
    kt.status, 
    kt.kitchen_id, 
    k.name as kitchen_name,
    o.id as order_id,
    o.order_number,
    o.status as order_status
FROM kot_tickets kt
JOIN kitchens k ON kt.kitchen_id = k.id
JOIN orders o ON kt.order_id = o.id
WHERE o.status != 'pending_waiter'
AND kt.completed_at IS NULL
ORDER BY kt.created_at DESC
LIMIT 10;
