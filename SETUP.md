# Poori Setup Guide — zero se chalte hue system tak

September 2026 ke dashboards ke mutabiq. Kul waqt: **takreeban 45 minute**.

Menu dhoondne ki zaroorat nahi — har step par **direct link** diya hai, bas click karein.

## Tarteeb kyun ye hai

Pehle Supabase aur R2 banayenge, phir code GitHub par chadhayenge, phir Vercel par deploy karenge.
Vercel se jo URL milega, wo aage R2 ki CORS setting mein chahiye hoga — is liye CORS wala step baad mein rakha hai.

## Aap ko ye 4 accounts chahiyen (sab free)

| Account | Kis liye | Card chahiye? |
| --- | --- | --- |
| [GitHub](https://github.com/signup) | code rakhne ke liye | Nahi |
| [Supabase](https://supabase.com) | database | Nahi |
| [Cloudflare](https://dash.cloudflare.com/sign-up) | files (R2 storage) | **Aksar haan** — R2 chalu karte waqt card maangta hai, chahe free tier hi use karein |
| [Vercel](https://vercel.com/signup) | website hosting | Nahi |

Teeno (GitHub ke ilawa) GitHub account se hi sign in kar lein, aasan rehta hai.

---

# Hissa 1 — Supabase (database)

## 1.1 Project banayen

1. <https://supabase.com/dashboard/projects> kholen aur sign in karein.
2. **New project** dabayen.
3. Form bharein:

   | Field | Kya likhen |
   | --- | --- |
   | Project name | `pdf-link-manager` |
   | Database password | **Generate a password** dabayen aur save kar lein. **Is app ko is ki zaroorat nahi** (wajah 1.5 mein), lekin aage kabhi database seedha kholna ho to kaam aata hai |
   | Region | `South Asia (Mumbai)` ya `Southeast Asia (Singapore)` |
   | Plan | Free |

4. **Create new project** dabayen. 2–3 minute lagenge. Upar "Setting up project" ki patti gayab hone ka intezar karein.

## 1.2 Tables banayen (SQL chalayen)

1. Ye link kholen: **<https://supabase.com/dashboard/project/_/sql/new>**
   (`_` ka matlab "jo project abhi khula hai" — Supabase khud sahi project par le jayega.)
2. Apne computer par project folder kholen → file `supabase/schema.sql` → **poora content copy** karein (Ctrl+A phir Ctrl+C).
3. Supabase ke editor mein paste karein (Ctrl+V).
4. **Run** dabayen (ya `Ctrl+Enter`).
5. Neeche **"Success. No rows returned"** aana chahiye. Bas, tables ban gaye.

Check karne ke liye: <https://supabase.com/dashboard/project/_/editor> kholen. Baen taraf ye 6 tables dikhni chahiyen:
`activity_log`, `domains`, `files`, `links`, `user_counters`, `users`.

> "already exists" wali error aaye to koi masla nahi — matlab SQL pehle se chal chuka hai. Ye file dobara chalane par bhi mehfooz hai.

## 1.3 Project URL lein

Supabase ne January 2026 mein dashboard ka nav badla hai. Project URL ab **Integrations → Data API** mein hai
(pehle `Settings → API` mein hota tha — wo page ab mojood nahi).

**Sab se aasan tareeqa:** upar dayen taraf **Connect** ka button dabayen (ya seedha ye link kholen:
**<https://supabase.com/dashboard/project/_?showConnect=true>**). Dialog mein sab se upar **Project URL** likha hota hai,
saath copy ka button bhi.

Doosra raasta: **<https://supabase.com/dashboard/project/_/integrations/data_api/overview>**

Value aisi hogi: `https://abcdefgh1234.supabase.co`

➜ Ye aap ki **`SUPABASE_URL`** hai. Notepad mein likh lein.

## 1.4 Secret key lein

1. Ye link kholen: **<https://supabase.com/dashboard/project/_/settings/api-keys>**
2. Tab **Publishable and secret API keys** par jayen (aksar yehi pehle se khula hota hai).
3. **Secret key** wali row dhoonden. Us ke saath aankh ka icon / **Reveal** hota hai — dabayen, phir copy karein.
   Key `sb_secret_` se shuru hogi.

➜ Ye aap ki **`SUPABASE_SERVICE_ROLE_KEY`** hai.

Do soortein aur ho sakti hain:

- **Koi key nazar nahi aa rahi** → **Create new API keys** button dabayen. Dono keys `default` naam se ban jayengi.
- **Purana project hai aur `sb_secret_` nahi milti** → usi page par tab **Legacy API keys** kholen aur `service_role` wali key (jo `eyJ` se shuru hoti hai) copy kar lein. Wo bhi bilkul theek chalegi.

**Publishable key ki is app ko zaroorat nahi.** Usay chhod dein.

> ⚠️ Secret key = poore database ka mukammal access. Sirf Vercel ke Environment Variables mein daalni hai. Kabhi GitHub par commit na karein.

## 1.5 Connection string / pooler ki zaroorat nahi — kyun

**Connect** dialog mein aap ko teen connection strings bhi nazar aayengi. Un mein se **koi bhi is app ke liye nahi chahiye**:

| Connect dialog mein | Port | Kis ke liye hoti hai | Hamen chahiye? |
| --- | --- | --- | --- |
| Direct connection | 5432 | hamesha chalne wale server (VPS waghera) | ❌ |
| Session pooler | 5432 | IPv4-only network par persistent connection | ❌ |
| Transaction pooler (Supavisor) | 6543 | serverless jahan Postgres se seedha jurna ho, jaise Prisma/Drizzle | ❌ |
| **Project URL + secret key** | 443 (HTTPS) | **Data API — yehi hum use kar rahe hain** | ✅ |

**Wajah:** ye app database se seedha Postgres connection nahi banati. Ye Supabase ke **Data API** se HTTPS par baat karti hai
(`@supabase/supabase-js` library ke zariye). Is mein connection banane ka koi maamla hi nahi, is liye pooler ki zaroorat hi nahi parti.

**Aur yehi behtar bhi hai.** Vercel par har request ek naye chhote function mein chalti hai. Agar hum seedha Postgres se jurte,
to har request ek naya connection banati aur free plan ki connection limit foran khatam ho jati — pooler isi masle ko halka karne ke liye
banaya gaya hai. Data API is masle ko peda hi nahi hone deta, kyunki connections Supabase apni taraf sambhalta hai.

Isi liye aap ko **database password kahin daalne ki zaroorat nahi**. Bas Project URL aur secret key kaafi hain.

---

# Hissa 2 — Cloudflare R2 (files ki storage)

## 2.1 R2 chalu karein

1. <https://dash.cloudflare.com> par sign up / login karein.
   (Cloudflare par koi domain add karna **zaroori nahi** — R2 alag se chalta hai.)
2. Ye link kholen: **<https://dash.cloudflare.com/?to=/:account/r2/overview>**
3. Pehli baar hai to R2 enable karne ko kahega. Cloudflare **aksar card maangta hai chahe aap sirf free tier use karein** —
   ye us ki billing requirement hai. Free limits ke andar rehte hue koi charge nahi hota.

Free mein har mahine (hamesha, sirf pehle saal nahi):

| Cheez | Free limit |
| --- | --- |
| Storage | 10 GB |
| Upload/list operations | 10 lakh (1M) |
| Download/read operations | 1 crore (10M) |
| Bandwidth (egress) | Unlimited, bilkul free |

## 2.2 Bucket banayen

1. Usi page par **Create bucket** dabayen.
2. Form:

   | Field | Kya rakhen |
   | --- | --- |
   | Bucket name | `pdf-files` (sirf chhote huroof, number, hyphen) |
   | Location | `Automatic` |
   | Default storage class | **Standard** |

3. **Create bucket** dabayen.

➜ Jo naam rakha, wo aap ki **`R2_BUCKET`** value hai (`pdf-files`).

> Bucket **private** hi rehne dein. "Public access" ya custom domain enable karne ki zaroorat nahi — app har download par khud 2 minute wala mehfooz link banati hai.

## 2.3 Account ID lein

1. Wapas **<https://dash.cloudflare.com/?to=/:account/r2/overview>**
2. Dayen taraf **Account details** box mein **Account ID** likha hai (32 characters). Copy karein.

➜ Ye **`R2_ACCOUNT_ID`** hai.

> Aur bhi aasan: browser ke address bar mein dekhen — `dash.cloudflare.com/<yahan Account ID hai>/r2/...`

## 2.4 API token banayen

1. Ye link kholen: **<https://dash.cloudflare.com/?to=/:account/r2/api-tokens>**
2. **Create Account API token** dabayen.
   (**Create User API token** *na* chunein — wo aap ke personal account se bandha hota hai.)
3. Form:

   | Field | Kya chunein |
   | --- | --- |
   | Token name | `pdf-link-manager` |
   | Permissions | **Object Read & Write** |
   | Specify bucket(s) | **Apply to specific buckets only** → `pdf-files` |
   | TTL | `Forever` |

4. Neeche **Create Account API token** dabayen.
5. Agli screen par do values dikhengi. **Abhi copy karein:**

   - **Access Key ID** ➜ **`R2_ACCESS_KEY_ID`**
   - **Secret Access Key** ➜ **`R2_SECRET_ACCESS_KEY`**

> ⚠️ **Secret Access Key sirf ek baar dikhti hai.** Page band karne ke baad dobara nahi milegi — phir naya token banana parega. Abhi notepad mein paste karein.

Usi page par "S3 client" wala endpoint bhi dikhta hai — usay copy karne ki zaroorat nahi, app khud bana leti hai.

> **CORS** wali setting abhi nahi karni — wo Hissa 5 mein hai, jab Vercel ka URL mil jayega.

---

# Hissa 3 — Code GitHub par chadhayen

Apne computer par project folder mein terminal kholen (VS Code mein `` Ctrl+` ``) aur ye chalayen:

```bash
git commit -m "PDF Link Manager"
```

Phir <https://github.com/new> par jayen:

| Field | Kya karein |
| --- | --- |
| Repository name | `pdf-link-manager` |
| Public / Private | **Private** chunein |
| Add a README / .gitignore / license | **koi tick na karein** |

**Create repository** dabayen. Agli screen par jo URL dikhe use copy karein, phir terminal mein:

```bash
git remote add origin https://github.com/<aapka-username>/pdf-link-manager.git
git push -u origin main
```

---

# Hissa 4 — Vercel par deploy karein

## 4.1 AUTH_SECRET banayen

Terminal mein ye chalayen aur natija copy kar lein:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

➜ Ye **`AUTH_SECRET`** hai.

## 4.2 Project import karein

1. <https://vercel.com/new> kholen.
2. Apna GitHub account connect karein (pehli baar mein "Install" dabana parta hai).
3. `pdf-link-manager` repo ke saamne **Import** dabayen.
4. Framework khud **Next.js** detect ho jayega. Build settings ko haath na lagayen.

## 4.3 Environment Variables bharein

Import wale page par hi **Environment Variables** section kholen aur ek ek kar ke daalein
(ya poori list copy kar ke paste karein — Vercel `KEY=value` walon ko khud alag kar leta hai):

```
AUTH_SECRET=<step 4.1 wala>
SUPERADMIN_EMAIL=aq.sandhu786@gmail.com
SUPERADMIN_PASSWORD=<jo password aap rakhna chahen>
SUPABASE_URL=<step 1.3>
SUPABASE_SERVICE_ROLE_KEY=<step 1.4>
R2_ACCOUNT_ID=<step 2.3>
R2_ACCESS_KEY_ID=<step 2.4>
R2_SECRET_ACCESS_KEY=<step 2.4>
R2_BUCKET=pdf-files
DOWNLOAD_MODE=redirect
MAX_UPLOAD_MB=200
```

`SUPERADMIN_EMAIL` aur `SUPERADMIN_PASSWORD` se aap ka pehla super admin account banega.

5. **Deploy** dabayen. 1–2 minute mein ban jayega.
6. Deploy hone ke baad upar aap ka URL dikhega, jaise `https://pdf-link-manager-abc123.vercel.app`. **Isay copy kar lein** — agla step isi ka hai.

## 4.4 Deploy fail ho jaye to

Sab se pehle **asli error parhein**: Vercel → apna project → **Deployments** → jo fail hua us par click → **Build Logs**.
Sab se pehli **laal (red)** line hi asal wajah hoti hai, baqi sab us ka nateeja hota hai.

### Agar aap **purana Vercel project** dobara use kar rahe hain

Ye sab se aam wajah hai. Jab aap ne pehle isi project mein koi **doosri qism ka code** (jaise sirf HTML/PDF wala test) deploy kiya tha,
to Vercel ne us waqt ki **build settings save kar li thin**, aur wo ab bhi lagi hui hain. Naya code Next.js ka hai, is liye build toot jati hai.

**Sab se aasan hal — naya project bana lein:**

1. Vercel → purana project → **Settings** → sab se neeche **Delete Project**.
2. <https://vercel.com/new> se `cons1` repo dobara **Import** karein.
3. Environment Variables (4.3 wali) dobara daal kar **Deploy** dabayen.

Ye is liye mehfooz hai ke abhi is project par na koi domain laga hai na koi data — sab kuch Supabase aur R2 mein hai, Vercel mein nahi.

**Ya purane project ko theek karein:** Settings → **Build and Deployment** kholen aur ye check karein:

| Setting | Kya hona chahiye |
| --- | --- |
| Framework Preset | **Next.js** (agar `Other` likha hai to yehi masla hai) |
| Build Command | Override **band** (ya `next build`) |
| Output Directory | Override **band**. Agar `public` likha hai to hata dein |
| Install Command | Override **band** (ya `npm ci`) |
| Root Directory | **khali** |
| Node.js Version | **22.x** |

> Is repo mein ab `vercel.json` mojood hai jo framework aur build command khud set kar deti hai, is liye zyada tar surat mein sirf
> **Output Directory** aur **Root Directory** ka override hatana kaafi rehta hai.

### Error ke hisab se hal

| Build log mein ye likha ho | Wajah aur hal |
| --- | --- |
| `No Output Directory named "public" found` | Framework Preset `Other` par atka hua hai. Usay **Next.js** karein aur Output Directory ka override band karein |
| `No Next.js version detected` | Root Directory ghalat hai, ya Vercel purana commit build kar raha hai |
| `Couldn't find any "pages" or "app" directory` | Root Directory khali honi chahiye |
| `ENOENT: no such file or directory ... package.json` | Vercel purana khali commit build kar raha hai. Deployments mein **Redeploy** dabayen aur latest commit chunein |
| `Error: Node.js version 18.x is no longer supported` | Settings → Build and Deployment → **Node.js Version** ko 22.x karein |
| `Module not found: Can't resolve ...` | Ye code ka masla hota, lekin is repo ki build test ho chuki hai. Ho sakta hai adhoora commit push hua ho — `git status` khali hona chahiye |

### Ye check karein ke Vercel **sahi commit** build kar raha hai

Deployment page par upar commit ka message likha hota hai. Wahan
**"Pin Vercel build config…"** ya **"PDF Link Manager"** likha hona chahiye.
Agar `Delete old …` jaisa purana message likha hai, to Vercel purana khali commit build kar raha hai —
**Deployments → … → Redeploy** karein.

---

# Hissa 5 — R2 par CORS lagayen (uploads chalane ke liye)

Ye step zaroori hai. Is ke baghair **4 MB se bari files upload nahi hongi**.

1. Ye link kholen: **<https://dash.cloudflare.com/?to=/:account/r2/overview>** → apna bucket `pdf-files` kholen.
2. Upar **Settings** tab par jayen.
3. Neeche **CORS Policy** dhoonden → **Add CORS policy** dabayen.
4. **JSON** tab chunein aur ye paste karein — pehli line mein **apna asli Vercel URL** daalein:

```json
[
  {
    "AllowedOrigins": [
      "https://pdf-link-manager-abc123.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

5. **Save** dabayen.

Yaad rakhne ki baat: yahan sirf wo address likhne hain jahan se **admin panel khulta hai**.
Jin domains se files download hoti hain, un ka yahan koi kaam nahi.
Aage chal kar admin panel kisi naye address par kholen, to us URL ko yahan add karna na bhoolen.

---

# Hissa 6 — Pehli login

1. Browser mein kholen: `https://<aapka-vercel-url>/admin`
2. Wohi email aur password daalein jo aap ne `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` mein rakhe the.
3. **Sign in** dabayen. Pehli login par hi aap ka super admin account ban jata hai.

Dashboard khul jaye to samjhen Supabase sahi jura hua hai.

> **Password bhool jayen to:** Vercel → Project → Settings → Environment Variables mein `SUPERADMIN_PASSWORD` badal dein, phir Deployments → **Redeploy**. Naye password se login ho jayegi.

---

# Hissa 7 — Domain add karein

## 7.1 Domain Vercel se jorein

1. Vercel → apna project → **Settings** → **Domains** → **Add**.
2. Apna domain ya subdomain likhen, jaise `files.example.com`. **Add** dabayen.
3. Vercel batayega ke DNS mein kya record daalna hai:

   | Domain ki qism | Record |
   | --- | --- |
   | Subdomain (`files.example.com`) | `CNAME` → naam `files`, value `cname.vercel-dns.com` |
   | Poora domain (`example.com`) | `A` → naam `@`, value `76.76.21.21` |

4. Ye record apne DNS provider (GoDaddy, Namecheap, Cloudflare waghera) mein daal dein.
   Agar domain **Vercel se khareeda** hai ya us ke nameservers pehle se Vercel par hain, to kuch karne ki zaroorat nahi — khud chal jata hai.
5. Vercel par domain ke saamne green tick aane ka intezar karein (chand minute se lekar aik ghante tak).

## 7.2 Domain admin panel mein add karein

1. Admin panel → **Domains** → **Add domain**.
2. Wohi hostname likhen: `files.example.com`.
3. **Create the root link (/) as well** ka tick laga rehne dein.
4. **Add domain** dabayen.

Bas. Ab is domain par files serve ho sakti hain.

> **Chahen to ye kaam khud-b-khud bhi ho sakta hai:** agar aap Vercel ka API token add kar dein, to panel khud hi domain Vercel project se jor deta hai (7.1 wala step chhod sakte hain).
> Token yahan se banayen: <https://vercel.com/account/settings/tokens>, aur Project ID yahan se: Project → Settings → General.
> Phir Vercel Environment Variables mein `VERCEL_API_TOKEN` aur `VERCEL_PROJECT_ID` add kar ke redeploy karein.

## 7.3 Aur domains

Har naye domain ke liye 7.1 aur 7.2 dobara karein. Jitne chahen domain add kar sakte hain.

---

# Hissa 8 — Pehli file upload aur test

1. Admin panel → **File manager**.
2. Baen taraf apna domain aur us ke neeche `/` (root link) dikhega. Us par click karein.
3. **Upload files** dabayen → koi PDF drag karein ya browse kar ke chunein → **Upload**.
4. Upload hone ke baad file ke saamne **copy** wala icon dabayen — public link copy ho jayega.
5. Wo link naye tab mein kholen (ya kisi aur ko bhejen).

✅ **File khud ba khud download honi chahiye.** Ye poore system ka asal test hai.

Naya link (folder) banane ke liye: baen taraf domain ke naam par hover karein aur **+** dabayen, phir path likhen jaise `brochures` ya `reports/2025`.

---

# Hissa 9 — Admin user banayen

1. Admin panel → **Users** → **New user**.
2. Naam, email aur password bharein (password ka **New** button khud strong password bana deta hai — copy kar lein, dobara nazar nahi aayega).
3. **Permissions** mein sirf wohi tick karein jo ye banda kar sake, jaise:
   - Sirf upload karne wala banda: `Upload files`, `Preview and download files`
   - Poora file manager: upload, replace, rename, delete
   - Domain add karne ki ijazat nahi deni to `Add domains and subdomains` ka tick na lagayen
4. **Create user** dabayen aur password us shaks ko mehfooz tareeqe se bhejen.

**Us ki counting dekhne ke liye:** Users list mein har banday ke saamne uploads / replaces / renames / deletes aur total nazar aata hai.
Us ke naam par click karein to tafseel khulti hai — kis domain aur kis link par kitne kaam kiye. Wahin se aap kisi bhi count ko **Edit** kar ke naya number rakh sakte hain ya **Reset** kar ke 0 kar sakte hain.

---

# Sab values ki checklist

Deploy se pehle ye 11 values aap ke paas honi chahiyen:

```
AUTH_SECRET=................................
SUPERADMIN_EMAIL=aq.sandhu786@gmail.com
SUPERADMIN_PASSWORD=........................
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_........
R2_ACCOUNT_ID=..............................
R2_ACCESS_KEY_ID=...........................
R2_SECRET_ACCESS_KEY=.......................
R2_BUCKET=pdf-files
DOWNLOAD_MODE=redirect
MAX_UPLOAD_MB=200
```

---

# Masail aur un ka hal

| Kya ho raha hai | Wajah aur hal |
| --- | --- |
| Login par "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set" | Vercel mein variables nahi lage, ya lagane ke baad **Redeploy** nahi kiya |
| Login par "Invalid API key" | Publishable key copy ho gayi hai — secret (`sb_secret_`) chahiye. Ya key ke aage/peeche space reh gaya hai |
| Upload 0% par atka hai / "Could not reach storage (network or CORS problem)" | CORS nahi lagi, ya `AllowedOrigins` mein us site ka URL nahi jahan se panel khula hai (Hissa 5) |
| Chhoti files chal rahi hain, bari fail | Yehi CORS wala masla hai. 4 MB tak server ke raste chali jati hain, us se bari ke liye CORS lazmi hai |
| Upload par "Access Denied" ya 403 | Token ki permission `Object Read & Write` nahi, ya token doosre bucket ka hai, ya `R2_BUCKET` ka naam ghalat likha hai |
| Link kholne par 404 | Domain panel mein add nahi, ya **Disabled** hai, ya file ka naam mukhtalif hai (bare/chhote huroof aur spaces dekh lein) |
| Domain par "Invalid Configuration" (Vercel) | DNS record abhi nahi phaila. 10–60 minute intezar karein, phir Vercel par **Refresh** dabayen |
| Sab kuch achanak band, "project is paused" | Supabase free project 1 hafte tak koi request na aaye to pause hota hai. Dashboard par **Restore** dabayen |
| Login page hi nahi khul raha | `AUTH_SECRET` set nahi hai ya 16 characters se chhota hai |

---

Tafseeli reference aur poori feature list [README.md](README.md) mein hai.
