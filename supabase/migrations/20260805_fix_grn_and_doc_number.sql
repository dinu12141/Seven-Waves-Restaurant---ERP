-- 1. Fix GRN posting (remove duplicate trigger causing inventory_ledger FK violation)
DROP TRIGGER IF EXISTS trg_post_grn ON goods_receipts;
DROP FUNCTION IF EXISTS post_goods_receipt() CASCADE;

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
    UPDATE goods_receipts SET status = 'posted' WHERE id = p_grn_id;

    RETURN jsonb_build_object('success', true, 'doc_number', v_doc_number, 'status', 'posted');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION post_grn(UUID) TO authenticated;

-- 2. Grant EXECUTE on generate_proc_doc_number to fix 403 error during GRN creation
GRANT EXECUTE ON FUNCTION generate_proc_doc_number(UUID, UUID, TEXT) TO authenticated, service_role;
