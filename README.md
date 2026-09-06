# PDF Link Manager

> Setup guide (step by step, Roman Urdu): **[SETUP.md](SETUP.md)**

Serve auto-downloading PDF links from any number of domains and subdomains, managed from a cPanel-style admin panel.

```
https://files.example.com/brochures/2025/summer.pdf   ->  file downloads immediately
        └── domain ──┘└── link (path) ──┘└ file name ┘
```

- **Hosting:** Vercel (Hobby / free)
- **Database:** Supabase Postgres (free)
- **File storage:** Cloudflare R2 (free: 10 GB, no egress fees)

## What the admin panel does

| Area | Features |
| --- | --- |
| Domains | Add domains/subdomains, enable/disable, notes, attach to the Vercel project through the Vercel API (optional), DNS guidance |
| Links | Create paths under a domain (`/`, `/brochures`, `/reports/2025`), rename, delete |
| Files | Upload (direct browser → R2, multi-file, progress), replace, rename, delete, preview inside the panel, copy public link, download counts |
| Search | Find files uploaded (or changed) inside a date **and time** range, by domain, link, name or uploader; CSV export |
| Users | Super admin creates admin users, ticks exactly which actions they may perform |
| Counters | Per-user counts of uploads / replaces / renames / deletes, totalled across all domains, with per-domain/link breakdown; super admin can set any value or reset to 0 |
| Activity | Full history of every action with filters |

## 1. Supabase

> **New here?** [SETUP.md](SETUP.md) walks through the whole thing end to end — accounts, database, storage, deploy, first domain, first upload — with a direct link for every dashboard page. The steps below are the short reference version.

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), click **Run**.
3. Copy the credentials (the **Connect** button at the top of the dashboard shows both):
   - **Integrations → Data API** (`/integrations/data_api/overview`) → Project URL → `SUPABASE_URL`
   - **Settings → API Keys → Publishable and secret API keys** → the `sb_secret_…` key → `SUPABASE_SERVICE_ROLE_KEY`.
     Older projects can still use the legacy `service_role` key (`eyJ…`) from the **Legacy API keys** tab. Both work.
     Server only; never put it in the browser.

No Postgres connection string or database password is needed. The app talks to Supabase over the Data API (HTTPS) via
`@supabase/supabase-js`, so it never opens a database connection and needs no pooler — which is also what Supabase
recommends for serverless hosts like Vercel.

## 2. Cloudflare R2

1. Cloudflare dashboard → **Storage & databases → R2 Object Storage** → **Create bucket** (e.g. `pdf-files`). Keep it private.
   Cloudflare usually asks for a card before R2 can be enabled, even if you stay inside the free tier.
2. **R2 Object Storage → Overview → Account details → API Tokens → Manage → Create Account API token**,
   permission *Object Read & Write*, scoped to that bucket. Copy the Access Key ID and Secret Access Key (the secret is shown once).
3. Your Account ID is on the same R2 Overview page under **Account details** → `R2_ACCOUNT_ID`.
4. **CORS** (needed so the browser can upload straight to R2; files over 4 MB require it):
   bucket → **Settings → CORS Policy → Add CORS policy → JSON** and paste, replacing the origins with your admin URL(s):

   ```json
   [
     {
       "AllowedOrigins": ["https://your-project.vercel.app", "https://admin.example.com", "http://localhost:3000"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Without CORS, uploads up to 4 MB still work (they fall back to going through the server).

## 3. Deploy to Vercel

1. Push this folder to a Git repository (GitHub/GitLab/Bitbucket).
2. Vercel → **Add New → Project** → import the repo. Framework: Next.js (auto-detected).
3. **Environment variables** (Project → Settings → Environment Variables). See [`.env.example`](.env.example):

   | Variable | Value |
   | --- | --- |
   | `AUTH_SECRET` | long random string (`openssl rand -base64 32`) |
   | `SUPERADMIN_EMAIL` | your login email |
   | `SUPERADMIN_PASSWORD` | your first password (also works as recovery – see below) |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | from step 2 |
   | `DOWNLOAD_MODE` | `redirect` (default, free R2 egress) or `proxy` (URL stays on your domain, uses Vercel bandwidth) |
   | `MAX_UPLOAD_MB` | optional, default 200 |
   | `ADMIN_HOSTS` | optional. Comma-separated hostnames allowed to open `/admin` (e.g. `your-project.vercel.app,localhost`). Empty = every attached domain can open the panel |
   | `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | optional – lets the panel attach domains to this project (token: Account Settings → Tokens; project ID: Project → Settings → General; team ID only for team accounts) |

4. Deploy. Open `https://your-project.vercel.app/admin` and sign in with `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`.
   The super admin account is created on that first sign-in.

### Forgot the super admin password?

Change `SUPERADMIN_PASSWORD` in Vercel, redeploy, sign in with the new value. The stored password is reset to it.

## 4. Domains & subdomains

Every domain that should serve files must be **attached to this Vercel project** and **listed in the admin panel**.

- **Panel → Domains → Add domain.** If the Vercel API variables are set, tick *Attach to the Vercel project now* and it is added for you.
  Otherwise add it in Vercel by hand: Project → Settings → Domains → Add.
- **DNS:**
  - Domain bought on Vercel / nameservers on Vercel → nothing to do; subdomains work as soon as they are attached.
  - Elsewhere → subdomain: `CNAME  sub  cname.vercel-dns.com`; root domain: `A  @  76.76.21.21`.
- The panel's *DNS & setup* button shows the exact records and any verification TXT Vercel asks for.

Add as many domains as you like (4, 10, 50). Each gets its own links and files.

## How downloads work

1. Visitor opens `https://<domain>/<link path>/<file name>`.
2. The catch-all route looks up domain → link → file in Supabase and bumps the download counter.
3. `redirect` mode: 302 to a 2-minute signed R2 URL with `Content-Disposition: attachment` → browser saves the file.
   `proxy` mode: the file is streamed through Vercel with the same header.

Renaming a file only changes its public name (the storage object stays). Replacing a file uploads the new content under the same name and address. Deleting removes the storage object and the database row.

## Permissions

Super admins can do everything. Admin users get only the boxes ticked for them:

`upload` · `replace` · `rename` · `delete` · `preview` · `create_link` · `edit_link` · `delete_link` · `create_domain` · `edit_domain` · `delete_domain` · `search` · `view_activity`

Permission changes take effect on the user's next request (no re-login needed).

## Counters

Each counted action (upload, replace, rename, delete) is a row in `activity_log`.
A user's count = `base + rows since counted_from`, where `base`/`counted_from` live in `user_counters` and are changed when the super admin **sets** or **resets** a counter. History is never deleted, so the breakdown by domain/link stays available.

## Local development

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                   # http://localhost:3000/admin
```

To test downloads locally, add `localhost` as a domain in the panel and open `http://localhost:3000/<path>/<file>`.

## Project layout

```
src/app/[...slug]/route.ts      public download endpoint (all domains)
src/app/admin/*                 admin pages
src/app/api/admin/*             admin API (domains, links, files, users, counters, activity)
src/app/api/auth/*              login / logout / password
src/components/admin/*          File manager, Domains, Search, Activity, Users
src/lib/*                       auth, permissions, R2, Supabase, Vercel API helpers
supabase/schema.sql             database schema, views, functions
```

## Notes on the free tiers

- Vercel Hobby: 100 GB bandwidth/month, 4.5 MB request body limit (why large uploads go browser → R2 directly), non-commercial use.
- Supabase free: 500 MB database, pauses after 1 week without activity (any admin visit or download wakes it; the first request after a pause is slow).
- Cloudflare R2 free: 10 GB storage, 1 M writes and 10 M reads per month, no egress charges.
