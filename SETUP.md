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

### Build "Collecting build traces" par ruk jati hai

Ye asal mein build ka **aakhri** marhala hai — yaani `next build` mukammal ho chuki hoti hai.
Us ke foran baad Vercel apni output directory dhoondta hai, aur wahin ye error deta hai:

```
Error: No Output Directory named "public" found after the Build completed.
```

**Matlab:** aap ke project ki settings mein Framework Preset abhi bhi `Other` hai (purane static test ki wajah se),
is liye Vercel `public` folder dhoond raha hai, jo Next.js banati hi nahi.

**Hal:** repo mein mojood [`vercel.json`](vercel.json) ye dono cheezen khud theek kar deti hai —
`framework` ko `nextjs` par set karti hai aur Output Directory ka override saaf kar deti hai.
Bas **Redeploy** dabayen. Agar phir bhi na chale, to Settings → Build and Deployment mein
**Output Directory** ka override apne haath se band kar dein.

> Log ka aakhri hissa ghor se dekhen. Agar `Route (app)` wali table nazar aa rahi hai,
> to build poori ho chuki hai aur masla sirf output directory ka hai.

### Ye check karein ke Vercel **sahi commit** build kar raha hai

Deployment page par upar commit ka message likha hota hai. Wahan
**"Pin Vercel build config…"** ya **"PDF Link Manager"** likha hona chahiye.
Agar `Delete old …` jaisa purana message likha hai, to Vercel purana khali commit build kar raha hai —
**Deployments → … → Redeploy** karein.

---

## 4.5 Auto redeploy — har push par khud deploy

Jab aap GitHub se project import karte hain, Vercel **pehle se** har push par naya deployment banata hai.
Aap ko kuch chalu karne ki zaroorat nahi. Aap bas ye karein:

```bash
git add -A
git commit -m "kya badla"
git push
```

Push hote hi Vercel build shuru kar deta hai, aur kamyab hone par live site khud update ho jati hai.
Repo mein mojood [`vercel.json`](vercel.json) mein ye baat likhi bhi hui hai:

```json
"git": { "deploymentEnabled": { "main": true } }
```

### Agar push par deploy na ho to

| Check | Kahan | Kya hona chahiye |
| --- | --- | --- |
| Git connection | Settings → **Git** → Connected Git Repository | `wideph6/cons1` juda hua ho. Na ho to **Connect** dabayen |
| Production Branch | Settings → **Git** | `main` |
| GitHub App ki ijazat | <https://github.com/settings/installations> → Vercel → Configure | Repository access mein `cons1` shamil ho |

> Agar aap ne project **Vercel CLI** se deploy kiya tha (import ki bajaye), to Git connection banta hi nahi
> aur auto deploy kabhi nahi hoga. Aise mein project delete kar ke <https://vercel.com/new> se dobara **Import** karein.

### Kaunsa deployment live hai

- **Production** — `main` branch par push. Yehi aap ka asli domain chalata hai.
- **Preview** — kisi doosri branch par push. Alag temporary URL milta hai, asli site par asar nahi parta.

Is liye seedha `main` par push karte rahen, live site update hoti rahegi.

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

> **Zaroori:** har naye domain ke liye 7.1 (DNS) alag se karna parta hai. Panel mein domain add kar dena kaafi **nahi** hai —
> panel sirf database mein likhta hai ke "is hostname par ye links serve karo". Agar us domain ka DNS abhi bhi purani hosting
> par point kar raha hai, to visitor ki request kabhi is app tak pohanchti hi nahi.

## 7.4 "Live check" — sab se ahem test

Admin panel → **Domains** mein har domain ke saamne **Live check** ka column hai. Panel khudi us domain ko internet par se
test karta hai aur batata hai ke us address par **kaun** jawab de raha hai:

| Badge | Matlab | Kya karna hai |
| --- | --- | --- |
| `Reaches this app` (hara) | Sab theek — is domain ke links chalenge | Kuch nahi |
| `Apache / cPanel hosting answers` | DNS abhi bhi purani hosting par hai | 7.1 wala DNS record theek karein |
| `Vercel, but not this project answers` | DNS Vercel tak pohanchta hai lekin domain is project se juri nahi | Vercel → Settings → Domains → Add |
| `Cloudflare answers` | Cloudflare ka orange cloud on hai | Record ko **DNS only** (grey) karein |
| `a redirect answers` | Domain kisi aur domain par redirect ho raha hai | Vercel mein "No Redirect" set karein |
| `No answer` | Domain resolve hi nahi ho raha / HTTPS nahi | DNS record daal kar propagate hone dein |

Badge par click karne se poori tafseel khulti hai — tested address, HTTP status, `Server` header, **Public DNS** (Cloudflare 1.1.1.1 aur
Google 8.8.8.8 dono se domain kis IP par ja raha hai, aur us IP ka maalik server) aur hal.

### DNS khud check karna (Windows)

Command Prompt kholen aur likhen (apna domain daalein):

```
nslookup files.example.com 1.1.1.1
```

| Jawab mein ye aaye | Matlab |
| --- | --- |
| `76.76.21.21`, `216.198.79.x`, `64.29.17.x`, `66.33.60.x`, ya `cname.vercel-dns.com` | Vercel — theek hai |
| Koi aur IP (jaise `185.x.x.x`, `162.x.x.x`) | Purani hosting — record badalna hai |
| Do IP: aik Vercel ka, aik koi aur | Do record aik saath hain — purana delete karein |
| `can't find` / `Non-existent domain` | Record abhi hai hi nahi |

Agar `nslookup` Vercel dikhaye lekin browser phir bhi purani site dikhaye, to aap ke computer ka DNS cache purana hai:
`ipconfig /flushdns` chalayen, ya mobile data se kholen.

**Ye check files upload karne se pehle chala lein.** Warna files R2 mein upload to ho jayengi (kyunki upload admin panel se hota
hai, us domain se nahi) lekin public link 404 dega.

---

# Hissa 8 — Pehli file upload aur test

1. Admin panel → **Old M**.
2. Baen taraf apna domain aur us ke neeche `/` (root link) dikhega. Us par click karein.
3. **Upload files** dabayen → koi PDF drag karein ya browse kar ke chunein → **Upload**.
   Agar isi naam ki file link mein pehle se hai, to file chunte hi popup poochta hai: **Yes — replace** (purani file ki jagah nayi, link wahi rehta hai) ya **No — keep the existing** (nayi file skip). Replace ke liye user ke paas *Replace files* ki permission honi chahiye.
4. Upload hone ke baad file ke saamne **copy** wala icon dabayen — public link copy ho jayega.
5. Wo link naye tab mein kholen (ya kisi aur ko bhejen).

✅ **File khud ba khud download honi chahiye.** Ye poore system ka asal test hai.

### Download na ho to: "Check public link" button

File ke saamne **shield (🛡) wala icon** dabayen. Ye server se poori chain test karta hai aur batata hai ke kahan tootti hai:

1. File R2 mein mojood hai ya nahi
2. R2 ka signed link chal raha hai ya nahi (keys/bucket sahi hain?)
3. Public address is app tak pohanch raha hai ya nahi (DNS / Vercel domain)
4. Redirect ke baad file mil rahi hai ya nahi

Pehla **laal** item hi asal wajah hai, aur us ke neeche hal likha hota hai.

### Sab se aam wajah: Cloudflare ka orange cloud

Agar aap ke domain ka DNS **Cloudflare** par hai, to CNAME record ke saamne **badal (cloud) ka icon grey** hona chahiye
("DNS only"). **Orange** (Proxied) hone se Vercel ko request theek nahi milti — redirect loop ya ghalat page aata hai.
Cloudflare → apna domain → **DNS** → record ke saamne orange cloud par click kar ke grey karein.

Public link par 404 aaye to sab se pehle dekhein ke **404 page kis ka hai**:

| 404 page par ye likha hai | Kis ka page hai | Wajah |
| --- | --- | --- |
| **File not found** + neeche chhota code (`domain_not_found`, `link_not_found`, `file_not_found`) | Is app ka | Request app tak pohanch gayi; code batata hai database mein kya nahi mila |
| **Not Found — The resource requested could not be found on this server!** | Apache / cPanel shared hosting ka | DNS abhi bhi **purani hosting** par point kar raha hai — request Vercel tak pohanchti hi nahi |
| **404: NOT_FOUND** + `Code: DEPLOYMENT_NOT_FOUND` | Vercel ka | Domain is Vercel project se juri nahi |

Doosri aur teesri surat mein masla database ya code ka **nahi** hai — sirf DNS ka hai. Admin panel → **Domains** →
**Live check** column dekh lein, wahan poora hal likha hota hai (7.4).

Naya link (folder) banane ke liye: baen taraf domain ke naam par hover karein aur **+** dabayen, phir path likhen jaise `brochures` ya `reports/2025`.

---

# Hissa 9 — Admin user banayen

1. Admin panel → **Users** → **New user**.
2. Naam, email aur password bharein (password ka **New** button khud strong password bana deta hai — copy kar lein, dobara nazar nahi aayega).
3. **Permissions** mein sirf wohi tick karein jo ye banda kar sake, jaise:
   - Sirf upload karne wala banda: `Upload files`, `Preview and download files`
   - Poora Old M: upload, replace, rename, delete
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

# Hissa 10 — Storage page (sirf super admin)

Sidebar mein **Storage** panel ko R2 bucket aur database ka moqabla dikhata hai. Ise kabhi kabhi khol kar dekh lena kafi hai.

| Number | Matlab |
| --- | --- |
| Objects in storage | Bucket mein kitni cheezein hain aur kitni jagah gheri hui hai |
| Files in the panel | Panel ke hisab se kitni files honi chahiyen |
| Leftovers | Wo objects jo kisi file se jure hue nahi — inhen delete karna mehfooz hai |
| Broken files | Panel mein file mojood hai magar bucket mein uska object nahi — link kaam nahi karega |

**Leftovers kyun bante hain:** file R2 tak pohanch jati hai lekin usay database mein save karne wali call nakaam ho jati hai (net tut gaya, tab band ho gaya). Object bucket mein para reh jata hai aur khamakha jagah khata hai.

**Safai:** upar **Clean up N leftovers** dabayen. 6 ghante se nayi cheez ko haath nahi lagaya jata, kyunki mumkin hai koi upload abhi chal raha ho. Delete se pehle list dobara banti hai, is liye jo cheez is dauran asli file ban chuki ho wo mehfooz rehti hai. Kisi public link par koi asar nahi parta.

**Broken files** nazar aayen to Old M mein ja kar us file par **Replace** karein (New M ho to Edit → Replace PDF) (nayi copy chari ho jayegi) ya usay delete kar dein.

---

# Hissa 11 — Aik sath bohat si files par kaam

Old M mein files ke aage wale checkbox lagayen, upar teen button aa jayenge:

- **Move selected** — chuni hui files kisi doosre link (ya doosre domain ke link) mein bhej dein. Naam wahi rehta hai, sirf address badalta hai — purana address foran band ho jata hai. Jis file ka naam wahan pehle se mojood ho wo chhori ja kar apni jagah reh jati hai, aur aap ko bata diya jata hai.
- **Replace selected** — nayi copies drag karein. Har nayi file usi purani file ki jagah legi jis ka **naam bilkul wahi** hai; naam aur link kuch nahi badalta. Jo dropped file kisi chuni hui file se match na kare usay chhor diya jata hai (galti se kuch overwrite na ho).
- **Delete selected** — pehle se mojood tha.

**Move** ki ijazat nayi hai: purane admin users ko ye khud ba khud nahi milti. Super admin **Users** mein ja kar us user ke liye "Move files to another link" par tick lagaye.

---

# Hissa 13 — Old M aur New M

Pehle wala **File manager** ab **Old M** kehlata hai. Us ka sab kaam pehle jaisa hai — wohi links, wohi files, wohi public download addresses.
Panel ka address `/admin/old-m` ho gaya hai; purana `/admin/files` khud wahin le jata hai.

**New M** attestation documents ke liye hai: har upload = **aik PDF** + us ki tafseelat. New M ke apne domains hain, har domain ke apne custom links, aur har document ka apna poora link aur QR code.

## 13.1 Pehle database mein tables banayen

Supabase → **SQL Editor** → **New query** → `supabase/new-m.sql` ka poora content paste karen → **Run**.

File dobara chalana hamesha mehfooz hai. Pehle chala chuke hain to bhi **dobara chalayen** — har naye version mein kuch naya hota hai
(abhi: New M ke apne domains aur links, aur `new_m_set_qr` function jo domain ya link badalne par saare documents ke naye QR
**aik hi database call** mein save karta hai — is ke baghair bhi kaam chalta hai, bas zyada documents par dheema). Jo documents pehle upload ho chuke hain wo mehfooz rehte hain: jis domain par wo bane thay
wo New M ka domain ban jata hai, us ke saath "Standard" link, aur un ka link aur QR bilkul wohi rehta hai.

Ban gaya ya nahi, ye check karen:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('new_m_records', 'new_m_options', 'new_m_officers',
                     'new_m_domains', 'new_m_link_templates', 'new_m_settings',
                     'new_m_page_settings');
```

**7 rows** aaney chahiyen (`new_m_page_settings` verification page ki design ke liye hai — Hissa 13.9). SQL chalaye baghair New M kholenge to wahan yehi hidayat likhi nazar aayegi.

## 13.2 Domains aur links (pehli dafa)

New M ke domains **alag** hain — Domains page wale domains yahan use nahi hote.

New M page → upar **Domains & links**:

1. **Add domain** → domain ya subdomain likhen, jaise `baxoq.pk` ya `verify.baxoq.pk`. Saath hi pehla link bhi bana sakte hain.
2. Har domain ke saamne **Add link** se jitne chahen links banayen. Link = domain ke **baad** ka poora hissa, jaise chahen likhen.
3. Link likhte hue jahan document ka number aana chahiye wahan **+ Attestation number** dabayen, aur jahan date aani chahiye wahan **+ Date (DDMMYYYY)**.
   Ye formula likh dete hain:

| Formula | Document ki kya value aati hai |
| --- | --- |
| `{attestation_number}` | `GEN-NMPD-SSTI-FBDS` |
| `{issue_date}` | `31102026` (DDMMYYYY) |

Misaalen:

```
/verify-general-attestation-by-qr?attestation_number={attestation_number}&issue_date={issue_date}
/attest/{issue_date}/{attestation_number}
/check?id={attestation_number}&d={issue_date}&src=qr
```

**Use the standard link** dabane se pehli misaal khud bhar jati hai. Neeche har waqt dikhta hai ke aik document ka **poora link** kaisa banega.
Link mein `{attestation_number}` na ho to warning aati hai — phir is link ke saare documents ka link aur QR aik jaisa hoga.

**Dehan rahe:** documents apne link ke saath chalte hain. Kisi domain ka naam ya kisi link ki ibarat badlenge to us par bane **saare documents
ke links badal jayenge** aur un ke naye QR purane ki jagah save ho jayenge (form pehle bata deta hai kitne documents par asar hoga).
Jo QR pehle chhap chuke hain wo purane link par hi jayenge.

- **Link delete**: us ke documents par koi asar nahi — har document ke paas apne link ki copy hai, link aur QR wohi rehte hain. Bas naye documents is link ko nahi chun sakte.
- **Domain delete**: us ke saare links **aur documents (PDF samet)** delete ho jate hain.

## 13.3 Document upload karna

Sidebar → **New M** → **Upload document**. Aik waqt mein aik PDF. Sab se naya upload list mein sab se upar aata hai.

| Khana | Kya hota hai |
| --- | --- |
| PDF | Sirf PDF file |
| Domain | New M ke apne domains mein se |
| Link | Us domain ke links mein se |
| Date of attestation | Khali chhoren to aaj ki tareekh. Link ke date formula mein `DDMMYYYY` ban kar jati hai (31-10-2026 → `31102026`) |
| Document number (7 digits) | Khali chhoren to khud random 7 digit number banta hai (jaise `4827153`). **Generate** se pehle hi nazar aa jata hai; apna 7 digit number bhi likh sakte hain. Har number New M mein aik hi dafa (Appo mein Appo ke andar aik dafa). List, search aur sticker par aata hai (Hissa 16) |
| Attestation number | Khali chhoren to khud banta hai. **Generate** dabane se pehle hi nazar aa jata hai. Apna likhna ho to format `GEN-NMPD-SSTI-FBDS` — pehle teen huroof hamesha `GEN`, phir chaar chaar capital English huroof ke teen hisse. Har number poore system mein aik hi dafa use ho sakta hai, chahe domain alag ho |
| Document type, Issuing office, Issuing authority | List se chunen, ya **+ Add new…** se naya likhen. Naya likha hua save hote hi aage hamesha list mein milega. Super admin ko list mein har saved value ke saamne **dustbin** nazar aata hai (aage dekhen) |
| Approving officer | List se officer chunen to us ka naam, designation aur signature **teeno aik saath** lag jate hain. **+ Add a new officer…** chunen to teeno ke alag khane khulte hain (naam, designation, signature image) aur ye officer aage ke liye save ho jata hai |

Poora link = `https://` + domain + link (formulas mein document ki values). Misaal:

```
https://baxoq.pk/verify-general-attestation-by-qr?attestation_number=GEN-NMPD-SSTI-FBDS&issue_date=31102026
```

## 13.4 Edit, delete aur search

- **Edit** (pencil): har cheez badli ja sakti hai — domain, link, number, date, sab tafseelat, officer. **Replace PDF** mein nayi file chunen to purani storage se hat jati hai.
  Domain, link, number ya date badalne se **poora link bhi badal jata hai**.
- **Delete** (dustbin): document aur us ki PDF dono hamesha ke liye chali jati hain.
- **Search**: upar wala aik hi box saare domains mein dhoondta hai — attestation number, 7 digit document number, document type, office, authority, officer, domain, link ka naam, file ka naam, aur date (`31102026`, `31-10-2026`, `31/10/26` ya `2026-10-31`). Saath wale dropdown se aik domain tak mehdood bhi kar sakte hain.
- **Saved values**: wahan saari saved lists aur officers nazar aate hain. Kisi ghalat value ya officer ko wahan se hata sakte hain — jo documents pehle se us ko use kar rahe hain un par koi asar nahi parta.
- **Form ke andar se hatana:** naya case add karte (ya edit karte) waqt Document type, office, authority (Appo mein har field) aur
  Approving officer ki list kholen — super admin (aur jis admin ko "Remove saved values" ki ijazat ho) ko har saved value ke saamne
  **dustbin** nazar aata hai. Dabane par aik dafa poochta hai (**Remove** / **Keep it**); Remove se woh value aage ki suggestions mein
  nahi aati, lekin jin records mein pehle se lagi hai un mein waisi hi rehti hai (koi record minus nahi hota). Agar wohi value is naye
  case mein chuni hui thi to field khali ho jata hai; edit wale record ki apni value us record mein rehti hai. Lambi list mein oopar
  search box bhi aata hai. Wohi value baad mein dobara **+ Add new…** se likh kar save karen to phir se list mein aa jati hai.

## 13.5 QR code

Har document ke **poore link** (domain/subdomain samet) ka QR code **khud ban jata hai aur document ke saath database mein save hota hai** — koi button dabane ki zaroorat nahi.

- **Upload** karte hi QR ban kar save ho jata hai.
- **Edit** mein agar wo cheez badli jo link badalti hai — **domain, link, attestation number ya date** — to naya QR banta hai aur database mein **purane ki jagah** save hota hai. Baqi cheezen (document type, office, officer, PDF) badalne se QR wesa hi rehta hai, kyunki link nahi badalta.
- **Domains & links** mein domain ka naam ya link ki ibarat badlen to us ke saare documents ke QR usi waqt naye ban kar save ho jate hain.
- List mein har document ke saamne us ka **saved** QR nazar aata hai. Us par (ya QR wale icon par) click karen to bara QR khulta hai, saath **PNG** aur **SVG** download.
- Upload / Edit form mein poore link ke saath QR ka **preview** live dikhta hai; save dabane par wohi QR database mein jata hai.
- Design aap ke diye hue sample jaisa: saada siyah-safed QR, square dabbe aur square kone, **41 × 41** (version 6), error correction **L**. Link bohat lamba ho to QR khud aik size bara ho jata hai taake scan hota rahe.
- Ye QR generator **sirf New M** ka hai. Old M ya kisi aur hisse par is ka koi asar nahi.

## 13.5a Sticker

Har document ka "General Attestation" sticker list se hi bante hain:

- **View sticker** — sticker dikhata hai, wahin se **Download PDF** (aur SVG).
- **Download PDF** — seedha PDF download (dekhe baghair). File ka naam document ke 7 digit number se banta hai, jaise
  `Certificates-4827153.pdf` (New M aur Appo dono). PDF ka page A4 jitna chaura aur sticker jitna lamba hota hai, aur sticker
  us par utna bara jitna super admin ne **Page width (A4)** se set kiya (Hissa 13A.6). Andar sticker 3 guna (ya background jitni) tezi se bana hota hai.

Sticker **har dafa document ke mojooda data** se banta hai, is liye edit ke baad agla sticker khud naya data aur naya QR dikhata hai.

Values background image par **wohi jagah, wohi font (Georgia), wohi size aur wohi siyah rang** mein aati hain jo aap ke diye hue sticker mein thin:

| Background par | Kya likha jata hai |
| --- | --- |
| "This Public Document" ke neeche | Document type (bold) |
| "2 at" ke neeche | Issuing office (bold) |
| "3 the" ke baad | Date, jaise `15th of October 2026` (bold) |
| "4 by" ke baad | Issuing authority (bold) |
| "5 No." ke baad | Attestation number (bold) |
| "Date:" ke baad | Date, jaise `15 Oct 2026` (bold) |
| Signature wala khana | Officer ki signature, aur us ke neeche designation |
| QR wala khana | Document ka saved QR code |

**Background image aur app ka hissa:** upar wali **GENERAL ATTESTATION** patti aur table ki saari lines background image mein
honi chahiyein — app inhein nahi banata. App sirf ye khud banata hai (saaf, blur ke baghair):

- Saare labels: "1 Country **Pakistan**", "This Public Document", "2 at", "3 the", "4 by", "5 No.", "Date:" — Georgia 19 px, siyah
  (sirf "Pakistan" bold, jaise asal mein tha). Labels aur values ab bilkul aik jaisa siyah rang hain. Asal ke muqable mein
  regular labels values se halke aa rahe the, is liye un par 0.2 px ki patli outline hai (values aur "Pakistan" waise hi hain).
- QR code ke gird border (1.4 px), QR ko chhoti hui — beech mein koi safed faasla nahi, jaise asal mein. Border QR ke bahar wale
  kinare ke **upar** banti hai (kinare ka 1 px dhanp leti hai). Asal ki tarah border QR ke bilkul *saath* rakhne se kone wale
  chokor mote ho jate hain aur test mein QR bilkul scan nahi hua; is tareeqe se faasle wale purane tareeqe se bhi behtar scan hota hai.

Koi value apne khane se lambi ho to wo thori chhoti likhi jati hai taake agle khane mein na ghuse.
PDF ke andar sticker 3 guna bara bana hota hai (print ke liye saaf); background bari image ho to usi ke size par.

**Font:** sticker Georgia font mein banta hai, jo Windows aur Mac mein hota hai. Android phone par font thora mukhtalif dikh sakta hai —
sticker computer se download karna behtar hai.

## 13.5b Background image (sirf super admin)

Sticker hamesha super admin ki upload ki hui background image par banta hai. App ke andar koi background nahi, aur app khud koi
background nahi banata. Jab tak image upload na ho, **View sticker** aur **Download PDF** sirf error dete hain ke background image na
hone ki wajah se sticker nahi ban sakta.

New M page par **Background image** button sirf super admin ko nazar aata hai. Wahan:

- **Upload an image or PDF / Choose a new image or PDF** — JPG, PNG ya WebP (4 MB tak), ya **PDF** (30 MB tak). PDF ka
  **pehla page** browser mein hi tasveer ban kar (lambi taraf 3200 px) upload hota hai; PDF ke kai page hon to bataya jata hai ke
  page 1 use hua. Sticker khud us page ki lambai le leta hai, aur values pehle ki tarah us par hila kar set hoti hain. Download hone
  wali PDF A4 chaudai ke page par banti hai — editor mein likha aata hai (jaise "A4-wide page 21.0 × 29.7 cm, the sticker 19.0 cm wide").
- Preview mein image ke upar list ke **pehle document ka asal data** (values, signature, QR) usi jagah dikhta hai jahan har sticker
  par aata hai. Koi document na ho to sample values.
- Image ko **mouse se ghaseet kar** kisi bhi taraf (upar, neeche, daen, baen) hilayen, **arrow keys** se 1 (Shift ke saath 10) qadam,
  aur **Zoom** se chhota/bara karen. **Reset position** wapas shuru wali jagah (poori image sticker mein). Image ka tanasub sticker
  (**958 × 761**) se alag ho to **Stretch to fit** se poori image khench kar bhi lag sakti hai.
- Jagah set karne ke baad **Crop** dabayen: image ke kinaron par safed handles aate hain. Inhein ghaseet kar image ka **izafi hissa
  kaat** dein — kata hua hissa halka (faded) dikhta hai. **Done cropping** se wapas, **Remove crop** se crop khatam.
- **Move text & QR** dabayen to har cheez ke gird dashed dabba aa jata hai. Kisi bhi dabbe ko ghaseet kar us ki jagah badlen
  (chuni hui cheez arrow keys se bhi 1, Shift ke saath 10 qadam hilti hai). Har value apne label ke saath aik set hai (jaise
  "4 by" + issuing authority), QR code apni border ke saath, aur "1 Country Pakistan" alag set. **Signature** aur **designation**
  alag alag hilte hain. **Put this one back** sirf chuni hui cheez, **Put all text & QR back** sab ko wapas asal jagah le aata hai.
  **Done moving** se wapas image hilane par.
- **Ungroup (number, fix text aur value alag alag):** Move text & QR mein kisi set (jaise "4 by" + authority) par click karen to
  **Ungroup** ka button aata hai. Dabane par us set ke **number** (jaise "4"), **fix text** (jaise "by") aur **value** ke teen alag
  dabbe ban jate hain (narangi dashed) — har aik ko alag ghaseet ya arrow keys se hila sakte hain, aur **Size** se alag chhota bara
  kar sakte hain. **Group again** dabane se sab phir aik saath hilte hain (jahan rakhe the wahin rehte hain). **Put this one back** set
  ko poori tarah asal jagah aur grouped haalat mein le aata hai. Pehle se save shuda stickers bilkul waise hi rehte hain; number
  pehli dafa hilane par bhi kuchh apni jagah se nahi hilta.
- **Fix text badalna (sirf sticker par):** set chunne par neeche **"Words of … — on the sticker only"** khana aata hai — wahan set ke
  fix text (jaise "4", "by", "Country", "Pakistan") badal sakte hain. **Restore** se asal lafz wapas, **Restore all words** se sab.
  Khali chhor dein to wo lafz sticker par nahi aata. Ye tabdeeli **sirf sticker** par hoti hai — verification page ka apna text alag
  hai (Page design se). Background par labels pehle se chhape hon (tick laga ho) to app labels nahi likhta, is liye ye khana nahi aata.
- **Size, boldness, rang, on/off (New M aur Appo dono):** Move text & QR mein koi set chunen:
  - **Size** (− / +, slider, 30% se 300%) — poora set, ya **Ungroup** kar ke us ke lafz aur value alag alag. QR code aur signature
    bhi isi se chhote/bare hote hain.
  - **How … is written** panel: har set ke **Number**, **Words** aur **Value** (ya designation, officer ka naam, 7 digit number
    jaise aik-hissa set) ki **Bold** — 9 darje (1 Light se 9 Black; "(as made)" asal wala), − / + ya list se — aur **Colour**: siyah
    se grey tak shades aik click mein (gehra ya halka), ya koi bhi rang. **Letter spacing** (haroof ke beech faasla, −5 se 20 px) aur
    **Word spacing** (alfaaz ke beech faasla, −10 se 60 px): − / + se aadha px kam ya zyada, ya khane mein likh den; 0 asal wala,
    minus mein qareeb. Value spacing ke saath apne khane se lambi ho jaye to thori chhoti likhi jati hai; Appo mein jo value lafzon ke
    baad usi line mein aati hai woh spaced lafzon ke khatam hone par shuru hoti hai. **As made** se sab wapas.
  - **QR code** chunen to **Behind the QR**: code ke bilkul peechhe wale chokor ka rang (shuru mein safed), ya **No colour** taake
    background nazar aaye. Rang halka rakhen warna phone code nahi parhega.
  - Usi panel mein **Border**: **Line round the QR code** ka tick lagayen to QR ke gird siyah line aa jati hai, tick hata den to line
    hat jati hai. Tick ho to **Thickness** slider se line patli ya moti karen (0.5 se 10 px). New M mein ye line shuru se lagi hoti
    hai (1.4 px; background par border pehle se chhapi ho to nahi), Appo mein shuru mein nahi hoti. Moti line bahar ki taraf barhti
    hai, is liye QR code ka zyada hissa kabhi nahi dhakti. **As made** se wapas shuru wali halat.
  - **On the sticker** list: har set ke saath checkbox — tick hata den to woh set har sticker se gayab, tick karen to wapas.
    **7 digit document number** ka tick hata kar dobara lagayen to woh sticker ke **upar, beech mein** aa jata hai (sticker se bahar
    chala gaya ho to bhi). Koi aur set sticker se bahar ho to woh bhi tick hata kar dobara lagane par wahin aa jata hai.
  - New M mein **Approving officer's name** naya set hai (shuru mein off): tick karen to officer ka naam designation ke neeche aata
    hai; phir hila kar, size aur bold/rang set karen.
  - Appo mein **Designation** naya set hai (shuru mein off): **On the sticker** list mein tick karen to officer ki designation
    us ke naam ke neeche aati hai; phir hila kar, size aur bold/rang set karen.
  - **7 digit document number** sticker par **Times New Roman Bold** mein likha jata hai (seedhe, aik oonchai wale number).
  - Har set ka **number** ("1", "2", "3" …) bhi ab **Times New Roman** mein likha jata hai (seedhe, aik oonchai wale number);
    lafz pehle ki tarah Georgia mein rehte hain.
- Ye sab (jagah, size, ungroup, badle hue lafz, bold, rang, spacing, on/off, QR ka rang aur border) **database** mein background ki position ke saath
  save hota hai — code mein kahin nahi. Pehle ki tarah **Save position** dabayen.
- Sab theek ho to **Use this background** (nayi image) ya **Save position** (sirf jagah/crop/text ki jagah badli ho).
  Wohi jagah aur crop save hote hain aur har sticker — screen par bhi aur download mein bhi — bilkul waisa hi banta hai.
- Nayi image purani ki jagah le leti hai; purani file storage se mita di jati hai.
- Nayi image mein **labels aur QR ki border pehle se chhape** hon to **"This image already has the labels and the QR border printed
  on it"** par tick karen — phir app un par sirf values, signature aur QR likhta hai (warna labels do dafa nazar aayenge).

Image sirf R2 bucket mein (`new-m/backgrounds/`) rehti hai, code mein **nahi** — code parhne wala use nahi dekh sakta. Sirf login
kiye hue admin ko panel ke andar milti hai.

## 13.6 Permissions

New M ki apni paanch permissions hain (Users → **New M** group):

- `Upload New M documents`
- `Edit New M documents (number, date, details, PDF)`
- `Delete New M documents`
- `Remove saved New M values and officers`
- `Add and edit New M domains and their links`

Super admin ko sab milta hai. Jis user ke paas in mein se koi bhi nahi, us ko sidebar mein New M nazar nahi aata.

## 13.7 Storage

New M ki PDFs, signatures, sticker background aur verification page ke logos bucket mein `new-m/` ke neeche rehti hain (folder ka naam badalne se pehle upload
hui files apne purane folder mein hi rehti hain aur waise hi chalti hain). **Storage** page in sab ko ginta hai, aur cleanup kabhi aisi file ko haath nahi lagata jo kisi document, saved officer, mojooda background ya page ke logo ki ho.

## 13.8 Abhi kya nahi bana

- Search by date, dashboard ke numbers aur users ke counters abhi sirf Old M ko ginte hain.

## 13.9 Verification page (front end)

Har New M document ka poora link (jaise `https://verify.example.com/verify-general-attestation-by-qr?attestation_number=GEN-PSMK-XHLI-NSML&issue_date=15102026`)
ab **verification page** kholta hai — bilkul di gayi design jaisa: header, menu, hero, "MATCHING RECORD FOUND" patti,
"General Attestation certificate" card, PDF viewer wala "Original Document Attached" card, "Verify another General Attestation"
button aur footer.

**Kaunsi value kahan aati hai** (document upload karte hue jo bhara tha):

| Page par | Document ki value |
| --- | --- |
| Patti: "Document:" ke baad | Document type |
| Patti: "Issued on" ke baad, aur "Date of issue" | Issue date (`15 Oct 2026`) |
| "Attestation number" | Attestation number |
| "Document type" | Document type |
| "Issuing office" | Issuing office |
| "Issuing authority" | Issuing authority |
| "Approving officer" | Officer ka naam (bold), neeche designation, daen taraf signature |
| "Original Document Attached" | Document ki PDF, viewer mein; **Open document** usi PDF ko nayi tab mein kholta hai |

**Page kab khulta hai:** jab address ka domain New M ka domain ho **aur** address us domain ke kisi link se milta ho. Number aur date
link ke formulas se parhe jate hain (link ke ilawa izafi `?utm=…` jaise parameters ki parwah nahi). Number/date kisi document se na
milen to wohi page **"NO MATCHING RECORD FOUND"** ke saath khulta hai. Domain ya link na mile to request pehle ki tarah Old M ko jati hai.
Har document **sirf apne domain** par dikhta hai.

**Zaroori:** New M ke har domain ka DNS is app (Vercel) ki taraf hona chahiye aur domain Vercel project mein add hona chahiye —
bilkul Hissa 7 ki tarah. Is ke baghair link khulega hi nahi.
Naya domain ya link add/edit karne ke baad pehle 30 second tak purana jawab mil sakta hai (server domains ki list thori der yaad rakhta hai).

**PDF viewer:** browser ke PDF viewer jaisa — thumbnails (☰), page number, zoom − +, fit to page / width, rotate, text likhna (Tт),
draw (pen; dobara click se rang), undo / redo, **triangle +** (visitor ke notes/drawing samet PDF ki copy save), download, print aur ⋮
menu (rotate, fit, nayi tab, full screen, document properties). Visitor ke notes sirf us ke apne browser mein rehte hain — asal
document kabhi nahi badalta. Bari PDF tukron mein parhi jati hai, is liye pehla page jaldi aa jata hai.
PDF `/api/new-m/document?number=…&date=…` se aati hai — wohi number aur date jo link mein hain.

**Document ka apna link aur naam:** har document ka aik **13 digit number** (jaise `3660176069053`) aur aik **40 character ka
random naam** (A–Z, a–z, 0–9, jaise `ddwhrO4nWtA99vRYDAnUVtWcK3aoYPJhxmbVlwLp`) hota hai — dono har document ke liye alag aur
database mein save. PDF upload hote hi R2 mein bhi isi 40 character naam se save hoti hai (asal naam se nahi). Entry edit kar ke
PDF dobara upload karen to naye PDF ka naya naam (aur naya link) ban jata hai; 13 digit number wohi rehta hai. Is se document ka
link banta hai:
`https://<domain>/storage/applications/3660176069053/documents/ddwhrO4nWtA99vRYDAnUVtWcK3aoYPJhxmbVlwLp.pdf`
- Page par file ka naam aur download hone wali file ka naam hamesha `<40 character naam>.pdf` hota hai. Upload wala asal naam sirf
  admin panel mein dikhta hai, visitor ko kabhi nahi.
- **Computer (desktop view):** "Open document" se ye link **nayi tab** mein khulta hai, PDF browser ke apne viewer mein. Tab ka
  title shuru mein document ka **40 character wala naam** hota hai (**Browser tab → PDF tab: title** se badal sakte hain), aur favicon
  wo jo **PDF tab: favicon** mein upload kiya (na ho to page wala favicon).
- **Phone (mobile view):** "Open document" aur file card ka **Open** button document **download** karte hain.
- Link sirf usi document ke apne domain par khulta hai; ghalat number/naam par "Not found". PDF seedha R2 ke chhote waqt wale link
  se aati hai (naam `<40 character naam>.pdf`), is liye Vercel ki bandwidth nahi lagti.
- Purane documents ko number aur naam `supabase/new-m.sql` chalane par khud mil jate hain; jab tak wo nahi chali, purane link chalte
  rehte hain. Purane documents ki PDF R2 mein abhi asal naam se hai — entry edit kar ke PDF dobara upload karne se R2 mein bhi naya
  40 character naam aa jata hai.

**Mobile view (phone):** 768 px se tang screen (har phone) par page ki **apni mobile design** khulti hai — di gayi mobile design
jaisi: upar logo, daftar ka naam aur **☰ (hamburger) button**; hero; "MATCHING RECORD FOUND" patti; certificate card; document card
(PDF ka icon, file ka naam aur neela **Open** button jo PDF download karta hai); "Verify another General Attestation"
aur footer. Wohi document values usi tarah apni jagah aati hain (upar wala table). **☰ par tap** se menu header ke neeche khulta hai:
header ke safed hisse ke foran neeche gehre hare rang ka panel, jis mein menu items (Home, Attestation, … Verify Document) aik ke neeche
aik; jis item ko chhuen wo halka hara ho kar neeche pale patti dikhata hai (desktop menu jaisa). **Quick links** aur "Connect with NPLS"
social icons sirf tab neeche aate hain jab Mobile view ki settings mein **Menu: also show quick links and social icons** on ho (shuru
mein off). Kisi link par, menu se bahar ya ☰ par dobara tap (ya Esc) se band hota hai.
Mobile design 360 px grid par bani hai aur **har phone** (320 px ke chhote phone se 480 px ke bare phone/foldable tak) par usi
hisaab se poori ki poori chhoti/bari hoti hai — har cheez apni jagah, koi cheez screen se bahar nahi. 540 px se zyada chori screen
(chhota tablet) par page mazeed bara nahi hota, rangeen pattiyan donon taraf phail jati hain. Mobile ke fonts desktop se alag hain,
bilkul design jaise: **Roboto** (aam text) aur **Noto Serif** ("Certificate Result", "GENERAL ATTESTATION") — dono app ke saath aate
hain, is liye iPhone aur Android par aik jaise. 768 px ya us se bari window par desktop design khulti hai.

**Har screen par (desktop):** page 1062 px ki design grid par bana hai aur window ke hisaab se poora ka poora chhota/bara hota hai — chhote
laptop se bari screen tak har cheez apni jagah. 1593 px se bari window par page mazeed bara nahi hota; rangeen patti donon taraf
phail jati hai. Fonts: Windows par asal Segoe UI / Georgia / Arial; baqi computers par unhi ke naap ke free fonts (Selawik, Gelasio,
Arimo) jo app ke saath aate hain (`public/nm-assets/fonts/`), is liye har jagah aik jaisa nazar aata hai.

### Page design editor (sirf super admin)

Sidebar → **New M page** (ya New M page par **Page design**). Yahan poora page **bilkul waisa** nazar aata hai jaisa visitor dekhta hai.

- **Desktop view / Mobile view** — do alag tabs, dono ki apni apni settings (aik view badalne se doosra nahi badalta). Jis tab mein
  unsaved tabdeeli ho us ke naam ke saath narangi nuqta aata hai.
- Page par **kisi bhi** text, button, tab (menu item), link, heading, section ka naam ya logo par **click** karen — daen taraf us ki
  settings khulti hain:
  - **Text / naam** (menu aur upar wale buttons mein Enter se do lines, jaise "Verify / Document")
  - **Link** — kahan khulega (`https://…`, `mailto:…`, `tel:…` ya `/…`); **Open in a new tab**
  - **Icon** (arrow ↗ / shield), **Width** (design ke 1062 px grid par; khali = text jitna)
  - **Hide / Show** — chhupi cheez editor mein dhaari-dar nazar aati hai taake dobara dikhayi ja sake
  - List ki cheezon (top buttons, social icons, menu, breadcrumbs, footer links) ke liye **Earlier / Later** (tarteeb),
    **Add after**, **Duplicate**, **Delete**. Har list ke aakhir mein **+** naya item jorta hai.
  - **Logo** (header, certificate, footer): **Upload logo** — PNG/JPG/WebP/GIF/SVG, 2 MB tak, **R2** mein `new-m/page/` ke neeche
    save hota hai. **Use the built-in emblem** wapas design wala emblem.
  - Internet se li gayi bahut si "transparent PNG" asal mein transparent nahi hotin — grey/white khaane (dots) tasveer ke andar bane hote
    hain aur page par logo ke peechhe dikhte. Ab upload karte waqt system ye khaane khud pehchaan kar **asal transparent** kar deta hai
    (logo, us ke white hisse samet, waisa hi rehta hai; file PNG ban kar jati hai). Aisa ho to neeche note aata hai; asal tasveer hi
    chahiye to **Upload it as it was**. Favicon aur Appo ke page par bhi yehi hota hai. Pehle se upload kiya hua dots wala logo dobara
    upload karen, phir **Save**.
  - Labels ("Attestation number" waghera) ka naam badal sakte hain; un ke neeche ki value har document se aati hai.
  - **Verification record ka har hissa — size aur jagah:** record card ki chhoti heading, title, certificate ka logo, title aur
    subtitle, har entry ke lafz (label) aur value, officer ka naam, designation, signature aur neeche wala note — kisi par bhi click
    karen to settings mein **Position, size and boldness** aata hai. **X / Y** (design pixels; teer ←↑↓→, Shift ke saath 10) se
    jagah, **Size** (− / +, slider ya % likh kar, 30% se 300% tak) se chhota/bara, aur **Bold** (− / + ya list: 100 Thin se 900
    Black tak; "(as designed)" asal wala) se text patla ya zyada bold. Logo aur signature par Bold nahi aata (tasveer hain). Chuna hua hissa (aur chuni hui entry ke lafz/value)
    page par **dashed** lakeer mein aata hai — use **mouse se ghaseet** kar bhi hila sakte hain. Bara text apne box ke andar hi
    lapet jata hai; logo bara ho to neeche wali cheezein khisak jati hain; signature apne beech se bari hoti hai. **Put back** /
    **Put all back as designed** se wapas. Desktop aur mobile ki settings alag alag hain. Phir **Save**.
  - **PDF viewer**: thumbnails khuli/band se shuru, aur toolbar ka har button dikhana/chhupana.
- **Mobile view tab:** phone ke frame mein mobile page bilkul waisa jaisa phone par. Yahan bhi **har** cheez par click se us ki settings
  khulti hain — desktop ki tarah naam, link, nayi tab, icon, hide/show, tarteeb, add/duplicate/delete, logo upload (R2).
  - **☰ button par click** (ya upar **Menu open**) se menu preview mein khul jata hai; phir har menu item par click kar ke us ka
    **naam, link, icon** badlen, hide/show, tarteeb, duplicate/delete; **+** se naya item. Menu ki koi cheez select ho to menu khula
    rehta hai. ☰ button ka naam (screen readers ke liye) aur hide/show bhi yahin.
  - **☰ button ka style:** ☰ button par click kar ke **Change the button while the menu is open** — tick karen to menu khulne par
    button ki teen lakeerein ✕ ban jati hain aur us ka dabba thora gehra ho jata hai. Tick na karen (shuru mein yehi hai) to menu
    khula ho ya band, button bilkul waisa hi ☰ rehta hai. Phir **Save**.
  - Kuch select na ho to **Mobile page settings** mein **Menu: also show quick links and social icons** — on karen to quick links,
    "Quick links" heading, "Connect with NPLS" aur social icons menu items ke neeche aa jate hain aur pehle ki tarah click se editable
    hain. Off (shuru mein) par menu sirf items dikhata hai, design jaisa.
  - **Menu panel (chaudai aur jagah):** phone preview ke oopar **Menu panel** button (ya outline mein "Menu panel — width & position",
    ya ☰ button ki settings mein) dabayen. **Width** (120 se 360), **Left – right** (baen kinare se faasla) aur **Up – down** (0 = header
    ke safed hisse ke foran neeche; zyada = neeche; minus = oopar header par) slider ya number se badlen — preview saath saath hilta
    hai. **Centre it**, **Whole width** aur **As designed** (320 / 20 / 0) ke buttons bhi hain. Naap 360 px wale mobile design ke
    hain, har phone par usi hisaab se bade/chhote hote hain. Phir **Save**.
  - **Phone width** — 320, 360 (design), 375, 390, 393, 412, 430, 480 px par dekh len ke har phone par kaisa lagta hai.
  - **Document panel** par click: phone par kya dikhe — **File card + Open button** (design jaisa) ya **PDF ke pages aik ke neeche
    aik**; file ka naam dikhana/chhupana aur **Open** button ka naam.
  - Footer links ki **Width** mobile ke 360 px grid par (khali = text jitna); row ke links design ki tarah doosri line par jate hain.
  - Kuch select na ho to **Mobile page settings**: animation on/off, **Copy wording from the desktop view** (desktop ke saare text,
    links, menu, top buttons → quick links, social icons aur logos mobile mein copy; Undo se wapas), aur **Notes**.
- Kuch bhi select na ho to daen taraf **Page settings** (animation on/off) aur **page ki har cheez ki list** — chhupi hui cheezen
  bhi — jahan se click kar ke jump kar sakte hain.
- **Browser tab (title aur favicon):** Desktop view / Mobile view ke saath wala **Browser tab** button dabayen, ya desktop preview ke
  oopar bani browser ki tab par click karen. Daen taraf:
  - **Verification page: tab title** — jo text browser ki tab (aur bookmark) mein dikhta hai, computer aur phone dono par.
  - **PDF tab: title** — computer par "Open document" se khulne wali PDF tab ka title. Shuru mein `{name}` (PDF ka 40 character
    wala naam, jaisa pehle tha).
  - Dono titles mein **Add:** ke buttons se `{attestation_number}` aur `{document_type}` daal sakte hain — har document ki tab par
    us ka apna number / type aa jata hai (maslan `Verify {attestation_number}`). Khaali chhor dein to design wala title.
  - Ye desktop view ke saath save hote hain: badal kar **Save** dabayen. Database mein rehte hain, code mein nahi.
- **Favicon** (browser tab ka chhota icon): **Browser tab** mein **Upload favicon** dabayen — ICO ya PNG behtar
  (chokor, kam az kam 48 × 48, behtareen 512 × 512), 1 MB tak. Upar chhote se tab mein dikhta hai ke visitor ko kaisa nazar aayega.
  Phir page **Save** karen. **Use the app's icon** se wapas app wala icon. Favicon R2 mein rehta hai, code mein nahi. Phone par bhi
  yahi favicon dikhta hai.
- **PDF tab: favicon:** usi jagah neeche — computer par "Open document" se jo PDF tab khulti hai, us ka alag favicon. Upload
  karen, phir **Save**. Chhote tab preview mein wohi title dikhta hai jo asal PDF tab mein aayega. **Use the
  page's favicon** se hata dein to wo tab page wala favicon dikhati hai.
- **Preview with:** kisi bhi asal document ko chun kar dekhen ke us ki values kaisi lagti hain; **Show the "no matching record" page**
  se dusri haalat dekhen.
- **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z) — har view ki apni history; **Discard changes** (dono views aakhri save par wapas);
  **Reset desktop/mobile to design** (sirf khula hua view asal design par wapas — Save tak live nahi hota); **Save** (Ctrl+S) — jo
  view badla ho wohi save hota hai.
- **Copy Appo's design:** Appo ka saved page design (dono views — text, links, buttons, logo, favicon, PDF tab ka favicon) New M ke
  editor mein le aata hai, unsaved changes ki tarah. **Verification record ki entries copy nahi hotin** — New M ke labels (Attestation
  number, Date of issue, waghera), approving officer ki designation/signature aur neeche wala note ("This verification confirms…")
  jaise thay waise rehte hain, kyun ke Appo ka ye hissa alag hai. Logo/favicon ki R2 mein New M ki apni copy banti hai. Pasand na aaye to **Undo**; **Save** tak visitors ko kuch nahi badalta.
- **Save** dabane par saara text, links, buttons ke naam aur settings **database** (`new_m_page_settings`) mein jate hain aur usi
  waqt har verification link par lag jate hain. Logo **R2** mein; jo logo hata diya ya badal diya wo R2 se mita diya jata hai — magar sirf tab jab doosra view bhi use
  istemal na kar raha ho.
  Do admin aik saath badlen to baad wale ko "reload" ka paigham aata hai — kisi ka kaam chupke se mit'ta nahi.
- Storage page aur cleanup page ke logos ko haath nahi lagate.

---

# Hissa 13A — Appo (New M ki alag copy)

**Appo** bilkul New M jaisa system hai — documents, domains aur links, saved values aur officers, QR code, sticker, verification
page (desktop + mobile), PDF tab aur page design — lekin **poori tarah alag**: is ki apni files, apne database tables (`appo_*`),
R2 mein apna folder (`appo/`) aur apni permissions. Appo mein jo bhi badlen, New M par koi asar nahi parta (aur ulta bhi).

**1. Database:** Supabase → **SQL Editor** → **New query** → `supabase/appo.sql` ka poora content paste karen → **Run**.
Dobara chalana bhi theek hai. Ye New M ki kisi table ko nahi chhuti.

**2. Permissions:** Users → user par **Manage** → **Appo** group:

- `Upload Appo documents`
- `Edit Appo documents (number, date, details, PDF)`
- `Delete Appo documents`
- `Remove saved Appo values and officers`
- `Add and edit Appo domains and their links`

Jis admin ko in mein se koi bhi permission milegi, sirf usi ko sidebar mein **Appo** tab nazar aayegi aur wohi Appo dekh aur data
daal sakega (jitni permission di, utna hi). Super admin ko sab milta hai, aur **Appo page** (verification page ka design) sirf super
admin ke liye hai — bilkul New M ki tarah.

**3. Domains:** Appo → **Domains & links** mein Appo ke apne domains add karen. Har domain ka DNS is app (Vercel) ki taraf aur
Vercel project mein add hona chahiye (Hissa 7 ki tarah). **Aik domain ya subdomain New M aur Appo dono mein na daalen** — dono mein ho
to us par New M khulta hai.

**4. Page design (super admin):** Appo ka verification page (desktop + mobile) shuru mein design ke defaults dikhata hai. New M
jaisa banane ke liye **Appo page** → **Copy New M's design** → **Copy** dabayen. New M ka saved design — dono views ke text,
links, buttons, logo, favicon aur PDF tab ka favicon — editor mein aa jayega. Preview dekh kar **Save** dabayen (pasand na aaye to
**Undo** ya **Discard changes**). Logo aur favicon ki R2 mein Appo ki apni copy banti hai, is liye baad mein kisi ek page ko
badalne se doosre par asar nahi parta. New M ka koi data is se nahi badalta. **Verification record ki entries copy nahi hotin**
(neeche wali list, certificate ka khana, officer ki designation/signature) aur un ke neeche wala note ("This verification
confirms…") bhi copy nahi hota — ye Appo ke apne hain aur jaise thay waise rehte hain.

Baqi sab kaam (upload, edit, sticker, background image, page design, favicon, PDF ka 40 character naam aur link) Hissa 13 jaisa hai,
bas New M ki jagah **Appo** tab aur **Appo page** use karen. Jo cheezen Appo mein New M se mukhtalif hain wo neeche hain.

## 13A.1 Appo ke liye database dobara chalayen

Is update ke baad `supabase/appo.sql` **dobara Run** karen (Supabase → SQL Editor). Ye:

- documents mein 3 naye khane banata hai: `signed_by`, `signed_capacity`, `seal_stamp`;
- purane "Issuing office" ko **Office city** (`office_city`) aur "Issuing authority" ko **Office name** (`office_name`) bana deta hai —
  purana data aur saved values wahi rehte hain;
- attestation number ko **koi bhi 3 capital letters** se shuru hone deta hai (purane GEN numbers bhi chalte rahte hain);
- settings mein **number prefix** (shuru mein `APN`) rakhta hai.

Jab tak ye na chale, Appo ka upload/edit "Run supabase/appo.sql again" ka paigham deta hai.

## 13A.2 Attestation number: APN aur us ka option

Naya Appo number ab **APN** se shuru hota hai, jaise `APN-NMPD-SSTI-FBDS` (Generate dabane par bhi, aur khali chhorne par auto bhi).
Super admin **Appo → Number prefix (APN)** se ye 3 letters kabhi bhi badal sakta hai (sirf A–Z, bilkul 3). Prefix database mein
save hota hai. Hath se number likhen to wo bhi isi prefix se shuru hona chahiye. Pehle se bane documents ke numbers, links aur QR
nahi badalte — wo chalte rehte hain; sirf naye ya badle gaye numbers naya prefix lete hain.

## 13A.3 Upload form ki entries

Upload / edit mein ye values aati hain (har aik ki apni saved list, jaise New M mein):

| Admin panel mein | Page par | Sticker par |
|---|---|---|
| Document type | Document Type: value (aik line, phone par 2 lines) | Document Type / value (2 lines) |
| Previously signed by | 2 Previously signed by / value | 2 previously signed by / value |
| Previous signed acting in capacity | 3 Previous Signed acting in capacity / value | 3 previous Signed acting in capacity / value |
| Bears the seal or stamp | 4 Bears the seal or stamp / value | 4 bears the seal or stamp / value |
| Office city | 5 Office City / value | 5 office City value (aik line) |
| Date | 6 Date / 29th of October 2026 | 6 date 29th of October 2026 (aik line) — aur alag "Date: 29 Oct 2026" |
| Office name | 7 Office Name / value | 7 office Name value (aik line) |
| Attestation number (APN…) | 8 Complete Number / APN-… | 8 No APN-… (aik line) |
| Approving officer | Approving officer / naam / designation, signature saath | signature, neeche officer ka **naam** |

"1 Country / Pakistan" kisi document se nahi aata — ye fix text hai: page par Page design se, sticker par Background image se badla
jata hai.

## 13A.4 Appo ka sticker

Appo ka sticker New M jaisa banta hai magar apni entries ke saath (oper ki table). **Font:** har document ki values (document type,
naam, office, APN number, signature ke neeche officer ka naam) **Poppins SemiBold** mein; dono dates ("29th of October 2026" aur
"29 Oct 2026") bilkul New M jaisi **Georgia Bold** mein; fix lafz (numbers, labels, "Pakistan") Georgia mein. Font sticker ke andar
hi shamil hota hai, is liye PNG har jagah aik jaisa banta hai. QR code ke gird **koi border line nahi** — sirf
safed chokor par QR. Signature ke neeche officer ka **naam** aata hai. Labels sticker par chhote harf se shuru hote hain
("previously signed by", "office City", "date") aur "No" bara. Har cheez ki pehli jagah aik andaze se rakhi gayi hai — apni
background image upload kar ke **Move text & QR** se har set ko us ki jagah par le aayen; zarurat ho to **Ungroup** kar ke fix
text aur value alag alag rakhen, aur lafz badlen (Hissa 13.5b mein tareeqa). Ye sab database mein save hota hai.

## 13A.5 Verification record (page par)

Page design → kisi bhi entry par click karen (ya "Everything on the page" list mein **Verification record** ke neeche):

- **Number** (jaise 2; khali = koi number nahi), **Words** (jaise "Previously signed by"), aur Country ke liye **Value** (Pakistan).
- **Layout:** *Two lines* (value neeche), *Two lines — value oopar* (value pehle, lafz neeche) ya *One line* (value lafzon ke foran
  baad — phone par jitna na samaye agli line par).
- **Date format** (sirf Date wali entry): **29th of October 2026** ya **29 Oct 2026** — jo chunen wohi page par aata hai. Banner aur
  sticker apna apna format rakhte hain.
- **Text across the box:** Left / Centre / Right — box ke andar text kis taraf ho.
- **Position and size of the text in the box:** har box ke andar number, lafz aur value (officer ke box mein naam, designation aur
  signature; certificate box mein us ka text) alag alag hilayen — X/Y likh kar, teer (←↑↓→, Shift ke saath 10) se, ya entry chun kar
  page par dashed text ko **mouse se ghaseet** kar — **Size** (− / +, slider ya %, 30% se 300%) se har aik ko chhota/bara, aur
  **Bold** (100 Thin se 900 Black) se patla ya zyada bold karen (certificate box ke text ka size aur bold us ke apne **Text size** aur
  **Bold** se; signature par Bold nahi). Baqi box apni jagah rehta hai. **Put back** / **Put all back as
  designed** se wapas. Desktop aur mobile ki jagah alag alag set hoti hai.
- **Record card ke baqi hissay:** chhoti heading, title, certificate ka logo, title, subtitle aur neeche wala note — har aik par click
  kar ke bhi **Position, size and boldness** milta hai (New M jaisa, Hissa 13.9). Signature ya designation par click karen to **Move or resize
  it — Approving officer entry…** button officer wali entry khol deta hai.
- **Earlier / Later** se entry ko list mein oper neeche karen (position badalna). **Hide from the page** se chhupayen.
- **Certificate box** (4 aur 5 ke darmiyan, sirf page par — sticker par nahi): text, font, size, bold/italic, CAPITAL, letter
  spacing, chorai (%), oonchai, kone, aur **text / background / border ke rang** (border: oopar-neeche line ya chaaron taraf).
  Shuru mein ye aap ke design jaisa hai: halka sabz band (#eaf1e5), oopar-neeche patli line (#bdccbc), beech mein **Certified**
  bold serif gehre sabz (#064b2b) mein. Desktop aur mobile ka look alag alag set hota hai, is liye phone par box ki chorai kam rakh
  sakte hain. **Back to the first look** se wapas yehi design.
- Neeche wala note ("This verification confirms…") New M ki tarah **Certificate note** par click kar ke badlen (copy karte waqt ye
  copy nahi hota) — desktop aur mobile
  dono mein.

Ye saare lafz aur settings **database** (`appo_page_settings`) mein save hote hain, code mein nahi.

---

## 13A.6 Background image: view zoom aur size

- **Sticker = background, lambai aur chaudai free (New M aur Appo dono):** sticker hamesha apni background image (ya PDF ka
  pehla page) jitna hota hai — jitna hissa crop ke baad bacha, usi zoom par. **Image size** barhayen to **image bari** hoti hai aur
  sticker ki **lambai aur chaudai dono** us ke saath barh jati hain; text, values aur QR apne size par rehte hain (image kabhi kisi
  frame se nahi katti). Kam karen to image aur sticker dono chhote. 100% wo chaudai hai jis ke liye sticker ke lafz bane hain (958).
  Image ghaseet kar ya teer se hilane, ya crop karne ke baad sticker khud image ki nayi jagah aur naap le leta hai; values, QR aur
  signature image par apni jagah rehte hain. **Reset position**: poori image 100% par. "Sticker W × H" mein naap nazar aata hai.
- **Editor ka view (New M aur Appo dono):** safed hissa **A4 page** hai (21 cm chaura) aur sticker us par usi size mein dikhta hai jis
  mein print hoga. Sticker page se chaura ho jaye to page se bahar wala hissa **gehra** dikhta hai — woh print mein kat jayega (side
  par scroll kar ke dekhen). **View** (− / +) sirf tasveer bari karta hai, sticker ya print ko nahi badalta.
- **Page width (A4) — aik slider:** text, values aur QR set karne ke baad **Page width (A4)** panel mein aik scroll se **poora
  sticker** (image, text, values aur QR — sab aik set) page par chhota ya bara karen: **White at each side** barhayen to poora sticker
  chhota hota hai aur dono taraf safed jagah barhti hai; kam karen to sticker bara aur safed jagah kam; **0** par sticker page ki
  poori chaudai leta hai (**Edge to edge**); minus mein sticker page se bara ho kar us ki sides utni kat jati hain. **Page ki lambai
  khud** sticker ke saath badalti hai — jitni bari image, utna lamba sticker aur page. Neeche likha aata hai ke sticker kitne cm chaura
  aur page kitna lamba banega. Download hone wali PDF bilkul isi page ki hoti hai (print par "Actual size" / 100%). Naya background
  upload karen to page ki safed jagah wahi rehti hai. Phir **Save position**.
- **Purane stickers:** jo sticker pehle fix size (958 × 761) ya kisi aur frame par save the, woh ab khud apni background jitne
  ban jate hain — khinchi hui image wapas sahi tanasub mein, aur values image par apni jagah. Editor kholen to neela paigham
  batata hai; sab theek ho to **Save position**. Jo sticker is slider se pehle save hue, woh pehle ki tarah (page ki poori chaudai
  par) print hote hain, jab tak slider badal kar dobara save na karen.
- **Appo mein bhi PDF:** list ka **Download PDF** aur sticker window ka **Download PDF** — PDF A4 chaudai ke page par, upar wali
  **Page width (A4)** setting ke mutabiq banti hai. Background image ki jagah **PDF** bhi upload ho sakti hai (pehla page; sticker us ki
  lambai le leta hai, values pehle ki tarah us par set hoti hain) — bilkul New M jaisa (Hissa 13.5a / 13.5b).

- **View** (− / + / Fit): sirf editor ki tasveer bari karta hai (100% se 400%). Bari karne par scroll aa jata hai, taake lambi image
  par bhi har cheez bilkul sahi jagah rakhi ja sake. Sticker ka size aur print is se nahi badalte.
- **Image size**: background image ka sticker par size (pehle "Zoom" kehlata tha).
- **Size** (Move text & QR mein): jo set chuna ho — koi value apne lafzon ke saath, ungroup kiya hua aadha hissa, QR code,
  signature ya officer ka naam — usay − / + ya slider se 30% se 300% tak chhota bara karen. **As made** se wapas asal size.
  Ye bhi database mein save hota hai.

---

# Hissa 15 — Finance khata, count, purani files aur approval

**Pehle:** Supabase → SQL Editor → `supabase/finance.sql` ka poora content paste karen → **Run** (schema.sql, new-m.sql aur
appo.sql ke baad). Dobara chalana theek hai. Jab tak ye na chale, Finance page yahi batata hai aur baqi app pehle ki tarah chalti hai.

## 15.1 Count (Users → user → Action counts)

- Ab count mein **New M documents** aur **Appo documents** bhi aate hain (Old M uploads, replaces, renames, deletes ke saath).
- **Edit**: count ko koi number kar dein. **Subtract**: count mein se khas ginti kam karen (0 se neeche nahi jata).
  **Reset**: count 0.
- **Remarks lazmi:** Subtract, Reset, aur Edit jo count kam kare — in sab ke saath remarks likhe baghair save nahi hota. Remarks
  user ke page par **Count changes** table mein (kab, kya badla, kitne rupay, kis ne) nazar aate hain.
- Har ek par pehle **warning** aati hai: count kitne se kitna hoga, aur us user ki **pending amount kitne rupay kam (ya zyada)**
  hogi. Reset ki warning mein ye bhi likha hai ke ye wapas nahi hota.
- Paisa sirf un counts se judta hai jin ki amount set hai: Old M upload, New M document, Appo document — aur sirf admin users ka
  (super admin ka koi khata charge nahi hota). Count aur pending amount aik saath badalte hain.

## 15.2 Finance (sidebar → Finance)

- **Amount for each new entry**: Old M file upload, New M document aur Appo document — har aik ki amount (Rs) likh kar **Save
  amounts**. Har nayi entry par us admin ki pending amount itni barh jati hai. Amount badalne se pehle wali entries nahi badaltin.
- **Users** table: har user ki pending aur paid amount. **Account** se us user ka khata khulta hai (Users → user page par
  "Finance account").
- User ke khate mein:
  - **Let this user see their finance account** — tick karen to user ko sidebar mein **Finance** nazar aata hai: apni pending,
    paid, history, aur **I paid the super admin** se payment request bhej sakta hai. Tick na ho to user ko kuch nazar nahi aata.
  - **Record a payment received** — cash mil jaye to amount likh kar record karen; pending se foran kam ho jati hai (pehle warning).
  - **Payment requests** — user ki bheji hui request **Accept** karen to amount pending se kam ho jati hai, **Turn down** se kuch
    nahi badalta. Finance page par sab users ki waiting requests aik jagah bhi hain.
- Ye sab sirf super admin kar sakta hai.

## 15.3 Replace ki hui file 15 din tak rehti hai

- Old M file, New M PDF ya Appo PDF replace ho to visitors ko **hamesha sirf nayi file** milti hai, magar purani file 15 din R2 mein
  rehti hai.
- Us record par (sirf super admin ko) **History** ka icon aata hai: purani aur nayi file **isi window mein saath saath** dikhti
  hain — na nayi tab, na download zaroori. Har file ke saath **Download** bhi hai.
- 15 din baad purani file R2 se khud mit jati hai (jab bhi admin panel ki list khulti hai, ghante mein aik dafa ye safai hoti hai).
- Storage page ki cleanup in rakhi hui files ko "rubbish" nahi samajhti.

## 15.4 1 mahine purane case ki edit approval se

- New M ya Appo ka document jis ki **upload date** (attestation date nahi) 1 mahine se purani ho, us mein koi admin badlao kare ya
  PDF replace kare, to wo **foran live nahi hota**. Form pehle hi batata hai, aur save par "sent for approval" aata hai.
- Jab tak approve na ho, verification page par document **pehle jaisa** hi dikhta hai.
- List mein us document par **Change waiting for approval** likha aata hai. Super admin **Review** dabaye: har field pehle/baad mein,
  aur PDF badli ho to purani aur nayi PDF saath saath. **Approve** se change live, **Turn down** se kuch nahi badalta (bheji hui
  nayi PDF mit jati hai).
- Aik document par aik waqt mein aik hi change waiting reh sakta hai. Super admin ke apne changes foran live hote hain.

# Hissa 17 — Commission users (commission par kaam karne wale)

**Pehle:** Supabase → SQL Editor → `supabase/commission.sql` ka poora content paste karen → **Run** (schema.sql, new-m.sql,
appo.sql, doc-number.sql aur finance.sql ke baad). Dobara chalana mehfooz hai. Jab tak ye na chale, Commission user bana nahi sakte
(bataya jata hai) aur baqi sab pehle ki tarah chalta hai.

## 17.1 Commission user banana

- **Users → New user → Role: Commission based.** Neeche sirf wohi permissions aati hain jo aise user ko mil sakti hain: Old M mein
  file upload, replace, rename, move aur preview; New M aur Appo mein document upload aur edit. Delete, settings, domains/links,
  search aur doosron ke cases kabhi nahi.
- Wahin **Commission** bhi likhen: har approved naye case ka kitna (Old M file, New M document, Appo document — alag alag). Baad mein
  user ke page (**Users → user → Commission account**) par badal sakte hain; naya amount aage approve hone wale cases par lagta hai,
  pehle diya hua commission waisa hi rehta hai.
- Commission user ko **sirf apne cases** nazar aate hain (list, search, dashboard, Old M ki file ginti bhi) — kisi aur ka case us ke
  liye "not found" hai.

## 17.2 Naya case aur edit — approval ke baad live

- Commission user ka **naya case** (Old M file, New M ya Appo document) save hote hi **Waiting for approval** hota hai:
  verification page, PDF aur Old M ka download link visitors ke liye **tab tak nahi khulte** jab tak super admin approve na kare.
- Super admin ke sidebar mein **Reviews** (sath mein ginti): **New cases waiting** aur **Changes waiting**. **View** se file/PDF
  dekhen, **Approve** se case live aur user ko us ka commission; **Turn down** par wajah likhna zaroori hai. Lists (Old M / New M /
  Appo) mein bhi case ke neeche wahin Approve / Turn down aata hai.
- **Turn down** kiya hua case chhupa rehta hai, user ko wajah dikhti hai. User **Edit** kar ke theek kare (save hote hi dobara review
  mein) ya **Send again** dabaye. Is par koi commission nahi.
- Approved case ki **edit** (New M/Appo ki koi field ya PDF, Old M ka replace / rename / move) bhi review mein jati hai; tab tak
  visitors ko **purana approved version** hi milta hai. Approve par change lagta hai, Turn down par kuch nahi badalta. **Edit par
  koi commission nahi.** Jo case abhi approve nahi hua us ki edit foran lagti hai aur case dobara review mein chala jata hai.

## 17.3 Finance — remaining amount aur payment

- Har approved naye case par us user ka commission **Remaining** mein jud jata hai (aik case par aik hi dafa). Approved case baad
  mein delete ho (khud, ya link/domain ke sath) to us ka commission **khud wapas** (minus) ho jata hai — history mein likha aata hai.
- **Users → user → Commission account:** Remaining, Earned, Taken back, Paid; commission ke amounts; history.
- **Show this user their Finance tab** ka tick:
  - **Tick laga:** user ke sidebar mein **Finance** aata hai. Aap **Send** se payment bhejte hain — wo user ke paas **request** ki
    tarah jati hai; user **Accept** kare to amount us ke Remaining se minus hota hai (Turn down kare to kuch nahi badalta). Jab tak
    user accept na kare, aap **Take back** se wapas le sakte hain.
  - **Tick nahi:** user ko Finance nahi dikhta, request ki zarurat nahi — **Record** dabate hi payment Remaining se minus ho jati hai.
- Payment kabhi Remaining se zyada nahi ho sakti (jo bheji ja chuki aur waiting hai woh bhi gin kar).
- **Finance** page par **Commission users** ki alag table: har user ka Remaining, Earned, Paid aur waiting payments. Admins wala
  purana hisaab (jo admin dete hain) bilkul pehle jaisa hai; commission user par entry ka koi charge nahi lagta.

# Hissa 16 — 7 digit document number

**Pehle:** Supabase → SQL Editor → `supabase/doc-number.sql` ka poora content paste karen → **Run** (new-m.sql aur appo.sql ke
baad). Ye har pehle se bane New M aur Appo record ko apna alag random 7 digit number de deta hai, aur aage har naye record ko khud
deta hai. Dobara chalana mehfooz hai — number nahi badalte. Jab tak ye SQL na chale, upload pehle ki tarah hota hai magar number
nahi banta (aur khud number likhne par yehi SQL chalane ka kehta hai).

- **Upload / Edit form:** *Document number (7 digits)* — khali chhoren to khud banta hai, **Generate** se random number pehle hi
  dekh len, ya apna 7 digit number likhen. Kisi aur document ka number ho to save par bata deta hai. Edit mein bhi badal sakte hain.
- **List:** attestation number ke neeche **Doc no. 4827153**.
- **Search:** upar wale search box mein 7 digit number (ya us ka hissa) likhen — wohi case list mein aa jata hai.
- **Sticker (New M aur Appo):** sirf number (bina kisi label ke) sticker par aata hai — shuru mein QR code ke neeche. Super admin
  **Background image → Move text & QR** mein "Document number (7 digits)" ko ghaseet kar jahan chahe rakhe, phir **Save position**.
  Appo mein **Size** se chhota/bara bhi.

# Hissa 14 — Database functions sirf server ke liye

Postgres har naye function ko **har kisi (PUBLIC)** ke liye khula rakhta hai, jab tak us se hataya na jaye. Pehle ki SQL sirf `anon` aur
`authenticated` se hatati thi, is liye Supabase ki anon key se ye functions chal sakte thay: `increment_download`,
`dashboard_stats`, `user_action_counts`, `user_action_breakdown` (aur New M ka `new_m_set_qr`).
Ab SQL files inhen PUBLIC se bhi hata deti hain aur sirf `service_role` (jo app ka server use karta hai) ko ijazat deti hain. App ka
koi kaam nahi badalta.

**Pehle se bana database:** Supabase → SQL Editor mein `supabase/schema.sql` ka poora content **dobara** chalayen (mehfooz hai).
Ya sirf ye chalayen:

```sql
revoke all on function public.increment_download(uuid)          from public, anon, authenticated;
revoke all on function public.dashboard_stats()                 from public, anon, authenticated;
revoke all on function public.user_action_counts(uuid)          from public, anon, authenticated;
revoke all on function public.user_action_breakdown(uuid)       from public, anon, authenticated;
grant execute on function public.increment_download(uuid),
                          public.dashboard_stats(),
                          public.user_action_counts(uuid),
                          public.user_action_breakdown(uuid)
   to service_role;
```

Check — `anon` ke saamne har jagah `false` aana chahiye:

```sql
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('increment_download', 'dashboard_stats',
                    'user_action_counts', 'user_action_breakdown', 'new_m_set_qr');
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
| R2 ka size panel se zyada dikh raha hai | Adhoore uploads ke leftovers hain. **Storage** page kholen aur **Clean up leftovers** dabayen |
| Kisi user ko "Move selected" button nazar nahi aata | Us ke pass `move` permission nahi. Users → user → "Move files to another link" tick karein |

---

Tafseeli reference aur poori feature list [README.md](README.md) mein hai.
