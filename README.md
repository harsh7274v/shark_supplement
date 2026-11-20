# KINETIC NUTRITION — Premium Gym Supplements Web Store

A full-stack e-commerce web application engineered for high-performance athletic supplements, built with **React**, **Tailwind CSS**, **Framer Motion**, **Cloudflare Workers** (Hono), **D1**, **R2**, and **Cloudflare Pages**.

---

## 📁 Project Structure

```
shark_supplement/
├── worker/
│   ├── src/                  # Hono API (auth, catalog, orders, uploads, admin)
│   ├── migrations/           # D1 schema (0001_schema.sql)
│   ├── seed/                 # Idempotent catalog & demo-order seed SQL
│   ├── test/                 # Vitest suite (293 tests, Workers runtime)
│   ├── wrangler.jsonc        # Worker config (D1 `DB`, R2 `IMAGES`, vars)
│   └── .dev.vars.example     # Documented environment variables
├── frontend/
│   ├── functions/api/        # Pages functions: /api/* → Worker service binding
│   ├── wrangler.toml         # Pages config (service binding `API`, build dir)
│   ├── src/                  # React app (components, context, lib, pages)
│   ├── public/
│   ├── index.html
│   ├── vite.config.js
│   └── tailwind.config.js
├── memory/
│   ├── PRD.md                # Project requirements & architecture document
│   └── test_credentials.md   # Pre-seeded admin, customer, and coupon credentials
├── design_guidelines.json    # UI/UX design specification & color tokens
├── auth_testing.md           # Playbook for testing JWT and OAuth endpoints
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18+ (v20+ recommended)
- **Wrangler**: `npm install -g wrangler` (or use `npx wrangler`)

---

### 1. Local development — Worker (API)

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # fill in JWT_SECRET, FRONTEND_ORIGIN, etc.
npm run dev                      # wrangler dev — http://localhost:8787
```

Apply the D1 schema locally (one-time):

```bash
npx wrangler d1 execute kinetic-db --local --file=migrations/0001_schema.sql
```

Run the test suite (293 tests, Workers runtime):

```bash
npm test
```

### 2. Local development — Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm start                        # vite — http://localhost:3000
```

The frontend calls the Worker at `http://localhost:8787` (`REACT_APP_BACKEND_URL` / `VITE_BACKEND_URL` in `frontend/.env`). Run both terminals side by side.

---

## ☁️ Deploy to Cloudflare

### 1. Log in

```bash
wrangler login
```

### 2. Create the D1 database and R2 bucket

```bash
wrangler d1 create kinetic-db
wrangler r2 bucket create kinetic-images
```

Update `worker/wrangler.jsonc` with the returned `database_id` for `kinetic-db` (the `IMAGES` bucket binding needs no ID).

### 3. Run migrations and seed remote D1 database

```bash
cd worker
npx wrangler d1 execute kinetic-db --remote --file=migrations/0001_schema.sql
npx wrangler d1 execute kinetic-db --remote --file=migrations/0002_storefront_variants_sales.sql
npx wrangler d1 execute kinetic-db --remote --file=seed/001_catalog.sql
```

### 4. Upload all catalog images to Cloudflare R2 object storage

```bash
cd worker
npm run sync:images:remote
```

This synchronizes all 17 product, category, and banner images from `frontend/public/images/` directly into the remote `kinetic-images` R2 bucket under `catalog/`, served via `/api/images/catalog/...`.

### 5. Set secrets

```bash
wrangler secret put JWT_SECRET
wrangler secret put ADMIN_EMAIL
wrangler secret put ADMIN_PASSWORD
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SMTP_HOST
wrangler secret put SMTP_PORT
wrangler secret put SMTP_USER
wrangler secret put SMTP_PASS
wrangler secret put SMTP_FROM
```

See `worker/.dev.vars.example` for what each variable does.

### 6. Deploy the Worker API

```bash
cd worker
wrangler deploy
```

### 7. Deploy the Pages frontend

```bash
cd frontend
npm run build
wrangler pages deploy dist
```

`wrangler.toml` binds Pages functions at `/api/*` to the `kinetic-api` Worker service via `[[services]] binding = "API"`, so the frontend and API share one Pages domain.

---

## 🔑 Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DB` | yes | D1 database binding (set in `wrangler.jsonc`) |
| `IMAGES` | yes | R2 bucket binding (set in `wrangler.jsonc`) |
| `JWT_SECRET` | yes | Signs access / refresh tokens (`wrangler secret put`) |
| `FRONTEND_ORIGIN` | yes | CORS origin for the frontend (cookies use `SameSite=None`) |
| `GOOGLE_CLIENT_ID` | no | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | no | Google OAuth client secret (`wrangler secret put`) |
| `SMTP_HOST` | no | Outgoing mail host (mails skipped & logged when unset) |
| `SMTP_PORT` | no | Submission port (default 587) |
| `SMTP_USER` | no | SMTP username (`wrangler secret put`) |
| `SMTP_PASS` | no | SMTP password (`wrangler secret put`) |
| `SMTP_FROM` | no | From address for outgoing mail |

### Google sign-in
The "Continue with Google" button in the auth modal stays **hidden** until the frontend is built with `REACT_APP_GOOGLE_ENABLED=true` (set in `frontend/.env`).

---

## 🔑 Test credentials

See `memory/test_credentials.md` for the pre-seeded admin, customer, and coupon credentials. The admin account is created by the idempotent catalog seed (`worker/seed/001_catalog.sql`) and applied on deploy / via `POST /api/admin/demo-data/seed`.

<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 45 00 AM" src="https://github.com/user-attachments/assets/bbb327be-b9bd-4776-b533-72aee27a130b" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 45 11 AM" src="https://github.com/user-attachments/assets/ef2c00a1-0dcb-4e99-8c34-1b341a404dea" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 45 19 AM" src="https://github.com/user-attachments/assets/191689d5-430f-4526-bc55-efd618c395e7" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 45 33 AM" src="https://github.com/user-attachments/assets/4ec7994e-33f1-480f-ab11-f6625e7fe779" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 45 50 AM" src="https://github.com/user-attachments/assets/16deac27-9e29-4274-9ac3-3fea8dee28ff" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 46 10 AM" src="https://github.com/user-attachments/assets/5386cec0-d9de-432b-822b-3065182e257b" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 46 16 AM" src="https://github.com/user-attachments/assets/33bd87d1-841c-497f-9954-4b10ee381990" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 46 37 AM" src="https://github.com/user-attachments/assets/35977bf5-1892-4888-9975-557354b54e94" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 47 05 AM" src="https://github.com/user-attachments/assets/6272e854-a7e4-4204-9809-56fac56dd747" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 47 11 AM" src="https://github.com/user-attachments/assets/1a6066b7-9ea1-417c-aaa7-4408ff6b4462" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 47 17 AM" src="https://github.com/user-attachments/assets/c2ef299b-4931-4b86-826a-d2c43af9a682" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 47 22 AM" src="https://github.com/user-attachments/assets/864adea8-ea50-4a1f-b0b9-7632bbd9e98b" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 47 28 AM" src="https://github.com/user-attachments/assets/b99c86bf-a36d-4356-9f9b-91139f4cfb00" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 47 34 AM" src="https://github.com/user-attachments/assets/96cf4df1-7254-4292-8f34-643ca5b9da23" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 47 45 AM" src="https://github.com/user-attachments/assets/6d2f4d6c-57dc-407f-983d-1535dbcd7772" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 47 52 AM" src="https://github.com/user-attachments/assets/9b0ccfe2-97e2-443b-b9fa-9eb8a277dd87" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 48 09 AM" src="https://github.com/user-attachments/assets/dccb4604-ea55-4573-b02b-13c5b0f52b8c" />
<img width="1470" height="956" alt="Screenshot 2026-11-21 at 12 48 23 AM" src="https://github.com/user-attachments/assets/5cdce26e-8f84-4633-a7a1-c74df7c8ad1b" />
![Uploading Screenshot 2026-11-21 at 12.41.29 AM.png…]()

