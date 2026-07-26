-- ═══════════════════════════════════════════════════════════════════════════════
-- P0 POST-APPLY VERIFICATION — Security addendum (Seven Waves Restaurant ERP)
-- Author:  Security            Task: #84   Generated: 2026-07-25
--
-- Companion to supabase/qa_verify_lockdown.sql. That file verifies the RLS
-- lockdown BUNDLE (#44, prices/discounts, anon-write revoke). THIS file adds the
-- P0-hardening items NOT covered there:
--   #45  login_audit_logs lockdown  (fix_login_audit_logs_rls.sql)
--   #48/#49/#50/#51/#54  atomic money-path RPCs + sequences (p0_enterprise_hardening.sql)
--
-- RUN order (Supabase SQL Editor, project clykwuzajtwvwuavmtzs) — see
-- supabase/P0_APPLY_GUIDE.md. Then paste THIS whole file. It is 100% READ-ONLY.
-- Every check prints PASS / FAIL / REVIEW. Share output with @Security + @DBA.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── H. #44 — RLS ENABLED on the previously-unprotected sensitive tables ───────
SELECT 'H1 RLS enabled' AS check, relname,
       CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_class
WHERE relname IN ('user_roles','payments','salary','companies','branches',
                  'journal_entries','journal_lines','order_items','kot_tickets',
                  'kitchens','restaurant_tables','categories','menu_items',
                  'ingredients','recipes','stock_movements','order_status_logs',
                  'roles','role_permissions','user_branches')
ORDER BY relname;
-- expect PASS for every row. Any FAIL = table is world-open via PostgREST.

-- ── I. #45 — login_audit_logs RLS present and correctly shaped ────────────────
SELECT 'I1 login_audit_logs RLS enabled' AS check,
       CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_class WHERE relname = 'login_audit_logs';

-- SELECT must be admin-scoped (NOT USING(true) exposing all rows to everyone).
SELECT 'I2 SELECT is admin-scoped (not USING true)' AS check, policyname,
       CASE WHEN qual IS NOT NULL AND qual <> 'true'
             AND (qual ILIKE '%is_admin%' OR qual ILIKE '%auth.uid%')
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies
WHERE tablename='login_audit_logs' AND cmd IN ('SELECT','ALL');

-- INSERT must be scoped (self for authenticated / failed-login for anon), never
-- an unconditional WITH CHECK(true) that lets rows be forged freely.
SELECT 'I3 INSERT scoped (no blanket WITH CHECK true)' AS check, policyname, roles,
       CASE WHEN with_check IS NOT NULL AND with_check <> 'true'
            THEN 'PASS' ELSE 'REVIEW' END AS result
FROM pg_policies
WHERE tablename='login_audit_logs' AND cmd IN ('INSERT','ALL');

-- No UPDATE/DELETE policy should exist (table must be append-only) — expect 0 rows.
SELECT 'I4 append-only (no UPDATE/DELETE policy)' AS check,
       CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'FAIL ('||COUNT(*)||' mutate policies)' END AS result
FROM pg_policies
WHERE tablename='login_audit_logs' AND cmd IN ('UPDATE','DELETE');

-- Grants: anon = INSERT only; authenticated must NOT hold UPDATE/DELETE; no GRANT ALL.
SELECT 'I5 anon grant = INSERT only' AS check,
       CASE WHEN COALESCE(string_agg(DISTINCT privilege_type, ','),'(none)') = 'INSERT'
            THEN 'PASS' ELSE 'FAIL ('||COALESCE(string_agg(DISTINCT privilege_type, ','),'(none)')||')' END AS result
FROM information_schema.role_table_grants
WHERE table_name='login_audit_logs' AND grantee='anon';

SELECT 'I6 authenticated has NO UPDATE/DELETE' AS check,
       CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'FAIL ('||string_agg(privilege_type,',')||')' END AS result
FROM information_schema.role_table_grants
WHERE table_name='login_audit_logs' AND grantee='authenticated'
  AND privilege_type IN ('UPDATE','DELETE');

-- ── J. #48/#49/#50/#51/#54 — new atomic RPCs present ──────────────────────────
SELECT 'J1 atomic RPC present' AS check, want AS proname,
       CASE WHEN to_regproc(want) IS NOT NULL THEN 'PASS' ELSE 'FAIL (missing)' END AS result
FROM (VALUES
        ('public.pos_create_order_with_items'),
        ('public.post_finance_voucher'),
        ('public.next_voucher_no')
     ) AS t(want);

-- Voucher-number sequences exist (concurrency-safe numbering, #54).
SELECT 'J2 voucher sequences exist' AS check,
       CASE WHEN COUNT(*)=2 THEN 'PASS' ELSE 'FAIL ('||COUNT(*)||'/2)' END AS result
FROM pg_class WHERE relkind='S' AND relname IN ('seq_voucher_pv','seq_voucher_rv');

-- ── K. New money-path RPCs are NOT anon-executable (SECURITY DEFINER lockdown) ─
SELECT 'K1 RPC not granted to anon' AS check, p.proname,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN 'FAIL (anon can execute)' ELSE 'PASS' END AS result
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('pos_create_order_with_items','post_finance_voucher','next_voucher_no')
ORDER BY p.proname;

-- ── L. post_finance_voucher carries the double-post status guard (#50) ─────────
SELECT 'L1 voucher post status-guarded + FOR UPDATE' AS check,
       CASE WHEN prosrc LIKE '%FOR UPDATE%'
             AND prosrc LIKE '%approved%'
             AND prosrc LIKE '%already_posted%'
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_proc WHERE proname='post_finance_voucher';

-- ── M. #44 — record the migrations were logged (advisory; not a control) ──────
SELECT 'M1 P0 migrations recorded' AS check, filename,
       'INFO' AS result
FROM public.applied_migrations
WHERE filename IN ('fix_missing_rls_policies.sql','fix_rls_missing_tables.sql',
                   'security_lockdown_apply.sql','fix_login_audit_logs_rls.sql',
                   'p0_enterprise_hardening.sql')
ORDER BY filename;
-- (Absence here is not proof of non-application — the live pg_* checks above are
--  authoritative. This just cross-references the intended ledger.)

-- ═══════════════════════════════════════════════════════════════════════════════
-- NEGATIVE RLS TESTS — run manually with DISTINCT JWTs (cannot be scripted here):
--   N1. waiter JWT:  SELECT * FROM login_audit_logs;  → expect 0 rows / denied.
--   N2. admin  JWT:  SELECT * FROM login_audit_logs;  → expect rows.
--   N3. waiter JWT:  INSERT INTO user_roles(user_id, role_id)
--                    VALUES (auth.uid(), '<admin role>');  → expect RLS denial.
--   N4. waiter JWT:  UPDATE login_audit_logs SET ip_address='x';  → expect denied.
--   N5. waiter JWT:  SELECT * FROM salary;  /  SELECT * FROM payments;  → expect denied.
-- ═══════════════════════════════════════════════════════════════════════════════
