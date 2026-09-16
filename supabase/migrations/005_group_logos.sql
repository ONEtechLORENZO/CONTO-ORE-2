-- ============================================================
--  Migration 005 — logos belong to groups, not projects
--  Every project shows the logo of its group.
--  Files stay in the existing public bucket "project-logos"
--  (admins write, everyone reads — policies from migration 002).
--  Run once in Supabase → SQL Editor (safe to re-run)
-- ============================================================

-- 1. logo on the group
alter table public.project_groups add column if not exists logo_url text;

-- 2. projects no longer carry their own logo
--    (the app moves existing project logos to their group before this matters)
alter table public.projects drop column if exists logo_url;
