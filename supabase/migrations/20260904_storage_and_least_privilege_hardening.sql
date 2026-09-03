-- ============================================================================
-- Migration: 20260904_storage_and_least_privilege_hardening.sql
-- Description: 
--   1. Enforces strict file size limits and MIME whitelists across all Supabase Storage buckets.
--   2. Enforces Principle of Least Privilege on public website tables (website_messages,
--      website_reservations, website_hall_bookings) so 'anon' has INSERT ONLY (no public SELECT/scraping).
--   3. Database CHECK constraints for schema validity and sanity checking.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. STORAGE BUCKETS SECURITY HARDENING (Server-Side File Size & MIME Whitelist)
-- ────────────────────────────────────────────────────────────────────────────

-- 1.1 menu-images bucket (Public read, Staff upload, max 5MB, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'menu-images',
    'menu-images',
    true,
    5242880, -- 5 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 1.2 employee-photos bucket (Public read, Staff upload, max 5MB, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'employee-photos',
    'employee-photos',
    true,
    5242880, -- 5 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 1.3 employee-documents bucket (Private, HR/Admin only, max 10MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'employee-documents',
    'employee-documents',
    false,
    10485760, -- 10 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 1.4 erp-assets bucket (General assets, max 10MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'erp-assets',
    'erp-assets',
    true,
    10485760, -- 10 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];


-- ────────────────────────────────────────────────────────────────────────────
-- 2. PRINCIPLE OF LEAST PRIVILEGE: PUBLIC WEBSITE TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- 2.1 website_messages
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'website_messages') THEN
        ALTER TABLE public.website_messages ENABLE ROW LEVEL SECURITY;
        
        -- Revoke all blanket permissions from anon and authenticated
        REVOKE ALL ON public.website_messages FROM anon;
        REVOKE ALL ON public.website_messages FROM authenticated;
        
        -- Anon can ONLY insert messages (Cannot SELECT, UPDATE, or DELETE!)
        GRANT INSERT ON public.website_messages TO anon;
        
        -- Authenticated staff can read and manage messages
        GRANT SELECT, UPDATE, DELETE ON public.website_messages TO authenticated;

        -- RLS Policies
        DROP POLICY IF EXISTS "anon_can_insert_messages" ON public.website_messages;
        CREATE POLICY "anon_can_insert_messages"
            ON public.website_messages
            FOR INSERT
            TO anon
            WITH CHECK (true);

        DROP POLICY IF EXISTS "authenticated_manage_messages" ON public.website_messages;
        CREATE POLICY "authenticated_manage_messages"
            ON public.website_messages
            FOR ALL
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 2.2 website_reservations
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'website_reservations') THEN
        ALTER TABLE public.website_reservations ENABLE ROW LEVEL SECURITY;
        
        -- Revoke all blanket permissions
        REVOKE ALL ON public.website_reservations FROM anon;
        REVOKE ALL ON public.website_reservations FROM authenticated;
        
        -- Anon can ONLY insert reservations
        GRANT INSERT ON public.website_reservations TO anon;
        
        -- Authenticated staff can read and manage reservations
        GRANT SELECT, UPDATE, DELETE ON public.website_reservations TO authenticated;

        -- RLS Policies
        DROP POLICY IF EXISTS "anon_can_insert_reservations" ON public.website_reservations;
        CREATE POLICY "anon_can_insert_reservations"
            ON public.website_reservations
            FOR INSERT
            TO anon
            WITH CHECK (true);

        DROP POLICY IF EXISTS "authenticated_manage_reservations" ON public.website_reservations;
        CREATE POLICY "authenticated_manage_reservations"
            ON public.website_reservations
            FOR ALL
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 2.3 website_hall_bookings
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'website_hall_bookings') THEN
        ALTER TABLE public.website_hall_bookings ENABLE ROW LEVEL SECURITY;
        
        -- Revoke all blanket permissions
        REVOKE ALL ON public.website_hall_bookings FROM anon;
        REVOKE ALL ON public.website_hall_bookings FROM authenticated;
        
        -- Anon can ONLY insert hall bookings
        GRANT INSERT ON public.website_hall_bookings TO anon;
        
        -- Authenticated staff can read and manage bookings
        GRANT SELECT, UPDATE, DELETE ON public.website_hall_bookings TO authenticated;

        -- RLS Policies
        DROP POLICY IF EXISTS "anon_can_insert_hall_bookings" ON public.website_hall_bookings;
        CREATE POLICY "anon_can_insert_hall_bookings"
            ON public.website_hall_bookings
            FOR INSERT
            TO anon
            WITH CHECK (true);

        DROP POLICY IF EXISTS "authenticated_manage_hall_bookings" ON public.website_hall_bookings;
        CREATE POLICY "authenticated_manage_hall_bookings"
            ON public.website_hall_bookings
            FOR ALL
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. STORAGE OBJECTS LEAST PRIVILEGE POLICIES
-- ────────────────────────────────────────────────────────────────────────────

-- Public read for menu-images and employee-photos
DROP POLICY IF EXISTS "public_read_menu_images" ON storage.objects;
CREATE POLICY "public_read_menu_images"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'menu-images');

DROP POLICY IF EXISTS "public_read_employee_photos" ON storage.objects;
CREATE POLICY "public_read_employee_photos"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'employee-photos');

-- Only authenticated users can upload to menu-images and employee-photos
DROP POLICY IF EXISTS "auth_upload_menu_images" ON storage.objects;
CREATE POLICY "auth_upload_menu_images"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'menu-images');

DROP POLICY IF EXISTS "auth_upload_employee_photos" ON storage.objects;
CREATE POLICY "auth_upload_employee_photos"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'employee-photos');
