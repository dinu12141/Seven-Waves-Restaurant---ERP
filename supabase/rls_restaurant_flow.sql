-- =====================================================
-- RLS POLICIES — RESTAURANT FLOW
-- Applied to: orders, order_items, order_status_logs,
--   restaurant_tables, kitchens, menu_items, categories,
--   item_variants, kot_tickets, kot_items,
--   payment_methods, pos_invoices, pos_invoice_items,
--   pos_payments
-- =====================================================

-- =====================================================
-- 0.  PREREQUISITE TABLES (KOT — not yet in DB)
-- =====================================================

CREATE TABLE IF NOT EXISTS kot_tickets (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    kitchen_id  UUID REFERENCES kitchens(id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_kot_status CHECK (
        status IN ('created','pending','preparing','ready','cancelled')
    )
);
CREATE INDEX IF NOT EXISTS idx_kot_order   ON kot_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_kot_kitchen ON kot_tickets(kitchen_id);

CREATE TABLE IF NOT EXISTS kot_items (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kot_id         UUID NOT NULL REFERENCES kot_tickets(id) ON DELETE CASCADE,
    order_item_id  UUID REFERENCES order_items(id) ON DELETE SET NULL,
    status         TEXT NOT NULL DEFAULT 'queued',
    CONSTRAINT chk_kot_item_status CHECK (
        status IN ('queued','preparing','ready','cancelled')
    )
);
CREATE INDEX IF NOT EXISTS idx_ki_kot ON kot_items(kot_id);

-- Realtime for KOT
ALTER TABLE kot_tickets REPLICA IDENTITY FULL;
ALTER TABLE kot_items   REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='kot_tickets') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE kot_tickets;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='kot_items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE kot_items;
    END IF;
END $$;

-- =====================================================
-- 1.  HELPER FUNCTIONS
-- =====================================================

-- 1a. auth_branch_ids() — returns all branch IDs this user is assigned to
CREATE OR REPLACE FUNCTION auth_branch_ids()
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    RETURN ARRAY(
        SELECT ub.branch_id
        FROM user_branches ub
        WHERE ub.user_id = auth.uid()
    );
END;
$$;

-- 1b. auth_kitchen_ids() — returns kitchens in user's assigned branches
CREATE OR REPLACE FUNCTION auth_kitchen_ids()
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    RETURN ARRAY(
        SELECT k.id
        FROM kitchens k
        WHERE k.branch_id = ANY(auth_branch_ids())
          AND k.is_active = true
    );
END;
$$;

-- 1c. is_admin() — shorthand
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT auth_has_role('admin');
$$;

-- 1d. is_manager() — shorthand
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT auth_has_role('manager');
$$;

-- 1e. is_staff() — any authenticated staff member (not anonymous)
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT auth.uid() IS NOT NULL
       AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid());
$$;


-- =====================================================
-- 2.  ENABLE RLS ON ALL TABLES (SAFE)
-- =====================================================

DO $$
BEGIN
    -- Core Tables
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'categories')        THEN ALTER TABLE categories        ENABLE ROW LEVEL SECURITY; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'menu_items')        THEN ALTER TABLE menu_items        ENABLE ROW LEVEL SECURITY; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_variants')     THEN ALTER TABLE item_variants     ENABLE ROW LEVEL SECURITY; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchens')          THEN ALTER TABLE kitchens          ENABLE ROW LEVEL SECURITY; END IF;
    
    -- Transactional Tables
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders')            THEN ALTER TABLE orders            ENABLE ROW LEVEL SECURITY; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items')       THEN ALTER TABLE order_items       ENABLE ROW LEVEL SECURITY; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_status_logs') THEN ALTER TABLE order_status_logs ENABLE ROW LEVEL SECURITY; END IF;
    
    -- KOT Tables
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kot_tickets')       THEN ALTER TABLE kot_tickets       ENABLE ROW LEVEL SECURITY; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kot_items')         THEN ALTER TABLE kot_items         ENABLE ROW LEVEL SECURITY; END IF;
    
    -- Billing Tables
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_methods')   THEN ALTER TABLE payment_methods   ENABLE ROW LEVEL SECURITY; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_invoices')      THEN ALTER TABLE pos_invoices      ENABLE ROW LEVEL SECURITY; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_invoice_items') THEN ALTER TABLE pos_invoice_items ENABLE ROW LEVEL SECURITY; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_payments')      THEN ALTER TABLE pos_payments      ENABLE ROW LEVEL SECURITY; END IF;
END $$;


-- =====================================================
-- 3.  MENU / CATEGORIES / VARIANTS  (read-public)
-- =====================================================
-- Everyone (including anonymous/customer sessions) can
-- read the menu. Only admin/manager can mutate.

-- Categories
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'categories') THEN
        DROP POLICY IF EXISTS cat_select ON categories;
        CREATE POLICY cat_select ON categories FOR SELECT
            USING (true);

        DROP POLICY IF EXISTS cat_admin ON categories;
        CREATE POLICY cat_admin ON categories FOR ALL
            USING  (is_admin() OR is_manager())
            WITH CHECK (is_admin() OR is_manager());
    END IF;
END $$;

-- Menu Items
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'menu_items') THEN
        DROP POLICY IF EXISTS mi_select ON menu_items;
        CREATE POLICY mi_select ON menu_items FOR SELECT
            USING (true);

        DROP POLICY IF EXISTS mi_admin ON menu_items;
        CREATE POLICY mi_admin ON menu_items FOR ALL
            USING  (is_admin() OR is_manager())
            WITH CHECK (is_admin() OR is_manager());
    END IF;
END $$;

-- Item Variants
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_variants') THEN
        DROP POLICY IF EXISTS iv_select ON item_variants;
        CREATE POLICY iv_select ON item_variants FOR SELECT
            USING (true);

        DROP POLICY IF EXISTS iv_admin ON item_variants;
        CREATE POLICY iv_admin ON item_variants FOR ALL
            USING  (is_admin() OR is_manager())
            WITH CHECK (is_admin() OR is_manager());
    END IF;
END $$;


-- =====================================================
-- 4.  RESTAURANT TABLES
-- =====================================================
-- Readable by all staff + anon (for QR scanning).
-- Mutable only by admin/manager.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN
        DROP POLICY IF EXISTS rt_select ON restaurant_tables;
        CREATE POLICY rt_select ON restaurant_tables FOR SELECT
            USING (true);

        DROP POLICY IF EXISTS rt_admin ON restaurant_tables;
        CREATE POLICY rt_admin ON restaurant_tables FOR ALL
            USING  (is_admin() OR is_manager())
            WITH CHECK (is_admin() OR is_manager());
    END IF;
END $$;


-- =====================================================
-- 5.  KITCHENS
-- =====================================================
-- Readable by all staff. Mutable only by admin/manager.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchens') THEN
        DROP POLICY IF EXISTS k_select ON kitchens;
        CREATE POLICY k_select ON kitchens FOR SELECT
            USING (is_staff());

        DROP POLICY IF EXISTS k_admin ON kitchens;
        CREATE POLICY k_admin ON kitchens FOR ALL
            USING  (is_admin() OR is_manager())
            WITH CHECK (is_admin() OR is_manager());
    END IF;
END $$;


-- =====================================================
-- 6.  ORDERS
-- =====================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        -- 6a. Admin / Manager — full access on their branches
        DROP POLICY IF EXISTS ord_admin ON orders;
        CREATE POLICY ord_admin ON orders FOR ALL
            USING  (is_admin() OR (is_manager() AND branch_id = ANY(auth_branch_ids())))
            WITH CHECK (is_admin() OR (is_manager() AND branch_id = ANY(auth_branch_ids())));

        -- 6b. Waiter — read orders in their branch
        DROP POLICY IF EXISTS ord_waiter_select ON orders;
        CREATE POLICY ord_waiter_select ON orders FOR SELECT
            USING (
                auth_has_role('waiter')
                AND branch_id = ANY(auth_branch_ids())
            );

        -- 6c. Waiter — can INSERT new orders in their branch
        DROP POLICY IF EXISTS ord_waiter_insert ON orders;
        CREATE POLICY ord_waiter_insert ON orders FOR INSERT
            WITH CHECK (
                auth_has_role('waiter')
                AND branch_id = ANY(auth_branch_ids())
            );

        -- 6d. Waiter — can UPDATE only: accept a pending order (status → 'accepted')
        --     and only if they are the assigned waiter
        DROP POLICY IF EXISTS ord_waiter_update ON orders;
        CREATE POLICY ord_waiter_update ON orders FOR UPDATE
            USING (
                auth_has_role('waiter')
                AND branch_id = ANY(auth_branch_ids())
                AND waiter_id = auth.uid()
            )
            WITH CHECK (
                auth_has_role('waiter')
                AND branch_id = ANY(auth_branch_ids())
            );

        -- 6e. Kitchen — read orders that have items routed to their kitchens
        DROP POLICY IF EXISTS ord_kitchen_select ON orders;
        CREATE POLICY ord_kitchen_select ON orders FOR SELECT
            USING (
                auth_has_role('kitchen')
                AND EXISTS (
                    SELECT 1 FROM order_items oi
                    WHERE oi.order_id = orders.id
                      AND oi.kitchen_id = ANY(auth_kitchen_ids())
                )
            );

        -- 6f. Cashier — read ready / served / invoiced orders in their branch
        DROP POLICY IF EXISTS ord_cashier_select ON orders;
        CREATE POLICY ord_cashier_select ON orders FOR SELECT
            USING (
                auth_has_role('cashier')
                AND branch_id = ANY(auth_branch_ids())
                AND status IN ('ready','served','invoiced')
            );

        -- 6g. Cashier — can UPDATE order status (invoiced/paid) and payment_status
        DROP POLICY IF EXISTS ord_cashier_update ON orders;
        CREATE POLICY ord_cashier_update ON orders FOR UPDATE
            USING (
                auth_has_role('cashier')
                AND branch_id = ANY(auth_branch_ids())
                AND status IN ('ready','served','invoiced')
            )
            WITH CHECK (
                auth_has_role('cashier')
                AND branch_id = ANY(auth_branch_ids())
            );

        -- 6h. Anonymous customer — read only their own order (via table session)
        DROP POLICY IF EXISTS ord_customer_select ON orders;
        CREATE POLICY ord_customer_select ON orders FOR SELECT
            USING (
                auth.role() = 'anon'
                AND order_source = 'qr'
                AND table_id IS NOT NULL
                AND table_id = (
                    COALESCE(
                        (auth.jwt() -> 'app_metadata' ->> 'table_id')::UUID,
                        '00000000-0000-0000-0000-000000000000'::UUID
                    )
                )
            );
    END IF;
END $$;


-- =====================================================
-- 7.  ORDER ITEMS
-- =====================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
        -- 7a. Admin / Manager — full access
        DROP POLICY IF EXISTS oi_admin ON order_items;
        CREATE POLICY oi_admin ON order_items FOR ALL
            USING  (is_admin() OR is_manager())
            WITH CHECK (is_admin() OR is_manager());

        -- 7b. Waiter — read/insert/update items on orders in their branch
        DROP POLICY IF EXISTS oi_waiter_select ON order_items;
        CREATE POLICY oi_waiter_select ON order_items FOR SELECT
            USING (
                auth_has_role('waiter')
                AND EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.id = order_items.order_id
                      AND o.branch_id = ANY(auth_branch_ids())
                )
            );

        DROP POLICY IF EXISTS oi_waiter_insert ON order_items;
        CREATE POLICY oi_waiter_insert ON order_items FOR INSERT
            WITH CHECK (
                auth_has_role('waiter')
                AND EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.id = order_items.order_id
                      AND o.branch_id = ANY(auth_branch_ids())
                )
            );

        DROP POLICY IF EXISTS oi_waiter_update ON order_items;
        CREATE POLICY oi_waiter_update ON order_items FOR UPDATE
            USING (
                auth_has_role('waiter')
                AND EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.id = order_items.order_id
                      AND o.branch_id = ANY(auth_branch_ids())
                )
            );

        -- 7c. Kitchen — read items routed to their kitchens
        DROP POLICY IF EXISTS oi_kitchen_select ON order_items;
        CREATE POLICY oi_kitchen_select ON order_items FOR SELECT
            USING (
                auth_has_role('kitchen')
                AND kitchen_id = ANY(auth_kitchen_ids())
            );

        -- 7d. Kitchen — update item status (preparing/ready)
        DROP POLICY IF EXISTS oi_kitchen_update ON order_items;
        CREATE POLICY oi_kitchen_update ON order_items FOR UPDATE
            USING (
                auth_has_role('kitchen')
                AND kitchen_id = ANY(auth_kitchen_ids())
            )
            WITH CHECK (
                auth_has_role('kitchen')
                AND kitchen_id = ANY(auth_kitchen_ids())
            );

        -- 7e. Cashier — read items for billing (on orders they can see)
        DROP POLICY IF EXISTS oi_cashier_select ON order_items;
        CREATE POLICY oi_cashier_select ON order_items FOR SELECT
            USING (
                auth_has_role('cashier')
                AND EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.id = order_items.order_id
                      AND o.branch_id = ANY(auth_branch_ids())
                      AND o.status IN ('ready','served','invoiced')
                )
            );

        -- 7f. Customer — read items on their own order
        DROP POLICY IF EXISTS oi_customer_select ON order_items;
        CREATE POLICY oi_customer_select ON order_items FOR SELECT
            USING (
                auth.role() = 'anon'
                AND EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.id = order_items.order_id
                      AND o.order_source = 'qr'
                      AND o.table_id = (
                          COALESCE(
                              (auth.jwt() -> 'app_metadata' ->> 'table_id')::UUID,
                              '00000000-0000-0000-0000-000000000000'::UUID
                          )
                      )
                )
            );
    END IF;
END $$;


-- =====================================================
-- 8.  ORDER STATUS LOGS
-- =====================================================
-- Readable by staff in the order's branch; insertable by any staff action.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_status_logs') THEN
        DROP POLICY IF EXISTS osl_admin ON order_status_logs;
        CREATE POLICY osl_admin ON order_status_logs FOR ALL
            USING  (is_admin() OR is_manager())
            WITH CHECK (is_admin() OR is_manager());

        DROP POLICY IF EXISTS osl_staff_select ON order_status_logs;
        CREATE POLICY osl_staff_select ON order_status_logs FOR SELECT
            USING (
                is_staff()
                AND EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.id = order_status_logs.order_id
                      AND o.branch_id = ANY(auth_branch_ids())
                )
            );

        DROP POLICY IF EXISTS osl_staff_insert ON order_status_logs;
        CREATE POLICY osl_staff_insert ON order_status_logs FOR INSERT
            WITH CHECK (
                is_staff()
                AND EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.id = order_status_logs.order_id
                      AND o.branch_id = ANY(auth_branch_ids())
                )
            );
    END IF;
END $$;


-- =====================================================
-- 9.  KOT TICKETS
-- =====================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kot_tickets') THEN
        -- 9a. Admin — full access
        DROP POLICY IF EXISTS kot_admin ON kot_tickets;
        CREATE POLICY kot_admin ON kot_tickets FOR ALL
            USING  (is_admin() OR is_manager())
            WITH CHECK (is_admin() OR is_manager());

        -- 9b. Kitchen — read KOTs for their kitchens
        DROP POLICY IF EXISTS kot_kitchen_select ON kot_tickets;
        CREATE POLICY kot_kitchen_select ON kot_tickets FOR SELECT
            USING (
                auth_has_role('kitchen')
                AND kitchen_id = ANY(auth_kitchen_ids())
            );

        -- 9c. Kitchen — update KOT status (preparing/ready)
        DROP POLICY IF EXISTS kot_kitchen_update ON kot_tickets;
        CREATE POLICY kot_kitchen_update ON kot_tickets FOR UPDATE
            USING (
                auth_has_role('kitchen')
                AND kitchen_id = ANY(auth_kitchen_ids())
            )
            WITH CHECK (
                auth_has_role('kitchen')
                AND kitchen_id = ANY(auth_kitchen_ids())
            );

        -- 9d. Waiter — can read KOT status (to know when food ready)
        DROP POLICY IF EXISTS kot_waiter_select ON kot_tickets;
        CREATE POLICY kot_waiter_select ON kot_tickets FOR SELECT
            USING (
                auth_has_role('waiter')
                AND EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.id = kot_tickets.order_id
                      AND o.branch_id = ANY(auth_branch_ids())
                )
            );

        -- 9e. Waiter — can INSERT new KOT tickets
        DROP POLICY IF EXISTS kot_waiter_insert ON kot_tickets;
        CREATE POLICY kot_waiter_insert ON kot_tickets FOR INSERT
            WITH CHECK (
                auth_has_role('waiter')
                AND EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.id = kot_tickets.order_id
                      AND o.branch_id = ANY(auth_branch_ids())
                )
            );

        -- 9f. Customer — read KOT status for their own order
        DROP POLICY IF EXISTS kot_customer_select ON kot_tickets;
        CREATE POLICY kot_customer_select ON kot_tickets FOR SELECT
            USING (
                auth.role() = 'anon'
                AND EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.id = kot_tickets.order_id
                      AND o.order_source = 'qr'
                      AND o.table_id = (
                          COALESCE(
                              (auth.jwt() -> 'app_metadata' ->> 'table_id')::UUID,
                              '00000000-0000-0000-0000-000000000000'::UUID
                          )
                      )
                )
            );
    END IF;
END $$;


-- =====================================================
-- 10.  KOT ITEMS
-- =====================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kot_items') THEN
        -- 10a. Admin — full access
        DROP POLICY IF EXISTS ki_admin ON kot_items;
        CREATE POLICY ki_admin ON kot_items FOR ALL
            USING  (is_admin() OR is_manager())
            WITH CHECK (is_admin() OR is_manager());

        -- 10b. Kitchen — read & update items in their KOTs
        DROP POLICY IF EXISTS ki_kitchen_select ON kot_items;
        CREATE POLICY ki_kitchen_select ON kot_items FOR SELECT
            USING (
                auth_has_role('kitchen')
                AND EXISTS (
                    SELECT 1 FROM kot_tickets kt
                    WHERE kt.id = kot_items.kot_id
                      AND kt.kitchen_id = ANY(auth_kitchen_ids())
                )
            );

        DROP POLICY IF EXISTS ki_kitchen_update ON kot_items;
        CREATE POLICY ki_kitchen_update ON kot_items FOR UPDATE
            USING (
                auth_has_role('kitchen')
                AND EXISTS (
                    SELECT 1 FROM kot_tickets kt
                    WHERE kt.id = kot_items.kot_id
                      AND kt.kitchen_id = ANY(auth_kitchen_ids())
                )
            )
            WITH CHECK (
                auth_has_role('kitchen')
                AND EXISTS (
                    SELECT 1 FROM kot_tickets kt
                    WHERE kt.id = kot_items.kot_id
                      AND kt.kitchen_id = ANY(auth_kitchen_ids())
                )
            );

        -- 10c. Waiter — read & insert KOT items
        DROP POLICY IF EXISTS ki_waiter_select ON kot_items;
        CREATE POLICY ki_waiter_select ON kot_items FOR SELECT
            USING (
                auth_has_role('waiter')
                AND EXISTS (
                    SELECT 1 FROM kot_tickets kt
                    JOIN orders o ON o.id = kt.order_id
                    WHERE kt.id = kot_items.kot_id
                      AND o.branch_id = ANY(auth_branch_ids())
                )
            );

        DROP POLICY IF EXISTS ki_waiter_insert ON kot_items;
        CREATE POLICY ki_waiter_insert ON kot_items FOR INSERT
            WITH CHECK (
                auth_has_role('waiter')
                AND EXISTS (
                    SELECT 1 FROM kot_tickets kt
                    JOIN orders o ON o.id = kt.order_id
                    WHERE kt.id = kot_items.kot_id
                      AND o.branch_id = ANY(auth_branch_ids())
                )
            );

        -- 10d. Customer — read KOT item status for their order
        DROP POLICY IF EXISTS ki_customer_select ON kot_items;
        CREATE POLICY ki_customer_select ON kot_items FOR SELECT
            USING (
                auth.role() = 'anon'
                AND EXISTS (
                    SELECT 1 FROM kot_tickets kt
                    JOIN orders o ON o.id = kt.order_id
                    WHERE kt.id = kot_items.kot_id
                      AND o.order_source = 'qr'
                      AND o.table_id = (
                          COALESCE(
                              (auth.jwt() -> 'app_metadata' ->> 'table_id')::UUID,
                              '00000000-0000-0000-0000-000000000000'::UUID
                          )
                      )
                )
            );
    END IF;
END $$;


-- =====================================================
-- 11.  PAYMENT METHODS (reference table)
-- =====================================================
-- Readable by everyone. Mutable only by admin.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_methods') THEN
        DROP POLICY IF EXISTS pm_select ON payment_methods;
        CREATE POLICY pm_select ON payment_methods FOR SELECT
            USING (true);

        DROP POLICY IF EXISTS pm_admin ON payment_methods;
        CREATE POLICY pm_admin ON payment_methods FOR ALL
            USING  (is_admin())
            WITH CHECK (is_admin());
    END IF;
END $$;


-- =====================================================
-- =====================================================
-- 12.  POS INVOICES
-- =====================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_invoices') THEN
        DROP POLICY IF EXISTS pi_admin ON pos_invoices;
        CREATE POLICY pi_admin ON pos_invoices FOR ALL
            USING  (is_admin() OR (is_manager() AND branch_id = ANY(auth_branch_ids())))
            WITH CHECK (is_admin() OR (is_manager() AND branch_id = ANY(auth_branch_ids())));

        DROP POLICY IF EXISTS pi_cashier_select ON pos_invoices;
        CREATE POLICY pi_cashier_select ON pos_invoices FOR SELECT
            USING (
                auth_has_role('cashier')
                AND branch_id = ANY(auth_branch_ids())
            );

        DROP POLICY IF EXISTS pi_cashier_insert ON pos_invoices;
        CREATE POLICY pi_cashier_insert ON pos_invoices FOR INSERT
            WITH CHECK (
                auth_has_role('cashier')
                AND branch_id = ANY(auth_branch_ids())
            );

        DROP POLICY IF EXISTS pi_cashier_update ON pos_invoices;
        CREATE POLICY pi_cashier_update ON pos_invoices FOR UPDATE
            USING (
                auth_has_role('cashier')
                AND branch_id = ANY(auth_branch_ids())
            )
            WITH CHECK (
                auth_has_role('cashier')
                AND branch_id = ANY(auth_branch_ids())
            );

        DROP POLICY IF EXISTS pi_waiter_select ON pos_invoices;
        CREATE POLICY pi_waiter_select ON pos_invoices FOR SELECT
            USING (
                auth_has_role('waiter')
                AND branch_id = ANY(auth_branch_ids())
            );
    END IF;
END $$;

-- =====================================================
-- 13.  POS INVOICE ITEMS
-- =====================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_invoice_items') THEN
        DROP POLICY IF EXISTS pii_admin ON pos_invoice_items;
        CREATE POLICY pii_admin ON pos_invoice_items FOR ALL
            USING  (is_admin() OR is_manager())
            WITH CHECK (is_admin() OR is_manager());

        DROP POLICY IF EXISTS pii_cashier_select ON pos_invoice_items;
        CREATE POLICY pii_cashier_select ON pos_invoice_items FOR SELECT
            USING (
                auth_has_role('cashier')
                AND EXISTS (
                    SELECT 1 FROM pos_invoices pi
                    WHERE pi.id = pos_invoice_items.invoice_id
                      AND pi.branch_id = ANY(auth_branch_ids())
                )
            );

        DROP POLICY IF EXISTS pii_cashier_insert ON pos_invoice_items;
        CREATE POLICY pii_cashier_insert ON pos_invoice_items FOR INSERT
            WITH CHECK (
                auth_has_role('cashier')
                AND EXISTS (
                    SELECT 1 FROM pos_invoices pi
                    WHERE pi.id = pos_invoice_items.invoice_id
                      AND pi.branch_id = ANY(auth_branch_ids())
                )
            );

        DROP POLICY IF EXISTS pii_waiter_select ON pos_invoice_items;
        CREATE POLICY pii_waiter_select ON pos_invoice_items FOR SELECT
            USING (
                auth_has_role('waiter')
                AND EXISTS (
                    SELECT 1 FROM pos_invoices pi
                    WHERE pi.id = pos_invoice_items.invoice_id
                      AND pi.branch_id = ANY(auth_branch_ids())
                )
            );
    END IF;
END $$;

-- =====================================================
-- 14.  POS PAYMENTS
-- =====================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_payments') THEN
        DROP POLICY IF EXISTS pp_admin ON pos_payments;
        CREATE POLICY pp_admin ON pos_payments FOR ALL
            USING  (is_admin() OR is_manager())
            WITH CHECK (is_admin() OR is_manager());

        DROP POLICY IF EXISTS pp_cashier_select ON pos_payments;
        CREATE POLICY pp_cashier_select ON pos_payments FOR SELECT
            USING (
                auth_has_role('cashier')
                AND EXISTS (
                    SELECT 1 FROM pos_invoices pi
                    WHERE pi.id = pos_payments.invoice_id
                      AND pi.branch_id = ANY(auth_branch_ids())
                )
            );

        DROP POLICY IF EXISTS pp_cashier_insert ON pos_payments;
        CREATE POLICY pp_cashier_insert ON pos_payments FOR INSERT
            WITH CHECK (
                auth_has_role('cashier')
                AND EXISTS (
                    SELECT 1 FROM pos_invoices pi
                    WHERE pi.id = pos_payments.invoice_id
                      AND pi.branch_id = ANY(auth_branch_ids())
                )
            );

        DROP POLICY IF EXISTS pp_waiter_select ON pos_payments;
        CREATE POLICY pp_waiter_select ON pos_payments FOR SELECT
            USING (
                auth_has_role('waiter')
                AND EXISTS (
                    SELECT 1 FROM pos_invoices pi
                    WHERE pi.id = pos_payments.invoice_id
                      AND pi.branch_id = ANY(auth_branch_ids())
                )
            );
    END IF;
END $$;


-- =====================================================
-- 15.  GRANT ANON ACCESS (for customer sessions)
-- =====================================================
-- Anonymous users need SELECT on the tables where
-- customer policies are defined.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'categories')        THEN GRANT SELECT ON categories        TO anon; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'menu_items')        THEN GRANT SELECT ON menu_items        TO anon; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_variants')     THEN GRANT SELECT ON item_variants     TO anon; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN GRANT SELECT ON restaurant_tables TO anon; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders')            THEN GRANT SELECT ON orders            TO anon; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items')       THEN GRANT SELECT ON order_items       TO anon; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kot_tickets')       THEN GRANT SELECT ON kot_tickets       TO anon; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kot_items')         THEN GRANT SELECT ON kot_items         TO anon; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_methods')   THEN GRANT SELECT ON payment_methods   TO anon; END IF;
END $$;

-- Authenticated gets broader access
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'categories')        THEN GRANT ALL ON categories         TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'menu_items')        THEN GRANT ALL ON menu_items         TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_variants')     THEN GRANT ALL ON item_variants      TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'restaurant_tables') THEN GRANT ALL ON restaurant_tables  TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchens')          THEN GRANT ALL ON kitchens           TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders')            THEN GRANT ALL ON orders             TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items')       THEN GRANT ALL ON order_items        TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_status_logs') THEN GRANT ALL ON order_status_logs  TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kot_tickets')       THEN GRANT ALL ON kot_tickets        TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kot_items')         THEN GRANT ALL ON kot_items          TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_methods')   THEN GRANT ALL ON payment_methods    TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_invoices')      THEN GRANT ALL ON pos_invoices       TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_invoice_items') THEN GRANT ALL ON pos_invoice_items  TO authenticated; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_payments')      THEN GRANT ALL ON pos_payments       TO authenticated; END IF;
END $$;

-- Grant sequence usage for serial columns
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
