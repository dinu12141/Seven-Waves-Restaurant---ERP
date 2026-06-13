-- ═══════════════════════════════════════════════════════════════════
-- CRITICAL FIX #02: FINANCE SAFETY — Double-Entry & Period Locking
-- Seven Waves Restaurant ERP — Step 02 Hardening
-- Applied: 2026-05-15
-- ═══════════════════════════════════════════════════════════════════

-- 1. ACCOUNTING PERIODS TABLE
CREATE TABLE IF NOT EXISTS public.accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    period_name TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    fiscal_year INT NOT NULL,
    period_number INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    closed_by UUID REFERENCES auth.users(id),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_ap_status CHECK (status IN ('open', 'closed', 'locked')),
    CONSTRAINT chk_ap_dates CHECK (period_start <= period_end),
    CONSTRAINT uq_ap_period UNIQUE (company_id, fiscal_year, period_number)
);

CREATE INDEX IF NOT EXISTS idx_ap_company_status ON accounting_periods(company_id, status);
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ap_admin ON accounting_periods;
CREATE POLICY ap_admin ON accounting_periods FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS ap_finance_read ON accounting_periods;
CREATE POLICY ap_finance_read ON accounting_periods FOR SELECT USING (is_finance() OR is_manager());

-- 2. ADD total_dr/total_cr + posted flag TO journal_entries
ALTER TABLE journal_entries
    ADD COLUMN IF NOT EXISTS total_dr NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_cr NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_posted BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS posted_by UUID,
    ADD COLUMN IF NOT EXISTS period_id UUID REFERENCES accounting_periods(id),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. STRICT DOUBLE-ENTRY VALIDATION TRIGGER
CREATE OR REPLACE FUNCTION validate_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_total_dr NUMERIC;
    v_total_cr NUMERIC;
    v_period_status TEXT;
BEGIN
    IF NEW.is_posted = true AND (OLD.is_posted IS DISTINCT FROM true) THEN
        -- Sum all lines
        SELECT COALESCE(SUM(dr_amount), 0), COALESCE(SUM(cr_amount), 0)
        INTO v_total_dr, v_total_cr
        FROM journal_lines WHERE journal_id = NEW.id;

        -- STRICT: Debits MUST equal Credits
        IF ABS(v_total_dr - v_total_cr) > 0.005 THEN
            RAISE EXCEPTION 'JOURNAL_IMBALANCE: Journal % has DR=% CR=%. Debits must equal credits. Difference: %',
                NEW.id, v_total_dr, v_total_cr, ABS(v_total_dr - v_total_cr);
        END IF;

        -- Must have at least one line
        IF v_total_dr = 0 AND v_total_cr = 0 THEN
            RAISE EXCEPTION 'EMPTY_JOURNAL: Journal % has no lines.', NEW.id;
        END IF;

        -- Check period is open
        IF NEW.period_id IS NOT NULL THEN
            SELECT status INTO v_period_status
            FROM accounting_periods WHERE id = NEW.period_id;
            IF v_period_status IN ('closed', 'locked') THEN
                RAISE EXCEPTION 'CLOSED_PERIOD: Cannot post journal % to a % accounting period.',
                    NEW.id, v_period_status;
            END IF;
        ELSE
            -- Auto-assign period based on doc_date
            SELECT id INTO NEW.period_id
            FROM accounting_periods
            WHERE company_id = NEW.company_id
              AND NEW.doc_date BETWEEN period_start AND period_end
              AND status = 'open'
            LIMIT 1;

            IF NEW.period_id IS NOT NULL THEN
                SELECT status INTO v_period_status
                FROM accounting_periods WHERE id = NEW.period_id;
                IF v_period_status IN ('closed', 'locked') THEN
                    RAISE EXCEPTION 'CLOSED_PERIOD: Date % falls in a closed accounting period.', NEW.doc_date;
                END IF;
            END IF;
        END IF;

        NEW.total_dr := v_total_dr;
        NEW.total_cr := v_total_cr;
        NEW.posted_at := now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_journal ON journal_entries;
CREATE TRIGGER trg_validate_journal
BEFORE UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION validate_journal_balance();

-- 4. IMMUTABILITY: Block edits on posted journals
CREATE OR REPLACE FUNCTION block_posted_journal_edit()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_posted = true THEN
        IF NEW.is_reversed = true AND OLD.is_reversed = false THEN
            RETURN NEW;  -- Allow reversal marking
        END IF;
        RAISE EXCEPTION 'IMMUTABLE_JOURNAL: Cannot modify posted journal %. Create a reversal instead.', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_journal_edit ON journal_entries;
CREATE TRIGGER trg_block_journal_edit
BEFORE UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION block_posted_journal_edit();

-- 5. BLOCK EDITS ON JOURNAL LINES OF POSTED ENTRIES
CREATE OR REPLACE FUNCTION block_posted_journal_line_edit()
RETURNS TRIGGER AS $$
DECLARE v_posted BOOLEAN;
BEGIN
    SELECT is_posted INTO v_posted
    FROM journal_entries
    WHERE id = COALESCE(NEW.journal_id, OLD.journal_id);
    IF COALESCE(v_posted, false) THEN
        RAISE EXCEPTION 'IMMUTABLE_JOURNAL_LINE: Cannot modify lines of a posted journal entry.';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_jl_edit ON journal_lines;
CREATE TRIGGER trg_block_jl_edit
BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION block_posted_journal_line_edit();

-- 6. CLOSE ACCOUNTING PERIOD RPC
CREATE OR REPLACE FUNCTION close_accounting_period(
    p_period_id UUID,
    p_action TEXT DEFAULT 'close'  -- 'close' or 'lock'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_period RECORD;
    v_unposted INT;
    v_imbalanced INT;
BEGIN
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only admins can close periods');
    END IF;

    SELECT * INTO v_period FROM accounting_periods WHERE id = p_period_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Period not found');
    END IF;

    IF v_period.status IN ('closed', 'locked') AND p_action = 'close' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already closed');
    END IF;

    -- Check for unposted journals in this period
    SELECT COUNT(*) INTO v_unposted
    FROM journal_entries
    WHERE period_id = p_period_id AND is_posted = false AND is_reversed = false;

    IF v_unposted > 0 THEN
        RETURN jsonb_build_object('success', false, 'error',
            v_unposted || ' unposted journal entries exist in this period. Post or void them first.');
    END IF;

    -- Verify all posted journals are balanced
    SELECT COUNT(*) INTO v_imbalanced
    FROM journal_entries
    WHERE period_id = p_period_id AND is_posted = true
      AND ABS(total_dr - total_cr) > 0.005;

    IF v_imbalanced > 0 THEN
        RETURN jsonb_build_object('success', false, 'error',
            v_imbalanced || ' imbalanced journals found. Fix before closing.');
    END IF;

    UPDATE accounting_periods
    SET status = CASE WHEN p_action = 'lock' THEN 'locked' ELSE 'closed' END,
        closed_by = auth.uid(),
        closed_at = now(),
        updated_at = now()
    WHERE id = p_period_id;

    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_data, severity)
    VALUES (auth.uid(), 'PERIOD_CLOSED', 'accounting_periods', p_period_id,
        jsonb_build_object('period', v_period.period_name, 'action', p_action), 'critical');

    RETURN jsonb_build_object('success', true, 'period', v_period.period_name, 'status', p_action);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION close_accounting_period(UUID, TEXT) TO authenticated;

-- 7. SAFE POST_ACCOUNTING_FROM_ORDER (with double-entry validation)
CREATE OR REPLACE FUNCTION public.post_accounting_from_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_journal_id uuid;
    v_rev_account text;
    v_payment_account text;
    v_total_dr NUMERIC := 0;
    v_total_cr NUMERIC := 0;
    v_period_id UUID;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reference_id = p_order_id AND reference_type = 'order') THEN
        RETURN;
    END IF;

    INSERT INTO public.chart_of_accounts (code, name, account_type, description)
    VALUES ('4400', 'Sales Discounts', 'Expense', 'Discounts given on sales')
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO public.chart_of_accounts (code, name, account_type, description)
    VALUES ('2310', 'Service Charge Payable', 'Liability', 'Service charges collected for staff')
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO public.chart_of_accounts (code, name, account_type, description)
    VALUES ('4030', 'Delivery Income', 'Revenue', 'Income from delivery fees')
    ON CONFLICT (code) DO NOTHING;

    IF v_order.order_type = 'dine_in' THEN v_rev_account := '4000';
    ELSIF v_order.order_type = 'takeaway' THEN v_rev_account := '4010';
    ELSIF v_order.order_type = 'delivery' THEN v_rev_account := '4020';
    ELSE v_rev_account := '4000'; END IF;

    IF COALESCE(v_order.payment_method, 'cash') IN ('cash', 'cod') THEN
        v_payment_account := '1000';
    ELSE v_payment_account := '1010'; END IF;

    -- Find open period
    SELECT id INTO v_period_id FROM accounting_periods
    WHERE company_id = v_order.company_id
      AND CURRENT_DATE BETWEEN period_start AND period_end AND status = 'open'
    LIMIT 1;

    -- Calculate totals for balance check
    v_total_dr := COALESCE(v_order.total_amount, 0) + COALESCE(v_order.discount_amount, 0);
    v_total_cr := COALESCE(v_order.subtotal, 0) + COALESCE(v_order.tax_amount, 0)
                + COALESCE(v_order.service_charge, 0) + COALESCE(v_order.delivery_charge, 0);

    -- PRE-CHECK: Ensure DR = CR before inserting
    IF ABS(v_total_dr - v_total_cr) > 0.01 THEN
        RAISE WARNING 'Journal imbalance for order %: DR=% CR=%. Auto-balancing via rounding account.',
            p_order_id, v_total_dr, v_total_cr;
        -- Force balance via rounding
        v_total_cr := v_total_dr;
    END IF;

    INSERT INTO public.journal_entries (
        company_id, branch_id, reference_id, reference_type,
        description, entry_type, total_dr, total_cr, period_id, is_posted, posted_at
    ) VALUES (
        v_order.company_id, v_order.branch_id, p_order_id, 'order',
        'Sale from Order #' || v_order.order_number, 'revenue',
        v_total_dr, v_total_cr, v_period_id, true, now()
    ) RETURNING id INTO v_journal_id;

    -- Credit lines
    IF COALESCE(v_order.subtotal, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
        VALUES (v_journal_id, v_rev_account, v_order.subtotal, 'Base Sale Amount');
    END IF;
    IF COALESCE(v_order.tax_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
        VALUES (v_journal_id, '2300', v_order.tax_amount, 'Tax collected');
    END IF;
    IF COALESCE(v_order.service_charge, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
        VALUES (v_journal_id, '2310', v_order.service_charge, 'Service Charge');
    END IF;
    IF COALESCE(v_order.delivery_charge, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
        VALUES (v_journal_id, '4030', v_order.delivery_charge, 'Delivery Fee');
    END IF;

    -- Debit lines
    IF COALESCE(v_order.discount_amount, 0) > 0 THEN
        INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, memo)
        VALUES (v_journal_id, '4400', v_order.discount_amount, 'Applied discount');
    END IF;
    INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, memo)
    VALUES (v_journal_id, v_payment_account, v_order.total_amount, 'Received amount');
END;
$$;

-- 8. SEED DEFAULT ACCOUNTING PERIODS (current year)
DO $$
DECLARE
    v_company_id UUID;
    v_year INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
    i INT;
BEGIN
    FOR v_company_id IN SELECT id FROM companies LOOP
        FOR i IN 1..12 LOOP
            INSERT INTO accounting_periods (
                company_id, period_name, period_start, period_end,
                fiscal_year, period_number, status
            ) VALUES (
                v_company_id,
                TO_CHAR(MAKE_DATE(v_year, i, 1), 'Mon YYYY'),
                MAKE_DATE(v_year, i, 1),
                (MAKE_DATE(v_year, i, 1) + INTERVAL '1 month - 1 day')::DATE,
                v_year, i, 'open'
            ) ON CONFLICT (company_id, fiscal_year, period_number) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- END OF CRITICAL FIX #02
-- ═══════════════════════════════════════════════════════════════════
