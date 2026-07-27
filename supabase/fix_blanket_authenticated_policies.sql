-- ═══════════════════════════════════════════════════════════════════════════
-- FIX — blanket-authenticated / effectively-true RLS write policies (finding #72)
-- Seven Waves Restaurant ERP  —  CRITICAL #3 sweep, LOW-RISK batch
--
-- Applied 2026-07-25 (DBA task #90). Security-confirmed #72. Each change keeps
-- legitimate access intact and only removes the over-grant.
--
-- NOT in this file (deferred for functional QA sign-off — high-traffic KDS/
-- realtime path): kot_tickets.kot_permissive / kot_staff_permissive and
-- kot_items.ki_permissive. See channel: needs KDS + cashier + waiter live test.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) uom_conversions — anon+authenticated writes with always-true check.
--    Writes are already covered by uom_admin (is_admin() OR is_inventory()).
--    Reads stay open to authenticated via uom_read. Drop the 3 over-grants.
DROP POLICY IF EXISTS uom_conversions_insert ON public.uom_conversions;
DROP POLICY IF EXISTS uom_conversions_update ON public.uom_conversions;
DROP POLICY IF EXISTS uom_conversions_delete ON public.uom_conversions;

-- 2) pos_shift_audit_logs — INSERT WITH CHECK true allowed any authenticated
--    user (incl. waiter/kitchen) to forge audit rows. Restrict to the shift
--    roles, matching pos_shifts / pos_shift_payments insert policies.
DROP POLICY IF EXISTS shift_audit_insert ON public.pos_shift_audit_logs;
CREATE POLICY shift_audit_insert ON public.pos_shift_audit_logs  -- re-runnable: dropped above

    FOR INSERT TO authenticated
    WITH CHECK (auth_has_role('admin') OR auth_has_role('manager') OR auth_has_role('cashier'));

-- 3) menu_books / menu_book_items — *_all_authenticated (ALL, auth.uid() IS NOT
--    NULL) let any authenticated user EDIT the menu. But it was ALSO the only
--    SELECT path for authenticated staff (POS menu display), so we SPLIT it:
--    keep staff read, restrict writes to admin/manager. anon_select unchanged.
DROP POLICY IF EXISTS menu_books_all_authenticated ON public.menu_books;
DROP POLICY IF EXISTS menu_books_staff_read ON public.menu_books;
DROP POLICY IF EXISTS menu_books_admin_write ON public.menu_books;
CREATE POLICY menu_books_staff_read ON public.menu_books
    FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY menu_books_admin_write ON public.menu_books
    FOR ALL TO authenticated
    USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

DROP POLICY IF EXISTS menu_book_items_all_authenticated ON public.menu_book_items;
DROP POLICY IF EXISTS menu_book_items_staff_read ON public.menu_book_items;
DROP POLICY IF EXISTS menu_book_items_admin_write ON public.menu_book_items;
CREATE POLICY menu_book_items_staff_read ON public.menu_book_items
    FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY menu_book_items_admin_write ON public.menu_book_items
    FOR ALL TO authenticated
    USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());
