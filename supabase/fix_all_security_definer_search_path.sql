-- ═══════════════════════════════════════════════════════════════════
-- FIX: Bulk patch ALL SECURITY DEFINER functions missing
--      SET search_path = public in the public schema.
-- Seven Waves ERP — Security hardening (VULN-004)
-- Applied: 2026-07-17
--
-- PROBLEM: SECURITY DEFINER functions without SET search_path = public
-- are vulnerable to search_path injection. An attacker with CREATE SCHEMA
-- permission can shadow trusted objects and have them executed with
-- elevated (definer) privileges when triggers fire.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → Run this script
--
-- WHAT THIS DOES:
--   Uses a PL/pgSQL DO block to iterate all matching functions,
--   reconstruct their DDL with pg_get_functiondef(), and re-CREATE
--   them with the missing SET search_path = public clause added.
-- ═══════════════════════════════════════════════════════════════════

-- ── Preview (optional — uncomment to see what will be patched) ─────
/*
SELECT
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS args,
    l.lanname AS lang
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l  ON l.oid = p.prolang
WHERE p.prosecdef = true
  AND n.nspname = 'public'
  AND l.lanname IN ('plpgsql', 'sql')
  AND NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path%'
  )
ORDER BY p.proname;
*/

-- ── Bulk patch ────────────────────────────────────────────────────
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
            pg_get_function_arguments(p.oid) AS func_args,
            l.lanname AS func_lang
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l  ON l.oid = p.prolang
        WHERE p.prosecdef = true
          AND n.nspname = 'public'
          AND l.lanname IN ('plpgsql', 'sql')
          AND NOT EXISTS (
              SELECT 1 FROM unnest(p.proconfig) cfg
              WHERE cfg LIKE 'search_path%'
          )
        ORDER BY p.proname
    LOOP
        func_def := pg_get_functiondef(r.oid);

        -- Belt-and-suspenders: skip if search_path already present in source text
        IF func_def ILIKE '%search_path%' THEN
            skipped := skipped + 1;
            CONTINUE;
        END IF;

        -- Strategy: insert SET search_path = public immediately after
        -- SECURITY DEFINER in the function header (before the AS clause).
        -- pg_get_functiondef always produces this structure:
        --   CREATE OR REPLACE FUNCTION ... SECURITY DEFINER
        --   AS $function$ ... $function$
        --   LANGUAGE plpgsql;
        -- We target the SECURITY DEFINER token specifically.
        new_def := regexp_replace(
            func_def,
            '(SECURITY\s+DEFINER)',
            E'SECURITY DEFINER\n    SET search_path = public',
            'i'
        );

        IF new_def = func_def THEN
            -- Pattern didn't match — function body is unusual; skip safely
            RAISE WARNING 'SKIP (no SECURITY DEFINER token found): %.%(%)',
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
-- After running, this should return 0.
SELECT
    count(*) AS remaining_unpatched,
    array_agg(proname ORDER BY proname) AS function_names
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l  ON l.oid = p.prolang
WHERE p.prosecdef = true
  AND n.nspname = 'public'
  AND l.lanname IN ('plpgsql', 'sql')
  AND NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) cfg
      WHERE cfg LIKE 'search_path%'
  );

-- ── Ledger entry ─────────────────────────────────────────────────
INSERT INTO applied_migrations (filename, notes)
VALUES (
    'fix_all_security_definer_search_path.sql',
    'Security VULN-004: bulk SET search_path=public on all SECURITY DEFINER functions via DO block'
)
ON CONFLICT DO NOTHING;
