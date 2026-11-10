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
wrangler r2 create kinetic-images
```

Update `worker/wrangler.jsonc` with the returned `database_id` for `kinetic-db` (the `IMAGES` bucket binding needs no ID).

### 3. Set secrets

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

### 4. Deploy the Worker API

```bash
cd worker
wrangler deploy
```

### 5. Deploy the Pages frontend

```bash
cd frontend
wrangler pages deploy build
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
