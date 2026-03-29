-- Create or Replace the post_payroll_to_finance to dynamically break down by Bank Name and Cash

CREATE OR REPLACE FUNCTION public.post_payroll_to_finance(
    p_payroll_run_id uuid,
    p_salary_expense_acc uuid,
    p_epf_expense_acc uuid,
    p_etf_expense_acc uuid,
    p_salary_payable_acc uuid,
    p_epf_payable_acc uuid,
    p_etf_payable_acc uuid,
    p_cash_bank_acc uuid,
    p_payment_method text,
    p_posted_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_run           payroll_runs%ROWTYPE;
    v_posting_id    uuid;
    
    -- Variables for aggregate loop
    v_group_name    text;
    v_total_gross   numeric;
    v_total_net     numeric;
    v_total_epf_emp numeric;
    v_total_epf_er  numeric;
    v_total_etf     numeric;
    v_total_ded     numeric;
    v_journal_id    uuid;

    -- Looked up account codes
    c_salary_expense_acc text;
    c_epf_expense_acc text;
    c_etf_expense_acc text;
    c_salary_payable_acc text;
    c_epf_payable_acc text;
    c_etf_payable_acc text;
    c_cash_bank_acc text;
BEGIN
    SELECT * INTO v_run FROM payroll_runs WHERE id = p_payroll_run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payroll run not found: %', p_payroll_run_id;
    END IF;

    -- Fetch the codes for the given UUIDs
    SELECT code INTO c_salary_expense_acc FROM chart_of_accounts WHERE id = p_salary_expense_acc;
    SELECT code INTO c_epf_expense_acc    FROM chart_of_accounts WHERE id = p_epf_expense_acc;
    SELECT code INTO c_etf_expense_acc    FROM chart_of_accounts WHERE id = p_etf_expense_acc;
    SELECT code INTO c_salary_payable_acc FROM chart_of_accounts WHERE id = p_salary_payable_acc;
    SELECT code INTO c_epf_payable_acc    FROM chart_of_accounts WHERE id = p_epf_payable_acc;
    SELECT code INTO c_etf_payable_acc    FROM chart_of_accounts WHERE id = p_etf_payable_acc;
    SELECT code INTO c_cash_bank_acc      FROM chart_of_accounts WHERE id = p_cash_bank_acc;

    -- Create the parent posting record (optional but good for tracking)
    INSERT INTO payroll_finance_postings (
        company_id, branch_id, payroll_run_id,
        salary_expense_account_id, epf_expense_account_id, etf_expense_account_id,
        salary_payable_account_id, epf_payable_account_id, etf_payable_account_id,
        cash_bank_account_id, payment_method,
        total_gross, total_net,
        total_epf_employee, total_epf_employer, total_etf_employer, total_deductions,
        posted_by
    ) VALUES (
        v_run.company_id, v_run.branch_id, p_payroll_run_id,
        p_salary_expense_acc, p_epf_expense_acc, p_etf_expense_acc,
        p_salary_payable_acc, p_epf_payable_acc, p_etf_payable_acc,
        p_cash_bank_acc, p_payment_method,
        0, 0, 0, 0, 0, 0, -- Totals will be updated locally, but we don't strictly need them
        p_posted_by
    ) RETURNING id INTO v_posting_id;

    -- Now, iterate through the distinct banks (or NULL for Cash) in this payroll run
    FOR v_group_name, v_total_gross, v_total_net, v_total_epf_emp, v_total_epf_er, v_total_etf, v_total_ded IN
        SELECT 
            COALESCE(e.bank_name, 'Cash') as payment_group,
            COALESCE(SUM(p.gross_salary), 0),
            COALESCE(SUM(p.net_salary), 0),
            COALESCE(SUM(p.epf_employee), 0),
            COALESCE(SUM(p.epf_employer), 0),
            COALESCE(SUM(p.etf_employer), 0),
            COALESCE(SUM(p.total_deductions), 0)
        FROM payslips p
        JOIN employees e ON e.id = p.employee_id
        WHERE p.payroll_run_id = p_payroll_run_id
          AND p.payment_status != 'held'
        GROUP BY COALESCE(e.bank_name, 'Cash')
    LOOP
        -- Only create journal entry if there is a net salary to pay
        IF v_total_net > 0 THEN
            
            -- Insert Journal Entry Header
            INSERT INTO public.journal_entries (
                company_id, branch_id, reference_id, reference_type, description, entry_type
            )
            VALUES (
                v_run.company_id, v_run.branch_id, p_payroll_run_id, 'payroll', 
                'Payroll Bulk - [' || v_group_name || '] ' || to_char(v_run.period_end, 'Mon YYYY'), 
                'expense'
            )
            RETURNING id INTO v_journal_id;

            -- Debit: Salary Expense
            IF v_total_gross > 0 THEN
                INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, memo)
                VALUES (v_journal_id, c_salary_expense_acc, v_total_gross, 'Gross Salary Expense - ' || v_group_name);
            END IF;

            -- Debit: EPF Employer Expense
            IF v_total_epf_er > 0 THEN
                INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, memo)
                VALUES (v_journal_id, c_epf_expense_acc, v_total_epf_er, 'EPF Employer Expense - ' || v_group_name);
            END IF;

            -- Debit: ETF Employer Expense
            IF v_total_etf > 0 THEN
                INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, memo)
                VALUES (v_journal_id, c_etf_expense_acc, v_total_etf, 'ETF Employer Expense - ' || v_group_name);
            END IF;

            -- Credit: Payable EPF (Employer + Employee)
            IF (v_total_epf_er + v_total_epf_emp) > 0 THEN
                INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
                VALUES (v_journal_id, c_epf_payable_acc, v_total_epf_er + v_total_epf_emp, 'EPF Payable - ' || v_group_name);
            END IF;

            -- Credit: Payable ETF
            IF v_total_etf > 0 THEN
                INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
                VALUES (v_journal_id, c_etf_payable_acc, v_total_etf, 'ETF Payable - ' || v_group_name);
            END IF;
            
            -- Credit: Other Deductions (Contra to Salary Payable / Advances)
            IF v_total_ded > 0 THEN
                INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
                VALUES (v_journal_id, c_salary_payable_acc, v_total_ded, 'Other Deductions Holding - ' || v_group_name);
            END IF;

            -- Credit: Cash/Bank Account (The actual payout of Net Salary)
            IF v_total_net > 0 THEN
                INSERT INTO public.journal_lines (journal_id, account_code, cr_amount, memo)
                VALUES (v_journal_id, c_cash_bank_acc, v_total_net, 'Salary Payout - ' || v_group_name);
            END IF;

        END IF;
    END LOOP;

    -- Mark Payroll run as paid
    UPDATE payroll_runs 
    SET status = 'paid', updated_at = NOW()
    WHERE id = p_payroll_run_id;
    
    -- Mark individual payslips as paid. Ensure payment_method reflects 'Cash' or 'Bank Transfer'
    -- dynamically based on their bank_name availability if the user wants. But we'll use the UI provided one for now
    -- or better, set it based on bank_name.
    UPDATE payslips
    SET 
        payment_status    = 'paid',
        paid_at           = NOW(),
        payment_method    = CASE WHEN (SELECT e.bank_name FROM employees e WHERE e.id = payslips.employee_id) IS NULL THEN 'Cash' ELSE 'Bank Transfer' END,
        payment_account_id = p_cash_bank_acc,
        paid_by           = p_posted_by
    WHERE payroll_run_id = p_payroll_run_id
      AND payment_status = 'pending';
    
    RETURN v_posting_id;
END;
$$;
