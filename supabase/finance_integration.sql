-- ═══════════════════════════════════════════════════════════════════
-- Finance Module Integration — Summary
-- ═══════════════════════════════════════════════════════════════════

-- 1) Create minimal accounting stubs if they don't exist
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid,
    branch_id uuid,
    doc_date date DEFAULT CURRENT_DATE,
    reference_id uuid, -- link to order or invoice
    reference_type text,
    description text,
    entry_type text, -- 'revenue'
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    journal_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_code text, -- e.g. 'REVENUE','TAX','DISCOUNT','CASH','BANK'
    dr_amount numeric DEFAULT 0,
    cr_amount numeric DEFAULT 0,
    memo text
);

-- 2) Function to post accounting entry from Order
CREATE OR REPLACE FUNCTION public.post_accounting_from_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_journal_id uuid;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Only post if not already posted (idempotency)
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reference_id = p_order_id AND reference_type = 'order') THEN
        RETURN;
    END IF;

    -- Create Journal Entry header
    INSERT INTO public.journal_entries (company_id, branch_id, reference_id, reference_type, description, entry_type)
    VALUES (v_order.company_id, v_order.branch_id, p_order_id, 'order', 'Sale from Order #' || v_order.order_number, 'revenue')
    RETURNING id INTO v_journal_id;

    -- Credit Revenue (Subtotal)
    IF v_order.subtotal > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
        VALUES (v_journal_id, 'REVENUE_SALES', v_order.subtotal, 'Base Sale Amount');
    END IF;

    -- Credit Tax
    IF v_order.tax_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
        VALUES (v_journal_id, 'TAX_PAYABLE', v_order.tax_amount, 'Tax collected');
    END IF;

    -- Debit Discount (if any)
    IF v_order.discount_amount > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, memo)
        VALUES (v_journal_id, 'SALES_DISCOUNT', v_order.discount_amount, 'Applied discount');
    END IF;

    -- Debit Cash/Bank (Total Amount)
    INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, memo)
    VALUES (v_journal_id, 'CASH_ON_HAND', v_order.total_amount, 'Received amount');

END;
$$;

-- 3) Trigger function to update finance_queue and post journal
CREATE OR REPLACE FUNCTION public.trg_fn_finance_on_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (NEW.payment_status = 'paid' AND (OLD.payment_status IS DISTINCT FROM 'paid')) THEN
        -- 1) Mark finance_queue as posted
        UPDATE public.finance_queue
        SET status = 'posted', updated_at = now()
        WHERE order_id = NEW.id;

        -- 2) Post accounting entry stub
        PERFORM public.post_accounting_from_order(NEW.id);
        
        -- Mark KOT dispatches for FINANCE as delivered
        UPDATE public.kot_dispatches
        SET status = 'delivered', delivered_at = now()
        WHERE kot_id IN (SELECT id FROM public.kot_tickets WHERE order_id = NEW.id)
          AND target_code = 'FINANCE';
    END IF;
    RETURN NEW;
END;
$$;

-- 4) Attach trigger
DROP TRIGGER IF EXISTS trg_finance_on_order_paid ON public.orders;
CREATE TRIGGER trg_finance_on_order_paid
    AFTER UPDATE OF payment_status ON public.orders
    FOR EACH ROW
    WHEN (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
    EXECUTE FUNCTION public.trg_fn_finance_on_order_paid();
