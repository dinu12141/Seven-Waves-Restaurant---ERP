DO $$
DECLARE
    v_rec RECORD;
BEGIN
    RAISE NOTICE '--- SHIFT ASSIGNMENTS TODAY ---';
    FOR v_rec IN (
        SELECT sa.*, p.full_name, r.name as role_name
        FROM shift_assignments sa
        JOIN employees e ON e.id = sa.employee_id
        JOIN profiles p ON p.id = e.profile_id
        JOIN user_roles ur ON ur.user_id = p.id
        JOIN roles r ON r.id = ur.role_id
        WHERE sa.assignment_date = CURRENT_DATE
    ) LOOP
        RAISE NOTICE 'User: %, Role: %, Branch: %, Status: %', 
            v_rec.full_name, v_rec.role_name, v_rec.branch_id, v_rec.status;
    END LOOP;
END $$;
