# P0 Apply Guide — Enterprise Hardening

Apply these in the **Supabase Dashboard → SQL Editor** (project `clykwuzajtwvwuavmtzs`),
in this exact order. Each file is idempotent / re-runnable. After each, record it in
`applied_migrations`.

> ⚠️ **Deploy coupling:** the client code in this same commit (`orderStore.js`,
> `finance-voucher.service.js`) now calls the new RPCs below. Apply the SQL **before or
> together with** deploying the frontend, or POS order creation / voucher posting will error.

## Order of application

| # | File | Closes | Notes |
|---|------|--------|-------|
| 1 | `erp_security_lockdown.sql` | baseline | helpers (`is_admin()` etc.) — apply if not already |
| 2 | `fix_missing_rls_policies.sql` | #44 (CRITICAL) | 19-section RLS hardening |
| 3 | `fix_rls_missing_tables.sql` | #44 (CRITICAL) | RLS for 15 unprotected base tables |
| 4 | `security_lockdown_apply.sql` | #44 delta | variant price validation, anon-write revoke |
| 5 | `fix_login_audit_logs_rls.sql` | #45 (HIGH) | admin-only SELECT, no forging, no GRANT ALL |
| 6 | `p0_enterprise_hardening.sql` | #48/#49/#50/#51/#54/#56 | atomic RPCs + locks |

After all six:

```sql
INSERT INTO public.applied_migrations (filename, notes) VALUES
  ('fix_missing_rls_policies.sql',  'P0 #44 — 19-section RLS hardening'),
  ('fix_rls_missing_tables.sql',    'P0 #44 — RLS for 15 base tables'),
  ('security_lockdown_apply.sql',   'P0 #44 — lockdown delta'),
  ('fix_login_audit_logs_rls.sql',  'P0 #45 — login_audit_logs lockdown'),
  ('p0_enterprise_hardening.sql',   'P0 #48/#49/#50/#51/#54/#56 — atomic money paths + locks')
ON CONFLICT (filename) DO NOTHING;
```

## Verification (run after applying — every row must return the expected result)

```sql
-- #44: RLS must be ENABLED on the previously-unprotected tables
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('user_roles','payments','salary','companies','branches',
                  'journal_entries','journal_lines','order_items','kot_tickets')
ORDER BY relname;
-- expect relrowsecurity = true for every row

-- #44/#45: policies exist and login_audit_logs SELECT is admin-only
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'login_audit_logs'
ORDER BY policyname;
-- expect lal_select_admin (SELECT), lal_insert_self, lal_insert_anon_failed

-- #48/#49/#50/#51/#54: the new RPCs are present
SELECT proname FROM pg_proc
WHERE proname IN ('pos_create_order_with_items','post_finance_voucher','next_voucher_no')
ORDER BY proname;
-- expect all three

-- Sanity: no anon GRANT ALL left on login_audit_logs
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'login_audit_logs'
ORDER BY grantee, privilege_type;
-- expect anon = INSERT only; authenticated = SELECT, INSERT
```

## What still needs a human decision (not auto-applied)

- **Rate limiting (#46)** — add a Postgres token-bucket check to sensitive RPCs / edge
  functions (generalise the existing `check_qr_rate_limit`). Design in
  `docs/enterprise/01_SECURITY_ACCESS_CONTROL.md`.
- **Secrets in git history (#13/#24) + service-role key under `VITE_` (#39)** — rotate the
  Supabase keys and Google Maps key, move service-role usage out of any `VITE_`-prefixed var.
  Key rotation must be done by an owner in the Supabase dashboard.
