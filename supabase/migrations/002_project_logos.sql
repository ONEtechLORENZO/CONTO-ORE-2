-- ============================================================
--  Migration 002 — project logos
--  Run once in Supabase → SQL Editor (safe to re-run)
-- ============================================================

-- 1. column
alter table public.projects add column if not exists logo_url text;

-- 2. public storage bucket for logos (max 2 MB per file, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-logos', 'project-logos', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml'];

-- 3. storage policies: everyone can view, only admins can change
drop policy if exists "logos_public_read"  on storage.objects;
drop policy if exists "logos_admin_insert" on storage.objects;
drop policy if exists "logos_admin_update" on storage.objects;
drop policy if exists "logos_admin_delete" on storage.objects;

create policy "logos_public_read" on storage.objects
  for select using (bucket_id = 'project-logos');

create policy "logos_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-logos' and public.is_admin());

create policy "logos_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'project-logos' and public.is_admin())
  with check (bucket_id = 'project-logos' and public.is_admin());

create policy "logos_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-logos' and public.is_admin());
