-- Creates an RPC to securely fetch a manager's email by their employee code
-- Required for POS VOID/FOC dual-login (Email or Code)

CREATE OR REPLACE FUNCTION get_email_by_employee_code(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT u.email INTO v_email
  FROM auth.users u
  JOIN public.employees e ON u.id = e.profile_id
  WHERE e.employee_code = p_code
  LIMIT 1;
  
  RETURN v_email;
END;
$$;
