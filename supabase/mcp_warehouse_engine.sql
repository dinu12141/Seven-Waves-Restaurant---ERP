-- ERP-Standard Store & Warehouse Management System
-- Part 1: Items Identity & Extensions

-- Adding item_type to items table if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'item_type') THEN
        ALTER TABLE public.items ADD COLUMN item_type TEXT DEFAULT 'Raw Material' CHECK (item_type IN ('Finish Good', 'Raw Material', 'Packing Set', 'Servable', 'Non Servable'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'barcode') THEN
        ALTER TABLE public.items ADD COLUMN barcode TEXT;
    END IF;
END $$;

-- Extend warehouses with category if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'warehouses' AND column_name = 'category') THEN
        ALTER TABLE public.warehouses ADD COLUMN category TEXT DEFAULT 'Stores' CHECK (category IN ('Selling', 'Brand', 'Stores', 'Service'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'warehouses' AND column_name = 'responsible_person_id') THEN
        ALTER TABLE public.warehouses ADD COLUMN responsible_person_id UUID REFERENCES public.employees(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'warehouses' AND column_name = 'contact_no') THEN
        ALTER TABLE public.warehouses ADD COLUMN contact_no TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'warehouses' AND column_name = 'city') THEN
        ALTER TABLE public.warehouses ADD COLUMN city TEXT;
    END IF;
END $$;

-- Part 2: BOM Engine (Multi-level)
CREATE TABLE IF NOT EXISTS public.inventory_bom (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id),
    branch_id UUID REFERENCES public.branches(id),
    finished_item_id UUID NOT NULL REFERENCES public.items(id), -- This is the output item
    name TEXT NOT NULL,
    version NUMERIC DEFAULT 1.0,
    is_active BOOLEAN DEFAULT true,
    total_estimated_cost NUMERIC DEFAULT 0,
    yield_quantity NUMERIC DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.inventory_bom_items (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    bom_id UUID NOT NULL REFERENCES public.inventory_bom(id) ON DELETE CASCADE,
    raw_material_id UUID NOT NULL REFERENCES public.items(id),
    uom_id UUID NOT NULL REFERENCES public.uom(id),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC DEFAULT 0,
    total_cost NUMERIC GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Part 3: Good Request Notes (Internal requests)
CREATE TABLE IF NOT EXISTS public.good_request_notes (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id),
    branch_id UUID NOT NULL REFERENCES public.branches(id),
    request_no TEXT NOT NULL UNIQUE,
    request_date DATE DEFAULT CURRENT_DATE,
    need_date DATE NOT NULL,
    request_warehouse_id UUID REFERENCES public.warehouses(id), -- the warehouse requesting the goods
    source_warehouse_id UUID REFERENCES public.warehouses(id), -- the warehouse supplying the goods
    requested_by UUID REFERENCES public.employees(id),
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Issued', 'Partially Issued')),
    remarks TEXT,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.good_request_items (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    good_request_id UUID NOT NULL REFERENCES public.good_request_notes(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.items(id),
    uom_id UUID NOT NULL REFERENCES public.uom(id),
    requested_qty NUMERIC NOT NULL CHECK (requested_qty > 0),
    issued_qty NUMERIC DEFAULT 0,
    current_stock NUMERIC DEFAULT 0, -- snapshot of stock at request
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Part 4: Barcode Engine
CREATE TABLE IF NOT EXISTS public.item_barcodes (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id),
    item_id UUID NOT NULL REFERENCES public.items(id),
    barcode TEXT NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id), -- Optional mapping per warehouse
    created_at TIMESTAMPTZ DEFAULT NOW(),
    print_logs_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    UNIQUE (company_id, barcode)
);

-- Part 5: RLS Policies for new tables
ALTER TABLE public.inventory_bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.good_request_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.good_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_barcodes ENABLE ROW LEVEL SECURITY;

-- Creating basic policies based on branch and company filtering (using current ERP standards)
DO $$
BEGIN
    -- Only create if not exist
    BEGIN
        CREATE POLICY "company_isolation_bom" ON public.inventory_bom FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    
    BEGIN
        CREATE POLICY "company_isolation_bom_items" ON public.inventory_bom_items FOR ALL USING (bom_id IN (SELECT id FROM public.inventory_bom WHERE company_id = auth.uid() OR company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        CREATE POLICY "company_isolation_grn" ON public.good_request_notes FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    
    BEGIN
        CREATE POLICY "company_isolation_gri" ON public.good_request_items FOR ALL USING (good_request_id IN (SELECT id FROM public.good_request_notes WHERE company_id = auth.uid() OR company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())));
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        CREATE POLICY "company_isolation_barcodes" ON public.item_barcodes FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid()));
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Part 6: Stock Ledger View as requested
-- We will build a unified view based on inventory_ledger which tracks ALL IN/OUT changes.
CREATE OR REPLACE VIEW public.stock_ledger AS
SELECT 
    il.id,
    il.company_id,
    il.branch_id,
    il.warehouse_id,
    w.name as warehouse_name,
    il.item_id,
    i.name as item_name,
    i.code as item_code,
    i.item_type,
    il.document_id,
    il.doc_type,
    il.doc_number,
    il.direction,
    il.quantity,
    il.unit_cost,
    il.total_cost,
    il.posted_at as transaction_date,
    p.full_name as posted_by_name
FROM 
    public.inventory_ledger il
JOIN public.items i ON il.item_id = i.id
JOIN public.warehouses w ON il.warehouse_id = w.id
LEFT JOIN public.profiles p ON il.posted_by = p.id;

-- Part 7: Automation Triggers

-- 1) Alert generator on Reorder Level Breach (Trigger on stock_on_hand)
CREATE OR REPLACE FUNCTION check_reorder_level_alert()
RETURNS TRIGGER AS $$
DECLARE
    v_item_name TEXT;
    v_reorder_level NUMERIC;
BEGIN
    -- Only run if qty dropped
    IF NEW.qty_on_hand < OLD.qty_on_hand THEN
        SELECT name, reorder_level INTO v_item_name, v_reorder_level FROM public.items WHERE id = NEW.item_id;
        
        IF NEW.qty_on_hand <= COALESCE(v_reorder_level, 0) AND v_reorder_level > 0 THEN
            -- Generate Alert in Notifications
            INSERT INTO public.notifications (
                company_id, title, message, type, entity_type, entity_id
            ) VALUES (
                NEW.company_id, 
                'Low Stock Alert: ' || v_item_name, 
                'Stock for ' || v_item_name || ' has dropped to ' || NEW.qty_on_hand || ' which is at or below the reorder level of ' || v_reorder_level,
                'warning', 
                'inventory', 
                NEW.item_id
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
    DROP TRIGGER IF EXISTS trg_stock_reorder_alert ON public.stock_on_hand;
    CREATE TRIGGER trg_stock_reorder_alert
        AFTER UPDATE ON public.stock_on_hand
        FOR EACH ROW
        EXECUTE FUNCTION check_reorder_level_alert();
END $$;

-- 2) Update BOM Costs
CREATE OR REPLACE FUNCTION update_bom_cost()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.inventory_bom
    SET total_estimated_cost = (
        SELECT COALESCE(SUM(total_cost), 0) 
        FROM public.inventory_bom_items 
        WHERE bom_id = NEW.bom_id
    )
    WHERE id = NEW.bom_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    DROP TRIGGER IF EXISTS trg_update_bom_cost ON public.inventory_bom_items;
    CREATE TRIGGER trg_update_bom_cost
        AFTER INSERT OR UPDATE OR DELETE ON public.inventory_bom_items
        FOR EACH ROW
        EXECUTE FUNCTION update_bom_cost();
END $$;

-- Note: The triggers for GRN confirm / GIN confirm already exist in the system 
-- within inventory_documents processing (posting a document inserts into inventory_ledger 
-- which triggers stock_on_hand updates). We will not recreate them to avoid conflicts.
