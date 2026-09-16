-- ============================================================
--  Migration 003 — project groups
--  Groups become real rows, so an admin can create a group
--  before it has any project. projects.group_name stays as the
--  link (foreign key on the name): renaming a group renames it
--  on every project automatically; a group with projects cannot
--  be deleted.
--  Run once in Supabase → SQL Editor (safe to re-run)
-- ============================================================

-- 1. table
create table if not exists public.project_groups (
  name        text primary key,
  color       text not null default '#2a78d6',
  created_at  timestamptz not null default now()
);

-- 2. backfill from existing projects (colour of the group's first project)
insert into public.project_groups (name, color)
select distinct on (group_name) group_name, color
from public.projects
order by group_name, sort_order, created_at
on conflict (name) do nothing;

-- 3. link projects → groups (rename cascades, delete blocked while in use)
alter table public.projects drop constraint if exists projects_group_fk;
alter table public.projects
  add constraint projects_group_fk foreign key (group_name)
  references public.project_groups(name) on update cascade on delete restrict;

-- 4. row level security: active users read, admins write
alter table public.project_groups enable row level security;

drop policy if exists "groups_select" on public.project_groups;
create policy "groups_select" on public.project_groups
  for select to authenticated
  using (public.is_active_user());

drop policy if exists "groups_insert" on public.project_groups;
create policy "groups_insert" on public.project_groups
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "groups_update" on public.project_groups;
create policy "groups_update" on public.project_groups
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "groups_delete" on public.project_groups;
create policy "groups_delete" on public.project_groups
  for delete to authenticated
  using (public.is_admin());
