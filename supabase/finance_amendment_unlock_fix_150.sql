-- =====================================================
-- PROCUREMENT AMENDMENT UNLOCK & FINANCE FIX #150
-- Seven Waves Restaurant ERP
-- =====================================================
-- Fixes:
-- 1. Approvals Center Amendment Unlock for posted GRN documents:
--    Previously block_posted_procurement_edit() raised IMMUTABLE_DOC
--    when setting status = 'draft' upon approving an amendment request.
--    Now allows status transition to 'draft' when an amendment request
--    is present in remarks.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.block_posted_procurement_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
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
        IF NEW.status = 'cancelled' THEN
            RETURN NEW;
        END IF;
        IF TG_TABLE_NAME = 'ap_invoices' THEN
            IF (v_new -> 'paid_amount') IS DISTINCT FROM (v_old -> 'paid_amount')
               OR NEW.status IS DISTINCT FROM OLD.status THEN
                RETURN NEW;
            END IF;
        END IF;
        IF TG_TABLE_NAME = 'supplier_payments'
           AND (v_new - 'cheque_date') = (v_old - 'cheque_date') THEN
            RETURN NEW;                               -- cheque date only
        END IF;
        -- Allow amendment remarks updates or unlock to draft
        IF (v_new - 'remarks') = (v_old - 'remarks') AND (NEW.remarks LIKE '%[AMENDMENT:%') THEN
            RETURN NEW;
        END IF;
        IF NEW.status = 'draft' AND (
            NEW.remarks LIKE '%[AMENDMENT:%' OR
            OLD.remarks LIKE '%[AMENDMENT:%'
        ) THEN
            RETURN NEW;                               -- unlock to draft for approved amendment
        END IF;
        RAISE EXCEPTION 'IMMUTABLE_DOC: Cannot modify posted document "%" on table %.', OLD.doc_number, TG_TABLE_NAME;
    END IF;

    IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'IMMUTABLE_DOC: Cannot modify cancelled document "%" on table %.', OLD.doc_number, TG_TABLE_NAME;
    END IF;

    RETURN NEW;
END;
$fn$;
