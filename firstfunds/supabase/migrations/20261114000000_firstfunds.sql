-- FirstFunds: per-user saved progress for the Tax Assistant and the Academy.
-- Run in the Supabase SQL editor, or with `supabase db push`.
-- Each user can only ever read or write their own row (row-level security).

-- ---------------------------------------------------------------- tables
create table if not exists public.filing_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  profile    jsonb not null,
  revision   integer not null default 0,
  updated_at timestamptz not null default now(),
  -- Only the app's profile format, and nothing huge (no files are ever stored).
  constraint filing_profile_version check ((profile ->> 'version') = '1'),
  constraint filing_profile_size check (pg_column_size(profile) < 200000)
);

create table if not exists public.academy_progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  progress   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint academy_progress_size check (pg_column_size(progress) < 50000)
);

comment on table public.filing_profiles is 'Tax Assistant answers and document box values. Never files, SSNs or full EINs.';
comment on table public.academy_progress is 'Completed Academy lessons and quiz scores.';

-- ---------------------------------------------------------------- updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists filing_profiles_updated_at on public.filing_profiles;
create trigger filing_profiles_updated_at before update on public.filing_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists academy_progress_updated_at on public.academy_progress;
create trigger academy_progress_updated_at before update on public.academy_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- row-level security
alter table public.filing_profiles enable row level security;
alter table public.academy_progress enable row level security;

-- Signed-in users (including anonymous "guest" sign-ins) manage only their own row.
-- The anon role (not signed in) gets no policy, so it can't read or write anything.
drop policy if exists "filing: read own" on public.filing_profiles;
create policy "filing: read own" on public.filing_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "filing: insert own" on public.filing_profiles;
create policy "filing: insert own" on public.filing_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "filing: update own" on public.filing_profiles;
create policy "filing: update own" on public.filing_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "filing: delete own" on public.filing_profiles;
create policy "filing: delete own" on public.filing_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "academy: read own" on public.academy_progress;
create policy "academy: read own" on public.academy_progress
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "academy: insert own" on public.academy_progress;
create policy "academy: insert own" on public.academy_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "academy: update own" on public.academy_progress;
create policy "academy: update own" on public.academy_progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "academy: delete own" on public.academy_progress;
create policy "academy: delete own" on public.academy_progress
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.filing_profiles to authenticated;
grant select, insert, update, delete on public.academy_progress to authenticated;
revoke all on public.filing_profiles from anon;
revoke all on public.academy_progress from anon;
