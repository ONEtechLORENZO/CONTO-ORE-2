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

This creates the tables `profiles`, `projects`, `time_entries`, the security policies and the 7 default projects.

## 3. Disable e-mail features (logins are by username)

Left menu → **Authentication** → **Sign In / Providers** → **Email**:

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
2. Email: `marat@onetech.local` · Password: `301301My` · **Auto Confirm User: ON** → Create.
3. Left menu → **Table Editor** → `profiles` → find the row with username `MARAT`
   → set **role** = `admin`, and fix **full_name** to `Marat Yerkebayev` → Save.

## 6. Connect the site

1. Left menu → **Project Settings** → **API**. Copy **Project URL** and the **anon public** key.
2. Open [`config.js`](config.js) in this repo and paste them into `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
   The anon key is meant to be public; the data is protected by the policies in the database.
3. Commit and push. GitHub Pages redeploys automatically (about 1 minute).

Open https://onetechlorenzo.github.io/CONTO-ORE-2/ and log in with `MARAT` / `301301My`.

## 7. Add the team

In the app: **Admin → Dipendenti**. Type the full name; username and initial password are proposed
automatically (`301301` + initials). Click **Aggiungi** and hand the credentials to the person.

Or import everything from the old Google Sheet, including the existing hours (fixes the date shift
and merges the 60 duplicated days):

```bash
# from the repo folder, Node 18+; the service-role key is in Project Settings → API
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node tools/migrate-from-sheet.mjs --create-users --dry-run
# if the dry run looks right, run it for real:
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node tools/migrate-from-sheet.mjs --create-users
```

On PowerShell:

```powershell
$env:SUPABASE_URL="https://xxxx.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."; node tools/migrate-from-sheet.mjs --create-users
```

Never commit the service-role key.

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
| Personal dashboard and charts | ✔ | ✔ |
| Enter / edit own hours | ✔ | ✔ |
| See the whole team, enter hours for others | | ✔ |
| Add, deactivate, delete employees, reset passwords | | ✔ |
| Add, rename, archive projects and groups | | ✔ |
| CSV export of the whole team | | ✔ |

These rules are enforced in the database (row-level security), not only in the page.
