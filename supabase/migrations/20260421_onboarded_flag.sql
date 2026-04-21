-- =============================================================================
-- Onboarding wizard support: adds profiles.onboarded flag.
-- Run in Supabase Dashboard → SQL Editor → New Query → Run.
-- Safe to run multiple times.
-- =============================================================================

alter table public.profiles
  add column if not exists onboarded boolean not null default false;

-- Backfill: any profile that existed before the wizard shipped has already
-- completed whatever onboarding was in place at the time. Mark them true so
-- returning users aren't pushed into the wizard.
update public.profiles
  set onboarded = true
  where onboarded = false
    and created_at < now();
