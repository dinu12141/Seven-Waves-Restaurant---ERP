-- =====================================================
-- PAYROLL ENGINE FUNCTIONS
-- =====================================================

-- 1. Generate Payroll Function
CREATE OR REPLACE FUNCTION generate_payroll(
    p_company_id UUID,
    p_branch_id UUID,
    p_period_start DATE,
    p_period_end DATE,
    p_processed_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_run_id UUID;
    v_emp RECORD;
    v_sal RECORD;
    
    -- Calculation Variables
    v_basic NUMERIC;
    v_daily_rate NUMERIC;
    v_hourly_rate NUMERIC;
    
    v_ot_hours NUMERIC;
    v_ot_amount NUMERIC;
    
    v_absent_days INT;
    v_late_minutes INT;
    v_no_pay_deduction NUMERIC;
    
    v_total_allowances NUMERIC;
    
    v_epf_base NUMERIC;
    v_epf_employee NUMERIC;
    v_epf_employer NUMERIC;
    v_etf_employer NUMERIC;
    
    v_loan_deduction NUMERIC;
    v_gross NUMERIC;
    v_total_deductions NUMERIC;
    v_net NUMERIC;
    
    v_run_total_gross NUMERIC := 0;
    v_run_total_net NUMERIC := 0;
    v_run_emp_count INT := 0;
BEGIN
    -- 1. Create or Update Payroll Run Header
    INSERT INTO payroll_runs (
        company_id, branch_id, period_start, period_end, status, processed_by
    ) VALUES (
        p_company_id, p_branch_id, p_period_start, p_period_end, 'processing', p_processed_by
    )
    ON CONFLICT (branch_id, period_start, period_end) 
    DO UPDATE SET 
        status = 'processing',
        processed_by = p_processed_by,
        updated_at = now()
    RETURNING id INTO v_run_id;

    -- 2. Clear existing payslips for this run (to allow re-generation)
    DELETE FROM payslips WHERE payroll_run_id = v_run_id;

    -- 3. Iterate through Active Employees
    FOR v_emp IN 
        SELECT * FROM employees 
        WHERE branch_id = p_branch_id AND is_active = true 
        AND (termination_date IS NULL OR termination_date >= p_period_start)
    LOOP
        -- Reset variables
        v_basic := 0;
        v_ot_hours := 0;
        v_ot_amount := 0;
        v_absent_days := 0;
        v_no_pay_deduction := 0;
        v_total_allowances := 0;
        v_loan_deduction := 0;
        v_epf_employee := 0;
        v_epf_employer := 0;
        v_etf_employer := 0;
        v_gross := 0;
        v_total_deductions := 0;
        v_net := 0;
        
        -- Get Salary Structure
        SELECT * INTO v_sal FROM salary_structures 
        WHERE employee_id = v_emp.id AND is_current = true LIMIT 1;
        
        IF v_sal.id IS NOT NULL THEN
            v_basic := v_sal.basic_salary;
            
            -- Calculate Rates
            -- Standard: Daily = Basic / 30, Hourly = Basic / 240 (or 200 depending on policy, default 240)
            -- If hourly_rate is set in structure, use it.
            IF v_sal.hourly_rate > 0 THEN
                v_hourly_rate := v_sal.hourly_rate;
            ELSE
                v_hourly_rate := v_basic / 240; -- Standard estimation
            END IF;
            
            v_daily_rate := v_basic / 30; -- Standard estimation
            
            -- A. Calculate Overtime
            -- Sum overtime hours from attendance_records for the period
            SELECT COALESCE(SUM(overtime_hours), 0) INTO v_ot_hours
            FROM attendance_records
            WHERE employee_id = v_emp.id 
            AND attendance_date BETWEEN p_period_start AND p_period_end;
            
            v_ot_amount := v_ot_hours * v_hourly_rate * COALESCE(v_sal.overtime_rate_multiplier, 1.5);
            
            -- B. Calculate No-Pay (Absent Days)
            SELECT COUNT(*) INTO v_absent_days
            FROM attendance_records
            WHERE employee_id = v_emp.id 
            AND attendance_date BETWEEN p_period_start AND p_period_end
            AND status IN ('absent', 'unpaid_leave');
            
            -- Alternatively check leave_requests for unpaid leave
            
            v_no_pay_deduction := v_absent_days * v_daily_rate;
            
            -- C. Add Fixed Allowances
            v_total_allowances := COALESCE(v_sal.housing_allowance, 0) + 
                                  COALESCE(v_sal.transport_allowance, 0) + 
                                  COALESCE(v_sal.meal_allowance, 0) + 
                                  COALESCE(v_sal.other_allowances, 0);
            
            -- D. DEDUCTIONS: Loans
            -- Check for active loans
            SELECT COALESCE(SUM(
                LEAST(monthly_installment, remaining_balance)
            ), 0) INTO v_loan_deduction
            FROM employee_loans
            WHERE employee_id = v_emp.id 
            AND status = 'active'
            AND (expected_completion_date IS NULL OR expected_completion_date >= p_period_start);
            
            -- E. EPF & ETF
            -- Base for EPF is usually Basic Salary (sometimes + fixed allowances). 
            -- We will use Basic Salary for this engine as per standard request.
            v_epf_base := v_basic; 
            
            v_epf_employee := v_epf_base * (COALESCE(v_sal.epf_employee_pct, 8) / 100);
            v_epf_employer := v_epf_base * (COALESCE(v_sal.epf_employer_pct, 12) / 100);
            v_etf_employer := v_epf_base * (COALESCE(v_sal.etf_employer_pct, 3) / 100);
            
            -- Calculation for Gross & Net
            -- Gross = Basic + Allowances + OT - NoPay
            v_gross := v_basic + v_total_allowances + v_ot_amount - v_no_pay_deduction;
            
            -- Total Deductions (Employee Side) = EPF (Emp) + Loans + Other Deductions (structure)
            v_total_deductions := v_epf_employee + v_loan_deduction + COALESCE(v_sal.other_deductions, 0);
            
            v_net := v_gross - v_total_deductions;
            
            -- Insert Payslip
            INSERT INTO payslips (
                company_id, branch_id, payroll_run_id, employee_id,
                basic_salary, 
                housing_allowance, transport_allowance, meal_allowance, other_allowances, total_allowances,
                overtime_hours, overtime_amount,
                gross_salary,
                epf_employee, epf_employer, etf_employer,
                loan_deduction, other_deductions, total_deductions,
                net_salary,
                days_absent, days_worked, -- can calculate worked days too
                payment_status
            ) VALUES (
                p_company_id, p_branch_id, v_run_id, v_emp.id,
                ROUND(v_basic, 2),
                COALESCE(v_sal.housing_allowance, 0), COALESCE(v_sal.transport_allowance, 0), COALESCE(v_sal.meal_allowance, 0), COALESCE(v_sal.other_allowances, 0), ROUND(v_total_allowances, 2),
                ROUND(v_ot_hours, 2), ROUND(v_ot_amount, 2),
                ROUND(v_gross, 2),
                ROUND(v_epf_employee, 2), ROUND(v_epf_employer, 2), ROUND(v_etf_employer, 2),
                ROUND(v_loan_deduction, 2), COALESCE(v_sal.other_deductions, 0), ROUND(v_total_deductions, 2),
                ROUND(v_net, 2),
                v_absent_days, 0, -- days worked logic to be added if needed
                'pending'
            );
            
            -- Accumulate Run Totals
            v_run_total_gross := v_run_total_gross + v_gross;
            v_run_total_net := v_run_total_net + v_net;
            v_run_emp_count := v_run_emp_count + 1;
            
        END IF;
    END LOOP;

    -- 4. Finalize Run Report
    UPDATE payroll_runs
    SET 
        total_gross = ROUND(v_run_total_gross, 2),
        total_net = ROUND(v_run_total_net, 2),
        employee_count = v_run_emp_count,
        status = 'processed', -- Marker that generation is done
        updated_at = now()
    WHERE id = v_run_id;

    RETURN v_run_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Approve/Lock Payroll Function
CREATE OR REPLACE FUNCTION approve_payroll_run(
    p_run_id UUID,
    p_approved_by UUID
) RETURNS VOID AS $$
DECLARE
    v_payslip RECORD;
    v_loan_installment NUMERIC;
BEGIN
    -- Update Payroll Run Status
    UPDATE payroll_runs 
    SET status = 'approved', approved_by = p_approved_by, approved_at = now()
    WHERE id = p_run_id AND status = 'processed';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payroll run not found or not in processed state.';
    END IF;

    -- Deduct Loans
    FOR v_payslip IN SELECT * FROM payslips WHERE payroll_run_id = p_run_id AND loan_deduction > 0
    LOOP
        -- Find active loan(s) and deduct
        -- This logic is simplified; if multiple loans exist, we deduct from them in order or proportionally.
        -- For robust implementation, we might need a `payslip_loan_details` table. 
        -- Here we assume single active loan per employee for simplicity or just deduct from the first active found.
        
        DECLARE
            v_remaining_deduction NUMERIC := v_payslip.loan_deduction;
            v_loan RECORD;
        BEGIN
            FOR v_loan IN 
                SELECT * FROM employee_loans 
                WHERE employee_id = v_payslip.employee_id AND status = 'active'
                ORDER BY created_at ASC
            LOOP
                IF v_remaining_deduction <= 0 THEN EXIT; END IF;
                
                -- Calculate how much to deduct from this loan
                v_loan_installment := LEAST(v_remaining_deduction, v_loan.remaining_balance);
                
                -- Update Loan
                UPDATE employee_loans
                SET 
                    total_paid = total_paid + v_loan_installment,
                    remaining_balance = remaining_balance - v_loan_installment,
                    status = CASE WHEN (remaining_balance - v_loan_installment) <= 0 THEN 'completed' ELSE 'active' END,
                    updated_at = now()
                WHERE id = v_loan.id;
                
                v_remaining_deduction := v_remaining_deduction - v_loan_installment;
            END LOOP;
        END;
    END LOOP;
    
    -- Mark payslips as 'ready' (status is 'pending' payment essentially)
    -- They are already pending.
END;
$$ LANGUAGE plpgsql;
