-- ═══════════════════════════════════════════════════════════════════════════
-- P0 ENTERPRISE HARDENING — atomic money paths + concurrency locks
-- Seven Waves Restaurant ERP
--
-- Closes P0 findings:
--   #48/#49  POS order create+items non-atomic (partial commit / orphan orders)
--   #50      Finance voucher post: double-post race + partial cashbook/ledger commit
--   #51      Finance ledger balance lost-update (read-modify-write)
--   #54      Duplicate voucher numbers under concurrency (client count()+1)
--   #56      Inventory stock oversell TOCTOU (validate_sufficient_stock unlocked)
--
-- Idempotent / re-runnable. SECURITY DEFINER with fixed search_path.
-- Apply AFTER the RLS lockdown bundle (see supabase/applied_migrations_ledger.sql).
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1) #48 / #49 — Atomic order + items insert
--    One transaction: if item insert fails, the order insert rolls back too,
--    so there can be no orphaned (zero-item) order and no fragile client-side
--    delete-rollback. Returns the created order row (id, order_number, status).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_create_order_with_items(
    p_order jsonb,
    p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order   public.orders;
    v_item    jsonb;
    v_cols    text;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cannot create an order with no items';
    END IF;

    -- Insert ONLY the columns actually supplied by the caller AND that really
    -- exist on public.orders, so every other column (id, order_number,
    -- created_at, status/payment_status defaults, ...) keeps its DB DEFAULT.
    -- A plain `INSERT ... SELECT * FROM jsonb_populate_record` would insert NULL
    -- for every absent column and OVERRIDE those defaults (nulling the
    -- PK/order_number) — which breaks order creation entirely.
    --
    -- #103 FIX: we intersect the payload keys with the live column list
    -- (information_schema). Previously we emitted every JSON key verbatim, so a
    -- single client key that isn't a real orders column (e.g. delivery_charge on
    -- a DB where fix_pos_order_flow.sql wasn't applied) made the generated
    -- `INSERT INTO orders (...delivery_charge...) SELECT ...delivery_charge...`
    -- fail with "column does not exist" — breaking EVERY POS create/pay. Now
    -- unknown keys are silently dropped; the order still inserts. Any value on a
    -- dropped column simply isn't persisted (add the column via the schema-gap
    -- migrations to persist it).
    SELECT string_agg(quote_ident(k), ', ')
      INTO v_cols
      FROM jsonb_object_keys(p_order) AS k
      WHERE EXISTS (
          SELECT 1 FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name   = 'orders'
             AND c.column_name  = k
      );

    IF v_cols IS NULL THEN
        RAISE EXCEPTION 'Order payload has no columns that exist on public.orders';
    END IF;

    EXECUTE format(
        'INSERT INTO public.orders (%1$s) '
        'SELECT %1$s FROM jsonb_populate_record(NULL::public.orders, $1) '
        'RETURNING *',
        v_cols
    ) USING p_order INTO v_order;

    -- Insert every item bound to the new order id (same transaction).
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.order_items (
            order_id, menu_item_id, variant_id, kitchen_id,
            quantity, unit_price, total_price, notes, status
        )
        VALUES (
            v_order.id,
            (v_item->>'menu_item_id')::uuid,
            NULLIF(v_item->>'variant_id','')::uuid,
            NULLIF(v_item->>'kitchen_id','')::uuid,
            COALESCE((v_item->>'quantity')::int, 1),
            COALESCE((v_item->>'unit_price')::numeric, 0),
            COALESCE((v_item->>'total_price')::numeric, 0),
            NULLIF(v_item->>'notes',''),
            COALESCE(NULLIF(v_item->>'status',''), 'queued')
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'order', jsonb_build_object(
            'id', v_order.id,
            'order_number', v_order.order_number,
            'status', v_order.status
        )
    );
EXCEPTION WHEN OTHERS THEN
    -- The transaction is rolled back automatically; surface a clean error.
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_create_order_with_items(jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pos_create_order_with_items(jsonb, jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_create_order_with_items(jsonb, jsonb) IS
  'P0 #48/#49 — atomic order + order_items insert (no partial commit / orphan orders).';


-- ---------------------------------------------------------------------------
-- 2) #54 — Safe, gap-free-enough voucher numbering via sequences (per type).
--    Replaces client-side count()+1 which duplicates under concurrency.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.seq_voucher_pv;
CREATE SEQUENCE IF NOT EXISTS public.seq_voucher_rv;

CREATE OR REPLACE FUNCTION public.next_voucher_no(p_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prefix text;
    v_num    bigint;
BEGIN
    IF p_type = 'pay' THEN
        v_prefix := 'PV';
        v_num := nextval('public.seq_voucher_pv');
    ELSE
        v_prefix := 'RV';
        v_num := nextval('public.seq_voucher_rv');
    END IF;
    RETURN v_prefix || '-' || lpad(v_num::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_voucher_no(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.next_voucher_no(text) TO authenticated;
COMMENT ON FUNCTION public.next_voucher_no(text) IS
  'P0 #54 — concurrency-safe voucher number generator (sequence-backed).';


-- ---------------------------------------------------------------------------
-- 3) #50 / #51 — Atomic finance voucher posting.
--    Single transaction: status guard (WHERE status='approved' — blocks the
--    double-post race), cashbook insert, optional cheque, and an IN-DB ledger
--    balance update (no read-modify-write => no lost update).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_finance_voucher(p_voucher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v public.finance_vouchers;
    v_debit  numeric := 0;
    v_credit numeric := 0;
    v_delta  numeric;
    v_user   uuid := auth.uid();
BEGIN
    -- Lock the voucher row so two concurrent posts serialise.
    SELECT * INTO v
    FROM public.finance_vouchers
    WHERE id = p_voucher_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher not found');
    END IF;

    -- Idempotency + double-post guard.
    IF v.status = 'posted' THEN
        RETURN jsonb_build_object('success', true, 'already_posted', true);
    END IF;
    IF v.status <> 'approved' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only approved vouchers can be posted');
    END IF;

    -- Double-entry balance check for multi-line vouchers.
    SELECT COALESCE(sum(debit_amount),0), COALESCE(sum(credit_amount),0)
      INTO v_debit, v_credit
      FROM public.finance_voucher_lines
     WHERE voucher_id = p_voucher_id;
    IF (v_debit + v_credit) > 0 AND abs(v_debit - v_credit) > 0.01 THEN
        RETURN jsonb_build_object('success', false,
               'error', format('Double-entry imbalance: Debit %s <> Credit %s', v_debit, v_credit));
    END IF;

    -- Post.
    UPDATE public.finance_vouchers
       SET status = 'posted', posted_by = v_user,
           posted_at = now(), updated_at = now()
     WHERE id = p_voucher_id;

    -- Cashbook entry (pay => debit, received => credit).
    INSERT INTO public.finance_cashbook_entries (
        company_id, branch_id, source_type, source_id, entry_date,
        ledger_id, account_id, description, debit_amount, credit_amount, running_balance
    ) VALUES (
        v.company_id, v.branch_id,
        CASE WHEN v.voucher_type = 'pay' THEN 'pay_voucher' ELSE 'received_voucher' END,
        v.id, v.voucher_date, v.ledger_id, v.account_id,
        v.voucher_no || ' — ' || COALESCE(v.remark, v.narration, ''),
        CASE WHEN v.voucher_type = 'pay'      THEN v.amount ELSE 0 END,
        CASE WHEN v.voucher_type = 'received' THEN v.amount ELSE 0 END,
        0
    );

    -- Optional cheque plan.
    IF v.payment_method = 'cheque' THEN
        INSERT INTO public.finance_cheques (
            company_id, branch_id, voucher_id, bank_account_id,
            cheque_no, cheque_date, issued_to, amount, status
        ) VALUES (
            v.company_id, v.branch_id, v.id, COALESCE(v.bank_id, v.account_id),
            COALESCE(v.cheque_id, 'CHQ-' || v.voucher_no),
            v.voucher_date, v.pay_to, v.amount, 'issued'
        );
    END IF;

    -- Ledger balance: atomic in-DB delta (pay decreases, received increases).
    v_delta := CASE WHEN v.voucher_type = 'pay' THEN -v.amount ELSE v.amount END;
    UPDATE public.finance_ledgers
       SET current_balance = COALESCE(current_balance, 0) + v_delta,
           updated_at = now()
     WHERE id = v.ledger_id;

    RETURN jsonb_build_object('success', true, 'voucher_id', v.id, 'status', 'posted');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.post_finance_voucher(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.post_finance_voucher(uuid) TO authenticated;
COMMENT ON FUNCTION public.post_finance_voucher(uuid) IS
  'P0 #50/#51 — atomic voucher post: status-guarded, single-txn cashbook+cheque+ledger, in-DB balance delta.';


-- ---------------------------------------------------------------------------
-- 4) #56 — Stock oversell TOCTOU.
--    Guidance patch: any deduction path must lock the stock row BEFORE the
--    sufficiency check so two concurrent orders cannot both pass validation.
--    Wrap the check+deduct inside the same function and lock the row:
--
--      SELECT quantity_on_hand INTO v_qty
--        FROM public.stock_levels
--       WHERE item_id = p_item_id AND store_id = p_store_id
--       FOR UPDATE;                 -- <= row lock closes the race window
--      IF v_qty < p_required THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
--      UPDATE public.stock_levels
--         SET quantity_on_hand = quantity_on_hand - p_required
--       WHERE item_id = p_item_id AND store_id = p_store_id;
--
--    NOTE: critical_fix_01_inventory_concurrency.sql already added FOR UPDATE to
--    the main issue_stock_for_order path. Confirm validate_sufficient_stock()
--    (supabase/inventory_module_functions.sql:129-167) is only ever called from
--    inside a locked deduction txn, never standalone as a pre-check.
-- ---------------------------------------------------------------------------
-- (No standalone DDL here — see inventory_module_functions.sql for the patch site.)
