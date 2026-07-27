-- ═══════════════════════════════════════════════════════════════════════════
-- #98 (part) — Monthly sales RPC + reporting-MV refresh cron
-- Seven Waves Restaurant ERP  |  unblocks DevOps #100 FinanceDashboard chart
--
-- Builds on supabase/critical_fix_03_reporting_engine.sql (mv_daily_sales_summary,
-- refresh_reporting_views, fn_rpt_branch_sales). Two additions:
--   1. fn_rpt_monthly_sales(branch, start, end) — RLS-safe monthly revenue
--      buckets from the MV (fn_rpt_branch_sales only returns ONE aggregate; the
--      FinanceDashboard 6-month chart needs per-month rows). Same auth/branch
--      isolation gate as fn_rpt_branch_sales.
--   2. refresh_reporting_views_cron() + pg_cron schedule — keeps the MVs fresh
--      without a client call. The existing refresh_reporting_views() gates on
--      is_admin()/is_manager()/is_finance() (auth.uid()) which is NULL under
--      cron, so cron needs an ungated variant that runs as the job owner.
--
-- Idempotent / re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Monthly sales buckets (RLS-safe, company-wide OR single-branch) ──────
-- p_branch_id NULL  → aggregate across ALL branches the caller can see
--                     (auth_branch_ids()) — matches the FinanceDashboard's own
--                     RLS/company scope (admin/finance = every assigned branch).
-- p_branch_id set   → that one branch, with an isolation guard.
CREATE OR REPLACE FUNCTION public.fn_rpt_monthly_sales(
    p_branch_id  UUID DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date   DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_branches UUID[] := auth_branch_ids();
BEGIN
    IF NOT (is_admin() OR is_manager() OR is_finance()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Single-branch request: enforce branch isolation for non-admins.
    IF p_branch_id IS NOT NULL
       AND NOT is_admin()
       AND NOT (p_branch_id = ANY(v_branches)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied for this branch');
    END IF;

    RETURN jsonb_build_object(
        'success',   true,
        'branch_id', p_branch_id,              -- NULL == all visible branches
        'scope',     CASE WHEN p_branch_id IS NULL THEN 'all_visible' ELSE 'branch' END,
        'period',    jsonb_build_object('start', p_start_date, 'end', p_end_date),
        'months', COALESCE((
            SELECT jsonb_agg(m ORDER BY m->>'month')
            FROM (
                SELECT jsonb_build_object(
                    'month',             to_char(date_trunc('month', sale_date), 'YYYY-MM'),
                    'total_orders',      COALESCE(SUM(total_orders), 0),
                    'paid_orders',       COALESCE(SUM(paid_orders), 0),
                    'gross_sales',       COALESCE(SUM(gross_sales), 0),
                    'discounts',         COALESCE(SUM(total_discounts), 0),
                    'tax',               COALESCE(SUM(total_tax), 0),
                    'net_revenue',       COALESCE(SUM(net_revenue), 0),
                    'collected_revenue', COALESCE(SUM(collected_revenue), 0),
                    'refunds',           COALESCE(SUM(total_refunds), 0)
                ) AS m
                FROM mv_daily_sales_summary
                WHERE (
                        -- all branches the caller is assigned to (== dashboard's
                        -- own RLS scope; never exceeds assignment, no cross-company leak) …
                        (p_branch_id IS NULL AND branch_id = ANY(v_branches))
                        -- … or a single requested branch.
                     OR (p_branch_id IS NOT NULL AND branch_id = p_branch_id)
                      )
                  AND (p_start_date IS NULL OR sale_date >= p_start_date)
                  AND (p_end_date   IS NULL OR sale_date <= p_end_date)
                GROUP BY date_trunc('month', sale_date)
            ) sub
        ), '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_rpt_monthly_sales(UUID, DATE, DATE) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_rpt_monthly_sales(UUID, DATE, DATE) TO authenticated;
COMMENT ON FUNCTION public.fn_rpt_monthly_sales(UUID, DATE, DATE) IS
  '#98 — RLS-safe monthly revenue buckets from mv_daily_sales_summary for the '
  'FinanceDashboard 6-month chart. p_branch_id NULL = all branches the caller '
  'can see (company scope for admins); set = single branch (isolation-guarded). '
  'Revenue only (the MV has no expense data — expenses stay on expense_entries scan).';

-- ── 2) Cron-callable refresh (no auth.uid() gate — runs as job owner) ───────
CREATE OR REPLACE FUNCTION public.refresh_reporting_views_cron()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_start TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- CONCURRENTLY needs the unique indexes created in critical_fix_03.
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_sales_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_sales;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_inventory_valuation;

    RETURN jsonb_build_object('success', true, 'duration_ms',
        EXTRACT(MILLISECOND FROM clock_timestamp() - v_start));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Never grant to app roles — this is the un-gated cron path only.
REVOKE ALL ON FUNCTION public.refresh_reporting_views_cron() FROM public, anon, authenticated;
COMMENT ON FUNCTION public.refresh_reporting_views_cron() IS
  '#98 — ungated MV refresh for pg_cron only (auth.uid() is NULL under cron). '
  'Not granted to app roles; clients use refresh_reporting_views() (RBAC-gated).';

-- ── 3) Schedule the refresh via pg_cron (every 30 min) ──────────────────────
-- Guarded: only schedules if the pg_cron extension is available. On Supabase,
-- enable pg_cron once from Dashboard → Database → Extensions (or the CREATE
-- EXTENSION below if your role may create it), then re-run this file.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron;

        -- Remove any prior copy of this job so re-running is idempotent.
        PERFORM cron.unschedule(jobid)
          FROM cron.job WHERE jobname = 'refresh-reporting-views';

        PERFORM cron.schedule(
            'refresh-reporting-views',
            '*/30 * * * *',
            $cron$ SELECT public.refresh_reporting_views_cron(); $cron$
        );
        RAISE NOTICE 'pg_cron job "refresh-reporting-views" scheduled every 30 min.';
    ELSE
        RAISE NOTICE 'pg_cron not available — enable it (Dashboard → Extensions) then re-run to schedule MV refresh. fn_rpt_monthly_sales still works without cron.';
    END IF;
END $$;
