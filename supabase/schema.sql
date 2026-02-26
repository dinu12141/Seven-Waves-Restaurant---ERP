-- =====================================================
-- EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. COMPANIES
-- =====================================================

DROP TABLE IF EXISTS companies CASCADE;
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 2. BRANCHES
-- =====================================================

DROP TABLE IF EXISTS branches CASCADE;
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    is_main BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_branches_company_id ON branches(company_id);

-- =====================================================
-- 3. KITCHENS
-- =====================================================

DROP TABLE IF EXISTS kitchens CASCADE;
CREATE TABLE kitchens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_kitchens_branch_id ON kitchens(branch_id);

-- =====================================================
-- 4. RESTAURANT TABLES
-- =====================================================

DROP TABLE IF EXISTS restaurant_tables CASCADE;
CREATE TABLE restaurant_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    section TEXT,
    capacity INTEGER DEFAULT 4,
    status TEXT DEFAULT 'available', -- available, occupied, reserved, maintenance
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, table_number)
);

CREATE INDEX idx_tables_branch_id ON restaurant_tables(branch_id);

-- =====================================================
-- 2. USERS & RBAC
-- =====================================================

-- profiles linked to auth.users
-- We invoke CASCADE to clear dependent tables but we do NOT drop auth.users
DROP TABLE IF EXISTS profiles CASCADE;
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS roles CASCADE;
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL, -- admin, manager, waiter, cashier, kitchen, hr, inventory, finance
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS permissions CASCADE;
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL, -- e.g. 'inventory.read'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS role_permissions CASCADE;
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(role_id, permission_id)
);

DROP TABLE IF EXISTS user_roles CASCADE;
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, role_id)
);

DROP TABLE IF EXISTS user_branches CASCADE;
CREATE TABLE user_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    is_home_branch BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, branch_id)
);

-- Index for RLS performance
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_branches_user_id ON user_branches(user_id);

-- Insert Default Roles
INSERT INTO roles (name, description) VALUES
('admin', 'System Administrator with full access'),
('manager', 'Branch Manager'),
('waiter', 'Wait Staff'),
('cashier', 'Cashier'),
('kitchen', 'Kitchen Staff'),
('hr', 'Human Resources'),
('inventory', 'Inventory Manager'),
('finance', 'Finance Manager')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 3. MENU & RECIPES
-- =====================================================

DROP TABLE IF EXISTS categories CASCADE;
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    sort_order INT DEFAULT 0
);

DROP TABLE IF EXISTS menu_items CASCADE;
CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    kitchen_id UUID REFERENCES kitchens(id),
    preparation_time_minutes INT,
    is_available BOOLEAN DEFAULT true
);

DROP TABLE IF EXISTS ingredients CASCADE;
CREATE TABLE ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    cost_per_unit NUMERIC(10,2)
);

DROP TABLE IF EXISTS recipes CASCADE;
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id),
    quantity NUMERIC(10,4) NOT NULL,
    UNIQUE(menu_item_id, ingredient_id)
);

-- =====================================================
-- 4. INVENTORY (STORE BASED)
-- =====================================================

DROP TABLE IF EXISTS stores CASCADE;
CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT -- main, kitchen, bar, freezer
);

DROP TABLE IF EXISTS stock_levels CASCADE;
CREATE TABLE stock_levels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id),
    quantity NUMERIC(10,4) DEFAULT 0,
    UNIQUE(store_id, ingredient_id)
);

DROP TABLE IF EXISTS stock_movements CASCADE;
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id),
    ingredient_id UUID REFERENCES ingredients(id),
    quantity NUMERIC(10,4),
    movement_type TEXT,
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 5. ORDER ENGINE
-- =====================================================

DROP TABLE IF EXISTS orders CASCADE;
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id),
    table_id UUID REFERENCES restaurant_tables(id),
    order_source TEXT, -- qr,pos,website,uber,pickme
    order_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    waiter_id UUID REFERENCES profiles(id),
    total_amount NUMERIC(10,2) DEFAULT 0,
    payment_status TEXT DEFAULT 'unpaid',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS order_items CASCADE;
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id),
    quantity INT DEFAULT 1,
    unit_price NUMERIC(10,2),
    kitchen_id UUID REFERENCES kitchens(id),
    status TEXT DEFAULT 'queued',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- ORDER STATUS HISTORY
-- =====================================================

DROP TABLE IF EXISTS order_status_logs CASCADE;
CREATE TABLE order_status_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT,
    changed_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- KOT SYSTEM
-- =====================================================

DROP TABLE IF EXISTS kot_tickets CASCADE;
CREATE TABLE kot_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    kitchen_id UUID REFERENCES kitchens(id),
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

DROP TABLE IF EXISTS kot_items CASCADE;
CREATE TABLE kot_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kot_id UUID REFERENCES kot_tickets(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id),
    status TEXT DEFAULT 'queued'
);

-- =====================================================
-- PAYMENTS
-- =====================================================

DROP TABLE IF EXISTS payments CASCADE;
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    amount NUMERIC(10,2),
    payment_method TEXT,
    transaction_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- AUDIT LOGS
-- =====================================================

DROP TABLE IF EXISTS audit_logs CASCADE;
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id),
    action TEXT,
    table_name TEXT,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- ORDER EVENT TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION log_order_status()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO order_status_logs(order_id,status,changed_by)
    VALUES(NEW.id, NEW.status, NEW.waiter_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_status ON orders;
CREATE TRIGGER trg_order_status
AFTER INSERT OR UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION log_order_status();

-- =====================================================
-- REALTIME
-- =====================================================

DO $$
BEGIN
    -- Only add to publication if not already present
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'orders') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'order_items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'kot_tickets') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE kot_tickets;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stock_levels') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE stock_levels;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'order_status_logs') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE order_status_logs;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'kot_items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE kot_items;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'restaurant_tables') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE restaurant_tables;
    END IF;
END $$;

-- Enable full replica identity so UPDATE/DELETE payloads include old row data
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE order_items REPLICA IDENTITY FULL;
ALTER TABLE kot_tickets REPLICA IDENTITY FULL;
