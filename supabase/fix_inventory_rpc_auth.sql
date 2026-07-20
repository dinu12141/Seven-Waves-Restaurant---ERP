-- Fix missing SECURITY DEFINER and GRANT EXECUTE on inventory sequence generation RPCs

-- 1. generate_inv_doc_number
CREATE OR REPLACE FUNCTION public.generate_inv_doc_number(
    p_company_id UUID,
    p_doc_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefix TEXT;
    v_next INT;
    v_year INT := EXTRACT(YEAR FROM now());
BEGIN
    UPDATE public.inv_doc_sequences
    SET current_number = current_number + 1
    WHERE company_id = p_company_id
      AND doc_type = p_doc_type
      AND fiscal_year = v_year
    RETURNING prefix, current_number INTO v_prefix, v_next;

    IF v_prefix IS NULL THEN
        INSERT INTO public.inv_doc_sequences (company_id, doc_type, prefix, current_number, fiscal_year)
        VALUES (p_company_id, p_doc_type, p_doc_type || '-', 1, v_year)
        RETURNING prefix, current_number INTO v_prefix, v_next;
    END IF;

    RETURN v_prefix || v_year || '-' || LPAD(v_next::TEXT, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_inv_doc_number(UUID, TEXT) TO authenticated;

-- 2. generate_item_code
CREATE OR REPLACE FUNCTION public.generate_item_code(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefix TEXT := 'ITM-';
    v_next INT;
BEGIN
    UPDATE public.inv_doc_sequences
    SET current_number = current_number + 1
    WHERE company_id = p_company_id
      AND doc_type = 'ITEM'
      AND fiscal_year = 0
    RETURNING current_number INTO v_next;

    IF v_next IS NULL THEN
        INSERT INTO public.inv_doc_sequences (company_id, doc_type, prefix, current_number, fiscal_year)
        VALUES (p_company_id, 'ITEM', v_prefix, 1, 0)
        RETURNING current_number INTO v_next;
    END IF;

    RETURN v_prefix || LPAD(v_next::TEXT, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_item_code(UUID) TO authenticated;

-- 3. generate_supplier_code
CREATE OR REPLACE FUNCTION public.generate_supplier_code(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefix TEXT := 'SUP-';
    v_next INT;
BEGIN
    UPDATE public.inv_doc_sequences
    SET current_number = current_number + 1
    WHERE company_id = p_company_id
      AND doc_type = 'SUPPLIER'
      AND fiscal_year = 0
    RETURNING current_number INTO v_next;

    IF v_next IS NULL THEN
        INSERT INTO public.inv_doc_sequences (company_id, doc_type, prefix, current_number, fiscal_year)
        VALUES (p_company_id, 'SUPPLIER', v_prefix, 1, 0)
        RETURNING current_number INTO v_next;
    END IF;

    RETURN v_prefix || LPAD(v_next::TEXT, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_supplier_code(UUID) TO authenticated;
