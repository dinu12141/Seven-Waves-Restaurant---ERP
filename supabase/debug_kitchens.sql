DO $$
DECLARE
    v_rec RECORD;
BEGIN
    RAISE NOTICE '--- KITCHENS ---';
    FOR v_rec IN SELECT id, name, branch_id, is_active FROM kitchens LOOP
        RAISE NOTICE 'ID: %, Name: %, Branch: %, Active: %', v_rec.id, v_rec.name, v_rec.branch_id, v_rec.is_active;
    END LOOP;

    RAISE NOTICE '--- WAREHOUSES ---';
    FOR v_rec IN SELECT id, name, kitchen_id, branch_id FROM warehouses LOOP
        RAISE NOTICE 'ID: %, Name: %, Kitchen: %, Branch: %', v_rec.id, v_rec.name, v_rec.kitchen_id, v_rec.branch_id;
    END LOOP;

    RAISE NOTICE '--- BRANCHES ---';
    FOR v_rec IN SELECT id, name FROM branches LOOP
        RAISE NOTICE 'ID: %, Name: %', v_rec.id, v_rec.name;
    END LOOP;
END $$;
