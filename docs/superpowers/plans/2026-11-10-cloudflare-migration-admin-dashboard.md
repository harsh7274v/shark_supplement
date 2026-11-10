# Cloudflare Migration + Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the KINETIC NUTRITION backend as a Cloudflare Worker (Hono/TS + D1 + R2 + SMTP email) and add a full admin dashboard to the existing React storefront.

**Architecture:** New `worker/` directory holds the Hono app tested with `@cloudflare/vitest-pool-workers` against local D1/R2. The existing React (CRA/craco) frontend keeps its structure; `/admin/*` routes get a dark-sidebar layout; a Pages Function service-binding proxies `/api/*` so cookies stay same-origin. The old FastAPI `backend/` stays untouched until Task 19 cutover.

**Tech Stack:** Hono, TypeScript, D1 (SQLite), R2, vitest-pool-workers, `cloudflare:sockets` SMTP, recharts, React 18/CRA + Tailwind + framer-motion.

**Spec:** `docs/superpowers/specs/2026-11-10-cloudflare-migration-admin-dashboard-design.md`

## Global Constraints

- Money is **paise integers** everywhere server-side (₹2,999.00 → 299900). `discountPercent = mrp > 0 ? Math.round((mrp - sale) / mrp * 100) : 0`, never negative, never typed by hand.
- Parity constants from `backend/server.py`: access token TTL **900s**, refresh **604800s**, session_token **604800s**; cookies `httponly, secure, samesite="none", path="/"`; lockout after **4 failed** logins (5th attempt blocked) for **15 min**, message `Too many failed attempts. Try again in 15 minutes`; GST `round((subtotal - discount) * 0.05)`; shipping `0` if `(subtotal - discount) >= 999` else `79` (rupees in old code → `99900` / `7900` paise); qty `1..20`; password `6..100` chars; name `1..80`.
- All order prices are **recomputed server-side** from D1 prices; client prices are never trusted.
- Guest checkout stays: `orders.user_id` nullable.
- Every admin-changing and storefront-interactive element gets a `data-testid` (convention in `design_guidelines.json`).
- Design: admin content follows `design_guidelines.json` tokens (Outfit/Manrope, `#FF3B30` accent, light surfaces); admin sidebar is `#090D16`. WCAG AA.
- Cloudflare free tier: no Durable Objects, no paid features; keep queries bounded (one JOIN, no N+1 loops).
- Worker tests: `cd worker && npm test` (vitest-pool-workers). Frontend verification: `cd frontend && npm run build` must pass.

## Review Focus

1. **Expired access token mid-session** → client should recover via `POST /api/auth/refresh` silently, not log out. Pinned: Task 4 test `refresh issues new access cookie`.
2. **Empty dashboard after "Reset demo data"** → graphs render an empty state, never a crash. Pinned: Task 12 test `overview with zero orders returns zeroed aggregates`; Task 15 build check.
3. **Double-click on checkout submit** → must not create two orders from one click. Pinned: Task 18 parity checklist (CheckoutModal disables pay button while POST is in flight).
4. **Sale price above MRP** (or ≤ 0) → product create/update rejected `400 {"detail":"Sale price must be ≤ MRP and > 0"}`. Pinned: Task 10 test `rejects sale price above mrp`.
5. **Ordering more than stock** → rejected `400 {"detail":"Insufficient stock"}`, stock never goes negative. Pinned: Task 7 test `rejects order exceeding stock`.

---

### Task 1: Worker scaffold + shared money util

**Files:**
- Create: `worker/wrangler.jsonc`, `worker/package.json`, `worker/tsconfig.json`, `worker/vitest.config.ts`, `worker/src/index.ts`, `worker/src/env.ts`, `worker/src/lib/money.ts`
- Test: `worker/test/util.test.ts`, `worker/test/health.test.ts`

**Interfaces:**
- Produces: `Env` type (bindings `DB: D1Database`, `IMAGES: R2Bucket`; vars `JWT_SECRET`, `FRONTEND_ORIGIN`; optional `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`); `discountPercent(mrp: number, sale: number): number`; `toPaise(rupees: number): number`; Hono `app` with `/api/` health route.

- [ ] **Step 1: Write failing tests** — `util.test.ts`: `discountPercent(399900, 299900) === 25`; `discountPercent(349900, 219900) === 37`; `discountPercent(0, 0) === 0`; `discountPercent(1000, 1500) === 0` (clamped, validation is Task 10's job). `health.test.ts`: `GET /api/` → 200 `{ok: true}`.
- [ ] **Step 2: Run** `cd worker && npm test` → FAIL (files not defined).
- [ ] **Step 3: Implement** — scaffold per Files; `vitest.config.ts` uses `@cloudflare/vitest-pool-workers` with `wrangler.jsonc`, single worker; `wrangler.jsonc`: `compatibility_date: "2024-09-23"`, `compatibility_flags: ["nodejs_compat"]`, d1 binding `DB` (`database_name: "kinetic-db"`), r2 binding `IMAGES` (`bucket_name: "kinetic-images"`), vars `JWT_SECRET: "dev-secret"`, `FRONTEND_ORIGIN: "http://localhost:3000"`; enable `hono/cors` (origin `FRONTEND_ORIGIN`, `credentials: true`) so local CRA (:3000) can call wrangler dev (:8787).
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): scaffold hono worker with d1/r2 bindings and money utils"`

### Task 2: D1 schema migration

**Files:**
- Create: `worker/migrations/0001_schema.sql`
- Test: `worker/test/db.test.ts`

**Interfaces:**
- Produces: tables `users, categories, products, coupons, orders, order_items, payments, order_status_history, email_log, sessions, login_attempts, password_resets` — columns exactly as the spec's Data model section, plus: `users(id TEXT PK, email TEXT UNIQUE NOT NULL, name, picture, password_hash, role TEXT CHECK(role IN ('admin','customer')) DEFAULT 'customer', auth_provider, created_at)`; `orders(... user_id TEXT NULL REFERENCES users(id), name, email, phone, address TEXT/*JSON*/, subtotal, discount, coupon_code, gst, shipping, total, status TEXT CHECK(status IN ('placed','confirmed','shipped','delivered','cancelled')), estimated_delivery_date TEXT, created_at, updated_at)`; `order_items(... order_id REFERENCES orders(id) ON DELETE CASCADE, product_id, name, unit_price, qty, flavor, weight)`; `email_log(status TEXT CHECK(status IN ('sent','skipped','failed')))`.

- [ ] **Step 1: Write failing test** — `db.test.ts`: insert category + product (FK ok); insert order + item + cascade delete removes items; CHECK constraint rejects `status='bogus'` (expect throws).
- [ ] **Step 2: Run** `npm test` → FAIL (no tables).
- [ ] **Step 3: Write `0001_schema.sql`** — full DDL per Interfaces; configure `vitest.config.ts` `miniflare.d1Databases[].migrationsPath` so every test DB has schema.
- [ ] **Step 4: Run** `npm test` → PASS. Also run `npx wrangler d1 execute kinetic-db --local --file=migrations/0001_schema.sql` (sanity).
- [ ] **Step 5: Commit** `git commit -m "feat(worker): d1 schema for users, catalog, orders, payments, email log"`

### Task 3: Passwords, JWT, auth middleware

**Files:**
- Create: `worker/src/lib/passwords.ts`, `worker/src/lib/jwt.ts`, `worker/src/middleware/auth.ts`
- Test: `worker/test/passwords.test.ts`, `worker/test/jwt.test.ts`

**Interfaces:**
- Produces: `hashPassword(pw: string): Promise<string>` / `verifyPassword(pw: string, stored: string): Promise<boolean>` (PBKDF2-SHA256 via WebCrypto, 100_000 iters, 16-byte salt, format `pbkdf2$100000$<saltB64>$<hashB64>`); `signAccessToken(payload: {sub: string; role: string}): Promise<string>` / `signRefreshToken(...)` / `verifyToken(token: string, type: 'access'|'refresh'): Promise<TokenPayload | null>` (hono/jwt, `Env.JWT_SECRET`, TTLs 900/604800, claim `type`); middleware `getOptionalUser(c): Promise<UserPublic | null>`, `requireAuth`, `requireAdmin` (401 unauthenticated; 403 `role !== 'admin'`; reads `access_token` cookie then `Authorization: Bearer`).

- [ ] **Step 1: Write failing tests** — roundtrip verify true; wrong password false; `verifyToken(signAccessToken(p), 'access')` returns payload, `('refresh')` returns null (type mismatch); forged secret returns null; `requireAdmin` returns 403 for a customer JWT (stub context with `c.req.cookie`).
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** signatures above.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): pbkdf2 passwords, jwt tokens, auth/admin middleware"`

### Task 4: Auth routes (register, login + lockout, logout, me, refresh, forgot)

**Files:**
- Create: `worker/src/routes/auth.ts`; Modify: `worker/src/index.ts` (mount `/api/auth`)
- Test: `worker/test/auth.routes.test.ts`

**Interfaces:**
- Consumes: Task 2 tables, Task 3 libs. Produces: `POST /api/auth/register|login|logout|refresh|forgot-password`, `GET /api/auth/me`; user JSON shape `{user_id, name, email, picture, role, auth_provider}`; cookie names `access_token` (maxAge 900), `refresh_token` (604800) with Global-Constraint flags; register duplicate → `409 {"detail":"Email already registered"}`; lockout per Review Focus message on **429**; forgot-password stores `password_resets(token, email, expires_at +1h, used 0)` and returns `{reset_token}` (dev parity with old API).
- [ ] **Step 1: Write failing tests** — register→login→`/me` happy path (role `customer`, cookies set); duplicate register 409; wrong password 401 and `login_attempts.count` increments; **5 attempts → 429 with exact message even with correct password**; successful login deletes attempt row; `/refresh` with refresh cookie returns 200 and sets a new `access_token` (Review Focus #1); `/refresh` with access token → 401; forgot-password returns token and row expires in 1h.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `routes/auth.ts` — one file, small helpers; `login_attempts(identifier TEXT PK, count INTEGER, locked_until TEXT)`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): auth routes with lockout parity and refresh flow"`

### Task 5: Google OAuth (direct)

**Files:**
- Create: `worker/src/routes/auth.google.ts`; Modify: `worker/src/routes/auth.ts` (mount subroutes)
- Test: `worker/test/auth.google.test.ts`

**Interfaces:**
- Produces: `GET /api/auth/google/start` → 302 to Google consent (`client_id=Env.GOOGLE_CLIENT_ID`, `redirect_uri={origin}/api/auth/google/callback`, `scope=openid email profile`, `state` random cookie); **501** `{"detail":"Google sign-in not configured"}` when `GOOGLE_CLIENT_ID` unset; `GET /api/auth/google/callback` → code-for-token at `https://oauth2.googleapis.com/token`, decode `id_token` claims, upsert user (`auth_provider: 'google'`, role stays `customer`), insert `sessions(token PK, user_id, expires_at +7d)`, set `session_token` cookie (604800), 302 → `Env.FRONTEND_ORIGIN + '/auth/callback?login=success'`.

- [ ] **Step 1: Write failing tests** — unconfigured → 501; configured callback with mocked global `fetch` (fake token+id_token) → 302, `session_token` cookie set, user upserted with picture; second callback for same email does not duplicate user.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** — decode JWT claims with `atob` (no signature verify needed: token came from Google's token endpoint over TLS).
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): direct google oauth session flow"`

### Task 6: Catalog routes (categories, products, search, sort)

**Files:**
- Create: `worker/src/routes/catalog.ts`; Modify: `worker/src/index.ts`
- Test: `worker/test/catalog.test.ts`

**Interfaces:**
- Produces: `GET /api/categories` → `[{id, slug, name, image_url, tagline, product_count}]` (LEFT JOIN count of active products, `sort_order` asc); `GET /api/products?search=&category=<slug>&sort=&new_arrivals=1` → active products with `discount_percent`, `images`/`flavors`/`weight_options` parsed to arrays; sort map: `most_ordered`→`orders_count DESC`, `top_rated`→`rating DESC`, `price_asc`→`sale_price ASC`, `price_desc`→`sale_price DESC`, `newest`→`created_at DESC` (default `most_ordered`); `search` matches `name LIKE %q%` OR `brand LIKE %q%` (case-insensitive); `GET /api/products/:id` → 404 `{"detail":"Product not found"}` when missing/inactive.

- [ ] **Step 1: Write failing tests** — fixture: 3 products across 2 categories (one inactive, one `is_new_arrival`); category list counts actives only; search by brand fragment finds right product; each sort returns expected first id; `new_arrivals=1` filters; 404 path.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** — two route files' worth of SQL with computed `discount_percent` column expression `CASE WHEN mrp>0 THEN CAST(ROUND((mrp-sale_price)*100.0/mrp) AS INTEGER) ELSE 0 END`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): public catalog endpoints with search and sort"`

### Task 7: Coupon validate + order create (mock payment) + buyer order views

**Files:**
- Create: `worker/src/routes/orders.ts`, `worker/src/lib/pricing.ts`; Modify: `worker/src/index.ts`
- Test: `worker/test/orders.test.ts`

**Interfaces:**
- Consumes: Task 3 (`getOptionalUser`), Task 6 products. Produces:
  - `POST /api/coupons/validate {code, subtotal}` → `{valid: true, code, discount}` (percent → `min(value% of subtotal, subtotal)`; flat → `min(value, subtotal)`; inactive or `subtotal < min_order*100` → `{valid: false}`).
  - `POST /api/orders` body `{items: [{product_id, qty(1..20), flavor?, weight?}], coupon_code?, shipping: {full_name, phone, email, address, city, pincode}, payment_method: 'cod'|'upi'|'card'}` → 201 `{order_id, order_number, total}`; re-prices from D1 (`unit_price = sale_price`); `order_number = 'KN-' || (1001 + COUNT(*))`; stock check per Review Focus #5; decrement stock + `orders_count += qty`; payment row `status: 'paid'` (upi/card) | `'on_delivery'` (cod); history row `placed`; calls `sendOrderEmail(env, order, items, 'placed')` (Task 8; write the call site now, no-op import stub).
  - `GET /api/orders` (requireAuth) → own orders asc with items + history; `GET /api/orders/:id/status-history` (owner or admin).
  - `worker/src/lib/pricing.ts`: `priceOrder(items: PricedItem[], coupon: CouponRow | null): {subtotal, discount, gst, shipping, total}` — GST/shipping per Global Constraints in paise.
  - Email call site (Task 8 interface): `await sendMail(env, orderPlacedEmail(order, items), {orderId: order.id, template: 'placed'})` wrapped in try/catch.

- [ ] **Step 1: Write failing tests** — guest order (no cookies) 201, totals exact on fixture (2 products: subtotal 599800, coupon `KINETIC10`-like percent row → discount 59980, gst round((599800-59980)*0.05)=26991, shipping 0, total 565811); COD payment `on_delivery`; stock decremented; `orders_count` incremented; qty 0 and 21 → 400; stock 1, qty 2 → 400 `Insufficient stock`; logged-in order appears in own list, not in other user's list; status-history 403 for unrelated user.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** — transaction via `env.DB.batch([...statements])`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): coupon validation, order creation with mock payments, buyer order views"`

### Task 8: SMTP email transport + order templates

**Files:**
- Create: `worker/src/lib/email.ts`, `worker/src/lib/email-templates.ts`; Modify: `worker/src/routes/orders.ts` (status-change emails — full wiring lands with Task 11's PATCH)
- Test: `worker/test/email.test.ts`

**Interfaces:**
- Consumes: Task 7 order rows. Produces:
  - `sendMail(env: Env, msg: {to: string; subject: string; html: string}): Promise<'sent'|'skipped'|'failed'>` — returns `'skipped'` without `Env.SMTP_HOST`; otherwise minimal SMTP client over `connect()` from `cloudflare:sockets` (implicit TLS on port 465, STARTTLS otherwise): EHLO → AUTH PLAIN (`base64(user:pass)`) → MAIL FROM `Env.SMTP_FROM` → RCPT TO → DATA → QUIT; writes `email_log(order_id, to_email, template, status, error)` — caller passes `orderId`/`template`; failures caught, never throw.
  - `orderPlacedEmail(order, items)` and `orderStatusEmail(order, status, eta?: string)` → `{subject, html}` (inline-styled, brand red header, order number + totals table; shipped email shows `Estimated delivery: <eta>`).

- [ ] **Step 1: Write failing tests** — with `vi.mock` fake socket transport: placement call logs `email_log` row `sent` to shipping email; unconfigured env → `skipped` row, no throw; template subjects contain order number; shipped template contains the ETA string.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** signatures above (transport injectable: `sendMail(env, msg, transport?)`).
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): smtp transport, order email templates, email log"`

### Task 9: Admin image upload (R2) + image serving

**Files:**
- Create: `worker/src/routes/uploads.ts`; Modify: `worker/src/index.ts`
- Test: `worker/test/uploads.test.ts`

**Interfaces:**
- Consumes: Task 3 `requireAdmin`. Produces: `POST /api/admin/uploads` (multipart field `file`; `content-type` must start `image/`; size ≤ 10MB else `413 {"detail":"File too large"}`) → key `products/${crypto.randomUUID()}.${ext}` → `{url: "/api/images/" + key}`; `GET /api/images/:key` → R2 object bytes with `Content-Type` + `Cache-Control: public, max-age=31536000, immutable`, 404 when absent. (Same-origin via Pages proxy in Task 19 makes this URL valid in prod; in tests use absolute path.)

- [ ] **Step 1: Write failing tests** — admin uploads PNG bytes → 200 `{url: "/api/images/products/<uuid>.png"}`; GET roundtrips identical bytes + content-type; non-admin 403; 11MB → 413; `text/plain` → 400.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): r2 image upload and serving"`

### Task 10: Admin products + categories CRUD

**Files:**
- Create: `worker/src/routes/admin.ts`, `worker/src/routes/admin.categories.ts`; Modify: `worker/src/index.ts`
- Test: `worker/test/admin.products.test.ts`, `worker/test/admin.categories.test.ts`

**Interfaces:**
- Consumes: Task 3 `requireAdmin`, Task 9. Produces:
  - `GET/POST/PATCH/DELETE /api/admin/products` — POST body `{name, brand, description, category_id, mrp, sale_price, stock, images: string[], flavors: string[], weight_options: string[], badge: 'none'|'new'|'hot', is_new_arrival: 0|1, is_active: 0|1}`; validates Review Focus #4 (`400 {"detail":"Sale price must be ≤ MRP and > 0"}`), `stock >= 0`; `slug = kebab(name)`, dedupe with `-2` suffix; writes `discount_percent` via Task 1 util; PATCH partial; DELETE = soft (`is_active = 0`).
  - `GET/POST/PATCH/DELETE /api/admin/categories` — `{slug?, name, image_url, tagline, sort_order}`; DELETE with `product_count > 0` → `400 {"detail":"Category has products"}`.

- [ ] **Step 1: Write failing tests** — create product (mrp 399900, sale 299900) → stored `discount_percent = 25`; appears in `GET /api/products`; sale>mrp 400; PATCH sale price recomputes %; DELETE hides from public list but row persists; non-admin 403. Category create/list/patch; delete-with-products 400.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): admin product and category crud with discount validation"`

### Task 11: Admin orders (list/detail/patch) + payments list

**Files:**
- Modify: `worker/src/routes/admin.ts`
- Test: `worker/test/admin.orders.test.ts`

**Interfaces:**
- Consumes: Tasks 7, 8. Produces:
  - `GET /api/admin/orders?status=&q=` — all orders desc, `q` matches order_number/customer name/email; each row with item count + payment summary; `status='placed'` rows first within their day (client highlights).
  - `GET /api/admin/orders/:id` — detail: customer, address, items, payment, `status_history`, `email_log`.
  - `PATCH /api/admin/orders/:id` body `{status?, shipping?, estimated_delivery_date?}` — `shipping` replaces the whole contact+address block (name/phone/email/address/city/pincode), allowed only while `placed` (else `400 {"detail":"Order can no longer be edited"}`); legal status transitions `placed→confirmed→shipped→delivered`; `cancelled` only from `placed|confirmed` (else `400 {"detail":"Cannot cancel after shipping"}`); cancel restores `stock += item.qty` and unpaid payment → `'cancelled'`; `shipped` sets `estimated_delivery_date` (body value or `now+5 days`); every change appends `order_status_history` and sends `orderStatusEmail` via Task 8.
  - `GET /api/admin/payments` — join `orders` for `order_number`; desc by `created_at`.

- [ ] **Step 1: Write failing tests** — placed→confirmed→shipped: ETA defaulted (+5d, exact ISO date assert), shipped email logged; cancel from shipped → 400; cancel from placed: stock restored to original, payment `cancelled`, cancel email logged; shipping/contact PATCH while `delivered` → 400 `{"detail":"Order can no longer be edited"}`; payments list returns fixture rows with order numbers.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): admin order pipeline, cancel semantics, payments list"`

### Task 12: Admin overview aggregates + demo reset + coupons CRUD

**Files:**
- Modify: `worker/src/routes/admin.ts`
- Test: `worker/test/admin.overview.test.ts`, `worker/test/admin.coupons.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/admin/overview?days=30` → `{stats: {revenue, orders, avg_order, low_stock}, revenue_by_day: [{date, total}], orders_by_status: [{status, count}], top_products: [{name, qty}]}` — aggregates over orders `status != 'cancelled'` within `days`; `low_stock` = active products `stock <= 10`; revenue = SUM(total); `revenue_by_day` uses `DATE(created_at)`; `top_products` from `order_items` GROUP BY name.
  - `POST /api/admin/demo-data/reset` → deletes `order_items, payments, order_status_history, email_log, orders` (Review Focus #2: zeroed response when called twice).
  - `GET/POST/PATCH/DELETE /api/admin/coupons` — `{code, discount_type: 'percent'|'flat', discount_value, min_order, active}`; code uppercased unique.

- [ ] **Step 1: Write failing tests** — fixture orders across 3 days + 1 cancelled: revenue excludes cancelled; `avg_order = round(revenue/orders)`; `low_stock` counts `stock <= 10`; `top_products` ordered by qty; reset empties the five tables, products/coupons untouched, second call returns zeroed aggregates; coupon CRUD + duplicate code 409.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): overview aggregates, demo reset, coupon crud"`

### Task 13: Seed data (catalog + demo orders)

**Files:**
- Create: `worker/seed/001_catalog.sql`, `worker/seed/002_demo_orders.sql`, `worker/scripts/hash-password.mjs`
- Test: `worker/test/seed.test.ts`

**Interfaces:**
- Consumes: Task 2 schema. Produces: idempotent seed SQL — `INSERT OR IGNORE` on unique keys. Catalog copies `backend/server.py` `CATEGORIES` (7, `image_url = '/api/images/seed/<slug>.jpg'`, taglines verbatim) and all 18 products from `seed_products()` (names, brands, flavors, weights, badges, ratings, orders_count verbatim; rupee prices × 100; `is_new_arrival = 1` where badge `NEW`); coupons KINETIC10/WELCOME15/MUSCLE500 (`min_order × 100`); users admin (`role='admin'`) + `athlete.test@kineticnutrition.com` — password hashes pre-generated by `hash-password.mjs` (uses WebCrypto via Node ≥18, same PBKDF2 format as Task 3) and pasted into the SQL as literals. Demo orders: ~30 orders over `date('now', '-21..0 days')`, distributed `delivered` (majority), `shipped`, `confirmed`, `placed`, 2 `cancelled`; items reference seeded product ids by subquery on slug; payments match (`paid` unless undelivered COD → `on_delivery`); history rows for each status.

- [ ] **Step 1: Write failing test** — run both seed files in test setup, then: `GET /api/products` (Task 6 route) returns 18 active; admin user login via Task 4 route succeeds; `GET /api/admin/overview` returns `orders > 20`, `revenue > 0`, `revenue_by_day` length ≥ 14.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Write SQL + hash script**; apply locally: `npx wrangler d1 execute kinetic-db --local --file=seed/001_catalog.sql` then `--file=seed/002_demo_orders.sql`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(worker): idempotent catalog seed and 3 weeks of demo orders"`

### Task 14: Frontend wiring — api client, admin routes, role link

**Files:**
- Modify: `frontend/src/lib/api.js` (baseURL: `process.env.REACT_APP_BACKEND_URL || ''` + `/api`), `frontend/src/context/AuthContext.jsx` (expose `user.role`), `frontend/src/components/Header.jsx` (admin link when `role === 'admin'`, `data-testid="admin-dashboard-link"`), `frontend/src/App.jsx` (lazy routes `/admin/*` → `AdminLayout` guard `role !== 'admin'` → `<Navigate to="/" />`; `/my-orders`), `frontend/src/components/AuthModal.jsx` (Google button rendered only when `process.env.REACT_APP_GOOGLE_ENABLED === 'true'`), `frontend/.env` (dev: `REACT_APP_BACKEND_URL=http://localhost:8787`)
- Create: `frontend/src/pages/admin/AdminLayout.jsx` (placeholder shell this task)

- [ ] **Step 1: Implement** the edits (no unit tests in CRA app; build is the gate).
- [ ] **Step 2: Run** `cd frontend && npm run build` → passes.
- [ ] **Step 3: Manual check** — `cd worker && npx wrangler dev` + `npm start`: login as `admin@kineticnutrition.com` / `KineticAdmin@2026` → header shows **Admin Dashboard** link → `/admin` renders placeholder; customer login shows no link; direct `/admin` as customer redirects home.
- [ ] **Step 4: Commit** `git commit -m "feat(frontend): admin route guard, role link, google flag"`

### Task 15: Admin shell + Overview screen

**Files:**
- Create: `frontend/src/pages/admin/Overview.jsx`; Modify: `frontend/src/pages/admin/AdminLayout.jsx` (full shell)
- Deps: `cd frontend && npm i recharts`

**Interfaces:**
- Consumes: `GET /api/admin/overview`, `POST /api/admin/demo-data/reset`. Produces: `AdminLayout` — fixed dark sidebar `#090D16` (nav: Overview, Products, Categories, New Arrivals, Orders, Payments, Coupons; active item red `#FF3B30` left-border + white text; top bar with "View store", admin email, logout), `<Outlet/>` content area on `#F8FAFC`. `Overview` — 4 stat cards (Revenue, Orders, Avg. Order, Low Stock ≤ 10), `AreaChart` revenue-by-day, `BarChart` orders-by-status, horizontal `BarChart` top products (all recharts, `#FF3B30`/`#FF6B00` series), demo-data banner + `data-testid="reset-demo-data"` button (confirm → reset → refetch; empty state text "No sales yet" when zero).

- [ ] **Step 1: Implement** shell + Overview per Interfaces, motion transitions per design guidelines.
- [ ] **Step 2: Verify** — build passes; with wrangler dev + seeded data, charts render; after Reset demo data, empty states render (Review Focus #2).
- [ ] **Step 3: Commit** `git commit -m "feat(frontend): admin shell and overview dashboard with charts"`

### Task 16: Admin Products (+New Arrivals tab) + Categories screens

**Files:**
- Create: `frontend/src/pages/admin/Products.jsx`, `frontend/src/pages/admin/ProductForm.jsx`, `frontend/src/pages/admin/Categories.jsx`; Modify: `AdminLayout.jsx` (routes; New Arrivals = `Products` with `tab="arrivals"`)

**Interfaces:**
- Consumes: Task 9 uploads, Task 10 CRUD. Produces:
  - Products table: cover thumb, name/brand, category, MRP, sale, `discount%` badge (from API), stock (red when ≤10), badge, active toggle; search box; `data-testid="admin-add-product"`.
  - `ProductForm` (modal over table; fields per Task 10 body): image dropzone + preview grid (`data-testid="admin-product-image-input"`; upload → url append; first image tagged COVER, click to promote), name/brand/description, category chips (single-select), MRP + sale price inputs with live `data-testid="admin-product-discount-badge"` (`37% OFF`) using the Global-Constraint formula, flavors + weights comma-separated inputs, badge select, New Arrivals toggle (`data-testid="admin-new-arrival-toggle"`), Save (`data-testid="admin-product-save"`) → POST/PATCH.
  - Categories: grid of cards (image, name, tagline, count) + create/edit modal.

- [ ] **Step 1: Implement** the three screens.
- [ ] **Step 2: Verify** — build passes; manual: create product with 2 uploaded images, MRP 3999 / sale 2199 → badge shows 37% OFF (₹-formatted), appears on storefront shop list; toggle New Arrivals → home section gains it.
- [ ] **Step 3: Commit** `git commit -m "feat(frontend): admin products, image uploads, categories screens"`

### Task 17: Admin Orders + Payments + Coupons screens

**Files:**
- Create: `frontend/src/pages/admin/Orders.jsx`, `frontend/src/pages/admin/OrderDetail.jsx`, `frontend/src/pages/admin/Payments.jsx`, `frontend/src/pages/admin/Coupons.jsx`; Modify: `AdminLayout.jsx`

**Interfaces:**
- Consumes: Task 11 + Task 12 endpoints. Produces:
  - Orders: status filter chips (Placed first), search, rows `data-testid="admin-order-row-{id}"`; `placed` rows highlighted.
  - `OrderDetail` (right drawer): customer block, address form (editable while `placed`, `data-testid="admin-order-address-save"`), items, payment summary, pipeline buttons `Confirm/Ship/Deliver` + `Cancel` (`data-testid="admin-order-action-confirm|ship|deliver|cancel"`; Ship opens ETA input defaulting +5 days), status-history timeline, per-order email log.
  - Payments: table (id, order, method, amount, status pill, date) + total row. Coupons: table + form modal (code, type, value, min order, active).

- [ ] **Step 1: Implement** the four screens.
- [ ] **Step 2: Verify** — build passes; manual: place order from storefront → appears highlighted in admin; Confirm → Ship (ETA) → Deliver; buyer email logged (or `skipped` without SMTP); cancel restores stock (verify product stock in admin).
- [ ] **Step 3: Commit** `git commit -m "feat(frontend): admin orders pipeline, payments, coupons screens"`

### Task 18: Buyer My Orders + New Arrivals wiring + storefront parity

**Files:**
- Create: `frontend/src/pages/MyOrders.jsx`; Modify: `frontend/src/components/NewArrivals.jsx` (fetch `?new_arrivals=1`), `frontend/src/components/CheckoutModal.jsx` (disable pay button while POST in flight — Review Focus #3), `frontend/src/components/Header.jsx` (user-menu link "My Orders")

**Interfaces:**
- Consumes: `GET /api/orders`, `GET /api/orders/:id/status-history`. Produces: `MyOrders` (`data-testid="my-orders-page"`) — order cards with items, totals, vertical timeline of `status_history`, ETA shown when `estimated_delivery_date` set; guest orders surface only on the post-checkout confirmation screen (unchanged).

- [ ] **Step 1: Implement**.
- [ ] **Step 2: Verify** — build passes; full parity walk with wrangler dev: hero → categories filter → new arrivals reflects admin toggles → shop sorts → cart + coupon KINETIC10 → checkout COD → confirmation id → My Orders timeline (admin status change visible).
- [ ] **Step 3: Commit** `git commit -m "feat(frontend): buyer my-orders timeline and new arrivals wiring"`

### Task 19: Pages deployment + cutover

**Files:**
- Create: `frontend/functions/api/[[route]].js` (`export const onRequest = (ctx) => ctx.env.API.fetch(ctx.request)`), `frontend/wrangler.toml` (pages config, service binding `API = "kinetic-api"`, `pages_build_output_dir = "build"`), `worker/.dev.vars.example`
- Modify: `README.md` (new stack, local dev, deploy steps, SMTP/Google config, credentials)
- Delete: `backend/`, `docker-compose.yml`
- Update: `memory/test_credentials.md` (same credentials, note D1)

- [ ] **Step 1: Full worker suite** — `cd worker && npm test` → all PASS.
- [ ] **Step 2: Build + deploy prep** — `cd frontend && npm run build`; `npx wrangler d1 execute kinetic-db --local --file=migrations/0001_schema.sql` sanity; write `.dev.vars.example` documenting every Env var.
- [ ] **Step 3: Cutover** — delete `backend/`, `docker-compose.yml`; rewrite README (deploy: `wrangler login` → `wrangler d1 create`/`r2 create` → secrets (`JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `GOOGLE_CLIENT_ID/SECRET`, `SMTP_*`) → `wrangler deploy` → `wrangler pages deploy`); note Google button stays hidden until `REACT_APP_GOOGLE_ENABLED=true`.
- [ ] **Step 4: Commit** `git commit -m "chore: cut over to cloudflare workers stack, remove fastapi backend"`
