-- =============================================================
-- EMERGENCY KDS VISIBILITY & ROUTING OVERRIDE (CASHIER PRIORITY)
-- =============================================================
-- This script is aggressive. It will:
-- 1. Disable RLS on KOT tables for a moment and re-enable with permissive policies.
-- 2. Force ALL active branch KOTs to the main "CASHIER" kitchen.
-- 3. Ensure the current staff can see EVERYTHING in their branch.

-- 1. Permissive Policies (Rule out RLS)
ALTER TABLE kot_tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE kot_items   DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kot_permissive ON kot_tickets;
CREATE POLICY kot_branch_scoped ON kot_tickets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = kot_tickets.order_id
        AND o.branch_id = ANY(auth_branch_ids())
    )
  );

DROP POLICY IF EXISTS ki_permissive ON kot_items;
CREATE POLICY ki_branch_scoped ON kot_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kot_tickets kt
      JOIN orders o ON o.id = kt.order_id
      WHERE kt.id = kot_items.kot_id
        AND o.branch_id = ANY(auth_branch_ids())
    )
  );

ALTER TABLE kot_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kot_items   ENABLE ROW LEVEL SECURITY;

-- 2. ROUTING OVERRIDE: Find the "CASHIER" kitchen and route EVERYTHING to it
DO $$
DECLARE
    v_cashier_k_id UUID;
    v_branch_id UUID;
    v_ord RECORD;
BEGIN
    -- For each branch, find the best "CASHIER" kitchen
    FOR v_branch_id IN SELECT id FROM branches LOOP
        
        SELECT id INTO v_cashier_k_id FROM kitchens 
        WHERE branch_id = v_branch_id AND name ILIKE '%CASHIER%' AND is_active = true 
        LIMIT 1;

        IF v_cashier_k_id IS NOT NULL THEN
            -- Update all items to this kitchen
            UPDATE order_items 
            SET kitchen_id = v_cashier_k_id
            WHERE order_id IN (SELECT id FROM orders WHERE branch_id = v_branch_id AND status IN ('accepted', 'preparing', 'ready'));

            -- Update all existing kot_tickets to this kitchen
            UPDATE kot_tickets 
            SET kitchen_id = v_cashier_k_id
            WHERE order_id IN (SELECT id FROM orders WHERE branch_id = v_branch_id AND status IN ('accepted', 'preparing', 'ready'));
            
            -- Ensure any Cashier/Kitchen user in this branch is assigned to this specific ID
            UPDATE profiles 
            SET kitchen_id = v_cashier_k_id
            WHERE id IN (
                SELECT user_id FROM user_roles ur 
                JOIN roles r ON ur.role_id = r.id 
                WHERE r.name IN ('cashier', 'kitchen')
            ) AND id IN (
                SELECT user_id FROM user_branches WHERE branch_id = v_branch_id
            );
        END IF;
    END LOOP;
END $$;

-- 3. Trigger Repair: Ensure KOTs are 'created' not 'pending'
UPDATE kot_tickets SET status = 'created' WHERE status = 'pending';

-- 4. Force dispatch refresh
UPDATE kot_dispatches SET status = 'pending' WHERE status != 'completed';
