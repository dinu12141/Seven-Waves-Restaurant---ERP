-- ERP Enterprise Reporting Module Server-Side Logic
-- Follows strict PDF matching layout specifications.

-- 1. ELECTRONIC JOURNAL VIEW (v_rpt_electronic_journal)
CREATE OR REPLACE VIEW public.v_rpt_electronic_journal AS
SELECT
    o.id AS order_id,
    o.company_id,
    o.branch_id,
    o.created_at AS bill_date,
    o.order_number AS bill_no,
    'POS-01' AS pos_terminal, -- In future can join pos terminals table
    p_cashier.full_name AS clerk,
    p_waiter.full_name AS waiter,
    o.order_number AS kot_no,
    COALESCE(o.customer_name, 'Walk-in') AS customer,
    mi.id AS item_code_raw,
    SUBSTRING(mi.name, 1, 8) AS item_code,
    mc.name AS department,
    mi.name AS prod_ref,
    mi.description AS description,
    COALESCE(o.discount_amount, 0) AS disc_amt,
    COALESCE(o.tax_amount, 0) AS tax_amt,
    oi.unit_price AS sales_price,
    oi.quantity AS qty,
    TO_CHAR(o.created_at, 'HH24:MI:SS') AS bill_time,
    o.order_type AS order_type,
    o.order_number AS bill_ref,
    CASE WHEN vt.id IS NOT NULL THEN 'V' ELSE '' END AS void_marked,
    o.status AS bill_status,
    o.payment_status AS payment_status
FROM public.orders o
JOIN public.order_items oi ON o.id = oi.order_id
JOIN public.menu_items mi ON oi.menu_item_id = mi.id
LEFT JOIN public.menu_categories mc ON mi.category_id = mc.id
LEFT JOIN public.profiles p_waiter ON o.waiter_id = p_waiter.id
LEFT JOIN public.profiles p_cashier ON o.assigned_waiter_id = p_cashier.id -- assuming cashier mapped somehow, fallback to user
LEFT JOIN public.void_transactions vt ON vt.entity_id = oi.id AND vt.entity_type = 'order_item';


-- 2. ITEM WISE SALE REPORT VIEW (v_rpt_item_wise_sale)
CREATE OR REPLACE VIEW public.v_rpt_item_wise_sale AS
SELECT
    o.company_id,
    o.branch_id,
    o.created_at::DATE AS sale_date,
    mc.name AS subgroup_name,
    mi.id AS item_id,
    SUBSTRING(mi.name, 1, 8) AS item_code,
    mi.name AS description,
    SUM(oi.quantity) AS pack_qty,
    MAX(oi.unit_price) AS unit_price,
    MAX(oi.unit_price) AS cur_price,
    SUM(oi.quantity * oi.unit_price) AS gross_amt,
    SUM(COALESCE(o.discount_amount, 0) * (oi.quantity * oi.unit_price) / NULLIF(o.subtotal, 0)) AS disc_amt, -- proportional discount
    SUM((oi.quantity * oi.unit_price)) - SUM(COALESCE(o.discount_amount, 0) * (oi.quantity * oi.unit_price) / NULLIF(o.subtotal, 0)) AS net_amt,
    SUM(COALESCE(o.tax_amount, 0) * (oi.quantity * oi.unit_price) / NULLIF(o.subtotal, 0)) AS tax_amt,
    SUM(oi.total_price) AS amt_with_tax,
    COALESCE(mi.base_price, 0) AS unit_cost, -- Simplified cost, can join inventory cost for exact
    SUM(oi.quantity * COALESCE(mi.base_price, 0)) AS total_cost,
    CASE WHEN SUM(oi.quantity * oi.unit_price) > 0 THEN 
        ROUND(((SUM(oi.total_price) - SUM(oi.quantity * COALESCE(mi.base_price, 0))) / SUM(oi.total_price)) * 100, 2) 
    ELSE 0 END AS gp_percent
FROM public.orders o
JOIN public.order_items oi ON o.id = oi.order_id
JOIN public.menu_items mi ON oi.menu_item_id = mi.id
LEFT JOIN public.menu_categories mc ON mi.category_id = mc.id
WHERE o.status = 'completed'
GROUP BY o.company_id, o.branch_id, o.created_at::DATE, mc.name, mi.id, mi.name, mi.base_price;


-- 3. WAITER WISE SALE VIEW (v_rpt_waiter_wise_sale)
CREATE OR REPLACE VIEW public.v_rpt_waiter_wise_sale AS
SELECT
    o.company_id,
    o.branch_id,
    o.created_at::DATE AS sale_date,
    p.full_name AS waiter_name,
    o.waiter_id,
    rt.table_number AS table_no,
    COUNT(DISTINCT o.id) AS no_customer, -- Assuming 1 order = 1 customer group for simplicty or track guests
    SUM(o.total_amount) AS amount,
    SUM(o.total_amount) / NULLIF(COUNT(DISTINCT o.id), 0) AS avg_sales,
    SUM(o.total_amount) / NULLIF(COUNT(DISTINCT o.table_id), 0) AS avg_table_sale
FROM public.orders o
LEFT JOIN public.profiles p ON o.waiter_id = p.id
LEFT JOIN public.restaurant_tables rt ON o.table_id = rt.id
WHERE o.status = 'completed' AND o.waiter_id IS NOT NULL
GROUP BY o.company_id, o.branch_id, o.created_at::DATE, p.full_name, o.waiter_id, rt.table_number;


-- 4. TABLE WISE SALE VIEW (v_rpt_table_wise_sale)
CREATE OR REPLACE VIEW public.v_rpt_table_wise_sale AS
SELECT
    o.company_id,
    o.branch_id,
    o.created_at::DATE AS sale_date,
    rt.table_number AS table_no,
    p.full_name AS waiter_name,
    COUNT(DISTINCT o.id) AS no_customer,
    SUM(o.total_amount) AS amount
FROM public.orders o
LEFT JOIN public.restaurant_tables rt ON o.table_id = rt.id
LEFT JOIN public.profiles p ON o.waiter_id = p.id
WHERE o.status = 'completed' AND o.table_id IS NOT NULL
GROUP BY o.company_id, o.branch_id, o.created_at::DATE, rt.table_number, p.full_name;


-- 5. SALES STATEMENT FUNCTION (RPC)
CREATE OR REPLACE FUNCTION fn_rpt_sales_statement(
    p_company_id UUID,
    p_branch_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'gross_sales', COALESCE(SUM(o.subtotal), 0),
        'discount', COALESCE(SUM(o.discount_amount), 0),
        'staff_meal', 0, -- extendible logic
        'complimentary', 0,
        'paid_in_advance', 0,
        'void_refund', COALESCE((SELECT SUM(total_price) FROM public.order_items oi JOIN public.void_transactions vt ON vt.entity_id = oi.id WHERE oi.order_id IN (SELECT id FROM public.orders WHERE company_id = p_company_id AND branch_id = p_branch_id AND created_at::DATE BETWEEN p_start_date AND p_end_date)), 0),
        'service_charge', 0,
        'tips', 0,
        'delivery_charges', COALESCE(SUM(CASE WHEN o.order_type IN ('Uber', 'PickMe') THEN o.tax_amount ELSE 0 END), 0),
        
        -- Right Side (Payments)
        'cash', COALESCE((SELECT SUM(amount) FROM public.payments WHERE payment_method = 'CASH' AND order_id IN (SELECT id FROM public.orders WHERE company_id = p_company_id AND branch_id = p_branch_id AND created_at::DATE BETWEEN p_start_date AND p_end_date)), 0),
        'credit_cards', COALESCE((SELECT SUM(amount) FROM public.payments WHERE payment_method IN ('CARD', 'CREDIT_CARD') AND order_id IN (SELECT id FROM public.orders WHERE company_id = p_company_id AND branch_id = p_branch_id AND created_at::DATE BETWEEN p_start_date AND p_end_date)), 0),
        'credit_customer', 0,
        
        -- Analysis
        'order_types', (
            SELECT json_agg(json_build_object(
                'order_type', sub.order_type,
                'gross_sales', sub.sales,
                'pct_total', CASE WHEN SUM(o.total_amount) OVER() > 0 THEN (sub.sales / SUM(o.total_amount) OVER()) * 100 ELSE 0 END,
                'checks', sub.checks
            ))
            FROM (
                SELECT order_type, SUM(total_amount) as sales, COUNT(id) as checks
                FROM public.orders 
                WHERE company_id = p_company_id AND branch_id = p_branch_id AND created_at::DATE BETWEEN p_start_date AND p_end_date AND status = 'completed'
                GROUP BY order_type
            ) sub
        )
    ) INTO result
    FROM public.orders o
    WHERE o.company_id = p_company_id 
      AND o.branch_id = p_branch_id 
      AND o.created_at::DATE BETWEEN p_start_date AND p_end_date
      AND o.status = 'completed';

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 6. GROUP SUMMARY VIEW (v_rpt_group_summary)
CREATE OR REPLACE VIEW public.v_rpt_group_summary AS
SELECT
    o.company_id,
    o.branch_id,
    o.created_at::DATE AS sale_date,
    mc.name AS category_group,
    COUNT(oi.id) AS total_items,
    SUM(oi.quantity) AS total_qty,
    SUM(oi.total_price) AS total_amount,
    SUM(COALESCE(o.discount_amount, 0) * (oi.quantity * oi.unit_price) / NULLIF(o.subtotal, 0)) AS total_discount
FROM public.orders o
JOIN public.order_items oi ON o.id = oi.order_id
JOIN public.menu_items mi ON oi.menu_item_id = mi.id
LEFT JOIN public.menu_categories mc ON mi.category_id = mc.id
WHERE o.status = 'completed'
GROUP BY o.company_id, o.branch_id, o.created_at::DATE, mc.name;

-- Standard View permissions
GRANT SELECT ON public.v_rpt_electronic_journal TO authenticated;
GRANT SELECT ON public.v_rpt_item_wise_sale TO authenticated;
GRANT SELECT ON public.v_rpt_waiter_wise_sale TO authenticated;
GRANT SELECT ON public.v_rpt_table_wise_sale TO authenticated;
GRANT SELECT ON public.v_rpt_group_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rpt_sales_statement TO authenticated;

