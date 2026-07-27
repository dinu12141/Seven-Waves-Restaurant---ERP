-- ═══════════════════════════════════════════════════════════════════════════
-- FIX — admin_create_user 409 (duplicate email) + soft-deleted reclaim
-- Seven Waves Restaurant ERP
--
-- Symptom: creating a user returns HTTP 409. Root cause: the email already
-- exists in auth.users, so the raw INSERT hits a unique_violation which
-- PostgREST surfaces as an opaque 409 — the admin has no idea why.
--
-- Fixes:
--   1) Clear, friendly errors instead of a raw 409:
--        · empty email      → ask for an email
--        · email in use by a LIVE account → "already registered"
--   2) Reclaim path: if the email belongs to a SOFT-DELETED profile
--      (deleted_at set), reactivate that same auth user instead of failing —
--      resets password/name/phone/code and clears the delete flag.
--   3) Keeps the original create path for brand-new emails.
--
-- Idempotent / re-runnable. Applied 2026-07-25.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email text,
    p_password text,
    p_full_name text DEFAULT ''::text,
    p_phone text DEFAULT ''::text,
    p_user_code text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  new_user_id   UUID;
  v_email       text := lower(trim(p_email));
  v_existing_id UUID;
  v_is_deleted  boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'Unauthorized: Only active users can create accounts';
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'An email address is required to create a login account.';
  END IF;

  -- Is this email already known?
  SELECT au.id INTO v_existing_id FROM auth.users au WHERE lower(au.email) = v_email LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    SELECT COALESCE(pr.deleted_at IS NOT NULL, false) INTO v_is_deleted
      FROM profiles pr WHERE pr.id = v_existing_id;

    IF NOT COALESCE(v_is_deleted, false) THEN
      -- Live account already uses this email.
      RAISE EXCEPTION 'A user with the email % already exists.', p_email
        USING ERRCODE = 'unique_violation';
    END IF;

    -- RECLAIM a soft-deleted account: reset credentials and clear the delete flag.
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at  = COALESCE(email_confirmed_at, NOW()),
           raw_user_meta_data  = jsonb_build_object('full_name', p_full_name, 'phone', p_phone),
           updated_at          = NOW()
     WHERE id = v_existing_id;

    UPDATE public.profiles
       SET full_name  = p_full_name,
           phone      = NULLIF(p_phone, ''),
           user_code  = COALESCE(p_user_code, user_code),
           is_active  = true,
           deleted_at = NULL,
           updated_at = NOW()
     WHERE id = v_existing_id;

    RETURN v_existing_id;
  END IF;

  -- Brand-new email → create auth user + identity + profile.
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
    v_email,
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
    gen_random_uuid(), new_user_id, v_email,
    jsonb_build_object('sub', new_user_id::text, 'email', v_email),
    'email', NOW(), NOW(), NOW()
  );

  INSERT INTO public.profiles (id, full_name, email, phone, user_code, is_active, created_at, updated_at)
  VALUES (
    new_user_id, p_full_name, v_email,
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
$function$;
