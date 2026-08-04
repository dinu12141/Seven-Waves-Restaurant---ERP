-- =====================================================
-- PROCUREMENT MODULE (FINAL PRODUCTION VERSION)
-- =====================================================
-- Run AFTER: schema.sql, inventory_module.sql
-- Depends on: companies, branches, profiles, suppliers,
--             items, uom, warehouses, inv_doc_sequences
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- 1. PAYMENT TERMS
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_terms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    net_days INT NOT NULL DEFAULT 30,
    advance_pct NUMERIC(5,2) DEFAULT 0,
    discount_pct NUMERIC(5,2) DEFAULT 0,
    discount_days INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_pt_company ON payment_terms(company_id);

DROP TRIGGER IF EXISTS trg_payment_terms_updated ON payment_terms;
CREATE TRIGGER trg_payment_terms_updated
BEFORE UPDATE ON payment_terms
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 2. ALTER SUPPLIERS (add payment_term_id if missing)
-- =====================================================

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_term_id UUID REFERENCES payment_terms(id) ON DELETE SET NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14,2) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS balance NUMERIC(14,2) DEFAULT 0;


-- =====================================================
-- 3. SUPPLIER CONTACTS
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    designation TEXT,
    phone TEXT,
    mobile TEXT,
    email TEXT,
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sc_supplier ON supplier_contacts(supplier_id);

DROP TRIGGER IF EXISTS trg_supplier_contacts_updated ON supplier_contacts;
CREATE TRIGGER trg_supplier_contacts_updated
BEFORE UPDATE ON supplier_contacts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 4. SUPPLIER ITEM PRICES
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_item_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    uom_id UUID NOT NULL REFERENCES uom(id),
    last_price NUMERIC(14,4) NOT NULL DEFAULT 0,
    min_order_qty NUMERIC(14,4) DEFAULT 0,
    lead_time_days INT DEFAULT 0,
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(supplier_id, item_id, uom_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_sip_supplier ON supplier_item_prices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sip_item ON supplier_item_prices(item_id);
CREATE INDEX IF NOT EXISTS idx_sip_company ON supplier_item_prices(company_id);

DROP TRIGGER IF EXISTS trg_sip_updated ON supplier_item_prices;
CREATE TRIGGER trg_sip_updated
BEFORE UPDATE ON supplier_item_prices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 5. PROCUREMENT DOC NUMBER SEQUENCES (branch-scoped)
-- =====================================================

CREATE TABLE IF NOT EXISTS procurement_doc_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,
    prefix TEXT NOT NULL,
    current_number BIGINT NOT NULL DEFAULT 0,
    fiscal_year INT NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
    UNIQUE(company_id, branch_id, doc_type, fiscal_year),
    CONSTRAINT chk_proc_seq_type CHECK (
        doc_type IN ('PO','GRN','AP_INV','SUP_PAY','PUR_RET')
    )
);

CREATE OR REPLACE FUNCTION generate_proc_doc_number(
    p_company_id UUID,
    p_branch_id UUID,
    p_doc_type TEXT
)
RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT;
    v_next BIGINT;
    v_year INT := EXTRACT(YEAR FROM now());
BEGIN
    UPDATE procurement_doc_sequences
    SET current_number = current_number + 1
    WHERE company_id = p_company_id
      AND branch_id = p_branch_id
      AND doc_type = p_doc_type
      AND fiscal_year = v_year
    RETURNING prefix, current_number INTO v_prefix, v_next;

    IF v_prefix IS NULL THEN
        INSERT INTO procurement_doc_sequences (company_id, branch_id, doc_type, prefix, current_number, fiscal_year)
        VALUES (p_company_id, p_branch_id, p_doc_type, p_doc_type || '-', 1, v_year)
        RETURNING prefix, current_number INTO v_prefix, v_next;
    END IF;

    RETURN v_prefix || v_year || '-' || LPAD(v_next::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- 6. PURCHASE ORDERS
-- =====================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    doc_number TEXT NOT NULL,
    doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    payment_term_id UUID REFERENCES payment_terms(id),
    warehouse_id UUID REFERENCES warehouses(id),
    currency TEXT DEFAULT 'LKR',
    exchange_rate NUMERIC(12,6) DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    subtotal NUMERIC(14,2) DEFAULT 0,
    discount_pct NUMERIC(5,2) DEFAULT 0,
    discount_amount NUMERIC(14,2) DEFAULT 0,
    tax_amount NUMERIC(14,2) DEFAULT 0,
    total_amount NUMERIC(14,2) DEFAULT 0,
    remarks TEXT,
    internal_memo TEXT,
    created_by UUID REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id),
    approved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, doc_number),
    CONSTRAINT chk_po_status CHECK (
        status IN ('draft','approved','open','partial','closed','cancelled')
    )
);

CREATE INDEX IF NOT EXISTS idx_po_company ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_po_branch ON purchase_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_orders(doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_po_doc_number ON purchase_orders(doc_number);

DROP TRIGGER IF EXISTS trg_po_updated ON purchase_orders;
CREATE TRIGGER trg_po_updated
BEFORE UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 7. PURCHASE ORDER LINES
-- =====================================================

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    description TEXT,
    uom_id UUID NOT NULL REFERENCES uom(id),
    quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(14,4) NOT NULL CHECK (unit_price >= 0),
    discount_pct NUMERIC(5,2) DEFAULT 0,
    tax_pct NUMERIC(5,2) DEFAULT 0,
    line_total NUMERIC(14,4) GENERATED ALWAYS AS (
        ROUND(quantity * unit_price * (1 - COALESCE(discount_pct, 0) / 100), 4)
    ) STORED,
    received_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
    invoiced_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
    returned_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
    open_qty NUMERIC(14,4) GENERATED ALWAYS AS (
        GREATEST(0, quantity - received_qty)
    ) STORED,
    warehouse_id UUID REFERENCES warehouses(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(po_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_pol_po ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS idx_pol_item ON purchase_order_lines(item_id);


-- =====================================================
-- 8. GOODS RECEIPTS (GRN / GRPO)
-- =====================================================

CREATE TABLE IF NOT EXISTS goods_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    doc_number TEXT NOT NULL,
    doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
    po_id UUID REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    status TEXT NOT NULL DEFAULT 'draft',
    subtotal NUMERIC(14,2) DEFAULT 0,
    tax_amount NUMERIC(14,2) DEFAULT 0,
    total_amount NUMERIC(14,2) DEFAULT 0,
    remarks TEXT,
    created_by UUID REFERENCES profiles(id),
    posted_by UUID REFERENCES profiles(id),
    posted_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, doc_number),
    CONSTRAINT chk_grn_status CHECK (
        status IN ('draft','posted','cancelled')
    )
);

CREATE INDEX IF NOT EXISTS idx_grn_company ON goods_receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_grn_branch ON goods_receipts(branch_id);
CREATE INDEX IF NOT EXISTS idx_grn_po ON goods_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_grn_supplier ON goods_receipts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_grn_warehouse ON goods_receipts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_grn_status ON goods_receipts(status);
CREATE INDEX IF NOT EXISTS idx_grn_date ON goods_receipts(doc_date DESC);

DROP TRIGGER IF EXISTS trg_grn_updated ON goods_receipts;
CREATE TRIGGER trg_grn_updated
BEFORE UPDATE ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 9. GOODS RECEIPT LINES
-- =====================================================

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grn_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    po_line_id UUID REFERENCES purchase_order_lines(id),
    item_id UUID NOT NULL REFERENCES items(id),
    description TEXT,
    uom_id UUID NOT NULL REFERENCES uom(id),
    quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
    line_total NUMERIC(14,4) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    batch_no TEXT,
    expiry_date DATE,
    warehouse_id UUID REFERENCES warehouses(id),
    invoiced_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(grn_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_grl_grn ON goods_receipt_lines(grn_id);
CREATE INDEX IF NOT EXISTS idx_grl_po_line ON goods_receipt_lines(po_line_id);
CREATE INDEX IF NOT EXISTS idx_grl_item ON goods_receipt_lines(item_id);


-- =====================================================
-- 10. AP INVOICES
-- =====================================================

CREATE TABLE IF NOT EXISTS ap_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    doc_number TEXT NOT NULL,
    supplier_inv_no TEXT,
    doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    grn_id UUID REFERENCES goods_receipts(id),
    po_id UUID REFERENCES purchase_orders(id),
    payment_term_id UUID REFERENCES payment_terms(id),
    currency TEXT DEFAULT 'LKR',
    exchange_rate NUMERIC(12,6) DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    subtotal NUMERIC(14,2) DEFAULT 0,
    discount_pct NUMERIC(5,2) DEFAULT 0,
    discount_amount NUMERIC(14,2) DEFAULT 0,
    tax_amount NUMERIC(14,2) DEFAULT 0,
    total_amount NUMERIC(14,2) DEFAULT 0,
    paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    balance_due NUMERIC(14,2) GENERATED ALWAYS AS (
        GREATEST(0, total_amount - paid_amount)
    ) STORED,
    remarks TEXT,
    created_by UUID REFERENCES profiles(id),
    posted_by UUID REFERENCES profiles(id),
    posted_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, doc_number),
    UNIQUE(company_id, supplier_id, supplier_inv_no),
    CONSTRAINT chk_apinv_status CHECK (
        status IN ('draft','posted','partial_paid','paid','cancelled')
    )
);

CREATE INDEX IF NOT EXISTS idx_apinv_company ON ap_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_apinv_branch ON ap_invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_apinv_supplier ON ap_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_apinv_grn ON ap_invoices(grn_id);
CREATE INDEX IF NOT EXISTS idx_apinv_po ON ap_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_apinv_status ON ap_invoices(status);
CREATE INDEX IF NOT EXISTS idx_apinv_due ON ap_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_apinv_date ON ap_invoices(doc_date DESC);

DROP TRIGGER IF EXISTS trg_apinv_updated ON ap_invoices;
CREATE TRIGGER trg_apinv_updated
BEFORE UPDATE ON ap_invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 11. AP INVOICE LINES
-- =====================================================

CREATE TABLE IF NOT EXISTS ap_invoice_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES ap_invoices(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    grn_line_id UUID REFERENCES goods_receipt_lines(id),
    po_line_id UUID REFERENCES purchase_order_lines(id),
    item_id UUID REFERENCES items(id),
    description TEXT,
    uom_id UUID REFERENCES uom(id),
    quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(14,4) NOT NULL CHECK (unit_price >= 0),
    discount_pct NUMERIC(5,2) DEFAULT 0,
    tax_pct NUMERIC(5,2) DEFAULT 0,
    line_total NUMERIC(14,4) GENERATED ALWAYS AS (
        ROUND(quantity * unit_price * (1 - COALESCE(discount_pct, 0) / 100), 4)
    ) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(invoice_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_apil_invoice ON ap_invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_apil_grn_line ON ap_invoice_lines(grn_line_id);
CREATE INDEX IF NOT EXISTS idx_apil_item ON ap_invoice_lines(item_id);


-- =====================================================
-- 12. SUPPLIER PAYMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    doc_number TEXT NOT NULL,
    doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    payment_method TEXT NOT NULL,
    bank_account TEXT,
    cheque_no TEXT,
    cheque_date DATE,
    reference_no TEXT,
    currency TEXT DEFAULT 'LKR',
    exchange_rate NUMERIC(12,6) DEFAULT 1,
    total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount > 0),
    allocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    unallocated_amount NUMERIC(14,2) GENERATED ALWAYS AS (
        GREATEST(0, total_amount - allocated_amount)
    ) STORED,
    status TEXT NOT NULL DEFAULT 'draft',
    remarks TEXT,
    created_by UUID REFERENCES profiles(id),
    posted_by UUID REFERENCES profiles(id),
    posted_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, doc_number),
    CONSTRAINT chk_suppay_status CHECK (
        status IN ('draft','posted','cancelled')
    ),
    CONSTRAINT chk_suppay_method CHECK (
        payment_method IN ('cash','bank_transfer','cheque','credit_card','wowcher','other')
    )
);

CREATE INDEX IF NOT EXISTS idx_suppay_company ON supplier_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_suppay_branch ON supplier_payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_suppay_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_suppay_status ON supplier_payments(status);
CREATE INDEX IF NOT EXISTS idx_suppay_date ON supplier_payments(doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_suppay_method ON supplier_payments(payment_method);

DROP TRIGGER IF EXISTS trg_suppay_updated ON supplier_payments;
CREATE TRIGGER trg_suppay_updated
BEFORE UPDATE ON supplier_payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 13. SUPPLIER PAYMENT ALLOCATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES ap_invoices(id),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_spa_payment ON supplier_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_spa_invoice ON supplier_payment_allocations(invoice_id);


-- =====================================================
-- 14. PURCHASE RETURNS
-- =====================================================

CREATE TABLE IF NOT EXISTS purchase_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    doc_number TEXT NOT NULL,
    doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
    grn_id UUID REFERENCES goods_receipts(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    status TEXT NOT NULL DEFAULT 'draft',
    subtotal NUMERIC(14,2) DEFAULT 0,
    tax_amount NUMERIC(14,2) DEFAULT 0,
    total_amount NUMERIC(14,2) DEFAULT 0,
    return_reason TEXT,
    remarks TEXT,
    created_by UUID REFERENCES profiles(id),
    posted_by UUID REFERENCES profiles(id),
    posted_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, doc_number),
    CONSTRAINT chk_pret_status CHECK (
        status IN ('draft','posted','cancelled')
    )
);

CREATE INDEX IF NOT EXISTS idx_pret_company ON purchase_returns(company_id);
CREATE INDEX IF NOT EXISTS idx_pret_branch ON purchase_returns(branch_id);
CREATE INDEX IF NOT EXISTS idx_pret_grn ON purchase_returns(grn_id);
CREATE INDEX IF NOT EXISTS idx_pret_supplier ON purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pret_status ON purchase_returns(status);
CREATE INDEX IF NOT EXISTS idx_pret_date ON purchase_returns(doc_date DESC);

DROP TRIGGER IF EXISTS trg_pret_updated ON purchase_returns;
CREATE TRIGGER trg_pret_updated
BEFORE UPDATE ON purchase_returns
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================
-- 15. PURCHASE RETURN LINES
-- =====================================================

CREATE TABLE IF NOT EXISTS purchase_return_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    grn_line_id UUID REFERENCES goods_receipt_lines(id),
    item_id UUID NOT NULL REFERENCES items(id),
    description TEXT,
    uom_id UUID NOT NULL REFERENCES uom(id),
    quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
    line_total NUMERIC(14,4) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    batch_no TEXT,
    return_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(return_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_prl_return ON purchase_return_lines(return_id);
CREATE INDEX IF NOT EXISTS idx_prl_grn_line ON purchase_return_lines(grn_line_id);
CREATE INDEX IF NOT EXISTS idx_prl_item ON purchase_return_lines(item_id);


-- =====================================================
-- 16. AP LEDGER (Immutable — single source of truth)
-- =====================================================
-- NEVER update or delete rows.
-- entry_type: INVOICE  → credit (money owed)
--             PAYMENT  → debit  (money paid)
--             CREDIT_NOTE → debit (return reduces balance)
--             REVERSAL → opposite of original (cancellation)

CREATE TABLE IF NOT EXISTS ap_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    branch_id UUID NOT NULL REFERENCES branches(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    entry_type TEXT NOT NULL,
    doc_id UUID NOT NULL,
    doc_number TEXT NOT NULL,
    doc_date DATE NOT NULL,
    due_date DATE,
    debit NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'LKR',
    exchange_rate NUMERIC(12,6) DEFAULT 1,
    description TEXT,
    posted_by UUID REFERENCES profiles(id),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_apl_type CHECK (
        entry_type IN ('INVOICE','PAYMENT','CREDIT_NOTE','REVERSAL')
    ),
    CONSTRAINT chk_apl_amount CHECK (
        (debit >= 0 AND credit >= 0) AND (debit > 0 OR credit > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_apl_company ON ap_ledger(company_id);
CREATE INDEX IF NOT EXISTS idx_apl_supplier ON ap_ledger(supplier_id);
CREATE INDEX IF NOT EXISTS idx_apl_type ON ap_ledger(entry_type);
CREATE INDEX IF NOT EXISTS idx_apl_doc ON ap_ledger(doc_id);
CREATE INDEX IF NOT EXISTS idx_apl_date ON ap_ledger(doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_apl_posted ON ap_ledger(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_apl_supplier_date ON ap_ledger(supplier_id, doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_apl_due ON ap_ledger(due_date);


-- =====================================================
-- 17. AP BALANCE SNAPSHOT (periodic / month-end)
-- =====================================================

CREATE TABLE IF NOT EXISTS ap_balance_snapshot (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    snapshot_date DATE NOT NULL,
    total_debit NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
    balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, supplier_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_apbs_company ON ap_balance_snapshot(company_id);
CREATE INDEX IF NOT EXISTS idx_apbs_supplier ON ap_balance_snapshot(supplier_id);
CREATE INDEX IF NOT EXISTS idx_apbs_date ON ap_balance_snapshot(snapshot_date DESC);


-- #####################################################
-- TRIGGERS & FUNCTIONS
-- #####################################################


-- =====================================================
-- 18. BLOCK EDITS ON POSTED / CANCELLED PROCUREMENT DOCS
-- =====================================================

CREATE OR REPLACE FUNCTION block_posted_procurement_edit()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'posted' THEN
        IF NEW.status = 'cancelled' THEN
            RETURN NEW;
        END IF;
        IF TG_TABLE_NAME = 'ap_invoices' AND NEW.paid_amount IS DISTINCT FROM OLD.paid_amount THEN
            RETURN NEW;
        END IF;
        IF TG_TABLE_NAME = 'ap_invoices' AND NEW.status IS DISTINCT FROM OLD.status THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'IMMUTABLE_DOC: Cannot modify posted document "%" on table %.', OLD.doc_number, TG_TABLE_NAME;
    END IF;

    IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'IMMUTABLE_DOC: Cannot modify cancelled document "%" on table %.', OLD.doc_number, TG_TABLE_NAME;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_po_edit ON purchase_orders;
CREATE TRIGGER trg_block_po_edit
BEFORE UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION block_posted_procurement_edit();

DROP TRIGGER IF EXISTS trg_block_grn_edit ON goods_receipts;
CREATE TRIGGER trg_block_grn_edit
BEFORE UPDATE ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION block_posted_procurement_edit();

DROP TRIGGER IF EXISTS trg_block_apinv_edit ON ap_invoices;
CREATE TRIGGER trg_block_apinv_edit
BEFORE UPDATE ON ap_invoices
FOR EACH ROW EXECUTE FUNCTION block_posted_procurement_edit();

DROP TRIGGER IF EXISTS trg_block_suppay_edit ON supplier_payments;
CREATE TRIGGER trg_block_suppay_edit
BEFORE UPDATE ON supplier_payments
FOR EACH ROW EXECUTE FUNCTION block_posted_procurement_edit();

DROP TRIGGER IF EXISTS trg_block_pret_edit ON purchase_returns;
CREATE TRIGGER trg_block_pret_edit
BEFORE UPDATE ON purchase_returns
FOR EACH ROW EXECUTE FUNCTION block_posted_procurement_edit();


-- =====================================================
-- 19. POST GRN → Update PO received_qty + stock
-- =====================================================

CREATE OR REPLACE FUNCTION post_goods_receipt()
RETURNS TRIGGER AS $$
DECLARE
    v_line RECORD;
    v_wh_id UUID;
    v_all_received BOOLEAN;
BEGIN
    -- POSTING: draft → posted
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN

        NEW.posted_at := now();

        FOR v_line IN
            SELECT * FROM goods_receipt_lines WHERE grn_id = NEW.id
        LOOP
            v_wh_id := COALESCE(v_line.warehouse_id, NEW.warehouse_id);

            -- Update stock_on_hand
            INSERT INTO stock_on_hand (company_id, warehouse_id, item_id, qty_on_hand, total_value, last_movement_at)
            VALUES (NEW.company_id, v_wh_id, v_line.item_id, v_line.quantity, v_line.quantity * v_line.unit_cost, now())
            ON CONFLICT (warehouse_id, item_id)
            DO UPDATE SET
                qty_on_hand = stock_on_hand.qty_on_hand + EXCLUDED.qty_on_hand,
                total_value = stock_on_hand.total_value + EXCLUDED.total_value,
                last_movement_at = now(),
                updated_at = now();

            -- Insert inventory ledger entry
            INSERT INTO inventory_ledger (
                company_id, branch_id, warehouse_id, item_id,
                document_id, doc_type, doc_number,
                direction, quantity, unit_cost, total_cost,
                batch_no, expiry_date, posted_by
            ) VALUES (
                NEW.company_id, NEW.branch_id, v_wh_id, v_line.item_id,
                NEW.id, 'GRN', NEW.doc_number,
                'IN', v_line.quantity, v_line.unit_cost, v_line.quantity * v_line.unit_cost,
                v_line.batch_no, v_line.expiry_date, NEW.posted_by
            );

            -- Update item last purchase price ONLY.
            -- avg_cost is NOT updated here (removed 2026-08-03 per designnew.md
            -- Section 5 — GRN Rework). avg_cost is exclusively recomputed once a
            -- month, from scratch, by fn_recompute_monthly_avg_cost() (see
            -- supabase/migrations/20260803_grn_rework_supplier_direct_costing.sql).
            -- Each GRN's own unit_cost is preserved untouched (no smoothing at
            -- receipt time).
            IF v_line.unit_cost > 0 THEN
                UPDATE items SET
                    last_purchase_price = v_line.unit_cost
                WHERE id = v_line.item_id;
            END IF;

            -- Update PO line received_qty. Guarded — no-ops for supplier-direct
            -- GRNs (po_line_id IS NULL), which is the only GRN creation path as
            -- of 2026-08-03 (GRNPage.vue no longer writes po_line_id). Kept for
            -- historical PO-linked GRNs.
            IF v_line.po_line_id IS NOT NULL THEN
                UPDATE purchase_order_lines
                SET received_qty = received_qty + v_line.quantity
                WHERE id = v_line.po_line_id;
            END IF;
        END LOOP;

        -- Update PO status. Guarded — no-ops for supplier-direct GRNs (po_id IS
        -- NULL). PO status is now a manual action (PurchaseOrdersPage.vue) for
        -- all new GRNs; this block remains only for historical PO-linked GRNs.
        IF NEW.po_id IS NOT NULL THEN
            SELECT NOT EXISTS (
                SELECT 1 FROM purchase_order_lines
                WHERE po_id = NEW.po_id AND open_qty > 0
            ) INTO v_all_received;

            IF v_all_received THEN
                UPDATE purchase_orders SET status = 'closed', closed_at = now()
                WHERE id = NEW.po_id AND status IN ('open','partial','approved');
            ELSE
                UPDATE purchase_orders SET status = 'partial'
                WHERE id = NEW.po_id AND status IN ('open','approved');
            END IF;
        END IF;

    -- CANCELLATION: posted → cancelled
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'posted' THEN

        NEW.cancelled_at := now();

        FOR v_line IN
            SELECT * FROM goods_receipt_lines WHERE grn_id = NEW.id
        LOOP
            v_wh_id := COALESCE(v_line.warehouse_id, NEW.warehouse_id);

            -- Reverse stock
            UPDATE stock_on_hand SET
                qty_on_hand = GREATEST(0, qty_on_hand - v_line.quantity),
                total_value = GREATEST(0, total_value - (v_line.quantity * v_line.unit_cost)),
                last_movement_at = now(),
                updated_at = now()
            WHERE warehouse_id = v_wh_id AND item_id = v_line.item_id;

            -- Reverse ledger
            INSERT INTO inventory_ledger (
                company_id, branch_id, warehouse_id, item_id,
                document_id, doc_type, doc_number,
                direction, quantity, unit_cost, total_cost, posted_by
            ) VALUES (
                NEW.company_id, NEW.branch_id, v_wh_id, v_line.item_id,
                NEW.id, 'CANCEL_GRN', NEW.doc_number || '-REV',
                'OUT', v_line.quantity, v_line.unit_cost, v_line.quantity * v_line.unit_cost, NEW.posted_by
            );

            -- Reverse PO received_qty
            IF v_line.po_line_id IS NOT NULL THEN
                UPDATE purchase_order_lines
                SET received_qty = GREATEST(0, received_qty - v_line.quantity)
                WHERE id = v_line.po_line_id;
            END IF;
        END LOOP;

        -- Re-open PO
        IF NEW.po_id IS NOT NULL THEN
            UPDATE purchase_orders SET status = 'open', closed_at = NULL
            WHERE id = NEW.po_id AND status IN ('closed','partial');
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_grn ON goods_receipts;
CREATE TRIGGER trg_post_grn
BEFORE UPDATE OF status ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION post_goods_receipt();


-- =====================================================
-- 20. POST AP INVOICE → AP Ledger
-- =====================================================

CREATE OR REPLACE FUNCTION post_ap_invoice()
RETURNS TRIGGER AS $$
BEGIN
    -- POSTING: draft → posted
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
        NEW.posted_at := now();

        -- Ledger entry (credit = money owed to supplier)
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id, entry_type,
            doc_id, doc_number, doc_date, due_date,
            debit, credit, description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id, 'INVOICE',
            NEW.id, NEW.doc_number, NEW.doc_date, NEW.due_date,
            0, NEW.total_amount,
            'AP Invoice ' || NEW.doc_number || COALESCE(' / Sup Ref: ' || NEW.supplier_inv_no, ''),
            NEW.posted_by
        );

        -- Update supplier balance
        UPDATE suppliers SET balance = balance + NEW.total_amount
        WHERE id = NEW.supplier_id;

        -- Update GRN line invoiced_qty
        IF NEW.grn_id IS NOT NULL THEN
            UPDATE goods_receipt_lines grl SET
                invoiced_qty = grl.invoiced_qty + ail.quantity
            FROM ap_invoice_lines ail
            WHERE ail.invoice_id = NEW.id
              AND ail.grn_line_id = grl.id;
        END IF;

        -- Update PO line invoiced_qty
        UPDATE purchase_order_lines pol SET
            invoiced_qty = pol.invoiced_qty + ail.quantity
        FROM ap_invoice_lines ail
        WHERE ail.invoice_id = NEW.id
          AND ail.po_line_id = pol.id;

    -- CANCELLATION
    ELSIF NEW.status = 'cancelled' AND OLD.status IN ('posted','partial_paid') THEN
        NEW.cancelled_at := now();

        -- Reversal ledger entry
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id, entry_type,
            doc_id, doc_number, doc_date,
            debit, credit, description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id, 'REVERSAL',
            NEW.id, NEW.doc_number || '-REV', NEW.doc_date,
            NEW.total_amount, 0,
            'Cancellation of AP Invoice ' || NEW.doc_number,
            NEW.posted_by
        );

        -- Reverse supplier balance
        UPDATE suppliers SET balance = GREATEST(0, balance - NEW.total_amount)
        WHERE id = NEW.supplier_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_ap_invoice ON ap_invoices;
CREATE TRIGGER trg_post_ap_invoice
BEFORE UPDATE OF status ON ap_invoices
FOR EACH ROW EXECUTE FUNCTION post_ap_invoice();


-- =====================================================
-- 21. POST SUPPLIER PAYMENT → AP Ledger + Invoice Update
-- =====================================================

CREATE OR REPLACE FUNCTION post_supplier_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_alloc RECORD;
    v_inv_total NUMERIC;
    v_inv_paid NUMERIC;
BEGIN
    -- POSTING: draft → posted
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
        NEW.posted_at := now();

        -- Ledger entry (debit = money paid to supplier)
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id, entry_type,
            doc_id, doc_number, doc_date,
            debit, credit, description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id, 'PAYMENT',
            NEW.id, NEW.doc_number, NEW.doc_date,
            NEW.total_amount, 0,
            'Supplier Payment ' || NEW.doc_number || ' via ' || NEW.payment_method,
            NEW.posted_by
        );

        -- Reduce supplier balance
        UPDATE suppliers SET balance = GREATEST(0, balance - NEW.total_amount)
        WHERE id = NEW.supplier_id;

        -- Apply allocations to invoices
        FOR v_alloc IN
            SELECT * FROM supplier_payment_allocations WHERE payment_id = NEW.id
        LOOP
            UPDATE ap_invoices SET
                paid_amount = paid_amount + v_alloc.amount,
                status = CASE
                    WHEN (paid_amount + v_alloc.amount) >= total_amount THEN 'paid'
                    ELSE 'partial_paid'
                END
            WHERE id = v_alloc.invoice_id;
        END LOOP;

        -- Sum allocated
        SELECT COALESCE(SUM(amount), 0) INTO v_inv_total
        FROM supplier_payment_allocations WHERE payment_id = NEW.id;
        NEW.allocated_amount := v_inv_total;

    -- CANCELLATION
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'posted' THEN
        NEW.cancelled_at := now();

        -- Reversal ledger entry
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id, entry_type,
            doc_id, doc_number, doc_date,
            debit, credit, description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id, 'REVERSAL',
            NEW.id, NEW.doc_number || '-REV', NEW.doc_date,
            0, NEW.total_amount,
            'Cancellation of Payment ' || NEW.doc_number,
            NEW.posted_by
        );

        -- Reverse supplier balance
        UPDATE suppliers SET balance = balance + NEW.total_amount
        WHERE id = NEW.supplier_id;

        -- Reverse invoice allocations
        FOR v_alloc IN
            SELECT * FROM supplier_payment_allocations WHERE payment_id = NEW.id
        LOOP
            UPDATE ap_invoices SET
                paid_amount = GREATEST(0, paid_amount - v_alloc.amount),
                status = CASE
                    WHEN GREATEST(0, paid_amount - v_alloc.amount) = 0 THEN 'posted'
                    ELSE 'partial_paid'
                END
            WHERE id = v_alloc.invoice_id;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_supplier_payment ON supplier_payments;
CREATE TRIGGER trg_post_supplier_payment
BEFORE UPDATE OF status ON supplier_payments
FOR EACH ROW EXECUTE FUNCTION post_supplier_payment();


-- =====================================================
-- 22. POST PURCHASE RETURN → Stock reversal + AP credit
-- =====================================================

CREATE OR REPLACE FUNCTION post_purchase_return()
RETURNS TRIGGER AS $$
DECLARE
    v_line RECORD;
    v_wh_id UUID;
BEGIN
    -- POSTING: draft → posted
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
        NEW.posted_at := now();

        FOR v_line IN
            SELECT * FROM purchase_return_lines WHERE return_id = NEW.id
        LOOP
            v_wh_id := NEW.warehouse_id;

            -- Deduct stock
            UPDATE stock_on_hand SET
                qty_on_hand = GREATEST(0, qty_on_hand - v_line.quantity),
                total_value = GREATEST(0, total_value - (v_line.quantity * v_line.unit_cost)),
                last_movement_at = now(),
                updated_at = now()
            WHERE warehouse_id = v_wh_id AND item_id = v_line.item_id;

            -- Ledger OUT entry
            INSERT INTO inventory_ledger (
                company_id, branch_id, warehouse_id, item_id,
                document_id, doc_type, doc_number,
                direction, quantity, unit_cost, total_cost, posted_by
            ) VALUES (
                NEW.company_id, NEW.branch_id, v_wh_id, v_line.item_id,
                NEW.id, 'PUR_RET', NEW.doc_number,
                'OUT', v_line.quantity, v_line.unit_cost, v_line.quantity * v_line.unit_cost,
                NEW.posted_by
            );

            -- Update PO line returned_qty (if linked via GRN)
            IF v_line.grn_line_id IS NOT NULL THEN
                UPDATE purchase_order_lines pol SET
                    returned_qty = pol.returned_qty + v_line.quantity
                FROM goods_receipt_lines grl
                WHERE grl.id = v_line.grn_line_id
                  AND grl.po_line_id = pol.id;
            END IF;
        END LOOP;

        -- AP Ledger credit note (debit = reduces money owed)
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id, entry_type,
            doc_id, doc_number, doc_date,
            debit, credit, description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id, 'CREDIT_NOTE',
            NEW.id, NEW.doc_number, NEW.doc_date,
            NEW.total_amount, 0,
            'Purchase Return ' || NEW.doc_number,
            NEW.posted_by
        );

        -- Reduce supplier balance
        UPDATE suppliers SET balance = GREATEST(0, balance - NEW.total_amount)
        WHERE id = NEW.supplier_id;

    -- CANCELLATION
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'posted' THEN
        NEW.cancelled_at := now();

        FOR v_line IN
            SELECT * FROM purchase_return_lines WHERE return_id = NEW.id
        LOOP
            v_wh_id := NEW.warehouse_id;

            -- Reverse stock (add back)
            INSERT INTO stock_on_hand (company_id, warehouse_id, item_id, qty_on_hand, total_value, last_movement_at)
            VALUES (NEW.company_id, v_wh_id, v_line.item_id, v_line.quantity, v_line.quantity * v_line.unit_cost, now())
            ON CONFLICT (warehouse_id, item_id)
            DO UPDATE SET
                qty_on_hand = stock_on_hand.qty_on_hand + EXCLUDED.qty_on_hand,
                total_value = stock_on_hand.total_value + EXCLUDED.total_value,
                last_movement_at = now(),
                updated_at = now();

            -- Reverse ledger
            INSERT INTO inventory_ledger (
                company_id, branch_id, warehouse_id, item_id,
                document_id, doc_type, doc_number,
                direction, quantity, unit_cost, total_cost, posted_by
            ) VALUES (
                NEW.company_id, NEW.branch_id, v_wh_id, v_line.item_id,
                NEW.id, 'CANCEL_PUR_RET', NEW.doc_number || '-REV',
                'IN', v_line.quantity, v_line.unit_cost, v_line.quantity * v_line.unit_cost,
                NEW.posted_by
            );
        END LOOP;

        -- Reverse AP credit note
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id, entry_type,
            doc_id, doc_number, doc_date,
            debit, credit, description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id, 'REVERSAL',
            NEW.id, NEW.doc_number || '-REV', NEW.doc_date,
            0, NEW.total_amount,
            'Cancellation of Return ' || NEW.doc_number,
            NEW.posted_by
        );

        -- Restore supplier balance
        UPDATE suppliers SET balance = balance + NEW.total_amount
        WHERE id = NEW.supplier_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_purchase_return ON purchase_returns;
CREATE TRIGGER trg_post_purchase_return
BEFORE UPDATE OF status ON purchase_returns
FOR EACH ROW EXECUTE FUNCTION post_purchase_return();


-- #####################################################
-- VIEWS
-- #####################################################


-- =====================================================
-- 23. SUPPLIER BALANCE VIEW
-- =====================================================

CREATE OR REPLACE VIEW v_supplier_balances AS
SELECT
    al.company_id,
    al.supplier_id,
    s.code AS supplier_code,
    s.name AS supplier_name,
    COALESCE(SUM(al.credit), 0) AS total_invoiced,
    COALESCE(SUM(al.debit), 0) AS total_paid,
    COALESCE(SUM(al.credit), 0) - COALESCE(SUM(al.debit), 0) AS outstanding_balance
FROM ap_ledger al
JOIN suppliers s ON s.id = al.supplier_id
GROUP BY al.company_id, al.supplier_id, s.code, s.name;


-- =====================================================
-- 24. SUPPLIER AGING VIEW (30/60/90/120+ days)
-- =====================================================

CREATE OR REPLACE VIEW v_supplier_aging AS
SELECT
    i.company_id,
    i.supplier_id,
    s.code AS supplier_code,
    s.name AS supplier_name,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 AND (CURRENT_DATE - i.due_date) <= 30 THEN i.balance_due ELSE 0 END), 0) AS current_0_30,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 AND (CURRENT_DATE - i.due_date) BETWEEN 31 AND 60 THEN i.balance_due ELSE 0 END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 AND (CURRENT_DATE - i.due_date) BETWEEN 61 AND 90 THEN i.balance_due ELSE 0 END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 AND (CURRENT_DATE - i.due_date) BETWEEN 91 AND 120 THEN i.balance_due ELSE 0 END), 0) AS days_91_120,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 AND (CURRENT_DATE - i.due_date) > 120 THEN i.balance_due ELSE 0 END), 0) AS over_120,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 THEN i.balance_due ELSE 0 END), 0) AS total_outstanding
FROM ap_invoices i
JOIN suppliers s ON s.id = i.supplier_id
WHERE i.status IN ('posted','partial_paid')
GROUP BY i.company_id, i.supplier_id, s.code, s.name;


-- =====================================================
-- 25. PO STATUS SUMMARY VIEW
-- =====================================================

CREATE OR REPLACE VIEW v_purchase_order_summary AS
SELECT
    po.id,
    po.company_id,
    po.branch_id,
    po.doc_number,
    po.doc_date,
    po.status,
    s.name AS supplier_name,
    po.total_amount,
    COALESCE(SUM(pol.received_qty * pol.unit_price), 0) AS received_value,
    COALESCE(SUM(pol.invoiced_qty * pol.unit_price), 0) AS invoiced_value,
    COALESCE(SUM(pol.open_qty * pol.unit_price), 0) AS open_value
FROM purchase_orders po
JOIN suppliers s ON s.id = po.supplier_id
LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id
GROUP BY po.id, po.company_id, po.branch_id, po.doc_number,
         po.doc_date, po.status, s.name, po.total_amount;


-- =====================================================
-- 26. AP LEDGER DETAIL VIEW
-- =====================================================

CREATE OR REPLACE VIEW v_ap_ledger_detail AS
SELECT
    al.id,
    al.company_id,
    al.branch_id,
    al.supplier_id,
    s.code AS supplier_code,
    s.name AS supplier_name,
    al.entry_type,
    al.doc_number,
    al.doc_date,
    al.due_date,
    al.debit,
    al.credit,
    al.description,
    p.full_name AS posted_by_name,
    al.posted_at
FROM ap_ledger al
JOIN suppliers s ON s.id = al.supplier_id
LEFT JOIN profiles p ON p.id = al.posted_by;


-- =====================================================
-- 27. SNAPSHOT FUNCTION (call monthly via cron or manually)
-- =====================================================

CREATE OR REPLACE FUNCTION take_ap_balance_snapshot(p_company_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
BEGIN
    INSERT INTO ap_balance_snapshot (company_id, supplier_id, snapshot_date, total_debit, total_credit, balance)
    SELECT
        al.company_id,
        al.supplier_id,
        p_date,
        COALESCE(SUM(al.debit), 0),
        COALESCE(SUM(al.credit), 0),
        COALESCE(SUM(al.credit), 0) - COALESCE(SUM(al.debit), 0)
    FROM ap_ledger al
    WHERE al.company_id = p_company_id
      AND al.doc_date <= p_date
    GROUP BY al.company_id, al.supplier_id
    ON CONFLICT (company_id, supplier_id, snapshot_date)
    DO UPDATE SET
        total_debit = EXCLUDED.total_debit,
        total_credit = EXCLUDED.total_credit,
        balance = EXCLUDED.balance,
        created_at = now();
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- 28. SEED: Default Payment Terms
-- =====================================================

DO $$
DECLARE v_cid UUID;
BEGIN
    FOR v_cid IN SELECT id FROM companies LOOP
        INSERT INTO payment_terms (company_id, code, name, net_days, advance_pct) VALUES
            (v_cid, 'NET-0',  'Cash on Delivery',  0,  0),
            (v_cid, 'NET-7',  'Net 7 Days',        7,  0),
            (v_cid, 'NET-15', 'Net 15 Days',       15, 0),
            (v_cid, 'NET-30', 'Net 30 Days',       30, 0),
            (v_cid, 'NET-60', 'Net 60 Days',       60, 0),
            (v_cid, 'ADV-50', '50% Advance',       30, 50)
        ON CONFLICT (company_id, code) DO NOTHING;
    END LOOP;
END $$;


-- =====================================================
-- 29. REALTIME
-- =====================================================

DO $$
BEGIN
    ALTER TABLE purchase_orders       REPLICA IDENTITY FULL;
    ALTER TABLE goods_receipts        REPLICA IDENTITY FULL;
    ALTER TABLE ap_invoices           REPLICA IDENTITY FULL;
    ALTER TABLE supplier_payments     REPLICA IDENTITY FULL;
    ALTER TABLE purchase_returns      REPLICA IDENTITY FULL;
    ALTER TABLE ap_ledger             REPLICA IDENTITY FULL;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='purchase_orders') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE purchase_orders;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='goods_receipts') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE goods_receipts;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='ap_invoices') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE ap_invoices;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='supplier_payments') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE supplier_payments;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='purchase_returns') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE purchase_returns;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='ap_ledger') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE ap_ledger;
    END IF;
END $$;


-- =====================================================
-- END OF PROCUREMENT MODULE
-- =====================================================
