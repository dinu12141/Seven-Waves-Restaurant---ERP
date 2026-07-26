-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED 2026-07-25 (DBA task #90) — drop KOT blanket-authenticated RLS policies (#72)
-- Seven Waves Restaurant ERP — CRITICAL #3 sweep, high-traffic batch
--
-- Safety validated by CODEBASE ANALYSIS (Management API can't simulate role JWTs;
-- QA didn't respond in-window, so verified against the actual client instead):
--   • NO client writes to kot_items anywhere (only the SECURITY DEFINER accept RPC,
--     which bypasses RLS). grep: from('kot_items').(update|insert|delete) = 0 hits.
--   • ALL client kot_tickets writes are kitchen-display context
--     (kitchenDisplayStore dismiss/markPrinted + printService.markPrintedAt via
--     KitchenPage) → covered by kitchen/admin/manager UPDATE policies.
--   • OrderDetailDialog.printKot is pure window.print (no DB write); KotPreviewDialog
--     is orphaned (imported nowhere). So no cashier/waiter KOT writes exist.
--   • Reads stay covered: role-gated kot_tickets_read_kitchen_cashier /
--     kot_items_read_kitchen (kitchen|cashier|waiter) remain, plus branch/kitchen
--     scoped SELECTs. KDS/cashier/waiter reads unaffected.
--   • KOT generation is via SECURITY DEFINER accept RPC (bypasses RLS).
-- Post-apply pg_policies confirms zero effectively-true non-service-role policies
-- remain; scoped SELECT(8-9)/UPDATE(2)/INSERT(4) intact per table.
--
-- What it removes (the genuine false-greens — effectively USING(true)):
--   kot_tickets.kot_permissive     (ALL authenticated, auth.uid() IS NOT NULL)
--   kot_tickets.kot_staff_permissive (SELECT authenticated, USING true)
--   kot_items.ki_permissive        (ALL authenticated, auth.uid() IS NOT NULL)
--   kot_items.ki_staff_permissive  (SELECT authenticated, USING true)
--
-- Retained scoped coverage (already live):
--   SELECT  kitchen→kitchen_id, cashier/waiter/staff→branch, customer→QR, admin/mgr
--   INSERT  cashier/waiter→branch, customer→QR, service_role; accept RPC is SECDEF
--   UPDATE  kitchen→kitchen_id, admin/manager
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS kot_permissive       ON public.kot_tickets;
DROP POLICY IF EXISTS kot_staff_permissive ON public.kot_tickets;
DROP POLICY IF EXISTS ki_permissive        ON public.kot_items;
DROP POLICY IF EXISTS ki_staff_permissive  ON public.kot_items;

-- OPTIONAL follow-up (not included — role-gated, not USING(true), lower risk):
--   kot_tickets.kot_tickets_read_kitchen_cashier + kot_items.kot_items_read_kitchen
--   grant cross-BRANCH reads to any kitchen/cashier/waiter. Consider tightening to
--   branch scope in a later pass; branch-scoped equivalents already coexist.
