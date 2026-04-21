-- =============================================================================
-- Client onboarding wizard support: ensures client_profiles has the columns
-- the wizard writes to. These columns already exist in the live DB (added
-- by earlier admin-tooling work) but are missing from schema.sql, so this
-- migration keeps a fresh setup in sync.
--
-- Run in Supabase Dashboard → SQL Editor → New Query → Run.
-- Safe to run multiple times.
-- =============================================================================

alter table public.client_profiles
  add column if not exists website text,
  add column if not exists billing_email text,
  add column if not exists logo_url text;

-- Storage bucket for client logos. The wizard uploads to {userId}/logo.{ext}.
-- If the bucket already exists this is a no-op. Public reads are fine for
-- logos that show up on call sheets and invoices.
insert into storage.buckets (id, name, public)
  values ('client-logos', 'client-logos', true)
  on conflict (id) do nothing;

-- Allow authenticated users to upload their own logo (path prefix = their uid)
-- and the public to read logos.
drop policy if exists "client_logos_owner_write" on storage.objects;
create policy "client_logos_owner_write" on storage.objects
  for all
  using (bucket_id = 'client-logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'client-logos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "client_logos_public_read" on storage.objects;
create policy "client_logos_public_read" on storage.objects
  for select
  using (bucket_id = 'client-logos');
