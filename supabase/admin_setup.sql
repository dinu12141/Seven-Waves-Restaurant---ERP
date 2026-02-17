-- =====================================================
-- ADMIN USER SETUP SCRIPT
-- =====================================================
-- Run this AFTER creating the admin user via Supabase Dashboard
-- 
-- Admin Credentials:
-- Email: admin@sevenwaves.lk
-- Password: Admin@123456
--
-- Instructions:
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Click "Add User" → "Create new user"
-- 3. Enter email: admin@sevenwaves.lk
-- 4. Enter password: Admin@123456
-- 5. Click "Create user"
-- 6. Copy the user UUID
-- 7. Replace 'YOUR_USER_UUID_HERE' below with the actual UUID
-- 8. Run this script
-- =====================================================

-- Replace this with actual user ID from auth.users after creation
DO $$
DECLARE
    v_admin_user_id UUID;
    v_admin_role_id UUID;
    v_company_id UUID := '5c7ff29c-418a-461a-9624-3667375c2af4';
    v_branch_id UUID := '340efb20-513a-4d99-b1e7-f32f938e31a8';
BEGIN
    -- 1. Get the admin user ID
    SELECT id INTO v_admin_user_id 
    FROM auth.users 
    WHERE email = 'admin@sevenwaves.lk';

    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Admin user not found. Please create user with email admin@sevenwaves.lk in Supabase Dashboard first';
    END IF;

    -- 2. Get Admin Role ID (Dynamic Lookup)
    SELECT id INTO v_admin_role_id FROM roles WHERE name = 'admin';
    
    IF v_admin_role_id IS NULL THEN
        RAISE EXCEPTION 'Role "admin" not found. Please run schema.sql to seed roles.';
    END IF;

    -- 3. Ensure Company Exists
    INSERT INTO companies (id, name, email)
    VALUES (v_company_id, 'Seven Waves', 'admin@sevenwaves.lk')
    ON CONFLICT (id) DO NOTHING;

    -- 4. Ensure Branch Exists
    INSERT INTO branches (id, company_id, name, is_main, is_active)
    VALUES (v_branch_id, v_company_id, 'Main Branch', true, true)
    ON CONFLICT (id) DO NOTHING;

    -- 5. Create profile for admin
    INSERT INTO profiles (id, full_name, email, phone, is_active)
    VALUES (
        v_admin_user_id,
        'System Administrator',
        'admin@sevenwaves.lk',
        '+94771234567',
        true
    )
    ON CONFLICT (id) DO UPDATE 
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone;

    -- 6. Assign admin role
    INSERT INTO user_roles (user_id, role_id)
    VALUES (v_admin_user_id, v_admin_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    -- 7. Assign to main branch
    INSERT INTO user_branches (user_id, branch_id, is_home_branch)
    VALUES (v_admin_user_id, v_branch_id, true)
    ON CONFLICT (user_id, branch_id) DO UPDATE
    SET is_home_branch = EXCLUDED.is_home_branch;

    RAISE NOTICE 'Admin user setup completed for: %', v_admin_user_id;
END $$;
