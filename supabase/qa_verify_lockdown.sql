-- ═══════════════════════════════════════════════════════════════════════════════
-- QA POST-APPLY VERIFICATION — Security Lockdown (Seven Waves Restaurant ERP)
-- Author:  ERP-QA                Task: #77   Generated: 2026-07-23
--
-- RUN THIS AFTER a human applies, in order:
--   1) supabase/erp_security_lockdown.sql
--   2) supabase/fix_missing_rls_policies.sql
--   3) supabase/fix_price_and_discount_security.sql
--   4) supabase/security_lockdown_apply.sql
--
-- It is READ-ONLY except SECTION T (a self-cleaning #38 tamper smoke test wrapped
-- in a ROLLBACK, so it never persists data). Paste into the Supabase SQL Editor.
-- Each check prints PASS/FAIL. Share the output with @ERP-SecAuditor + @Security-Lead.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── A. Structural: triggers & guards present ──────────────────────────────────
SELECT 'A1 price trigger'        AS check,
       CASE WHEN to_regprocedure('public.validate_order_item_price()') IS NOT NULL
            AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_validate_order_item_price')
            THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'A2 total recompute trigger' AS check,
       CASE WHEN to_regprocedure('public.recompute_order_totals_from_items()') IS NOT NULL
            AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_recompute_order_totals')
            THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'A3 override columns exist' AS check,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='order_items' AND column_name='manager_override_id')
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- ── B. #38b payment charges server-side total (not client p_amount_paid) ──────
SELECT 'B1 payment charges total_amount' AS check,
       CASE WHEN prosrc LIKE '%v_amount := v_order.total_amount;%'
             AND prosrc NOT LIKE '%COALESCE(p_amount_paid%'
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_proc WHERE proname='process_cashier_payment';

-- ── C. #34 no anon privileges on operational tables (expect 0 rows) ───────────
SELECT 'C1 anon writes revoked' AS check,
       CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'FAIL ('||COUNT(*)||' grants)' END AS result
FROM information_schema.role_table_grants
WHERE grantee='anon'
  AND table_name IN ('notifications','delivery_tracking','kot_items','kot_tickets');

SELECT 'C2 no delivery_tracking WITH CHECK(true) INSERT' AS check,
       CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies
WHERE tablename='delivery_tracking' AND cmd='INSERT'
  AND (with_check IS NULL OR with_check='true');

-- ── D. #35 testimonials public SELECT is moderated (qual not trivially true) ──
SELECT 'D1 testimonials moderated read' AS check,
       CASE WHEN COUNT(*)>0 AND bool_and(qual IS NOT NULL AND qual <> 'true')
            THEN 'PASS' ELSE 'REVIEW' END AS result
FROM pg_policies WHERE tablename='testimonials' AND cmd='SELECT';

-- ── E. #1-#7 RLS enabled on the key tables ────────────────────────────────────
SELECT 'E1 RLS enabled' AS check, relname,
       CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_class
WHERE relname IN ('companies','branches','journal_entries','journal_lines',
                  'user_roles','audit_logs','ai_insights')
ORDER BY relname;

-- ── F. #6 user_roles admin write gates on CALLER, not row.user_id ─────────────
--   Must reference is_admin()/is_manager(), must NOT self-reference user_id in a
--   way that lets a user insert their own admin row.
SELECT 'F1 user_roles admin write policy' AS check, policyname, cmd,
       CASE WHEN (with_check ILIKE '%is_admin%' OR qual ILIKE '%is_admin%')
            THEN 'PASS' ELSE 'REVIEW' END AS result
FROM pg_policies
WHERE tablename='user_roles' AND cmd IN ('INSERT','UPDATE','DELETE','ALL');

-- ── G. #4 audit_logs INSERT is service_role-only (no authenticated forgery) ───
SELECT 'G1 audit_logs INSERT locked' AS check, policyname,
       CASE WHEN with_check IS NULL OR with_check='true' THEN 'REVIEW' ELSE 'PASS' END AS result
FROM pg_policies WHERE tablename='audit_logs' AND cmd IN ('INSERT','ALL');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION T — #38 TAMPER SMOKE TEST (self-rolling-back; persists NOTHING)
--
-- Proves: a client that inserts order_items with a valid unit_price but a bogus
-- header total (total_amount = 1) has that total OVERWRITTEN by the recompute
-- trigger the instant items land. Replace the three :ids below with real values
-- from your DB, then run the whole block — it ROLLBACKs at the end.
-- ═══════════════════════════════════════════════════════════════════════════════
/*  UNCOMMENT + fill in real ids to run:

DO $$
DECLARE
  v_company  UUID := '<REAL company_id>';
  v_branch   UUID := '<REAL branch_id>';
  v_item     UUID := '<REAL menu_item_id with base_price>';
  v_price    NUMERIC;
  v_order    UUID;
  v_total    NUMERIC;
BEGIN
  SELECT COALESCE(base_price, price) INTO v_price FROM menu_items WHERE id = v_item;

  -- Client lies about the header total (1.00) — the exploit attempt.
  INSERT INTO orders (company_id, branch_id, order_type, order_source, status,
                      payment_status, total_amount, subtotal, tax_amount,
                      service_charge, discount_amount, delivery_charge)
  VALUES (v_company, v_branch, 'takeaway', 'pos', 'pending_waiter', 'unpaid',
          1.00, 1.00, 0, 0, 0, 0)
  RETURNING id INTO v_order;

  -- Two chargeable lines at the REAL price (passes trg_validate_order_item_price).
  INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price, status)
  VALUES (v_order, v_item, 2, v_price, ROUND(2*v_price,2), 'queued');

  SELECT total_amount INTO v_total FROM orders WHERE id = v_order;

  IF v_total = ROUND(2*v_price,2) THEN
    RAISE NOTICE 'T1 PASS: header total recomputed to % (client-supplied 1.00 clobbered)', v_total;
  ELSE
    RAISE WARNING 'T1 FAIL: total_amount = % (expected %)', v_total, ROUND(2*v_price,2);
  END IF;

  RAISE EXCEPTION 'QA smoke test complete — rolling back (no data persisted)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '%', SQLERRM;  -- swallow the intentional rollback
END $$;
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- NEGATIVE RLS TESTS (run manually as different users — cannot be scripted here
-- because they need distinct JWTs; described for the human/SecAuditor live pass):
--   N1. As a waiter/cashier JWT:  SELECT * FROM journal_entries;   → expect 0 rows / denied.
--   N2. As a finance/admin JWT:   SELECT * FROM journal_entries;   → expect rows (branch-scoped).
--   N3. As a waiter JWT:          INSERT INTO user_roles(user_id,role_id) VALUES (auth.uid(),'<admin role>');
--                                 → expect RLS denial (no self-escalation).
--   N4. As an admin JWT via app:  RolesPage "Save Access" (DELETE+INSERT user_roles) → succeeds.
-- ═══════════════════════════════════════════════════════════════════════════════
