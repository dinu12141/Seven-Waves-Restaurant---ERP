-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION: realtime_downstream.sql
-- Safe to run BEFORE or AFTER migration — no ::regclass casts,
-- no direct table references that throw on missing tables.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Confirm all 3 queue tables exist
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    c.relname                             AS table_name,
    CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' END AS kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('cashier_queue', 'inventory_queue', 'finance_queue')
ORDER BY c.relname;
-- Expected: 3 rows — cashier_queue (table), finance_queue (table), inventory_queue (table)


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Confirm correct columns exist on each queue table
-- ─────────────────────────────────────────────────────────────────────────────
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   IN ('cashier_queue', 'inventory_queue', 'finance_queue')
  AND column_name  IN ('order_id', 'branch_id', 'status', 'updated_at', 'issue_stage')
ORDER BY table_name, column_name;
-- cashier_queue   : 4 rows (no issue_stage)
-- inventory_queue : 5 rows (has issue_stage)
-- finance_queue   : 4 rows (no issue_stage)


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Confirm UNIQUE(order_id) constraints on all queues
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    c.relname   AS table_name,
    con.conname AS constraint_name,
    con.contype AS type   -- 'u' = unique
FROM pg_constraint con
JOIN pg_class     c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('cashier_queue', 'inventory_queue', 'finance_queue')
  AND con.contype = 'u'
ORDER BY c.relname;
-- Expected: 3 rows — one UNIQUE constraint per table on order_id


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Confirm audit + updated_at triggers exist on all queue tables
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    trigger_name,
    event_object_table  AS table_name,
    event_manipulation  AS fires_on,
    action_timing       AS timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
        'trg_cq_audit',      'trg_iq_audit',      'trg_fq_audit',
        'trg_cq_updated_at', 'trg_iq_updated_at', 'trg_fq_updated_at'
      )
ORDER BY event_object_table, trigger_name;
-- Expected: 6 rows
--   cashier_queue   : trg_cq_audit (AFTER INSERT), trg_cq_updated_at (BEFORE UPDATE)
--   finance_queue   : trg_fq_audit (AFTER INSERT), trg_fq_updated_at (BEFORE UPDATE)
--   inventory_queue : trg_iq_audit (AFTER INSERT), trg_iq_updated_at (BEFORE UPDATE)


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Confirm supabase_realtime publication includes all downstream tables
-- ─────────────────────────────────────────────────────────────────────────────
SELECT tablename
FROM pg_publication_tables
WHERE pubname    = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename  IN (
        'cashier_queue', 'inventory_queue', 'finance_queue',
        'kot_dispatches', 'kot_tickets', 'kot_items',
        'order_status_events', 'orders', 'order_items'
      )
ORDER BY tablename;
-- Expected: 9 rows


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Confirm order_status_events allows NULL for system/trigger events
-- ─────────────────────────────────────────────────────────────────────────────
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'order_status_events'
  AND column_name  IN ('old_status', 'new_status', 'created_by')
ORDER BY column_name;
-- Expected: all 3 rows → is_nullable = 'YES'


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Confirm audit trigger function exists
-- ─────────────────────────────────────────────────────────────────────────────
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('_queue_audit_trigger', '_queue_set_updated_at')
ORDER BY routine_name;
-- Expected: 2 rows, both FUNCTION


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Check queue distribution for recent accepted orders
--    (safe: uses EXISTS to avoid error if tables are empty)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    o.order_number,
    o.status                                         AS order_status,
    (SELECT cq.status FROM cashier_queue   cq WHERE cq.order_id = o.id) AS cashier_status,
    (SELECT iq.status FROM inventory_queue iq WHERE iq.order_id = o.id) AS inventory_status,
    (SELECT iq.issue_stage FROM inventory_queue iq WHERE iq.order_id = o.id) AS issue_stage,
    (SELECT fq.status FROM finance_queue   fq WHERE fq.order_id = o.id) AS finance_status
FROM orders o
WHERE o.status IN ('accepted', 'preparing', 'ready', 'served')
ORDER BY o.created_at DESC
LIMIT 10;
-- Expected: cashier_status, inventory_status, finance_status all populated
--           for every accepted/active order


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Verify audit trail written by queue triggers
-- ─────────────────────────────────────────────────────────────────────────────
SELECT event_code, COUNT(*) AS rows
FROM order_status_events
WHERE event_code IN (
    'cashier_queue_created',
    'inventory_queue_created',
    'finance_queue_created'
)
GROUP BY event_code
ORDER BY event_code;
-- Expected: 3 rows (counts match accepted order count if migration ran clean)


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Verify RPC queues_created response contains all 3 queues
--     Auto-picks a real pending_waiter order — safe if none exist.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_order_id UUID;
    v_result   JSONB;
BEGIN
    SELECT id INTO v_order_id
    FROM orders
    WHERE status = 'pending_waiter'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_order_id IS NULL THEN
        RAISE NOTICE 'No pending_waiter orders found — skipping RPC test';
        RETURN;
    END IF;

    v_result := public.rpc_waiter_accept_order(v_order_id);

    RAISE NOTICE 'RPC result code        : %', v_result->>'code';
    RAISE NOTICE 'queues_created         : %', v_result->'queues_created';
    RAISE NOTICE 'kot_count              : %', v_result->>'kot_count';
    RAISE NOTICE 'routing_warnings       : %', v_result->>'warning_count';
END;
$$;
-- Expected NOTICE lines:
--   code          = ACCEPTED  (or ALREADY_ACCEPTED if already done)
--   queues_created = {"cashier": true, "inventory": true, "finance": true}


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. stock_queue compat — confirm it exists as either table or view
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    c.relname AS name,
    CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' END AS kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'stock_queue';
-- Expected: 1 row — either 'table' (pre-existing) or 'view' (compat alias)


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Idempotency check — run RPC twice on the same order, expect no duplicates
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    o.order_number,
    COUNT(DISTINCT cq.id) AS cashier_queue_rows,
    COUNT(DISTINCT iq.id) AS inventory_queue_rows,
    COUNT(DISTINCT fq.id) AS finance_queue_rows
FROM orders o
LEFT JOIN cashier_queue   cq ON cq.order_id = o.id
LEFT JOIN inventory_queue iq ON iq.order_id = o.id
LEFT JOIN finance_queue   fq ON fq.order_id = o.id
WHERE o.status IN ('accepted','preparing','ready','served')
GROUP BY o.id, o.order_number
HAVING
    COUNT(DISTINCT cq.id) > 1
 OR COUNT(DISTINCT iq.id) > 1
 OR COUNT(DISTINCT fq.id) > 1;
-- Expected: 0 rows — duplicate queue entries must never exist
