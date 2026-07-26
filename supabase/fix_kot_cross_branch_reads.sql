-- ═══════════════════════════════════════════════════════════════════
-- fix_kot_cross_branch_reads.sql
-- Finding #73 (LOW) — cross-branch KOT reads
-- ═══════════════════════════════════════════════════════════════════
-- The policies kot_tickets_read_kitchen_cashier (on kot_tickets) and
-- kot_items_read_kitchen (on kot_items) granted SELECT purely by role
-- (kitchen OR cashier OR waiter) with NO branch/kitchen filter, letting
-- any such user read KOT rows across ALL branches.
--
-- Every role already retains a branch/kitchen-scoped SELECT, so dropping
-- these two is tightening-only with ZERO coverage loss:
--   kitchen : kot_kitchen_select / ki_kitchen_select   (kitchen_id ∈ auth_kitchen_ids())
--   cashier : kot_cashier_select / ki_cashier_select   (branch_id  ∈ auth_branch_ids())
--   waiter  : kot_waiter_select  / ki_waiter_select     (branch_id  ∈ auth_branch_ids())
--   + kot_tickets_kitchen_read/cashier_read/waiter_read, ki_staff_select,
--     waiter_select_kot_tickets / waiter_select_kot_items
--
-- Architect-approved (channel msg [816]). RLS policies are ORed, so
-- removing the permissive unscoped ones narrows access to per-branch.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS kot_tickets_read_kitchen_cashier ON public.kot_tickets;
DROP POLICY IF EXISTS kot_items_read_kitchen           ON public.kot_items;

COMMIT;
