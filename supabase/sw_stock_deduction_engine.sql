-- ═══════════════════════════════════════════════════════════════════════════
-- SW STOCK DEDUCTION ENGINE — single source of truth for BOM stock deduction
-- Seven Waves Restaurant ERP
--
-- PROBLEM this fixes: bill/payment was not reducing ingredient stock. Live audit
-- found (a) stock_movements had 0 rows ever, (b) 6+ competing dead triggers all
-- reading EMPTY tables (inventory_bom, stock_levels, ...), (c) authoritative
-- on-hand is public.stock_on_hand keyed (warehouse_id, item_id), (d) each kitchen
-- maps to its own store via warehouses.kitchen_id, (e) recipes live in
-- recipes + recipe_items (recipe_items.item_id = stock_on_hand.item_id).
--
-- DESIGN: on order payment (payment_status → 'paid'), for every order_item expand
-- its recipe and deduct each ingredient from the on-hand of the ITEM'S OWN KITCHEN
-- warehouse (warehouses.kitchen_id = order_item.kitchen_id), logging stock_movements.
-- Idempotent per order. Falls back to the branch default warehouse if a kitchen
-- has no store. The 6 legacy deduction triggers are DISABLED so this is the only
-- path (they were no-ops anyway; disabling prevents future double-deduction).
--
-- NOTE (data): only menu items that HAVE a recipe (recipes + recipe_items) will
-- deduct — items without a recipe have nothing to deduct. Define recipes per menu
-- item for deduction to occur.
-- ═══════════════════════════════════════════════════════════════════════════

-- Dedicated, clean audit trail for sale deductions (decoupled from the legacy
-- stores-based stock_movements and the document-based inventory_ledger).
CREATE TABLE IF NOT EXISTS public.sw_stock_deductions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    item_id      uuid NOT NULL,
    qty_required numeric NOT NULL,
    qty_deducted numeric NOT NULL,
    is_short     boolean NOT NULL DEFAULT false,
    company_id   uuid,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sw_stock_deductions_order ON public.sw_stock_deductions(order_id);
ALTER TABLE public.sw_stock_deductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sw_sd_read ON public.sw_stock_deductions;
CREATE POLICY sw_sd_read ON public.sw_stock_deductions FOR SELECT TO authenticated USING (true);


CREATE OR REPLACE FUNCTION public.sw_deduct_stock_for_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company uuid;
    v_branch  uuid;
    v_lines   int := 0;
    v_skipped_no_wh int := 0;
    r  record;
    v_wh    uuid;
    v_qty   numeric;
    v_avail numeric;
    v_deduct numeric;
    v_short int := 0;
BEGIN
    SELECT company_id, branch_id INTO v_company, v_branch
      FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Idempotency: never deduct the same order twice.
    IF EXISTS (SELECT 1 FROM public.sw_stock_deductions WHERE order_id = p_order_id) THEN
        RETURN jsonb_build_object('success', true, 'already_deducted', true);
    END IF;

    FOR r IN
        SELECT oi.kitchen_id,
               oi.quantity::numeric              AS order_qty,
               ri.item_id,
               ri.qty_per_serving::numeric        AS per_serving,
               COALESCE(ri.wastage_percent,0)::numeric AS wastage
          FROM public.order_items oi
          JOIN public.recipes      rec ON rec.menu_item_id = oi.menu_item_id
          JOIN public.recipe_items ri  ON ri.recipe_id      = rec.id
         WHERE oi.order_id = p_order_id
    LOOP
        -- Resolve the kitchen's own store; else the branch default warehouse.
        v_wh := NULL;
        IF r.kitchen_id IS NOT NULL THEN
            SELECT id INTO v_wh FROM public.warehouses
             WHERE kitchen_id = r.kitchen_id AND branch_id = v_branch AND is_active
             ORDER BY is_default DESC LIMIT 1;
        END IF;
        IF v_wh IS NULL THEN
            SELECT id INTO v_wh FROM public.warehouses
             WHERE branch_id = v_branch AND is_default AND is_active LIMIT 1;
        END IF;
        IF v_wh IS NULL THEN
            v_skipped_no_wh := v_skipped_no_wh + 1;
            CONTINUE;
        END IF;

        v_qty := r.order_qty * r.per_serving * (1 + r.wastage/100.0);
        IF v_qty IS NULL OR v_qty = 0 THEN CONTINUE; END IF;

        -- Lock the on-hand row and clamp the deduction to what is available, so a
        -- stock shortfall can NEVER abort the sale (chk_no_negative_stock forbids
        -- negatives). With correct recipe quantities this deducts the exact amount.
        SELECT qty_on_hand INTO v_avail
          FROM public.stock_on_hand
         WHERE warehouse_id = v_wh AND item_id = r.item_id
         FOR UPDATE;

        IF v_avail IS NULL THEN
            -- Item not stocked in this store yet: create a zero row, nothing to deduct.
            INSERT INTO public.stock_on_hand
                (company_id, warehouse_id, item_id, qty_on_hand, last_movement_at, updated_at)
            VALUES (v_company, v_wh, r.item_id, 0, now(), now())
            ON CONFLICT DO NOTHING;
            v_avail := 0;
        END IF;

        v_deduct := LEAST(v_qty, GREATEST(v_avail, 0));
        IF v_deduct < v_qty THEN v_short := v_short + 1; END IF;
        IF v_deduct <= 0 THEN CONTINUE; END IF;

        UPDATE public.stock_on_hand
           SET qty_on_hand      = qty_on_hand - v_deduct,
               last_movement_at = now(),
               updated_at       = now()
         WHERE warehouse_id = v_wh AND item_id = r.item_id;

        -- Audit trail (required vs actually deducted; short = stock shortfall).
        INSERT INTO public.sw_stock_deductions
            (order_id, warehouse_id, item_id, qty_required, qty_deducted, is_short, company_id)
        VALUES (p_order_id, v_wh, r.item_id, v_qty, v_deduct, (v_deduct < v_qty), v_company);

        v_lines := v_lines + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true,
        'lines_deducted', v_lines, 'skipped_no_warehouse', v_skipped_no_wh);
END;
$$;

REVOKE ALL ON FUNCTION public.sw_deduct_stock_for_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sw_deduct_stock_for_order(uuid) TO authenticated;
COMMENT ON FUNCTION public.sw_deduct_stock_for_order(uuid) IS
  'Single source of truth: deduct recipe ingredients from the order item''s kitchen store on payment. Idempotent per order.';


-- ── Trigger: deduct once when an order becomes paid ─────────────────────────
CREATE OR REPLACE FUNCTION public.sw_trg_deduct_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (NEW.payment_status = 'paid' AND COALESCE(OLD.payment_status,'') <> 'paid')
       OR (NEW.status = 'paid' AND COALESCE(OLD.status,'') <> 'paid') THEN
        PERFORM public.sw_deduct_stock_for_order(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sw_deduct_on_paid ON public.orders;
CREATE TRIGGER trg_sw_deduct_on_paid
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.sw_trg_deduct_on_paid();


-- ── Disable the legacy competing deduction triggers (all no-ops today) ──────
ALTER TABLE public.orders      DISABLE TRIGGER trg_stock_on_order_accept;
ALTER TABLE public.orders      DISABLE TRIGGER trg_stock_on_order_paid;
ALTER TABLE public.kot_tickets DISABLE TRIGGER trg_auto_stock_deduct;
ALTER TABLE public.kot_tickets DISABLE TRIGGER trg_stock_on_kot_preparing;
ALTER TABLE public.invoices    DISABLE TRIGGER trg_invoice_bom_deduct;
ALTER TABLE public.invoices    DISABLE TRIGGER trg_invoice_status_stock_deduct;
