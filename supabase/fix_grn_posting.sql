-- =====================================================
-- FIX: GRN POSTING — Drop duplicate trigger causing FK violation
-- =====================================================
-- PROBLEM:
--   Two BEFORE UPDATE triggers exist on goods_receipts for status changes:
--     1. trg_post_grn → post_goods_receipt() [from procurement.sql]
--     2. trg_post_goods_receipt → trg_fn_post_goods_receipt() [from procurement_settings.sql]
--
--   The OLD trigger (trg_post_grn) uses goods_receipts.id as document_id
--   when inserting into inventory_ledger. But inventory_ledger.document_id
--   has FK → inventory_documents(id), NOT goods_receipts(id).
--
--   The NEW trigger (trg_post_goods_receipt) correctly creates an
--   inventory_documents row first and uses that ID.
--
--   Both triggers fire simultaneously, and the old one causes:
--   "insert or update on table inventory_ledger violates foreign key
--    constraint inventory_ledger_document_id_fkey"
--
-- FIX:
--   1. Drop the old trigger trg_post_grn
--   2. Drop the old function post_goods_receipt() to clean up
--   3. Recreate the consolidated post_grn() RPC that respects approval settings
--      and lets trg_fn_post_goods_receipt() do all the heavy lifting
-- =====================================================

-- Step 1: Drop the OLD duplicate trigger (the root cause)
DROP TRIGGER IF EXISTS trg_post_grn ON goods_receipts;

-- Step 2: Drop the OLD function (no longer needed)
DROP FUNCTION IF EXISTS post_goods_receipt() CASCADE;

-- Step 3: Ensure the correct post_grn() RPC exists
-- This version respects grn_approval_required setting and just
-- delegates to the trigger by updating status → 'posted'.
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

    -- Check approval workflow setting
    v_approval := procurement_setting_bool(v_company_id, 'grn_approval_required');

    -- If approval is required, must come from 'approved'; otherwise from 'draft'
    IF v_approval AND v_status != 'approved' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'GRN "' || v_doc_number || '" must be approved before posting. Current status: ' || v_status);
    ELSIF NOT v_approval AND v_status != 'draft' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'GRN "' || v_doc_number || '" is already ' || v_status);
    END IF;

    -- This UPDATE fires trg_post_goods_receipt → trg_fn_post_goods_receipt()
    -- which handles: inventory_documents creation, ledger posting, stock updates,
    -- PO received_qty updates, supplier pricing updates, etc.
    UPDATE goods_receipts SET status = 'posted' WHERE id = p_grn_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'posted');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION post_grn(UUID) TO authenticated;

-- Step 4: Verify — list all triggers on goods_receipts
-- (Run this manually to confirm only the correct triggers exist)
-- SELECT tgname, tgtype, pg_get_functiondef(tgfoid) FROM pg_trigger 
-- WHERE tgrelid = 'goods_receipts'::regclass AND NOT tgisinternal;
