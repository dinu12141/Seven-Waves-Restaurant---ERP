-- =====================================================================
-- #115/#116 follow-up (Option A) — allow MANAGERS to write attendance &
-- leave within their branch scope, aligning RLS with the hr.attendance.*
-- permission (admin+hr+manager) and the SECURITY DEFINER RPC authz
-- (fn_mark_absentees / fn_apply_leave_attendance already authorize managers).
--
-- Mirrors the existing ar_hr / lr_hr policies but for is_manager().
-- Apply ONLY on PM confirmation of Option A.
-- =====================================================================

-- attendance_records: managers may write within their branch scope
DROP POLICY IF EXISTS ar_manager ON public.attendance_records;
CREATE POLICY ar_manager ON public.attendance_records
  FOR ALL
  USING (is_manager() AND branch_id = ANY (auth_branch_ids()))
  WITH CHECK (is_manager() AND branch_id = ANY (auth_branch_ids()));

-- leave_requests: managers may create/approve within their branch scope
DROP POLICY IF EXISTS lr_manager ON public.leave_requests;
CREATE POLICY lr_manager ON public.leave_requests
  FOR ALL
  USING (is_manager() AND branch_id = ANY (auth_branch_ids()))
  WITH CHECK (is_manager() AND branch_id = ANY (auth_branch_ids()));
