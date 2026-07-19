CREATE TABLE IF NOT EXISTS public.print_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  printer_id    UUID NOT NULL REFERENCES public.device_printers(id) ON DELETE CASCADE,
  job_type      TEXT NOT NULL CHECK (job_type IN ('receipt', 'kitchen_ticket', 'report', 'label', 'other')),
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'printing', 'printed', 'failed', 'cancelled')),
  payload       JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  retry_count   INTEGER DEFAULT 0,
  created_by    UUID REFERENCES auth.users(id),
  printed_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_branch ON public.print_jobs(branch_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_printer ON public.print_jobs(printer_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON public.print_jobs(status);

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "print_jobs_branch_isolation" ON public.print_jobs;
CREATE POLICY "print_jobs_branch_isolation" ON public.print_jobs
  USING (branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  ));

-- Reload the schema cache to avoid 404 errors
NOTIFY pgrst, 'reload schema';
