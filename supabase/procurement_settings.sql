-- =====================================================
-- PROCUREMENT SETTINGS & APPROVAL WORKFLOWS
-- =====================================================
-- Run AFTER: system_modules.sql, procurement.sql, procurement_functions.sql
-- Uses: module_settings table with module_code = 'PROCUREMENT'
-- =====================================================

-- =====================================================
-- SECTION 1: SEED DEFAULT PROCUREMENT SETTINGS
-- =====================================================

DO $$
DECLARE
    v_cid UUID;
BEGIN
    FOR v_cid IN SELECT id FROM companies LOOP

        -- Register PROCUREMENT as a system module
        INSERT INTO system_modules (company_id, code, name, description, is_enabled, icon, sort_order)
        VALUES (
            v_cid, 'PROCUREMENT', 'Procurement Module',
            'Purchase orders, goods receipts, AP invoices, payments, and returns.',
            true, 'local_shipping', 9
        )
        ON CONFLICT (company_id, code) DO NOTHING;

        -- Seed default settings
        INSERT INTO module_settings (company_id, module_code, setting_key, setting_value)
        VALUES
            (v_cid, 'PROCUREMENT', 'po_approval_required',            'false'::jsonb),
            (v_cid, 'PROCUREMENT', 'grn_approval_required',           'false'::jsonb),
            (v_cid, 'PROCUREMENT', 'invoice_approval_required',       'false'::jsonb),
            (v_cid, 'PROCUREMENT', 'default_payment_term_id',         'null'::jsonb),
            (v_cid, 'PROCUREMENT', 'allow_negative_stock_returns',    'false'::jsonb)
        ON CONFLICT (company_id, module_code, setting_key) DO NOTHING;

    END LOOP;
END $$;


-- =====================================================
-- SECTION 2: ADD APPROVAL COLUMNS TO GRN & AP INVOICES
-- =====================================================

ALTER TABLE goods_receipts
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE ap_invoices
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;


-- =====================================================
-- SECTION 3: EXPAND STATUS CONSTRAINTS (add 'approved')
-- =====================================================

ALTER TABLE goods_receipts DROP CONSTRAINT IF EXISTS chk_grn_status;
ALTER TABLE goods_receipts ADD CONSTRAINT chk_grn_status
    CHECK (status IN ('draft', 'approved', 'posted', 'cancelled'));

ALTER TABLE ap_invoices DROP CONSTRAINT IF EXISTS chk_apinv_status;
ALTER TABLE ap_invoices ADD CONSTRAINT chk_apinv_status
    CHECK (status IN ('draft', 'approved', 'posted', 'partial_paid', 'paid', 'cancelled'));


-- =====================================================
-- SECTION 4: HELPER — check if procurement setting is truthy
-- =====================================================

CREATE OR REPLACE FUNCTION procurement_setting_bool(
    p_company_id UUID,
    p_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_val JSONB;
BEGIN
    v_val := get_module_setting(p_company_id, 'PROCUREMENT', p_key);
    IF v_val IS NULL THEN RETURN false; END IF;
    -- Handles: true, "true", false, "false"
    IF v_val = 'true'::jsonb OR v_val = '"true"'::jsonb THEN
        RETURN true;
    END IF;
    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;


-- =====================================================
-- SECTION 5: APPROVAL RPC — approve_po
-- =====================================================

CREATE OR REPLACE FUNCTION approve_po(p_po_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
    v_company_id UUID;
BEGIN
    SELECT doc_number, status, company_id
    INTO v_doc_number, v_status, v_company_id
    FROM purchase_orders WHERE id = p_po_id;

    IF v_doc_number IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'PO not found: ' || p_po_id);
    END IF;

    -- Check if approval is enabled
    IF NOT procurement_setting_bool(v_company_id, 'po_approval_required') THEN
        RETURN jsonb_build_object('success', false, 'error', 'PO approval is not enabled for this company.');
    END IF;

    IF v_status != 'draft' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'PO "' || v_doc_number || '" is ' || v_status || '. Only draft POs can be approved.');
    END IF;

    UPDATE purchase_orders
    SET status = 'approved',
        approved_by = auth.uid(),
        approved_at = now()
    WHERE id = p_po_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'approved');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================
-- SECTION 6: APPROVAL RPC — approve_grn
-- =====================================================

CREATE OR REPLACE FUNCTION approve_grn(p_grn_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
    v_company_id UUID;
BEGIN
    SELECT doc_number, status, company_id
    INTO v_doc_number, v_status, v_company_id
    FROM goods_receipts WHERE id = p_grn_id;

    IF v_doc_number IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'GRN not found: ' || p_grn_id);
    END IF;

    IF NOT procurement_setting_bool(v_company_id, 'grn_approval_required') THEN
        RETURN jsonb_build_object('success', false, 'error', 'GRN approval is not enabled for this company.');
    END IF;

    IF v_status != 'draft' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'GRN "' || v_doc_number || '" is ' || v_status || '. Only draft GRNs can be approved.');
    END IF;

    UPDATE goods_receipts
    SET status = 'approved',
        approved_by = auth.uid(),
        approved_at = now()
    WHERE id = p_grn_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'approved');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================
-- SECTION 7: APPROVAL RPC — approve_ap_invoice
-- =====================================================

CREATE OR REPLACE FUNCTION approve_ap_invoice(p_invoice_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
    v_company_id UUID;
BEGIN
    SELECT doc_number, status, company_id
    INTO v_doc_number, v_status, v_company_id
    FROM ap_invoices WHERE id = p_invoice_id;

    IF v_doc_number IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found: ' || p_invoice_id);
    END IF;

    IF NOT procurement_setting_bool(v_company_id, 'invoice_approval_required') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice approval is not enabled for this company.');
    END IF;

    IF v_status != 'draft' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Invoice "' || v_doc_number || '" is ' || v_status || '. Only draft invoices can be approved.');
    END IF;

    UPDATE ap_invoices
    SET status = 'approved',
        approved_by = auth.uid(),
        approved_at = now()
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'approved');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================
-- SECTION 8: UPDATE POSTING RPCs — respect approval settings
-- =====================================================
-- Re-create the posting RPCs so they check if approval is required
-- and only allow posting from the correct status.

-- 8A. post_grn — now respects grn_approval_required
CREATE OR REPLACE FUNCTION post_grn(p_grn_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
    v_company_id UUID;
    v_approval   BOOLEAN;
BEGIN
    SELECT doc_number, status, company_id
    INTO v_doc_number, v_status, v_company_id
    FROM goods_receipts WHERE id = p_grn_id;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'GRN not found: ' || p_grn_id);
    END IF;

    v_approval := procurement_setting_bool(v_company_id, 'grn_approval_required');

    -- If approval is required, must come from 'approved'; otherwise from 'draft'
    IF v_approval AND v_status != 'approved' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'GRN "' || v_doc_number || '" must be approved before posting. Current status: ' || v_status);
    ELSIF NOT v_approval AND v_status != 'draft' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'GRN "' || v_doc_number || '" is already ' || v_status);
    END IF;

    UPDATE goods_receipts SET status = 'posted' WHERE id = p_grn_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'posted');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8B. post_ap_invoice_rpc — now respects invoice_approval_required
CREATE OR REPLACE FUNCTION post_ap_invoice_rpc(p_invoice_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
    v_company_id UUID;
    v_approval   BOOLEAN;
BEGIN
    SELECT doc_number, status, company_id
    INTO v_doc_number, v_status, v_company_id
    FROM ap_invoices WHERE id = p_invoice_id;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found: ' || p_invoice_id);
    END IF;

    v_approval := procurement_setting_bool(v_company_id, 'invoice_approval_required');

    IF v_approval AND v_status != 'approved' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Invoice "' || v_doc_number || '" must be approved before posting. Current status: ' || v_status);
    ELSIF NOT v_approval AND v_status != 'draft' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Invoice "' || v_doc_number || '" is already ' || v_status);
    END IF;

    UPDATE ap_invoices SET status = 'posted' WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'posted');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8C. post_supplier_payment_rpc — unchanged logic, just restate for completeness
CREATE OR REPLACE FUNCTION post_supplier_payment_rpc(p_payment_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
BEGIN
    SELECT doc_number, status INTO v_doc_number, v_status
    FROM supplier_payments WHERE id = p_payment_id;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment not found: ' || p_payment_id);
    END IF;

    IF v_status != 'draft' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Payment "' || v_doc_number || '" is already ' || v_status);
    END IF;

    UPDATE supplier_payments SET status = 'posted' WHERE id = p_payment_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'posted');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8D. post_purchase_return_rpc — unchanged
CREATE OR REPLACE FUNCTION post_purchase_return_rpc(p_return_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
BEGIN
    SELECT doc_number, status INTO v_doc_number, v_status
    FROM purchase_returns WHERE id = p_return_id;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Return not found: ' || p_return_id);
    END IF;

    IF v_status != 'draft' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Return "' || v_doc_number || '" is already ' || v_status);
    END IF;

    UPDATE purchase_returns SET status = 'posted' WHERE id = p_return_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'posted');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================
-- SECTION 9: UPDATE GRN POSTING TRIGGER — respect approval
-- =====================================================
-- The trigger trg_fn_post_goods_receipt needs to accept
-- 'approved' → 'posted' transition in addition to 'draft' → 'posted'.

CREATE OR REPLACE FUNCTION trg_fn_post_goods_receipt()
RETURNS TRIGGER AS $$
DECLARE
    v_inv_doc_id UUID;
    v_inv_doc_number TEXT;
    v_line RECORD;
    v_wh_id UUID;
    v_line_num INT;
    v_all_received BOOLEAN;
BEGIN

    -- =====================================================
    -- APPROVAL: draft → approved (just allow it through)
    -- =====================================================
    IF NEW.status = 'approved' AND OLD.status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- =====================================================
    -- POSTING: draft/approved → posted
    -- =====================================================
    IF NEW.status = 'posted' AND OLD.status IN ('draft', 'approved') THEN

        -- Pre-flight validations
        PERFORM validate_grn_not_posted(NEW.id);
        PERFORM validate_grn_has_lines(NEW.id);

        -- Resolve & validate target warehouse
        v_wh_id := resolve_warehouse(NULL, NEW.warehouse_id, NEW.branch_id, NEW.company_id);
        PERFORM validate_warehouse_exists(v_wh_id);

        NEW.posted_at := now();
        NEW.posted_by := COALESCE(NEW.posted_by, NEW.created_by);

        -- Generate inventory document number
        v_inv_doc_number := generate_inv_doc_number(NEW.company_id, 'GRN');

        -- Create inventory_document (draft)
        INSERT INTO inventory_documents (
            company_id, branch_id,
            doc_type, doc_number, doc_date,
            warehouse_id,
            supplier_id,
            reference_id, reference_type,
            status, remarks,
            created_by, approved_by
        ) VALUES (
            NEW.company_id, NEW.branch_id,
            'GRN', v_inv_doc_number, NEW.doc_date,
            v_wh_id,
            NEW.supplier_id,
            NEW.id, 'GRN',
            'draft',
            COALESCE(NEW.remarks, 'GRN from Procurement: ' || NEW.doc_number),
            NEW.created_by, NEW.posted_by
        ) RETURNING id INTO v_inv_doc_id;

        -- Copy lines from goods_receipt_lines → inventory_document_lines
        v_line_num := 0;
        FOR v_line IN
            SELECT * FROM goods_receipt_lines WHERE grn_id = NEW.id ORDER BY line_number
        LOOP
            PERFORM validate_item_exists(v_line.item_id);

            v_line_num := v_line_num + 1;
            v_wh_id := resolve_warehouse(v_line.warehouse_id, NEW.warehouse_id, NEW.branch_id, NEW.company_id);

            INSERT INTO inventory_document_lines (
                document_id, line_number,
                item_id, uom_id,
                quantity, unit_cost,
                batch_no, expiry_date, notes
            ) VALUES (
                v_inv_doc_id, v_line_num,
                v_line.item_id, v_line.uom_id,
                v_line.quantity, COALESCE(v_line.unit_cost, 0),
                v_line.batch_no, v_line.expiry_date,
                COALESCE(v_line.notes, v_line.description)
            );
        END LOOP;

        -- POST the inventory_document → triggers post_inventory_document()
        UPDATE inventory_documents
        SET status = 'posted',
            created_by = NEW.created_by
        WHERE id = v_inv_doc_id;

        -- Update PO line received_qty
        IF NEW.po_id IS NOT NULL THEN
            FOR v_line IN
                SELECT grl.po_line_id, grl.quantity
                FROM goods_receipt_lines grl
                WHERE grl.grn_id = NEW.id
                  AND grl.po_line_id IS NOT NULL
            LOOP
                UPDATE purchase_order_lines
                SET received_qty = received_qty + v_line.quantity
                WHERE id = v_line.po_line_id;
            END LOOP;

            -- Update PO status: open → partial → closed
            SELECT NOT EXISTS (
                SELECT 1 FROM purchase_order_lines
                WHERE po_id = NEW.po_id AND open_qty > 0.0001
            ) INTO v_all_received;

            IF v_all_received THEN
                UPDATE purchase_orders
                SET status = 'closed', closed_at = now()
                WHERE id = NEW.po_id
                  AND status IN ('open', 'partial', 'approved');
            ELSE
                UPDATE purchase_orders
                SET status = 'partial'
                WHERE id = NEW.po_id
                  AND status IN ('open', 'approved');
            END IF;
        END IF;

        -- Update supplier last_purchase_price per item
        UPDATE supplier_item_prices sip
        SET last_price = grl.unit_cost,
            effective_from = NEW.doc_date,
            updated_at = now()
        FROM goods_receipt_lines grl
        WHERE grl.grn_id = NEW.id
          AND sip.supplier_id = NEW.supplier_id
          AND sip.item_id = grl.item_id
          AND grl.unit_cost > 0;

    -- =====================================================
    -- CANCELLATION: posted → cancelled
    -- =====================================================
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'posted' THEN

        NEW.cancelled_at := now();

        -- Cancel the linked inventory_document
        UPDATE inventory_documents
        SET status = 'cancelled'
        WHERE reference_id = NEW.id
          AND reference_type = 'GRN'
          AND status = 'posted';

        -- Reverse PO line received_qty
        IF NEW.po_id IS NOT NULL THEN
            FOR v_line IN
                SELECT grl.po_line_id, grl.quantity
                FROM goods_receipt_lines grl
                WHERE grl.grn_id = NEW.id
                  AND grl.po_line_id IS NOT NULL
            LOOP
                UPDATE purchase_order_lines
                SET received_qty = GREATEST(0, received_qty - v_line.quantity)
                WHERE id = v_line.po_line_id;
            END LOOP;

            -- Re-open PO if it was closed by this GRN
            UPDATE purchase_orders
            SET status = 'open', closed_at = NULL
            WHERE id = NEW.po_id
              AND status IN ('closed', 'partial');
        END IF;

    -- Allow cancellation of approved docs (back to draft or cancelled)
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'approved' THEN
        NEW.cancelled_at := now();

    ELSIF NEW.status = OLD.status THEN
        RETURN NEW;

    ELSIF NEW.status NOT IN ('cancelled', 'posted', 'approved') THEN
        RETURN NEW;

    ELSE
        RAISE EXCEPTION 'INVALID_TRANSITION: GRN % cannot go from "%" to "%".',
            NEW.doc_number, OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_goods_receipt ON goods_receipts;
CREATE TRIGGER trg_post_goods_receipt
BEFORE UPDATE OF status ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION trg_fn_post_goods_receipt();


-- =====================================================
-- SECTION 10: UPDATE AP INVOICE POSTING TRIGGER — respect approval
-- =====================================================

CREATE OR REPLACE FUNCTION trg_fn_post_ap_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_net_days INT;
    v_alloc RECORD;
BEGIN

    -- =====================================================
    -- APPROVAL: draft → approved (just allow it through)
    -- =====================================================
    IF NEW.status = 'approved' AND OLD.status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- =====================================================
    -- POSTING: draft/approved → posted
    -- =====================================================
    IF NEW.status = 'posted' AND OLD.status IN ('draft', 'approved') THEN

        -- Pre-flight validations
        PERFORM validate_invoice_not_posted(NEW.id);

        -- Validate lines for GRN-backed invoices
        IF NEW.grn_id IS NOT NULL THEN
            PERFORM validate_invoice_qty_vs_grn(NEW.id);
        END IF;

        -- Ensure invoice has at least one line
        IF NOT EXISTS (SELECT 1 FROM ap_invoice_lines WHERE invoice_id = NEW.id LIMIT 1) THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: AP Invoice % has no lines. Cannot post.', NEW.id;
        END IF;

        NEW.posted_at := now();
        NEW.posted_by := COALESCE(NEW.posted_by, NEW.created_by);

        -- Compute due_date from payment_terms if not set
        IF NEW.due_date IS NULL THEN
            SELECT pt.net_days INTO v_net_days
            FROM payment_terms pt
            WHERE pt.id = COALESCE(NEW.payment_term_id, (
                SELECT payment_term_id FROM suppliers WHERE id = NEW.supplier_id
            ));
            NEW.due_date := NEW.doc_date + COALESCE(v_net_days, 30);
        END IF;

        -- ==> AP LEDGER: CREDIT (liability created)
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id,
            entry_type,
            doc_id, doc_number, doc_date, due_date,
            debit, credit,
            currency, exchange_rate,
            description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id,
            'INVOICE',
            NEW.id, NEW.doc_number, NEW.doc_date, NEW.due_date,
            0, NEW.total_amount,
            NEW.currency, NEW.exchange_rate,
            'AP Invoice ' || NEW.doc_number ||
                CASE WHEN NEW.supplier_inv_no IS NOT NULL
                     THEN ' | Supplier Ref: ' || NEW.supplier_inv_no
                     ELSE '' END,
            NEW.posted_by
        );

        -- Update supplier running balance
        UPDATE suppliers
        SET balance = balance + NEW.total_amount
        WHERE id = NEW.supplier_id;

        -- Mark GRN lines as invoiced
        IF NEW.grn_id IS NOT NULL THEN
            UPDATE goods_receipt_lines grl
            SET invoiced_qty = grl.invoiced_qty + ail.quantity
            FROM ap_invoice_lines ail
            WHERE ail.invoice_id = NEW.id
              AND ail.grn_line_id = grl.id;
        END IF;

        -- Mark PO lines as invoiced
        UPDATE purchase_order_lines pol
        SET invoiced_qty = pol.invoiced_qty + ail.quantity
        FROM ap_invoice_lines ail
        WHERE ail.invoice_id = NEW.id
          AND ail.po_line_id = pol.id;

    -- =====================================================
    -- CANCELLATION: posted | partial_paid → cancelled
    -- =====================================================
    ELSIF NEW.status = 'cancelled'
      AND OLD.status IN ('posted', 'partial_paid') THEN

        -- Block cancellation if fully paid
        IF OLD.paid_amount >= OLD.total_amount THEN
            RAISE EXCEPTION
                'CANCEL_BLOCKED: Cannot cancel AP Invoice "%" — it is fully paid. Reverse the payment first.',
                OLD.doc_number;
        END IF;

        NEW.cancelled_at := now();

        -- ==> AP LEDGER: REVERSAL
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id,
            entry_type,
            doc_id, doc_number, doc_date,
            debit, credit,
            currency, exchange_rate,
            description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id,
            'REVERSAL',
            NEW.id, NEW.doc_number || '-REV', NEW.doc_date,
            NEW.total_amount - NEW.paid_amount, 0,
            NEW.currency, NEW.exchange_rate,
            'Cancellation of AP Invoice ' || NEW.doc_number,
            NEW.posted_by
        );

        -- Reverse supplier balance
        UPDATE suppliers
        SET balance = GREATEST(0, balance - (NEW.total_amount - NEW.paid_amount))
        WHERE id = NEW.supplier_id;

        -- Reverse GRN invoiced_qty
        IF NEW.grn_id IS NOT NULL THEN
            UPDATE goods_receipt_lines grl
            SET invoiced_qty = GREATEST(0, grl.invoiced_qty - ail.quantity)
            FROM ap_invoice_lines ail
            WHERE ail.invoice_id = NEW.id
              AND ail.grn_line_id = grl.id;
        END IF;

        -- Reverse PO invoiced_qty
        UPDATE purchase_order_lines pol
        SET invoiced_qty = GREATEST(0, pol.invoiced_qty - ail.quantity)
        FROM ap_invoice_lines ail
        WHERE ail.invoice_id = NEW.id
          AND ail.po_line_id = pol.id;

    -- Allow cancellation of approved docs
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'approved' THEN
        NEW.cancelled_at := now();

    ELSIF NEW.status = OLD.status OR NEW.status IN ('partial_paid', 'paid') THEN
        RETURN NEW;

    ELSE
        RAISE EXCEPTION 'INVALID_TRANSITION: AP Invoice % cannot go from "%" to "%".',
            NEW.doc_number, OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_ap_invoice ON ap_invoices;
CREATE TRIGGER trg_post_ap_invoice
BEFORE UPDATE OF status ON ap_invoices
FOR EACH ROW EXECUTE FUNCTION trg_fn_post_ap_invoice();


-- =====================================================
-- SECTION 11: UPDATE PURCHASE RETURN TRIGGER — respect allow_negative_stock_returns
-- =====================================================

CREATE OR REPLACE FUNCTION trg_fn_post_purchase_return()
RETURNS TRIGGER AS $$
DECLARE
    v_inv_doc_id UUID;
    v_inv_doc_number TEXT;
    v_line RECORD;
    v_wh_id UUID;
    v_line_num INT;
    v_allow_neg BOOLEAN;
BEGIN

    -- =====================================================
    -- POSTING: draft → posted
    -- =====================================================
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN

        -- Pre-flight validations
        PERFORM validate_return_not_posted(NEW.id);

        -- Validate return lines exist
        IF NOT EXISTS (SELECT 1 FROM purchase_return_lines WHERE return_id = NEW.id LIMIT 1) THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Purchase Return % has no lines. Cannot post.', NEW.id;
        END IF;

        -- Validate qty vs GRN (if GRN linked)
        IF NEW.grn_id IS NOT NULL THEN
            PERFORM validate_return_qty_vs_grn(NEW.id);
        END IF;

        -- Resolve & validate warehouse
        v_wh_id := resolve_warehouse(NULL, NEW.warehouse_id, NEW.branch_id, NEW.company_id);
        PERFORM validate_warehouse_exists(v_wh_id);

        -- Check if negative stock is allowed for returns
        v_allow_neg := procurement_setting_bool(NEW.company_id, 'allow_negative_stock_returns');

        NEW.posted_at := now();
        NEW.posted_by := COALESCE(NEW.posted_by, NEW.created_by);

        -- Generate GIN document number
        v_inv_doc_number := generate_inv_doc_number(NEW.company_id, 'GIN');

        -- Create inventory_document (GIN = Stock OUT) as draft
        INSERT INTO inventory_documents (
            company_id, branch_id,
            doc_type, doc_number, doc_date,
            warehouse_id,
            supplier_id,
            reference_id, reference_type,
            status, remarks,
            created_by, approved_by
        ) VALUES (
            NEW.company_id, NEW.branch_id,
            'GIN', v_inv_doc_number, NEW.doc_date,
            v_wh_id,
            NEW.supplier_id,
            NEW.id, 'PUR_RET',
            'draft',
            COALESCE(NEW.remarks, 'Purchase Return: ' || NEW.doc_number),
            NEW.created_by, NEW.posted_by
        ) RETURNING id INTO v_inv_doc_id;

        -- Copy lines
        v_line_num := 0;
        FOR v_line IN
            SELECT * FROM purchase_return_lines WHERE return_id = NEW.id ORDER BY line_number
        LOOP
            PERFORM validate_item_exists(v_line.item_id);

            -- Only check stock if negative stock returns are NOT allowed
            IF NOT v_allow_neg THEN
                PERFORM validate_sufficient_stock(v_wh_id, v_line.item_id, v_line.quantity);
            END IF;

            v_line_num := v_line_num + 1;

            INSERT INTO inventory_document_lines (
                document_id, line_number,
                item_id, uom_id,
                quantity, unit_cost,
                batch_no, notes
            ) VALUES (
                v_inv_doc_id, v_line_num,
                v_line.item_id, v_line.uom_id,
                v_line.quantity, COALESCE(v_line.unit_cost, 0),
                v_line.batch_no,
                COALESCE(v_line.notes, v_line.return_reason)
            );
        END LOOP;

        -- POST the GIN → fires post_inventory_document() for stock OUT
        UPDATE inventory_documents
        SET status = 'posted',
            created_by = NEW.created_by
        WHERE id = v_inv_doc_id;

        -- ==> AP LEDGER: CREDIT_NOTE (reduces liability to supplier)
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id,
            entry_type,
            doc_id, doc_number, doc_date,
            debit, credit,
            description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id,
            'CREDIT_NOTE',
            NEW.id, NEW.doc_number, NEW.doc_date,
            NEW.total_amount, 0,
            'Purchase Return / Credit Note ' || NEW.doc_number
                || CASE WHEN NEW.return_reason IS NOT NULL
                        THEN ' — ' || NEW.return_reason ELSE '' END,
            NEW.posted_by
        );

        -- Reduce supplier balance
        UPDATE suppliers
        SET balance = GREATEST(0, balance - NEW.total_amount)
        WHERE id = NEW.supplier_id;

        -- Update PO returned_qty
        IF NEW.grn_id IS NOT NULL THEN
            UPDATE purchase_order_lines pol
            SET returned_qty = pol.returned_qty + prl.quantity
            FROM purchase_return_lines prl
            JOIN goods_receipt_lines grl ON grl.id = prl.grn_line_id
            WHERE prl.return_id = NEW.id
              AND grl.po_line_id = pol.id;
        END IF;

    -- =====================================================
    -- CANCELLATION: posted → cancelled
    -- =====================================================
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'posted' THEN

        NEW.cancelled_at := now();

        -- Cancel linked GIN
        UPDATE inventory_documents
        SET status = 'cancelled'
        WHERE reference_id = NEW.id
          AND reference_type = 'PUR_RET'
          AND status = 'posted';

        -- ==> AP LEDGER: REVERSAL
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id,
            entry_type,
            doc_id, doc_number, doc_date,
            debit, credit,
            description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id,
            'REVERSAL',
            NEW.id, NEW.doc_number || '-REV', NEW.doc_date,
            0, NEW.total_amount,
            'Cancellation of Return ' || NEW.doc_number,
            NEW.posted_by
        );

        -- Restore supplier balance
        UPDATE suppliers
        SET balance = balance + NEW.total_amount
        WHERE id = NEW.supplier_id;

        -- Reverse PO returned_qty
        IF NEW.grn_id IS NOT NULL THEN
            UPDATE purchase_order_lines pol
            SET returned_qty = GREATEST(0, pol.returned_qty - prl.quantity)
            FROM purchase_return_lines prl
            JOIN goods_receipt_lines grl ON grl.id = prl.grn_line_id
            WHERE prl.return_id = NEW.id
              AND grl.po_line_id = pol.id;
        END IF;

    ELSIF NEW.status = OLD.status THEN
        RETURN NEW;

    ELSE
        RAISE EXCEPTION 'INVALID_TRANSITION: Purchase Return % cannot go from "%" to "%".',
            NEW.doc_number, OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_purchase_return ON purchase_returns;
CREATE TRIGGER trg_post_purchase_return
BEFORE UPDATE OF status ON purchase_returns
FOR EACH ROW EXECUTE FUNCTION trg_fn_post_purchase_return();


-- =====================================================
-- SECTION 12: GRANT RPC ACCESS
-- =====================================================

GRANT EXECUTE ON FUNCTION approve_po(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_grn(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_ap_invoice(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION procurement_setting_bool(UUID, TEXT) TO authenticated;

-- Re-grant posting RPCs (already granted but harmless to repeat)
GRANT EXECUTE ON FUNCTION post_grn(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION post_ap_invoice_rpc(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION post_supplier_payment_rpc(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION post_purchase_return_rpc(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_grn(UUID, TEXT) TO authenticated;


-- =====================================================
-- END OF PROCUREMENT SETTINGS & APPROVAL WORKFLOWS
-- =====================================================
