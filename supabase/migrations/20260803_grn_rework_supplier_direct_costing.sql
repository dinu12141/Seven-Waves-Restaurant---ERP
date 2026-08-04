-- ═══════════════════════════════════════════════════════════════════════════
-- GRN Rework: Supplier-Direct GRN + Accurate Invoice-Based Costing
-- (designnew.md Section 5 — confirmed decisions, 2026-08-02)
--
-- 1. Removes the naive 2-point running-average update of items.avg_cost from
--    post_goods_receipt() — each GRN now keeps its own actual invoice price
--    completely unchanged (no smoothing at receipt time). last_purchase_price
--    is still updated on every GRN post (that's just "most recent price").
--
-- 2. The PO auto-close-on-full-receipt / purchase_order_lines.received_qty
--    increment logic in post_goods_receipt() already guards on
--    `v_line.po_line_id IS NOT NULL` and `NEW.po_id IS NOT NULL` — verified
--    in the live function body (procurement.sql lines ~671-739). Since new
--    GRNs (client: GRNPage.vue) no longer write po_id/po_line_id, these
--    blocks simply no-op for all new GRNs going forward. Historical GRNs
--    that already carry a po_line_id continue to work unchanged if ever
--    replayed (e.g. cancel/reverse). No further guard needed — this
--    migration re-confirms the guard exists via CREATE OR REPLACE.
--
-- 3. New function fn_recompute_monthly_avg_cost(p_month DATE DEFAULT NULL):
--    quantity-weighted average of items.avg_cost over a calendar month's
--    POSTED goods receipts, run:
--      a) automatically via pg_cron on the 1st of every month (recomputes
--         the PREVIOUS month, matching the existing process_attendance_logs
--         cron idiom in biometric_integration.sql), and
--      b) on-demand via the "Recalculate Average Cost Now" button in
--         SuppliersPage.vue (gated by procurement.suppliers.edit).
--    Items with zero GRNs in the target month are left untouched (avg_cost
--    carries forward) — the UPDATE...FROM subquery only touches items
--    present in that month's posted GRN lines.
--
-- Schema verified against procurement.sql before writing this migration:
--   goods_receipts.status        TEXT ('draft'|'posted'|'cancelled')
--   goods_receipts.doc_date      DATE NOT NULL DEFAULT CURRENT_DATE
--   goods_receipt_lines.quantity NUMERIC(14,4)
--   goods_receipt_lines.unit_cost NUMERIC(14,4)
--   goods_receipt_lines.item_id  UUID NOT NULL REFERENCES items(id)
--   goods_receipt_lines.grn_id   UUID NOT NULL REFERENCES goods_receipts(id)
--
-- NOT YET APPLIED LIVE — apply via Supabase Management API / MCP after
-- human/orchestrator review, per CLAUDE.md's documented SQL-apply workflow.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1 & 2. post_goods_receipt() — remove naive avg_cost averaging block.
--        (PO auto-close / received_qty blocks are re-asserted unchanged;
--         they already guard on po_line_id / po_id IS NOT NULL.)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION post_goods_receipt()
RETURNS TRIGGER AS $$
DECLARE
    v_line RECORD;
    v_wh_id UUID;
    v_all_received BOOLEAN;
BEGIN
    -- POSTING: draft → posted
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN

        NEW.posted_at := now();

        FOR v_line IN
            SELECT * FROM goods_receipt_lines WHERE grn_id = NEW.id
        LOOP
            v_wh_id := COALESCE(v_line.warehouse_id, NEW.warehouse_id);

            -- Update stock_on_hand
            INSERT INTO stock_on_hand (company_id, warehouse_id, item_id, qty_on_hand, total_value, last_movement_at)
            VALUES (NEW.company_id, v_wh_id, v_line.item_id, v_line.quantity, v_line.quantity * v_line.unit_cost, now())
            ON CONFLICT (warehouse_id, item_id)
            DO UPDATE SET
                qty_on_hand = stock_on_hand.qty_on_hand + EXCLUDED.qty_on_hand,
                total_value = stock_on_hand.total_value + EXCLUDED.total_value,
                last_movement_at = now(),
                updated_at = now();

            -- Insert inventory ledger entry
            INSERT INTO inventory_ledger (
                company_id, branch_id, warehouse_id, item_id,
                document_id, doc_type, doc_number,
                direction, quantity, unit_cost, total_cost,
                batch_no, expiry_date, posted_by
            ) VALUES (
                NEW.company_id, NEW.branch_id, v_wh_id, v_line.item_id,
                NEW.id, 'GRN', NEW.doc_number,
                'IN', v_line.quantity, v_line.unit_cost, v_line.quantity * v_line.unit_cost,
                v_line.batch_no, v_line.expiry_date, NEW.posted_by
            );

            -- Update item last purchase price ONLY.
            -- avg_cost is NO LONGER touched here — per confirmed design
            -- (designnew.md Section 5), avg_cost is exclusively owned by
            -- the monthly fn_recompute_monthly_avg_cost() batch job below.
            -- Each GRN's own unit_cost is preserved untouched (no smoothing
            -- at receipt time), e.g. 150 today, 250 tomorrow, no interference.
            IF v_line.unit_cost > 0 THEN
                UPDATE items SET
                    last_purchase_price = v_line.unit_cost
                WHERE id = v_line.item_id;
            END IF;

            -- Update PO line received_qty — guarded: no-ops for supplier-direct
            -- GRNs (po_line_id IS NULL), which is now the only GRN creation
            -- path going forward. Kept for historical GRNs still linked to a PO.
            IF v_line.po_line_id IS NOT NULL THEN
                UPDATE purchase_order_lines
                SET received_qty = received_qty + v_line.quantity
                WHERE id = v_line.po_line_id;
            END IF;
        END LOOP;

        -- Update PO status — guarded: no-ops for supplier-direct GRNs
        -- (NEW.po_id IS NULL), which is now the only GRN creation path
        -- going forward. PO status ('open'/'partial'/'closed') is now a
        -- manual action in PurchaseOrdersPage.vue for all new GRNs; this
        -- block remains only for historical PO-linked GRNs (e.g. re-posting
        -- old drafts) so it doesn't regress existing data.
        IF NEW.po_id IS NOT NULL THEN
            SELECT NOT EXISTS (
                SELECT 1 FROM purchase_order_lines
                WHERE po_id = NEW.po_id AND open_qty > 0
            ) INTO v_all_received;

            IF v_all_received THEN
                UPDATE purchase_orders SET status = 'closed', closed_at = now()
                WHERE id = NEW.po_id AND status IN ('open','partial','approved');
            ELSE
                UPDATE purchase_orders SET status = 'partial'
                WHERE id = NEW.po_id AND status IN ('open','approved');
            END IF;
        END IF;

    -- CANCELLATION: posted → cancelled
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'posted' THEN

        NEW.cancelled_at := now();

        FOR v_line IN
            SELECT * FROM goods_receipt_lines WHERE grn_id = NEW.id
        LOOP
            v_wh_id := COALESCE(v_line.warehouse_id, NEW.warehouse_id);

            -- Reverse stock
            UPDATE stock_on_hand SET
                qty_on_hand = GREATEST(0, qty_on_hand - v_line.quantity),
                total_value = GREATEST(0, total_value - (v_line.quantity * v_line.unit_cost)),
                last_movement_at = now(),
                updated_at = now()
            WHERE warehouse_id = v_wh_id AND item_id = v_line.item_id;

            -- Reverse ledger
            INSERT INTO inventory_ledger (
                company_id, branch_id, warehouse_id, item_id,
                document_id, doc_type, doc_number,
                direction, quantity, unit_cost, total_cost, posted_by
            ) VALUES (
                NEW.company_id, NEW.branch_id, v_wh_id, v_line.item_id,
                NEW.id, 'CANCEL_GRN', NEW.doc_number || '-REV',
                'OUT', v_line.quantity, v_line.unit_cost, v_line.quantity * v_line.unit_cost, NEW.posted_by
            );

            -- Reverse PO received_qty (guarded — no-op for supplier-direct GRNs)
            IF v_line.po_line_id IS NOT NULL THEN
                UPDATE purchase_order_lines
                SET received_qty = GREATEST(0, received_qty - v_line.quantity)
                WHERE id = v_line.po_line_id;
            END IF;
        END LOOP;

        -- Re-open PO (guarded — no-op for supplier-direct GRNs)
        IF NEW.po_id IS NOT NULL THEN
            UPDATE purchase_orders SET status = 'open', closed_at = NULL
            WHERE id = NEW.po_id AND status IN ('closed','partial');
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger definition unchanged (BEFORE UPDATE OF status), re-asserted for safety.
DROP TRIGGER IF EXISTS trg_post_grn ON goods_receipts;
CREATE TRIGGER trg_post_grn
BEFORE UPDATE OF status ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION post_goods_receipt();

COMMENT ON FUNCTION post_goods_receipt() IS
  'GRN post/cancel trigger. avg_cost is NOT updated here (removed 2026-08-03 per designnew.md Section 5) — '
  'items.avg_cost is exclusively recomputed monthly by fn_recompute_monthly_avg_cost(). '
  'last_purchase_price is still updated per-GRN. PO auto-close/received_qty blocks are dead code for new '
  'supplier-direct GRNs (po_id/po_line_id are NULL) but remain guarded and functional for historical PO-linked GRNs.';


-- ─────────────────────────────────────────────────────────────────────────
-- 3. fn_recompute_monthly_avg_cost(p_month DATE DEFAULT NULL)
--    Quantity-weighted average of items.avg_cost across a calendar month's
--    POSTED goods receipts. Defaults to the previous calendar month when
--    called with no argument (the scheduled cron use case); pass an
--    explicit date to recompute a specific month (the manual "Recalculate
--    Now" trigger use case — any day within the target month works, since
--    date_trunc('month', ...) normalizes it).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_recompute_monthly_avg_cost(p_month DATE DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target_month DATE := date_trunc('month', COALESCE(p_month, (CURRENT_DATE - INTERVAL '1 month')))::date;
  v_updated_count INTEGER := 0;
BEGIN
  -- SECURITY: this function is GRANTed to `authenticated` (not PUBLIC) so the
  -- pg_cron scheduled call above works without a session/JWT context, but
  -- that means any logged-in user could otherwise call it directly via
  -- supabase.rpc() and force a company-wide cost recompute (touches every
  -- item's costing basis, which feeds financial reporting). Gate to
  -- admin/manager/procurement/inventory roles; pg_cron's internal invocation
  -- runs as the function owner (SECURITY DEFINER), not through PostgREST/JWT,
  -- so auth.uid() is NULL there — allow that case through explicitly.
  IF auth.uid() IS NOT NULL
     AND NOT (is_admin() OR is_manager() OR is_inventory() OR auth_has_role('procurement')) THEN
    RAISE EXCEPTION 'Only admin, manager, inventory, or procurement roles can recompute average cost';
  END IF;

  UPDATE items i SET
    avg_cost = sub.weighted_avg,
    updated_at = now()
  FROM (
    SELECT gl.item_id,
           SUM(gl.quantity * gl.unit_cost) / NULLIF(SUM(gl.quantity), 0) AS weighted_avg
    FROM goods_receipt_lines gl
    JOIN goods_receipts gr ON gr.id = gl.grn_id
    WHERE gr.status = 'posted'
      AND date_trunc('month', gr.doc_date) = v_target_month
    GROUP BY gl.item_id
    HAVING SUM(gl.quantity) > 0
  ) sub
  WHERE i.id = sub.item_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_recompute_monthly_avg_cost(DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_recompute_monthly_avg_cost(DATE) IS
  'Task: GRN Rework (designnew.md Section 5). Recomputes items.avg_cost FROM SCRATCH for the given calendar '
  'month using that month''s POSTED goods_receipt_lines, quantity-weighted. Items with zero GRNs that month '
  'are left untouched (avg_cost carries forward). Defaults to the previous calendar month when p_month is '
  'NULL (scheduled cron use case). Called manually via supabase.rpc(''fn_recompute_monthly_avg_cost'', '
  '{ p_month }) from Procurement > Suppliers > "Recalculate Average Cost Now" (gated by '
  'procurement.suppliers.edit), and automatically via pg_cron on the 1st of each month.';


-- ─────────────────────────────────────────────────────────────────────────
-- 4. pg_cron schedule — run on the 1st of each month, matching the
--    existing process_attendance_logs cron idiom (biometric_integration.sql).
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove any prior schedule with this name before re-adding (idempotent).
        PERFORM cron.unschedule('fn_recompute_monthly_avg_cost_job')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fn_recompute_monthly_avg_cost_job');

        PERFORM cron.schedule(
            'fn_recompute_monthly_avg_cost_job',
            '0 1 1 * *',  -- 01:00 on the 1st of every month
            'SELECT public.fn_recompute_monthly_avg_cost()'
        );
        RAISE NOTICE '[CRON] Scheduled fn_recompute_monthly_avg_cost_job (monthly, 1st @ 01:00)';
    ELSE
        RAISE NOTICE '[CRON] pg_cron extension not installed — skipped scheduling fn_recompute_monthly_avg_cost_job. Run it manually via the RPC or enable pg_cron.';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[CRON] Could not schedule fn_recompute_monthly_avg_cost_job: %', SQLERRM;
END $$;
