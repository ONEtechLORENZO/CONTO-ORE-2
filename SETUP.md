# One Tech · Tracker Ore — Setup

Static front end on **GitHub Pages** + **Supabase** (login, Postgres, row-level security).
Total time: about 20 minutes. Everything below is done once.

## 1. Create the Supabase project

1. Go to https://supabase.com → **New project**.
   Region: **EU (Frankfurt)** or the closest. Save the database password somewhere safe (you will not need it in the app).
2. Wait until the project is ready (about 1 minute).

## 2. Create the tables

1. Left menu → **SQL Editor** → **New query**.
2. Paste the whole content of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   You should see "Success. No rows returned".

This creates everything for a new project: the tables `profiles`, `projects`, `time_entries`, `project_groups`,
`staff_roles` (teams) and `profile_roles` (team membership), the `project-logos` storage bucket,
the security policies and the 7 default projects.

**Updating a project that already exists?** Don't re-run `schema.sql`. Run the files in
[`supabase/migrations/`](supabase/migrations/) that you haven't run yet, in number order.
Each one is safe to run twice.

| File | Adds |
|---|---|
| `002_project_logos.sql` | Project logos (column + storage bucket) |
| `003_project_groups.sql` | Groups as their own table |
| `004_staff_roles.sql` | Teams and team membership |

## 3. Disable e-mail features (logins are by username)

Left menu → **Authentication** → **Sign In / Providers** → **Email**:

- **Allow new users to sign up**: OFF (employees are created only by an admin)
- **Confirm email**: OFF
- **Secure email change**: OFF (optional)

Nothing else. Usernames are mapped to `username@onetech.local` behind the scenes; no e-mail is ever sent.

## 4. Deploy the admin function

This function lets admins create employees and reset passwords from inside the app without exposing secret keys.

1. Left menu → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name: `admin-users`
3. Replace the editor content with [`supabase/functions/admin-users/index.ts`](supabase/functions/admin-users/index.ts) → **Deploy**.

(Alternative with the CLI: `supabase functions deploy admin-users`.)

## 5. Create the first admin (you)

The very first user must be created by hand, after that everything is done in the app.

1. Left menu → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Email: `<username>@onetech.local` (for example `marat@onetech.local`) · Password: a password only you know · **Auto Confirm User: ON** → Create.
3. Left menu → **Table Editor** → `profiles` → find the row with username `MARAT`
   → set **role** = `admin`, and fix **full_name** to `Marat Yerkebayev` → Save.

## 6. Connect the site

1. Left menu → **Project Settings** → **API Keys**. Copy the **Project URL** and the **publishable** key
   (`sb_publishable_...`; on older projects it is called the **anon public** key).
2. Open [`config.js`](config.js) in this repo and paste them into `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
   This key is meant to be public; the data is protected by the policies in the database.
   Never put the **secret** / **service_role** key in this file.
3. Commit and push. GitHub Pages redeploys automatically (about 1 minute).

Open https://onetechlorenzo.github.io/CONTO-ORE-2/ and log in with your username (for example `MARAT`) and that password.

## 7. Add the team

In the app: open the menu on your name → **Go to admin section** → **Employees** → **New employee**.
Type the full name; the username and initial password are suggested automatically (`301301` + initials).
Pick a team (required), click **Add** and give the credentials to the person.

Teams, groups and projects are managed on the **Teams**, **Groups** and **Projects** pages of the admin section.

### Importing the old Google Sheet (one-off, already done in September 2026)

The import script logs in as an admin of the app, so no secret key is needed. It fixes the old one-day
date shift and merges duplicated days. The URL and publishable key are read from `config.js`.

```bash
# from the repo folder, Node 18+
ADMIN_USER=MARAT ADMIN_PASS='your password' node tools/migrate-from-sheet.mjs --dry-run
# if the dry run looks right, run it for real:
ADMIN_USER=MARAT ADMIN_PASS='your password' node tools/migrate-from-sheet.mjs
```

On PowerShell:

```powershell
$env:ADMIN_USER="MARAT"; $env:ADMIN_PASS="your password"; node tools/migrate-from-sheet.mjs --dry-run
```

Running it again is safe: existing people, projects and hours are matched, not duplicated.

## Passwords

This repository and the site are public, so anything written in them can be read by anyone.
Never write real passwords in this repo. Admin accounts should use a password that does not follow
the `301301` + initials pattern, because that pattern and the usernames (first names) are easy to guess.

## Free plan note

Everything here runs on free plans: GitHub Pages, Supabase Free (no credit card) and GitHub Actions.

A free Supabase project would pause after 7 days without any request (for example during the August break).
The workflow in `.github/workflows/keepalive.yml` prevents that by sending one read request every 3 days.
It activates automatically once the repo is pushed and `config.js` is filled in. If the project ever does pause,
an admin restores it with one click in the Supabase dashboard; no data is lost.

## Who can do what

| | Staff | Admin |
|---|---|---|
| Log in with username + password | ✔ | ✔ |
| Personal dashboard with period filter (today, week, month, custom) | ✔ | ✔ |
| Log and edit own hours | ✔ | ✔ |
| Choose language (English / Italian) and light / dark theme | ✔ | ✔ |
| Team statistics, hours by team, per-person and per-project pages | | ✔ |
| Correct anyone's hours | | ✔ |
| Add, deactivate, delete employees, reset passwords, change teams and access | | ✔ |
| Manage teams, groups, projects and project logos | | ✔ |
| CSV export (whole team, one group, one project or one person) | | ✔ |

These rules are enforced in the database (row-level security), not only in the page.
Staff can only read their own profile and their own hours.
