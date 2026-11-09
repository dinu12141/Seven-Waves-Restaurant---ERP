-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 158: GRN & AP Bill Tax Double-Entry Architecture
-- Seven Waves Restaurant ERP
-- ═══════════════════════════════════════════════════════════════════════════
-- Standardizes Tax / VAT accounting on all purchases (GRN and AP Invoices):
--
-- Scenario Example:
--   Purchased Goods: LKR 6,000.00 total (5,000 Net Goods + 1,000 Tax/VAT)
--
-- Accounting Entries upon Bill Posting:
--   1. Dr 1005 (Inventory - Raw Materials)          : LKR 5,000.00 (Asset)
--   2. Dr 1010 (Input VAT - Recoverable)           : LKR 1,000.00 (Current Asset - Tax Receivable)
--   3. Cr 2000 (Accounts Payables)                  : LKR 6,000.00 (Current Liability - Supplier Liability)
--   Sub-ledger: ap_ledger Credit LKR 6,000.00 / suppliers.balance += LKR 6,000.00
--
-- Accounting Entries upon Supplier Payment (Cash or Bank):
--   1. Dr 2000 (Accounts Payables)                  : LKR 6,000.00 (Clearing Supplier Liability)
--   2. Cr Paying Account (Cash Drawer / Bank Ledger): LKR 6,000.00 (Disbursement)
--   Sub-ledger: ap_ledger Debit LKR 6,000.00 / suppliers.balance -= LKR 6,000.00
--
-- Accounting Entries upon IRD Tax Settlement:
--   1. Dr 2006 (Output VAT Payable)                 : Clears sales VAT liability
--   2. Cr 1010 (Input VAT - Recoverable)            : Offsets purchase VAT asset
--   3. Cr/Dr Bank Account                           : Net difference remitted to / refunded by IRD
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure trg_fn_auto_bill_from_grn preserves tax_amount and total_amount
CREATE OR REPLACE FUNCTION public.trg_fn_auto_bill_from_grn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc_number  TEXT;
    v_invoice_id  UUID;
    v_line        RECORD;
    v_line_num    INT := 0;
    v_subtotal    NUMERIC := 0;
    v_tax_amount  NUMERIC := 0;
    v_invoiceable NUMERIC;
BEGIN
    IF NEW.status IS DISTINCT FROM 'posted' OR OLD.status IS NOT DISTINCT FROM 'posted' THEN
        RETURN NEW;
    END IF;

    -- Serialise concurrent postings of the same GRN, then de-duplicate
    PERFORM pg_advisory_xact_lock(hashtextextended('grn_ap_bill:' || NEW.id::text, 0));

    IF EXISTS (
        SELECT 1 FROM public.ap_invoices
         WHERE grn_id = NEW.id AND status <> 'cancelled'
    ) THEN
        RETURN NEW;
    END IF;

    v_doc_number := public.generate_proc_doc_number(NEW.company_id, NEW.branch_id, 'AP_INV');
    IF v_doc_number IS NULL THEN
        v_doc_number := 'APINV-' || extract(epoch from clock_timestamp())::bigint;
    END IF;

    v_tax_amount := COALESCE(NEW.tax_amount, 0);

    INSERT INTO public.ap_invoices (
        company_id, branch_id, doc_number, doc_date,
        supplier_id, grn_id, po_id, supplier_inv_no, payment_term_id,
        currency, exchange_rate, status,
        subtotal, discount_amount, tax_amount, total_amount, paid_amount,
        remarks, created_by
    ) VALUES (
        NEW.company_id, NEW.branch_id, v_doc_number, NEW.doc_date,
        NEW.supplier_id, NEW.id, NEW.po_id, NEW.doc_number,
        (SELECT payment_term_id FROM public.suppliers WHERE id = NEW.supplier_id),
        'LKR', 1, 'draft',
        0, 0, v_tax_amount, 0, 0,
        'Auto-generated from GRN ' || NEW.doc_number,
        COALESCE(NEW.posted_by, NEW.created_by)
    ) RETURNING id INTO v_invoice_id;

    FOR v_line IN
        SELECT grl.id AS grn_line_id, grl.po_line_id, grl.item_id, grl.description, grl.uom_id,
               grl.quantity, COALESCE(grl.invoiced_qty, 0) AS already_invoiced, grl.unit_cost
          FROM public.goods_receipt_lines grl
         WHERE grl.grn_id = NEW.id
         ORDER BY grl.line_number
    LOOP
        v_invoiceable := v_line.quantity - v_line.already_invoiced;
        IF v_invoiceable <= 0.0001 THEN
            CONTINUE;
        END IF;

        v_line_num := v_line_num + 1;

        INSERT INTO public.ap_invoice_lines (
            invoice_id, line_number, grn_line_id, po_line_id,
            item_id, description, uom_id, quantity, unit_price, discount_pct, tax_pct
        ) VALUES (
            v_invoice_id, v_line_num, v_line.grn_line_id, v_line.po_line_id,
            v_line.item_id, v_line.description, v_line.uom_id,
            v_invoiceable, COALESCE(v_line.unit_cost, 0), 0, 0
        );

        v_subtotal := v_subtotal + (v_invoiceable * COALESCE(v_line.unit_cost, 0));
    END LOOP;

    IF v_line_num = 0 OR v_subtotal <= 0 THEN
        DELETE FROM public.ap_invoices WHERE id = v_invoice_id;
        RETURN NEW;
    END IF;

    UPDATE public.ap_invoices
       SET subtotal = v_subtotal,
           tax_amount = v_tax_amount,
           total_amount = v_subtotal + v_tax_amount
     WHERE id = v_invoice_id;

    -- Auto-post unless the company requires AP approval (then it waits in draft)
    IF NOT public.procurement_setting_bool(NEW.company_id, 'invoice_approval_required') THEN
        UPDATE public.ap_invoices
           SET status = 'posted',
               posted_by = COALESCE(NEW.posted_by, NEW.created_by)
         WHERE id = v_invoice_id;
    END IF;

    RETURN NEW;
END;
$$;

