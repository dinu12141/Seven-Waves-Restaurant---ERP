-- ═══════════════════════════════════════════════════════════════════
-- Procurement Module: Bill & Allocation Logic
-- ═══════════════════════════════════════════════════════════════════
-- 1. Auto-generate Supplier Bill (AP Invoice) when GRN is posted
-- 2. Double-entry Journal Entries on AP Invoice posting
-- 3. Double-entry Journal Entries on Supplier Payment posting
-- 4. GL account seeds for procurement
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- STEP 0: Ensure procurement GL accounts exist
-- ─────────────────────────────────────────────────────────────────

INSERT INTO public.chart_of_accounts (code, name, account_type, description) VALUES
  ('1200', 'Inventory',            'Asset',     'Food and beverage stock'),
  ('2000', 'Accounts Payable',     'Liability', 'Amounts owed to suppliers'),
  ('5000', 'Cost of Goods Sold',   'Expense',   'Direct food and beverage costs'),
  ('5010', 'Purchases',            'Expense',   'Goods purchased from suppliers')
ON CONFLICT (code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────
-- STEP 1: Auto-generate AP Invoice (Supplier Bill) on GRN posting
-- ─────────────────────────────────────────────────────────────────
-- Fires AFTER the GRN posting trigger completes (status = posted).
-- Creates a draft AP Invoice with lines mirroring the GRN lines
-- (only un-invoiced quantities).

CREATE OR REPLACE FUNCTION trg_fn_auto_bill_from_grn()
RETURNS TRIGGER AS $$
DECLARE
    v_doc_number   TEXT;
    v_invoice_id   UUID;
    v_line         RECORD;
    v_line_num     INT := 0;
    v_subtotal     NUMERIC := 0;
    v_invoiceable  NUMERIC;
BEGIN
    -- Only fire on draft → posted transition
    IF NEW.status != 'posted' OR OLD.status != 'draft' THEN
        RETURN NEW;
    END IF;

    -- Generate AP Invoice doc number
    v_doc_number := generate_proc_doc_number(NEW.company_id, NEW.branch_id, 'AP_INV');
    IF v_doc_number IS NULL THEN
        v_doc_number := 'APINV-' || extract(epoch from now())::bigint;
    END IF;

    -- Create AP Invoice header (status = draft, UNPAID)
    INSERT INTO ap_invoices (
        company_id, branch_id,
        doc_number, doc_date,
        supplier_id, grn_id, po_id,
        payment_term_id,
        currency, exchange_rate,
        status,
        subtotal, discount_amount, tax_amount, total_amount,
        paid_amount,
        remarks,
        created_by
    ) VALUES (
        NEW.company_id, NEW.branch_id,
        v_doc_number, NEW.doc_date,
        NEW.supplier_id, NEW.id, NEW.po_id,
        (SELECT payment_term_id FROM suppliers WHERE id = NEW.supplier_id),
        'LKR', 1,
        'draft',
        0, 0, 0, 0,
        0,
        'Auto-generated from GRN ' || NEW.doc_number,
        NEW.posted_by
    ) RETURNING id INTO v_invoice_id;

    -- Copy GRN lines → AP Invoice lines (only un-invoiced qty)
    FOR v_line IN
        SELECT
            grl.id AS grn_line_id,
            grl.po_line_id,
            grl.item_id,
            grl.description,
            grl.uom_id,
            grl.quantity,
            COALESCE(grl.invoiced_qty, 0) AS already_invoiced,
            grl.unit_cost
        FROM goods_receipt_lines grl
        WHERE grl.grn_id = NEW.id
        ORDER BY grl.line_number
    LOOP
        v_invoiceable := v_line.quantity - v_line.already_invoiced;

        -- Skip fully invoiced lines (shouldn't happen on first GRN post, but safe)
        IF v_invoiceable <= 0.0001 THEN
            CONTINUE;
        END IF;

        v_line_num := v_line_num + 1;

        INSERT INTO ap_invoice_lines (
            invoice_id, line_number,
            grn_line_id, po_line_id,
            item_id, description, uom_id,
            quantity, unit_price,
            discount_pct, tax_pct
        ) VALUES (
            v_invoice_id, v_line_num,
            v_line.grn_line_id, v_line.po_line_id,
            v_line.item_id, v_line.description, v_line.uom_id,
            v_invoiceable, COALESCE(v_line.unit_cost, 0),
            0, 0
        );

        v_subtotal := v_subtotal + (v_invoiceable * COALESCE(v_line.unit_cost, 0));
    END LOOP;

    -- Update invoice totals
    IF v_line_num > 0 THEN
        UPDATE ap_invoices
        SET subtotal = v_subtotal,
            total_amount = v_subtotal
        WHERE id = v_invoice_id;
    ELSE
        -- No invoiceable lines — remove the empty invoice
        DELETE FROM ap_invoices WHERE id = v_invoice_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fire AFTER the existing GRN posting trigger (which is BEFORE UPDATE)
-- so all GRN line updates (invoiced_qty, etc.) are already committed.
DROP TRIGGER IF EXISTS trg_auto_bill_from_grn ON goods_receipts;
CREATE TRIGGER trg_auto_bill_from_grn
AFTER UPDATE OF status ON goods_receipts
FOR EACH ROW
WHEN (NEW.status = 'posted' AND OLD.status = 'draft')
EXECUTE FUNCTION trg_fn_auto_bill_from_grn();


-- ─────────────────────────────────────────────────────────────────
-- STEP 2: Journal Entry on AP Invoice Posting
-- ─────────────────────────────────────────────────────────────────
-- When an AP Invoice is posted (draft → posted), create:
--   Debit:  1200 (Inventory) or 5010 (Purchases)  = total_amount
--   Credit: 2000 (Accounts Payable)                = total_amount
--
-- This is the classic "3-way match" double-entry.

CREATE OR REPLACE FUNCTION trg_fn_journal_on_ap_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_journal_id UUID;
BEGIN
    -- Only fire on draft → posted
    IF NEW.status != 'posted' OR OLD.status != 'draft' THEN
        RETURN NEW;
    END IF;

    -- Idempotency: skip if journal already exists for this invoice
    IF EXISTS (
        SELECT 1 FROM journal_entries
        WHERE reference_id = NEW.id AND reference_type = 'ap_invoice'
    ) THEN
        RETURN NEW;
    END IF;

    -- Create Journal Entry header
    INSERT INTO journal_entries (
        company_id, branch_id,
        doc_date,
        reference_id, reference_type,
        description, entry_type
    ) VALUES (
        NEW.company_id, NEW.branch_id,
        NEW.doc_date,
        NEW.id, 'ap_invoice',
        'Supplier Bill ' || NEW.doc_number
            || COALESCE(' | Supplier Ref: ' || NULLIF(NEW.supplier_inv_no, ''), ''),
        'procurement'
    ) RETURNING id INTO v_journal_id;

    -- Debit: Inventory (for GRN-backed invoices) or Purchases (direct)
    INSERT INTO journal_lines (journal_id, account_code, dr_amount, cr_amount, memo)
    VALUES (
        v_journal_id,
        CASE WHEN NEW.grn_id IS NOT NULL THEN '1200' ELSE '5010' END,
        NEW.total_amount,
        0,
        'Inventory/Purchases from ' || NEW.doc_number
    );

    -- Credit: Accounts Payable
    INSERT INTO journal_lines (journal_id, account_code, dr_amount, cr_amount, memo)
    VALUES (
        v_journal_id,
        '2000',
        0,
        NEW.total_amount,
        'Liability to supplier — ' || NEW.doc_number
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_journal_on_ap_invoice ON ap_invoices;
CREATE TRIGGER trg_journal_on_ap_invoice
AFTER UPDATE OF status ON ap_invoices
FOR EACH ROW
WHEN (NEW.status = 'posted' AND OLD.status = 'draft')
EXECUTE FUNCTION trg_fn_journal_on_ap_invoice();


-- ─────────────────────────────────────────────────────────────────
-- STEP 3: Journal Entry on Supplier Payment Posting
-- ─────────────────────────────────────────────────────────────────
-- When a Supplier Payment is posted (draft → posted), create:
--   Debit:  2000 (Accounts Payable)   = total_amount
--   Credit: 1000/1010 (Cash/Bank)     = total_amount

CREATE OR REPLACE FUNCTION trg_fn_journal_on_supplier_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_journal_id UUID;
    v_cash_account TEXT;
BEGIN
    -- Only fire on draft → posted
    IF NEW.status != 'posted' OR OLD.status != 'draft' THEN
        RETURN NEW;
    END IF;

    -- Idempotency
    IF EXISTS (
        SELECT 1 FROM journal_entries
        WHERE reference_id = NEW.id AND reference_type = 'supplier_payment'
    ) THEN
        RETURN NEW;
    END IF;

    -- Determine cash/bank account based on payment method
    CASE NEW.payment_method
        WHEN 'cash'          THEN v_cash_account := '1000';  -- Cash on Hand
        WHEN 'bank_transfer' THEN v_cash_account := '1010';  -- Bank Account
        WHEN 'cheque'        THEN v_cash_account := '1010';  -- Bank Account
        WHEN 'credit_card'   THEN v_cash_account := '1010';  -- Bank Account
        ELSE                      v_cash_account := '1000';  -- Default to Cash
    END CASE;

    -- Create Journal Entry header
    INSERT INTO journal_entries (
        company_id, branch_id,
        doc_date,
        reference_id, reference_type,
        description, entry_type
    ) VALUES (
        NEW.company_id, NEW.branch_id,
        NEW.doc_date,
        NEW.id, 'supplier_payment',
        'Supplier Payment ' || NEW.doc_number
            || ' via ' || NEW.payment_method
            || COALESCE(' | Ref: ' || NULLIF(NEW.reference_no, ''), '')
            || COALESCE(' | Chq: ' || NULLIF(NEW.cheque_no, ''), ''),
        'procurement'
    ) RETURNING id INTO v_journal_id;

    -- Debit: Accounts Payable (reduce liability)
    INSERT INTO journal_lines (journal_id, account_code, dr_amount, cr_amount, memo)
    VALUES (
        v_journal_id,
        '2000',
        NEW.total_amount,
        0,
        'Payment against supplier liability — ' || NEW.doc_number
    );

    -- Credit: Cash / Bank (money going out)
    INSERT INTO journal_lines (journal_id, account_code, dr_amount, cr_amount, memo)
    VALUES (
        v_journal_id,
        v_cash_account,
        0,
        NEW.total_amount,
        'Cash/Bank outflow — ' || NEW.doc_number
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_journal_on_supplier_payment ON supplier_payments;
CREATE TRIGGER trg_journal_on_supplier_payment
AFTER UPDATE OF status ON supplier_payments
FOR EACH ROW
WHEN (NEW.status = 'posted' AND OLD.status = 'draft')
EXECUTE FUNCTION trg_fn_journal_on_supplier_payment();


-- ─────────────────────────────────────────────────────────────────
-- STEP 4: Reversal Journal Entries on Cancellation
-- ─────────────────────────────────────────────────────────────────
-- When an AP Invoice or Supplier Payment is cancelled,
-- create a reversing journal entry.

CREATE OR REPLACE FUNCTION trg_fn_journal_reversal_ap_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_journal_id UUID;
    v_original_journal_id UUID;
BEGIN
    IF NEW.status != 'cancelled' OR OLD.status NOT IN ('posted', 'partial_paid') THEN
        RETURN NEW;
    END IF;

    -- Find original journal
    SELECT id INTO v_original_journal_id
    FROM journal_entries
    WHERE reference_id = NEW.id AND reference_type = 'ap_invoice'
      AND is_reversed = false
    LIMIT 1;

    IF v_original_journal_id IS NULL THEN
        RETURN NEW;  -- No journal to reverse
    END IF;

    -- Mark original as reversed
    UPDATE journal_entries SET is_reversed = true WHERE id = v_original_journal_id;

    -- Create reversal journal (swap dr/cr)
    INSERT INTO journal_entries (
        company_id, branch_id, doc_date,
        reference_id, reference_type,
        description, entry_type
    ) VALUES (
        NEW.company_id, NEW.branch_id, CURRENT_DATE,
        NEW.id, 'ap_invoice',
        'REVERSAL — ' || NEW.doc_number,
        'procurement'
    ) RETURNING id INTO v_journal_id;

    -- Copy lines with swapped amounts
    INSERT INTO journal_lines (journal_id, account_code, dr_amount, cr_amount, memo)
    SELECT v_journal_id, account_code, cr_amount, dr_amount,
           'Reversal: ' || COALESCE(memo, '')
    FROM journal_lines
    WHERE journal_id = v_original_journal_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_journal_reversal_ap_invoice ON ap_invoices;
CREATE TRIGGER trg_journal_reversal_ap_invoice
AFTER UPDATE OF status ON ap_invoices
FOR EACH ROW
WHEN (NEW.status = 'cancelled')
EXECUTE FUNCTION trg_fn_journal_reversal_ap_invoice();


CREATE OR REPLACE FUNCTION trg_fn_journal_reversal_supplier_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_journal_id UUID;
    v_original_journal_id UUID;
BEGIN
    IF NEW.status != 'cancelled' OR OLD.status != 'posted' THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_original_journal_id
    FROM journal_entries
    WHERE reference_id = NEW.id AND reference_type = 'supplier_payment'
      AND is_reversed = false
    LIMIT 1;

    IF v_original_journal_id IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE journal_entries SET is_reversed = true WHERE id = v_original_journal_id;

    INSERT INTO journal_entries (
        company_id, branch_id, doc_date,
        reference_id, reference_type,
        description, entry_type
    ) VALUES (
        NEW.company_id, NEW.branch_id, CURRENT_DATE,
        NEW.id, 'supplier_payment',
        'REVERSAL — ' || NEW.doc_number,
        'procurement'
    ) RETURNING id INTO v_journal_id;

    INSERT INTO journal_lines (journal_id, account_code, dr_amount, cr_amount, memo)
    SELECT v_journal_id, account_code, cr_amount, dr_amount,
           'Reversal: ' || COALESCE(memo, '')
    FROM journal_lines
    WHERE journal_id = v_original_journal_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_journal_reversal_supplier_payment ON supplier_payments;
CREATE TRIGGER trg_journal_reversal_supplier_payment
AFTER UPDATE OF status ON supplier_payments
FOR EACH ROW
WHEN (NEW.status = 'cancelled')
EXECUTE FUNCTION trg_fn_journal_reversal_supplier_payment();


-- ═══════════════════════════════════════════════════════════════════
-- END: Procurement Bill & Allocation Logic
-- ═══════════════════════════════════════════════════════════════════
