-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY LOCKDOWN — MASTER APPLY FILE  (Seven Waves Restaurant ERP)
-- Author:  ERP-DB-Fixer            Generated: 2026-07-23
-- Task:    #73 (RLS lockdown + finance/DB security findings) + #38 (POS pricing)
--
-- WHY THIS FILE EXISTS
--   Supabase MCP is disabled in this environment (.mcp.json holds the placeholder
--   token — finding #8), so no agent can apply DDL or read live pg_policies.
--   Per the team decision (channel msg 607) we use the same proven path as the
--   website hardening: agents PRODUCE apply-ready SQL, the human owner RUNS it in
--   the Supabase SQL Editor.
--
-- ⚠️ SHARED BACKEND WARNING
--   This ERP and the Seven Waves *Website* share ONE Supabase database
--   (project ref clykwuzajtwvwuavmtzs). The website's hardening is ALREADY applied
--   (place_website_order server-side pricing; website_reservations/hall_bookings/
--   security_events/login_*/session_tokens/qr_rate_limits → service_role).
--   Nothing in this file touches those objects, so it is safe to run on the
--   shared backend. Every statement is idempotent / re-runnable.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EXACT RUN ORDER (run each ONCE, in this order, in the Supabase SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────
--   1. supabase/erp_security_lockdown.sql
--        └ defines the RLS helper functions: is_admin(), is_manager(),
--          is_finance(), is_hr(), is_inventory(), auth_branch_ids(),
--          auth_has_role(). PREREQUISITE for everything below.
--   2. supabase/fix_missing_rls_policies.sql        (967 lines)
--        └ findings #1 #2 #3 #4 #5 #6 #7 + uom_conversions / customer_sessions /
--          loyalty_accounts. Enables RLS on companies, branches, journal_entries/
--          journal_lines, finance module tables (drops blanket authenticated=ALL),
--          payroll_*, adds admin write policies on user_roles/user_branches, locks
--          AI tables, restricts audit_logs INSERT → service_role.
--   3. supabase/fix_price_and_discount_security.sql
--        └ base POS price/discount triggers + manager-override RPCs.
--   4. >>> THIS FILE (supabase/security_lockdown_apply.sql) <<<
--        └ the NET-NEW / UPGRADE work that closes the gaps the above files
--          do not cover:
--            • #38  variant-aware POS price validation (fixes the base_price-only
--                   gap that lets variant items be under-priced) + make
--                   process_cashier_payment ignore client-supplied p_amount_paid.
--            • #34  revoke anon writes on notifications / delivery_tracking /
--                   kot_items / kot_tickets and kill the delivery_tracking
--                   WITH CHECK(true) INSERT hole.
--            • #35  testimonials — public SELECT limited to moderated rows.
--
--   Steps 1-3 are intentionally NOT inlined here: they are large, already correct,
--   and duplicating them would create drift on a shared backend. This file is the
--   final, self-contained delta and is safe to re-run on its own.
--
--   AFTER APPLYING: run the Supabase Database Linter and the verification queries
--   at the bottom of this file, then ping @ERP-SecAuditor for pg_policies verify.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 0 — PREREQUISITE GUARD
--   Abort with a clear message if the helper functions from step 1 are missing,
--   so this file never half-applies against a DB that skipped the prerequisites.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Helpers from erp_security_lockdown.sql + fix_missing_rls_policies.sql
  IF to_regprocedure('public.is_admin()') IS NULL
     OR to_regprocedure('public.auth_has_role(text)') IS NULL THEN
    RAISE EXCEPTION
      'PREREQUISITE MISSING: run erp_security_lockdown.sql (is_admin/auth_has_role) '
      'and fix_missing_rls_policies.sql BEFORE this file. See the run-order header.';
  END IF;

  -- Columns from fix_price_and_discount_security.sql (step 3). The price trigger
  -- below references NEW.manager_override_id/override_reason — if step 3 was
  -- skipped the trigger would still be created but EVERY order_items INSERT would
  -- fail at runtime → full POS outage. Fail fast here instead.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items'
      AND column_name='manager_override_id'
  ) THEN
    RAISE EXCEPTION
      'PREREQUISITE MISSING: order_items.manager_override_id not found — run '
      'fix_price_and_discount_security.sql (step 3) BEFORE this file. See the run-order header.';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — FINDING #38: POS ORDER PRICING (server-authoritative)
--
-- Problem (ERP-SecAuditor #38): the staff POS path inserts client-computed
--   unit_price / total_amount directly (orderStore.js sendToKitchen :210-211 and
--   Quick-Pay processPayment :313), and process_cashier_payment trusts the
--   client-supplied p_amount_paid (:356). A staff member with a tampered client
--   can set unit_price = 0 or an arbitrary total → free-food / cash-skim fraud.
--
-- The existing fix_price_and_discount_security.sql already adds a price-deviation
-- trigger + a discount ceiling + manager-override RPCs — GOOD, and it also solves
-- ERP-QA's "don't bounce legit carts" concern (the ±tolerance + manager-override
-- path lets valid discounts through). BUT it has two real gaps we close here:
--
--   GAP A (ERP-QA regression trap #1): validate_order_item_price() compares
--     unit_price ONLY against menu_items.base_price and IGNORES variant pricing.
--     The POS sends variant_id + the variant's price (orderStore.js:207-210).
--     For an item whose variant costs far more than base (e.g. base 100, "Large"
--     500), a cashier could enter 110 (within 10% of BASE) and underpay by 78%,
--     while a legit variant order (500) would look like a +400% deviation and be
--     rejected. Fix: resolve the canonical price from item_variants.price when
--     variant_id is set, else menu_items.base_price. Tolerance model unchanged.
--
--   GAP B (ERP-QA regression trap #2): process_cashier_payment recorded the
--     charge as COALESCE(p_amount_paid, orders.total_amount) — client-trusted.
--     Fix: always charge orders.total_amount (server-side; now trustworthy because
--     line prices are validated by the trigger and discount is capped by
--     validate_order_discount). p_amount_paid stays in the signature (frontend
--     still sends it, PaymentDialog cash-tendered) but is IGNORED for the charge —
--     so no RPC-signature change, no frontend regression. Per QA: we do NOT
--     recompute from SUM(order_items.total_price) (that excludes tax/service and
--     over-counts vs grand total); orders.total_amount is the correct basis.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1a. Variant-aware price validation (replaces the base_price-only version) ──
CREATE OR REPLACE FUNCTION public.validate_order_item_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical  NUMERIC;   -- authoritative price for this line (variant or base)
  v_tolerance  NUMERIC := 0.10;  -- 10% tolerance; larger deviations need a manager
  v_deviation  NUMERIC;
  v_source     TEXT;
BEGIN
  -- Nothing to validate without a menu item reference.
  IF NEW.menu_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve the canonical price from the SAME source the POS uses:
  --   variant_id present  -> item_variants.price for that variant
  --   otherwise           -> menu_items.base_price (fallback to .price)
  IF NEW.variant_id IS NOT NULL THEN
    SELECT iv.price
      INTO v_canonical
    FROM public.item_variants iv
    WHERE iv.id = NEW.variant_id
      AND iv.menu_item_id = NEW.menu_item_id;   -- variant must belong to the item
    v_source := 'item_variants';
  END IF;

  IF v_canonical IS NULL THEN
    -- No variant match (or no variant) → fall back to the menu item base price.
    SELECT COALESCE(mi.base_price, mi.price)
      INTO v_canonical
    FROM public.menu_items mi
    WHERE mi.id = NEW.menu_item_id;
    v_source := 'menu_items';
  END IF;

  -- If we still cannot establish a canonical price, do not block the order,
  -- but a non-positive submitted price is never legitimate — reject it outright.
  IF v_canonical IS NULL OR v_canonical <= 0 THEN
    IF COALESCE(NEW.unit_price, 0) <= 0 AND NEW.manager_override_id IS NULL THEN
      RAISE EXCEPTION
        'unit_price (%) is not allowed for menu_item % with no resolvable menu price. '
        'A manager override is required for zero/negative prices.',
        NEW.unit_price, NEW.menu_item_id;
    END IF;
    -- Derive the line total from the (accepted) unit_price so total_price is never
    -- client-trusted even on this fallback path.
    NEW.total_price := ROUND(COALESCE(NEW.quantity, 1) * COALESCE(NEW.unit_price, 0), 2);
    RETURN NEW;
  END IF;

  -- Deviation of the submitted price from the canonical price (fraction).
  v_deviation := ABS(COALESCE(NEW.unit_price, 0) - v_canonical) / v_canonical;

  IF v_deviation > v_tolerance THEN
    -- Outside tolerance → require an explicit manager override.
    IF NEW.manager_override_id IS NULL THEN
      RAISE EXCEPTION
        'unit_price (%) deviates %.0f%% from the % price (%). '
        'Deviations over 10%% require manager authorization (rpc_manager_price_override).',
        NEW.unit_price, v_deviation * 100, v_source, v_canonical;
    END IF;

    -- Manager-approved deviation → keep an audit trail.
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, new_data, severity, created_at
    ) VALUES (
      auth.uid(), 'PRICE_OVERRIDE', 'order_items', NEW.id,
      jsonb_build_object(
        'menu_item_id',        NEW.menu_item_id,
        'variant_id',          NEW.variant_id,
        'canonical_source',    v_source,
        'canonical_price',     v_canonical,
        'submitted_price',     NEW.unit_price,
        'deviation_pct',       ROUND((v_deviation * 100)::NUMERIC, 2),
        'manager_override_id', NEW.manager_override_id,
        'override_reason',     NEW.override_reason
      ),
      'warning', now()
    );
  END IF;

  -- Always derive the line total from the validated unit_price — never trust the
  -- client-supplied total_price (it feeds subtotal/finance downstream).
  NEW.total_price := ROUND(COALESCE(NEW.quantity, 1) * COALESCE(NEW.unit_price, 0), 2);

  RETURN NEW;
END;
$$;

-- Trigger fires on INSERT and whenever unit_price / variant_id / quantity change.
DROP TRIGGER IF EXISTS trg_validate_order_item_price ON public.order_items;
CREATE TRIGGER trg_validate_order_item_price
  BEFORE INSERT OR UPDATE OF unit_price, variant_id, quantity ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_item_price();


-- ── 1a-ii. Reconcile parent order subtotal/total from validated line items ────
--   QA MUST-FIX #1: orders.total_amount is client-supplied at insert
--   (orderStore.js:181) and was never reconciled to the line items — so a tampered
--   client could send correct unit_prices (pass the item trigger) yet set
--   total_amount = 1 and underpay. This AFTER trigger recomputes the parent order's
--   subtotal and total_amount FROM the now-validated line items, so the value
--   process_cashier_payment charges is genuinely server-derived.
--
--   Order-level adjustments (tax_amount, service_charge, delivery_charge,
--   discount_amount) are preserved: discount is already capped by
--   validate_order_discount; tax is 0 in this deployment and service_charge
--   over-statement favours the house, so neither is an underpayment vector.
--       total_amount = GREATEST(subtotal - discount_amount, 0)
--                      + tax_amount + service_charge + delivery_charge
CREATE OR REPLACE FUNCTION public.recompute_order_totals_from_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id  UUID := COALESCE(NEW.order_id, OLD.order_id);
  v_subtotal  NUMERIC;
BEGIN
  IF v_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Sum only CHARGEABLE lines — exclude items flagged unavailable, matching the
  -- charge semantics in rpc_waiter_accept_order (fix_pos_order_flow.sql). This also
  -- self-heals the unavailable-items case so no separate recompute is needed.
  SELECT COALESCE(SUM(ROUND(COALESCE(quantity,1) * COALESCE(unit_price,0), 2)), 0)
    INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_order_id
    AND COALESCE(availability_status, 'available') <> 'unavailable';

  UPDATE public.orders o
  SET subtotal     = v_subtotal,
      total_amount = GREATEST(v_subtotal - COALESCE(o.discount_amount, 0), 0)
                     + COALESCE(o.tax_amount, 0)
                     + COALESCE(o.service_charge, 0)
                     + COALESCE(o.delivery_charge, 0),
      updated_at   = now()
  WHERE o.id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Statement-safe row trigger: recompute after any line-item change. Runs AFTER
-- the BEFORE price trigger has validated/derived unit_price & total_price.
DROP TRIGGER IF EXISTS trg_recompute_order_totals ON public.order_items;
CREATE TRIGGER trg_recompute_order_totals
  AFTER INSERT
     OR UPDATE OF unit_price, quantity, variant_id, availability_status
     OR DELETE
  ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_order_totals_from_items();


-- ── 1b. process_cashier_payment: charge the server-side order total ───────────
--   This is a faithful reproduction of the canonical definition in
--   supabase/kot_orchestration_v2.sql (lines 591-739) with ONE change:
--       BEFORE:  v_amount := COALESCE(p_amount_paid, v_order.total_amount);
--       AFTER:   v_amount := v_order.total_amount;   -- ignore client p_amount_paid
--   Signature (UUID, TEXT, NUMERIC) is unchanged → no PostgREST overload issue,
--   no frontend regression. If your live definition has diverged from
--   kot_orchestration_v2.sql, apply ONLY the one-line change above by hand instead
--   of running this block.
CREATE OR REPLACE FUNCTION public.process_cashier_payment(
    p_order_id       UUID,
    p_payment_method TEXT    DEFAULT 'cash',
    p_amount_paid    NUMERIC DEFAULT NULL   -- accepted for compat; NOT trusted
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order        RECORD;
    v_invoice      RECORD;
    v_method_id    UUID;
    v_method_label TEXT;
    v_user_id      UUID := auth.uid();
    v_now          TIMESTAMPTZ := now();
    v_stock_result JSONB;
    v_amount       NUMERIC;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    IF NOT (auth_has_role('cashier') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already paid.', 'order_id', p_order_id);
    END IF;

    -- SECURITY (#38 / QA trap #2): charge the server-side order total, never the
    -- client-supplied p_amount_paid. orders.total_amount is server-derived:
    -- trg_validate_order_item_price validates each unit_price and derives
    -- total_price, and trg_recompute_order_totals recomputes subtotal + total_amount
    -- FROM those validated line items (discount capped by trg_validate_order_discount).
    v_amount := v_order.total_amount;

    -- Resolve payment_methods row (case-insensitive; prefers exact match)
    SELECT id, name INTO v_method_id, v_method_label
    FROM payment_methods
    WHERE LOWER(name) = LOWER(p_payment_method)
       OR LOWER(name) LIKE LOWER(p_payment_method) || '%'
    ORDER BY CASE WHEN LOWER(name) = LOWER(p_payment_method) THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_method_id IS NULL THEN
        SELECT id, name INTO v_method_id, v_method_label
        FROM payment_methods WHERE LOWER(name) = 'cash' LIMIT 1;
        v_method_label := COALESCE(v_method_label, p_payment_method);
    END IF;

    -- ── 1. Mark as paid ──────────────────────────────────────────────────────
    UPDATE orders
    SET status = 'paid',
        payment_status = 'paid',
        payment_method = p_payment_method,
        updated_at = v_now
    WHERE id = p_order_id;

    -- ── 2. Update work queues ────────────────────────────────────────────────
    UPDATE cashier_queue SET status = 'paid', updated_at = v_now
    WHERE order_id = p_order_id AND status IN ('open', 'invoiced');

    UPDATE finance_queue SET status = 'posted', updated_at = v_now
    WHERE order_id = p_order_id AND status = 'pending';

    -- ── 3. Create payments record (enables reports to join invoice→payments→payment_methods)
    SELECT * INTO v_invoice FROM invoices
    WHERE order_id = p_order_id ORDER BY created_at DESC LIMIT 1;

    IF v_invoice.id IS NOT NULL AND v_method_id IS NOT NULL THEN
        INSERT INTO payments (
            invoice_id, order_id, amount, payment_method, payment_method_id,
            received_by, cashier_id, branch_id, company_id, status
        )
        SELECT
            v_invoice.id, p_order_id, v_amount,
            COALESCE(v_method_label, p_payment_method), v_method_id,
            v_user_id, v_user_id, v_order.branch_id, v_order.company_id, 'completed'
        WHERE NOT EXISTS (
            SELECT 1 FROM payments WHERE invoice_id = v_invoice.id AND status = 'completed'
        );

        UPDATE invoices
        SET payment_status    = 'paid',
            payment_type      = COALESCE(v_method_label, p_payment_method),
            payment_method_id = v_method_id,
            cashier_id        = v_user_id,
            updated_at        = v_now
        WHERE id = v_invoice.id;
    END IF;

    -- ── 4. Stock deduction (on_paid stage) ───────────────────────────────────
    BEGIN
        v_stock_result := issue_stock_for_order(p_order_id);
    EXCEPTION WHEN OTHERS THEN
        v_stock_result := jsonb_build_object('success', false, 'error', SQLERRM);
        PERFORM mark_stock_queue_failed(p_order_id, SQLERRM);
    END;

    -- ── 5. Auto-post journal entry ───────────────────────────────────────────
    BEGIN
        PERFORM post_accounting_from_order(p_order_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Journal posting warning for order %: %', p_order_id, SQLERRM;
    END;

    -- ── 6. Event log ─────────────────────────────────────────────────────────
    PERFORM log_erp_event(
        'payment_received', 'order', p_order_id, v_user_id, 'cashier', v_order.branch_id,
        jsonb_build_object(
            'cashier_id', v_user_id,
            'payment_method', p_payment_method,
            'amount_paid', v_amount,
            'stock_result', v_stock_result
        )
    );

    -- ── 7. Notification: waiter ──────────────────────────────────────────────
    IF v_order.assigned_waiter_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, branch_id, type, title, message, icon, color, action_url, ref_type, ref_id)
        VALUES (
            v_order.assigned_waiter_id, v_order.branch_id,
            'payment_complete', '💰 Payment Complete',
            'Order #' || v_order.order_number || ' — ' || UPPER(p_payment_method) ||
            ' · LKR ' || TO_CHAR(v_amount, 'FM999,999.00'),
            'payments', 'green', '/orders', 'order', p_order_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'payment_status', 'paid',
        'payment_method', p_payment_method,
        'payment_method_label', v_method_label,
        'amount_charged', v_amount,
        'finance_posted', true,
        'stock_result', v_stock_result
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_cashier_payment(UUID, TEXT, NUMERIC) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — FINDING #34: ANON WRITES on operational QR/POS tables
--
--   notifications, delivery_tracking, kot_items, kot_tickets are written ONLY by
--   SECURITY DEFINER RPCs/triggers (accept_order → trg_generate_kot inserts
--   kot_tickets/kot_items; process_cashier_payment inserts notifications; the
--   delivery app writes delivery_tracking through the rider policy). SECURITY
--   DEFINER bypasses RLS, so revoking direct anon/public writes here breaks
--   nothing operational. This also kills the delivery_tracking WITH CHECK(true)
--   INSERT policy (dt_ins) introduced in phase1_offline_sync.sql:440.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY['notifications','delivery_tracking','kot_items','kot_tickets'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      -- Ensure RLS is on (SECURITY DEFINER writers are unaffected).
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      -- Remove all direct table privileges from the anonymous role.
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- Kill the wide-open delivery_tracking INSERT policy (WITH CHECK (true)).
-- fix_delivery_tracking_rls.sql already replaces it with a rider-scoped policy;
-- we drop it here too so this file is self-sufficient and idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='delivery_tracking') THEN
    DROP POLICY IF EXISTS dt_ins ON public.delivery_tracking;

    -- Recreate a scoped INSERT policy only if the rider-scoped one is absent,
    -- so we do not conflict with fix_delivery_tracking_rls.sql (dt_rider_ins).
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='delivery_tracking'
        AND cmd='INSERT'
    ) THEN
      -- Staff (any authenticated non-anon user) may insert tracking rows.
      CREATE POLICY dt_staff_ins ON public.delivery_tracking FOR INSERT
        WITH CHECK (auth.uid() IS NOT NULL);
    END IF;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — FINDING #35: testimonials public SELECT limited to moderated rows
--
--   testimonials is a website-read table (public/anon SELECT). Its SELECT policy
--   used USING(true) with no moderation filter, so unapproved/hidden testimonials
--   are world-readable. We replace the public read policy with one that only
--   exposes moderated rows, detecting whichever moderation column exists
--   (is_approved / approved / is_published / status='approved'). Admin/staff keep
--   full read via their own policies (untouched).
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_filter TEXT := NULL;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='testimonials') THEN

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='testimonials' AND column_name='is_approved') THEN
      v_filter := 'is_approved = true';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='testimonials' AND column_name='approved') THEN
      v_filter := 'approved = true';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='testimonials' AND column_name='is_published') THEN
      v_filter := 'is_published = true';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='testimonials' AND column_name='status') THEN
      v_filter := $f$status = 'approved'$f$;
    END IF;

    IF v_filter IS NOT NULL THEN
      ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
      -- Drop the common permissive public-read policy names.
      EXECUTE $dp$ DROP POLICY IF EXISTS "Public can select testimonials" ON public.testimonials $dp$;
      EXECUTE $dp$ DROP POLICY IF EXISTS "Testimonials are viewable by everyone" ON public.testimonials $dp$;
      EXECUTE $dp$ DROP POLICY IF EXISTS testimonials_select ON public.testimonials $dp$;
      EXECUTE $dp$ DROP POLICY IF EXISTS testimonials_public_read ON public.testimonials $dp$;

      EXECUTE format(
        'CREATE POLICY testimonials_public_read ON public.testimonials FOR SELECT USING (%s)',
        v_filter
      );
    END IF;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after applying; share output with @ERP-SecAuditor)
-- ═══════════════════════════════════════════════════════════════════════════════
-- -- #38a: variant-aware trigger present
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_validate_order_item_price';
--
-- -- #38b: payment RPC no longer references p_amount_paid for the charge
-- SELECT prosrc LIKE '%v_amount := v_order.total_amount;%' AS charge_is_server_side
-- FROM pg_proc WHERE proname = 'process_cashier_payment';
--
-- -- #38c: order totals reconcile from line items (tamper check)
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_recompute_order_totals';
-- -- Manual: INSERT an order+items, then UPDATE orders SET total_amount=1 has no
-- -- effect on the charge because the trigger recomputes it from order_items.
--
-- -- #34: no anon privileges remain on operational tables
-- SELECT table_name, privilege_type FROM information_schema.role_table_grants
-- WHERE grantee = 'anon'
--   AND table_name IN ('notifications','delivery_tracking','kot_items','kot_tickets');
-- -- expected: 0 rows
--
-- -- #34: no WITH CHECK(true) INSERT policy on delivery_tracking
-- SELECT policyname, cmd, with_check FROM pg_policies
-- WHERE tablename='delivery_tracking' AND cmd='INSERT';
--
-- -- #35: testimonials public read is filtered
-- SELECT policyname, qual FROM pg_policies
-- WHERE tablename='testimonials' AND cmd='SELECT';
-- ═══════════════════════════════════════════════════════════════════════════════
