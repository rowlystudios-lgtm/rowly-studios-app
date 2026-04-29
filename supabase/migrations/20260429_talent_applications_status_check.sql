-- =================================================================
-- 20260429_talent_applications_status_check.sql
--
-- talent_applications.status had no CHECK constraint. Phase 9 Fix 1
-- introduces a fourth status, 'dismissed', via the admin dashboard's
-- new applications widget (X button → dismissApplication action).
-- Lock the column to the four canonical values so any future caller
-- writing a typo / bad string fails fast at the DB layer.
-- =================================================================

ALTER TABLE public.talent_applications
  DROP CONSTRAINT IF EXISTS talent_applications_status_check;

ALTER TABLE public.talent_applications
  ADD CONSTRAINT talent_applications_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'dismissed'));
