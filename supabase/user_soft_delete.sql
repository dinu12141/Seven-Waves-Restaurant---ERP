-- ═══════════════════════════════════════════════════════════════════════════
-- User Management — soft-delete support (task #107)
-- Seven Waves Restaurant ERP
--
-- The existing admin_delete_user() does a hard DELETE on auth.users and fails
-- with a foreign_key_violation the moment the user has created any order /
-- invoice / audit row (NO ACTION FKs). Admins asked for a real "delete" that
-- ALWAYS works while preserving history — so we soft-delete: flag the profile
-- deleted, deactivate login, and hide it from the User Management list.
--
-- Idempotent / re-runnable. Applied 2026-07-25.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Soft-delete marker on profiles.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) admin_soft_delete_user — mark deleted + block login, keep all history.
CREATE OR REPLACE FUNCTION public.admin_soft_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Only administrators can delete users.';
    END IF;

    -- Cannot delete yourself (avoids an admin locking themselves out).
    IF target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot delete your own account.';
    END IF;

    -- Flag the profile deleted and disable login.
    UPDATE public.profiles
       SET deleted_at = now(),
           is_active  = false,
           updated_at = now()
     WHERE id = target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found.';
    END IF;

    -- Keep the linked employee record in sync (deactivate, unlink login).
    UPDATE public.employees
       SET is_active = false
     WHERE profile_id = target_user_id;

    -- Revoke all role grants so a re-created auth row can't inherit access.
    DELETE FROM public.user_roles WHERE user_id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_soft_delete_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_user(uuid) TO authenticated;
COMMENT ON FUNCTION public.admin_soft_delete_user(uuid) IS
  'Soft-delete a user: mark profiles.deleted_at, deactivate, unlink employee, revoke roles. Preserves history (task #107).';
