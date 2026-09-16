-- ============================================================
--  One Tech · Tracker Ore — database schema
--  Run once in Supabase → SQL Editor → New query → Run
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TABLES
-- ------------------------------------------------------------

-- One row per login. Created automatically by trigger when an
-- auth user is created (see handle_new_user below).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,                       -- e.g. MARAT
  full_name   text not null,                              -- e.g. Marat Yerkebayev
  role        text not null default 'member' check (role in ('admin','member')),
  color_bg    text not null default '#EEEDFE',            -- avatar colours
  color_tx    text not null default '#3C3489',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Project groups (e.g. AESSEFIN). projects.group_name references name:
-- renaming a group cascades; a group in use cannot be deleted.
create table if not exists public.project_groups (
  name        text primary key,
  color       text not null default '#2a78d6',            -- group colour (hex)
  logo_url    text,                                       -- optional group logo (Supabase Storage)
  created_at  timestamptz not null default now()
);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  group_name  text not null references public.project_groups(name) on update cascade on delete restrict,
  color       text not null default '#2a78d6',            -- group colour (hex)
  active      boolean not null default true,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (group_name, name)
);

create table if not exists public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete restrict,
  entry_date  date not null,
  hours       numeric(4,2) not null check (hours > 0 and hours <= 24),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, project_id, entry_date)
);

create index if not exists time_entries_user_date_idx on public.time_entries (user_id, entry_date);
create index if not exists time_entries_date_idx      on public.time_entries (entry_date);

-- ------------------------------------------------------------
-- HELPERS
-- ------------------------------------------------------------

-- True when the calling user is an active admin.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

-- True when the calling user is an active user (any role).
create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

-- Create the profile row when an auth user is created.
-- Username / full name / role / colours come from user_metadata
-- (set by the admin-users edge function or by the migration script).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, role, color_bg, color_tx)
  values (
    new.id,
    upper(coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1))),
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), initcap(split_part(new.email,'@',1))),
    coalesce(nullif(new.raw_user_meta_data->>'role',''), 'member'),
    coalesce(nullif(new.raw_user_meta_data->>'color_bg',''), '#EEEDFE'),
    coalesce(nullif(new.raw_user_meta_data->>'color_tx',''), '#3C3489')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists time_entries_touch on public.time_entries;
create trigger time_entries_touch
  before update on public.time_entries
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
--   member : reads own profile, active projects, own entries;
--            writes own entries only.
--   admin  : everything.
-- ------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.project_groups enable row level security;
alter table public.projects     enable row level security;
alter table public.time_entries enable row level security;

-- profiles -----------------------------------------------------
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles
  for delete to authenticated
  using (public.is_admin());
-- (no insert policy on purpose: rows are created by the trigger)

-- project_groups -----------------------------------------------
drop policy if exists "groups_select" on public.project_groups;
create policy "groups_select" on public.project_groups
  for select to authenticated using (public.is_active_user());

drop policy if exists "groups_insert" on public.project_groups;
create policy "groups_insert" on public.project_groups
  for insert to authenticated with check (public.is_admin());

drop policy if exists "groups_update" on public.project_groups;
create policy "groups_update" on public.project_groups
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "groups_delete" on public.project_groups;
create policy "groups_delete" on public.project_groups
  for delete to authenticated using (public.is_admin());

-- projects -----------------------------------------------------
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects
  for select to authenticated
  using (public.is_active_user() and (active or public.is_admin()));

drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects
  for delete to authenticated
  using (public.is_admin());

-- time_entries -------------------------------------------------
drop policy if exists "entries_select" on public.time_entries;
create policy "entries_select" on public.time_entries
  for select to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_admin()));

drop policy if exists "entries_insert" on public.time_entries;
create policy "entries_insert" on public.time_entries
  for insert to authenticated
  with check (public.is_active_user() and (user_id = auth.uid() or public.is_admin()));

drop policy if exists "entries_update" on public.time_entries;
create policy "entries_update" on public.time_entries
  for update to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_admin()))
  with check (public.is_active_user() and (user_id = auth.uid() or public.is_admin()));

drop policy if exists "entries_delete" on public.time_entries;
create policy "entries_delete" on public.time_entries
  for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_admin()));

-- ------------------------------------------------------------
-- STAFF ROLES (job roles / teams, separate from profiles.role;
-- a person can have several). Same as migration 004.
-- ------------------------------------------------------------
create table if not exists public.staff_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text not null default '#2a78d6',
  created_at  timestamptz not null default now()
);
create table if not exists public.profile_roles (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role_id     uuid not null references public.staff_roles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index if not exists profile_roles_role_idx on public.profile_roles (role_id);

alter table public.staff_roles   enable row level security;
alter table public.profile_roles enable row level security;

drop policy if exists "staff_roles_select" on public.staff_roles;
create policy "staff_roles_select" on public.staff_roles
  for select to authenticated using (public.is_active_user());
drop policy if exists "staff_roles_insert" on public.staff_roles;
create policy "staff_roles_insert" on public.staff_roles
  for insert to authenticated with check (public.is_admin());
drop policy if exists "staff_roles_update" on public.staff_roles;
create policy "staff_roles_update" on public.staff_roles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "staff_roles_delete" on public.staff_roles;
create policy "staff_roles_delete" on public.staff_roles
  for delete to authenticated using (public.is_admin());

drop policy if exists "profile_roles_select" on public.profile_roles;
create policy "profile_roles_select" on public.profile_roles
  for select to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_admin()));
drop policy if exists "profile_roles_insert" on public.profile_roles;
create policy "profile_roles_insert" on public.profile_roles
  for insert to authenticated with check (public.is_admin());
drop policy if exists "profile_roles_delete" on public.profile_roles;
create policy "profile_roles_delete" on public.profile_roles
  for delete to authenticated using (public.is_admin());

insert into public.staff_roles (name, color) values
  ('Management', '#eb6834'), ('AI Engineering', '#4a3aa7'), ('Software Engineering', '#2a78d6'),
  ('Sales', '#1baf7a'), ('Marketing', '#e87ba4')
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- DEFAULT PROJECTS (same as the old tracker; safe to edit later)
-- ------------------------------------------------------------
insert into public.project_groups (name, color) values
  ('ACTA', '#2a78d6'), ('AESSEFIN', '#eb6834'), ('PAUL E SHARK', '#1baf7a'), ('AWS GENERAL', '#eda100')
on conflict (name) do nothing;

insert into public.projects (name, group_name, color, sort_order) values
  ('ACTA',           'ACTA',          '#2a78d6', 10),
  ('Marketing',      'AESSEFIN',      '#eb6834', 20),
  ('Sito',           'AESSEFIN',      '#eb6834', 21),
  ('Back End',       'AESSEFIN',      '#eb6834', 22),
  ('Infrastrutture', 'AESSEFIN',      '#eb6834', 23),
  ('PAUL E SHARK',   'PAUL E SHARK',  '#1baf7a', 30),
  ('AWS GENERAL',    'AWS GENERAL',   '#eda100', 40)
on conflict (group_name, name) do nothing;

-- ------------------------------------------------------------
-- PROJECT LOGOS (storage bucket, public read, admin write)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-logos', 'project-logos', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;
drop policy if exists "logos_public_read"  on storage.objects;
drop policy if exists "logos_admin_insert" on storage.objects;
drop policy if exists "logos_admin_update" on storage.objects;
drop policy if exists "logos_admin_delete" on storage.objects;
create policy "logos_public_read"  on storage.objects for select using (bucket_id = 'project-logos');
create policy "logos_admin_insert" on storage.objects for insert to authenticated with check (bucket_id = 'project-logos' and public.is_admin());
create policy "logos_admin_update" on storage.objects for update to authenticated using (bucket_id = 'project-logos' and public.is_admin()) with check (bucket_id = 'project-logos' and public.is_admin());
create policy "logos_admin_delete" on storage.objects for delete to authenticated using (bucket_id = 'project-logos' and public.is_admin());
