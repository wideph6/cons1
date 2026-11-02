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
| New M | Attestation documents, uploaded one PDF at a time. New M has its own domains, each with custom links that carry `{attestation_number}` and `{issue_date}` formulas. Each document picks a domain and link, gets a unique attestation number (`GEN-NMPD-SSTI-FBDS`, generated or typed) and a date (today unless changed), and its complete link and QR code are saved with it. Document type, issuing office, issuing authority and approving officer (name + designation + signature, picked together) are offered from saved lists that grow with every upload. Everything stays editable, the PDF included; one search box covers every domain. Every link opens a public verification page drawn exactly to the reference design, with the document's values and its PDF in a built-in viewer; the super admin edits every text, link, button, tab and logo of that page from **New M page** |
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

**QR code** — when a document is saved, the server draws the QR code of its complete link (domain included) and saves it on the document (`qr_svg`, with `qr_url` holding the link it encodes). An edit that changes the complete link — the domain, the link, the number or the date — draws a new code and replaces the saved one; any other edit leaves it as it is. Renaming a domain or editing a link under Domains & links replaces the codes of every document it touches, saved a hundred at a time through the `new_m_set_qr` database function (one update per document until `new-m.sql` has added it).

**Speed** — a save checks everything that needs no database first, then reads the link with its domain, the number, the officer and the stored PDF side by side, writes the document and any new saved values together, and answers with the saved document; the activity log and removing a replaced PDF happen after the reply (`after()` from `next/server`). The PDF starts uploading the moment it is chosen, and the list takes the returned document in place instead of reloading. Officer signatures are listed as short-lived links, not downloaded and inlined. The list shows the saved code (click it for a large view and PNG / SVG downloads); the upload form shows a live preview before saving. The style copies the reference sample: a plain QR with square modules and square finder eyes, black on white, version 6 (41 × 41 modules) at error-correction level L; a link too long for version 6 moves up to the next size. The generator (`src/lib/new-m-qr.ts`) belongs to New M alone.

**Sticker** — every document has a "General Attestation" sticker, shown with **View sticker** and saved with **Download PNG** straight from the list (an SVG download is in the viewer). It is drawn in the browser at the moment it is asked for, from the document as it reads now, so an edit always shows on the next sticker. Everything was measured off the reference sticker (`src/lib/new-m-sticker.ts`, on a 958 × 761 grid). The background image carries the "GENERAL ATTESTATION" title bar, the table lines, the faint pattern and the Seal/Stamp cell; the app draws the rest itself so nothing prints blurred: the labels "1 Country **Pakistan**", "This Public Document", "2 at", "3 the", "4 by", "5 No.", "Date:" (Georgia 19 px black, "Pakistan" bold; the regular labels carry a 0.2 px outline because, against the reference, they came out lighter than the values), and a 1.4 px border round the QR code. Then the values: document type under "This Public Document", issuing office under "2 at", the date as `15th of October 2026` after "3 the", issuing authority after "4 by", the number after "5 No.", the date as `15 Oct 2026` after "Date:", all in Georgia bold 19 px black; the officer's signature in the signature cell with the designation under it in Georgia 16 px; the saved QR code inside its border. No white separates the border from the code, as on the reference, but the line is drawn over the code's outer edge (covering its outermost 1 px) rather than beside it: beside it, as on the reference, the corner squares read too thick and the code did not scan at all in testing, while over the edge it scans better than with a gap. A value too long for its cell is set smaller instead of running into the next. The PNG comes out at three times the layout size, or at the background's own size if that is larger.

**Background image** — every sticker is drawn on an image the super admin uploads; the app ships none and never makes one up. Until one is uploaded, **View sticker** and **Download PNG** stop with an error saying the sticker can't be made without a background image. Only the super admin can set it, from **Background image** on the New M page. The editor shows the image under the first document in the list (its real values, signature and QR code, or sample values when there are none), exactly where every sticker writes them; the image is dragged in any direction, nudged with the arrow keys and zoomed until its cells sit under them, then **Crop** puts handles on its edges to cut off what is not wanted, in place. Whatever reaches past the sticker is cut off too. **Move text & QR** then lets every value be dragged together with its own label ("4 by" with the issuing authority, and so on), the QR code with its border, "1 Country Pakistan" as one piece, and the signature and the designation each on their own; arrow keys nudge the chosen one. That position, crop and those moves are saved with it (`background_placement`: where the image sits on the 958 × 761 grid, the share cut off each side, and `layout`, how far each moved set was shifted) and every sticker, on screen and downloaded, uses them; **Save position** changes them later without uploading again. A background that already has the labels and QR border printed on it is marked as such (`background_has_frame`), and the app then writes only the values, signature and QR code onto it. The image is kept only in R2 under `new-m/backgrounds/`, never in the code, and handed out only through the signed-in route `/api/admin/new-m/background`; a new upload takes the old one's place and the old file is deleted (the Storage cleanup leaves the one in use alone).

**Verification page** — a link on a New M domain opens the public verification page (`src/app/nm-view`, reached only through
the middleware, which rewrites a request whose host is a New M domain and whose address matches one of that domain's links). The
number and date are read back from the link's formulas (`matchTemplate` in `src/lib/new-m-link.ts`; extra query parameters are
ignored, a trailing slash is forgiven) and looked up on that domain only; a link whose values match no document shows "No matching
record found", and an address that is no New M link falls through to Old M as before. The page reproduces the reference design on a
1062 px grid that scales with the window (every size is `calc(var(--u) * n)`, with `--u` one design pixel; the source is
`verify-page.src.css`, built by `npm run build:nmp-css`). Fonts are the design's own (Segoe UI, Georgia, Arial) where installed,
otherwise metric-compatible stand-ins served from `public/nm-assets/fonts` (Selawik, Gelasio, Arimo — OFL). The PDF is shown with
PDF.js in a viewer drawn after the browser's own (thumbnails, page number, zoom, fit, rotate, text notes, drawing, undo/redo, save a
copy with notes via pdf-lib, download, print, properties); it reads the file through `/api/new-m/document`, which serves byte
ranges, so a large scan starts showing at once. `mode=open` / `mode=download` redirect to a short-lived R2 link instead.

**Page design** (super admin) — `/admin/new-m/page-design` shows the page exactly as visitors see it; clicking any text, button,
tab, link or logo opens its settings (wording, link target, new tab, icon, width, hide/show, order, add/duplicate/delete within
lists, logo upload). Desktop and mobile are separate views (mobile is a placeholder for now: phones get the desktop design scaled).
Text, links and settings are saved as JSON in `new_m_page_settings` (one row per view; anything missing falls back to the design's
default); logos go to R2 under `new-m/page/` and are deleted when replaced or removed. The content is checked on the server
(`cleanDesktop`): links must be http(s), mailto, tel or same-site, and logo keys must be under `new-m/page/`. A save made against an
older copy than the one stored is refused with a reload hint.

A New M domain still has to point at this deployment (DNS, and attached in Vercel) before its links can answer.

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
src/lib/new-m-page.ts        Verification page content: defaults from the design, checks, paths for the editor
src/lib/new-m-page-server.ts Page content in the database, logo links, finding the document behind a visited link
src/components/new-m-page/*  The verification page (VerifyPage), its PDF viewer and its stylesheet
src/app/nm-view              The public verification page (reached through the middleware only)
src/app/api/new-m/document   The PDF behind a verification page, with byte ranges
src/lib/*                       auth, permissions, R2, Supabase, Vercel API helpers
supabase/schema.sql             database schema, views, functions
supabase/new-m.sql           the New M tables on their own, for adding them to an existing database
```

## Database functions

The SQL functions the server calls (`increment_download`, `dashboard_stats`, `user_action_counts`, `user_action_breakdown`, `new_m_set_qr`) are revoked from `PUBLIC` as well as from `anon` and `authenticated`, and granted to `service_role` only. Postgres lets everyone (`PUBLIC`) execute a new function until that is taken away, so revoking from `anon` alone would leave them callable with the anon key. Re-run `schema.sql` on an existing database to apply this (see SETUP, Hissa 14).

## Notes on the free tiers

- Vercel Hobby: 100 GB bandwidth/month, 4.5 MB request body limit (why large uploads go browser → R2 directly), non-commercial use.
- Supabase free: 500 MB database, pauses after 1 week without activity (any admin visit or download wakes it; the first request after a pause is slow).
- Cloudflare R2 free: 10 GB storage, 1 M writes and 10 M reads per month, no egress charges.
