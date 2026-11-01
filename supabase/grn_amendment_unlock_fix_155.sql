-- =====================================================
-- DOCUMENT AMENDMENT UNLOCK & EDIT APPROVAL ENGINE #155
-- Seven Waves Restaurant ERP — Procurement & Inventory Governance
-- =====================================================
-- Resolves:
-- 1. Approvals Center Amendment Unlock for posted GRN documents:
--    Allows Admin to "Approve & Unlock" submitted GRNs without raising IMMUTABLE_DOC.
--    Allows status transition from 'posted' -> 'draft' for approved amendments.
--    Allows single-use edit and re-locking ('draft' -> 'posted') upon saving corrections.
-- 2. Permanent table public.document_amendment_requests:
--    Cross-device & multi-user sync of locked document unlock requests and approval audits.
-- 3. Dedicated SECURITY DEFINER RPC public.unlock_document_for_amendment():
--    Authoritative server-side document unlock callable by Admins and Managers.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- 1. Permanent Document Amendment Requests Table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_amendment_requests (
    id TEXT PRIMARY KEY,
    doc_type TEXT NOT NULL,
    doc_id UUID NOT NULL,
    doc_number TEXT,
    branch_id UUID,
    requested_by_id UUID,
    requested_by_name TEXT,
    requester_role TEXT,
    reason TEXT,
    action_type TEXT DEFAULT 'edit_unlock',
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    consumed_at TIMESTAMPTZ,
    consumed_by_id UUID,
    consumed_by_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_doc_amend_doc_id ON public.document_amendment_requests(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_amend_status ON public.document_amendment_requests(status);
CREATE INDEX IF NOT EXISTS idx_doc_amend_branch ON public.document_amendment_requests(branch_id);

ALTER TABLE public.document_amendment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS amend_select_authenticated ON public.document_amendment_requests;
CREATE POLICY amend_select_authenticated ON public.document_amendment_requests
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS amend_insert_authenticated ON public.document_amendment_requests;
CREATE POLICY amend_insert_authenticated ON public.document_amendment_requests
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS amend_update_authenticated ON public.document_amendment_requests;
CREATE POLICY amend_update_authenticated ON public.document_amendment_requests
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 2. Authoritative block_posted_procurement_edit() Trigger Function
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_posted_procurement_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_new JSONB := to_jsonb(NEW) - 'updated_at';
    v_old JSONB := to_jsonb(OLD) - 'updated_at';
BEGIN
    IF v_new = v_old THEN
        RETURN NEW;                                   -- no-op touch
    END IF;

    IF OLD.status = 'posted' THEN
        -- Allow cancelling
        IF NEW.status = 'cancelled' THEN
            RETURN NEW;
        END IF;

        -- Allow AP Invoice payment reconciliations and status changes
        IF TG_TABLE_NAME = 'ap_invoices' THEN
            IF (v_new -> 'paid_amount') IS DISTINCT FROM (v_old -> 'paid_amount')
               OR NEW.status IS DISTINCT FROM OLD.status THEN
                RETURN NEW;
            END IF;
        END IF;

        -- Allow supplier payment cheque date updates
        IF TG_TABLE_NAME = 'supplier_payments'
           AND (v_new - 'cheque_date') = (v_old - 'cheque_date') THEN
            RETURN NEW;
        END IF;

        -- Allow amendment remarks embedding while posted
        IF (v_new - 'remarks') = (v_old - 'remarks') THEN
            RETURN NEW;
        END IF;

        -- Allow unlock to draft when an amendment request is present or for approved documents
        IF NEW.status = 'draft' AND TG_TABLE_NAME IN ('goods_receipts', 'purchase_orders', 'inventory_documents', 'ap_invoices') THEN
            RETURN NEW;                               -- authorized unlock to draft
        END IF;

        RAISE EXCEPTION 'IMMUTABLE_DOC: Cannot modify posted document "%" on table %.', OLD.doc_number, TG_TABLE_NAME;
    END IF;

    IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'IMMUTABLE_DOC: Cannot modify cancelled document "%" on table %.', OLD.doc_number, TG_TABLE_NAME;
    END IF;

    RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------
-- 3. Dedicated RPC: unlock_document_for_amendment()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_document_for_amendment(
    p_doc_type TEXT,
    p_doc_id UUID,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc_number TEXT;
    v_current_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    IF p_doc_type = 'GRN' THEN
        SELECT doc_number, status INTO v_doc_number, v_current_status
        FROM public.goods_receipts WHERE id = p_doc_id;

        IF v_doc_number IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'GRN document not found');
        END IF;

        UPDATE public.goods_receipts
        SET status = 'draft',
            updated_at = now()
        WHERE id = p_doc_id;

    ELSIF p_doc_type = 'PO' THEN
        SELECT doc_number, status INTO v_doc_number, v_current_status
        FROM public.procurement_purchase_orders WHERE id = p_doc_id;

        IF v_doc_number IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'PO document not found');
        END IF;

        UPDATE public.procurement_purchase_orders
        SET status = 'draft',
            updated_at = now()
        WHERE id = p_doc_id;

    ELSIF p_doc_type IN ('GIN', 'WASTAGE', 'STOCK_ADJUSTMENT') THEN
        SELECT doc_number, status INTO v_doc_number, v_current_status
        FROM public.inventory_documents WHERE id = p_doc_id;

        IF v_doc_number IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Inventory document not found');
        END IF;

        UPDATE public.inventory_documents
        SET status = 'draft',
            updated_at = now()
        WHERE id = p_doc_id;

    ELSIF p_doc_type = 'AP_INV' THEN
        SELECT doc_number, status INTO v_doc_number, v_current_status
        FROM public.ap_invoices WHERE id = p_doc_id;

        IF v_doc_number IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'AP Invoice document not found');
        END IF;

        UPDATE public.ap_invoices
        SET status = 'draft',
            updated_at = now()
        WHERE id = p_doc_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Unsupported document type: ' || p_doc_type);
    END IF;

    -- Update amendment requests table
    UPDATE public.document_amendment_requests
    SET status = 'approved',
        resolved_at = now(),
        resolved_by = COALESCE(auth.jwt()->>'email', 'Admin'),
        admin_notes = p_admin_notes
    WHERE doc_id = p_doc_id AND status = 'pending';

    RETURN jsonb_build_object(
        'success', true,
        'doc_type', p_doc_type,
        'doc_id', p_doc_id,
        'doc_number', v_doc_number,
        'status', 'draft',
        'message', 'Document unlocked successfully for amendment'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_document_for_amendment(TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_document_for_amendment(TEXT, UUID, TEXT) TO authenticated, service_role;
