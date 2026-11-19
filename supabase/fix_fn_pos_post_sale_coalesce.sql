-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: fn_pos_post_sale COALESCE type mismatch (integer vs text)
-- ═══════════════════════════════════════════════════════════════════════════════
-- When an invoice is looked up, invoices.invoice_number is INTEGER (SERIAL)
-- while invoices.invoice_no is TEXT. In PostgreSQL, COALESCE(v_inv.invoice_number, v_inv.invoice_no)
-- throws: "42804: COALESCE types integer and text cannot be matched".
-- This caused POS sale GL postings to fail silently into pos_gl_failures.
--
-- Run this in Supabase Dashboard -> SQL Editor to update fn_pos_post_sale.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_pos_post_sale(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    o        public.orders%ROWTYPE;
    v_inv    RECORD;
    v_co     UUID;
    v_date   DATE;
    v_total  NUMERIC;
    v_tax    NUMERIC;
    v_sc     NUMERIC;
    v_del    NUMERIC;
    v_net    NUMERIC;
    v_tips   NUMERIC := 0;
    v_paysum NUMERIC := 0;
    v_cash   NUMERIC := 0;
    v_clear  NUMERIC := 0;
    v_credit NUMERIC := 0;
    v_t      RECORD;
    v_desc   TEXT;
    v_ref    TEXT;
    r        RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries
                WHERE source_type = 'pos_sale' AND source_id = p_order_id) THEN
        RETURN jsonb_build_object('success', true, 'already_posted', true);
    END IF;

    SELECT * INTO o FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;
    IF o.payment_status NOT IN ('paid', 'partially_refunded', 'refunded') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is not paid');
    END IF;

    SELECT * INTO v_inv FROM public.invoices WHERE order_id = p_order_id
     ORDER BY CASE WHEN payment_status = 'paid' THEN 0 ELSE 1 END, created_at DESC LIMIT 1;

    SELECT company_id INTO v_co FROM public.branches WHERE id = o.branch_id;
    v_co    := COALESCE(v_co, o.company_id);
    v_date  := COALESCE(o.paid_at, o.updated_at, now())::DATE;
    v_total := ROUND(COALESCE(o.total_amount, 0), 2);
    IF v_total <= 0 THEN
        RETURN jsonb_build_object('success', true, 'skipped', 'zero total (FOC)');
    END IF;
    v_tax := ROUND(COALESCE(NULLIF(v_inv.tax, 0), NULLIF(v_inv.vat_amount, 0), o.tax_amount, 0), 2);
    v_sc  := ROUND(COALESCE(NULLIF(v_inv.service_charge, 0), o.service_charge, 0), 2);
    v_del := ROUND(COALESCE(NULLIF(v_inv.delivery_charge, 0), o.delivery_charge, 0), 2);
    v_net := v_total - v_tax - v_sc - v_del;
    IF v_net < 0 THEN
        RAISE EXCEPTION 'POS_GL: order % components (VAT %, SC %, delivery %) exceed total %', p_order_id, v_tax, v_sc, v_del, v_total;
    END IF;

    -- Payment split: SPLIT tenders (#145 §9) when present, else the
    -- positive, non-voided payments of the sale
    FOR r IN
        SELECT public.fn_pos_pay_bucket(t.method) AS bucket, SUM(t.amount) AS amt, 0::NUMERIC AS tip
          FROM public.pos_order_tenders t
         WHERE t.order_id = p_order_id
         GROUP BY 1
        UNION ALL
        SELECT public.fn_pos_pay_bucket(COALESCE(pm.name, p.payment_method)) AS bucket,
               SUM(p.amount) AS amt, SUM(COALESCE(p.tip, 0)) AS tip
          FROM public.payments p
          LEFT JOIN public.payment_methods pm ON pm.id = p.payment_method_id
         WHERE p.order_id = p_order_id AND p.amount > 0 AND NOT COALESCE(p.voided, false)
           AND NOT EXISTS (SELECT 1 FROM public.pos_order_tenders t2 WHERE t2.order_id = p_order_id)
         GROUP BY 1
    LOOP
        v_paysum := v_paysum + r.amt;
        v_tips   := v_tips + r.tip;
        IF r.bucket = 'cash' THEN v_cash := v_cash + r.amt;
        ELSIF r.bucket = 'credit' THEN v_credit := v_credit + r.amt;
        ELSE v_clear := v_clear + r.amt; END IF;
    END LOOP;

    -- Belt and braces: the order says CREDIT but the payment row was resolved
    -- to another method (e.g. the 'Cash' fallback) → it is a credit sale.
    IF public.fn_pos_pay_bucket(o.payment_method) = 'credit' AND v_credit = 0 AND v_paysum > 0
       AND NOT EXISTS (SELECT 1 FROM public.pos_order_tenders t WHERE t.order_id = p_order_id) THEN
        v_credit := v_paysum; v_cash := 0; v_clear := 0;
    END IF;

    IF v_paysum <= 0 THEN
        -- no payments row (e.g. online gateway): whole total on the order's method
        CASE public.fn_pos_pay_bucket(o.payment_method)
            WHEN 'cash' THEN v_cash := v_total;
            WHEN 'credit' THEN v_credit := v_total;
            ELSE v_clear := v_total;
        END CASE;
    ELSE
        -- scale to the server-side total (payments may carry rounding)
        v_cash   := ROUND(v_total * v_cash / v_paysum, 2);
        v_credit := ROUND(v_total * v_credit / v_paysum, 2);
        v_clear  := v_total - v_cash - v_credit;
    END IF;

    v_ref  := COALESCE(o.order_number::TEXT, left(o.id::TEXT, 8));
    v_desc := 'POS sale — Order #' || v_ref
              || COALESCE(' | Inv ' || COALESCE(v_inv.invoice_number::TEXT, v_inv.invoice_no::TEXT), '')
              || COALESCE(' | ' || NULLIF(o.customer_name, ''), '');

    -- Debits
    IF v_cash > 0 THEN
        SELECT * INTO v_t FROM public.fn_pos_bucket_target(v_co, 'cash');
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date, v_t.ledger_id, v_t.account_id, v_desc || ' (cash)', v_cash, 0);
    END IF;
    IF v_clear > 0 THEN
        SELECT * INTO v_t FROM public.fn_pos_bucket_target(v_co, 'clearing');
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date, v_t.ledger_id, NULL, v_desc || ' (card/digital)', v_clear, 0);
    END IF;
    IF v_credit > 0 THEN
        SELECT * INTO v_t FROM public.fn_pos_bucket_target(v_co, 'credit');
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date, v_t.ledger_id, NULL, v_desc || ' (credit)', v_credit, 0);
        INSERT INTO public.customer_receivables (
            company_id, branch_id, customer_id, order_id, invoice_id, doc_number, doc_date, due_date,
            total_amount, paid_amount, status, source, description, gl_posted_at, created_by
        ) VALUES (
            v_co, o.branch_id, o.customer_id, o.id, v_inv.id, public.fn_ar_next_no('AR-INV'), v_date, v_date + 30,
            v_credit, 0, 'outstanding', 'pos_credit',
            'POS credit sale — Order #' || v_ref || COALESCE(' — ' || NULLIF(o.customer_name, ''), ''),
            now(), auth.uid()
        );
        IF o.customer_id IS NULL THEN
            -- POS requires a registered customer for CREDIT; flag any that slip through
            INSERT INTO public.pos_gl_failures (kind, ref_id, error)
            VALUES ('sale', o.id, 'Credit sale without a registered customer — assign the customer to receivable of Order #' || v_ref);
        END IF;
    END IF;
    IF v_tips > 0 THEN
        -- tips are collected on top of the bill, in the same tender as the bill
        SELECT * INTO v_t FROM public.fn_pos_bucket_target(v_co, CASE WHEN v_cash > 0 THEN 'cash' ELSE 'clearing' END);
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date, v_t.ledger_id,
                                       CASE WHEN v_cash > 0 THEN v_t.account_id END, v_desc || ' (tips)', v_tips, 0);
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date,
            public.fn_fin_ledger_by_code(v_co, '5006', 'Other Operating Income'), NULL, v_desc || ' — tips', 0, v_tips);
    END IF;

    -- Credits
    PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date,
        public.fn_fin_ledger_by_code(v_co, '5000', 'Restaurant Food Sales'), NULL, v_desc, 0, v_net);
    IF v_tax > 0 THEN
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date,
            public.fn_fin_ledger_by_code(v_co, '2006', 'Output VAT Payable'), NULL, v_desc || ' — VAT', 0, v_tax);
    END IF;
    IF v_sc > 0 THEN
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date,
            public.fn_fin_ledger_by_code(v_co, '5003', 'Service Charge Income'), NULL, v_desc || ' — service charge', 0, v_sc);
    END IF;
    IF v_del > 0 THEN
        PERFORM public.fn_fin_post_leg(v_co, o.branch_id, 'pos_sale', o.id, v_date,
            public.fn_fin_ledger_by_code(v_co, '5004', 'Delivery Income'), NULL, v_desc || ' — delivery', 0, v_del);
    END IF;

    RETURN jsonb_build_object('success', true, 'total', v_total, 'cash', v_cash, 'card_digital', v_clear,
                              'credit', v_credit, 'vat', v_tax, 'service_charge', v_sc, 'delivery', v_del, 'tips', v_tips);
END;
$$;
