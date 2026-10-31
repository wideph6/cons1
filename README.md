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
| Old M — links | Create paths under a domain (`/`, `/brochures`, `/reports/2025`), rename, delete |
| Old M — files | Upload (direct browser → R2, multi-file, progress), replace, rename, move to another link, delete, preview inside the panel, copy public link, download counts |
| New M | Attestation documents, uploaded one PDF at a time. New M has its own domains, each with custom links that carry `{attestation_number}` and `{issue_date}` formulas. Each document picks a domain and link, gets a unique attestation number (`GEN-NMPD-SSTI-FBDS`, generated or typed) and a date (today unless changed), and its complete link and QR code are saved with it. Document type, issuing office, issuing authority and approving officer (name + designation + signature, picked together) are offered from saved lists that grow with every upload. Everything stays editable, the PDF included; one search box covers every domain. The front-end page and the sticker come later |
| Bulk actions | Tick several files, then move them to another link, replace them all at once (each new file is paired to the selected file with the same name), or delete them |
| Storage | Super-admin page comparing the R2 bucket with the database: space used, leftovers from uploads that never finished (one click to delete), files whose object is missing, sizes that do not match |
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

Renaming a file only changes its public name (the storage object stays). Moving a file to another link is the same idea: the object never moves, only the address changes. Replacing a file uploads the new content under the same name and address. Deleting removes the storage object and the database row.

If a browser dies between the upload to R2 and the save into the database, the object is left in the bucket with nothing pointing at it. **Storage** in the admin panel lists those leftovers and deletes them; anything younger than 6 hours is left alone in case an upload is still running.

## New M

A document is one PDF plus the details that will later be printed on its sticker. Run [`supabase/new-m.sql`](supabase/new-m.sql) once before using it.

**Domains & links** — New M has its own domains, set up under **Domains & links** on the New M page; the Domains page is not used. Each domain has as many links as needed. A link is everything after the domain, written freely, with two formulas wherever a document's own values belong:

| Formula | Filled with |
| --- | --- |
| `{attestation_number}` | the document's number, e.g. `GEN-NMPD-SSTI-FBDS` |
| `{issue_date}` | the document's date as DDMMYYYY, e.g. `31102026` |

For example `/verify-general-attestation-by-qr?attestation_number={attestation_number}&issue_date={issue_date}` (the **standard link** button) or `/attest/{issue_date}/{attestation_number}`. A link without `{attestation_number}` is allowed but flagged, since every document on it would share one address. Documents follow their link: renaming a domain or editing a link gives its documents new complete links, and their QR codes are redrawn and saved in the same request (settings say how many documents a change touches). Deleting a link leaves its documents as they were — each keeps a copy of its link — and deleting a domain removes its links and documents with their PDFs.

1. Pick a **domain** and one of its **links**.
2. Upload the **PDF** (PDF only). It is stored in R2 under `new-m/docs/`, apart from Old M.
3. The **attestation number** is `GEN` plus three groups of four capital letters, e.g. `GEN-NMPD-SSTI-FBDS`. Leave it blank to have one generated, press **Generate** to see one first, or type your own. It is unique across every domain.
4. The **date of attestation** defaults to today and can be changed.
5. The **complete link** is `https://` + the domain + its link with the formulas filled in, e.g. `https://baxoq.pk/verify-general-attestation-by-qr?attestation_number=GEN-NMPD-SSTI-FBDS&issue_date=31102026`.

Documents uploaded while New M still used the Domains page are moved by `new-m.sql`: each hostname they used becomes a New M domain with the standard link, so their links and QR codes stay the same.

**Saved values** — document type, issuing office and issuing authority each offer every value typed so far; a new value joins its list when the document is saved. **Approving officers** are saved as name + designation + signature, so picking one fills in all three; "Add a new officer" asks for the three separately and saves them for next time. A document keeps its own copy of the officer, so removing an officer from the list (under **Saved values**) leaves documents already uploaded unchanged. A signature image is only deleted from storage once no officer and no document still shows it.

**Editing** — every field can be changed afterwards, and choosing a new PDF removes the old one. Changing the domain, the link, the number or the date changes the complete link.

**Search** — one box over every domain: number, document type, office, authority, officer, domain, link name, file name, and the date written as `31102026`, `31-10-2026`, `31/10/26` or `2026-10-31`.

**QR code** — when a document is saved, the server draws the QR code of its complete link (domain included) and saves it on the document (`qr_svg`, with `qr_url` holding the link it encodes). An edit that changes the complete link — the domain, the link, the number or the date — draws a new code and replaces the saved one; any other edit leaves it as it is. Renaming a domain or editing a link under Domains & links replaces the codes of every document it touches. The list shows the saved code (click it for a large view and PNG / SVG downloads); the upload form shows a live preview before saving. The style copies the reference sample: a plain QR with square modules and square finder eyes, black on white, version 6 (41 × 41 modules) at error-correction level L; a link too long for version 6 moves up to the next size. The generator (`src/lib/new-m-qr.ts`) belongs to New M alone.

**Sticker** — not built yet. Everything it will print is stored on the document (and the signature is available as a `data:` URI from `/api/admin/new-m/:id/signature`), so a sticker drawn at download time will always match the document as it reads after any edit.

> The public page these links open is not built yet, and a New M domain still has to be pointed at this deployment (DNS, and attached in Vercel) before its links can answer. Until then, opening a link fails.

## Permissions

Super admins can do everything. Admin users get only the boxes ticked for them:

`upload` · `replace` · `rename` · `move` · `delete` · `preview` · `create_link` · `edit_link` · `delete_link` · `create_domain` · `edit_domain` · `delete_domain` · `search` · `view_activity`

New M has its own: `new_m_create` · `new_m_edit` · `new_m_delete` · `new_m_settings` (remove saved values and officers) · `new_m_domains` (add and edit New M domains and their links). The New M tab, and reading its PDFs, needs at least one of them.

`move` and the `new_m_*` keys are newer than the others, so existing admin users do not have them until the super admin ticks them.

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
src/app/api/admin/*             admin API (domains, links, files, move, storage, users, counters, activity)
src/app/api/auth/*              login / logout / password
src/app/api/admin/new-m/*    New M API (documents, its own domains and links, saved values, officers, uploads)
src/components/admin/*          File manager (Old M), New M, Domains, Storage, Search, Activity, Users
src/lib/new-m-link.ts        New M link formulas, attestation number and QR settings, shared by server and browser
src/lib/new-m-qr.ts          New M's QR encoder (ISO/IEC 18004, byte mode)
src/lib/*                       auth, permissions, R2, Supabase, Vercel API helpers
supabase/schema.sql             database schema, views, functions
supabase/new-m.sql           the New M tables on their own, for adding them to an existing database
```

## Notes on the free tiers

- Vercel Hobby: 100 GB bandwidth/month, 4.5 MB request body limit (why large uploads go browser → R2 directly), non-commercial use.
- Supabase free: 500 MB database, pauses after 1 week without activity (any admin visit or download wakes it; the first request after a pause is slow).
- Cloudflare R2 free: 10 GB storage, 1 M writes and 10 M reads per month, no egress charges.
