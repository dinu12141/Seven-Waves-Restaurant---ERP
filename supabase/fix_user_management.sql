-- ============================================================
-- User Management Fixes
-- Applied: 2026-07-20
-- Updated: 2026-07-20 — fix profile trigger phone bug, admin_create_user
--          phone+user_code support, user_code UNIQUE constraint
-- ============================================================

-- 1. Fix handle_new_user trigger to read phone from metadata
--    and use upsert so profile is always fully populated
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'phone', ''), ''),
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name  = COALESCE(EXCLUDED.full_name, profiles.full_name),
    email      = EXCLUDED.email,
    phone      = COALESCE(EXCLUDED.phone, profiles.phone),
    updated_at = NOW()
  WHERE profiles.full_name IS NULL OR profiles.full_name = '';
  RETURN NEW;
END;
$$;

-- 2. Drop old 4-arg overload to prevent PostgREST PGRST203 ambiguity
DROP FUNCTION IF EXISTS public.admin_create_user(TEXT, TEXT, TEXT, TEXT);

-- 3. Recreate admin_create_user with phone in metadata + explicit profile upsert
--    p_user_code is new — optional, defaults NULL, backward compatible
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email      TEXT,
  p_password   TEXT,
  p_full_name  TEXT DEFAULT '',
  p_phone      TEXT DEFAULT '',
  p_user_code  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  new_user_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only active users can create accounts';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'phone', p_phone),
    NOW(), NOW(),
    '', '', '', ''
  )
  RETURNING id INTO new_user_id;

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id, p_email,
    jsonb_build_object('sub', new_user_id::text, 'email', p_email),
    'email', NOW(), NOW(), NOW()
  );

  -- Explicit upsert so phone + user_code are always set in same transaction
  INSERT INTO public.profiles (id, full_name, email, phone, user_code, is_active, created_at, updated_at)
  VALUES (
    new_user_id, p_full_name, p_email,
    NULLIF(p_phone, ''),
    p_user_code,
    true, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name  = EXCLUDED.full_name,
    email      = EXCLUDED.email,
    phone      = COALESCE(EXCLUDED.phone, public.profiles.phone),
    user_code  = COALESCE(EXCLUDED.user_code, public.profiles.user_code),
    is_active  = true,
    updated_at = NOW();

  RETURN new_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 4. Add UNIQUE constraint on user_code (no duplicates exist — safe)
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_code_unique UNIQUE (user_code);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Previously applied: user_code lookup RPC for login flow
-- ============================================================

-- Secure RPC for user_code lookup (callable by anon before auth).
-- Used by signInWithCode in auth.ts instead of the missing login-with-code Edge Function.
-- Only exposes email + is_active + full_name for a given user_code.
CREATE OR REPLACE FUNCTION public.get_email_by_user_code(p_user_code TEXT)
RETURNS TABLE(email TEXT, is_active BOOLEAN, full_name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email, is_active, full_name
  FROM public.profiles
  WHERE user_code = p_user_code
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_user_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_user_code(TEXT) TO authenticated;

-- Ensure profiles.email is populated from auth.users for any rows that may be null
-- (Safe to run repeatedly; only updates rows where email IS NULL)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;
