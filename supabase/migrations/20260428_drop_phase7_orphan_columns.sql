-- =================================================================
-- 20260428_drop_phase7_orphan_columns.sql
--
-- Phase 7 added two columns to talent_profiles that no canonical code
-- ever read or wrote:
--   - is_available             (canonical app uses profiles.available)
--   - has_accepted_first_job   (canonical gate in lib/stripe/gate.ts
--                               does not check first-job state)
-- Both are dead capacity. Drop them so the schema reflects what the
-- code actually uses.
-- =================================================================

ALTER TABLE public.talent_profiles
  DROP COLUMN IF EXISTS is_available,
  DROP COLUMN IF EXISTS has_accepted_first_job;
