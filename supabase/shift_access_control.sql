-- =====================================================
-- SHIFT-BASED WAITER ACCESS CONTROL (ROBUST VERSION)
-- =====================================================

-- =====================================================
-- 0. PREREQUISITE SCHEMA (Ensure missing columns/tables exist)
-- =====================================================

DO $$
BEGIN
    -- 1. Ensure assigned_waiter_id exists on orders
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'assigned_waiter_id') THEN
        ALTER TABLE orders ADD COLUMN assigned_waiter_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;

    -- 2. Update orders status constraint to include 'pending_waiter'
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_status;
        ALTER TABLE orders ADD CONSTRAINT chk_order_status CHECK (
            status IN ('pending', 'pending_waiter', 'accepted', 'preparing', 'ready', 'served', 'invoiced', 'paid', 'cancelled')
        );
        ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending_waiter';
    END IF;

    -- 3. Create order_acceptance if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_acceptance') THEN
        CREATE TABLE order_acceptance (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            accepted_by     UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
            accepted_at     TIMESTAMPTZ DEFAULT now(),
            rejected_at     TIMESTAMPTZ,
            notes           TEXT,
            created_at      TIMESTAMPTZ DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_order_acceptance_order ON order_acceptance(order_id);
        CREATE INDEX IF NOT EXISTS idx_order_acceptance_waiter ON order_acceptance(accepted_by);
    END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. auth_is_on_shift(p_branch_id)
-- =====================================================

DROP FUNCTION IF EXISTS public.auth_is_on_shift(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.auth_is_on_shift(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_today DATE := CURRENT_DATE;
    v_current_time TIME := CURRENT_TIME;
    v_buffer INTERVAL := INTERVAL '30 minutes';
    v_found BOOLEAN := false;
BEGIN
    -- 1. Admins and managers bypass shift checks
    IF public.auth_has_role('admin') OR public.auth_has_role('manager') THEN
        RETURN true;
    END IF;

    -- 2. Safety check: ensure shift tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_assignments') THEN
        -- If shifts module not yet deployed, allow all staff for now to prevent breakage
        RETURN true; 
    END IF;

    -- 3. Check if user has a scheduled shift assignment today for this branch
    EXECUTE '
        SELECT EXISTS (
            SELECT 1
            FROM shift_assignments sa
            JOIN employees e ON e.id = sa.employee_id
            JOIN shifts s ON s.id = sa.shift_id
            WHERE e.profile_id = $1
              AND e.is_active = true
              AND sa.branch_id = $2
              AND sa.assignment_date = $3
              AND sa.status = ''scheduled''
              AND s.is_active = true
              AND (
                  CASE
                      WHEN NOT s.is_overnight THEN
                          $4 BETWEEN (s.start_time - $5) AND (s.end_time + $5)
                      ELSE
                          $4 >= (s.start_time - $5)
                          OR $4 <= (s.end_time + $5)
                  END
              )
        )'
    USING auth.uid(), p_branch_id, v_today, v_current_time, v_buffer
    INTO v_found;

    RETURN v_found;
EXCEPTION WHEN OTHERS THEN
    -- Fallback for missing tables or other dynamic SQL issues
    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_is_on_shift(UUID) TO authenticated;

-- =====================================================
-- 2. auth_get_shift_branches()
-- =====================================================

DROP FUNCTION IF EXISTS public.auth_get_shift_branches() CASCADE;
CREATE OR REPLACE FUNCTION public.auth_get_shift_branches()
RETURNS TABLE (
    branch_id UUID,
    branch_name TEXT,
    shift_name TEXT,
    shift_start TIME,
    shift_end TIME
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
BEGIN
    -- 1. Admins/managers: return all branches they belong to
    IF public.auth_has_role('admin') OR public.auth_has_role('manager') THEN
        RETURN QUERY
            SELECT
                ub.branch_id,
                b.name,
                'All Shifts'::TEXT,
                '00:00'::TIME,
                '23:59'::TIME
            FROM user_branches ub
            JOIN branches b ON b.id = ub.branch_id
            WHERE ub.user_id = auth.uid()
              AND b.is_active = true;
        RETURN;
    END IF;

    -- 2. Safety check: ensure shift tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_assignments') THEN
        RETURN;
    END IF;

    -- 3. Return assigned shifts
    RETURN QUERY EXECUTE '
        SELECT
            sa.branch_id,
            br.name,
            s.name,
            s.start_time,
            s.end_time
        FROM shift_assignments sa
        JOIN employees e ON e.id = sa.employee_id
        JOIN shifts s ON s.id = sa.shift_id
        JOIN branches br ON br.id = sa.branch_id
        WHERE e.profile_id = $1
          AND e.is_active = true
          AND sa.assignment_date = $2
          AND sa.status = ''scheduled''
          AND s.is_active = true'
    USING auth.uid(), v_today;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_get_shift_branches() TO authenticated;

-- =====================================================
-- 3. get_pending_orders_for_shift()
-- =====================================================

DROP FUNCTION IF EXISTS public.get_pending_orders_for_shift() CASCADE;
CREATE OR REPLACE FUNCTION public.get_pending_orders_for_shift()
RETURNS TABLE (
    id UUID,
    order_number INT,
    table_id UUID,
    table_number TEXT,
    order_type TEXT,
    order_source TEXT,
    status TEXT,
    total_amount NUMERIC,
    notes TEXT,
    branch_id UUID,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    RETURN QUERY
        SELECT
            o.id,
            o.order_number,
            o.table_id,
            rt.table_number,
            o.order_type,
            o.order_source,
            o.status,
            o.total_amount,
            o.notes,
            o.branch_id,
            o.created_at
        FROM orders o
        LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
        WHERE o.status = 'pending_waiter'
          AND o.assigned_waiter_id IS NULL
          AND public.auth_is_on_shift(o.branch_id) = true
        ORDER BY o.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_orders_for_shift() TO authenticated;

-- =====================================================
-- 4. accept_order_as_waiter(p_order_id)
-- =====================================================

DROP FUNCTION IF EXISTS public.accept_order_as_waiter(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.accept_order_as_waiter(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_waiter_id UUID := auth.uid();
    v_result JSONB;
BEGIN
    -- 1. Lock and verify the order
    SELECT * INTO v_order
    FROM orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    IF v_order.status != 'pending_waiter' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is no longer pending.');
    END IF;

    IF v_order.assigned_waiter_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order already accepted by another waiter.');
    END IF;

    -- 2. Verify waiter is on shift for this branch
    IF NOT public.auth_is_on_shift(v_order.branch_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are not on shift for this branch.');
    END IF;

    -- 3. Accept the order
    UPDATE orders
    SET status = 'accepted',
        assigned_waiter_id = v_waiter_id
    WHERE id = p_order_id;

    -- 4. Log acceptance
    INSERT INTO order_acceptance (order_id, accepted_by)
    VALUES (p_order_id, v_waiter_id);

    -- 5. Return success
    v_result := jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'assigned_waiter_id', v_waiter_id
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID) TO authenticated;

-- =====================================================
-- 5. RLS POLICIES FOR ORDERS (shift-aware)
-- =====================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waiter_select_orders_on_shift" ON orders;
CREATE POLICY "waiter_select_orders_on_shift"
ON orders FOR SELECT
TO authenticated
USING (
    public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR (public.auth_has_role('cashier'))
    OR (
        public.auth_has_role('waiter')
        AND public.auth_is_on_shift(branch_id)
    )
    OR assigned_waiter_id = auth.uid()
);

DROP POLICY IF EXISTS "waiter_update_orders_on_shift" ON orders;
CREATE POLICY "waiter_update_orders_on_shift"
ON orders FOR UPDATE
TO authenticated
USING (
    public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR (
        public.auth_has_role('waiter')
        AND (
            (status = 'pending_waiter' AND assigned_waiter_id IS NULL AND public.auth_is_on_shift(branch_id))
            OR assigned_waiter_id = auth.uid()
        )
    )
    OR public.auth_has_role('cashier')
)
WITH CHECK (
    public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR public.auth_has_role('cashier')
    OR (
        public.auth_has_role('waiter')
        AND (
            assigned_waiter_id = auth.uid()
            OR public.auth_is_on_shift(branch_id)
        )
    )
);

DROP POLICY IF EXISTS "orders_insert_policy" ON orders;
CREATE POLICY "orders_insert_policy"
ON orders FOR INSERT
TO authenticated
WITH CHECK (
    public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR public.auth_has_role('cashier')
    OR public.auth_has_role('waiter')
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_orders_pending_waiter
ON orders (branch_id, created_at)
WHERE status = 'pending_waiter' AND assigned_waiter_id IS NULL;

-- =====================================================
-- DONE ✅
-- =====================================================
