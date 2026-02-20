-- =====================================================
-- PROCUREMENT POSTING ENGINE (FINAL PRODUCTION VERSION)
-- =====================================================
-- Run AFTER: procurement.sql, inventory_module_functions.sql
-- Depends on: goods_receipts, goods_receipt_lines,
--             ap_invoices, ap_invoice_lines,
--             supplier_payments, supplier_payment_allocations,
--             purchase_returns, purchase_return_lines,
--             ap_ledger, inventory_documents, inventory_ledger,
--             stock_on_hand, items
--
-- Design Principals (SAP-aligned):
--   - GRN posting creates an inventory_document (type GRN)
--     and updates status to 'posted' — which fires the
--     existing post_inventory_document() engine (stock, ledger, avg cost).
--   - Purchase Return posting creates an inventory_document (type GIN)
--     and posts it — stock OUT via the same engine.
--   - AP Invoice posting creates an immutable ap_ledger CREDIT row.
--   - Payment posting creates an immutable ap_ledger DEBIT row
--     and updates invoice balances via allocations.
--   - All triggers are BEFORE UPDATE OF status so NEW can be mutated.
--   - All sensitive ops wrapped in exception blocks — full rollback on error.
-- =====================================================


-- =====================================================
-- SECTION 1: VALIDATION HELPERS (Procurement-specific)
-- =====================================================

-- -------------------------------------------------------
-- 1A. Validate: GRN has at least one line
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_grn_has_lines(p_grn_id UUID)
RETURNS VOID AS $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM goods_receipt_lines WHERE grn_id = p_grn_id;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: GRN % has no lines. Cannot post.', p_grn_id;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- -------------------------------------------------------
-- 1B. Validate: AP Invoice quantity does not exceed GRN received quantity
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_invoice_qty_vs_grn(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
    v_rec RECORD;
    v_max_invoiceable NUMERIC;
    v_already_invoiced NUMERIC;
BEGIN
    FOR v_rec IN
        SELECT
            ail.grn_line_id,
            ail.quantity AS invoice_qty,
            grl.quantity AS grn_qty,
            i.name AS item_name
        FROM ap_invoice_lines ail
        JOIN goods_receipt_lines grl ON grl.id = ail.grn_line_id
        JOIN items i ON i.id = ail.item_id
        WHERE ail.invoice_id = p_invoice_id
          AND ail.grn_line_id IS NOT NULL
    LOOP
        -- Total already invoiced on this GRN line (excluding current invoice)
        SELECT COALESCE(SUM(x.quantity), 0) INTO v_already_invoiced
        FROM ap_invoice_lines x
        JOIN ap_invoices ai ON ai.id = x.invoice_id
        WHERE x.grn_line_id = v_rec.grn_line_id
          AND ai.status != 'cancelled'
          AND ai.id != p_invoice_id;

        v_max_invoiceable := v_rec.grn_qty - v_already_invoiced;

        IF v_rec.invoice_qty > v_max_invoiceable + 0.0001 THEN
            RAISE EXCEPTION
                'OVER_INVOICE: Item "%" — trying to invoice % but only % available to invoice (GRN received: %, already invoiced: %).',
                v_rec.item_name,
                v_rec.invoice_qty,
                v_max_invoiceable,
                v_rec.grn_qty,
                v_already_invoiced;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;


-- -------------------------------------------------------
-- 1C. Validate: Return quantity does not exceed GRN received quantity
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_return_qty_vs_grn(p_return_id UUID)
RETURNS VOID AS $$
DECLARE
    v_rec RECORD;
    v_already_returned NUMERIC;
    v_max_returnable NUMERIC;
BEGIN
    FOR v_rec IN
        SELECT
            prl.grn_line_id,
            prl.quantity AS return_qty,
            grl.quantity AS grn_qty,
            i.name AS item_name
        FROM purchase_return_lines prl
        JOIN goods_receipt_lines grl ON grl.id = prl.grn_line_id
        JOIN items i ON i.id = prl.item_id
        WHERE prl.return_id = p_return_id
          AND prl.grn_line_id IS NOT NULL
    LOOP
        SELECT COALESCE(SUM(x.quantity), 0) INTO v_already_returned
        FROM purchase_return_lines x
        JOIN purchase_returns pr ON pr.id = x.return_id
        WHERE x.grn_line_id = v_rec.grn_line_id
          AND pr.status != 'cancelled'
          AND pr.id != p_return_id;

        v_max_returnable := v_rec.grn_qty - v_already_returned;

        IF v_rec.return_qty > v_max_returnable + 0.0001 THEN
            RAISE EXCEPTION
                'OVER_RETURN: Item "%" — trying to return % but only % returnable (GRN received: %, already returned: %).',
                v_rec.item_name,
                v_rec.return_qty,
                v_max_returnable,
                v_rec.grn_qty,
                v_already_returned;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;


-- -------------------------------------------------------
-- 1D. Validate: Payment allocations do not exceed invoice outstanding balance
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_payment_allocations(p_payment_id UUID)
RETURNS VOID AS $$
DECLARE
    v_rec RECORD;
    v_balance NUMERIC;
BEGIN
    FOR v_rec IN
        SELECT
            spa.invoice_id,
            spa.amount AS alloc_amount,
            ai.doc_number AS inv_number,
            ai.balance_due
        FROM supplier_payment_allocations spa
        JOIN ap_invoices ai ON ai.id = spa.invoice_id
        WHERE spa.payment_id = p_payment_id
    LOOP
        IF v_rec.alloc_amount > v_rec.balance_due + 0.005 THEN
            RAISE EXCEPTION
                'OVER_PAYMENT: Allocation of % exceeds outstanding balance % on Invoice "%".',
                v_rec.alloc_amount,
                v_rec.balance_due,
                v_rec.inv_number;
        END IF;
    END LOOP;

    -- Also validate total allocated <= payment amount
    DECLARE
        v_total_alloc NUMERIC;
        v_pay_amount  NUMERIC;
    BEGIN
        SELECT COALESCE(SUM(amount), 0) INTO v_total_alloc
        FROM supplier_payment_allocations WHERE payment_id = p_payment_id;

        SELECT total_amount INTO v_pay_amount
        FROM supplier_payments WHERE id = p_payment_id;

        IF v_total_alloc > v_pay_amount + 0.005 THEN
            RAISE EXCEPTION
                'OVER_PAYMENT: Total allocations (%) exceed payment amount (%).',
                v_total_alloc, v_pay_amount;
        END IF;
    END;
END;
$$ LANGUAGE plpgsql;


-- -------------------------------------------------------
-- 1E. Validate: GRN idempotency (not already posted to inventory)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_grn_not_posted(p_grn_id UUID)
RETURNS VOID AS $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM inventory_documents
    WHERE reference_id = p_grn_id
      AND reference_type = 'GRN'
      AND status = 'posted';

    IF v_count > 0 THEN
        RAISE EXCEPTION 'DUPLICATE_POST: GRN % has already been posted to inventory.', p_grn_id;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- -------------------------------------------------------
-- 1F. Validate: AP Invoice idempotency (not already in ap_ledger)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_invoice_not_posted(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM ap_ledger
    WHERE doc_id = p_invoice_id
      AND entry_type = 'INVOICE';

    IF v_count > 0 THEN
        RAISE EXCEPTION 'DUPLICATE_POST: AP Invoice % already has a ledger entry.', p_invoice_id;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- -------------------------------------------------------
-- 1G. Validate: Payment idempotency
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_payment_not_posted(p_payment_id UUID)
RETURNS VOID AS $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM ap_ledger
    WHERE doc_id = p_payment_id
      AND entry_type = 'PAYMENT';

    IF v_count > 0 THEN
        RAISE EXCEPTION 'DUPLICATE_POST: Payment % already has a ledger entry.', p_payment_id;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- -------------------------------------------------------
-- 1H. Validate: Return idempotency
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_return_not_posted(p_return_id UUID)
RETURNS VOID AS $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM ap_ledger
    WHERE doc_id = p_return_id
      AND entry_type = 'CREDIT_NOTE';

    IF v_count > 0 THEN
        RAISE EXCEPTION 'DUPLICATE_POST: Purchase Return % already has a ledger entry.', p_return_id;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- SECTION 2: HELPER — Resolve Warehouse
-- =====================================================
-- Returns: line warehouse if set, else GRN/Return warehouse,
--          else default MAIN STORE for the branch.

CREATE OR REPLACE FUNCTION resolve_warehouse(
    p_line_wh_id UUID,
    p_doc_wh_id UUID,
    p_branch_id UUID,
    p_company_id UUID
)
RETURNS UUID AS $$
DECLARE v_wh_id UUID;
BEGIN
    IF p_line_wh_id IS NOT NULL THEN
        RETURN p_line_wh_id;
    END IF;

    IF p_doc_wh_id IS NOT NULL THEN
        RETURN p_doc_wh_id;
    END IF;

    -- Fallback: branch default (main store)
    SELECT id INTO v_wh_id
    FROM warehouses
    WHERE branch_id = p_branch_id
      AND company_id = p_company_id
      AND is_default = true
      AND is_active = true
    LIMIT 1;

    IF v_wh_id IS NULL THEN
        SELECT id INTO v_wh_id
        FROM warehouses
        WHERE branch_id = p_branch_id
          AND company_id = p_company_id
          AND warehouse_type = 'main_store'
          AND is_active = true
        LIMIT 1;
    END IF;

    IF v_wh_id IS NULL THEN
        RAISE EXCEPTION 'NO_WAREHOUSE: No active default warehouse found for branch %.', p_branch_id;
    END IF;

    RETURN v_wh_id;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- SECTION 3: GRN POSTING TRIGGER
-- =====================================================
-- On goods_receipts.status: draft → posted
--   1. Validate (idempotency, lines, warehouse, items)
--   2. Create inventory_document (type=GRN, status=draft)
--   3. Copy goods_receipt_lines → inventory_document_lines
--   4. Set inventory_document.status = 'posted'
--      → fires post_inventory_document() engine (stock IN, ledger, avg cost)
--   5. Update PO line received_qty + PO status (open/partial/closed)
--
-- On goods_receipts.status: posted → cancelled
--   1. Find the linked inventory_document → set it to cancelled
--      → fires post_inventory_document() reverse engine
--   2. Reverse PO received_qty
--   3. Re-open PO if was closed

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
    -- POSTING: draft → posted
    -- =====================================================
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN

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
        -- which handles: ledger entries, stock_on_hand update, avg cost
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

        -- Update supplier last_purchase_price per item (best-effort)
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

        -- Cancel the linked inventory_document → triggers reversal in engine
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

    ELSIF NEW.status = OLD.status THEN
        -- No status change — let through (updated_at trigger fires separately)
        RETURN NEW;

    ELSIF NEW.status != 'cancelled' AND NEW.status != 'posted' THEN
        -- Allow draft edits freely (status stays draft)
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
-- SECTION 4: AP INVOICE POSTING TRIGGER
-- =====================================================
-- On ap_invoices.status: draft → posted
--   1. Validate (idempotency, invoice qty vs GRN qty)
--   2. Insert ap_ledger CREDIT row (money owed to supplier)
--   3. Update supplier.balance += invoice.total_amount
--   4. Compute & stamp due_date from payment_terms if null
--   5. Mark GRN lines as invoiced (invoiced_qty += invoice line qty)
--   6. Mark PO lines as invoiced
--
-- On ap_invoices.status: posted/partial_paid → cancelled
--   1. Insert ap_ledger REVERSAL row
--   2. Reverse supplier.balance
--   3. Reverse GRN invoiced_qty

CREATE OR REPLACE FUNCTION trg_fn_post_ap_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_net_days INT;
    v_alloc RECORD;
BEGIN

    -- =====================================================
    -- POSTING: draft → posted
    -- =====================================================
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN

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

        -- Mark GRN lines as invoiced (partial supported)
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

        -- ==> AP LEDGER: REVERSAL (liability cancelled)
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

        -- Reverse supplier balance (only the outstanding portion)
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

    ELSIF NEW.status = OLD.status OR NEW.status IN ('partial_paid', 'paid') THEN
        -- Internal status updates from payment trigger — allow
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
-- SECTION 5: SUPPLIER PAYMENT POSTING TRIGGER
-- =====================================================
-- On supplier_payments.status: draft → posted
--   1. Validate (idempotency, allocations <= outstanding)
--   2. Insert ap_ledger DEBIT (money paid)
--   3. Update supplier.balance -= payment.total_amount
--   4. For each allocation:
--        - ap_invoices.paid_amount += alloc.amount
--        - ap_invoices.status = unpaid/partial_paid/paid
--   5. Update allocated_amount on payment
--
-- On supplier_payments.status: posted → cancelled
--   1. Insert ap_ledger REVERSAL
--   2. Restore supplier.balance
--   3. Reverse invoice paid_amounts

CREATE OR REPLACE FUNCTION trg_fn_post_supplier_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_alloc RECORD;
    v_total_alloc NUMERIC;
    v_new_paid NUMERIC;
BEGIN

    -- =====================================================
    -- POSTING: draft → posted
    -- =====================================================
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN

        -- Pre-flight validations
        PERFORM validate_payment_not_posted(NEW.id);
        PERFORM validate_payment_allocations(NEW.id);

        NEW.posted_at := now();
        NEW.posted_by := COALESCE(NEW.posted_by, NEW.created_by);

        -- ==> AP LEDGER: DEBIT (cash payment made)
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id,
            entry_type,
            doc_id, doc_number, doc_date,
            debit, credit,
            currency, exchange_rate,
            description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id,
            'PAYMENT',
            NEW.id, NEW.doc_number, NEW.doc_date,
            NEW.total_amount, 0,
            NEW.currency, NEW.exchange_rate,
            'Payment ' || NEW.doc_number
                || ' via ' || NEW.payment_method
                || CASE WHEN NEW.reference_no IS NOT NULL
                        THEN ' | Ref: ' || NEW.reference_no ELSE '' END
                || CASE WHEN NEW.cheque_no IS NOT NULL
                        THEN ' | Chq: ' || NEW.cheque_no ELSE '' END,
            NEW.posted_by
        );

        -- Reduce supplier balance
        UPDATE suppliers
        SET balance = GREATEST(0, balance - NEW.total_amount)
        WHERE id = NEW.supplier_id;

        -- Process allocations → update each invoice
        v_total_alloc := 0;
        FOR v_alloc IN
            SELECT * FROM supplier_payment_allocations WHERE payment_id = NEW.id
        LOOP
            v_total_alloc := v_total_alloc + v_alloc.amount;

            -- Calculate new paid_amount for this invoice
            SELECT paid_amount + v_alloc.amount INTO v_new_paid
            FROM ap_invoices WHERE id = v_alloc.invoice_id;

            -- Update invoice paid_amount and status
            UPDATE ap_invoices
            SET paid_amount = v_new_paid,
                status = CASE
                    WHEN v_new_paid >= total_amount - 0.005 THEN 'paid'
                    WHEN v_new_paid > 0                      THEN 'partial_paid'
                    ELSE status
                END
            WHERE id = v_alloc.invoice_id;
        END LOOP;

        -- Stamp allocated amount on payment
        NEW.allocated_amount := v_total_alloc;

    -- =====================================================
    -- CANCELLATION: posted → cancelled
    -- =====================================================
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'posted' THEN

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
            0, NEW.total_amount,
            NEW.currency, NEW.exchange_rate,
            'Cancellation of Payment ' || NEW.doc_number,
            NEW.posted_by
        );

        -- Restore supplier balance
        UPDATE suppliers
        SET balance = balance + NEW.total_amount
        WHERE id = NEW.supplier_id;

        -- Reverse allocations on invoices
        FOR v_alloc IN
            SELECT * FROM supplier_payment_allocations WHERE payment_id = NEW.id
        LOOP
            SELECT GREATEST(0, paid_amount - v_alloc.amount) INTO v_new_paid
            FROM ap_invoices WHERE id = v_alloc.invoice_id;

            UPDATE ap_invoices
            SET paid_amount = v_new_paid,
                status = CASE
                    WHEN v_new_paid <= 0        THEN 'posted'
                    ELSE                             'partial_paid'
                END
            WHERE id = v_alloc.invoice_id
              AND status IN ('paid', 'partial_paid');
        END LOOP;

        -- Reset allocated_amount on payment
        NEW.allocated_amount := 0;

    ELSIF NEW.status = OLD.status THEN
        RETURN NEW;

    ELSE
        RAISE EXCEPTION 'INVALID_TRANSITION: Payment % cannot go from "%" to "%".',
            NEW.doc_number, OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_supplier_payment ON supplier_payments;
CREATE TRIGGER trg_post_supplier_payment
BEFORE UPDATE OF status ON supplier_payments
FOR EACH ROW EXECUTE FUNCTION trg_fn_post_supplier_payment();


-- =====================================================
-- SECTION 6: PURCHASE RETURN POSTING TRIGGER
-- =====================================================
-- On purchase_returns.status: draft → posted
--   1. Validate (idempotency, return qty vs GRN qty, stock)
--   2. Create inventory_document type GIN (stock OUT)
--   3. Copy purchase_return_lines → inventory_document_lines
--   4. Set GIN doc status = posted → fires inventory engine (stock OUT)
--   5. Insert ap_ledger CREDIT_NOTE (reduces liability)
--   6. Reduce supplier balance
--   7. Update PO returned_qty
--
-- On purchase_returns.status: posted → cancelled
--   1. Cancel the linked GIN inventory_document (reverses stock)
--   2. Insert ap_ledger REVERSAL
--   3. Restore supplier balance

CREATE OR REPLACE FUNCTION trg_fn_post_purchase_return()
RETURNS TRIGGER AS $$
DECLARE
    v_inv_doc_id UUID;
    v_inv_doc_number TEXT;
    v_line RECORD;
    v_wh_id UUID;
    v_line_num INT;
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

        NEW.posted_at := now();
        NEW.posted_by := COALESCE(NEW.posted_by, NEW.created_by);

        -- Generate GIN document number
        v_inv_doc_number := generate_inv_doc_number(NEW.company_id, 'GIN');

        -- Create inventory_document (GIN = Stock OUT = Goods Issue) as draft
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
            PERFORM validate_sufficient_stock(v_wh_id, v_line.item_id, v_line.quantity);

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

        -- Update PO returned_qty (via GRN line → PO line)
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

        -- Cancel linked GIN → fires inventory engine reversal (stock IN)
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
-- SECTION 7: IMMUTABILITY GUARDS (Procurement Docs)
-- =====================================================
-- Blocks any column edits on posted/cancelled procurement
-- documents. Only status transition (posted→cancelled) allowed.

CREATE OR REPLACE FUNCTION trg_fn_block_procurement_edit()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'posted' THEN
        -- Only allow posted → cancelled
        IF NEW.status = 'cancelled' THEN
            RETURN NEW;
        END IF;
        -- Allow internal paid_amount / status updates on ap_invoices
        IF TG_TABLE_NAME = 'ap_invoices'
           AND (NEW.status IN ('partial_paid', 'paid')
                OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount) THEN
            RETURN NEW;
        END IF;
        -- Allow allocated_amount updates on supplier_payments
        IF TG_TABLE_NAME = 'supplier_payments'
           AND NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'IMMUTABLE_DOC: Cannot edit posted document "%" on %.  Cancel it first.',
            OLD.doc_number, TG_TABLE_NAME;
    END IF;

    IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'IMMUTABLE_DOC: Cannot edit cancelled document "%" on %.',
            OLD.doc_number, TG_TABLE_NAME;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all procurement document tables
-- (Drop old triggers from procurement.sql first if re-running)
DROP TRIGGER IF EXISTS trg_block_po_edit ON purchase_orders;
CREATE TRIGGER trg_block_po_edit
BEFORE UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION trg_fn_block_procurement_edit();

DROP TRIGGER IF EXISTS trg_block_grn_edit ON goods_receipts;
CREATE TRIGGER trg_block_grn_edit
BEFORE UPDATE ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION trg_fn_block_procurement_edit();

DROP TRIGGER IF EXISTS trg_block_apinv_edit ON ap_invoices;
CREATE TRIGGER trg_block_apinv_edit
BEFORE UPDATE ON ap_invoices
FOR EACH ROW EXECUTE FUNCTION trg_fn_block_procurement_edit();

DROP TRIGGER IF EXISTS trg_block_suppay_edit ON supplier_payments;
CREATE TRIGGER trg_block_suppay_edit
BEFORE UPDATE ON supplier_payments
FOR EACH ROW EXECUTE FUNCTION trg_fn_block_procurement_edit();

DROP TRIGGER IF EXISTS trg_block_pret_edit ON purchase_returns;
CREATE TRIGGER trg_block_pret_edit
BEFORE UPDATE ON purchase_returns
FOR EACH ROW EXECUTE FUNCTION trg_fn_block_procurement_edit();


-- =====================================================
-- SECTION 8: PROCUREMENT RPC HELPERS (callable from app)
-- =====================================================

-- -------------------------------------------------------
-- 8A. post_grn(p_grn_id) — safe wrapper for frontend
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION post_grn(p_grn_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
BEGIN
    SELECT doc_number, status INTO v_doc_number, v_status
    FROM goods_receipts WHERE id = p_grn_id;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'GRN not found: ' || p_grn_id);
    END IF;

    IF v_status != 'draft' THEN
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


-- -------------------------------------------------------
-- 8B. post_ap_invoice(p_invoice_id) — safe wrapper
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION post_ap_invoice_rpc(p_invoice_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
BEGIN
    SELECT doc_number, status INTO v_doc_number, v_status
    FROM ap_invoices WHERE id = p_invoice_id;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found: ' || p_invoice_id);
    END IF;

    IF v_status != 'draft' THEN
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


-- -------------------------------------------------------
-- 8C. post_supplier_payment(p_payment_id) — safe wrapper
-- -------------------------------------------------------
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


-- -------------------------------------------------------
-- 8D. post_purchase_return(p_return_id) — safe wrapper
-- -------------------------------------------------------
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


-- -------------------------------------------------------
-- 8E. cancel_grn(p_grn_id, p_reason) — safe wrapper
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_grn(p_grn_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_doc_number TEXT;
    v_status     TEXT;
BEGIN
    SELECT doc_number, status INTO v_doc_number, v_status
    FROM goods_receipts WHERE id = p_grn_id;

    IF v_status != 'posted' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'GRN "' || v_doc_number || '" is ' || v_status || '. Only posted GRNs can be cancelled.');
    END IF;

    -- Block if any invoice is posted against this GRN
    IF EXISTS (
        SELECT 1 FROM ap_invoices
        WHERE grn_id = p_grn_id AND status IN ('posted', 'partial_paid', 'paid')
    ) THEN
        RETURN jsonb_build_object('success', false,
            'error', 'GRN "' || v_doc_number || '" has posted invoices. Reverse invoices first.');
    END IF;

    UPDATE goods_receipts
    SET status = 'cancelled', cancel_reason = p_reason
    WHERE id = p_grn_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'cancelled');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================
-- SECTION 9: GRANT RPC ACCESS (Supabase anon/service role)
-- =====================================================

GRANT EXECUTE ON FUNCTION post_grn(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION post_ap_invoice_rpc(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION post_supplier_payment_rpc(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION post_purchase_return_rpc(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_grn(UUID, TEXT) TO authenticated;


-- =====================================================
-- END OF PROCUREMENT POSTING ENGINE
-- =====================================================
