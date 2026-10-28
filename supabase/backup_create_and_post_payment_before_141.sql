-- ═══════════════════════════════════════════════════════════════════════════
-- BACKUP — live create_and_post_payment BEFORE #141 (captured 2026-10-28 via
-- pg_get_functiondef). Two overloads existed. Restore only if #141 must be
-- rolled back: first DROP the #141 version
--   DROP FUNCTION IF EXISTS public.create_and_post_payment(uuid,uuid,uuid,date,text,numeric,text,text,jsonb,boolean,text);
-- then run the CREATE statements below (and re-create trigger
-- trg_journal_on_supplier_payment only if you really want the legacy 1010 journals back).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Overload 1: create_and_post_payment(uuid,uuid,uuid,date,text,numeric,text,text,jsonb,boolean)
CREATE OR REPLACE FUNCTION public.create_and_post_payment(p_company_id uuid, p_branch_id uuid, p_supplier_id uuid, p_doc_date date, p_payment_method text, p_total_amount numeric, p_reference_no text DEFAULT NULL::text, p_remarks text DEFAULT NULL::text, p_allocations jsonb DEFAULT '[]'::jsonb, p_post boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_doc_number    TEXT;
    v_payment_id    UUID;
    v_alloc         JSONB;
    v_total_alloc   NUMERIC := 0;
    v_new_paid      NUMERIC;
BEGIN
    -- Generate doc number
    v_doc_number := generate_proc_doc_number(p_company_id, p_branch_id, 'SUP_PAY');
    IF v_doc_number IS NULL THEN
        v_doc_number := 'PAY-' || extract(epoch from now())::bigint;
    END IF;

    -- Validate total matches allocations
    SELECT COALESCE(SUM((alloc->>'amount')::NUMERIC), 0)
    INTO v_total_alloc
    FROM jsonb_array_elements(p_allocations) alloc;

    IF p_post AND ABS(v_total_alloc - p_total_amount) > 0.01 THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Total allocations (' || v_total_alloc || ') must equal payment amount (' || p_total_amount || ')');
    END IF;

    -- Create payment record (draft)
    INSERT INTO supplier_payments (
        company_id, branch_id, doc_number, doc_date,
        supplier_id, payment_method, reference_no,
        total_amount, status, remarks,
        created_by
    ) VALUES (
        p_company_id, p_branch_id, v_doc_number, p_doc_date,
        p_supplier_id, p_payment_method, p_reference_no,
        p_total_amount, 'draft', p_remarks,
        auth.uid()
    ) RETURNING id INTO v_payment_id;

    -- Insert allocations
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
        -- Validate allocation amount doesn't exceed balance
        IF (v_alloc->>'amount')::NUMERIC > (
            SELECT balance_due + 0.005 FROM ap_invoices WHERE id = (v_alloc->>'invoice_id')::UUID
        ) THEN
            RETURN jsonb_build_object('success', false,
                'error', 'Allocation exceeds balance_due for invoice ' || (v_alloc->>'invoice_id'));
        END IF;

        INSERT INTO supplier_payment_allocations (payment_id, invoice_id, amount)
        VALUES (v_payment_id, (v_alloc->>'invoice_id')::UUID, (v_alloc->>'amount')::NUMERIC);
    END LOOP;

    -- If requested, post immediately
    IF p_post THEN
        DECLARE v_result JSONB;
        BEGIN
            SELECT post_supplier_payment_rpc(v_payment_id) INTO v_result;
            IF NOT (v_result->>'success')::BOOLEAN THEN
                RETURN v_result;
            END IF;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'doc_number', v_doc_number,
        'status', CASE WHEN p_post THEN 'posted' ELSE 'draft' END
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ── Overload 2: create_and_post_payment(uuid,uuid,uuid,date,text,numeric,text,text,jsonb,boolean,text)
CREATE OR REPLACE FUNCTION public.create_and_post_payment(p_company_id uuid, p_branch_id uuid, p_supplier_id uuid, p_doc_date date, p_payment_method text, p_total_amount numeric, p_reference_no text, p_cheque_no text, p_allocations jsonb, p_post_now boolean DEFAULT true, p_bank_account_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_doc_number    TEXT;
    v_payment_id    UUID;
    v_alloc         JSONB;
    v_result        JSONB;
BEGIN
    -- Generate document number
    SELECT generate_proc_doc_number(p_company_id, p_branch_id, 'SUP_PAY')
    INTO v_doc_number;

    -- Create draft payment
    INSERT INTO supplier_payments (
        company_id, branch_id, supplier_id,
        doc_number, doc_date,
        payment_method, total_amount,
        reference_no, cheque_no,
        bank_account_code,
        status, created_by
    )
    VALUES (
        p_company_id, p_branch_id, p_supplier_id,
        v_doc_number, p_doc_date,
        p_payment_method, p_total_amount,
        p_reference_no, p_cheque_no,
        p_bank_account_code,
        'draft', auth.uid()
    )
    RETURNING id INTO v_payment_id;

    -- Insert allocations
    IF p_allocations IS NOT NULL THEN
        FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
        LOOP
            INSERT INTO supplier_payment_allocations (payment_id, invoice_id, amount)
            VALUES (
                v_payment_id,
                (v_alloc->>'invoice_id')::UUID,
                (v_alloc->>'amount')::NUMERIC
            );
        END LOOP;
    END IF;

    -- Post immediately if requested
    IF p_post_now THEN
        UPDATE supplier_payments
        SET status = 'posted', posted_by = auth.uid()
        WHERE id = v_payment_id;
    END IF;

    RETURN jsonb_build_object(
        'success',     true,
        'payment_id',  v_payment_id,
        'doc_number',  v_doc_number,
        'status',      CASE WHEN p_post_now THEN 'posted' ELSE 'draft' END
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
