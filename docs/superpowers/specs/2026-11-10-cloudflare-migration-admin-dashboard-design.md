# Design — Cloudflare Migration + Admin Dashboard (KINETIC NUTRITION)

Date: 2026-11-10
Status: Draft for approval

## Intent and why

KINETIC NUTRITION is a working gym-supplement e-commerce store: React storefront (CRA/craco, Tailwind, framer-motion, Lenis) over a FastAPI + MongoDB backend. The owner wants to move the entire app onto the Cloudflare free-tier stack — **Pages** (frontend), **Workers** (backend), **D1** (database), **R2** (product images) — and then add a full **admin dashboard** so they can run the store end to end: create products with images and pricing, manage categories and new arrivals, oversee sales with graphs, and manage orders and payments through to delivery — with buyers (guests included) notified of every order update by email.

Success looks like: the same storefront experience running on Cloudflare, and the owner able to log in, add a product with photos, set MRP and sale price, and watch the discount %, storefront listing, sales graphs, and order pipeline all work — with zero MongoDB or Python left in the runtime path. Buyers get email updates on their orders whether they checked out as guests or logged-in users.

## Goals

1. **Migration**
   - Frontend deploys to Cloudflare Pages (static build of the existing React app; keep Tailwind, framer-motion, Lenis, React Query, axios client patterns).
   - Backend rewritten as a Cloudflare Worker in **TypeScript with Hono**, preserving the existing REST surface and behavior (`/api` prefix): auth (register, login, logout, me, refresh, forgot-password, Google OAuth), categories, products (list/detail with category filter + sort), coupon validate, order create, user's orders list.
   - Data moved to **D1** (SQL). Demo catalog re-seeded: 7 categories, 18 products, 3 coupons, admin + test customer, plus ~3 weeks of demo orders and payments so the dashboard's graphs and pipeline are alive on day one. Demo data is clearly labeled in the admin Overview, and a "Reset demo data" action (with confirm dialog) on the Overview screen wipes orders/payments back to zero.
   - Product images stored in **R2**; admin uploads land in R2, storefront loads them by public URL.
   - Local dev via `wrangler dev` (local D1 + R2 simulation) so the whole thing runs on the developer machine before any deploy.
2. **Auth on the new stack**
   - Email + password: JWT access/refresh in httpOnly cookies (Web Crypto / hono-jwt), bcrypt-equivalent hashing (e.g. PBKDF2 via WebCrypto or `@noble/hashes` scrypt), brute-force lockout parity (`login_attempts`, lock after 4 fails).
   - Google sign-in: **direct Google OAuth** (authorization-code flow, server session exchange, `session_token` cookie, 7-day TTL). Client ID/secret come from the owner's Google Cloud project; they are not yet provided — the build wires the flow behind config placeholders and email/password works fully without it.
3. **Admin dashboard** at `/admin` (same React app, separate layout), gated by the existing `role: "admin"` claim:
   - **Login integration**: the existing login option/modal stays; when an admin-role user logs in, the user menu gains an "Admin Dashboard" entry; visiting `/admin` while not admin redirects home.
   - **Overview**: stat cards (revenue, orders, average order value, low-stock count = stock ≤ 10) + graphs — revenue by day, orders by status, top-selling products — implemented with recharts, styled per design guidelines.
   - **Products**: table + create/edit form. Fields: name, brand, description, category (chip select), multiple images (drag-drop upload → R2, first image = cover), **MRP** and **sale price** as two numeric inputs — **discount % is always computed** (`round((mrp - sale)/mrp * 100)`) and shown as a live badge in the form, in the admin table, and on the storefront card; flavor and weight variant options (storefront variant selector parity), badge (none/NEW/HOT), stock quantity; active toggle.
   - **New Arrivals**: a per-product "Show in New Arrivals" toggle. The home-page New Arrivals section renders toggled products, newest first. (No separate screen needed beyond a filter/tab in Products.)
   - **Categories**: CRUD for the category list (name, slug, icon, sort order).
   - **Orders**: filterable/searchable table (order #, customer, items, total, method, status); new "placed" orders highlighted. Detail view shows customer, shipping address (editable while status = placed), items, payment summary, and a status pipeline **Placed → Confirmed → Shipped → Delivered** plus **Cancel** (cancel not allowed once delivered). Every status change is timestamped and stored as a status history the buyer can see, and triggers an email to the buyer's address. Marking an order **Shipped** sets an estimated delivery date (admin-editable, default +5 days) that appears in the email and the buyer timeline.
   - **Payments**: flat table of payments — id, order, method (COD/UPI/Card), amount, status (PAID / ON DELIVERY for COD / REFUNDED when an order is cancelled after paying), date. These records feed Overview.
   - **Coupons**: CRUD for the existing coupon system (code, % or flat, min order, active).
   - **Buyer side**: a simple "My Orders" page on the storefront where the buyer sees their orders and the same status timeline, so end-to-end management is visible to both sides.
4. **Design**: strictly follow `design_guidelines.json`. Admin shell = **Option A**: dark navy sidebar (`#090D16`) with red accent marking the active section; content area uses the storefront's light premium language — white/surface cards, Outfit for headings, Manrope for body, `rounded-2xl/3xl`, the same spacing scale, framer-motion transitions, WCAG AA contrast. Every interactive element gets a `data-testid`.
5. **Email notifications** (owner requirement): transactional email over SMTP straight from the Worker (TCP sockets via `cloudflare:sockets` — no vendor SDK, free-tier friendly). Emails: order confirmation on placement; status-update emails on confirmed/shipped/delivered/cancelled (shipped email includes the estimated delivery date). The recipient is the email given at checkout, so guests are covered. SMTP credentials (host/port/user/pass — e.g. Brevo's free 300/day or a Gmail app password) are owner-provided config, like the Google OAuth creds; while unconfigured, emails are skipped and logged without breaking any flow.

## Non-goals

- Real payment gateway (Razorpay/Stripe): checkout stays the existing mock flow (COD / UPI / Card, no money moves). The payments section reports mock records. A gateway is a future request.
- Migrating existing MongoDB rows (dev/test data only — catalog is re-seeded, users re-seeded).
- Multi-role staff accounts, PDF invoices, warehouse/shipment-provider integrations, SEO tooling. (Transactional order-update email **is** in scope; marketing email is not.)

## Anti-goals (would make this a failure even if it "works")

- Storefront behavior regressions: hero, categories, new arrivals, shop sorting, cart, coupons, checkout must behave as today.
- Discount % typed by hand or inconsistent between admin and storefront — it must be derived from the two prices everywhere.
- An admin dashboard that requires a second login system instead of reusing the store's auth.
- Breaking free-tier economics: no design that requires a paid plan (no Durable Objects, no paid R2 features).

## Constraints

- Cloudflare free tier: Workers 100k req/day & 10ms CPU/req; D1 5M row reads / 100k writes/day, 5GB; R2 10GB storage; Pages 500 builds/month. The app is low-traffic; keep queries bounded (no N+1 loops over rows).
- Workers runtime: no Node APIs, no Python — hence the Hono/TS rewrite; password hashing via WebCrypto-compatible primitives.
- **Same-origin auth**: the Pages project proxies `/api/*` to the Worker through a service binding (Pages Functions), so frontend and API share one origin on `*.pages.dev` and httpOnly cookies stay first-party — no custom domain needed. The raw workers.dev URL is used only for local dev.
- Google OAuth client credentials come later from the owner; config via wrangler vars/secrets, graceful fallback when absent (Google button hidden or error-toast).
- SMTP credentials come later from the owner (any free-tier provider works, e.g. Brevo 300/day or a Gmail app password); until set, emails are skipped and logged without breaking flows. Workers TCP-socket SMTP requires the `nodejs_compat` flag — a known, documented pattern.
- Existing repo: `backend/` (FastAPI) stays in place untouched as reference until the Worker reaches parity, then is removed in the cutover commit. `docker-compose.yml` (Mongo) is removed at cutover.

## Decisions made (by the owner)

| Decision | Choice |
|---|---|
| Platform | Full Cloudflare migration first (Workers + D1 + R2 + Pages), admin dashboard on top |
| Payments | Keep mock payment flow; admin Payments section reports mock records |
| Google sign-in | Direct Google OAuth; owner provides client ID/secret later |
| Admin credentials | Reuse seeded admin: `admin@kineticnutrition.com` / `KineticAdmin@2026` |
| Dashboard layout | Option A — dark sidebar + storefront-styled light content |
| Product pricing | Two inputs (MRP, sale price); discount % auto-calculated everywhere |
| New arrivals | Per-product toggle; home section = toggled products, newest first |
| Orders | Admin controls status pipeline incl. cancel; address/contact editable while placed |
| Demo dashboard data | Seed ~3 weeks of demo orders/payments, clearly labeled, with a reset action |
| Guest checkout | Stays; order updates go to the checkout email via SMTP |
| Email updates | SMTP sent from the Worker; credentials provided later, graceful skip until configured |

## Data model (D1, SQL)

- `users`: id (uuid), email UNIQUE, name, picture, password_hash NULL for google-only, role ('admin'|'customer'), auth_provider, created_at
- `categories`: id, slug UNIQUE, name, icon, image_url, tagline, sort_order
- `products`: id, name, slug UNIQUE, description, brand, category_id FK, mrp (paise integer), sale_price (paise integer), discount_percent (computed on write + read, stored for sort), stock, images (JSON array of R2 URLs), flavors (JSON array), weight_options (JSON array), badge ('none'|'new'|'hot'), is_new_arrival (0/1), is_active (0/1), rating, orders_count, created_at
- `coupons`: id, code UNIQUE, discount_type ('percent'|'flat'), discount_value, min_order, active
- `orders`: id, order_number UNIQUE, user_id NULLable (guest checkout keeps working), name, email, phone, address JSON, subtotal, discount, coupon_code, gst, shipping, total, status ('placed'|'confirmed'|'shipped'|'delivered'|'cancelled'), estimated_delivery_date (set on ship), created_at, updated_at
- `order_items`: id, order_id FK, product_id, name, unit_price, qty
- `payments`: id, order_id FK, method ('cod'|'upi'|'card'), amount, status ('paid'|'on_delivery'|'refunded'|'cancelled'), created_at — cancelling an order restores product stock, and any not-yet-paid payment moves to 'cancelled'
- `order_status_history`: id, order_id FK, status, note, created_at
- `email_log`: id, order_id FK, to_email, template, status ('sent'|'skipped'|'failed'), error, created_at (observability for SMTP delivery)
- `sessions`: token, user_id, expires_at (Google session + refresh parity)
- `login_attempts`: email, count, locked_until

Money is stored in paise (integers) to avoid float math; INR formatting stays frontend-side.

## API surface (Hono Worker, `/api` prefix)

Public/customer: as today (`auth/*`, `categories`, `products` with category filter, **search over name + brand**, and sort, `products/:id`, `coupons/validate`, `orders` create + own list), plus `orders/:id/status-history` for the buyer timeline.
Admin (middleware checks JWT role claim): `admin/overview` (stat + graph aggregates), `admin/products` CRUD, `admin/uploads` (multipart → R2, returns URL), `admin/categories` CRUD, `admin/orders` list/detail/`PATCH` status + address (status changes fire the buyer email via SMTP), `admin/payments` list, `admin/coupons` CRUD, `admin/demo-data/reset`.
Order create (mock payment): persist order, items, payment record (method from checkout, status paid/upi&card — on_delivery/cod), increment `orders_count`, decrement stock.

## What's left to the builder

- Exact worker repo layout (e.g. `worker/` with `src/routes/*`), D1 migration files, seed script mechanics, presigned-upload vs worker-streamed upload, chart component choices within recharts, admin table/drawer component composition, caching headers, E2E ordering of migration steps vs dashboard build (dashboard endpoints may be built alongside parity to avoid double work).
- Any parity detail not visible in the old `backend/server.py` gets decided to match observed behavior.

## Deployment notes (post-build, owner-run)

- `wrangler login` under the owner's Cloudflare account; create D1 + R2 resources; `wrangler d1 execute` for schema + seed; set JWT_SECRET, ADMIN_EMAIL/PASSWORD, Google OAuth creds, and SMTP host/port/user/pass as secrets; Pages build via `wrangler pages` or Git integration; R2 public access (r2.dev) enabled for image serving until a custom domain is attached.
