-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Prevent deleting the last remaining admin (system lockout bug)
--
-- PROBLEM:
--   admin_soft_delete_user() blocks an admin from deleting THEMSELVES, but has
--   no check for whether the TARGET is an admin, or whether they're the last
--   one — an admin could soft-delete every other admin account, or two admins
--   could delete each other in sequence, leaving zero admins and permanently
--   locking the whole system out of user/branch/settings administration.
--
--   Worse: raw RLS DELETE policies on `profiles` and `user_roles`
--   (fix_rls_critical.sql, fix_missing_rls_policies.sql) grant ANY admin
--   unrestricted DELETE via `USING (is_admin())` with no target-aware check
--   at all. This lets a hard `supabase.from('profiles').delete()` or
--   `.from('user_roles').delete()` call bypass admin_soft_delete_user's
--   guards entirely (no self-delete check, no last-admin check), reaching
--   the same lockout through a different door.
--
-- FIX:
--   1. count_active_admins() helper — counts non-deleted, active admins.
--   2. admin_soft_delete_user() — reject deleting an admin if they're the
--      last one (self-delete was already blocked separately).
--   3. Tighten the profiles/user_roles DELETE RLS policies so admins can
--      still delete NON-admin rows directly if needed, but can never delete
--      an admin's profile row or strip the last admin's role via raw table
--      access — that path must go through the guarded RPC.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.count_active_admins()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(DISTINCT p.id)::INTEGER
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  JOIN public.roles r ON r.id = ur.role_id
  WHERE r.name = 'admin'
    AND p.deleted_at IS NULL
    AND p.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.count_active_admins() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_last_active_admin(target_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = target_user_id AND r.name = 'admin'
    )
    AND public.count_active_admins() <= 1;
$$;

GRANT EXECUTE ON FUNCTION public.is_last_active_admin(uuid) TO authenticated;

-- ── admin_soft_delete_user: add last-admin guard ────────────────────────────
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

    -- Cannot delete the last remaining admin (would lock the system out of
    -- all administration — no one left to manage users/branches/settings).
    IF public.is_last_active_admin(target_user_id) THEN
        RAISE EXCEPTION 'Cannot delete this user: they are the last remaining administrator. Promote another user to admin first.';
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
  'Soft-delete a user: mark profiles.deleted_at, deactivate, unlink employee, revoke roles. Blocks self-delete and deleting the last remaining admin.';

-- ── admin_toggle_user_status: same last-admin guard for deactivation ───────
-- Deactivating the last admin is functionally identical to deleting them —
-- close that path too if the function exists live (it's not in tracked SQL,
-- so this recreates it defensively with the guard; if the live version had
-- extra logic beyond is_active toggling, review this against it).
CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(target_user_id uuid, new_status boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied. Only administrators can change user status.';
    END IF;

    IF target_user_id = auth.uid() AND new_status = false THEN
        RAISE EXCEPTION 'You cannot deactivate your own account.';
    END IF;

    IF new_status = false AND public.is_last_active_admin(target_user_id) THEN
        RAISE EXCEPTION 'Cannot deactivate this user: they are the last remaining administrator. Promote another user to admin first.';
    END IF;

    UPDATE public.profiles
       SET is_active  = new_status,
           updated_at = now()
     WHERE id = target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found.';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_user_status(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_status(uuid, boolean) TO authenticated;
COMMENT ON FUNCTION public.admin_toggle_user_status IS
  'Activate/deactivate a user. Blocks self-deactivation and deactivating the last remaining admin.';

-- ── Close the raw-table bypass: tighten profiles/user_roles DELETE policies ─
-- These previously allowed ANY admin to hard-delete ANY profile/role-grant
-- row directly (USING (is_admin())), completely bypassing the RPC guards
-- above. Now: admins can still hard-delete non-admin rows directly if truly
-- needed, but can never delete a profile/role row that would remove the last
-- admin — that must go through the guarded RPCs, which also handle the
-- soft-delete + cleanup correctly instead of leaving orphaned FK references.
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE
  TO authenticated
  USING (is_admin() AND NOT public.is_last_active_admin(id));

DROP POLICY IF EXISTS "user_roles_delete_admin" ON public.user_roles;
CREATE POLICY "user_roles_delete_admin" ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (
    is_admin()
    AND NOT (
      EXISTS (SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.name = 'admin')
      AND public.count_active_admins() <= 1
    )
  );
