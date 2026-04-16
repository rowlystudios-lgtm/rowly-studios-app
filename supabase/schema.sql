-- =============================================================================
-- Rowly Studios — Initial Schema (Week 1, Day 1)
-- =============================================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS)
-- =============================================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. PROFILES — one row per user (talent, client, or admin)
-- =============================================================================
-- Linked 1:1 to Supabase auth.users via id
-- The 'role' column determines which side of the app they see.
-- =============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'talent' check (role in ('talent', 'client', 'admin')),
  phone text,
  city text default 'Los Angeles',
  avatar_url text,

  -- Verification status — admins flip this to true after review
  verified boolean not null default false,
  verified_at timestamptz,

  -- For future Notion sync — every row has a stable external id we can match
  notion_page_id text unique,
  external_synced_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_verified_idx on public.profiles(verified);

-- =============================================================================
-- 2. TALENT_PROFILES — extended data for anyone with role='talent'
-- =============================================================================

create table if not exists public.talent_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  department text check (department in ('camera', 'styling', 'glam', 'post', 'production', 'direction', 'other')),
  primary_role text,              -- e.g. "1st AC", "Director of Photography"
  secondary_roles text[],         -- e.g. ["DP"]
  bio text,
  day_rate_cents integer,         -- store money as integer cents to avoid float bugs
  half_day_rate_cents integer,
  showreel_url text,              -- 4:5 video link (Vimeo, YouTube, direct upload)
  equipment text,                 -- freeform "what I own and bring"
  union_eligible boolean default false,
  travel_radius_miles integer,

  notion_page_id text unique,
  external_synced_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent_profiles_dept_idx on public.talent_profiles(department);

-- =============================================================================
-- 3. CLIENT_PROFILES — extended data for role='client'
-- =============================================================================

create table if not exists public.client_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  company_name text not null,
  industry text,                  -- "beauty", "fashion", "tech", etc.
  notes text,                     -- internal admin notes

  notion_page_id text unique,
  external_synced_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 4. JOBS — the central object. Clients create; admins curate; talent book against.
-- =============================================================================

create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  location text,
  start_date date,
  end_date date,
  call_time time,

  status text not null default 'draft' check (status in (
    'draft',        -- client is still filling in
    'submitted',    -- sent to admin for review
    'crewing',      -- admin is assigning talent / talent is being invited
    'confirmed',    -- crew locked, job approved
    'wrapped',      -- shoot complete
    'cancelled'
  )),

  budget_cents integer,           -- internal — not shown to talent
  brief_url text,                 -- link to full brief doc if any

  notion_page_id text unique,
  external_synced_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_client_idx on public.jobs(client_id);
create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists jobs_dates_idx on public.jobs(start_date, end_date);

-- =============================================================================
-- 5. BOOKINGS — talent ↔ job relationship with state machine
-- =============================================================================

create table if not exists public.bookings (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  talent_id uuid not null references public.profiles(id) on delete cascade,
  role_on_job text,               -- "1st AC", "Stylist" — the specific role
  day_rate_cents integer,         -- captured at booking time (may differ from talent's current rate)
  equipment_required text,        -- "Sony FX6 kit, 18-110 zoom, matte box"

  status text not null default 'requested' check (status in (
    'requested',    -- admin/client requested this talent
    'accepted',     -- talent accepted
    'declined',     -- talent declined
    'cancelled',    -- cancelled after acceptance
    'completed'     -- shoot wrapped
  )),

  requested_at timestamptz not null default now(),
  responded_at timestamptz,

  notion_page_id text unique,
  external_synced_at timestamptz,

  unique(job_id, talent_id)       -- can't book same talent twice on same job
);

create index if not exists bookings_job_idx on public.bookings(job_id);
create index if not exists bookings_talent_idx on public.bookings(talent_id);
create index if not exists bookings_status_idx on public.bookings(status);

-- =============================================================================
-- 6. AVAILABILITY — talent's self-managed calendar
-- =============================================================================
-- One row per date marked. Default assumption is "unmarked = unknown".
-- =============================================================================

create table if not exists public.availability (
  id uuid primary key default uuid_generate_v4(),
  talent_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  status text not null check (status in ('available', 'hold', 'unavailable')),
  note text,
  created_at timestamptz not null default now(),

  unique(talent_id, date)         -- one status per talent per day
);

create index if not exists availability_talent_date_idx on public.availability(talent_id, date);

-- =============================================================================
-- 7. WORKED_WITH — self-reported "I've worked with this person" graph
-- =============================================================================

create table if not exists public.worked_with (
  id uuid primary key default uuid_generate_v4(),
  talent_id uuid not null references public.profiles(id) on delete cascade,
  other_talent_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  unique(talent_id, other_talent_id),
  check (talent_id <> other_talent_id)
);

create index if not exists worked_with_talent_idx on public.worked_with(talent_id);

-- =============================================================================
-- 8. NOTIFICATIONS — persistent inbox + push notification log
-- =============================================================================

create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,             -- 'booking_request', 'booking_confirmed', 'job_update', etc.
  title text not null,
  body text,
  link text,                      -- deep link in the app
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx on public.notifications(user_id, read_at) where read_at is null;

-- =============================================================================
-- 9. AUTO-UPDATE updated_at TIMESTAMPS
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists talent_profiles_updated_at on public.talent_profiles;
create trigger talent_profiles_updated_at before update on public.talent_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists client_profiles_updated_at on public.client_profiles;
create trigger client_profiles_updated_at before update on public.client_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 10. AUTO-CREATE PROFILE ON SIGNUP
-- =============================================================================
-- When anyone signs up via magic link, automatically create their profile row.
-- Default role = 'talent' — admin promotes to 'client' or 'admin' manually.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 11. ROW-LEVEL SECURITY
-- =============================================================================
-- The rules that actually protect your data. Without these, any logged-in user
-- could read anyone else's data.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.talent_profiles enable row level security;
alter table public.client_profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.bookings enable row level security;
alter table public.availability enable row level security;
alter table public.worked_with enable row level security;
alter table public.notifications enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- PROFILES
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_verified_read" on public.profiles;
create policy "profiles_verified_read" on public.profiles
  for select using (verified = true);

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));
  -- prevents users from self-promoting to admin

-- TALENT_PROFILES
drop policy if exists "talent_profiles_read_verified" on public.talent_profiles;
create policy "talent_profiles_read_verified" on public.talent_profiles
  for select using (
    exists(select 1 from public.profiles p where p.id = talent_profiles.id and p.verified = true)
    or auth.uid() = id
    or public.is_admin()
  );

drop policy if exists "talent_profiles_self_write" on public.talent_profiles;
create policy "talent_profiles_self_write" on public.talent_profiles
  for all using (auth.uid() = id or public.is_admin());

-- CLIENT_PROFILES — only admins and the client themselves
drop policy if exists "client_profiles_self_or_admin" on public.client_profiles;
create policy "client_profiles_self_or_admin" on public.client_profiles
  for all using (auth.uid() = id or public.is_admin());

-- JOBS
drop policy if exists "jobs_own_or_booked_or_admin" on public.jobs;
create policy "jobs_own_or_booked_or_admin" on public.jobs
  for select using (
    client_id = auth.uid()
    or public.is_admin()
    or exists(select 1 from public.bookings b where b.job_id = jobs.id and b.talent_id = auth.uid())
  );

drop policy if exists "jobs_client_create" on public.jobs;
create policy "jobs_client_create" on public.jobs
  for insert with check (client_id = auth.uid() or public.is_admin());

drop policy if exists "jobs_client_update" on public.jobs;
create policy "jobs_client_update" on public.jobs
  for update using (client_id = auth.uid() or public.is_admin());

-- BOOKINGS
drop policy if exists "bookings_involved_read" on public.bookings;
create policy "bookings_involved_read" on public.bookings
  for select using (
    talent_id = auth.uid()
    or public.is_admin()
    or exists(select 1 from public.jobs j where j.id = bookings.job_id and j.client_id = auth.uid())
  );

drop policy if exists "bookings_talent_respond" on public.bookings;
create policy "bookings_talent_respond" on public.bookings
  for update using (talent_id = auth.uid() or public.is_admin());

drop policy if exists "bookings_admin_create" on public.bookings;
create policy "bookings_admin_create" on public.bookings
  for insert with check (public.is_admin());

-- AVAILABILITY — talent reads/writes their own; admin sees all; clients see aggregate only (via views later)
drop policy if exists "availability_self_or_admin" on public.availability;
create policy "availability_self_or_admin" on public.availability
  for all using (talent_id = auth.uid() or public.is_admin());

drop policy if exists "availability_verified_read" on public.availability;
create policy "availability_verified_read" on public.availability
  for select using (
    exists(select 1 from public.profiles p where p.id = availability.talent_id and p.verified = true)
  );

-- WORKED_WITH — talent manages their own graph
drop policy if exists "worked_with_self" on public.worked_with;
create policy "worked_with_self" on public.worked_with
  for all using (talent_id = auth.uid() or public.is_admin());

drop policy if exists "worked_with_verified_read" on public.worked_with;
create policy "worked_with_verified_read" on public.worked_with
  for select using (true);  -- public to all logged-in users

-- NOTIFICATIONS — always private to the recipient
drop policy if exists "notifications_self" on public.notifications;
create policy "notifications_self" on public.notifications
  for all using (user_id = auth.uid() or public.is_admin());
