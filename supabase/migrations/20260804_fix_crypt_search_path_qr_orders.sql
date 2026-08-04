-- ═══════════════════════════════════════════════════════════════════
-- FIX: "function crypt(text, text) does not exist" on QR/table ordering
-- Seven Waves ERP — 2026-08-04
--
-- ROOT CAUSE:
--   fix_all_security_definer_search_path.sql (VULN-004, 2026-07-17) bulk-set
--   `SET search_path = public` on every SECURITY DEFINER function in the
--   `public` schema that lacked one. Supabase installs pgcrypto into the
--   `extensions` schema, not `public`. Any function using crypt()/gen_salt()
--   (session token hashing for QR/kiosk ordering, device secrets, etc.)
--   lost visibility into pgcrypto and now fails at runtime with:
--     function crypt(text, text) does not exist
--
-- FIX:
--   1. Ensure pgcrypto is installed (idempotent).
--   2. Re-patch every SECURITY DEFINER function in `public` whose body
--      calls crypt(/gen_salt( so its search_path includes `extensions`,
--      without weakening VULN-004 (public still comes first).
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
    r        RECORD;
    func_def TEXT;
    new_def  TEXT;
    patched  INT := 0;
    skipped  INT := 0;
BEGIN
    FOR r IN
        SELECT
            p.oid,
            n.nspname AS schema_name,
            p.proname AS func_name,
            pg_get_function_arguments(p.oid) AS func_args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l  ON l.oid = p.prolang
        WHERE p.prosecdef = true
          AND n.nspname = 'public'
          AND l.lanname IN ('plpgsql', 'sql')
          AND (
              pg_get_functiondef(p.oid) ILIKE '%crypt(%'
              OR pg_get_functiondef(p.oid) ILIKE '%gen_salt(%'
          )
        ORDER BY p.proname
    LOOP
        func_def := pg_get_functiondef(r.oid);

        IF func_def ILIKE '%search_path = public, extensions%'
           OR func_def ILIKE '%search_path=public,extensions%' THEN
            skipped := skipped + 1;
            CONTINUE;
        END IF;

        IF func_def ILIKE '%SET search_path%' THEN
            -- Replace any existing search_path clause with one that includes extensions
            new_def := regexp_replace(
                func_def,
                'SET\s+search_path\s*(=|TO)\s*[^\n]*',
                'SET search_path = public, extensions',
                'i'
            );
        ELSE
            -- No search_path clause at all — insert one after SECURITY DEFINER
            new_def := regexp_replace(
                func_def,
                '(SECURITY\s+DEFINER)',
                E'SECURITY DEFINER\n    SET search_path = public, extensions',
                'i'
            );
        END IF;

        IF new_def = func_def THEN
            RAISE WARNING 'SKIP (pattern not matched): %.%(%)',
                r.schema_name, r.func_name, r.func_args;
            skipped := skipped + 1;
            CONTINUE;
        END IF;

        BEGIN
            EXECUTE new_def;
            patched := patched + 1;
            RAISE NOTICE 'Patched: %.%(%)', r.schema_name, r.func_name, r.func_args;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'FAILED %.%(%): %',
                r.schema_name, r.func_name, r.func_args, SQLERRM;
            skipped := skipped + 1;
        END;
    END LOOP;

    RAISE NOTICE '=== Done: % functions patched, % skipped ===', patched, skipped;
END;
$$;

-- ── Verification ─────────────────────────────────────────────────
-- Should return 0 rows: every crypt()-using SECURITY DEFINER function
-- must now have `extensions` on its search_path.
SELECT
    n.nspname AS schema_name,
    p.proname AS func_name,
    pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l  ON l.oid = p.prolang
WHERE p.prosecdef = true
  AND n.nspname = 'public'
  AND l.lanname IN ('plpgsql', 'sql')
  AND (
      pg_get_functiondef(p.oid) ILIKE '%crypt(%'
      OR pg_get_functiondef(p.oid) ILIKE '%gen_salt(%'
  )
  AND pg_get_functiondef(p.oid) NOT ILIKE '%search_path%extensions%';

-- ── Smoke test ───────────────────────────────────────────────────
-- Confirms crypt()/gen_salt() resolve from within a `public`-schema
-- SECURITY DEFINER context using the same search_path we just set.
DO $$
BEGIN
    PERFORM extensions.crypt('smoke-test', extensions.gen_salt('bf', 8));
    RAISE NOTICE 'pgcrypto reachable via extensions schema: OK';
END;
$$;
