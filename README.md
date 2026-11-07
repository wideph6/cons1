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
| New M | Attestation documents, uploaded one PDF at a time. New M has its own domains, each with custom links that carry `{attestation_number}` and `{issue_date}` formulas. Each document picks a domain and link, gets a unique attestation number (`GEN-NMPD-SSTI-FBDS`, generated or typed) and a date (today unless changed), and its complete link and QR code are saved with it. Document type, issuing office, issuing authority and approving officer (name + designation + signature, picked together) are offered from saved lists that grow with every upload. Everything stays editable, the PDF included; one search box covers every domain. Every link opens a public verification page drawn exactly to the reference designs — one for computers, one for phones (with a hamburger menu) — with the document's values and its PDF; the super admin edits every text, link, button, tab and logo of both views from **New M page** |
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

**Saved values** — document type, issuing office and issuing authority each offer every value typed so far; a new value joins its list when the document is saved. **Approving officers** are saved as name + designation + signature, so picking one fills in all three; "Add a new officer" asks for the three separately and saves them for next time. A document keeps its own copy of the officer, so removing an officer from the list leaves documents already uploaded unchanged. Whoever may remove saved values (`new_m_settings` / `appo_settings`; the super admin always) sees a bin beside each saved value and officer right in the upload form's lists (`SavedPicker`), as well as under **Saved values**: it asks once, takes the value off its list for every later upload, and leaves the documents that use it as they are. A value removed while it was picked on a new upload is cleared from that form; the document being edited keeps its own. A long list opens with a search box. A signature image is only deleted from storage once no officer and no document still shows it.

**Editing** — every field can be changed afterwards, and choosing a new PDF removes the old one. Changing the domain, the link, the number or the date changes the complete link.

**Search** — one box over every domain: number, document type, office, authority, officer, domain, link name, file name, and the date written as `31102026`, `31-10-2026`, `31/10/26` or `2026-10-31`.

**QR code** — when a document is saved, the server draws the QR code of its complete link (domain included) and saves it on the document (`qr_svg`, with `qr_url` holding the link it encodes). An edit that changes the complete link — the domain, the link, the number or the date — draws a new code and replaces the saved one; any other edit leaves it as it is. Renaming a domain or editing a link under Domains & links replaces the codes of every document it touches, saved a hundred at a time through the `new_m_set_qr` database function (one update per document until `new-m.sql` has added it).

**Speed** — a save checks everything that needs no database first, then reads the link with its domain, the number, the officer and the stored PDF side by side, writes the document and any new saved values together, and answers with the saved document; the activity log and removing a replaced PDF happen after the reply (`after()` from `next/server`). The PDF starts uploading the moment it is chosen, and the list takes the returned document in place instead of reloading. Officer signatures are listed as short-lived links, not downloaded and inlined. The list shows the saved code (click it for a large view and PNG / SVG downloads); the upload form shows a live preview before saving. The style copies the reference sample: a plain QR with square modules and square finder eyes, black on white, version 6 (41 × 41 modules) at error-correction level L; a link too long for version 6 moves up to the next size. The generator (`src/lib/new-m-qr.ts`) belongs to New M alone.

**Sticker** — every document has a "General Attestation" sticker, shown with **View sticker** and saved with **Download PDF** straight from the list (an SVG download is in the viewer). It is drawn in the browser at the moment it is asked for, from the document as it reads now, so an edit always shows on the next sticker. Everything was measured off the reference sticker (`src/lib/new-m-sticker.ts`, on a 958 × 761 grid). The background image carries the "GENERAL ATTESTATION" title bar, the table lines, the faint pattern and the Seal/Stamp cell; the app draws the rest itself so nothing prints blurred: the labels "1 Country **Pakistan**", "This Public Document", "2 at", "3 the", "4 by", "5 No.", "Date:" (Georgia 19 px black, "Pakistan" bold; the regular labels carry a 0.2 px outline because, against the reference, they came out lighter than the values), and a 1.4 px border round the QR code. Then the values: document type under "This Public Document", issuing office under "2 at", the date as `15th of October 2026` after "3 the", issuing authority after "4 by", the number after "5 No.", the date as `15 Oct 2026` after "Date:", all in Georgia bold 19 px black; the officer's signature in the signature cell with the designation under it in Georgia 16 px; the saved QR code inside its border. No white separates the border from the code, as on the reference, but the line is drawn over the code's outer edge (covering its outermost 1 px) rather than beside it: beside it, as on the reference, the corner squares read too thick and the code did not scan at all in testing, while over the edge it scans better than with a gap. A value too long for its cell is set smaller instead of running into the next. The sticker is saved as a one-page PDF named `Certificates-<7-digit document number>.pdf` (`src/lib/sticker-pdf.ts`, pdf-lib, loaded only when asked for): drawn at three times the layout size, or at the background's own resolution if that is higher, on an A4-wide page as long as the sticker, as big as the super admin set it (see **Page width (A4)** below).

**Background image** — every sticker is drawn on an image the super admin uploads; the app ships none and never makes one up. Until one is uploaded, **View sticker** and **Download PDF** stop with an error saying the sticker can't be made without a background image. Only the super admin can set it, from **Background image** on the New M page. It can be a JPG, PNG or WebP image, or a PDF: the PDF's first page is drawn in the browser with PDF.js (3200 px on its longer side, a PNG under 4 MB, else a high-quality JPEG, smaller only if needed) and that image is uploaded in its place, with the page's size in points kept in the placement; the sticker takes the page's length like any image's, and the values are lined up over it as before. A sticker is always its background as shown, its length and width the image's (see *The sticker is its background* below). The editor shows the image under the first document in the list (its real values, signature and QR code, or sample values when there are none), exactly where every sticker writes them; the image is dragged in any direction, nudged with the arrow keys and zoomed until its cells sit under them, then **Crop** puts handles on its edges to cut off what is not wanted, in place. Whatever reaches past the sticker is cut off too. **Move text & QR** then lets every value be dragged together with its own label ("4 by" with the issuing authority, and so on), the QR code with its border, "1 Country Pakistan" as one piece, and the signature and the designation each on their own; arrow keys nudge the chosen one. That position, crop and those moves are saved with it (`background_placement`: where the image sits on the 958 × 761 grid, the share cut off each side, and `layout`, how far each moved set was shifted) and every sticker, on screen and downloaded, uses them; **Save position** changes them later without uploading again. A background that already has the labels and QR border printed on it is marked as such (`background_has_frame`), and the app then writes only the values, signature and QR code onto it. The image is kept only in R2 under `new-m/backgrounds/`, never in the code, and handed out only through the signed-in route `/api/admin/new-m/background`; a new upload takes the old one's place and the old file is deleted (the Storage cleanup leaves the one in use alone).

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

**Document address** — every document also has its own address on its domain,
`/storage/applications/{doc_storage_number}/documents/{doc_hash_name}.pdf`: a 13-digit number and a 40-character name (letters
and digits, like Laravel's `hashName()`), both unique. An uploaded PDF is stored in R2 under a fresh name
(`new-m/docs/{uuid}/{name}.pdf`, `randomHashName()` in `src/lib/new-m-link.ts`), which the document takes as `doc_hash_name`; a
replaced PDF brings a new name and so a new address, while the number stays. Documents saved before this draw both in new-m.sql
(`new_m_storage_number()`, `new_m_hash_name()`, from `gen_random_uuid()`'s secure random bytes); their PDFs keep the uploaded name in
R2 until uploaded again. The name is what the page shows and what the PDF is saved as; the name it was uploaded with stays in the
admin panel only. The middleware sends such an address on a New M domain to `src/app/nm-doc`, which answers only on the document's
own domain: without a query it is the tab the desktop **Open document** button opens — the browser's PDF viewer filling the page,
titled with the document's 40-character name and showing the **PDF tab favicon** (else the page's favicon); `?view` (the PDF for that frame) and
`?download` redirect to a short-lived R2 link named `{name}.pdf`, so they cost Vercel no bandwidth. On phones the **Open
document** and file-card buttons download `?download`, and a browser that cannot show PDFs inside a page
(`navigator.pdfViewerEnabled === false`) is sent there too. Before the new-m.sql that adds the two columns has run, documents keep
the earlier links.

**Mobile view** — the same page carries a second layout drawn after the mobile design (`MobilePage`, styles in
`verify-mobile.src.css` → `verify-mobile.css`); below 768 px it shows and the desktop one hides (`.nmp-switch`). It is laid out on a
360 px grid that scales to the phone (`calc(var(--mu) * n)`, `--mu` = one design pixel of the page's width, capped at 540 px), so
every phone from 320 px up keeps the design's proportions without horizontal scrolling. The header's hamburger button
(`MobileMenu`, a small client part) opens the main menu right under the header's white part: a dark green panel inset like the
hero's text, one item per row (54 design px, Roboto 15.4), a touched or hovered item lighter green with a pale bar along its foot, as
on the desktop nav; the page behind is not dimmed. The quick links and social icons follow the items only when **Menu: also show quick
links and social icons** (`menu.extras`, off by default) is on in the mobile view's settings. The panel's width, left-right and up-down
place (`menu.panel`, design pixels of the 360 px grid: 320 wide, 20 from the left, 0 below the header as drawn; `cleanMenuPanel` keeps it
on the page) are set from **Menu panel** in the editor. The ☰ button keeps its look while the menu is open, unless **Change the button
while the menu is open** (`header.menu_button_changes`, off by default) is ticked in its settings: then its lines turn into an ✕ on a
darker square. Escape, a tap on a link or outside closes it. The document card shows the file the way a phone browser does (PDF icon, name, an Open button that
downloads the PDF) or, if chosen, every page drawn with PDF.js at the phone's width (`MobilePdf`; nothing is downloaded while the view is hidden).
Its fonts are the mobile design's: Roboto and Noto Serif, served from `public/nm-assets/fonts` (OFL).

**Page design** (super admin) — `/admin/new-m/page-design` shows the page exactly as visitors see it; clicking any text, button,
tab, link or logo opens its settings (wording, link target, new tab, icon, width, hide/show, order, add/duplicate/delete within
lists, logo upload). The **Browser tab** button (next to Desktop view / Mobile view, and the browser tab drawn above the desktop
preview) opens the tab settings, saved with the desktop view and serving phones too: the verification page's **tab title** and
**favicon** (ICO, PNG, SVG, JPG, WebP or GIF up to 1 MB, kept in R2 under `new-m/page/`; served to visitors from `/api/new-m/favicon?v=…`, an
address that changes with each upload so browsers may keep it; without one the app's own icon shows), and the **PDF tab's title**
(`meta.pdf_title`, default `{name}` — the PDF's 40-character name, as before) and **favicon** (`/api/new-m/favicon?for=pdf&v=…`;
without one that tab shows the page's). Both titles may carry `{attestation_number}` and `{document_type}`, filled in from the
document (`fillTitle`; the page looks the document up once for the title and the page alike). Appo's page has the same.
Desktop and mobile are separate views with separate content, each with its own undo history and reset; the
mobile tab shows the page in a phone frame at a chosen width, opens the hamburger menu when its button is clicked so the menu's
items, quick links and social icons can be edited like everything else, and can copy the desktop wording in (`mobileFromDesktop`).
Text, links and settings are saved as JSON in `new_m_page_settings` (one row per view; anything missing falls back to the design's
default); logos go to R2 under `new-m/page/` and are deleted when replaced or removed and no longer used by either view. The content
is checked on the server (`cleanDesktop` / `cleanMobile`): links must be http(s), mailto, tel or same-site, and logo keys must be under `new-m/page/`. A save made against an
older copy than the one stored (another tab or super admin saved meanwhile) is refused; the editor keeps its edits as unsaved changes
on top of that newer save, and Save again puts them live. Save times are compared as moments (`sameSaveTime`), and a save returns the
time as the database keeps it, so saving twice in a row from one editor is never mistaken for someone else's save.
A logo or favicon that only looks transparent — the grey and white squares of an image editor painted into the picture, common in
"transparent PNG" downloads — has the squares made truly see-through in the browser before it uploads (`src/lib/fake-transparency.ts`:
it finds two greys alternating on one square grid and clears them, keeping the logo, white parts included; the result goes up as a
PNG). Images without the pattern go up untouched, and **Upload it as it was** sends the original. The same holds on Appo's page.

A New M domain still has to point at this deployment (DNS, and attached in Vercel) before its links can answer.

## Appo

Appo is an independent copy of New M — documents, domains & links, saved values and officers, QR codes, stickers, the
verification page with its PDF tab, and its page editor — kept entirely in its own files, so it can be changed without touching
New M. Run [`supabase/appo.sql`](supabase/appo.sql) once before using it.

| | New M | Appo |
|---|---|---|
| Admin pages | `/admin/new-m`, `/admin/new-m/page-design` | `/admin/appo`, `/admin/appo/page-design` |
| Admin API | `src/app/api/admin/new-m` | `src/app/api/admin/appo` |
| Public routes | `src/app/nm-view`, `src/app/nm-doc`, `src/app/api/new-m` | `src/app/appo-view`, `src/app/appo-doc`, `src/app/api/appo` |
| Code | `src/lib/new-m*.ts`, `src/components/admin/NewM*`, `src/components/new-m-page` | `src/lib/appo*.ts` (with `appo-types.ts`, `appo-r2.ts`), `src/components/admin/Appo*`, `src/components/appo-page` |
| Page styles | `nmp-` / `nmpm-` / `nmv-` classes, `npm run build:nmp-css` | `apo-` / `apom-` / `apov-` classes, `npm run build:appo-css` |
| Fonts | `public/nm-assets` | `public/appo-assets` |
| Database | `new_m_*` tables, views and functions (`supabase/new-m.sql`) | `appo_*` (`supabase/appo.sql`) |
| R2 | `new-m/` | `appo/` |
| Permissions | `new_m_create`, `_edit`, `_delete`, `_settings`, `_domains` | `appo_create`, `_edit`, `_delete`, `_settings`, `_domains` |

Only what the whole app shares knows about both: the middleware (it looks a host up in New M's and Appo's domains side by side
and hands the visit to the system it belongs to; on a host set up in both, a link goes to New M when it matches one of New
M's, else to Appo, so give the two systems different link patterns there, and a document's PDF address, which both write
the same way, is looked up in both at once, one round trip as anywhere else, and answered by whichever has it, in
`src/lib/document-tab.ts`), the permission list, the admin sidebar, the activity log's wording and the storage report. Appo's tab shows to the super
admin and to admins given any Appo permission; its page design is the super admin's only, as for New M.

Appo's page starts from the design's defaults. **Copy New M's design** in Appo's page editor brings in New M's page as it is
saved now — both views, with every text, link and logo, the favicon and the PDF tab's favicon — as unsaved changes to check,
then Save (or Undo). Its logos and favicons are copied in R2 to `appo/page/`, so the two pages never share a file. This is the
one place Appo reads New M's data (`new_m_page_settings` and `new-m/page/`); it never writes or deletes any of it. New M's page
editor has the mirror, **Copy Appo's design** (`/api/admin/new-m/page/from-appo`, copying into `new-m/page/`). Neither copies the
verification record's entries (`keepRecordEntries` in each `*-page.ts`): New M keeps its labels, Appo its rows and certificate box,
and each keeps its officer's designation and signature settings and the note under the record (`record.disclaimer`).

Where Appo differs from New M:

- **Values.** Each document has `document_type`, `signed_by`, `signed_capacity`, `seal_stamp`, `office_city` and `office_name`
  (the last two were `issuing_office` / `issuing_authority`; `appo.sql` renames them and their saved-value lists). The admin
  panel names come from `APPO_FIELDS` in `appo-types.ts`.
- **Numbers.** `APN-XXXX-XXXX-XXXX`: the prefix is `appo_settings.number_prefix` (APN by default), set by the super admin under
  Appo → Number prefix (`/api/admin/appo/settings`). Any three capital letters are accepted as a number, so documents made
  under an earlier prefix keep working; a new or changed number must use the prefix in use.
- **Verification record.** `record.rows` in the page content: Country (fixed value), Document Type, 2–4, a certificate box, 5–8
  and the approving officer, each with its own number, words, layout (value under, above or after the words), alignment, order,
  visibility and moves and sizes of its number, words and value within its box (`moves`, in the view's design pixels, and
  `sizes`, in percent; dragged in the editor or typed in); the Date entry also picks its format (`29th of October 2026` or `29 Oct 2026`). Drawn by `RecordRows.tsx` for both
  views. `record.certificate`
  is the box's look per view. All of it is page content in `appo_page_settings`.
- **Sticker.** Its own sets (`appo-sticker.ts`): two-line Country, Document Type and 2–4; one-line 5–8 (a value starts where its
  words end); "Date:"; the signature with the officer's name under it; the QR code with no border (one can be added). Downloaded as a one-page A4-wide
  PDF, and its background may be a PDF (first page drawn in the browser, `pdfPage` kept in the placement), exactly as
  New M's (`src/lib/sticker-pdf.ts`).

Both stickers let the super admin **ungroup** a set in the background editor, moving its number (the set's count, "1" to "8"),
its words and its value each on its own, and **reword** the fixed words for the sticker only. Moves (`layout`, with `split` and
per-part `parts`: `label`, `value`, `number`) and reworded words (`texts`,
by piece id) are saved inside `*_settings.background_placement`, so New M needs no database change for it; the placement travels
to the browser URI-encoded in the `x-background-placement` header.

## Verification record: position, size and boldness of every piece

On both systems' verification pages (desktop and mobile, each view on its own), every piece of the record card can be moved,
made larger or smaller, and (text) made thinner or bolder from Page design: the card's small heading and title, the certificate's logo, title and subtitle, each
entry's words and value (New M: its labels and values, the officer's name, designation and signature; Appo: each entry's
number, words, value, designation and signature in `record.rows[].moves` / `sizes` / `weights`), and the note under the record.
`src/lib/record-looks.ts` holds the shared model (`{ x, y, size, weight? }`: a move in the view's design pixels, ±600, a size in
percent, 30–300, and a CSS font weight, 100–900 in hundreds, left out for the design's own) with its cleaner and CSS; `record.looks` keeps the pieces outside Appo's entries (New M: all of its pieces,
`RECORD_PIECES`). A move shifts the piece where it is drawn (a transform, or a relative offset for text that runs inline) without
pushing anything aside; a size zooms the piece's text in place and a weight sets its `font-weight` (`RecordSized.tsx`, an inner
span), so it grows and wraps within its box, the logo
zooms itself (its move divided by the zoom, which would otherwise scale it), and a signature scales round its middle. As designed,
the markup is exactly what it was. The editors share `RecordLookFields.tsx` (X / Y with arrows, size with − / +, a slider and a
percent box, boldness with − / + and a list that marks the design's own weight, read off the preview; none for a logo or signature) and drag a picked piece (`data-look`) with one Undo step per drag. **Copy from desktop** leaves the phone's own looks;
copying the other system's page design brings only the shared pieces' looks. The desktop sans font
gains a light (100–300) and a black (800–900) face (Segoe UI Light / Black, else Selawik) so thinner and bolder text shows; the
serif keeps regular and bold, and the phone's Roboto and Noto Serif cover every weight.

## Sticker sets: size, boldness, colour, on/off

Both stickers' background editors set, per set, in `*_settings.background_placement.layout` (no database change):
**size** (`scale`, round the set's middle, 30–300 %; ungrouped, each part's own — New M now has this as Appo did, so the QR code
and signature size too), **boldness, colour and spacing** of each text (`styles.number` / `styles.label` / `styles.value` /
`styles.whole`: `bold` 1–9, `color` #rrggbb, `letterSpacing` −5 to 20 and `wordSpacing` −10 to 60 in sticker units, drawn as SVG
`letter-spacing` / `word-spacing`; a value that would run past its cell with them is set smaller, Appo's values after their words
start where the spaced words end, and grab boxes take them in), **on/off** (`show`) and, for the QR code, the colour of the square behind it (`fill`: a colour, or `"none"`)
and the **line round it** (`border`: its thickness in sticker units, 0.5–10, or 0 for none; left out as made — New M's 1.4 line, or
none on a background with its own; Appo none). Up to 1.4 thick the line lies just inside the square's edge; thicker, it grows
outward, so it never covers more of the code (`qrLineSvg`).
`src/lib/sticker-style.ts` holds the shared model: nine boldness steps made of the weights a font has plus a thin outline in the
text's colour (`SERIF_STEPS` for Georgia / Times, regular and bold only; `POPPINS_STEPS` for Appo's values, with Poppins 400–800 in
`public/appo-assets/fonts`, of which only the weights a sticker writes travel inside it, `poppinsWeights`). Anything as made is left
out, so a sticker nobody restyled is drawn exactly as before. The editors share `StickerLookFields.tsx` (boldness and colour rows,
the QR colour, and the "On the sticker" checkboxes). New M gains an **Approving officer's name** set, off until turned on; both
stickers write the 7-digit document number in Times New Roman Bold. Appo gains a **Designation** set (the officer's designation
under the name), off until turned on.

**Numbers apart.** Each set's count is its own piece (`part: "number"`), written in Times New Roman (upright figures of even
height, `NUMBER_FAMILY`) where the words stay Georgia. A set with `numberApart` has its number as a part of its own: its own
move and size (`parts.number`) and look (`styles.number`). Without it (every set saved before), the number goes with its words
as it always did — their move, sized round the two together, and their look (`partMove`, `pieceStyle`) — so a saved sticker is
drawn exactly as before but for the counts' font. The editor sets a number apart the first time any part of its set is moved,
sized, ungrouped or restyled (`withNumberApart`), keeping where everything is drawn (each part sized round its own middle from
then on, its move made up for it) and giving the number its words' look. Turned off and back on in the "On the sticker" list, the
7-digit document number — and any set that has ended up off the sticker — comes back at the top of the sticker, in the middle.

**The sticker is its background.** A sticker is always the visible part of its background image (after its crop) at the size it
was zoomed to: `refitToBackground` moves the placement and every set so that part starts at the sticker's corner and sets
`size` to it, after every move, zoom or crop in the editor, on save, and when a sticker saved another way is drawn or opened.
Zooming the image (100% = the 958 units the words were made for, 10–1000%) therefore makes the image, and the sticker with it,
longer and wider, while the words, values and QR code keep their size; nothing is ever cut by a frame. Sides run 20–40000 units.

**Page width (A4).** The sticker prints on a page as wide as A4 and as long as the sticker. `printScale` in the placement is how
big the whole sticker — its background and everything on it, as one set — prints, in points per sticker unit (`DEFAULT_PRINT_SCALE`
= A4's width ÷ 958, so a 958-wide sticker prints edge to edge). It is set, once the words, values and QR code are in place, with
one slider read as millimetres of white at each side of the page (`PageWidthField`): more white makes the whole sticker smaller,
less makes it larger, and below 0 its sides are cut. A new background keeps the white the page had. A sticker saved before
`printScale` prints as it did: as wide as the page, or the share of it in the older `pageFill`. `pdfLayout` gives the page and
where the sticker sits on it, and `stickerPdf` draws it there.

**The editor's view** (both systems) draws the A4 page as wide as its box and the sticker on it at the size it prints, so the screen
keeps one scale: a larger image shows larger while its words stay the same, the page slider visibly grows or shrinks the whole
sticker against the page's white, and whatever reaches past the page's sides is darkened (cut in print). **View** (− / +) only
magnifies; the box scrolls, starting centred.

## Document numbers

Every New M and Appo document has a **7-digit document number** (`doc_number`, e.g. `4827153`), unique within its system.
Run [`supabase/doc-number.sql`](supabase/doc-number.sql) once: it adds the column with a random default
(`new_m_doc_number()` / `appo_doc_number()`, never starting with 0), gives every saved document its own (drawing again on a
clash), adds the check (`^[0-9]{7}$`) and unique index, and remakes `new_m_view` / `appo_view` so they show it. `new-m.sql`,
`appo.sql` and `schema.sql` carry the same for a fresh install.

- **Upload / edit form**: *Document number (7 digits)* with **Generate**. Left empty on a new upload, the database draws one; a
  typed one (any 7 digits, spaces and dashes dropped) is checked for clashes first (409). Changing it on a month-old document
  waits for approval like any other field ("Document number" in the review).
- **List**: shown under the attestation number as *Doc no.*; the search box finds it (`doc_number` is in `SEARCH_COLUMNS`).
- **Sticker**: a movable set of its own (`docNumber`, the value only, no words), first centred under the QR code; the super
  admin places it with **Move text & QR** like the officer's name or designation (Appo's can be resized too).
- Until the SQL has run, uploads save without a number, the list is searched without it, and typing one asks for the SQL.

## Finance, counts, kept files and approvals

Run [`supabase/finance.sql`](supabase/finance.sql) after the other SQL files. Until then the app works as before and the Finance
page says so.

- **Counts** now include New M and Appo documents (`create_new_m`, `create_appo`); `schema.sql` and `finance.sql` define the
  same `user_action_counts` / `user_action_breakdown`. A count can be set, lowered (`mode: "subtract"`) or reset; for an admin,
  a count that costs money moves what they owe by the change × the rate now in force, in one database step
  (`finance_set_counts`). The user page shows the exact amount before anything is changed.
- **Finance** (super admin): `finance_settings` holds the amount per Old M upload, New M document and Appo document. A trigger on
  `activity_log` charges each new entry by an admin at the rate then (`finance_entries`, one charge per activity row). Payments are
  recorded by the super admin or asked for by the user (`finance_requests`, accepted once by `finance_decide_request`).
  `finance_accounts.visible` decides whether an admin sees their own account (the Finance tab, `/api/admin/finance/me`).
  Code: `src/lib/finance*.ts`, `src/app/api/admin/finance`, `src/components/admin/FinanceAccount.tsx`.
- **Kept files**: a replaced Old M file or New M / Appo PDF is recorded in `replaced_files` and kept in R2 for 15 days
  (`src/lib/file-history.ts`); list endpoints sweep expired ones at most hourly. The super admin compares the earlier and current
  file side by side (`/api/admin/file-history`, `FileHistory.tsx`). The storage report counts kept files and PDFs waiting for
  approval as in use.
- **Approvals**: an admin's edit of a New M / Appo document uploaded more than 30 days ago is saved to
  `new_m_pending_edits` / `appo_pending_edits` instead (`src/lib/*-edit.ts`, which the PATCH route and the approval share).
  `/api/admin/{new-m,appo}/:id/pending` shows it and approves (re-running the edit as its requester) or turns it down.

## Commission users

Run [`supabase/commission.sql`](supabase/commission.sql) after the other SQL files (safe to re-run). Until then a commission user
cannot be made and everything works as before.

- **Role `commission`** (`users.role`): may be given only `COMMISSION_PERMISSIONS` — Old M `upload`, `replace`, `rename`,
  `move`, `preview`; `new_m_create` / `_edit`; `appo_create` / `_edit`. Every list, record, preview, rename, move and
  replace route lets them reach only their own cases (`requireOwnCase`, `uploaded_by` / `created_by`); link, domain and
  dashboard counts are their own (`withOwnCounts`).
- **Review** (`review_status` approved | pending | rejected, `review_note`, `reviewed_by`, `reviewed_at` on `files`,
  `new_m_records`, `appo_records`; existing rows are approved): a commission user's new case starts `pending`, and visitors
  are only ever served approved cases (`[...slug]`, `findVisit`, `rowByNumberAndDate`, `rowByAddress`, falling back to
  everything while the column is missing). `commission_review` approves or turns down a waiting case and, approving, pays the
  user's rate for its system in the same step (`commission_entries`, once per case). A turned-down case stays hidden with its
  reason until its user edits it or sends it again (`RESUBMIT`). Their edits of a live case wait: New M / Appo through the
  existing `*_pending_edits` (`needsApproval` is always true for them), Old M through `old_m_pending_edits` (one per file: a
  new file uploaded but not attached, a new name, another link; `/api/admin/files/:id/pending`). Edits earn nothing.
  `/api/admin/reviews` is the super admin's queue (`reviewQueue`, `reviewCount` for the sidebar badge) and decisions;
  `CaseStatus.tsx` shows the state in each list.
- **Commission** (`commission_rates` per user and system; `commission_entries`: `commission`, `reversal`, `payment`;
  `commission_balances`): deleting an approved case, directly or through its link or domain, takes its commission back once
  (`commission_reverse_deleted` triggers). The super admin pays at most what is still owed less payments already waiting
  (`payCommission`): to a user who sees their Finance tab (`finance_accounts.visible`) it is a `commission_requests` row they
  accept or turn down (`commission_decide_request`, once, only by them; the super admin may take it back while it waits); to one
  who does not, it is recorded at once. Code: `src/lib/commission*.ts`, `src/lib/review*.ts`, `src/lib/old-m-pending.ts`,
  `src/app/api/admin/{commission,reviews}`, `CommissionAccount.tsx`, `ReviewsPage.tsx`. Commission users are never charged by
  the admins' finance (its trigger charges `role = 'admin'` only).

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
src/components/new-m-page/*  The verification page: desktop (VerifyPage, PdfViewer) and mobile (MobilePage, MobileMenu, MobilePdf), stylesheets
src/app/nm-view              The public verification page (reached through the middleware only)
src/app/api/new-m/document   The PDF behind a verification page, with byte ranges
src/app/nm-doc               A document's /storage/applications/… address: its PDF tab, ?view and ?download (middleware only)
src/lib/*                       auth, permissions, R2, Supabase, Vercel API helpers
supabase/schema.sql             database schema, views, functions
supabase/new-m.sql           the New M tables on their own, for adding them to an existing database
supabase/appo.sql            Appo's tables (an independent copy of New M), run on their own
src/**/appo*, Appo*          Appo, New M's independent copy (see "Appo" above)
```

## Database functions

The SQL functions the server calls (`increment_download`, `dashboard_stats`, `user_action_counts`, `user_action_breakdown`, `new_m_set_qr`) are revoked from `PUBLIC` as well as from `anon` and `authenticated`, and granted to `service_role` only. Postgres lets everyone (`PUBLIC`) execute a new function until that is taken away, so revoking from `anon` alone would leave them callable with the anon key. Re-run `schema.sql` on an existing database to apply this (see SETUP, Hissa 14).

## Notes on the free tiers

- Vercel Hobby: 100 GB bandwidth/month, 4.5 MB request body limit (why large uploads go browser → R2 directly), non-commercial use.
- Supabase free: 500 MB database, pauses after 1 week without activity (any admin visit or download wakes it; the first request after a pause is slow).
- Cloudflare R2 free: 10 GB storage, 1 M writes and 10 M reads per month, no egress charges.
