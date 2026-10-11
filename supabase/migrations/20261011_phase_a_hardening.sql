-- Phase A production hardening (11 Oct 2026). Applied to the live DB via
-- Supabase MCP in the same round; kept here so the repo stays the single
-- source of truth.

-- 1. Rate floor locked at $300/day (decision: 11 Oct 2026).
--    day_rate_cents already has talent_day_rate_min >= 30000; this adds
--    the matching constraint on rate_floor_cents. Live min was 35000.
ALTER TABLE public.talent_profiles
  ADD CONSTRAINT talent_rate_floor_min
  CHECK (rate_floor_cents IS NULL OR rate_floor_cents >= 30000);

-- 2. Idempotency backstop for auto-invoice-on-wrap: at most one non-void
--    invoice per job. Verified zero duplicates before applying.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_active_per_job
  ON public.invoices (job_id)
  WHERE status <> 'void' AND job_id IS NOT NULL;

-- 3. Clients may edit their own draft/submitted jobs but may not move
--    them into crewing/confirmed/wrapped/cancelled themselves — status
--    transitions beyond draft/submitted are admin-only.
ALTER POLICY client_update_own_draft ON public.jobs
  WITH CHECK (
    (client_id = auth.uid())
    AND (status = ANY (ARRAY['draft'::text, 'submitted'::text]))
  );
