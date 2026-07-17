-- =====================================================
-- POS BILLING SCHEMA — idempotent (safe to re-run)
-- =====================================================

-- =====================================================
-- 1. UTILITIES
-- =====================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. PAYMENT METHODS
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO payment_methods (name, description) VALUES
    ('Cash',     'Cash payment'),
    ('Card',     'Credit/Debit Card'),
    ('Online',   'Online Payment (UberEats, PickMe, etc.)'),
    ('Transfer', 'Bank Transfer')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 3. INVOICES
-- =====================================================

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id  UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    order_id   UUID NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
    invoice_number SERIAL,
    customer_name  TEXT,
    customer_phone TEXT,

    subtotal       NUMERIC(12,2) DEFAULT 0,
    tax_total      NUMERIC(12,2) DEFAULT 0,
    discount_total NUMERIC(12,2) DEFAULT 0,
    grand_total    NUMERIC(12,2) DEFAULT 0,

    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    status         TEXT NOT NULL DEFAULT 'issued',

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_invoice_payment_status CHECK (
        payment_status IN ('unpaid', 'partial', 'paid', 'refunded')
    ),
    CONSTRAINT chk_invoice_status CHECK (
        status IN ('issued', 'voided', 'paid')
    )
);

CREATE INDEX IF NOT EXISTS idx_invoices_order   ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch  ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC);

DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 4. INVOICE ITEMS
-- =====================================================
-- Column names match the live DB schema:
--   description  (not menu_item_name)
--   qty          (not quantity)
--   line_total   (not total_price)
--   discount     (not discount_amount)

CREATE TABLE IF NOT EXISTS invoice_items (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id    UUID NOT NULL REFERENCES invoices(id)    ON DELETE CASCADE,
    order_item_id UUID          REFERENCES order_items(id) ON DELETE SET NULL,
    description   TEXT NOT NULL,
    qty           INTEGER NOT NULL,
    unit_price    NUMERIC(12,2) NOT NULL,
    line_total    NUMERIC(12,2) NOT NULL,
    tax_amount    NUMERIC(12,2) DEFAULT 0,
    discount      NUMERIC(12,2) DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- =====================================================
-- 5. PAYMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS payments (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id        UUID NOT NULL REFERENCES invoices(id)        ON DELETE CASCADE,
    payment_method_id UUID NOT NULL REFERENCES payment_methods(id),
    amount            NUMERIC(12,2) NOT NULL,
    transaction_ref   TEXT,
    status            TEXT NOT NULL DEFAULT 'completed',
    received_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes             TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_payment_status CHECK (
        status IN ('pending', 'completed', 'failed', 'refunded')
    )
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_method  ON payments(payment_method_id);

-- =====================================================
-- 6. VOID TRANSACTIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS void_transactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type         TEXT NOT NULL,
    entity_id           UUID NOT NULL,
    reason              TEXT NOT NULL,
    voided_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
    manager_approval_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    voided_at           TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT chk_void_entity_type CHECK (
        entity_type IN ('invoice', 'payment')
    )
);

CREATE INDEX IF NOT EXISTS idx_void_entity ON void_transactions(entity_id);

-- =====================================================
-- 7. REALTIME
-- =====================================================

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
