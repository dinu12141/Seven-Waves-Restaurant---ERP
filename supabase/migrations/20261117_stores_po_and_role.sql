-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores Role, Stores PO Column & Approval Status Support
-- Seven Waves Restaurant (Pvt) Ltd
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Add 'stores' role if not already present
INSERT INTO roles (name, description) VALUES
    ('stores', 'Stores / Storekeeper role for stock inventory and Purchase Order initiation')
ON CONFLICT (name) DO NOTHING;

-- 2. Add 'source' and 'reject_reason' columns to purchase_orders if not present
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'procurement';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- 3. Update status constraint on purchase_orders to allow pending_approval and rejected
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS chk_po_status;
ALTER TABLE purchase_orders ADD CONSTRAINT chk_po_status 
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'open', 'partial', 'closed', 'cancelled', 'rejected'));

-- 4. Create index on source and status for high-performance listing
CREATE INDEX IF NOT EXISTS idx_po_source_status ON purchase_orders(source, status);

-- 5. Add permission entries for Stores PO creation and Procurement approval
INSERT INTO permissions (code, description) VALUES
    ('inventory.purchase_orders.view',    'View Stores Purchase Orders'),
    ('inventory.purchase_orders.create',  'Create Purchase Orders from Stores'),
    ('procurement.stores_po.view',        'View Stores Purchase Orders in Procurement'),
    ('procurement.stores_po.approve',     'Approve or Reject Stores Purchase Orders')
ON CONFLICT (code) DO NOTHING;

-- 6. Grant default permissions to 'stores', 'inventory', 'procurement', 'manager', 'admin'
DO $$
DECLARE
    r_stores_id UUID;
    r_inv_id UUID;
    r_proc_id UUID;
    p_rec RECORD;
BEGIN
    SELECT id INTO r_stores_id FROM roles WHERE name = 'stores';
    SELECT id INTO r_inv_id FROM roles WHERE name = 'inventory';
    SELECT id INTO r_proc_id FROM roles WHERE name = 'procurement';

    IF r_stores_id IS NOT NULL THEN
        FOR p_rec IN SELECT id FROM permissions WHERE code IN (
            'inventory.dashboard.view',
            'inventory.items.view',
            'inventory.tab_items.view',
            'inventory.tab_stock.view',
            'inventory.tab_warehouses.view',
            'inventory.purchase_orders.view',
            'inventory.purchase_orders.create',
            'inventory.stocktake.view'
        ) LOOP
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (r_stores_id, p_rec.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    IF r_inv_id IS NOT NULL THEN
        FOR p_rec IN SELECT id FROM permissions WHERE code IN (
            'inventory.purchase_orders.view',
            'inventory.purchase_orders.create'
        ) LOOP
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (r_inv_id, p_rec.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    IF r_proc_id IS NOT NULL THEN
        FOR p_rec IN SELECT id FROM permissions WHERE code IN (
            'procurement.stores_po.view',
            'procurement.stores_po.approve'
        ) LOOP
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (r_proc_id, p_rec.id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
END $$;

COMMIT;
