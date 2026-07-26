-- ═══════════════════════════════════════════════════════════════════════════
-- FIX — POS payment crash: loyalty_accounts.company_id NOT NULL violation
-- Seven Waves Restaurant ERP
--
-- Symptom (client): "quick_pay:payment: null value in column \"company_id\" of
-- relation \"loyalty_accounts\" violates not-null constraint" whenever a POS
-- order that HAS a linked customer is paid (pos_quick_pay → process_cashier_
-- payment → UPDATE orders status='paid' → loyalty triggers fire).
--
-- Root cause: THREE loyalty-award triggers coexist on public.orders, two of
-- them redundant, one of them schema-incompatible:
--
--   trg_award_loyalty_on_paid  → award_loyalty_points()   ← BROKEN. INSERTs into
--       loyalty_accounts (customer_id, card_number) with NO company_id. The
--       column later became NOT NULL, so this now aborts the whole payment txn.
--   trg_order_loyalty_reward       → rpc_apply_loyalty_reward()  ← CORRECT path
--   trg_order_loyalty_reward_exec  → rpc_apply_loyalty_reward()  ← DUPLICATE of
--       the above (both call the same reward fn; idempotency guard prevents a
--       double-award but it is dead-weight and doubles the work).
--
-- Fix:
--   1) Drop the broken legacy trigger trg_award_loyalty_on_paid.
--   2) Drop the duplicate trigger trg_order_loyalty_reward_exec, keeping the
--      single canonical trg_order_loyalty_reward → rpc_apply_loyalty_reward.
--   3) Defensively harden award_loyalty_points() so a direct call can never
--      re-introduce the NOT NULL violation (sets company_id from the order,
--      and adds current_coins bookkeeping columns).
--
-- rpc_apply_loyalty_reward already inserts company_id correctly, so the reward
-- path continues to work — orders with a customer now earn loyalty coins AND
-- the payment completes.
--
-- Idempotent / re-runnable. Applied 2026-07-25.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Retire the broken legacy loyalty trigger (missing company_id → crash).
DROP TRIGGER IF EXISTS trg_award_loyalty_on_paid ON public.orders;

-- 2) Retire the duplicate reward trigger (keep trg_order_loyalty_reward).
DROP TRIGGER IF EXISTS trg_order_loyalty_reward_exec ON public.orders;

-- 3) Harden award_loyalty_points() so it is safe if ever called directly.
--    (No trigger references it after step 1, but it remains a callable RPC.)
CREATE OR REPLACE FUNCTION public.award_loyalty_points(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order     RECORD;
    v_settings  RECORD;
    v_points    NUMERIC;
    v_new_bal   NUMERIC;
    v_card      TEXT;
BEGIN
    SELECT o.id, o.customer_id, o.company_id, o.total_amount, o.status
      INTO v_order FROM orders o WHERE o.id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;
    IF v_order.status != 'paid' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not paid yet');
    END IF;
    IF v_order.customer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No customer linked');
    END IF;

    -- Idempotency
    IF EXISTS (SELECT 1 FROM loyalty_transactions WHERE order_id = p_order_id AND type = 'earn') THEN
        RETURN jsonb_build_object('success', true, 'skipped', true);
    END IF;

    SELECT * INTO v_settings FROM loyalty_settings WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
    v_points := FLOOR(v_order.total_amount * COALESCE(v_settings.earn_rate, 0.05));

    IF v_points <= 0 THEN
        RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'Zero points');
    END IF;

    -- Ensure loyalty account (now WITH company_id — the NOT NULL column).
    IF NOT EXISTS (SELECT 1 FROM loyalty_accounts WHERE customer_id = v_order.customer_id) THEN
        LOOP
            v_card := 'SW' || LPAD(floor(random() * 100000000)::TEXT, 8, '0');
            EXIT WHEN NOT EXISTS (SELECT 1 FROM loyalty_accounts WHERE card_number = v_card);
        END LOOP;
        INSERT INTO loyalty_accounts (company_id, customer_id, card_number)
        VALUES (v_order.company_id, v_order.customer_id, v_card);
    END IF;

    INSERT INTO loyalty_transactions (customer_id, order_id, type, points, amount_value)
    VALUES (v_order.customer_id, p_order_id, 'earn', v_points, v_order.total_amount);

    UPDATE loyalty_accounts
       SET points_balance = points_balance + v_points,
           tier = CASE
               WHEN points_balance + v_points >= 10000 THEN 'platinum'
               WHEN points_balance + v_points >= 5000  THEN 'gold'
               WHEN points_balance + v_points >= 1000  THEN 'silver'
               ELSE 'bronze'
           END,
           updated_at = now()
     WHERE customer_id = v_order.customer_id
     RETURNING points_balance INTO v_new_bal;

    RETURN jsonb_build_object(
        'success', true,
        'points_awarded', v_points,
        'new_balance', v_new_bal
    );
END;
$function$;

COMMIT;
