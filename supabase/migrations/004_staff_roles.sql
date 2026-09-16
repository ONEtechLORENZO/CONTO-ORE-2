-- ============================================================
--  Migration 004 — staff roles (teams)
--  Job roles such as "AI Engineers" or "Marketing", separate
--  from profiles.role (admin / member access level).
--  A person can belong to several roles.
--  Run once in Supabase → SQL Editor (safe to re-run)
-- ============================================================

-- 1. tables
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

-- 2. starter roles (rename or delete them from the Roles page)
insert into public.staff_roles (name, color) values
  ('Management', '#eb6834'), ('AI Engineering', '#4a3aa7'), ('Software Engineering', '#2a78d6'),
  ('Sales', '#1baf7a'), ('Marketing', '#e87ba4')
on conflict (name) do nothing;

-- 3. row level security: active users read roles and their own
--    assignments; admins read and write everything
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
