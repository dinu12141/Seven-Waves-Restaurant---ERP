-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #136 — Procurement flow hardening (PROPOSED — not applied)
-- Seven Waves Restaurant ERP
--
-- Apply order: #128 → #132 → #134 (Finance) → #136.
-- Do NOT apply the post_supplier_payment() / trg_post_supplier_payment section
-- of #130 — #128 is the canonical supplier-payment posting trigger.
--
-- Supplier payment → finance_cheques sync is OWNED BY FINANCE in
-- supabase/finance_ap_payment_cheque_sync_134.sql (PM decision). This file
-- defines no cheque-register trigger/function. The client no longer writes
-- finance_cheques (it could not: finance_cheques is admin/finance-only, #124).
-- Dependency on #134: its trigger must also fire on UPDATE OF cheque_date,
-- because the PaymentsPage stamps the PDC date via
-- set_supplier_payment_cheque_date() right after the atomic post (section 4).
--
--  0. Cashbook source_type CHECK: ADD 'purchase_return' to whatever set is
--     live (additive — never narrows a list Finance has widened in #134).
--  1. (removed — cheque sync lives in #134)
--  1b. At most one live AP invoice per GRN: partial unique index on grn_id
--      plus a trigger that also resolves legacy_grn_id / inventory_grn_id
--      (inventory_documents GRN rows); 7 GRNs are billed only that way.
--  2. PO approval bypass guard (BEFORE INSERT OR UPDATE OF status): when
--     po_approval_required is on, a PO can neither be inserted as nor moved
--     from draft into approved/open/partial/closed except through approve_po
--     (#132: approval-log row by the same user in the same transaction), and
--     the creator may not approve it (admin exempt, as in #132). Approval-log
--     writes restricted to SECURITY DEFINER functions.
--  3. Purchase return:
--     a. trg_fn_post_purchase_return: drop the GREATEST(0, …) clamp on the
--        supplier balance (cancel added back the full amount → balance drift),
--        SECURITY DEFINER + search_path (it writes ap_ledger, admin-only RLS).
--     b. GL legs: Dr 2000 AP / Cr 1005 Inventory on post, mirror reversal on
--        cancel (the AP sub-ledger was written with no GL → 2000/1005 drift).
--  4. Supplier payments:
--     a. set_supplier_payment_cheque_date(): the client stamped cheque_date
--        with a direct UPDATE after posting — blocked by RLS for everyone but
--        admin (sp_admin) and by the IMMUTABLE_DOC guard for posted rows, so
--        PDC dates were never saved (live: 2/2 posted cheque payments have
--        cheque_date NULL). Role-checked RPC + a narrow guard allowance.
--     b. cancel_supplier_payment(): there was no way to cancel a posted
--        payment from the app; #128's trigger already does the full reversal
--        on posted → cancelled. Blocked when the cheque has cleared.
--
-- Re-runnable. Single transaction. No new overloads.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

SET LOCAL lock_timeout = '10s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Cashbook source_type CHECK — add 'purchase_return' to the live set
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_def  TEXT;
    v_vals TEXT[];
BEGIN
    SELECT pg_get_constraintdef(c.oid) INTO v_def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.finance_cashbook_entries'::regclass
       AND c.conname  = 'finance_cashbook_entries_source_type_check';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'finance_cashbook_entries_source_type_check missing — apply #128 first';
    END IF;

    IF v_def LIKE '%''purchase_return''%' THEN
        RETURN;
    END IF;

    SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_vals
      FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m;

    v_vals := array_append(v_vals, 'purchase_return');

    EXECUTE 'ALTER TABLE public.finance_cashbook_entries DROP CONSTRAINT finance_cashbook_entries_source_type_check';
    EXECUTE format(
        'ALTER TABLE public.finance_cashbook_entries ADD CONSTRAINT finance_cashbook_entries_source_type_check CHECK (source_type IN (%s))',
        (SELECT string_agg(quote_literal(v), ',') FROM unnest(v_vals) v));
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Supplier payment → cheque register: see finance_ap_payment_cheque_sync_134.sql
--    #134 owns trg_sync_supplier_payment_cheque / trg_fn_sync_supplier_payment_cheque
--    (AFTER INSERT OR UPDATE OF status, cheque_no, cheque_date, payment_method).
--    This file must not create, replace or drop either.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. At most one live AP invoice per GRN (DB-enforced)
--     #128's auto-bill is idempotent, but createInvoiceFromGRN() / a manual
--     AP invoice carrying grn_id could still add a second bill while the first
--     is draft (invoiced_qty is only bumped on post). Live has 0 duplicates;
--     if any appear before this runs, the index is skipped with a NOTICE.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.ap_invoices
         WHERE grn_id IS NOT NULL AND status <> 'cancelled'
         GROUP BY grn_id HAVING count(*) > 1
    ) THEN
        RAISE NOTICE 'uq_ap_invoices_live_grn NOT created: duplicate live AP invoices per GRN exist — clean them up and re-run.';
    ELSE
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_ap_invoices_live_grn
                   ON public.ap_invoices (grn_id)
                WHERE grn_id IS NOT NULL AND status <> ''cancelled''';
    END IF;
END $$;

-- The index only sees grn_id. Legacy invoices carry the GRN in
-- legacy_grn_id / inventory_grn_id instead; both point at the GRN's
-- inventory_documents row (doc_type 'GRN', reference_id = goods_receipts.id).
-- Live: 7 posted GRNs are billed only through legacy_grn_id (877,970.19; one,
-- 492,630, is live/paid, the rest cancelled) and are invisible to the index.
-- This trigger resolves the effective GRN from all three columns and allows
-- at most one live invoice per GRN.
CREATE OR REPLACE FUNCTION public.fn_ap_invoice_resolve_grn(p_doc_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        (SELECT g.id FROM public.goods_receipts g WHERE g.id = p_doc_id),
        (SELECT d.reference_id FROM public.inventory_documents d
          WHERE d.id = p_doc_id AND d.doc_type = 'GRN'))
$$;

REVOKE ALL ON FUNCTION public.fn_ap_invoice_resolve_grn(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_fn_ap_invoice_one_per_grn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_grn   UUID;
    v_other TEXT;
BEGIN
    IF NEW.status = 'cancelled' THEN
        RETURN NEW;
    END IF;

    v_grn := COALESCE(NEW.grn_id,
                      public.fn_ap_invoice_resolve_grn(NEW.legacy_grn_id),
                      public.fn_ap_invoice_resolve_grn(NEW.inventory_grn_id));
    IF v_grn IS NULL THEN
        RETURN NEW;   -- direct (non-GRN) invoice
    END IF;

    -- Same lock key as #128's auto-bill, so concurrent billing serialises
    PERFORM pg_advisory_xact_lock(hashtextextended('grn_ap_bill:' || v_grn::text, 0));

    SELECT x.doc_number INTO v_other
      FROM public.ap_invoices x
     WHERE x.id <> NEW.id
       AND x.status <> 'cancelled'
       AND (x.grn_id = v_grn
            OR public.fn_ap_invoice_resolve_grn(x.legacy_grn_id) = v_grn
            OR public.fn_ap_invoice_resolve_grn(x.inventory_grn_id) = v_grn)
     LIMIT 1;

    IF v_other IS NOT NULL THEN
        RAISE EXCEPTION 'DUPLICATE_GRN_INVOICE: GRN % already has live AP invoice "%"; cancel it before billing again.',
            v_grn, v_other;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_ap_invoice_one_per_grn() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ap_invoice_one_per_grn ON public.ap_invoices;
CREATE TRIGGER trg_ap_invoice_one_per_grn
BEFORE INSERT OR UPDATE OF status, grn_id, legacy_grn_id, inventory_grn_id ON public.ap_invoices
FOR EACH ROW
WHEN (NEW.status <> 'cancelled'
      AND (NEW.grn_id IS NOT NULL OR NEW.legacy_grn_id IS NOT NULL OR NEW.inventory_grn_id IS NOT NULL))
EXECUTE FUNCTION public.trg_fn_ap_invoice_one_per_grn();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PO approval: when po_approval_required is on, every route into an
--    approved-family status (approved/open/partial/closed) goes via approve_po
--    * INSERT directly in one of those statuses → blocked
--    * draft → one of those without an approval-log row written by the same
--      user in the same transaction (only approve_po does that, and only for
--      'approved') → blocked
--    * maker-checker: the creator may not approve (admin exempt, as in #132)
--    auth.uid() IS NULL (service role / SQL editor / migrations) is trusted.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_guard_po_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF NEW.status NOT IN ('approved', 'open', 'partial', 'closed') THEN
        RETURN NEW;
    END IF;
    -- approved → open/partial/closed etc. happen after approval
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'draft' THEN
        RETURN NEW;
    END IF;
    IF v_uid IS NULL
       OR NOT public.procurement_setting_bool(NEW.company_id, 'po_approval_required') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION 'APPROVAL_REQUIRED: PO "%" must be created as draft and approved via approve_po.',
            NEW.doc_number;
    END IF;

    -- approve_po_with_threshold (#132) logs the signing level in the same
    -- transaction, immediately before it sets status = 'approved'. Rows from
    -- earlier transactions have created_at < now().
    IF NEW.status <> 'approved'
       OR NOT EXISTS (
            SELECT 1 FROM public.procurement_approval_log l
             WHERE l.doc_type = 'PO'
               AND l.doc_id = NEW.id
               AND l.action = 'approved'
               AND l.created_at >= now()
               AND l.approved_by = v_uid)
    THEN
        RAISE EXCEPTION 'APPROVAL_REQUIRED: PO "%" must be approved via approve_po (role, maker-checker and threshold checks).',
            NEW.doc_number;
    END IF;

    IF NOT public.is_admin()
       AND (OLD.created_by = v_uid OR NEW.created_by = v_uid) THEN
        RAISE EXCEPTION 'MAKER_CHECKER: you cannot approve PO "%" that you created.', NEW.doc_number;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_guard_po_approval() FROM PUBLIC, anon, authenticated;

-- WHEN cannot reference OLD on an INSERT-capable trigger; the draft-origin
-- check is in the body (TG_OP).
DROP TRIGGER IF EXISTS trg_guard_po_approval ON public.purchase_orders;
CREATE TRIGGER trg_guard_po_approval
BEFORE INSERT OR UPDATE OF status ON public.purchase_orders
FOR EACH ROW
WHEN (NEW.status IN ('approved', 'open', 'partial', 'closed'))
EXECUTE FUNCTION public.trg_fn_guard_po_approval();

-- The approval log is an audit trail written only by SECURITY DEFINER
-- functions. pal_admin was FOR ALL for admin + manager, which let a manager
-- forge a log row and satisfy the guard above (or rewrite history).
DROP POLICY IF EXISTS pal_admin ON public.procurement_approval_log;
CREATE POLICY pal_admin ON public.procurement_approval_log
    FOR SELECT TO authenticated
    USING (is_admin() OR is_manager() OR auth_has_role('procurement'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3a. Purchase return posting / cancellation (stock-out + AP debit note)
--     Body = procurement_settings.sql §11 (allow_negative_stock_returns) with
--     the supplier-balance clamp removed and a pinned search_path.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_post_purchase_return()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inv_doc_id     UUID;
    v_inv_doc_number TEXT;
    v_line           RECORD;
    v_wh_id          UUID;
    v_line_num       INT;
    v_allow_neg      BOOLEAN;
BEGIN
    -- ── draft → posted ───────────────────────────────────────────────────────
    IF NEW.status = 'posted' AND OLD.status = 'draft' THEN

        PERFORM validate_return_not_posted(NEW.id);

        IF NOT EXISTS (SELECT 1 FROM purchase_return_lines WHERE return_id = NEW.id LIMIT 1) THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Purchase Return % has no lines. Cannot post.', NEW.id;
        END IF;

        IF NEW.grn_id IS NOT NULL THEN
            PERFORM validate_return_qty_vs_grn(NEW.id);
        END IF;

        v_wh_id := resolve_warehouse(NULL, NEW.warehouse_id, NEW.branch_id, NEW.company_id);
        PERFORM validate_warehouse_exists(v_wh_id);

        v_allow_neg := procurement_setting_bool(NEW.company_id, 'allow_negative_stock_returns');

        NEW.posted_at := now();
        NEW.posted_by := COALESCE(NEW.posted_by, auth.uid(), NEW.created_by);

        v_inv_doc_number := generate_inv_doc_number(NEW.company_id, 'GIN');

        INSERT INTO inventory_documents (
            company_id, branch_id, doc_type, doc_number, doc_date,
            warehouse_id, supplier_id, reference_id, reference_type,
            status, remarks, created_by, approved_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, 'GIN', v_inv_doc_number, NEW.doc_date,
            v_wh_id, NEW.supplier_id, NEW.id, 'PUR_RET',
            'draft', COALESCE(NEW.remarks, 'Purchase Return: ' || NEW.doc_number),
            NEW.created_by, NEW.posted_by
        ) RETURNING id INTO v_inv_doc_id;

        v_line_num := 0;
        FOR v_line IN
            SELECT * FROM purchase_return_lines WHERE return_id = NEW.id ORDER BY line_number
        LOOP
            PERFORM validate_item_exists(v_line.item_id);

            IF NOT v_allow_neg THEN
                PERFORM validate_sufficient_stock(v_wh_id, v_line.item_id, v_line.quantity);
            END IF;

            v_line_num := v_line_num + 1;

            INSERT INTO inventory_document_lines (
                document_id, line_number, item_id, uom_id,
                quantity, unit_cost, batch_no, notes
            ) VALUES (
                v_inv_doc_id, v_line_num, v_line.item_id, v_line.uom_id,
                v_line.quantity, COALESCE(v_line.unit_cost, 0), v_line.batch_no,
                COALESCE(v_line.notes, v_line.return_reason)
            );
        END LOOP;

        -- Post the GIN → inventory engine does the stock OUT
        UPDATE inventory_documents
           SET status = 'posted', created_by = NEW.created_by
         WHERE id = v_inv_doc_id;

        -- AP sub-ledger: debit note (reduces the liability)
        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id, entry_type,
            doc_id, doc_number, doc_date, debit, credit,
            description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id, 'CREDIT_NOTE',
            NEW.id, NEW.doc_number, NEW.doc_date, NEW.total_amount, 0,
            'Purchase Return / Credit Note ' || NEW.doc_number
                || CASE WHEN NEW.return_reason IS NOT NULL THEN ' — ' || NEW.return_reason ELSE '' END,
            NEW.posted_by
        );

        -- No clamp: must mirror the cancel branch exactly (and #128's sign rules)
        UPDATE suppliers
           SET balance = COALESCE(balance, 0) - NEW.total_amount
         WHERE id = NEW.supplier_id;

        IF NEW.grn_id IS NOT NULL THEN
            UPDATE purchase_order_lines pol
               SET returned_qty = pol.returned_qty + prl.quantity
              FROM purchase_return_lines prl
              JOIN goods_receipt_lines grl ON grl.id = prl.grn_line_id
             WHERE prl.return_id = NEW.id
               AND grl.po_line_id = pol.id;
        END IF;

    -- ── posted → cancelled ───────────────────────────────────────────────────
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'posted' THEN

        NEW.cancelled_at := now();

        UPDATE inventory_documents
           SET status = 'cancelled'
         WHERE reference_id = NEW.id
           AND reference_type = 'PUR_RET'
           AND status = 'posted';

        INSERT INTO ap_ledger (
            company_id, branch_id, supplier_id, entry_type,
            doc_id, doc_number, doc_date, debit, credit,
            description, posted_by
        ) VALUES (
            NEW.company_id, NEW.branch_id, NEW.supplier_id, 'REVERSAL',
            NEW.id, NEW.doc_number || '-REV', CURRENT_DATE, 0, NEW.total_amount,
            'Cancellation of Return ' || NEW.doc_number,
            COALESCE(auth.uid(), NEW.posted_by)
        );

        UPDATE suppliers
           SET balance = COALESCE(balance, 0) + NEW.total_amount
         WHERE id = NEW.supplier_id;

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
$$;

REVOKE ALL ON FUNCTION public.trg_fn_post_purchase_return() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_post_purchase_return ON public.purchase_returns;
CREATE TRIGGER trg_post_purchase_return
BEFORE UPDATE OF status ON public.purchase_returns
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_post_purchase_return();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. Purchase return → GL (Dr 2000 AP / Cr 1005 Inventory) + reversal
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_post_purchase_return_gl()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ap_ledger  UUID;
    v_inv_ledger UUID;
    v_desc       TEXT;
BEGIN
    IF NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted' THEN
        IF COALESCE(NEW.total_amount, 0) <= 0 THEN
            RETURN NULL;
        END IF;
        -- Idempotent: legs already written for this return
        IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries
                    WHERE source_type = 'purchase_return' AND source_id = NEW.id
                      AND description NOT LIKE 'REVERSAL%') THEN
            RETURN NULL;
        END IF;

        v_ap_ledger  := public.fn_fin_ledger_by_code(NEW.company_id, '2000', 'Accounts Payables');
        v_inv_ledger := public.fn_fin_ledger_by_code(NEW.company_id, '1005', 'Inventory - Raw Materials');
        v_desc := 'Purchase Return / Credit Note ' || NEW.doc_number;

        PERFORM public.fn_fin_post_leg(
            NEW.company_id, NEW.branch_id, 'purchase_return', NEW.id, NEW.doc_date,
            v_ap_ledger, NULL, v_desc, NEW.total_amount, 0);
        PERFORM public.fn_fin_post_leg(
            NEW.company_id, NEW.branch_id, 'purchase_return', NEW.id, NEW.doc_date,
            v_inv_ledger, NULL, v_desc, 0, NEW.total_amount);

    ELSIF NEW.status = 'cancelled' AND OLD.status = 'posted' THEN
        IF NOT EXISTS (SELECT 1 FROM public.finance_cashbook_entries
                        WHERE source_type = 'purchase_return' AND source_id = NEW.id
                          AND description LIKE 'REVERSAL%') THEN
            PERFORM public.fn_fin_reverse_source('purchase_return', NEW.id, CURRENT_DATE, NEW.doc_number);
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_post_purchase_return_gl() FROM PUBLIC, anon, authenticated;

-- AFTER: runs once trg_post_purchase_return (BEFORE) has validated stock and
-- written the AP sub-ledger; any raise here rolls the whole post back.
DROP TRIGGER IF EXISTS trg_post_purchase_return_gl ON public.purchase_returns;
CREATE TRIGGER trg_post_purchase_return_gl
AFTER UPDATE OF status ON public.purchase_returns
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('posted', 'cancelled'))
EXECUTE FUNCTION public.trg_fn_post_purchase_return_gl();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4a. Supplier payment cheque date (PDC) — role-checked stamp
-- ─────────────────────────────────────────────────────────────────────────────
-- Immutability guard (procurement_functions.sql §7) — same rules, plus: a
-- posted supplier payment may change cheque_date and nothing else. Only the
-- function is replaced; the trg_block_* triggers are left as they are.
CREATE OR REPLACE FUNCTION public.trg_fn_block_procurement_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.status = 'posted' THEN
        IF NEW.status = 'cancelled' THEN
            RETURN NEW;
        END IF;
        IF TG_TABLE_NAME = 'ap_invoices'
           AND (NEW.status IN ('partial_paid', 'paid')
                OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount) THEN
            RETURN NEW;
        END IF;
        IF TG_TABLE_NAME = 'supplier_payments'
           AND NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount THEN
            RETURN NEW;
        END IF;
        IF TG_TABLE_NAME = 'supplier_payments'
           AND (to_jsonb(NEW) - 'cheque_date' - 'updated_at')
             = (to_jsonb(OLD) - 'cheque_date' - 'updated_at') THEN
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
$$;

CREATE OR REPLACE FUNCTION public.set_supplier_payment_cheque_date(
    p_payment_id  UUID,
    p_cheque_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pay public.supplier_payments;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    IF NOT (public.is_admin() OR public.is_manager() OR public.is_finance()
            OR public.auth_has_role('procurement')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorised to edit supplier payments');
    END IF;
    IF p_cheque_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cheque date is required');
    END IF;

    SELECT * INTO v_pay FROM public.supplier_payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment not found: ' || p_payment_id);
    END IF;
    IF NOT public.is_admin() AND NOT (v_pay.branch_id = ANY(public.auth_branch_ids())) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You do not have access to this payment''s branch');
    END IF;
    IF COALESCE(v_pay.payment_method, '') NOT ILIKE '%cheque%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment ' || v_pay.doc_number || ' is not a cheque payment');
    END IF;
    IF v_pay.status NOT IN ('draft', 'posted') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment ' || v_pay.doc_number || ' is ' || v_pay.status);
    END IF;

    IF v_pay.cheque_date IS DISTINCT FROM p_cheque_date THEN
        -- #134's cheque-register trigger follows this change.
        UPDATE public.supplier_payments SET cheque_date = p_cheque_date WHERE id = p_payment_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'doc_number', v_pay.doc_number, 'cheque_date', p_cheque_date);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.set_supplier_payment_cheque_date(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_supplier_payment_cheque_date(UUID, DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4b. Cancel a supplier payment (posted → cancelled reverses via #128)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_supplier_payment(
    p_payment_id UUID,
    p_reason     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pay public.supplier_payments;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    -- Reverses cash/bank: finance-grade action
    IF NOT (public.is_admin() OR public.is_manager() OR public.is_finance()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only admin, manager or finance can cancel supplier payments');
    END IF;
    IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'A cancellation reason is required');
    END IF;

    SELECT * INTO v_pay FROM public.supplier_payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment not found: ' || p_payment_id);
    END IF;
    IF NOT public.is_admin() AND NOT (v_pay.branch_id = ANY(public.auth_branch_ids())) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You do not have access to this payment''s branch');
    END IF;
    IF v_pay.status NOT IN ('draft', 'posted') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment ' || v_pay.doc_number || ' is already ' || v_pay.status);
    END IF;

    -- A cleared/bounced cheque has its own bank-side history; cancelling the
    -- payment would double-reverse the bank leg.
    IF v_pay.status = 'posted'
       AND COALESCE(v_pay.payment_method, '') ILIKE '%cheque%'
       AND NULLIF(TRIM(COALESCE(v_pay.cheque_no, '')), '') IS NOT NULL
       AND EXISTS (
            SELECT 1
              FROM public.finance_cheques fc
              JOIN public.finance_cashbook_entries cb
                ON cb.account_id = fc.bank_account_id
               AND cb.source_type = 'supplier_payment'
               AND cb.source_id = v_pay.id
             WHERE fc.cheque_no = TRIM(v_pay.cheque_no)
               AND fc.status IN ('cleared', 'bounced'))
    THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Cheque ' || TRIM(v_pay.cheque_no) || ' for payment ' || v_pay.doc_number
            || ' has already cleared/bounced — handle it in Finance → Cheques instead.');
    END IF;

    -- posted → cancelled fires #128 post_supplier_payment(): AP ledger
    -- reversal, Cr AP / Dr Cash-Bank mirror, supplier balance, invoice
    -- paid_amount/status recompute. #134 voids the cheque.
    UPDATE public.supplier_payments
       SET status = 'cancelled', cancel_reason = TRIM(p_reason)
     WHERE id = p_payment_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_pay.doc_number, 'status', 'cancelled');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_supplier_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_supplier_payment(UUID, TEXT) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
